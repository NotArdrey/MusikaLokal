import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { emitToast } from "../events/toastBus";
import CachedImage from "./CachedImage";
import CustomAlert, { AlertType } from "./CustomAlert";
import ProfileAvatar from "./ProfileAvatar";

const KNOWN_FEED_MEDIA_BUCKETS = [
  "post-media",
  "posts",
  "images",
  "listings",
  "documents",
  "avatars",
  "feed-media",
  "media",
  "public",
  "user-uploads",
];

const resolvePostMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";
  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) return candidate;

  const normalized = candidate.replace(/^\/+/, "");
  const directParts = normalized.split("/");

  if (directParts.length > 1) {
    const directBucket = directParts[0];
    const directPath = directParts.slice(1).join("/");
    if (KNOWN_FEED_MEDIA_BUCKETS.includes(directBucket)) {
      const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
      if (data?.publicUrl) return data.publicUrl;
    }
  }

  for (const bucket of KNOWN_FEED_MEDIA_BUCKETS) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }

  return normalized;
};

const normalizePostMediaItems = (rawPost: any) => {
  const sourceItems = Array.isArray(rawPost?.media)
    ? rawPost.media
    : Array.isArray(rawPost?.post_media)
      ? rawPost.post_media
      : [];
  const normalized = sourceItems
    .map((item: any) => {
      const url = resolvePostMediaUrl(
        item?.url ||
          item?.media_url ||
          item?.public_url ||
          item?.storage_path ||
          item?.thumbnail_url ||
          item?.thumbnail_path,
      );
      return url ? { ...item, url } : null;
    })
    .filter(Boolean);

  if (normalized.length > 0) return normalized;

  const fallbackUrls = [
    rawPost?.image,
    rawPost?.image_url,
    rawPost?.media_url,
    rawPost?.thumbnail_url,
    ...(Array.isArray(rawPost?.images) ? rawPost.images : []),
  ]
    .map(resolvePostMediaUrl)
    .filter(Boolean);

  return Array.from(new Set(fallbackUrls)).map((url, index) => ({ id: `fallback-${index}`, url }));
};

const formatTimestamp = (raw: string | null | undefined) => {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
};

type Props = {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onPostDeleted?: (postId: string) => void;
  onReactionChanged?: (postId: string, hasReaction: boolean, reactionCount: number) => void;
  onCommentChanged?: (postId: string, commentCount: number) => void;
};

export default function PostDetailsModal({
  postId,
  visible,
  onClose,
  onPostDeleted,
  onReactionChanged,
  onCommentChanged,
}: Props) {
  const { colors, isDark } = useTheme();
  const { session, userId } = useAuth();
  const { height, width } = useWindowDimensions();

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [currentProfileAvatar, setCurrentProfileAvatar] = useState("");

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const borderCol = isDark ? "#334155" : "#E2E8F0";
  const subtleBg = isDark ? "#0F172A" : "#F1F5F9";
  const bubbleBg = isDark ? "#334155" : "#F1F5F9";
  const sessionAvatar =
    ((session?.user?.user_metadata as any)?.avatar_url ||
      (session?.user?.user_metadata as any)?.picture ||
      "") as string;
  const currentUserAvatar = currentProfileAvatar || sessionAvatar;
  const modalMediaWidth = useMemo(
    () => Math.min(Math.max(width - 104, 280), 640),
    [width],
  );
  const modalMediaHeight = Math.round(modalMediaWidth * 0.68);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !userId) {
      setCurrentProfileAvatar("");
      return;
    }

    const loadCurrentProfileAvatar = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", userId)
          .maybeSingle();
        if (!cancelled) {
          setCurrentProfileAvatar(typeof data?.avatar_url === "string" ? data.avatar_url : "");
        }
      } catch {
        if (!cancelled) setCurrentProfileAvatar("");
      }
    };

    void loadCurrentProfileAvatar();

    return () => {
      cancelled = true;
    };
  }, [userId, visible]);

  const fetchPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "get_post_details", post_id: postId },
      });
      if (data?.data) {
        const rawPost = data.data;
        const normalizedComments = Array.isArray(rawPost?.comments)
          ? rawPost.comments.map((comment: any) => ({
              ...comment,
              body: comment?.body ?? comment?.content ?? "",
              author_name: comment?.author_name ?? comment?.author?.full_name ?? "User",
              author_avatar: comment?.author_avatar ?? comment?.author?.avatar_url ?? "",
            }))
          : [];

        const normalizedPost = {
          ...rawPost,
          body: rawPost?.body ?? rawPost?.content ?? "",
          author_name: rawPost?.author_name ?? rawPost?.author?.full_name ?? "User",
          author_avatar: rawPost?.author_avatar ?? rawPost?.author?.avatar_url ?? "",
          my_reaction: rawPost?.my_reaction ?? rawPost?.user_reaction ?? null,
          media: normalizePostMediaItems(rawPost),
        };

        setPost(normalizedPost);
        setComments(normalizedComments);
      }
    } catch (e: any) {
      console.error("PostDetailsModal fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (visible && postId) {
      setPost(null);
      setComments([]);
      setCommentText("");
      fetchPost();
    }
  }, [visible, postId, fetchPost]);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  const handleReaction = async () => {
    if (!post) return;
    const hadReaction = !!post.my_reaction;
    const nextCount = hadReaction
      ? Math.max((post.reaction_count || 1) - 1, 0)
      : (post.reaction_count || 0) + 1;

    try {
      if (hadReaction) {
        await supabase.functions.invoke("manage-social-feed", {
          body: { action: "remove_reaction", post_id: post.id },
        });
        setPost((p: any) => ({ ...p, my_reaction: null, reaction_count: nextCount }));
      } else {
        await supabase.functions.invoke("manage-social-feed", {
          body: { action: "react_to_post", post_id: post.id, reaction_type: "like" },
        });
        setPost((p: any) => ({ ...p, my_reaction: "like", reaction_count: nextCount }));
      }
      onReactionChanged?.(post.id, !hadReaction, nextCount);
    } catch (e: any) {
      console.error("Reaction error:", e);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !post) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "add_comment", post_id: post.id, content: commentText.trim() },
      });
      if (data?.blocked || data?.status === "blocked") {
        setAlert({
          type: "warning",
          title: "Comment blocked",
          message: data?.moderation?.reason || data?.error || "This comment did not pass AI moderation.",
        });
      } else if (data?.pending_review || data?.status === "pending_review") {
        setCommentText("");
        emitToast({ type: "info", title: "Comment sent for review", message: "It will appear if approved." });
        await fetchPost();
        onCommentChanged?.(post.id, comments.length);
      } else if (data?.success) {
        setCommentText("");
        await fetchPost();
        onCommentChanged?.(post.id, comments.length + 1);
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitComment = commentText.trim().length > 0;

  const handleDeleteComment = async (commentId: string) => {
    const { data } = await supabase.functions.invoke("manage-social-feed", {
      body: { action: "delete_comment", comment_id: commentId },
    });
    if (data?.success) {
      emitToast({ type: "info", title: "Deleted", message: "Comment deleted." });
      await fetchPost();
      if (post) onCommentChanged?.(post.id, Math.max(comments.length - 1, 0));
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    const { data } = await supabase.functions.invoke("manage-social-feed", {
      body: { action: "delete_post", post_id: post.id },
    });
    if (data?.success) {
      emitToast({ type: "info", title: "Deleted", message: "Post deleted." });
      onPostDeleted?.(post.id);
      onClose();
    }
  };

  const modalMaxHeight = useMemo(() => Math.min(height - 80, 760), [height]);
  const isOwner = post?.author_id === userId;

  if (!visible) return null;

  return (
    <View style={styles.overlayWrap} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.shell, { maxHeight: modalMaxHeight }]} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: borderCol,
              maxHeight: modalMaxHeight,
              shadowOpacity: isDark ? 0 : 0.18,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: borderCol }]}>
            <View style={{ width: 32 }} />
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {post ? `${post.author_name}'s Post` : "Post"}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={[styles.iconCircle, { backgroundColor: subtleBg }]}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loading || !post ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.authorRow}>
                <ProfileAvatar
                  uri={post.author_avatar}
                  style={styles.avatar}
                  backgroundColor={isDark ? "#374151" : "#E5E7EB"}
                  iconColor={colors.textSecondary}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
                    {post.author_name}
                  </Text>
                  <View style={styles.authorMetaRow}>
                    <Text style={[styles.authorMetaText, { color: colors.textSecondary }]}>
                      {formatTimestamp(post.created_at)}
                    </Text>
                    <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
                    <Ionicons
                      name={post.visibility === "followers" ? "people" : "earth"}
                      size={12}
                      color={colors.textSecondary}
                    />
                  </View>
                </View>
                {isOwner ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleDeletePost}
                    style={[styles.iconCircle, { backgroundColor: subtleBg }]}
                    accessibilityLabel="Delete post"
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {post.body ? (
                <Text style={[styles.postBody, { color: colors.text }]}>{post.body}</Text>
              ) : null}

              {post.media?.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mediaScroll}
                >
                  {post.media.map((m: any, i: number) =>
                    m.url ? (
                      <CachedImage
                        key={`${m.id || i}`}
                        uri={m.url}
                        style={[
                          styles.mediaImg,
                          {
                            width: modalMediaWidth,
                            height: modalMediaHeight,
                          },
                        ]}
                        width={Math.round(modalMediaWidth)}
                        height={modalMediaHeight}
                      />
                    ) : null,
                  )}
                </ScrollView>
              ) : null}

              {(post.reaction_count || 0) > 0 || comments.length > 0 ? (
                <View style={styles.countsRow}>
                  {(post.reaction_count || 0) > 0 ? (
                    <View style={styles.countItem}>
                      <View style={styles.likeBadge}>
                        <Ionicons name="heart" size={10} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.countText, { color: colors.textSecondary }]}>
                        {post.reaction_count}
                      </Text>
                    </View>
                  ) : (
                    <View />
                  )}
                  {comments.length > 0 ? (
                    <Text style={[styles.countText, { color: colors.textSecondary }]}>
                      {comments.length} {comments.length === 1 ? "comment" : "comments"}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.actionRow, { borderTopColor: borderCol, borderBottomColor: borderCol }]}>
                <TouchableOpacity activeOpacity={0.7} onPress={handleReaction} style={styles.actionBtn}>
                  <Ionicons
                    name={post.my_reaction ? "heart" : "heart-outline"}
                    size={20}
                    color={post.my_reaction ? "#ef4444" : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.actionText,
                      { color: post.my_reaction ? "#ef4444" : colors.textSecondary },
                    ]}
                  >
                    Like
                  </Text>
                </TouchableOpacity>
                <View style={styles.actionBtn}>
                  <Ionicons name="chatbubble-outline" size={19} color={colors.textSecondary} />
                  <Text style={[styles.actionText, { color: colors.textSecondary }]}>Comment</Text>
                </View>
              </View>

              <View style={styles.commentsSection}>
                {comments.length > 0 ? (
                  comments.map((c: any) => (
                    <View key={c.id} style={styles.commentRow}>
                      <ProfileAvatar
                        uri={c.author_avatar}
                        style={styles.commentAvatar}
                        backgroundColor={isDark ? "#374151" : "#E5E7EB"}
                        iconColor={colors.textSecondary}
                      />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <View style={[styles.commentBubble, { backgroundColor: bubbleBg }]}>
                          <Text style={[styles.commentAuthor, { color: colors.text }]} numberOfLines={1}>
                            {c.author_name}
                          </Text>
                          <Text style={[styles.commentBody, { color: colors.text }]}>{c.body}</Text>
                        </View>
                        <View style={styles.commentMetaRow}>
                          <Text style={[styles.commentMeta, { color: colors.textSecondary }]}>
                            {formatTimestamp(c.created_at)}
                          </Text>
                          {c.author_id === userId ? (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => handleDeleteComment(c.id)}
                            >
                              <Text style={[styles.commentMeta, { color: "#ef4444" }]}>Delete</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.noComments, { color: colors.textSecondary }]}>
                    No comments yet. Be the first to comment.
                  </Text>
                )}
              </View>
            </ScrollView>
          )}

          <View style={[styles.footer, { borderTopColor: borderCol, backgroundColor: cardBg }]}>
            <ProfileAvatar
              uri={currentUserAvatar}
              style={styles.footerAvatar}
              backgroundColor={isDark ? "#374151" : "#E5E7EB"}
              iconColor={colors.textSecondary}
            />
            <View style={[styles.footerInputWrap, { backgroundColor: bubbleBg }]}>
              <TextInput
                style={[styles.footerInput, { color: colors.text }]}
                placeholder="Write a comment..."
                placeholderTextColor={colors.textSecondary}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={1000}
                editable={!!session && !!post}
              />
              <TouchableOpacity
                activeOpacity={submitting || !canSubmitComment ? 1 : 0.7}
                onPress={handleAddComment}
                disabled={submitting || !canSubmitComment}
                style={styles.footerSendBtn}
                accessibilityLabel="Send comment"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name="send"
                    size={18}
                    color={canSubmitComment ? colors.primary : colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      {alert && (
        <CustomAlert
          visible
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    ...(Platform.OS === "web"
      ? ({ position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 } as any)
      : StyleSheet.absoluteFillObject),
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  shell: {
    width: "100%",
    maxWidth: 720,
    paddingHorizontal: 24,
    paddingVertical: 24,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
  },
  centered: { paddingVertical: 60, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 14, fontWeight: "700" },
  authorName: { fontSize: 14, fontWeight: "700" },
  authorMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 4 },
  authorMetaText: { fontSize: 12 },
  dot: { fontSize: 12 },
  postBody: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  mediaScroll: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  mediaImg: { borderRadius: 10, marginRight: 8, backgroundColor: "#0F172A" },
  countsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  likeBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  actionText: { fontSize: 14, fontWeight: "600" },
  commentsSection: { paddingHorizontal: 16, paddingTop: 8 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarInitials: { fontSize: 12, fontWeight: "700" },
  commentBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  commentAuthor: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  commentBody: { fontSize: 14, lineHeight: 19 },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  commentMeta: { fontSize: 12, fontWeight: "600" },
  noComments: { fontSize: 13, textAlign: "center", paddingVertical: 16 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  footerAvatar: { width: 32, height: 32, borderRadius: 16 },
  footerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  footerInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingLeft: 14,
    paddingRight: 4,
  },
  footerInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    maxHeight: 100,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  footerSendBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
