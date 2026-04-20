import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

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

  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) {
    return candidate;
  }

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

export default function PostDetailsScreen() {
  const { colors } = useTheme();
  const { session, userId } = useAuth();
  const { post_id } = useLocalSearchParams();

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

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

  useEffect(() => { fetchPost(); }, [fetchPost]);

  const handleReaction = async () => {
    if (!post) return;
    try {
      if (post.my_reaction) {
        await supabase.functions.invoke("manage-social-feed", {
          body: { action: "remove_reaction", post_id: post.id },
        });
        setPost((prev: any) => ({ ...prev, my_reaction: null, reaction_count: Math.max((prev.reaction_count || 1) - 1, 0) }));
      } else {
        await supabase.functions.invoke("manage-social-feed", {
          body: { action: "react_to_post", post_id: post.id, reaction_type: "like" },
        });
        setPost((prev: any) => ({ ...prev, my_reaction: "like", reaction_count: (prev.reaction_count || 0) + 1 }));
      }
    } catch (e: any) {
      console.error("Reaction error:", e);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "add_comment", post_id: post.id, content: commentText.trim() },
      });
      if (data?.success) {
        setCommentText("");
        fetchPost();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to add comment" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "delete_comment", comment_id: commentId },
      });
      if (data?.success) {
        showTopToast({ type: "info", title: "Deleted", message: "Comment deleted." });
        fetchPost();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleDeletePost = async () => {
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "delete_post", post_id: post.id },
      });
      if (data?.success) {
        showTopToast({ type: "info", title: "Deleted", message: "Post deleted." });
        router.back();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleReport = async () => {
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "report_post", post_id: post.id, reason: "inappropriate" },
      });
      if (data?.success) {
        showTopToast({ type: "info", title: "Reported", message: "Post has been reported for review." });
      } else {
        setAlert({ type: "warning", title: "Info", message: data?.error || "Already reported" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Post" onBackPress={() => router.back()} />
        <View style={{ padding: 16 }}>
          <Skeleton width={SCREEN_WIDTH - 32} height={200} style={{ borderRadius: 12, marginBottom: 16 }} />
          <Skeleton width={SCREEN_WIDTH * 0.6} height={20} style={{ borderRadius: 6 }} />
        </View>
        <Navbar />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Post" onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(15) }}>Post not found</Text>
        </View>
        <Navbar />
      </View>
    );
  }

  const isOwner = post.author_id === userId;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="Post" onBackPress={() => router.back()} />

      <ScrollView style={styles.content}>
        {/* Author */}
        <View style={styles.authorRow}>
          <CachedImage
            uri={post.author_avatar || "https://via.placeholder.com/40" }
            style={styles.authorAvatar}
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.authorName, { color: colors.text }]}>{post.author_name || "User"}</Text>
            <Text style={[styles.postTime, { color: colors.textSecondary }]}>
              {new Date(post.created_at).toLocaleString()} â€¢ {post.visibility === "followers" ? "Followers" : "Public"}
            </Text>
          </View>
          {isOwner ? (
            <TouchableOpacity activeOpacity={1} onPress={handleDeletePost}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={1} onPress={handleReport}>
              <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Body */}
        <Text style={[styles.postBody, { color: colors.text }]}>{post.body}</Text>

        {/* Media */}
        {post.media && post.media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
            {post.media.map((m: any, idx: number) => (
              <CachedImage key={idx} uri={m.url } style={styles.mediaImage} />
            ))}
          </ScrollView>
        )}

        {/* Reactions bar */}
        <View style={[styles.reactionsBar, { borderColor: colors.border }]}>
          <TouchableOpacity activeOpacity={1} style={styles.reactionItem} onPress={handleReaction}>
            <Ionicons
              name={post.my_reaction ? "heart" : "heart-outline"}
              size={22}
              color={post.my_reaction ? "#ef4444" : colors.textSecondary}
            />
            <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{post.reaction_count || 0}</Text>
          </TouchableOpacity>
          <View style={styles.reactionItem}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{comments.length}</Text>
          </View>
        </View>

        {/* Comments */}
        <View style={styles.commentsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Comments</Text>
          {comments.length > 0 ? (
            comments.map((c: any) => (
              <View key={c.id} style={[styles.commentCard, { borderColor: colors.border }]}>
                <CachedImage
                  uri={c.author_avatar || "https://via.placeholder.com/28" }
                  style={styles.commentAvatar}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.commentAuthor, { color: colors.text }]}>{c.author_name || "User"}</Text>
                  <Text style={[styles.commentBody, { color: colors.textSecondary }]}>{c.body}</Text>
                  <Text style={[styles.commentTime, { color: colors.textSecondary }]}>
                    {new Date(c.created_at).toLocaleString()}
                  </Text>
                </View>
                {c.author_id === userId && (
                  <TouchableOpacity activeOpacity={1} onPress={() => handleDeleteComment(c.id)}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No comments yet. Be the first!</Text>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Comment input */}
      <View style={[styles.commentInputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.commentInput, { color: colors.text, borderColor: colors.border }]}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textSecondary}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity activeOpacity={1}
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
          onPress={handleAddComment}
          disabled={submitting || !commentText.trim()}
        >
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  authorRow: { flexDirection: "row", alignItems: "center", marginTop: 16, marginBottom: 12 },
  authorAvatar: { width: 44, height: 44, borderRadius: 22 },
  authorName: { fontSize: moderateScale(15), fontWeight: "700" },
  postTime: { fontSize: moderateScale(12), marginTop: 2 },
  postBody: { fontSize: moderateScale(15), lineHeight: 24, marginBottom: 12 },
  mediaRow: { marginBottom: 12 },
  mediaImage: { width: 240, height: 180, borderRadius: 10, marginRight: 10 },
  reactionsBar: { flexDirection: "row", gap: 24, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1 },
  reactionItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  reactionCount: { fontSize: moderateScale(13) },
  commentsSection: { marginTop: 16 },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: "700", marginBottom: 12 },
  commentCard: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 0.5, alignItems: "flex-start" },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, marginTop: 2 },
  commentAuthor: { fontSize: moderateScale(12), fontWeight: "600" },
  commentBody: { fontSize: moderateScale(13), marginTop: 2, lineHeight: 20 },
  commentTime: { fontSize: moderateScale(10), marginTop: 4 },
  emptyText: { textAlign: "center", fontSize: moderateScale(13), marginTop: 20 },
  commentInputRow: { flexDirection: "row", alignItems: "center", padding: 10, paddingBottom: 20, borderTopWidth: 1 },
  commentInput: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: moderateScale(14), maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginLeft: 8 },
});
