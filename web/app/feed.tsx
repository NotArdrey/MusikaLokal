import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import GuestSignInGate from "../src/components/GuestSignInGate";
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

type FeedTab = "for_you" | "following";

const SHORTCUTS: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; route: string; color: string }[] = [
  { label: "Projects", icon: "people-outline", route: "/producer_projects", color: "#8b5cf6" },
  { label: "Shop", icon: "bag-handle-outline", route: "/shop", color: "#22c55e" },
  { label: "Playlists", icon: "musical-notes-outline", route: "/create_playlist", color: "#3b82f6" },
  { label: "Orders", icon: "receipt-outline", route: "/orders", color: "#eab308" },
  { label: "Seller Hub", icon: "storefront-outline", route: "/seller_hub", color: "#ec4899" },
];

export default function FeedScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, isGuest, loading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [postBody, setPostBody] = useState("");
  const [postVisibility, setPostVisibility] = useState<"public" | "followers_only">("public");
  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isDark ? "#0F172A" : "#F0F2F5";
  const cardBg = isDark ? "#1E293B" : "#FFFFFF";
  const borderCol = isDark ? "#334155" : "#E2E8F0";

  const fetchFeed = useCallback(async (append = false, currentLength = 0) => {
    if (authLoading) {
      return;
    }

    if (!session) {
      setPosts([]);
      setHasMore(false);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }

    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "get_feed", feed_type: tab === "following" ? "following" : "public", limit: 20, offset: append ? currentLength : 0 },
      });
      if (data?.data) {
        if (append) setPosts((prev) => [...prev, ...data.data]);
        else setPosts(data.data);
        setHasMore(data.data.length === 20);
      }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [authLoading, session, tab]);

  useFocusEffect(useCallback(() => {
    if (authLoading) {
      return;
    }

    setLoading(true);
    fetchFeed();
  }, [authLoading, fetchFeed]));

  const onRefresh = () => {
    if (authLoading) {
      return;
    }

    setRefreshing(true);
    fetchFeed();
  };

  const loadMore = () => {
    if (authLoading || loading || loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    fetchFeed(true, posts.length);
  };

  const handleCreatePost = async () => {
    if (!postBody.trim()) { setAlert({ type: "warning", title: "Empty", message: "Write something." }); return; }
    setCreating(true);
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", { body: { action: "create_post", body: postBody.trim(), visibility: postVisibility } });
      if (data?.success) { showTopToast({ type: "success", title: "Posted!", message: "Your post is live." }); setShowCreate(false); setPostBody(""); fetchFeed(); }
      else setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally { setCreating(false); }
  };

  const handleReaction = async (postId: string, cur: string | null) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, my_reaction: cur ? null : "like", reaction_count: cur ? Math.max((p.reaction_count || 1) - 1, 0) : (p.reaction_count || 0) + 1 } : p));
    try {
      await supabase.functions.invoke("manage-social-feed", { body: cur ? { action: "remove_reaction", post_id: postId } : { action: "react_to_post", post_id: postId, reaction_type: "like" } });
    } catch (e: any) { console.error(e); }
  };

  const handleFollow = async (targetUserId: string, isFollowing: boolean) => {
    try {
      await supabase.functions.invoke("manage-social-feed", { body: { action: isFollowing ? "unfollow" : "follow", target_user_id: targetUserId } });
      setPosts((prev) => prev.map((p) => (p.author_id === targetUserId ? { ...p, is_following: !isFollowing } : p)));
    } catch (e: any) { console.error(e); }
  };

  const timeAgo = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    return days < 7 ? `${days}d` : new Date(d).toLocaleDateString();
  };

  const renderPost = ({ item: post }: { item: any }) => (
    <View style={[styles.postCard, { backgroundColor: cardBg }]}>
      <View style={styles.authorRow}>
        <CachedImage uri={post.author_avatar || "https://via.placeholder.com/40"} style={styles.avatar} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.authorName, { color: colors.text }]}>{post.author_name || "User"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(11) }}>{timeAgo(post.created_at)}</Text>
            <Ionicons name={post.visibility === "followers_only" ? "people" : "globe-outline"} size={11} color={colors.textSecondary} />
          </View>
        </View>
        {post.author_id !== userId && (
          <TouchableOpacity onPress={() => handleFollow(post.author_id, post.is_following)} style={[styles.followBtn, { backgroundColor: post.is_following ? "transparent" : colors.primary, borderColor: post.is_following ? borderCol : colors.primary }]}>
            <Text style={{ color: post.is_following ? colors.textSecondary : "#fff", fontSize: moderateScale(11), fontWeight: "600" }}>{post.is_following ? "Following" : "Follow"}</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity activeOpacity={0.8} onPress={() => router.push({ pathname: "/post_details", params: { post_id: post.id } })}>
        <Text style={{ color: colors.text, fontSize: moderateScale(14), lineHeight: 22, paddingHorizontal: 14, paddingBottom: 10 }}>{post.body}</Text>
      </TouchableOpacity>
      {post.media?.length > 0 && (
        <View>
          {post.media.length === 1 ? (
            <CachedImage uri={post.media[0].url} style={{ width: "100%", height: 300 }} />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {post.media.slice(0, 4).map((m: any, i: number) => <CachedImage key={i} uri={m.url} style={{ width: "50%", height: 200 }} />)}
            </View>
          )}
        </View>
      )}
      {/* Linked items */}
      {post.linked_playlist && (
        <TouchableOpacity style={[styles.linkedCard, { borderColor: borderCol }]} onPress={() => router.push({ pathname: "/playlist_details", params: { playlist_id: post.linked_playlist.id } })}>
          <Ionicons name="musical-notes" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: moderateScale(12), fontWeight: "600", flex: 1 }} numberOfLines={1}>{post.linked_playlist.title}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      )}
      {post.linked_product && (
        <TouchableOpacity style={[styles.linkedCard, { borderColor: borderCol }]} onPress={() => router.push({ pathname: "/product_details", params: { product_id: post.linked_product.id } })}>
          <Ionicons name="cart" size={16} color="#22c55e" />
          <Text style={{ color: "#22c55e", fontSize: moderateScale(12), fontWeight: "600", flex: 1 }} numberOfLines={1}>{post.linked_product.title}</Text>
          <Ionicons name="chevron-forward" size={14} color="#22c55e" />
        </TouchableOpacity>
      )}
      {/* Reaction summary */}
      {(post.reaction_count > 0 || post.comment_count > 0) && (
        <View style={[styles.reactionSummary, { borderBottomColor: borderCol }]}>
          {post.reaction_count > 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={styles.likeBadge}><Ionicons name="heart" size={10} color="#fff" /></View><Text style={{ color: colors.textSecondary, fontSize: moderateScale(12) }}>{post.reaction_count}</Text></View>}
          <View style={{ flex: 1 }} />
          {post.comment_count > 0 && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12) }}>{post.comment_count} comments</Text>}
        </View>
      )}
      {/* Action bar */}
      <View style={[styles.actionBar, { borderTopColor: borderCol }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleReaction(post.id, post.my_reaction)}>
          <Ionicons name={post.my_reaction ? "heart" : "heart-outline"} size={20} color={post.my_reaction ? "#ef4444" : colors.textSecondary} />
          <Text style={{ color: post.my_reaction ? "#ef4444" : colors.textSecondary, fontSize: moderateScale(12), fontWeight: "500", marginLeft: 5 }}>Like</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: "/post_details", params: { post_id: post.id } })}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12), fontWeight: "500", marginLeft: 5 }}>Comment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12), fontWeight: "500", marginLeft: 5 }}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => (
    <>
      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: bg }]}>
        <Text style={[styles.appTitle, { color: colors.primary }]}>MusikaLokal</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity style={[styles.topBarIcon, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} onPress={() => router.push("/notifications" as any)}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topBarIcon, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} onPress={() => router.push("/chat" as any)}>
            <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Composer prompt */}
      <View style={[styles.composerRow, { backgroundColor: cardBg }]}>
        <View style={[styles.composerAvatar, { backgroundColor: colors.primary + "30" }]}>
          <Ionicons name="person" size={18} color={colors.primary} />
        </View>
        <TouchableOpacity style={[styles.composerInput, { backgroundColor: isDark ? "#0F172A" : "#F1F5F9", borderColor: borderCol }]} onPress={() => setShowCreate(true)}>
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13) }}>What's on your mind?</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowCreate(true)}>
          <Ionicons name="images-outline" size={22} color="#22c55e" />
        </TouchableOpacity>
      </View>

      {/* Shortcuts */}
      <View style={[styles.shortcutRow, { backgroundColor: cardBg }]}>
        {SHORTCUTS.map((s) => (
          <TouchableOpacity key={s.label} style={styles.shortcutItem} onPress={() => router.push(s.route as any)}>
            <View style={[styles.shortcutIcon, { backgroundColor: s.color + "18" }]}>
              <Ionicons name={s.icon} size={20} color={s.color} />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(10), textAlign: "center" }} numberOfLines={1}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Feed tabs */}
      <View style={[styles.tabRow, { backgroundColor: cardBg, borderBottomColor: borderCol }]}>
        {(["for_you", "following"] as FeedTab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Ionicons name={t === "for_you" ? "flame-outline" : "people-outline"} size={18} color={tab === t ? colors.primary : colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={{ color: tab === t ? colors.primary : colors.textSecondary, fontSize: moderateScale(13), fontWeight: "600" }}>{t === "for_you" ? "For You" : "Following"}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  if (isGuest) return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.topBar, { backgroundColor: bg }]}><Text style={[styles.appTitle, { color: colors.primary }]}>MusikaLokal</Text></View>
      <GuestSignInGate message="Sign in to see your social feed" />
      <Navbar />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <FlatList
        data={loading ? [] : posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> :
          <Text style={{ textAlign: "center", marginTop: 60, color: colors.textSecondary, fontSize: moderateScale(14) }}>
            {tab === "following" ? "Follow musicians and producers to see posts here" : "No posts yet — be the first to share!"}
          </Text>
        }
        ListFooterComponent={<>{loadingMore && <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />}<View style={{ height: 80 }} /></>}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={isWebDesktop ? { maxWidth: 600, alignSelf: "center", width: "100%" } : undefined}
      />

      {/* Create Post Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCreate(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              <Text style={{ color: colors.text, fontSize: moderateScale(16), fontWeight: "700" }}>Create Post</Text>
              <TouchableOpacity style={[styles.postBtn, { backgroundColor: colors.primary, opacity: creating || !postBody.trim() ? 0.5 : 1 }]} onPress={handleCreatePost} disabled={creating || !postBody.trim()}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Post</Text>}
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
              <View style={[styles.composerAvatar, { backgroundColor: colors.primary + "30" }]}><Ionicons name="person" size={16} color={colors.primary} /></View>
              <View>
                <Text style={{ color: colors.text, fontSize: moderateScale(14), fontWeight: "700" }}>You</Text>
                <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", backgroundColor: isDark ? "#334155" : "#E2E8F0", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 }} onPress={() => setPostVisibility(postVisibility === "public" ? "followers_only" : "public")}>
                  <Ionicons name={postVisibility === "public" ? "globe-outline" : "people-outline"} size={11} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 3 }}>{postVisibility === "public" ? "Public" : "Followers"}</Text>
                  <Ionicons name="caret-down" size={10} color={colors.textSecondary} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>
            </View>
            <TextInput style={{ flex: 1, fontSize: moderateScale(16), color: colors.text, paddingHorizontal: 16, paddingTop: 10, textAlignVertical: "top", minHeight: 150 }} placeholder="What's on your mind?" placeholderTextColor={colors.textSecondary} value={postBody} onChangeText={setPostBody} multiline autoFocus />
          </View>
        </View>
      </Modal>
      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  appTitle: { fontSize: moderateScale(22), fontWeight: "800" },
  topBarIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  composerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  composerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  composerInput: { flex: 1, height: 38, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center" },

  shortcutRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 10, paddingHorizontal: 8, marginTop: 6 },
  shortcutItem: { alignItems: "center", width: 60 },
  shortcutIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 4 },

  tabRow: { flexDirection: "row", borderBottomWidth: 1, marginTop: 6 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 },

  postCard: { overflow: "hidden" },
  authorRow: { flexDirection: "row", alignItems: "center", padding: 14, paddingBottom: 6 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  authorName: { fontSize: moderateScale(14), fontWeight: "700" },
  followBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },

  linkedCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginVertical: 6, padding: 10, borderWidth: 1, borderRadius: 10, gap: 8 },

  reactionSummary: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5 },
  likeBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },

  actionBar: { flexDirection: "row", borderTopWidth: 0.5, paddingVertical: 4 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" as const, alignItems: "center" as const },
  modalBox: { borderRadius: 12, width: "90%" as any, maxWidth: 520, maxHeight: "80%" as any, minHeight: 350 },
  modalHeader: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#334155" },
  postBtn: { borderRadius: 6, paddingHorizontal: 16, paddingVertical: 7 },
});
