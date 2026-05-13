import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import BottomModal from "./BottomModal";
import CachedImage from "./CachedImage";
import CustomAlert, { AlertType } from "./CustomAlert";

const KNOWN_FEED_MEDIA_BUCKETS = [
  "post-media",
  "posts",
  "images",
  "listings",
  "documents",
  "avatars",
];

const resolvePostMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (candidate.startsWith("/storage/v1/") || candidate.startsWith("storage/v1/")) {
    const normalizedPath = candidate.startsWith("/") ? candidate : `/${candidate}`;
    const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    return envBase ? `${envBase.replace(/\/$/, "")}${normalizedPath}` : normalizedPath;
  }

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
  }

  if (candidate.includes("/storage/v1/object/public/")) {
    return candidate;
  }

  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) return candidate;

  const normalized = candidate.replace(/^\/+/, "");
  const directParts = normalized.split("/");

  if (directParts.length > 1) {
    const directBucket = directParts[0];
    const directPath = directParts.slice(1).join("/");
    const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
    if (data?.publicUrl) return data.publicUrl;
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
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
};

const initialsOf = (name: string) =>
  (name || "")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

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

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const borderCol = isDark ? "#334155" : "#E2E8F0";
  const subtleBg = isDark ? "#0F172A" : "#F1F5F9";
  const bubbleBg = isDark ? "#334155" : "#F1F5F9";
  const mediaWidth = Math.min(Math.max(width - 56, 240), 360);

  const fetchPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "get_post_details", post_id: postId },
      });

      if (error) throw error;

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

        setPost({
          ...rawPost,
          body: rawPost?.body ?? rawPost?.content ?? "",
          author_name: rawPost?.author_name ?? rawPost?.author?.full_name ?? "User",
          author_avatar: rawPost?.author_avatar ?? rawPost?.author?.avatar_url ?? "",
          my_reaction: rawPost?.my_reaction ?? rawPost?.user_reaction ?? null,
          visibility:
            rawPost?.visibility === "followers_only"
              ? "followers"
              : rawPost?.visibility || "public",
          media: Array.isArray(rawPost?.media)
            ? rawPost.media.map((item: any) => ({
                ...item,
                url: resolvePostMediaUrl(item?.url || item?.storage_path || item?.public_url),
              }))
            : [],
          comments: normalizedComments,
        });
        setComments(normalizedComments);
      }
    } catch (e: any) {
      console.error("PostDetailsModal fetch error:", e);
      setAlert({
        type: "error",
        title: "Unable to Load Post",
        message: e?.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!visible || !postId) return;
    setPost(null);
    setComments([]);
    setCommentText("");
    setAlert(null);
    void fetchPost();
  }, [fetchPost, postId, visible]);

  const handleReaction = async () => {
    if (!post) return;
    const hadReaction = Boolean(post.my_reaction);
    const nextCount = hadReaction
      ? Math.max((post.reaction_count || 1) - 1, 0)
      : (post.reaction_count || 0) + 1;

    try {
      const { error } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: hadReaction ? "remove_reaction" : "react_to_post",
          post_id: post.id,
          reaction_type: hadReaction ? undefined : "like",
        },
      });

      if (error) throw error;

      setPost((current: any) => ({
        ...current,
        my_reaction: hadReaction ? null : "like",
        reaction_count: nextCount,
      }));
      onReactionChanged?.(post.id, !hadReaction, nextCount);
    } catch (e: any) {
      setAlert({ type: "error", title: "Reaction Failed", message: e?.message || "Please try again." });
    }
  };

  const handleAddComment = async () => {
    const content = commentText.trim();
    if (!content || !post) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "add_comment", post_id: post.id, content },
      });

      if (error) throw error;

      if (data?.success) {
        const nextCount = comments.length + 1;
        setCommentText("");
        await fetchPost();
        onCommentChanged?.(post.id, nextCount);
      } else {
        setAlert({ type: "error", title: "Comment Failed", message: data?.error || "Failed to add comment." });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Comment Failed", message: e?.message || "Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!post) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "delete_comment", comment_id: commentId },
      });

      if (error) throw error;

      if (data?.success) {
        const nextCount = Math.max(comments.length - 1, 0);
        emitToast({ type: "info", title: "Deleted", message: "Comment deleted." });
        await fetchPost();
        onCommentChanged?.(post.id, nextCount);
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Delete Failed", message: e?.message || "Please try again." });
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "delete_post", post_id: post.id },
      });

      if (error) throw error;

      if (data?.success) {
        emitToast({ type: "info", title: "Deleted", message: "Post deleted." });
        onPostDeleted?.(post.id);
        onClose();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Delete Failed", message: e?.message || "Please try again." });
    }
  };

  const modalMaxHeight = useMemo(() => Math.min(height - 72, 760), [height]);
  const isOwner = post?.author_id === userId;
  const canSubmitComment = commentText.trim().length > 0;

  return (
    <BottomModal
      visible={visible}
      onClose={onClose}
      closeOnBackdropPress
      keyboardAvoiding
      overlayLabel="FeedPostDetailsModal"
      contentContainerStyle={[styles.sheet, { backgroundColor: cardBg, maxHeight: modalMaxHeight }]}
    >
      <View style={[styles.handle, { backgroundColor: isDark ? "#475569" : "#CBD5E1" }]} />
      <View style={[styles.header, { borderBottomColor: borderCol }]}>
        <View style={{ width: 36 }} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {post ? `${post.author_name}'s Post` : "Post"}
        </Text>
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={onClose}
          style={[styles.iconCircle, { backgroundColor: subtleBg }]}
          accessibilityLabel="Close post details"
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading || !post ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              <View style={styles.authorText}>
                <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
                  {post.author_name}
                </Text>
                <View style={styles.authorMetaRow}>
                  <Text style={[styles.authorMetaText, { color: colors.textSecondary }]}>
                    {formatTimestamp(post.created_at)}
                  </Text>
                  <Text style={[styles.dot, { color: colors.textSecondary }]}>|</Text>
                  <Ionicons
                    name={post.visibility === "followers" ? "people" : "earth"}
                    size={12}
                    color={colors.textSecondary}
                  />
                </View>
              </View>
              {isOwner ? (
                <TouchableOpacity
                  activeOpacity={0.78}
                  onPress={handleDeletePost}
                  style={[styles.iconCircle, { backgroundColor: subtleBg }]}
                  accessibilityLabel="Delete post"
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              ) : null}
            </View>

            {post.body ? <Text style={[styles.postBody, { color: colors.text }]}>{post.body}</Text> : null}

            {post.media?.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaScroll}>
                {post.media.map((media: any, index: number) =>
                  media.url ? (
                    <CachedImage
                      key={`${media.id || index}`}
                      uri={media.url}
                      style={[styles.mediaImg, { width: mediaWidth }]}
                      width={mediaWidth}
                      height={220}
                    />
                  ) : null,
                )}
              </ScrollView>
            ) : null}

            <View style={styles.countsRow}>
              <View style={styles.countItem}>
                {(post.reaction_count || 0) > 0 ? (
                  <>
                    <View style={styles.likeBadge}>
                      <Ionicons name="heart" size={10} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.countText, { color: colors.textSecondary }]}>
                      {post.reaction_count}
                    </Text>
                  </>
                ) : null}
              </View>
              <Text style={[styles.countText, { color: colors.textSecondary }]}>
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </Text>
            </View>

            <View style={[styles.actionRow, { borderTopColor: borderCol, borderBottomColor: borderCol }]}>
              <TouchableOpacity activeOpacity={0.78} onPress={handleReaction} style={styles.actionBtn}>
                <Ionicons
                  name={post.my_reaction ? "heart" : "heart-outline"}
                  size={20}
                  color={post.my_reaction ? "#ef4444" : colors.textSecondary}
                />
                <Text style={[styles.actionText, { color: post.my_reaction ? "#ef4444" : colors.textSecondary }]}>
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
                comments.map((comment: any) => (
                  <View key={comment.id} style={styles.commentRow}>
                    {comment.author_avatar ? (
                      <CachedImage uri={comment.author_avatar} style={styles.commentAvatar} width={32} height={32} />
                    ) : (
                      <View style={[styles.commentAvatarFallback, { backgroundColor: colors.primary + "22" }]}>
                        <Text style={[styles.commentAvatarInitials, { color: colors.primary }]}>
                          {initialsOf(comment.author_name)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.commentBodyWrap}>
                      <View style={[styles.commentBubble, { backgroundColor: bubbleBg }]}>
                        <Text style={[styles.commentAuthor, { color: colors.text }]} numberOfLines={1}>
                          {comment.author_name}
                        </Text>
                        <Text style={[styles.commentBody, { color: colors.text }]}>{comment.body}</Text>
                      </View>
                      <View style={styles.commentMetaRow}>
                        <Text style={[styles.commentMeta, { color: colors.textSecondary }]}>
                          {formatTimestamp(comment.created_at)}
                        </Text>
                        {comment.author_id === userId ? (
                          <TouchableOpacity activeOpacity={0.78} onPress={() => handleDeleteComment(comment.id)}>
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

          <View style={[styles.footer, { borderTopColor: borderCol, backgroundColor: cardBg }]}>
            <View style={[styles.footerAvatarFallback, { backgroundColor: colors.primary + "22" }]}>
              <Ionicons name="person" size={16} color={colors.primary} />
            </View>
            <View style={[styles.footerInputWrap, { backgroundColor: bubbleBg }]}>
              <TextInput
                style={[styles.footerInput, { color: colors.text }]}
                placeholder="Write a comment..."
                placeholderTextColor={colors.textSecondary}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={1000}
                editable={Boolean(session && post)}
              />
              <TouchableOpacity
                activeOpacity={submitting || !canSubmitComment ? 1 : 0.78}
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
        </>
      )}

      {alert && (
        <CustomAlert
          visible
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
    </BottomModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: { paddingVertical: 72, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 16 },
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
  authorText: { flex: 1, marginLeft: 10 },
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
  mediaImg: { height: 220, borderRadius: 10, marginRight: 8 },
  countsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countItem: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: 6 },
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
  commentBodyWrap: { flex: 1, marginLeft: 8 },
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
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
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
  },
  footerSendBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
