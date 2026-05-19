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
import { getEdgeFunctionErrorMessage } from '../../src/utils/edgeFunctionErrors';

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

const normalizeStationTestId = (value: unknown) => {
  return String(value || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
};

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error && error.message ? error.message : fallback;
};

export default function AdminStationsPage() {
  const { colors, isDark } = useTheme();
  const { loading, isAdmin, roleResolved } = useAuth();

  const [stations, setStations] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [stationActionMessage, setStationActionMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stationFilter, setStationFilter] = useState<StationFilter>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sourcePickerVisible, setSourcePickerVisible] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [editingSource, setEditingSource] = useState<any | null>(null);
  const [stationName, setStationName] = useState('');
  const [stationDescription, setStationDescription] = useState('');
  const [stationGenre, setStationGenre] = useState('');
  const [rotationMinutes, setRotationMinutes] = useState('15');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamStatus, setStreamStatus] = useState<'offline' | 'live' | 'autoplay'>('offline');
  const [nowPlayingTitle, setNowPlayingTitle] = useState('');
  const [nowPlayingArtist, setNowPlayingArtist] = useState('');
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);

  const invokePlaylistAction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-playlists', { body });

    if (error) {
      throw new Error(await getEdgeFunctionErrorMessage(error, 'Unable to reach playlist admin tools.'));
    }

    if (data?.error) throw new Error(String(data.error));

    return data?.data;
  }, []);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    setStationActionMessage(null);
    const [stationResult, sourceResult] = await Promise.allSettled([
      invokePlaylistAction({ action: 'admin_list_stations' }),
      invokePlaylistAction({ action: 'admin_list_station_sources' }),
    ]);

    const nextErrors: string[] = [];

    if (stationResult.status === 'fulfilled') {
      const stationRows = stationResult.value;
      setStations(Array.isArray(stationRows) ? stationRows : []);
    } else {
      console.error('Admin station list fetch failed:', stationResult.reason);
      nextErrors.push(getErrorMessage(stationResult.reason, 'Unable to load station data.'));
      setStations([]);
    }

    if (sourceResult.status === 'fulfilled') {
      const sourceRows = sourceResult.value;
      setSources(Array.isArray(sourceRows) ? sourceRows : []);
    } else {
      console.error('Admin station source fetch failed:', sourceResult.reason);
      nextErrors.push(getErrorMessage(sourceResult.reason, 'Unable to load station source data.'));
      setSources([]);
    }

    setDataError(nextErrors.length > 0 ? nextErrors.join(' ') : null);
    setLoadingData(false);
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

  const manualStationSources = useMemo(() => {
    return sources.filter((source) => (
      !source?.station?.id &&
      Array.isArray(source?.playlists) &&
      source.playlists.length > 0
    ));
  }, [sources]);

  const filteredManualStationSources = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    if (!query) return manualStationSources;

    return manualStationSources.filter((source) => {
      const playlistTitles = Array.isArray(source?.playlists)
        ? source.playlists.map((playlist: any) => playlist?.title)
        : [];

      return [
        source?.name,
        source?.genre,
        source?.kind,
        ...playlistTitles,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [manualStationSources, sourceSearch]);

  const hasStations = stations.length > 0;
  const hasEligibleStationSources = manualStationSources.length > 0;
  const isStationEditorReady = selectedPlaylistIds.length > 0;
  const addStationDisabled = loadingData;
  const autoCreateDisabled = loadingData || !!dataError || busyKey === 'auto-create';

  const openSourceEditor = useCallback((source: any) => {
    setStationActionMessage(null);
    setSourcePickerVisible(false);
    setSourceSearch('');
    setEditingSource(source);
    setStationName(source?.station?.name || `${source?.name || 'Artist'} Radio`);
    setStationDescription(source?.station?.description || '');
    setStationGenre(source?.station?.genre || source?.genre || '');
    setRotationMinutes(String(source?.station?.rotation_interval_minutes || 15));
    setStreamUrl(source?.station?.stream_url || '');
    setStreamStatus(
      ['offline', 'live', 'autoplay'].includes(source?.station?.stream_status)
        ? source.station.stream_status
        : 'offline',
    );
    setNowPlayingTitle(source?.station?.now_playing_title || '');
    setNowPlayingArtist(source?.station?.now_playing_artist || '');
    setSelectedPlaylistIds(getDefaultSelectedPlaylistIds(source));
  }, []);

  const openAddStation = useCallback(() => {
    if (loadingData) {
      return;
    }

    if (dataError) {
      setStationActionMessage(dataError);
      return;
    }

    setStationActionMessage(null);
    setSourceSearch('');
    setSourcePickerVisible(true);
  }, [dataError, loadingData]);

  const closeSourcePicker = useCallback(() => {
    setSourcePickerVisible(false);
    setSourceSearch('');
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
        stream_url: streamUrl.trim() || null,
        stream_status: streamStatus,
        now_playing_title: nowPlayingTitle.trim() || null,
        now_playing_artist: nowPlayingArtist.trim() || null,
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
    nowPlayingArtist,
    nowPlayingTitle,
    rotationMinutes,
    selectedPlaylistIds,
    stationDescription,
    stationGenre,
    stationName,
    streamStatus,
    streamUrl,
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
    if (loadingData) return;

    if (dataError) {
      setStationActionMessage(dataError);
      return;
    }

    if (manualStationSources.length === 0) {
      setStationActionMessage('All public playlist owners already have stations, or there are no public playlists to use.');
      return;
    }

    setStationActionMessage(null);
    setBusyKey('auto-create');
    try {
      const result = await invokePlaylistAction({ action: 'admin_auto_create_stations' });
      await fetchData();
      const createdCount = Number(result?.created_count || 0);
      Alert.alert(
        createdCount > 0 ? 'Auto stations created' : 'No stations created',
        createdCount > 0
          ? `${createdCount} station${createdCount === 1 ? '' : 's'} created.`
          : 'No eligible playlist owners needed a new station.',
      );
    } catch (error) {
      console.error('Admin station auto-create failed:', error);
      Alert.alert('Unable to auto-create stations', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  }, [dataError, fetchData, invokePlaylistAction, loadingData, manualStationSources.length]);

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
        <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Existing Stations</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Live stations appear in the user feed radio playlist.
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              testID="admin-stations-add-button"
              accessibilityLabel="admin-stations-add-button"
              activeOpacity={1}
              disabled={addStationDisabled}
              onPress={openAddStation}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: addStationDisabled ? 0.6 : 1 }]}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Add Station</Text>
            </TouchableOpacity>

            {hasEligibleStationSources ? (
              <TouchableOpacity
                testID="admin-stations-auto-create-button"
                accessibilityLabel="admin-stations-auto-create-button"
                activeOpacity={1}
                disabled={autoCreateDisabled}
                onPress={autoCreateStations}
                style={[styles.secondaryBtn, { borderColor: colors.border, opacity: autoCreateDisabled ? 0.55 : 1 }]}
              >
                {busyKey === 'auto-create' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="sparkles-outline" size={17} color={colors.primary} />
                )}
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>Auto Create</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {hasStations ? (
          <>
            <TextInput
              testID="admin-stations-search-input"
              accessibilityLabel="admin-stations-search-input"
              value={search}
              onChangeText={setSearch}
              placeholder="Search by station name, genre, or location..."
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
          </>
        ) : null}

        {loadingData ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {dataError ? (
              <View
                testID="admin-stations-load-error"
                accessibilityLabel="admin-stations-load-error"
                style={[styles.errorBanner, { borderColor: '#EF4444', backgroundColor: '#EF444420' }]}
              >
                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>
                  {dataError}
                </Text>
              </View>
            ) : null}

            {stationActionMessage ? (
              <View
                testID="admin-stations-action-message"
                accessibilityLabel="admin-stations-action-message"
                style={[styles.infoBanner, { borderColor: colors.border, backgroundColor: colors.primary + '14' }]}
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>
                  {stationActionMessage}
                </Text>
              </View>
            ) : null}

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
                {item.stream_url ? (
                  <Text style={{ color: item.stream_status === 'live' ? '#22C55E' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                    Stream {item.stream_status || 'offline'}
                  </Text>
                ) : null}
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
              hasStations ? (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 28 }}>
                  No stations match your filters.
                </Text>
              ) : (
                <View
                  testID="admin-stations-empty-state"
                  accessibilityLabel="admin-stations-empty-state"
                  style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Ionicons name="radio-outline" size={34} color={colors.primary} />
                  <Text
                    testID="admin-stations-empty-title"
                    accessibilityLabel="admin-stations-empty-title"
                    style={[styles.emptyTitle, { color: colors.text }]}
                  >
                    No stations yet
                  </Text>
                  <Text
                    testID="admin-stations-empty-description"
                    accessibilityLabel="admin-stations-empty-description"
                    style={[styles.emptyDescription, { color: colors.textSecondary }]}
                  >
                    {hasEligibleStationSources
                      ? 'Create your first station manually or generate one automatically.'
                      : 'Create a public musician or group playlist first, then add it as a station.'}
                  </Text>
                  <View style={styles.emptyActions}>
                    <TouchableOpacity
                      testID="admin-stations-empty-add-button"
                      accessibilityLabel="admin-stations-empty-add-button"
                      activeOpacity={1}
                      disabled={addStationDisabled}
                      onPress={openAddStation}
                      style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: addStationDisabled ? 0.6 : 1 }]}
                    >
                      <Ionicons name="add" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>Add Station</Text>
                    </TouchableOpacity>
                    {hasEligibleStationSources ? (
                      <TouchableOpacity
                        testID="admin-stations-empty-auto-create-button"
                        accessibilityLabel="admin-stations-empty-auto-create-button"
                        activeOpacity={1}
                        disabled={autoCreateDisabled}
                        onPress={autoCreateStations}
                        style={[styles.secondaryBtn, { borderColor: colors.border, opacity: autoCreateDisabled ? 0.55 : 1 }]}
                      >
                        {busyKey === 'auto-create' ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Ionicons name="sparkles-outline" size={17} color={colors.primary} />
                        )}
                        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>Auto Create</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={sourcePickerVisible} animationType="fade" transparent onRequestClose={closeSourcePicker}>
        <View style={styles.modalBackdrop}>
          <View
            testID="admin-station-source-picker-modal"
            accessibilityLabel="admin-station-source-picker-modal"
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>
                  Add Station
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Choose a playlist owner to turn into a live station.
                </Text>
              </View>
              <TouchableOpacity
                testID="admin-station-source-picker-close-button"
                accessibilityLabel="admin-station-source-picker-close-button"
                activeOpacity={1}
                onPress={closeSourcePicker}
                style={styles.iconButton}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.modalSearchBox, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
              <TextInput
                testID="admin-station-source-search-input"
                accessibilityLabel="admin-station-source-search-input"
                value={sourceSearch}
                onChangeText={setSourceSearch}
                placeholder="Search playlist owners or playlists"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.modalSearchInput, { color: colors.text }]}
              />
              {sourceSearch.trim().length > 0 ? (
                <TouchableOpacity
                  testID="admin-station-source-search-clear-button"
                  accessibilityLabel="admin-station-source-search-clear-button"
                  activeOpacity={1}
                  onPress={() => setSourceSearch('')}
                  style={styles.searchClearButton}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView style={styles.sourcePicker}>
              {filteredManualStationSources.length > 0 ? (
                filteredManualStationSources.map((source) => {
                  const sourceKey = source?.key || `${source?.kind || 'source'}:${source?.id || ''}`;
                  return (
                    <TouchableOpacity
                      key={sourceKey}
                      testID={`admin-station-source-${normalizeStationTestId(sourceKey)}`}
                      accessibilityLabel={`admin-station-source-${normalizeStationTestId(sourceKey)}`}
                      activeOpacity={1}
                      onPress={() => openSourceEditor(source)}
                      style={[styles.sourceOption, { borderColor: colors.border }]}
                    >
                      <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
                        <Ionicons name={source?.kind === 'group' ? 'people-outline' : 'person-outline'} size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
                          {source?.name || 'Untitled source'}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {source?.genre || source?.kind || 'Music'} - {source?.playlist_count || 0} playlist{source?.playlist_count === 1 ? '' : 's'} - {source?.track_count || 0} track{source?.track_count === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View
                  testID="admin-station-source-picker-empty"
                  accessibilityLabel="admin-station-source-picker-empty"
                  style={[styles.sourceEmpty, { borderColor: colors.border, backgroundColor: colors.primary + '10' }]}
                >
                  <Ionicons name="musical-notes-outline" size={28} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 8 }}>
                    {manualStationSources.length > 0 ? 'No matching sources' : 'No eligible playlist sources'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 5, lineHeight: 19 }}>
                    {manualStationSources.length > 0
                      ? 'Try a source name, genre, kind, or playlist title.'
                      : 'Create a public musician or group playlist first, then add it as a station.'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Station name</Text>
              <TextInput
                testID="admin-station-name-input"
                accessibilityLabel="admin-station-name-input"
                value={stationName}
                onChangeText={setStationName}
                placeholder="Station name"
                placeholderTextColor={colors.textSecondary}
                style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
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
            </View>
            <View style={styles.modalInputRow}>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Genre</Text>
                <TextInput
                  testID="admin-station-genre-input"
                  accessibilityLabel="admin-station-genre-input"
                  value={stationGenre}
                  onChangeText={setStationGenre}
                  placeholder="Genre"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Rotation minutes</Text>
                <TextInput
                  testID="admin-station-rotation-input"
                  accessibilityLabel="admin-station-rotation-input"
                  value={rotationMinutes}
                  onChangeText={setRotationMinutes}
                  placeholder="Minutes"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Continuous stream URL</Text>
              <TextInput
                testID="admin-station-stream-url-input"
                accessibilityLabel="admin-station-stream-url-input"
                value={streamUrl}
                onChangeText={setStreamUrl}
                placeholder="https://your-radio.example/live"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="url"
                style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Stream status</Text>
              <View style={styles.statusSelectorRow}>
                {(['offline', 'live', 'autoplay'] as const).map((status) => {
                  const selected = streamStatus === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      activeOpacity={1}
                      onPress={() => setStreamStatus(status)}
                      style={[
                        styles.statusSelectorButton,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.primary : (isDark ? '#0F172A' : '#F8FAFC'),
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>
                        {status}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.modalInputRow}>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Now playing title</Text>
                <TextInput
                  value={nowPlayingTitle}
                  onChangeText={setNowPlayingTitle}
                  placeholder="Optional"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Now playing artist</Text>
                <TextInput
                  value={nowPlayingArtist}
                  onChangeText={setNowPlayingArtist}
                  placeholder="Optional"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
                />
              </View>
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
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  sectionHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
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
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  actionBtn: {
    minHeight: 32,
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  infoBanner: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    padding: 22,
    marginTop: 18,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 10 },
  emptyDescription: { fontSize: 13, textAlign: 'center', marginTop: 5, lineHeight: 19 },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 16 },
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
  modalSearchBox: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    paddingVertical: 9,
  },
  searchClearButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourcePicker: { maxHeight: 420 },
  sourceEmpty: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  sourceOption: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
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
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  halfField: { flex: 1 },
  statusSelectorRow: { flexDirection: 'row', gap: 8 },
  statusSelectorButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
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
