import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Header from '../../src/components/header';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getEdgeFunctionErrorMessage } from '../../src/utils/edgeFunctionErrors';

type Tab = 'dashboard' | 'users' | 'reports' | 'audit' | 'posts' | 'products';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  posts: '/admin/posts',
  products: '/admin/products',
};

const tabItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
];

type PostFilter = 'all' | 'reported' | 'hidden';

export default function AdminPostsPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();

  const [posts, setPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PostFilter>('all');

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'posts') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

  const invokeSocialAdmin = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-social-feed-management', { body });

    if (error) {
      throw new Error(await getEdgeFunctionErrorMessage(error, 'Unable to reach social feed admin tools.'));
    }

    if (data?.error) {
      throw new Error(String(data.error));
    }

    return data?.data;
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const body: any = { action: 'admin_list_posts' };
      if (search.trim()) body.search = search.trim();
      if (filter !== 'all') body.filter = filter;
      const data = await invokeSocialAdmin(body);
      if (data) setPosts(data);
      else setPosts([]);
    } catch (e) {
      console.error(e);
      setPosts([]);
      Alert.alert('Unable to load posts', e instanceof Error ? e.message : 'Please try again.');
    }
    finally { setLoadingPosts(false); }
  }, [filter, invokeSocialAdmin, search]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

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

  if (loading || !roleResolved) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Admin" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /></View>;
  if (!isAdmin) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Admin" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Access denied</Text></View></View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Admin" onBackPress={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {tabItems.map((item) => {
          const active = item.key === 'posts';
          return (
            <TouchableOpacity key={item.key} activeOpacity={1} onPress={() => handleTabChange(item.key)} style={[styles.tabButton, { backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#F3F4F6'), borderColor: active ? colors.primary : colors.border }]}>
              <Ionicons name={item.icon as any} size={16} color={active ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search posts..." placeholderTextColor={colors.textSecondary} style={[styles.searchInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {(['all', 'reported', 'hidden'] as PostFilter[]).map((f) => (
            <TouchableOpacity activeOpacity={1} key={f} onPress={() => setFilter(f)} style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border }]}>
              <Text style={{ color: filter === f ? '#fff' : colors.text, fontSize: 13, textTransform: 'capitalize' }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {loadingPosts ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={posts}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>{item.body || '(no text)'}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>By: {item.author_name || item.author_id?.slice(0, 8)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
                {item.report_count > 0 && (
                  <View style={[styles.badge, { backgroundColor: '#ef444420' }]}>
                    <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600' }}>{item.report_count} reports</Text>
                  </View>
                )}
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity activeOpacity={1} style={[styles.actionBtn, { backgroundColor: '#eab30820' }]} onPress={() => handleHidePost(item.id)}>
                  <Text style={{ color: '#eab308', fontSize: 12, fontWeight: '600' }}>{item.is_hidden ? 'Restore' : 'Hide'}</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={1} style={[styles.actionBtn, { backgroundColor: '#ef444420' }]} onPress={() => handleDeletePost(item.id)}>
                  <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>No posts found</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  tabButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, gap: 6 },
  tabText: { fontSize: 13, fontWeight: '600' },
  searchInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 8 },
  card: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
});

