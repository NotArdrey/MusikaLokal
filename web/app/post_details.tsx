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
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function PostDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId } = useAuth();
  const { post_id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchPost = useCallback(async () => {
    if (!post_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", { body: { action: "get_post_details", post_id } });
      if (data?.data) { setPost(data.data); setComments(data.data.comments || []); }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [post_id]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  const handleReaction = async () => {
    if (!post) return;
    if (post.my_reaction) {
      await supabase.functions.invoke("manage-social-feed", { body: { action: "remove_reaction", post_id: post.id } });
      setPost((p: any) => ({ ...p, my_reaction: null, reaction_count: Math.max((p.reaction_count || 1) - 1, 0) }));
    } else {
      await supabase.functions.invoke("manage-social-feed", { body: { action: "react_to_post", post_id: post.id, reaction_type: "like" } });
      setPost((p: any) => ({ ...p, my_reaction: "like", reaction_count: (p.reaction_count || 0) + 1 }));
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", { body: { action: "add_comment", post_id: post.id, body: commentText.trim() } });
      if (data?.success) { setCommentText(""); fetchPost(); }
      else setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally { setSubmitting(false); }
  };

  const handleDeleteComment = async (commentId: string) => {
    const { data } = await supabase.functions.invoke("manage-social-feed", { body: { action: "delete_comment", comment_id: commentId } });
    if (data?.success) { showTopToast({ type: "info", title: "Deleted", message: "Comment deleted." }); fetchPost(); }
  };

  const handleDeletePost = async () => {
    const { data } = await supabase.functions.invoke("manage-social-feed", { body: { action: "delete_post", post_id: post.id } });
    if (data?.success) { showTopToast({ type: "info", title: "Deleted", message: "Post deleted." }); router.back(); }
  };

  if (loading) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Post" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /><Navbar /></View>;
  if (!post) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Post" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Post not found</Text></View><Navbar /></View>;

  const isOwner = post.author_id === userId;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Post" onBackPress={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 600, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          <View style={styles.authorRow}>
            <CachedImage uri={post.author_avatar || "https://via.placeholder.com/40" } style={styles.avatar} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: moderateScale(15), fontWeight: "700" }}>{post.author_name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12) }}>{new Date(post.created_at).toLocaleString()}</Text>
            </View>
            {isOwner && <TouchableOpacity activeOpacity={1} onPress={handleDeletePost}><Ionicons name="trash-outline" size={20} color="#ef4444" /></TouchableOpacity>}
          </View>
          <Text style={{ color: colors.text, fontSize: moderateScale(15), lineHeight: 24, marginBottom: 12 }}>{post.body}</Text>
          {post.media?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {post.media.map((m: any, i: number) => <CachedImage key={i} uri={m.url } style={styles.mediaImg} />)}
            </ScrollView>
          )}
          <View style={[styles.reactionsBar, { borderColor: borderCol }]}>
            <TouchableOpacity activeOpacity={1} style={styles.reactionItem} onPress={handleReaction}>
              <Ionicons name={post.my_reaction ? "heart" : "heart-outline"} size={22} color={post.my_reaction ? "#ef4444" : colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, marginLeft: 6 }}>{post.reaction_count || 0}</Text>
            </TouchableOpacity>
            <View style={styles.reactionItem}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, marginLeft: 6 }}>{comments.length}</Text>
            </View>
          </View>
          <Text style={{ color: colors.text, fontSize: moderateScale(16), fontWeight: "700", marginTop: 16, marginBottom: 12 }}>Comments</Text>
          {comments.length > 0 ? comments.map((c: any) => (
            <View key={c.id} style={[styles.commentCard, { borderColor: borderCol }]}>
              <CachedImage uri={c.author_avatar || "https://via.placeholder.com/28" } style={styles.commentAvatar} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: colors.text, fontSize: moderateScale(12), fontWeight: "600" }}>{c.author_name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13), marginTop: 2 }}>{c.body}</Text>
              </View>
              {c.author_id === userId && <TouchableOpacity activeOpacity={1} onPress={() => handleDeleteComment(c.id)}><Ionicons name="trash-outline" size={16} color="#ef4444" /></TouchableOpacity>}
            </View>
          )) : <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 20 }}>No comments yet</Text>}
          <View style={{ height: 120 }} />
        </View>
      </ScrollView>
      <View style={[styles.inputRow, { backgroundColor: cardBg, borderTopColor: borderCol }]}>
        <TextInput style={[styles.commentInput, { color: colors.text, borderColor: borderCol }]} placeholder="Add a comment..." placeholderTextColor={colors.textSecondary} value={commentText} onChangeText={setCommentText} multiline maxLength={1000} />
        <TouchableOpacity activeOpacity={1} style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]} onPress={handleAddComment} disabled={submitting || !commentText.trim()}>
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  authorRow: { flexDirection: "row", alignItems: "center", marginTop: 16, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  mediaImg: { width: 240, height: 180, borderRadius: 10, marginRight: 10 },
  reactionsBar: { flexDirection: "row", gap: 24, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1 },
  reactionItem: { flexDirection: "row", alignItems: "center" },
  commentCard: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 0.5, alignItems: "flex-start" },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, marginTop: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", padding: 10, paddingBottom: 20, borderTopWidth: 1 },
  commentInput: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: moderateScale(14), maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginLeft: 8 },
});
