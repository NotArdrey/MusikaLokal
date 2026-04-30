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

type ProductFilter = 'all' | 'draft' | 'active' | 'reported' | 'suspended';

export default function AdminProductsPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();

  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('all');

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'products') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const body: any = { action: 'admin_list_products' };
      if (search.trim()) body.search = search.trim();
      if (filter !== 'all') body.status = filter;
      const { data } = await supabase.functions.invoke('manage-marketplace', { body });
      if (data?.data) setProducts(data.data);
      else setProducts([]);
    } catch (e) { console.error(e); setProducts([]); }
    finally { setLoadingProducts(false); }
  }, [search, filter]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleSuspend = async (productId: string) => {
    await supabase.functions.invoke('manage-marketplace', { body: { action: 'update_product', product_id: productId, status: 'suspended' } });
    fetchProducts();
  };

  const handleActivate = async (productId: string) => {
    await supabase.functions.invoke('manage-marketplace', { body: { action: 'update_product', product_id: productId, status: 'active' } });
    fetchProducts();
  };

  if (loading || !roleResolved) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Admin" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /></View>;
  if (!isAdmin) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Admin" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Access denied</Text></View></View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Admin" onBackPress={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
        {tabItems.map((item) => {
          const active = item.key === 'products';
          return (
            <TouchableOpacity key={item.key} activeOpacity={1} onPress={() => handleTabChange(item.key)} style={[styles.tabButton, { backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#F3F4F6'), borderColor: active ? colors.primary : colors.border }]}>
              <Ionicons name={item.icon as any} size={16} color={active ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search products..." placeholderTextColor={colors.textSecondary} style={[styles.searchInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {(['all', 'draft', 'active', 'reported', 'suspended'] as ProductFilter[]).map((f) => (
            <TouchableOpacity activeOpacity={1} key={f} onPress={() => setFilter(f)} style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.card, borderColor: filter === f ? colors.primary : colors.border }]}>
              <Text style={{ color: filter === f ? '#fff' : colors.text, fontSize: 13, textTransform: 'capitalize' }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {loadingProducts ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={products}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700', marginTop: 2 }}>₱{Number(item.price || 0).toFixed(2)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Seller: {item.seller_name || item.seller_id?.slice(0, 8)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>Status: {item.status} | Type: {item.product_type}</Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                {item.status !== 'suspended' && (
                  <TouchableOpacity activeOpacity={1} style={[styles.actionBtn, { backgroundColor: '#ef444420' }]} onPress={() => handleSuspend(item.id)}>
                    <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Suspend</Text>
                  </TouchableOpacity>
                )}
                {item.status === 'suspended' && (
                  <TouchableOpacity activeOpacity={1} style={[styles.actionBtn, { backgroundColor: '#22c55e20' }]} onPress={() => handleActivate(item.id)}>
                    <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '600' }}>Activate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>No products found</Text>}
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
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
});

