import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { InteractionManager, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import CachedImage from '../../src/components/CachedImage';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import Header from '../../src/components/header';
import InlineErrorBanner from '../../src/components/InlineErrorBanner';
import Modal, { normalizeConfirmationInput } from '../../src/components/modal';
import MusicianWorkspaceTabs from '../../src/components/MusicianWorkspaceTabs';
import Navbar from '../../src/components/navbar';
import Skeleton from '../../src/components/Skeleton';
import { useBottomBarClearance } from '../../src/hooks/useBottomBarClearance';
import { useAuth, useRequireAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { getActionErrorMessage, getResultErrorMessage, logActionError } from '../../src/utils/actionError';
import { invalidateListingCaches } from '../../src/utils/listingCacheInvalidation';
import { getStaffPermissions } from '../../src/utils/staffAccess';

type TeamRecord = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  member_role: string;
  staff_access_level?: number | null;
  created_at: string;
};

export default function MyProductionScreen() {
  const { colors } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
  const { userRole } = useAuth();
  const isMusicianView = userRole === 'musician';
  const params = useLocalSearchParams<{ refresh?: string }>();
  const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;

  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ type: AlertType; title: string; message: string; buttons?: any[] }>({
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = useCallback((type: AlertType, title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  }, []);

  const invokeProduction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-production', { body });
    if (error) {
      const status = Number((error as any)?.status || (error as any)?.context?.status || 0);
      logActionError('MyProduction', 'manage-production invoke', error, { body });

      if ([502, 503, 504].includes(status)) {
        const transientError = new Error('Production services are temporarily unavailable. Please try again.');
        (transientError as any).status = status;
        throw transientError;
      }

      throw error;
    }
    return data;
  }, []);

  const fetchTeams = useCallback(async (options?: { showAlertOnError?: boolean }) => {
    if (!userId) return;
    setLoadError(null);

    try {
      const data = await invokeProduction({ action: 'list_my_teams' });
      setTeams((data?.teams || []) as TeamRecord[]);
    } catch (error: any) {
      const message = getActionErrorMessage(error, 'Failed to fetch production teams.');
      logActionError('MyProduction', 'fetchTeams', error, { userId });
      setLoadError(message);
      if (options?.showAlertOnError) {
        showAlert('error', 'Could Not Load Production Teams', message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [invokeProduction, showAlert, userId]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading || !isAuthenticated || !userId) return;

      let isActive = true;
      let fetchStarted = false;
      const startFetch = () => {
        if (!isActive || fetchStarted) return;
        fetchStarted = true;
        setLoading(true);
        void fetchTeams();
      };

      startFetch();
      const focusTask = InteractionManager.runAfterInteractions(startFetch);
      const fallbackTimer = setTimeout(startFetch, 800);

      return () => {
        isActive = false;
        focusTask.cancel();
        clearTimeout(fallbackTimer);
      };
    }, [authLoading, fetchTeams, isAuthenticated, refreshKey, userId]),
  );

  const closeDeleteModal = () => {
    setModalVisible(false);
    setSelectedTeamId(null);
    setSelectedTeamName('');
    setDeleteConfirmationText('');
  };

  const confirmDelete = (teamId: string, teamName: string) => {
    setSelectedTeamId(teamId);
    setSelectedTeamName(teamName || '');
    setDeleteConfirmationText('');
    setModalVisible(true);
  };

  const isDeleteConfirmed =
    normalizeConfirmationInput(deleteConfirmationText) ===
    normalizeConfirmationInput(selectedTeamName);

  const handleDelete = async () => {
    if (!selectedTeamId || deleting) return;
    if (!isDeleteConfirmed) {
      showAlert('warning', 'Confirmation Needed', `Please type "${selectedTeamName}" exactly to confirm deletion.`);
      return;
    }

    setDeleting(true);
    try {
      const data = await invokeProduction({ action: 'delete_production_team', team_id: selectedTeamId });
      if (!data?.success) {
        throw new Error(getResultErrorMessage(data, 'Failed to delete production team.'));
      }

      setTeams((prev) => prev.filter((team) => team.id !== selectedTeamId));
      invalidateListingCaches(userId, ['bookings', 'details', 'home', 'search']);
      closeDeleteModal();
      showAlert('success', 'Production Team Deleted', 'Production team deleted successfully.');
    } catch (error: any) {
      const message = getActionErrorMessage(error, 'Failed to delete production team.');
      logActionError('MyProduction', 'delete production team', error, { teamId: selectedTeamId, userId });
      showAlert('error', 'Delete Failed', message);
    } finally {
      setDeleting(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void fetchTeams({ showAlertOnError: true });
  };

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="My Production" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {isMusicianView && (
            <MusicianWorkspaceTabs activeKey="producer" />
          )}

          <InlineErrorBanner
            message={loadError}
            onRetry={() => {
              if (teams.length === 0) setLoading(true);
              void fetchTeams({ showAlertOnError: true });
            }}
          />

          {loading ? (
            <View style={styles.skeletonList}>
              {[0, 1].map((index) => (
                <View key={`production-skeleton-${index}`} style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Skeleton width="100%" height={192} borderRadius={18} />
                  <Skeleton width="56%" height={22} style={{ marginTop: 14 }} />
                  <Skeleton width="100%" height={14} style={{ marginTop: 10 }} />
                  <Skeleton width="78%" height={14} style={{ marginTop: 6 }} />
                  <View style={styles.skeletonActionRow}>
                    <Skeleton width={124} height={40} borderRadius={12} />
                    <Skeleton width={40} height={40} borderRadius={12} />
                    <Skeleton width={40} height={40} borderRadius={12} />
                  </View>
                </View>
              ))}
            </View>
          ) : teams.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No production teams yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Create your first production team to manage members and gig partnerships.</Text>
            </View>
          ) : (
            teams.map((team) => {
              const isOwnerTeam = team.member_role === 'owner';
              const staffPermissions = team.staff_access_level ? getStaffPermissions(team.staff_access_level) : null;
              const canShowActions = !staffPermissions?.canViewOnly;
              const canEdit = !isMusicianView && (
                team.member_role === 'owner' ||
                team.member_role === 'manager' ||
                Boolean(staffPermissions?.canEditListing)
              );
              const canDelete = !isMusicianView && !staffPermissions && team.member_role === 'owner';
              const canOnlyViewAndChat = isMusicianView && !isOwnerTeam;
              const showManageAsView = canOnlyViewAndChat || Boolean(staffPermissions && !staffPermissions.canEditListing);

              return (
                <View
                  key={team.id}
                  testID={`mobile-production-card-${team.id}`}
                  accessibilityLabel={`mobile-production-card-${team.id}`}
                  style={[styles.cardContainer, { backgroundColor: colors.surface, shadowColor: colors.primary }]}
                >
                  <View style={styles.imageWrapper}>
                    {team.logo_url ? (
                      <CachedImage
                        uri={team.logo_url}
                        style={styles.cardImage}
                        width={420}
                        height={220}
                        quality={68}
                        priority="high"
                      />
                    ) : (
                      <View style={[styles.cardImage, styles.imagePlaceholder, { backgroundColor: colors.primary + '12' }]}>
                        <Ionicons name="people-outline" size={42} color={colors.primary} />
                      </View>
                    )}
                    <View style={[styles.roleBadge, { backgroundColor: colors.primary + '16' }]}>
                      <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{team.member_role}</Text>
                    </View>
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{team.name}</Text>
                    <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                      {team.description || 'No description added yet.'}
                    </Text>

                    {canShowActions ? (
                    <View style={[styles.actionRow, { borderColor: colors.border }]}> 
                      <View style={styles.actionLeft}>
                        <TouchableOpacity
                          activeOpacity={1}
                          testID={`mobile-production-manage-${team.id}`}
                          accessibilityLabel={`mobile-production-manage-${team.id}`}
                          onPress={() => router.push({ pathname: '/production_team', params: { teamId: team.id } })}
                          style={[styles.manageBtn, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name={showManageAsView ? 'eye-outline' : 'settings-outline'} size={18} color="#FFF" />
                          <Text style={styles.manageBtnText}>{showManageAsView ? 'View' : 'Manage'}</Text>
                        </TouchableOpacity>

                        {canOnlyViewAndChat ? (
                          <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => {
                              if (!team.owner_id) {
                                showAlert('warning', 'Chat Unavailable', 'Owner account is unavailable for this team.');
                                return;
                              }

                              router.push({
                                pathname: '/chat',
                                params: {
                                  recipientId: team.owner_id,
                                },
                              });
                            }}
                            style={[styles.editBtn, { borderColor: colors.border }]}
                          >
                            <Ionicons name="chatbubble-outline" size={20} color={colors.text} style={styles.editBtnIcon} />
                          </TouchableOpacity>
                        ) : null}

                        {canEdit ? (
                          <TouchableOpacity
                            activeOpacity={1}
                            testID={`mobile-production-edit-${team.id}`}
                            accessibilityLabel={`mobile-production-edit-${team.id}`}
                            onPress={() => router.push({ pathname: '/edit_production', params: { id: team.id } })}
                            style={[styles.editBtn, { borderColor: colors.border }]}
                          >
                            <Ionicons name="pencil-outline" size={20} color={colors.text} style={styles.editBtnIcon} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {canDelete ? (
                        <TouchableOpacity
                          activeOpacity={1}
                          testID={`mobile-production-delete-${team.id}`}
                          accessibilityLabel={`mobile-production-delete-${team.id}`}
                          onPress={() => confirmDelete(team.id, team.name)}
                          style={styles.deleteBtn}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={closeDeleteModal}
        title="Delete Production Team"
        message={deleting ? 'Deleting production team...' : `Type "${selectedTeamName}" to confirm deleting this production team.`}
        buttonText={deleting ? 'Deleting...' : 'Delete'}
        onConfirm={handleDelete}
        danger
        showInput
        inputMultiline={false}
        inputPlaceholder="Type team name"
        inputValue={deleteConfirmationText}
        onInputChange={setDeleteConfirmationText}
        requiredInputValue={selectedTeamName}
        confirmDisabled={!isDeleteConfirmed || deleting}
        loading={deleting}
        loadingMessage="Deleting production team..."
      />

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 180, paddingTop: 16 },
  pageTabsWrap: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 6,
  },
  pageTabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pageTabText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  skeletonList: { gap: 16 },
  skeletonCard: { borderRadius: 24, borderWidth: 1, padding: 16 },
  skeletonActionRow: { marginTop: 16, flexDirection: 'row', gap: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { marginTop: 16, fontFamily: 'Poppins_600SemiBold', fontSize: 20 },
  emptyText: { marginTop: 10, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
  cardContainer: { marginBottom: 24, borderRadius: 24, overflow: 'hidden', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16 },
  imageWrapper: { height: 192, position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  roleBadge: { position: 'absolute', top: 16, right: 16, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  roleBadgeText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'capitalize' },
  cardContent: { padding: 16 },
  cardTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 18, marginBottom: 4 },
  cardDescription: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, borderTopWidth: 1, paddingTop: 16 },
  actionLeft: { flexDirection: 'row', gap: 12 },
  manageBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  manageBtnText: { fontFamily: 'Poppins_500Medium', color: '#FFF' },
  editBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  editBtnIcon: { width: 20, height: 20, lineHeight: 20, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' },
  deleteBtn: { padding: 8 },
});

