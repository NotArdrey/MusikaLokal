import useAdminLayout from '../../src/hooks/useAdminLayout';
import { Ionicons } from '@expo/vector-icons';

import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../../src/components/admin/AdminPageHeader';
import LoadingState from '../../src/components/LoadingState';
import { AdminFilterBar } from '../../src/components/admin/filters';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { AdminComment, AdminPost, invokeSocialAdmin, isPostVideo, resolveAdminMediaUrl } from '../../src/admin/socialFeed';
import AdminPostView from '../../src/components/admin/AdminPostView';

type PostFilter = 'all' | 'reported' | 'hidden';

export default function AdminPostsPage() {
  const { colors } = useTheme();
  const { contentPadding } = useAdminLayout();
  const { loading, isAdmin, roleResolved } = useAuth();

  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [commentReviews, setCommentReviews] = useState<AdminComment[]>([]);
  const [selectedPost, setSelectedPost] = useState<AdminPost | null>(null);
  const [postsError, setPostsError] = useState('');
  const [commentsError, setCommentsError] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);
  const requestRef = useRef({ sequence: 0 });
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PostFilter>('all');

  const fetchPosts = useCallback(async () => {
    if (!isAdmin || loading || !roleResolved) return;
    const request = ++requestRef.current.sequence;
    setLoadingPosts(true);
    setPostsError('');
    try {
      const body: Record<string, unknown> = { action: 'admin_list_posts' };
      if (search.trim()) body.search = search.trim();
      if (filter !== 'all') body.filter = filter;
      const data = await invokeSocialAdmin(body);
      if (request !== requestRef.current.sequence) return;
      if (data) setPosts(data);
      else setPosts([]);
    } catch (e) {
      if (request === requestRef.current.sequence) {
        setPosts([]);
        setPostsError(e instanceof Error ? e.message : 'Unable to load posts.');
      }
    }
    finally { if (request === requestRef.current.sequence) setLoadingPosts(false); }
  }, [filter, isAdmin, loading, roleResolved, search]);

  useEffect(() => {
    const requestState = requestRef.current;
    const timer = setTimeout(() => void fetchPosts(), 250);
    return () => { clearTimeout(timer); requestState.sequence++; };
  }, [fetchPosts]);

  const fetchCommentReviews = useCallback(async () => {
    if (!isAdmin || loading || !roleResolved) return;
    try {
      const data = await invokeSocialAdmin({ action: 'admin_list_comments', filter: 'review' });
      setCommentReviews(data || []);
      setCommentsError('');
    } catch (e) {
      console.error(e);
      setCommentReviews([]);
      setCommentsError(e instanceof Error ? e.message : 'Unable to load comments for review.');
    } finally {
      setLoadingComments(false);
    }
  }, [isAdmin, loading, roleResolved]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchCommentReviews(), 0);
    return () => clearTimeout(timer);
  }, [fetchCommentReviews]);

  const handleHidePost = async (postId: string) => {
    const target = posts.find((post) => post.id === postId);
    try {
      await invokeSocialAdmin({
        action: 'admin_hide_post',
        post_id: postId,
        hidden: !target?.is_hidden,
      });
      fetchPosts();
    } catch (e) {
      console.error(e);
      Alert.alert('Unable to update post', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await invokeSocialAdmin({ action: 'delete_post', post_id: postId });
      fetchPosts();
    } catch (e) {
      console.error(e);
      Alert.alert('Unable to delete post', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const handleModerateComment = async (commentId: string, status: 'approved' | 'blocked') => {
    try {
      await invokeSocialAdmin({
        action: 'admin_update_comment_moderation',
        comment_id: commentId,
        status,
        hidden: status !== 'approved',
      });
      setLoadingComments(true);
      fetchCommentReviews();
    } catch (e) {
      console.error(e);
      Alert.alert('Unable to update comment', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await invokeSocialAdmin({ action: 'admin_delete_comment', comment_id: commentId });
      setLoadingComments(true);
      fetchCommentReviews();
      void fetchPosts();
    } catch (e) {
      console.error(e);
      Alert.alert('Unable to delete comment', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  if (loading || !roleResolved) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Posts" onBackPress={() => router.back()} /><LoadingState message="Checking admin access..." style={{ flex: 1, minWidth: 0 }} /></View>;
  if (!isAdmin) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Posts" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>Access denied</Text></View></View>;

  return (
    <View
      testID="admin-posts-page"
      accessibilityLabel="admin-posts-page"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Header title="Posts" onBackPress={() => router.back()} />

      <View style={{ paddingHorizontal: contentPadding, marginTop: 12 }}>
        <TextInput
          testID="admin-posts-search-input"
          accessibilityLabel="admin-posts-search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Search posts..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
        />
        <View style={styles.filterBarSpacing}>
          <AdminFilterBar
            filters={[
              {
                key: 'status',
                label: 'Post status',
                type: 'segmented',
                options: [
                  { value: 'all', label: 'All', testID: 'admin-posts-filter-all' },
                  { value: 'reported', label: 'Reported', testID: 'admin-posts-filter-reported' },
                  { value: 'hidden', label: 'Hidden', testID: 'admin-posts-filter-hidden' },
                ],
              },
            ]}
            values={{ status: filter }}
            onChange={(key, value) => {
              if (key === 'status' && !Array.isArray(value)) setFilter(value as PostFilter);
            }}
          />
        </View>
      </View>
      {loadingPosts ? <LoadingState message="Loading posts..." style={{ flex: 1 }} /> : (
        <FlatList
          data={posts}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 32 }}
          ListHeaderComponent={(
            <View style={[styles.reviewPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.reviewHeader}>
                <Text style={{ color: colors.text, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>AI Comment Review</Text>
                {loadingComments && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              {commentsError ? <Text accessibilityRole="alert" style={{ color: '#ef4444' }}>{commentsError}</Text> : !loadingComments && commentReviews.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>No hidden or flagged comments right now.</Text>
              ) : (
                (showAllReviews ? commentReviews : commentReviews.slice(0, 6)).map((comment) => (
                  <View key={comment.id} style={[styles.commentReviewCard, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }} numberOfLines={3}>{comment.content}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>
                      {comment.author_name || comment.author_id?.slice(0, 8)} | {comment.moderation_status || 'review'}
                    </Text>
                    {!!comment.moderation_reason && (
                      <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 4 }} numberOfLines={2}>{comment.moderation_reason}</Text>
                    )}
                    <View style={styles.actionRow}>
                      <TouchableOpacity activeOpacity={1} style={[styles.actionBtn, { backgroundColor: '#22c55e20' }]} onPress={() => handleModerateComment(comment.id, 'approved')}>
                        <Text style={{ color: '#16a34a', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={1} style={[styles.actionBtn, { backgroundColor: '#eab30820' }]} onPress={() => handleModerateComment(comment.id, 'blocked')}>
                        <Text style={{ color: '#eab308', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Hide</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={1} style={[styles.actionBtn, { backgroundColor: '#ef444420' }]} onPress={() => handleDeleteComment(comment.id)}>
                        <Text style={{ color: '#ef4444', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              {commentReviews.length > 6 ? (
                <TouchableOpacity accessibilityRole="button" onPress={() => setShowAllReviews(previous => !previous)} style={styles.actionBtn}>
                  <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 12 }}>{showAllReviews ? 'Show fewer comments' : `View all ${commentReviews.length} comments to review`}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          renderItem={({ item }) => (
            <View
              testID={`admin-post-card-${item.id}`}
              accessibilityLabel={`admin-post-card-${item.id}`}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.cardRow}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="View post media and comments" onPress={() => setSelectedPost(item)} style={[styles.thumbnail, { backgroundColor: colors.surface }]}>
                  {item.media?.[0] && (!isPostVideo(item.media[0]) || item.media[0].thumbnail_path) ? (
                    <Image source={{ uri: resolveAdminMediaUrl(isPostVideo(item.media[0]) ? item.media[0].thumbnail_path : item.media[0].storage_path) }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                  ) : <Ionicons name={item.media?.[0] && isPostVideo(item.media[0]) ? 'videocam-outline' : 'newspaper-outline'} size={28} color={colors.textSecondary} />}
                  {item.media?.some(isPostVideo) ? <View style={styles.playBadge}><Ionicons name="play" size={14} color="#fff" /></View> : null}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'Poppins_600SemiBold' }} numberOfLines={2}>{item.body || '(no text)'}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>By: {item.author_name || item.author_id?.slice(0, 8)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>{new Date(item.created_at).toLocaleString()}</Text>
                  <Text style={{ color: item.is_hidden ? '#d97706' : colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_500Medium', marginTop: 6 }}>{item.is_hidden ? 'Hidden' : 'Visible'} · {item.media?.length || 0} attachments · {item.comment_count || 0} comments</Text>
                </View>
                {item.report_count > 0 && (
                  <View style={[styles.badge, { backgroundColor: '#ef444420' }]}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontFamily: 'Poppins_600SemiBold' }}>{item.report_count} reports</Text>
                  </View>
                )}
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity accessibilityRole="button" testID={`admin-post-view-${item.id}`} style={[styles.actionBtn, { backgroundColor: `${colors.primary}12` }]} onPress={() => setSelectedPost(item)}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>View post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={1}
                  testID={`admin-post-hide-${item.id}`}
                  accessibilityLabel={`admin-post-hide-${item.id}`}
                  style={[styles.actionBtn, { backgroundColor: '#eab30820' }]}
                  onPress={() => handleHidePost(item.id)}
                >
                  <Text style={{ color: '#eab308', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>{item.is_hidden ? 'Restore' : 'Hide'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={1}
                  testID={`admin-post-delete-${item.id}`}
                  accessibilityLabel={`admin-post-delete-${item.id}`}
                  style={[styles.actionBtn, { backgroundColor: '#ef444420' }]}
                  onPress={() => handleDeletePost(item.id)}
                >
                  <Text style={{ color: '#ef4444', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={postsError ? <View style={styles.centered}><Text accessibilityRole="alert" style={{ color: '#ef4444' }}>{postsError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void fetchPosts()} style={styles.actionBtn}><Text style={{ color: colors.primary }}>Retry</Text></TouchableOpacity></View> : <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 40 }}>No posts found</Text>}
        />
      )}
      {selectedPost ? <AdminPostView key={selectedPost.id} post={selectedPost} onClose={() => setSelectedPost(null)} onCommentsChange={() => { setLoadingComments(true); void fetchCommentReviews(); void fetchPosts(); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  searchInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Poppins_400Regular' },
  filterBarSpacing: { marginTop: 8 },
  card: { padding: 18, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  thumbnail: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playBadge: { position: 'absolute', right: 5, bottom: 5, backgroundColor: 'rgba(15,23,42,0.75)', padding: 5, borderRadius: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  actionBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  reviewPanel: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  commentReviewCard: { borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
});
