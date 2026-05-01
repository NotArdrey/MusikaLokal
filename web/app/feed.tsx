import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

type FeedTab = "for_you" | "following";

const FEED_PAGE_SIZE = 20;
const KNOWN_FEED_MEDIA_BUCKETS = ["post-media", "posts", "images", "listings", "documents", "avatars"];

const normalizeRelativeSupabaseStorageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!envBase) return normalizedPath;

  const base = envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
  return `${base}${normalizedPath}`;
};

const resolveFeedMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (candidate.startsWith("/storage/v1/") || candidate.startsWith("storage/v1/")) {
    return normalizeRelativeSupabaseStorageUrl(candidate);
  }

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
  }

  if (candidate.includes("/storage/v1/object/public/")) return candidate;
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

const normalizeFeedPost = (post: any) => {
  const author = post?.author || {};
  const visibility = post?.visibility === "followers_only" ? "followers" : post?.visibility;
  const media = Array.isArray(post?.media)
    ? post.media.map((item: any) => ({
        ...item,
        url: resolveFeedMediaUrl(item?.url || item?.storage_path || item?.public_url),
      }))
    : [];

  return {
    ...post,
    body: post?.body ?? post?.content ?? "",
    author_name: post?.author_name ?? author?.full_name ?? "User",
    author_avatar: post?.author_avatar ?? author?.avatar_url ?? "",
    my_reaction: post?.my_reaction ?? post?.user_reaction ?? null,
    visibility: visibility || "public",
    media,
  };
};

const logFeedInvokeError = (scope: string, error: any, extra: Record<string, unknown> = {}) => {
  console.error(`[FeedInvokeError] ${scope}`, {
    message: error?.message || "Unknown function invoke error",
    status: error?.status || error?.context?.status || null,
    code: error?.code ?? error?.context?.code ?? null,
    details: error?.details ?? error?.context?.details ?? null,
    hint: error?.hint ?? error?.context?.hint ?? null,
    context: error?.context ?? null,
    ...extra,
  });
};

export default function FeedScreen() {
  const { colors, isDark } = useTheme();
  const { session, isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<any[]>([]);
  const [postBody, setPostBody] = useState("");
  const [postVisibility, setPostVisibility] = useState<"public" | "followers_only">("public");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const canCreatePost = !!session && !isGuest && postBody.trim().length > 0;

  const fetchFeed = useCallback(
    async (feedTab: FeedTab, append = false) => {
      if (!session || isGuest) {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!append) setLoading(true);

      try {
        const offset = append ? posts.length : 0;
        const { data, error } = await supabase.functions.invoke("manage-social-feed", {
          body: {
            action: "get_feed",
            feed_type: feedTab === "following" ? "following" : "public",
            limit: FEED_PAGE_SIZE,
            offset,
          },
        });

        if (error) {
          logFeedInvokeError("manage-social-feed:get_feed", error, {
            action: "get_feed",
            feedTab,
            append,
            offset,
          });
          throw error;
        }

        const page = Array.isArray(data?.data) ? data.data.map(normalizeFeedPost) : [];
        setPosts((current) => (append ? [...current, ...page] : page));
        setHasMore(page.length === FEED_PAGE_SIZE);
      } catch (e: any) {
        setAlert({ type: "error", title: "Error", message: e?.message || "Failed to load feed." });
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [isGuest, posts.length, session],
  );

  useFocusEffect(
    useCallback(() => {
      fetchFeed(tab);
    }, [fetchFeed, tab]),
  );

  const refresh = () => {
    setRefreshing(true);
    fetchFeed(tab);
  };

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    fetchFeed(tab, true);
  };

  const handleCreatePost = async () => {
    if (!postBody.trim()) {
      setAlert({ type: "warning", title: "Empty Post", message: "Please write something." });
      return;
    }

    setCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "create_post", content: postBody.trim(), visibility: postVisibility },
      });

      if (error) throw error;

      if (data?.success) {
        showTopToast({ type: "success", title: "Posted!", message: "Your post is live." });
        setPostBody("");
        fetchFeed(tab);
        return;
      }

      setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create post." });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e?.message || "Failed to create post." });
    } finally {
      setCreating(false);
    }
  };

  const handleReaction = async (postId: string, currentReaction: string | null) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              my_reaction: currentReaction ? null : "like",
              reaction_count: currentReaction
                ? Math.max((post.reaction_count || 1) - 1, 0)
                : (post.reaction_count || 0) + 1,
            }
          : post,
      ),
    );

    try {
      const { error } = await supabase.functions.invoke("manage-social-feed", {
        body: currentReaction
          ? { action: "remove_reaction", post_id: postId }
          : { action: "react_to_post", post_id: postId, reaction_type: "like" },
      });

      if (error) throw error;
    } catch (e: any) {
      logFeedInvokeError("manage-social-feed:reaction", e, { postId });
      fetchFeed(tab);
    }
  };

  const contentWidth = useMemo(() => (isWebDesktop ? Math.min(width - 48, 760) : width), [isWebDesktop, width]);

  const renderPost = ({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={1}
      style={[styles.postCard, { backgroundColor: cardBg, borderColor: borderCol, width: contentWidth }]}
      onPress={() => router.push({ pathname: "/post_details", params: { post_id: item.id } })}
    >
      <View style={styles.authorRow}>
        <CachedImage uri={item.author_avatar || "https://via.placeholder.com/40"} style={styles.avatar} />
        <View style={styles.authorText}>
          <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
            {item.author_name}
          </Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {item.created_at ? new Date(item.created_at).toLocaleString() : "Just now"}
          </Text>
        </View>
        <View style={[styles.visibilityPill, { borderColor: borderCol }]}>
          <Text style={[styles.visibilityText, { color: colors.textSecondary }]}>{item.visibility}</Text>
        </View>
      </View>

      {!!item.body && <Text style={[styles.bodyText, { color: colors.text }]}>{item.body}</Text>}

      {item.media?.[0]?.url ? (
        <CachedImage uri={item.media[0].url} style={styles.mediaPreview} />
      ) : null}

      <View style={[styles.actionsRow, { borderTopColor: borderCol }]}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.actionButton}
          onPress={(event) => {
            event.stopPropagation();
            handleReaction(item.id, item.my_reaction);
          }}
        >
          <Ionicons
            name={item.my_reaction ? "heart" : "heart-outline"}
            size={20}
            color={item.my_reaction ? "#EF4444" : colors.textSecondary}
          />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>{item.reaction_count || 0}</Text>
        </TouchableOpacity>
        <View style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>{item.comment_count || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Feed" onBackPress={() => router.back()} />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        contentContainerStyle={[styles.listContent, isWebDesktop && styles.listContentWeb]}
        ListHeaderComponent={
          <View style={[styles.headerBlock, { width: contentWidth }]}>
            <View style={styles.tabRow}>
              {[
                { key: "for_you", label: "For You" },
                { key: "following", label: "Following" },
              ].map((item) => {
                const active = tab === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={1}
                    style={[
                      styles.tabButton,
                      {
                        backgroundColor: active ? colors.primary : cardBg,
                        borderColor: active ? colors.primary : borderCol,
                      },
                    ]}
                    onPress={() => setTab(item.key as FeedTab)}
                  >
                    <Text style={[styles.tabText, { color: active ? "#FFFFFF" : colors.text }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.composer, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <TextInput
                style={[styles.composerInput, { color: colors.text }]}
                placeholder={session && !isGuest ? "Share an update..." : "Sign in to post and view your feed."}
                placeholderTextColor={colors.textSecondary}
                value={postBody}
                onChangeText={setPostBody}
                editable={!!session && !isGuest}
                multiline
                maxLength={1000}
              />
              <View style={styles.composerFooter}>
                <TouchableOpacity
                  activeOpacity={1}
                  style={[styles.visibilityToggle, { borderColor: borderCol }]}
                  onPress={() => setPostVisibility((current) => (current === "public" ? "followers_only" : "public"))}
                  disabled={!session || isGuest}
                >
                  <Ionicons name={postVisibility === "public" ? "earth-outline" : "people-outline"} size={16} color={colors.textSecondary} />
                  <Text style={[styles.visibilityToggleText, { color: colors.textSecondary }]}>
                    {postVisibility === "public" ? "Public" : "Followers"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={1}
                  style={[
                    styles.postButton,
                    {
                      backgroundColor: canCreatePost ? colors.primary : colors.border,
                      opacity: creating ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleCreatePost}
                  disabled={!canCreatePost || creating}
                >
                  {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postButtonText}>Post</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
          ) : (
            <View style={[styles.emptyWrap, { width: contentWidth }]}>
              <Ionicons name="newspaper-outline" size={46} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {session && !isGuest ? "No posts yet" : "Sign in to view the feed"}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={styles.footerLoader} /> : <View style={{ height: 80 }} />
        }
      />

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, alignItems: "center" },
  listContentWeb: { paddingTop: 22 },
  headerBlock: { gap: 12, marginBottom: 12 },
  tabRow: { flexDirection: "row", gap: 10 },
  tabButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  composer: { borderWidth: 1, borderRadius: 14, padding: 12 },
  composerInput: { minHeight: 82, fontSize: 14, lineHeight: 20, textAlignVertical: "top" },
  composerFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 },
  visibilityToggle: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  visibilityToggleText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  postButton: { minWidth: 92, minHeight: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  postButtonText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  postCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  authorRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  authorText: { flex: 1, minWidth: 0, marginLeft: 10 },
  authorName: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  metaText: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 2 },
  visibilityPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  visibilityText: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "capitalize" },
  bodyText: { fontSize: 15, lineHeight: 23, fontFamily: "Poppins_400Regular" },
  mediaPreview: { width: "100%", height: 260, borderRadius: 12, marginTop: 12 },
  actionsRow: { flexDirection: "row", gap: 22, borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  loading: { marginTop: 40 },
  emptyWrap: { minHeight: 260, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 10, fontSize: 14, fontFamily: "Poppins_500Medium" },
  footerLoader: { paddingVertical: 20 },
});
