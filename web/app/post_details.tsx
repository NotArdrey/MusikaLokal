import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";

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

const initialsOf = (name: string) =>
  (name || "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function PostDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId } = useAuth();
  const { post_id } = useLocalSearchParams();
  const { width, height } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [deleteCommentTargetId, setDeleteCommentTargetId] = useState<string | null>(null);

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const borderCol = isDark ? "#334155" : "#E2E8F0";
  const subtleBg = isDark ? "#0F172A" : "#F1F5F9";
  const bubbleBg = isDark ? "#334155" : "#F1F5F9";

  const fetchPost = useCallback(async () => {
    if (!post_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "get_post_details", post_id },
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
          media: Array.isArray(rawPost?.media)
            ? rawPost.media.map((item: any) => ({
                ...item,
                url: resolvePostMediaUrl(
                  item?.url ||
                    item?.media_url ||
                    item?.public_url ||
                    item?.storage_path ||
                    item?.thumbnail_url ||
                    item?.thumbnail_path,
                ),
              }))
            : [],
        };

        setPost(normalizedPost);
        setComments(normalizedComments);
      }
    } catch (e: any) {
      console.error("PostDetails fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [post_id]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  const handleReaction = async () => {
    if (!post) return;
    try {
      if (post.my_reaction) {
        await supabase.functions.invoke("manage-social-feed", {
          body: { action: "remove_reaction", post_id: post.id },
        });
        setPost((p: any) => ({
          ...p,
          my_reaction: null,
          reaction_count: Math.max((p.reaction_count || 1) - 1, 0),
        }));
      } else {
        await supabase.functions.invoke("manage-social-feed", {
          body: { action: "react_to_post", post_id: post.id, reaction_type: "like" },
        });
        setPost((p: any) => ({
          ...p,
          my_reaction: "like",
          reaction_count: (p.reaction_count || 0) + 1,
        }));
      }
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
        fetchPost();
      } else if (data?.success) {
        setCommentText("");
        fetchPost();
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
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "delete_comment", comment_id: commentId },
      });
      if (error) throw error;
      if (data?.success) {
        emitToast({ type: "info", title: "Deleted", message: "Comment deleted." });
        fetchPost();
      } else {
        setAlert({ type: "error", title: "Delete Failed", message: data?.error || "Failed to delete comment." });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Delete Failed", message: e?.message || "Please try again." });
    }
  };

  const promptDeleteComment = (commentId: string) => {
    setDeleteCommentTargetId(commentId);
  };

  const handleDeletePost = async () => {
    if (!post) return;
    const { data } = await supabase.functions.invoke("manage-social-feed", {
      body: { action: "delete_post", post_id: post.id },
    });
    if (data?.success) {
      emitToast({ type: "info", title: "Deleted", message: "Post deleted." });
      router.back();
    }
  };

  const handleReport = async () => {
    if (!post) return;
    if (!userId) {
      setAlert({ type: "warning", title: "Sign In Required", message: "Sign in to report this post." });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("manage-details", {
        body: {
          action: "report",
          type: "feed_post",
          id: post.id,
          userId,
          reason: "Spam or scam",
          details: null,
        },
      });

      if (error) throw error;

      if (data && !Array.isArray(data) && data.already_reported) {
        setAlert({ type: "info", title: "Already Reported", message: "You already have a pending report for this post." });
      } else {
        emitToast({ type: "info", title: "Reported", message: "Post has been reported for review." });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleClose = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/feed");
  }, []);

  const modalMaxHeight = useMemo(() => Math.min(height - 80, 760), [height]);
  const isOwner = post?.author_id === userId;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: subtleBg }]}>
        {!isWebDesktop && <Header title="Post" onBackPress={handleClose} />}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        {!isWebDesktop && <Navbar />}
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.container, { backgroundColor: subtleBg }]}>
        {!isWebDesktop && <Header title="Post" onBackPress={handleClose} />}
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary }}>Post not found</Text>
        </View>
        {!isWebDesktop && <Navbar />}
      </View>
    );
  }

  const cardContent = (
    <View
      style={[
        styles.modalCard,
        {
          backgroundColor: cardBg,
          borderColor: borderCol,
          maxHeight: isWebDesktop ? modalMaxHeight : undefined,
          flex: isWebDesktop ? undefined : 1,
          width: "100%",
          borderWidth: isWebDesktop ? 1 : 0,
          borderRadius: isWebDesktop ? 12 : 0,
          shadowOpacity: isWebDesktop && !isDark ? 0.18 : 0,
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.modalHeader, { borderBottomColor: borderCol }]}>
        <View style={{ width: 32 }} />
        <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
          {post.author_name}
          {"'s Post"}
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleClose}
          style={[styles.iconCircle, { backgroundColor: subtleBg }]}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Scrollable body */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Author */}
        <View style={styles.authorRow}>
          {post.author_avatar ? (
            <CachedImage uri={post.author_avatar} style={styles.avatar} width={40} height={40} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.avatarInitials, { color: colors.primary }]}>
                {initialsOf(post.author_name)}
              </Text>
            </View>
          )}
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
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleReport}
              style={[styles.iconCircle, { backgroundColor: subtleBg }]}
              testID="post-report-button"
              accessibilityLabel="post-report-button"
            >
              <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Body */}
        {post.body ? (
          <Text style={[styles.postBody, { color: colors.text }]}>{post.body}</Text>
        ) : null}

        {/* Media */}
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
                  style={styles.mediaImg}
                  width={320}
                  height={240}
                />
              ) : null,
            )}
          </ScrollView>
        ) : null}

        {/* Counts */}
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

        {/* Action row */}
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

        {/* Comments */}
        <View style={styles.commentsSection}>
          {comments.length > 0 ? (
            comments.map((c: any) => (
              <View key={c.id} style={styles.commentRow}>
                {c.author_avatar ? (
                  <CachedImage uri={c.author_avatar} style={styles.commentAvatar} width={32} height={32} />
                ) : (
                  <View
                    style={[
                      styles.commentAvatarFallback,
                      { backgroundColor: colors.primary + "22" },
                    ]}
                  >
                    <Text style={[styles.commentAvatarInitials, { color: colors.primary }]}>
                      {initialsOf(c.author_name)}
                    </Text>
                  </View>
                )}
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
                      <TouchableOpacity activeOpacity={0.7} onPress={() => promptDeleteComment(c.id)}>
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

      {/* Footer composer */}
      <View style={[styles.footer, { borderTopColor: borderCol, backgroundColor: cardBg }]}>
        {session?.user?.user_metadata?.avatar_url ? (
          <CachedImage
            uri={session.user.user_metadata.avatar_url}
            style={styles.footerAvatar}
            width={32}
            height={32}
          />
        ) : (
          <View style={[styles.footerAvatarFallback, { backgroundColor: colors.primary + "22" }]}>
            <Ionicons name="person" size={16} color={colors.primary} />
          </View>
        )}
        <View style={[styles.footerInputWrap, { backgroundColor: bubbleBg }]}>
          <TextInput
            style={[styles.footerInput, { color: colors.text }]}
            placeholder="Write a comment..."
            placeholderTextColor={colors.textSecondary}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={1000}
            editable={!!session}
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
  );

  if (isWebDesktop) {
    return (
      <View style={[styles.container, { backgroundColor: subtleBg }]}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          <View style={[styles.modalShell, { maxHeight: modalMaxHeight }]}>{cardContent}</View>
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
        {deleteCommentTargetId && (
          <CustomAlert
            visible
            forceModal
            type="warning"
            title="Delete comment"
            message="This comment will be removed from the post."
            buttons={[
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  void handleDeleteComment(deleteCommentTargetId);
                },
              },
            ]}
            onClose={() => setDeleteCommentTargetId(null)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: subtleBg }]}>
      <Header title="Post" onBackPress={handleClose} />
      {cardContent}
      {alert && (
        <CustomAlert
          visible
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
      {deleteCommentTargetId && (
        <CustomAlert
          visible
          forceModal
          type="warning"
          title="Delete comment"
          message="This comment will be removed from the post."
          buttons={[
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                void handleDeleteComment(deleteCommentTargetId);
              },
            },
          ]}
          onClose={() => setDeleteCommentTargetId(null)}
        />
      )}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  modalShell: {
    width: "100%",
    maxWidth: 720,
    flex: 1,
    justifyContent: "center",
  },
  modalCard: {
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
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
  mediaScroll: { paddingHorizontal: 16, gap: 8 },
  mediaImg: { width: 320, height: 240, borderRadius: 10, marginRight: 8 },
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
  commentMetaRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, paddingHorizontal: 12 },
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
