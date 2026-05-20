import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  type KeyboardEvent,
  LayoutAnimation,
  Platform,
  Share,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { emitToast } from "../events/toastBus";
import BottomModal from "./BottomModal";
import CachedImage from "./CachedImage";
import CustomAlert, { AlertType } from "./CustomAlert";
import ReportModal from "./ReportModal";
import ProfileAvatar from "./ProfileAvatar";

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
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
};

const formatCountLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getCommentKey = (comment: any, index: number) => {
  const id = typeof comment?.id === "string" && comment.id.length > 0 ? comment.id : "";
  if (id) return `comment:${id}`;
  return `comment:${comment?.created_at || "unknown"}:${index}`;
};

const getMediaKey = (media: any, index: number) => {
  const id = typeof media?.id === "string" && media.id.length > 0 ? media.id : "";
  if (id) return `media:${id}`;
  return `media:${media?.url || media?.thumbnail_url || "unknown"}:${index}`;
};

type CachedPostDetails = {
  post: any;
  comments: any[];
  cachedAt: number;
  inFlight?: Promise<{ post: any; comments: any[] }>;
};

const POST_DETAILS_CACHE_TTL_MS = 60_000;
const postDetailsCache = new Map<string, CachedPostDetails>();
const ANDROID_KEYBOARD_ANIMATION_MS = 220;

const normalizePostDetailsPayload = (rawPost: any) => {
  const normalizedComments = Array.isArray(rawPost?.comments)
    ? rawPost.comments.map((comment: any) => ({
        ...comment,
        body: comment?.body ?? comment?.content ?? "",
        author_name: comment?.author_name ?? comment?.author?.full_name ?? "User",
        author_avatar: comment?.author_avatar ?? comment?.author?.avatar_url ?? "",
      }))
    : [];

  return {
    post: {
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
            thumbnail_url: resolvePostMediaUrl(item?.thumbnail_url || item?.thumbnail_path || item?.url || item?.storage_path || item?.public_url),
          }))
        : [],
      comments: normalizedComments,
    },
    comments: normalizedComments,
  };
};

const fetchPostDetailsPayload = async (targetPostId: string) => {
  const { data, error } = await supabase.functions.invoke("manage-social-feed", {
    body: { action: "get_post_details", post_id: targetPostId },
  });

  if (error) throw error;
  if (!data?.data) throw new Error("Post not found.");
  return normalizePostDetailsPayload(data?.data || null);
};

type Props = {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onEditPost?: (post: any) => void;
  onPostDeleted?: (postId: string) => void;
  onReactionChanged?: (postId: string, hasReaction: boolean, reactionCount: number) => void;
  onCommentChanged?: (postId: string, commentCount: number) => void;
  onShareChanged?: (postId: string, shareCount: number) => void;
};

export default function PostDetailsModal({
  postId,
  visible,
  onClose,
  onEditPost,
  onPostDeleted,
  onReactionChanged,
  onCommentChanged,
  onShareChanged,
}: Props) {
  const { colors, isDark } = useTheme();
  const { session, userId } = useAuth();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [postOptionsVisible, setPostOptionsVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardAvoidingResetKey, setKeyboardAvoidingResetKey] = useState(0);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const borderCol = isDark ? "#334155" : "#E2E8F0";
  const subtleBg = isDark ? "#0F172A" : "#F1F5F9";
  const bubbleBg = isDark ? "#334155" : "#F1F5F9";
  const mediaWidth = Math.min(Math.max(width - 32, 240), 420);

  const fetchPost = useCallback(async (forceRefresh = false) => {
    if (!postId) return;
    const cached = postDetailsCache.get(postId);
    const cacheIsFresh =
      cached?.post && Date.now() - cached.cachedAt < POST_DETAILS_CACHE_TTL_MS;

    if (cached?.post) {
      setPost(cached.post);
      setComments(cached.comments);
    }

    if (cacheIsFresh && !forceRefresh) {
      setLoading(false);
      return { post: cached.post, comments: cached.comments };
    }

    setLoading(!cached?.post);
    try {
      const inFlight =
        !forceRefresh && cached?.inFlight
          ? cached.inFlight
          : fetchPostDetailsPayload(postId);
      postDetailsCache.set(postId, {
        post: cached?.post,
        comments: cached?.comments || [],
        cachedAt: cached?.cachedAt || 0,
        inFlight,
      });

      const nextDetails = await inFlight;
      postDetailsCache.set(postId, {
        ...nextDetails,
        cachedAt: Date.now(),
      });
      setPost(nextDetails.post);
      setComments(nextDetails.comments);
      return nextDetails;
    } catch (e: any) {
      const currentCache = postDetailsCache.get(postId);
      if (currentCache?.inFlight) {
        if (currentCache.post) {
          postDetailsCache.set(postId, {
            post: currentCache.post,
            comments: currentCache.comments,
            cachedAt: currentCache.cachedAt,
          });
        } else {
          postDetailsCache.delete(postId);
        }
      }
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

  const animateKeyboardLayoutChange = useCallback((event: KeyboardEvent) => {
    if (Platform.OS === "android") {
      LayoutAnimation.configureNext({
        duration: ANDROID_KEYBOARD_ANIMATION_MS,
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        },
      });
      return;
    }

    try {
      Keyboard.scheduleLayoutAnimation(event);
    } catch {
      LayoutAnimation.configureNext({
        duration: event.duration || ANDROID_KEYBOARD_ANIMATION_MS,
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        },
      });
    }
  }, []);

  useEffect(() => {
    if (!visible || !postId) return;
    const cached = postDetailsCache.get(postId);
    setPost(cached?.post || null);
    setComments(cached?.comments || []);
    setCommentText("");
    setAlert(null);
    setPostOptionsVisible(false);
    setReportModalVisible(false);
    setDeleteConfirmVisible(false);
    void fetchPost(true);
  }, [fetchPost, postId, visible]);

  useEffect(() => {
    if (!visible) {
      setIsKeyboardVisible(false);
      return;
    }

    const keyboardShowEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const keyboardHideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(keyboardShowEvent, (event) => {
      animateKeyboardLayoutChange(event);
      setIsKeyboardVisible(true);
    });

    const hideSub = Keyboard.addListener(keyboardHideEvent, (event) => {
      animateKeyboardLayoutChange(event);
      setIsKeyboardVisible(false);
      if (Platform.OS === "android") {
        setKeyboardAvoidingResetKey((currentKey) => currentKey + 1);
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [animateKeyboardLayoutChange, visible]);

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

      const nextPost = {
        ...post,
        my_reaction: hadReaction ? null : "like",
        reaction_count: nextCount,
      };
      setPost((current: any) => ({
        ...current,
        my_reaction: nextPost.my_reaction,
        reaction_count: nextPost.reaction_count,
      }));
      postDetailsCache.set(post.id, {
        post: nextPost,
        comments,
        cachedAt: Date.now(),
      });
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

      if (data?.blocked || data?.status === "blocked") {
        setAlert({
          type: "warning",
          title: "Comment blocked",
          message: data?.moderation?.reason || data?.error || "This comment did not pass moderation.",
        });
        return;
      }

      if (data?.pending_review || data?.status === "pending_review") {
        setCommentText("");
        emitToast({ type: "info", title: "Comment sent for review", message: "It will appear if approved." });
        const nextDetails = await fetchPost(true);
        onCommentChanged?.(post.id, nextDetails?.comments.length ?? comments.length);
        return;
      }

      if (data?.success) {
        setCommentText("");
        const nextDetails = await fetchPost(true);
        const nextCount = nextDetails?.comments.length ?? comments.length + 1;
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
        emitToast({ type: "info", title: "Deleted", message: "Comment deleted." });
        const nextDetails = await fetchPost(true);
        const nextCount = nextDetails?.comments.length ?? Math.max(comments.length - 1, 0);
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
        setDeleteConfirmVisible(false);
        emitToast({ type: "info", title: "Deleted", message: "Post deleted." });
        postDetailsCache.delete(post.id);
        onPostDeleted?.(post.id);
        handleClose();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Delete Failed", message: e?.message || "Please try again." });
    }
  };

  const handleEditPost = () => {
    if (!post || !onEditPost) return;
    setPostOptionsVisible(false);
    handleClose();
    onEditPost(post);
  };

  const handleReportPost = () => {
    if (!post) return;
    setPostOptionsVisible(false);

    if (!session) {
      setAlert({ type: "warning", title: "Sign In Required", message: "Sign in to report this post." });
      return;
    }

    if (isOwner) {
      setAlert({ type: "info", title: "Owner Action", message: "You cannot report your own post." });
      return;
    }

    setReportModalVisible(true);
  };

  const submitPostReport = async (reason: string, details?: string) => {
    if (!post) throw new Error("Missing post details.");

    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: "report_post",
          post_id: post.id,
          reason,
          details: details || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
    } catch (e: any) {
      throw new Error(e?.message || "Please try again.");
    }
  };

  const handleMoreOptions = () => {
    if (!post) return;
    setPostOptionsVisible(true);
  };

  const handleSharePost = async () => {
    if (!post) return;
    try {
      const shareResult = await Share.share({
        message: `${post.body || "Check out this post on MusikaLokal."}\n\nMusikaLokal post: ${post.id}`,
      });
      if (shareResult.action === Share.dismissedAction) return;

      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "share_post", post_id: post.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      const nextCount = Number(data?.data?.share_count || 0) || Number(post.share_count || 0) + 1;
      const nextPost = { ...post, share_count: nextCount };
      setPost((current: any) => ({ ...current, share_count: nextCount }));
      postDetailsCache.set(post.id, {
        post: nextPost,
        comments,
        cachedAt: Date.now(),
      });
      onShareChanged?.(post.id, nextCount);
    } catch (e: any) {
      setAlert({ type: "error", title: "Share Failed", message: e?.message || "Please try again." });
    }
  };

  const modalMaxHeight = useMemo(() => Math.min(height - 72, 760), [height]);
  const isOwner = post?.author_id === userId;
  const canSubmitComment = commentText.trim().length > 0;
  const footerBottomPadding = (() => {
    if (Platform.OS === "ios") {
      return isKeyboardVisible ? 16 : Math.max(insets.bottom, 8) + 4;
    }

    return isKeyboardVisible ? 12 : 8;
  })();
  const footerSafeAreaEdges: Edge[] = Platform.OS === "android" && !isKeyboardVisible ? ["bottom"] : [];

  return (
    <BottomModal
      visible={visible}
      onClose={handleClose}
      closeOnBackdropPress
      keyboardAvoiding
      keyboardAvoidingResetKey={Platform.OS === "android" ? keyboardAvoidingResetKey : "ios"}
      keyboardVerticalOffset={0}
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
          onPress={handleClose}
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
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            <View style={styles.authorRow}>
              <ProfileAvatar
                uri={post.author_avatar}
                style={styles.avatar}
                backgroundColor={isDark ? "#374151" : "#E5E7EB"}
                iconColor={colors.textSecondary}
              />
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
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={handleMoreOptions}
                style={[styles.iconCircle, { backgroundColor: subtleBg }]}
                accessibilityLabel="Post actions"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {post.body ? <Text style={[styles.postBody, { color: colors.text }]}>{post.body}</Text> : null}

            {post.media?.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mediaScroll}
              >
                {post.media.map((media: any, index: number) => {
                  const previewUrl = media.thumbnail_url || media.url;
                  if (!previewUrl) return null;

                  return (
                    <View key={getMediaKey(media, index)} style={[styles.mediaFrame, { width: mediaWidth }]}>
                      <CachedImage
                        uri={previewUrl}
                        style={styles.mediaImg}
                        width={mediaWidth}
                        height={230}
                        contentFit="cover"
                      />
                      {media.media_type === "video" ? (
                        <View style={styles.videoPlayBadge}>
                          <Ionicons name="play" size={18} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
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
              <Text style={[styles.countText, { color: colors.textSecondary }]}>
                {formatCountLabel(Number(post.share_count || 0), "share")}
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
              <TouchableOpacity activeOpacity={0.78} onPress={handleSharePost} style={styles.actionBtn}>
                <Ionicons name="share-social-outline" size={19} color={colors.textSecondary} />
                <Text style={[styles.actionText, { color: colors.textSecondary }]}>Share</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.commentsSection}>
              <Text style={[styles.commentsTitle, { color: colors.text }]}>Comments</Text>
            </View>

            {comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <Text style={[styles.noComments, { color: colors.textSecondary }]}>
                  No comments yet. Be the first to comment.
                </Text>
              </View>
            ) : (
              comments.map((comment: any, index: number) => (
                <View key={getCommentKey(comment, index)} style={styles.commentRow}>
                  <ProfileAvatar
                    uri={comment.author_avatar}
                    style={styles.commentAvatar}
                    backgroundColor={isDark ? "#374151" : "#E5E7EB"}
                    iconColor={colors.textSecondary}
                  />
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
            )}
          </ScrollView>

          <SafeAreaView
            edges={footerSafeAreaEdges}
            style={{ backgroundColor: cardBg }}
          >
            <View
              style={[
                styles.footer,
                {
                  borderTopColor: borderCol,
                  backgroundColor: cardBg,
                  paddingBottom: footerBottomPadding,
                },
              ]}
            >
              <ProfileAvatar
                uri={(session?.user?.user_metadata as any)?.avatar_url}
                style={styles.footerAvatarFallback}
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
          </SafeAreaView>
        </>
      )}

      {postOptionsVisible && post && (
        <CustomAlert
          visible
          forceModal
          type="info"
          title="Post options"
          message={isOwner ? "Manage this post." : "Choose an action for this post."}
          buttons={
            isOwner
              ? [
                  ...(onEditPost ? [{ text: "Edit Post", onPress: handleEditPost }] : []),
                  { text: "Delete Post", style: "destructive", onPress: () => setDeleteConfirmVisible(true) },
                  { text: "Cancel", style: "cancel" },
                ]
              : [
                  { text: "Report Post", style: "destructive", onPress: handleReportPost },
                  { text: "Cancel", style: "cancel" },
                ]
          }
          onClose={() => setPostOptionsVisible(false)}
        />
      )}

      {reportModalVisible && post && (
        <ReportModal
          visible
          onClose={() => setReportModalVisible(false)}
          onSubmit={submitPostReport}
          targetName={post.author_name ? `${post.author_name}'s post` : "this post"}
          title="Report Post"
          reportType="post"
        />
      )}

      {deleteConfirmVisible && post && (
        <CustomAlert
          visible
          forceModal
          type="warning"
          title="Delete post"
          message="This post will be removed from the feed."
          buttons={[
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: handleDeletePost },
          ]}
          onClose={() => setDeleteConfirmVisible(false)}
        />
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
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
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
    paddingTop: 4,
    paddingBottom: 8,
  },
  mediaScroll: { gap: 8, marginTop: 10 },
  mediaFrame: { height: 230, borderRadius: 12, marginRight: 8, overflow: "hidden", backgroundColor: "#0F172A" },
  mediaImg: { width: "100%", height: "100%", borderRadius: 12 },
  videoPlayBadge: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.76)",
  },
  countsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  commentsSection: { paddingTop: 16 },
  commentsTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6 },
  commentListItem: { paddingHorizontal: 16 },
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
  emptyComments: { paddingVertical: 28, paddingHorizontal: 16 },
  noComments: { fontSize: 13, textAlign: "center" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
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
