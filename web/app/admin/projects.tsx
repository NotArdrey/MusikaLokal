import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

type Tab = 'dashboard' | 'permits' | 'users' | 'reports' | 'audit' | 'deals' | 'posts' | 'products' | 'projects';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  permits: '/admin/permits',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  deals: '/admin/deals',
  posts: '/admin/posts',
  products: '/admin/products',
  projects: '/admin/projects',
};

const tabItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'permits', label: 'Permits', icon: 'document-text-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'deals', label: 'Deals', icon: 'briefcase-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
  { key: 'projects', label: 'Projects', icon: 'people-circle-outline' },
];

type ProjectFilter = 'all' | 'open' | 'in_progress' | 'completed' | 'archived';

export default function AdminProjectsPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();

  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'projects') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const body: any = { action: 'admin_list_projects' };
      if (search.trim()) body.search = search.trim();
      if (filter !== 'all') body.status = filter;
      const { data } = await supabase.functions.invoke('manage-producer-network', { body });
      if (data?.data) setProjects(data.data);
      else setProjects([]);
    } catch (e) { console.error(e); setProjects([]); }
    finally { setLoadingProjects(false); }
  }, [search, filter]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleArchive = async (projectId: string) => {
    await supabase.functions.invoke('manage-producer-network', { body: { action: 'update_project', project_id: projectId, status: 'archived' } });
    fetchProjects();
  };

  const statusColors: Record<string, string> = {
    open: '#3b82f6', in_progress: '#8b5cf6', completed: '#22c55e', archived: '#64748b',
  };

  if (loading || !roleResolved) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Admin - Projects" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /></View>;
  if (!isAdmin) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Admin - Projects" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Access denied</Text></View></View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Admin - Projects" onBackPress={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {tabItems.map((item) => {
          const active = item.key === 'projects';
          return (
            <TouchableOpacity key={item.key} activeOpacity={1} onPress={() => handleTabChange(item.key)} style={[styles.tabButton, { backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#F3F4F6'), borderColor: active ? colors.primary : colors.border }]}>
              <Ionicons name={item.icon as any} size={16} color={active ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search projects..." placeholderTextColor={colors.textSecondary} style={[styles.searchInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {(['all', 'open', 'in_progress', 'completed', 'archived'] as ProjectFilter[]).map((f) => (
            <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border }]}>
              <Text style={{ color: filter === f ? '#fff' : colors.text, fontSize: 13, textTransform: 'capitalize' }}>{f.replace('_', ' ')}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {loadingProjects ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={projects}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Owner: {item.owner_name || item.owner_id?.slice(0, 8)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>Roles: {item.role_count || 0} | Applications: {item.application_count || 0}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: (statusColors[item.status] || '#64748b') + '20' }]}>
                  <Text style={{ color: statusColors[item.status] || '#64748b', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' }}>{item.status?.replace('_', ' ')}</Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                {item.status !== 'archived' && (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#64748b20' }]} onPress={() => handleArchive(item.id)}>
                    <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600' }}>Archive</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + '20' }]} onPress={() => router.push({ pathname: '/producer_project_details', params: { project_id: item.id } } as any)}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>View</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>No projects found</Text>}
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
