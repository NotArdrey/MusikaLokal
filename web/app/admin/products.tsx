import useAdminLayout from '../../src/hooks/useAdminLayout';
import { Ionicons } from '@expo/vector-icons';

import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../../src/components/admin/AdminPageHeader';
import LoadingState from '../../src/components/LoadingState';
import { AdminFilterBar } from '../../src/components/admin/filters';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getEdgeFunctionErrorMessage } from '../../src/utils/edgeFunctionErrors';
import { resolveAdminMediaUrl } from '../../src/admin/socialFeed';
import InAppMediaViewer from '../../src/components/InAppMediaViewer';

type ProductFilter = 'all' | 'draft' | 'active' | 'reported' | 'suspended';
type AdminProduct = {
  id: string;
  title: string;
  price: number;
  seller_id: string;
  seller_name?: string | null;
  status: string;
  product_type: string;
  cover_image_url?: string | null;
  primary_image?: string | null;
};

export default function AdminProductsPage() {
  const { colors } = useTheme();
  const { isCompact, contentPadding } = useAdminLayout();
  const { loading, isAdmin, roleResolved } = useAuth();

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [error, setError] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const requestRef = useRef({ sequence: 0 });

  const invokeMarketplaceAdmin = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-marketplace-management', { body });

    if (error) {
      throw new Error(await getEdgeFunctionErrorMessage(error, 'Unable to reach marketplace admin tools.'));
    }

    if (data?.error) {
      throw new Error(String(data.error));
    }

    return data?.data;
  }, []);

  const fetchProducts = useCallback(async () => {
    if (!isAdmin || loading || !roleResolved) return;
    const request = ++requestRef.current.sequence;
    setLoadingProducts(true);
    setError('');
    try {
      const body: Record<string, unknown> = { action: 'admin_list_products' };
      if (search.trim()) body.search = search.trim();
      if (filter !== 'all') body.status = filter;
      const data = await invokeMarketplaceAdmin(body);
      if (request !== requestRef.current.sequence) return;
      if (data) setProducts(data);
      else setProducts([]);
    } catch (e) {
      if (request === requestRef.current.sequence) {
        setProducts([]);
        setError(e instanceof Error ? e.message : 'Unable to load products.');
      }
    }
    finally { if (request === requestRef.current.sequence) setLoadingProducts(false); }
  }, [filter, invokeMarketplaceAdmin, isAdmin, loading, roleResolved, search]);

  useEffect(() => {
    const requestState = requestRef.current;
    const timer = setTimeout(() => void fetchProducts(), 250);
    return () => { clearTimeout(timer); requestState.sequence++; };
  }, [fetchProducts]);

  const handleSuspend = async (productId: string) => {
    try {
      await invokeMarketplaceAdmin({ action: 'update_product', product_id: productId, status: 'suspended' });
      fetchProducts();
    } catch (e) {
      console.error(e);
      Alert.alert('Unable to suspend product', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const handleActivate = async (productId: string) => {
    try {
      await invokeMarketplaceAdmin({ action: 'update_product', product_id: productId, status: 'active' });
      fetchProducts();
    } catch (e) {
      console.error(e);
      Alert.alert('Unable to activate product', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  if (loading || !roleResolved) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Products" onBackPress={() => router.back()} /><LoadingState message="Checking admin access..." style={{ flex: 1, minWidth: 0 }} /></View>;
  if (!isAdmin) return <View style={[styles.container, { backgroundColor: colors.background }]}><Header title="Products" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>Access denied</Text></View></View>;

  return (
    <View
      testID="admin-products-page"
      accessibilityLabel="admin-products-page"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Header title="Products" onBackPress={() => router.back()} />

      <View style={{ paddingHorizontal: contentPadding, marginTop: 12 }}>
        <TextInput
          testID="admin-products-search-input"
          accessibilityLabel="admin-products-search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Search products..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
        />
        <View style={styles.filterBarSpacing}>
          <AdminFilterBar
            filters={[
              {
                key: 'status',
                label: 'Product status',
                type: 'segmented',
                options: [
                  { value: 'all', label: 'All', testID: 'admin-products-filter-all' },
                  { value: 'draft', label: 'Draft', testID: 'admin-products-filter-draft' },
                  { value: 'active', label: 'Active', testID: 'admin-products-filter-active' },
                  { value: 'reported', label: 'Reported', testID: 'admin-products-filter-reported' },
                  { value: 'suspended', label: 'Suspended', testID: 'admin-products-filter-suspended' },
                ],
              },
            ]}
            values={{ status: filter }}
            onChange={(key, value) => {
              if (key === 'status' && !Array.isArray(value)) setFilter(value as ProductFilter);
            }}
          />
        </View>
      </View>
      {loadingProducts ? <LoadingState message="Loading products..." style={{ flex: 1 }} /> : (
        <FlatList
          data={products}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <View
              testID={`admin-product-card-${item.id}`}
              accessibilityLabel={`admin-product-card-${item.id}`}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.cardRow}>
                <TouchableOpacity disabled={!item.cover_image_url && !item.primary_image} accessibilityRole="button" accessibilityLabel={`View image of ${item.title}`} onPress={() => setPreviewUri(resolveAdminMediaUrl(item.cover_image_url || item.primary_image, 'listings'))} style={[styles.thumbnail, { backgroundColor: colors.surface }]}>
                  {item.cover_image_url || item.primary_image ? <Image source={{ uri: resolveAdminMediaUrl(item.cover_image_url || item.primary_image, 'listings') }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : <Ionicons name="storefront-outline" size={30} color={colors.textSecondary} />}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'Poppins_600SemiBold' }} numberOfLines={isCompact ? 2 : 1}>{item.title}</Text>
                  <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Poppins_700Bold', marginTop: 2 }}>PHP {Number(item.price || 0).toFixed(2)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>Seller: {item.seller_name || item.seller_id?.slice(0, 8)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 }}>Type: {item.product_type}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: item.status === 'active' ? '#22c55e15' : colors.surface }]}><Text style={{ color: item.status === 'active' ? '#16a34a' : colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_600SemiBold', textTransform: 'capitalize' }}>{item.status}</Text></View>
              </View>
              <View style={styles.actionRow}>
                {item.status !== 'suspended' && (
                  <TouchableOpacity
                    activeOpacity={1}
                    testID={`admin-product-suspend-${item.id}`}
                    accessibilityLabel={`admin-product-suspend-${item.id}`}
                    style={[styles.actionBtn, { backgroundColor: '#ef444420' }]}
                    onPress={() => handleSuspend(item.id)}
                  >
                    <Text style={{ color: '#ef4444', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Suspend</Text>
                  </TouchableOpacity>
                )}
                {item.status === 'suspended' && (
                  <TouchableOpacity
                    activeOpacity={1}
                    testID={`admin-product-activate-${item.id}`}
                    accessibilityLabel={`admin-product-activate-${item.id}`}
                    style={[styles.actionBtn, { backgroundColor: '#22c55e20' }]}
                    onPress={() => handleActivate(item.id)}
                  >
                    <Text style={{ color: '#22c55e', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Activate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={error ? <View style={styles.centered}><Text accessibilityRole="alert" style={{ color: '#ef4444' }}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void fetchProducts()} style={styles.actionBtn}><Text style={{ color: colors.primary }}>Retry</Text></TouchableOpacity></View> : <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 40 }}>No products found</Text>}
        />
      )}
      <InAppMediaViewer visible={!!previewUri} uri={previewUri} title="Product image" onClose={() => setPreviewUri(null)} />
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
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  actionBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
});
