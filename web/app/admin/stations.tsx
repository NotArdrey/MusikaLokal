import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Header from '../../src/components/header';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';

type StationFilter = 'all' | 'live' | 'offline' | 'featured';

const getProfileName = (profile: any) => {
  const name = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
  return name || 'Unknown profile';
};

const getStationOwner = (station: any) => {
  return station?.managed_group || station?.managed_profile || station?.creator || null;
};

const getOwnerName = (owner: any) => {
  const name = typeof owner?.name === 'string' ? owner.name.trim() : '';
  return name || getProfileName(owner);
};

const getDefaultSelectedPlaylistIds = (source: any) => {
  const stationPlaylistIds = Array.isArray(source?.station?.slot_playlist_ids)
    ? source.station.slot_playlist_ids
    : [];

  if (stationPlaylistIds.length > 0) {
    return stationPlaylistIds;
  }

  return Array.isArray(source?.playlists)
    ? source.playlists
        .map((playlist: any) => (typeof playlist?.id === 'string' ? playlist.id : ''))
        .filter(Boolean)
    : [];
};

export default function AdminStationsPage() {
  const { colors, isDark } = useTheme();
  const { loading, isAdmin, roleResolved } = useAuth();

  const [stations, setStations] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState('');
  const [stationFilter, setStationFilter] = useState<StationFilter>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<any | null>(null);
  const [stationName, setStationName] = useState('');
  const [stationDescription, setStationDescription] = useState('');
  const [stationGenre, setStationGenre] = useState('');
  const [rotationMinutes, setRotationMinutes] = useState('15');
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);

  const invokePlaylistAction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-playlists', { body });

    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));

    return data?.data;
  }, []);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [stationRows, sourceRows] = await Promise.all([
        invokePlaylistAction({ action: 'admin_list_stations' }),
        invokePlaylistAction({ action: 'admin_list_station_sources' }),
      ]);

      setStations(Array.isArray(stationRows) ? stationRows : []);
      setSources(Array.isArray(sourceRows) ? sourceRows : []);
    } catch (error) {
      console.error('Admin stations fetch failed:', error);
      setStations([]);
      setSources([]);
    } finally {
      setLoadingData(false);
    }
  }, [invokePlaylistAction]);

  useEffect(() => {
    if (!loading && roleResolved && isAdmin) {
      fetchData();
    }
  }, [fetchData, isAdmin, loading, roleResolved]);

  const visibleStations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return stations.filter((station) => {
      if (stationFilter === 'live' && station.is_active === false) return false;
      if (stationFilter === 'offline' && station.is_active !== false) return false;
      if (stationFilter === 'featured' && station.is_featured !== true) return false;

      if (!query) return true;

      const owner = getStationOwner(station);
      return [
        station.name,
        station.description,
        station.genre,
        getOwnerName(owner),
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [search, stationFilter, stations]);

  const sourceByStationId = useMemo(() => {
    const result = new Map<string, any>();
    for (const source of sources) {
      const stationId = typeof source?.station?.id === 'string' ? source.station.id : '';
      if (stationId) {
        result.set(stationId, source);
      }
    }
    return result;
  }, [sources]);
  const isStationEditorReady = selectedPlaylistIds.length > 0;

  const openSourceEditor = useCallback((source: any) => {
    setEditingSource(source);
    setStationName(source?.station?.name || `${source?.name || 'Artist'} Radio`);
    setStationDescription(source?.station?.description || '');
    setStationGenre(source?.station?.genre || source?.genre || '');
    setRotationMinutes(String(source?.station?.rotation_interval_minutes || 15));
    setSelectedPlaylistIds(getDefaultSelectedPlaylistIds(source));
  }, []);

  const closeEditor = useCallback(() => {
    setEditingSource(null);
    setSelectedPlaylistIds([]);
  }, []);

  const togglePlaylist = useCallback((playlistId: string) => {
    setSelectedPlaylistIds((current) => (
      current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId]
    ));
  }, []);

  const saveStation = useCallback(async () => {
    if (!editingSource?.id) return;
    if (selectedPlaylistIds.length === 0) {
      Alert.alert('Select playlists', 'Choose at least one playlist for this station.');
      return;
    }

    const sourceKey = editingSource.key || `${editingSource.kind}:${editingSource.id}`;
    setBusyKey(sourceKey);
    try {
      await invokePlaylistAction({
        action: 'admin_upsert_station_from_source',
        source_kind: editingSource.kind,
        source_id: editingSource.id,
        name: stationName.trim() || `${editingSource.name || 'Artist'} Radio`,
        description: stationDescription.trim() || null,
        genre: stationGenre.trim() || null,
        cover_image_url: editingSource.cover_image_url || null,
        rotation_interval_minutes: Number(rotationMinutes) || 15,
        playlist_ids: selectedPlaylistIds,
        is_active: editingSource.station?.is_active !== false,
      });

      closeEditor();
      await fetchData();
    } catch (error) {
      console.error('Admin station save failed:', error);
      Alert.alert('Unable to save station', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [
    closeEditor,
    editingSource,
    fetchData,
    invokePlaylistAction,
    rotationMinutes,
    selectedPlaylistIds,
    stationDescription,
    stationGenre,
    stationName,
  ]);

  const updateStationFlag = useCallback(async (
    stationId: string,
    patch: { is_active?: boolean; is_featured?: boolean },
  ) => {
    setBusyKey(stationId);
    try {
      await invokePlaylistAction({ action: 'update_station', station_id: stationId, ...patch });
      await fetchData();
    } catch (error) {
      console.error('Admin station update failed:', error);
      Alert.alert('Unable to update station', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [fetchData, invokePlaylistAction]);

  const performDeleteStation = useCallback(async (stationId: string) => {
    setBusyKey(stationId);
    try {
      await invokePlaylistAction({ action: 'delete_station', station_id: stationId });
      await fetchData();
    } catch (error) {
      console.error('Admin station delete failed:', error);
      Alert.alert('Unable to delete station', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [fetchData, invokePlaylistAction]);

  const deleteStation = useCallback((stationId: string) => {
    if (process.env.EXPO_PUBLIC_E2E === '1') {
      void performDeleteStation(stationId);
      return;
    }

    Alert.alert('Delete station?', 'This removes the station and its playlist rotation from the user feed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void performDeleteStation(stationId),
      },
    ]);
  }, [performDeleteStation]);

  const autoCreateStations = useCallback(async () => {
    setBusyKey('auto-create');
    try {
      const result = await invokePlaylistAction({ action: 'admin_auto_create_stations' });
      await fetchData();
      Alert.alert(
        'Auto stations created',
        `${result?.created_count || 0} station${result?.created_count === 1 ? '' : 's'} created.`,
      );
    } catch (error) {
      console.error('Admin station auto-create failed:', error);
      Alert.alert('Unable to auto-create stations', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [fetchData, invokePlaylistAction]);

  if (loading || !roleResolved) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Admin" hideBackButton />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Admin" hideBackButton />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary }}>Access denied</Text>
        </View>
      </View>
    );
  }

  const editorBusy = editingSource ? busyKey === (editingSource.key || `${editingSource.kind}:${editingSource.id}`) : false;

  return (
    <View
      testID="admin-stations-page"
      accessibilityLabel="admin-stations-page"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Header title="Admin" hideBackButton />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <TextInput
            testID="admin-stations-search-input"
            accessibilityLabel="admin-stations-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search stations..."
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.searchInput,
              {
                color: colors.text,
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          />

          <TouchableOpacity
            testID="admin-stations-auto-create-button"
            accessibilityLabel="admin-stations-auto-create-button"
            activeOpacity={1}
            disabled={busyKey === 'auto-create'}
            onPress={autoCreateStations}
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busyKey === 'auto-create' ? 0.7 : 1 }]}
          >
            {busyKey === 'auto-create' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="sparkles-outline" size={17} color="#FFFFFF" />
            )}
            <Text style={styles.primaryBtnText}>Auto Create</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Existing Stations</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Live stations appear in the user feed radio playlist.
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', 'live', 'offline', 'featured'] as StationFilter[]).map((nextFilter) => (
            <TouchableOpacity
              key={nextFilter}
              activeOpacity={1}
              onPress={() => setStationFilter(nextFilter)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: stationFilter === nextFilter ? colors.primary : colors.card,
                  borderColor: stationFilter === nextFilter ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={{ color: stationFilter === nextFilter ? '#FFFFFF' : colors.text, fontSize: 13, textTransform: 'capitalize' }}>
                {nextFilter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loadingData ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {visibleStations.map((item) => {
              const owner = getStationOwner(item);
              const isBusy = busyKey === item.id;
              const isLive = item.is_active !== false;
              const source = sourceByStationId.get(item.id);

              return (
                <View
                  key={item.id}
                  testID={`admin-station-card-${item.id}`}
                  accessibilityLabel={`admin-station-card-${item.id}`}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
              <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, { backgroundColor: isLive ? colors.primary + '18' : (isDark ? '#334155' : '#E5E7EB') }]}>
                  <Ionicons name="radio-outline" size={22} color={isLive ? colors.primary : colors.textSecondary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                    {item.name || 'Untitled station'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {getOwnerName(owner)}{item.genre ? ` - ${item.genre}` : ''}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isLive ? '#22C55E20' : '#64748B20' }]}>
                  <Text style={{ color: isLive ? '#22C55E' : colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                    {isLive ? 'LIVE' : 'OFFLINE'}
                  </Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {item.slot_count} playlist{item.slot_count === 1 ? '' : 's'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {item.rotation_interval_minutes || 15} min rotation
                </Text>
                {item.is_featured ? (
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Featured</Text>
                ) : null}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  testID={`admin-station-toggle-active-${item.id}`}
                  accessibilityLabel={`admin-station-toggle-active-${item.id}`}
                  activeOpacity={1}
                  disabled={isBusy}
                  style={[styles.actionBtn, { backgroundColor: isLive ? '#EF444420' : '#22C55E20' }]}
                  onPress={() => updateStationFlag(item.id, { is_active: !isLive })}
                >
                  <Text style={{ color: isLive ? '#EF4444' : '#22C55E', fontSize: 12, fontWeight: '700' }}>
                    {isBusy ? 'Saving...' : isLive ? 'Deactivate' : 'Activate'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID={`admin-station-toggle-featured-${item.id}`}
                  accessibilityLabel={`admin-station-toggle-featured-${item.id}`}
                  activeOpacity={1}
                  disabled={isBusy}
                  style={[styles.actionBtn, { backgroundColor: item.is_featured ? '#F59E0B20' : colors.primary + '18' }]}
                  onPress={() => updateStationFlag(item.id, { is_featured: !item.is_featured })}
                >
                  <Text style={{ color: item.is_featured ? '#D97706' : colors.primary, fontSize: 12, fontWeight: '700' }}>
                    {item.is_featured ? 'Unfeature' : 'Feature'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID={`admin-station-open-${item.id}`}
                  accessibilityLabel={`admin-station-open-${item.id}`}
                  activeOpacity={1}
                  style={[styles.actionBtn, { backgroundColor: isDark ? '#0F172A' : '#F3F4F6' }]}
                  onPress={() => router.push({ pathname: '/station_details' as any, params: { station_id: item.id } })}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Open</Text>
                </TouchableOpacity>

                {source ? (
                  <TouchableOpacity
                    testID={`admin-station-edit-${item.id}`}
                    accessibilityLabel={`admin-station-edit-${item.id}`}
                    activeOpacity={1}
                    style={[styles.actionBtn, { backgroundColor: colors.primary + '18' }]}
                    onPress={() => openSourceEditor(source)}
                  >
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Edit</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  testID={`admin-station-delete-${item.id}`}
                  accessibilityLabel={`admin-station-delete-${item.id}`}
                  activeOpacity={1}
                  disabled={isBusy}
                  style={[styles.actionBtn, { backgroundColor: '#EF444420' }]}
                  onPress={() => deleteStation(item.id)}
                >
                  <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Delete</Text>
                </TouchableOpacity>
              </View>
                </View>
              );
            })}

            {visibleStations.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 28 }}>
                No stations found
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={!!editingSource} animationType="fade" transparent onRequestClose={closeEditor}>
        <View style={styles.modalBackdrop}>
          <View
            testID="admin-station-editor-modal"
            accessibilityLabel="admin-station-editor-modal"
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>
                  {editingSource?.station?.id ? 'Edit Station' : 'Make Station'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {editingSource?.name || ''}
                </Text>
              </View>
              <TouchableOpacity
                testID="admin-station-editor-close-button"
                accessibilityLabel="admin-station-editor-close-button"
                activeOpacity={1}
                onPress={closeEditor}
                style={styles.iconButton}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              testID="admin-station-name-input"
              accessibilityLabel="admin-station-name-input"
              value={stationName}
              onChangeText={setStationName}
              placeholder="Station name"
              placeholderTextColor={colors.textSecondary}
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
            />
            <TextInput
              testID="admin-station-description-input"
              accessibilityLabel="admin-station-description-input"
              value={stationDescription}
              onChangeText={setStationDescription}
              placeholder="Description"
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.modalInput, styles.descriptionInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
            />
            <View style={styles.modalInputRow}>
              <TextInput
                testID="admin-station-genre-input"
                accessibilityLabel="admin-station-genre-input"
                value={stationGenre}
                onChangeText={setStationGenre}
                placeholder="Genre"
                placeholderTextColor={colors.textSecondary}
                style={[styles.modalInput, styles.halfInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
              />
              <TextInput
                testID="admin-station-rotation-input"
                accessibilityLabel="admin-station-rotation-input"
                value={rotationMinutes}
                onChangeText={setRotationMinutes}
                placeholder="Minutes"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                style={[styles.modalInput, styles.halfInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
              />
            </View>

            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6, marginBottom: 8 }}>
              Station playlists
            </Text>
            <ScrollView style={styles.playlistPicker}>
              {(editingSource?.playlists || []).map((playlist: any) => {
                const selected = selectedPlaylistIds.includes(playlist.id);
                return (
                  <TouchableOpacity
                    testID={`admin-station-playlist-${playlist.id}`}
                    accessibilityLabel={`admin-station-playlist-${playlist.id}`}
                    key={playlist.id}
                    activeOpacity={1}
                    onPress={() => togglePlaylist(playlist.id)}
                    style={[styles.playlistOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '14' : 'transparent' }]}
                  >
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? colors.primary : colors.textSecondary} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                        {playlist.title || 'Untitled playlist'}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                        {playlist.track_count || 0} track{playlist.track_count === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                testID="admin-station-editor-cancel-button"
                accessibilityLabel="admin-station-editor-cancel-button"
                activeOpacity={1}
                onPress={closeEditor}
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="admin-station-editor-save-button"
                accessibilityLabel="admin-station-editor-save-button"
                activeOpacity={1}
                disabled={editorBusy || !isStationEditorReady}
                onPress={saveStation}
                style={[styles.primaryBtn, { backgroundColor: isStationEditorReady ? colors.primary : colors.border, opacity: editorBusy ? 0.7 : 1 }]}
              >
                {editorBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="save-outline" size={17} color={isStationEditorReady ? "#FFFFFF" : colors.textSecondary} />}
                <Text style={[styles.primaryBtnText, { color: isStationEditorReady ? "#FFFFFF" : colors.textSecondary }]}>Save Station</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 100 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  primaryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  secondaryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionSub: { fontSize: 12, marginTop: 3 },
  filterRow: { paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  card: { padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 7 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  descriptionInput: { minHeight: 70, textAlignVertical: 'top' },
  modalInputRow: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
  playlistPicker: { maxHeight: 260 },
  playlistOption: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
});
