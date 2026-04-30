// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractAccessToken(authHeader: string): string | null {
  const trimmed = (authHeader || "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    return token || null;
  }
  return trimmed;
}

type FollowTargetType = "profile" | "group";

function normalizeFollowTargetType(value: unknown): FollowTargetType {
  return value === "group" ? "group" : "profile";
}

async function insertNotification(
  supabaseAdmin: any,
  payload: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    image?: string | null;
    meta?: Record<string, any>;
  },
) {
  await supabaseAdmin.from("notifications").insert({ ...payload, read: false });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = extractAccessToken(authHeader);

    if (!accessToken) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: authUser },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (authErr || !authUser) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const uid = authUser.id;
    const { action, ...params } = await req.json();

    // ── follow ──────────────────────────────────────────────────────
    if (action === "follow") {
      const { target_id } = params;
      const targetType = normalizeFollowTargetType(params?.target_type);
      if (!target_id) return jsonResponse({ error: "target_id is required" }, 400);

      let notificationUserId: string | null = null;
      let notificationTitle = "New Follower";
      let notificationMessage = "";
      let activityTargetUserId: string | null = null;
      let activityMetadata: Record<string, any> = { followed_type: targetType };

      if (targetType === "profile") {
        if (target_id === uid) return jsonResponse({ error: "Cannot follow yourself" }, 400);

        const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", target_id)
          .single();

        if (targetProfileError || !targetProfile) {
          return jsonResponse({ error: "Profile not found" }, 404);
        }

        notificationUserId = target_id;
        activityTargetUserId = target_id;
      } else {
        const { data: targetGroup, error: targetGroupError } = await supabaseAdmin
          .from("groups")
          .select("id, name, owner_id, group_type")
          .eq("id", target_id)
          .single();

        if (targetGroupError || !targetGroup) {
          return jsonResponse({ error: "Group not found" }, 404);
        }

        if (targetGroup.owner_id === uid) {
          return jsonResponse({ error: "Cannot follow your own group" }, 400);
        }

        notificationUserId = targetGroup.owner_id || null;
        notificationTitle = "New Group Follower";
        notificationMessage = `started following ${targetGroup.name || "your group"}`;
        activityTargetUserId = targetGroup.owner_id || null;
        activityMetadata = {
          ...activityMetadata,
          group_id: targetGroup.id,
          group_type: targetGroup.group_type || null,
        };
      }

      const { data, error } = await supabaseAdmin
        .from("follows")
        .insert({ follower_id: uid, followed_id: target_id, followed_type: targetType })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") return jsonResponse({ error: "Already following" }, 409);
        return jsonResponse({ error: error.message }, 500);
      }

      const { data: follower } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();

      if (notificationUserId) {
        await insertNotification(supabaseAdmin, {
          user_id: notificationUserId,
          type: "follow",
          title: notificationTitle,
          message:
            targetType === "profile"
              ? `${follower?.full_name || "Someone"} started following you`
              : `${follower?.full_name || "Someone"} ${notificationMessage}`,
          image: follower?.avatar_url || null,
          meta: { event_type: "follow", follower_id: uid, ...activityMetadata },
        });
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "follow",
        actor_id: uid,
        target_user_id: activityTargetUserId,
        metadata: activityMetadata,
      });

      return jsonResponse({ success: true, data });
    }

    // ── unfollow ────────────────────────────────────────────────────
    if (action === "unfollow") {
      const { target_id } = params;
      const targetType = normalizeFollowTargetType(params?.target_type);
      if (!target_id) return jsonResponse({ error: "target_id is required" }, 400);

      let activityTargetUserId: string | null = null;
      const activityMetadata: Record<string, any> = { followed_type: targetType };

      if (targetType === "group") {
        const { data: targetGroup } = await supabaseAdmin
          .from("groups")
          .select("id, owner_id, group_type")
          .eq("id", target_id)
          .maybeSingle();

        activityTargetUserId = targetGroup?.owner_id || null;
        if (targetGroup?.id) {
          activityMetadata.group_id = targetGroup.id;
          activityMetadata.group_type = targetGroup.group_type || null;
        }
      } else {
        activityTargetUserId = target_id;
      }

      const { error } = await supabaseAdmin
        .from("follows")
        .delete()
        .eq("follower_id", uid)
        .eq("followed_id", target_id)
        .eq("followed_type", targetType);

      if (error) return jsonResponse({ error: error.message }, 500);

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "unfollow",
        actor_id: uid,
        target_user_id: activityTargetUserId,
        metadata: activityMetadata,
      });

      return jsonResponse({ success: true });
    }

    // ── get_follow_status ───────────────────────────────────────────
    if (action === "get_follow_status") {
      const { target_id } = params;
      const targetType = normalizeFollowTargetType(params?.target_type);
      if (!target_id) return jsonResponse({ error: "target_id is required" }, 400);

      const { data: followRow } = await supabaseAdmin
        .from("follows")
        .select("id")
        .eq("follower_id", uid)
        .eq("followed_id", target_id)
        .eq("followed_type", targetType)
        .maybeSingle();

      const { count: followerCount } = await supabaseAdmin
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("followed_id", target_id)
        .eq("followed_type", targetType);

      const { count: followingCount } = targetType === "profile"
        ? await supabaseAdmin
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("follower_id", target_id)
        : { count: 0 };

      return jsonResponse({
        success: true,
        data: {
          is_following: !!followRow,
          follower_count: followerCount || 0,
          following_count: followingCount || 0,
        },
      });
    }

    // ── create_post ─────────────────────────────────────────────────
    if (action === "create_post") {
      const { content, post_type, visibility, linked_playlist_id, linked_product_id, media } = params;
      if (!content && (!media || media.length === 0)) {
        return jsonResponse({ error: "content or media is required" }, 400);
      }

      const { data: post, error: postErr } = await supabaseAdmin
        .from("feed_posts")
        .insert({
          author_id: uid,
          content: content || null,
          post_type: post_type || "text",
          visibility: visibility || "public",
          linked_playlist_id: linked_playlist_id || null,
          linked_product_id: linked_product_id || null,
        })
        .select()
        .single();

      if (postErr) return jsonResponse({ error: postErr.message }, 500);

      // Insert media if provided
      if (media && Array.isArray(media) && media.length > 0) {
        const mediaRows = media.map((m: any, i: number) => ({
          post_id: post.id,
          media_type: m.media_type || "image",
          storage_path: m.storage_path,
          mime_type: m.mime_type || null,
          width: m.width || null,
          height: m.height || null,
          duration_seconds: m.duration_seconds || null,
          display_order: i,
        }));
        await supabaseAdmin.from("post_media").insert(mediaRows);
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "post_created",
        actor_id: uid,
        post_id: post.id,
      });

      return jsonResponse({ success: true, data: post });
    }

    // ── update_post ─────────────────────────────────────────────────
    if (action === "update_post") {
      const { post_id, content, visibility, is_pinned } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("feed_posts")
        .select("author_id")
        .eq("id", post_id)
        .single();

      if (!existing) return jsonResponse({ error: "Post not found" }, 404);
      if (existing.author_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const patch: Record<string, any> = {};
      if (content !== undefined) patch.content = content;
      if (visibility !== undefined) patch.visibility = visibility;
      if (is_pinned !== undefined) patch.is_pinned = is_pinned;

      const { data, error } = await supabaseAdmin
        .from("feed_posts")
        .update(patch)
        .eq("id", post_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── delete_post ─────────────────────────────────────────────────
    if (action === "delete_post") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("feed_posts")
        .select("author_id")
        .eq("id", post_id)
        .single();

      if (!existing) return jsonResponse({ error: "Post not found" }, 404);
      if (existing.author_id !== uid) {
        // Check admin
        const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", uid).single();
        if (profile?.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);
      }

      const { error } = await supabaseAdmin.from("feed_posts").delete().eq("id", post_id);
      if (error) return jsonResponse({ error: error.message }, 500);

      return jsonResponse({ success: true });
    }

    // ── get_feed ────────────────────────────────────────────────────
    if (action === "get_feed") {
      const { limit: lim, offset, feed_type } = params;
      const pageSize = Math.min(Number(lim) || 20, 50);
      const pageOffset = Number(offset) || 0;

      let query;
      if (feed_type === "following") {
        // Get posts from followed users
        const { data: following } = await supabaseAdmin
          .from("follows")
          .select("followed_id")
          .eq("follower_id", uid)
          .eq("followed_type", "profile");

        const followedIds = (following || []).map((f: any) => f.followed_id);
        followedIds.push(uid); // Include own posts

        query = supabaseAdmin
          .from("feed_posts")
          .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
          .in("author_id", followedIds)
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .range(pageOffset, pageOffset + pageSize - 1);
      } else {
        // Public feed
        query = supabaseAdmin
          .from("feed_posts")
          .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
          .eq("visibility", "public")
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .range(pageOffset, pageOffset + pageSize - 1);
      }

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch user's reactions for these posts
      const postIds = (data || []).map((p: any) => p.id);
      const { data: userReactions } = postIds.length > 0
        ? await supabaseAdmin
            .from("post_reactions")
            .select("post_id, reaction_type")
            .eq("user_id", uid)
            .in("post_id", postIds)
        : { data: [] };

      const reactionMap = new Map();
      for (const r of userReactions || []) {
        reactionMap.set(r.post_id, r.reaction_type);
      }

      const enriched = (data || []).map((p: any) => ({
        ...p,
        user_reaction: reactionMap.get(p.id) || null,
      }));

      return jsonResponse({ success: true, data: enriched });
    }

    // ── get_post_details ────────────────────────────────────────────
    if (action === "get_post_details") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { data: post, error: postErr } = await supabaseAdmin
        .from("feed_posts")
        .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
        .eq("id", post_id)
        .single();

      if (postErr || !post) return jsonResponse({ error: "Post not found" }, 404);

      const { data: comments } = await supabaseAdmin
        .from("post_comments")
        .select("*, author:profiles!author_id(id, full_name, avatar_url)")
        .eq("post_id", post_id)
        .eq("is_hidden", false)
        .order("created_at", { ascending: true });

      // User's reaction
      const { data: userReaction } = await supabaseAdmin
        .from("post_reactions")
        .select("reaction_type")
        .eq("post_id", post_id)
        .eq("user_id", uid)
        .maybeSingle();

      return jsonResponse({
        success: true,
        data: {
          ...post,
          comments: comments || [],
          user_reaction: userReaction?.reaction_type || null,
        },
      });
    }

    // ── react_to_post ───────────────────────────────────────────────
    if (action === "react_to_post") {
      const { post_id, reaction_type } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const rType = reaction_type || "like";

      // Upsert: remove existing then insert
      await supabaseAdmin
        .from("post_reactions")
        .delete()
        .eq("post_id", post_id)
        .eq("user_id", uid);

      const { data, error } = await supabaseAdmin
        .from("post_reactions")
        .insert({ post_id, user_id: uid, reaction_type: rType })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Notify post author
      const { data: post } = await supabaseAdmin.from("feed_posts").select("author_id").eq("id", post_id).single();
      if (post && post.author_id !== uid) {
        const { data: reactor } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();
        await insertNotification(supabaseAdmin, {
          user_id: post.author_id,
          type: "reaction",
          title: "New Reaction",
          message: `${reactor?.full_name || "Someone"} reacted to your post`,
          image: reactor?.avatar_url || null,
          meta: { event_type: "reaction_added", post_id },
        });
      }

      return jsonResponse({ success: true, data });
    }

    // ── remove_reaction ─────────────────────────────────────────────
    if (action === "remove_reaction") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { error } = await supabaseAdmin
        .from("post_reactions")
        .delete()
        .eq("post_id", post_id)
        .eq("user_id", uid);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── add_comment ─────────────────────────────────────────────────
    if (action === "add_comment") {
      const { post_id, content, parent_comment_id } = params;
      if (!post_id || !content) return jsonResponse({ error: "post_id and content are required" }, 400);

      const { data: comment, error } = await supabaseAdmin
        .from("post_comments")
        .insert({
          post_id,
          author_id: uid,
          content,
          parent_comment_id: parent_comment_id || null,
        })
        .select("*, author:profiles!author_id(id, full_name, avatar_url)")
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Notify post author
      const { data: post } = await supabaseAdmin.from("feed_posts").select("author_id").eq("id", post_id).single();
      if (post && post.author_id !== uid) {
        const { data: commenter } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();
        await insertNotification(supabaseAdmin, {
          user_id: post.author_id,
          type: "comment",
          title: "New Comment",
          message: `${commenter?.full_name || "Someone"} commented on your post`,
          image: commenter?.avatar_url || null,
          meta: { event_type: "comment_added", post_id, comment_id: comment.id },
        });
      }

      return jsonResponse({ success: true, data: comment });
    }

    // ── delete_comment ──────────────────────────────────────────────
    if (action === "delete_comment") {
      const { comment_id } = params;
      if (!comment_id) return jsonResponse({ error: "comment_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("post_comments")
        .select("author_id")
        .eq("id", comment_id)
        .single();

      if (!existing) return jsonResponse({ error: "Comment not found" }, 404);
      if (existing.author_id !== uid) {
        const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", uid).single();
        if (profile?.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);
      }

      const { error } = await supabaseAdmin.from("post_comments").delete().eq("id", comment_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── report_post ─────────────────────────────────────────────────
    if (action === "report_post") {
      const { post_id, reason } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      await supabaseAdmin
        .from("feed_posts")
        .update({ is_reported: true })
        .eq("id", post_id);

      // Insert into existing reports table
      await supabaseAdmin.from("reports").insert({
        reporter_id: uid,
        target_type: "feed_post",
        target_id: post_id,
        reason: reason || "Inappropriate content",
        status: "pending",
      });

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "post_reported",
        actor_id: uid,
        post_id,
        metadata: { reason: reason || null },
      });

      return jsonResponse({ success: true });
    }

    // ── get_user_posts ──────────────────────────────────────────────
    if (action === "get_user_posts") {
      const { target_user_id, limit: lim, offset } = params;
      if (!target_user_id) return jsonResponse({ error: "target_user_id is required" }, 400);

      const pageSize = Math.min(Number(lim) || 20, 50);
      const pageOffset = Number(offset) || 0;

      const { data, error } = await supabaseAdmin
        .from("feed_posts")
        .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
        .eq("author_id", target_user_id)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .range(pageOffset, pageOffset + pageSize - 1);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── get_followers / get_following ────────────────────────────────
    if (action === "get_followers") {
      const targetType = normalizeFollowTargetType(params?.target_type);
      const targetId = params?.target_user_id || params?.target_id || uid;

      const { data: rows, error } = await supabaseAdmin
        .from("follows")
        .select("*")
        .eq("followed_id", targetId)
        .eq("followed_type", targetType)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const followerIds = Array.from(
        new Set(
          (rows || [])
            .map((row: any) => row?.follower_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      const { data: followerProfiles } = followerIds.length > 0
        ? await supabaseAdmin
            .from("profiles")
            .select("id, full_name, avatar_url, role")
            .in("id", followerIds)
        : { data: [] };

      const followerById = new Map(
        (followerProfiles || []).map((profile: any) => [profile.id, profile]),
      );

      const enriched = (rows || []).map((row: any) => ({
        ...row,
        followed_type: normalizeFollowTargetType(row?.followed_type),
        follower: followerById.get(row?.follower_id) || null,
      }));

      return jsonResponse({ success: true, data: enriched });
    }

    if (action === "get_following") {
      const targetId = params?.target_user_id || params?.target_id || uid;

      const { data: rows, error } = await supabaseAdmin
        .from("follows")
        .select("*")
        .eq("follower_id", targetId)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const followedProfileIds = Array.from(
        new Set(
          (rows || [])
            .filter((row: any) => normalizeFollowTargetType(row?.followed_type) === "profile")
            .map((row: any) => row?.followed_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      const followedGroupIds = Array.from(
        new Set(
          (rows || [])
            .filter((row: any) => normalizeFollowTargetType(row?.followed_type) === "group")
            .map((row: any) => row?.followed_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      const [{ data: followedProfiles }, { data: followedGroups }] = await Promise.all([
        followedProfileIds.length > 0
          ? supabaseAdmin
              .from("profiles")
              .select("id, full_name, avatar_url, role")
              .in("id", followedProfileIds)
          : Promise.resolve({ data: [] }),
        followedGroupIds.length > 0
          ? supabaseAdmin
              .from("groups_with_stats")
              .select("id, name, images, group_type, genre, location, owner_id")
              .in("id", followedGroupIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileById = new Map(
        (followedProfiles || []).map((profile: any) => [profile.id, profile]),
      );
      const groupById = new Map(
        (followedGroups || []).map((group: any) => [group.id, group]),
      );

      const enriched = (rows || []).map((row: any) => {
        const followedType = normalizeFollowTargetType(row?.followed_type);

        return {
          ...row,
          followed_type: followedType,
          followed:
            followedType === "profile"
              ? profileById.get(row?.followed_id) || null
              : null,
          followed_group:
            followedType === "group"
              ? groupById.get(row?.followed_id) || null
              : null,
        };
      });

      return jsonResponse({ success: true, data: enriched });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("manage-social-feed error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
