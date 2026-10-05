import ManagedListingContent, { ManagedListingScreenProps } from "../../src/components/ManagedListingContent";
import ManageWorkspaceTabs from "../../src/components/ManageWorkspaceTabs";
import { ListingManagementStatus } from '../../src/utils/listingHistory';
import { managementCardStyles } from "../../src/theme/managementCards";
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { runAfterUIIdle } from '../../src/utils/idleTask';
import CachedImage from '../../src/components/CachedImage';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import Header from '../../src/components/header';
import InlineErrorBanner from '../../src/components/InlineErrorBanner';
import Modal, { normalizeConfirmationInput } from '../../src/components/modal';
import Navbar from '../../src/components/navbar';
import Skeleton from '../../src/components/Skeleton';
import { useBottomBarClearance } from '../../src/hooks/useBottomBarClearance';
import { useAuth, useRequireAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { getActionErrorMessage, getResultErrorMessage, logActionError } from '../../src/utils/actionError';
import { invalidateListingCaches } from '../../src/utils/listingCacheInvalidation';
import { fetchActiveStaffAssignments, getStaffPermissions, StaffEntityType } from '../../src/utils/staffAccess';
import { palette, typography } from '../../src/theme/tokens';

type TeamRecord = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  member_role: string;
  management_status: ListingManagementStatus;
  staff_access_level?: number | null;
  staff_can_edit_listing?: boolean;
  staff_can_add_listing?: boolean;
  staff_can_delete_listing?: boolean;
  created_at: string;
};

export default function MyProductionScreen({ historyOnly = false, embedded = false }: ManagedListingScreenProps = {}) {
  const { colors } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
  const { userRole } = useAuth();
  const isMusicianView = userRole === 'musician';
  const params = useLocalSearchParams<{ refresh?: string; deleteId?: string }>();
  const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
  const requestedDeleteId = Array.isArray(params.deleteId) ? params.deleteId[0] : params.deleteId;
  const processedDeleteIdRef = useRef<string | null>(null);

  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const visibleTeams = teams.filter((item) => historyOnly ? item.management_status === 'inactive' : !(item.management_status === 'inactive'));
  const [staffAddOwnerState, setStaffAddOwnerState] = useState<{
    userId: string;
    entityTypes: StaffEntityType[];
    ownerIds: string[];
  } | null>(null);
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
  }, [setAlertConfig, setAlertVisible]);

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
      const allActiveStaffAssignments = userRole === 'staff'
        ? await fetchActiveStaffAssignments(supabase, userId)
        : [];
      const activeProductionAssignments = allActiveStaffAssignments.filter(
        (assignment) => assignment.entity_type === 'production',
      );
      const activeWorkspaceTypes = Array.from(new Set(
        allActiveStaffAssignments.map((assignment) => assignment.entity_type),
      ));
      const data = await invokeProduction({ action: 'list_my_teams' });
      const nextTeams = (data?.teams || []) as TeamRecord[];
      setTeams(nextTeams);

      const addableTeamIds = activeProductionAssignments
        .filter((assignment) => getStaffPermissions(assignment.access_level, assignment).canAddListing)
        .map((assignment) => assignment.production_team_id)
        .filter((teamId): teamId is string => typeof teamId === 'string' && teamId.length > 0);
      const teamOwnersFromResponse = nextTeams
        .filter((team) => addableTeamIds.includes(team.id))
        .map((team) => String(team.owner_id || '').trim())
        .filter((ownerId) => ownerId.length > 0);

      let staffAddOwnerIds = teamOwnersFromResponse;
      if (userRole === 'staff' && addableTeamIds.length > 0 && teamOwnersFromResponse.length === 0) {
        const { data: assignedTeamOwners, error: assignedTeamOwnersError } = await supabase
          .from('production_teams')
          .select('id, owner_id')
          .in('id', addableTeamIds);

        if (assignedTeamOwnersError) {
          logActionError('MyProduction', 'fetch staff production add owners', assignedTeamOwnersError, { userId });
        } else {
          staffAddOwnerIds = [
            ...staffAddOwnerIds,
            ...(assignedTeamOwners || [])
              .map((team: any) => String(team.owner_id || '').trim())
              .filter((ownerId: string) => ownerId.length > 0),
          ];
        }
      }

      setStaffAddOwnerState({
        userId,
        entityTypes: activeWorkspaceTypes,
        ownerIds: userRole === 'staff' ? Array.from(new Set(staffAddOwnerIds)) : [],
      });
    } catch (error: any) {
      setStaffAddOwnerState({ userId, entityTypes: [], ownerIds: [] });
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
  }, [invokeProduction, showAlert, userId, userRole]);

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
      const focusTask = runAfterUIIdle(startFetch);
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

  useEffect(() => {
    if (!requestedDeleteId || loading || processedDeleteIdRef.current === requestedDeleteId) return;
    const timer = setTimeout(() => {
      if (processedDeleteIdRef.current === requestedDeleteId) return;
      processedDeleteIdRef.current = requestedDeleteId;

      const team = teams.find((item) => item.id === requestedDeleteId);
      if (!team) return;
      const staffPermissions = team.staff_access_level ? getStaffPermissions(team.staff_access_level, team) : null;
      const canDelete = userRole === 'staff'
        ? Boolean(staffPermissions?.canDeleteListing)
        : team.member_role === 'owner';
      if (!canDelete) {
        setAlertConfig({ type: 'warning', title: 'Delete Not Allowed', message: 'You do not have permission to delete this production team.' });
        setAlertVisible(true);
        return;
      }

      setSelectedTeamId(team.id);
      setSelectedTeamName(team.name || '');
      setDeleteConfirmationText('');
      setModalVisible(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [loading, requestedDeleteId, teams, userRole]);

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
    return fetchTeams({ showAlertOnError: true });
  };

  const staffAddOwnerIds = staffAddOwnerState?.userId === userId
    ? staffAddOwnerState.ownerIds
    : [];
  const isMultiRoleStaff = userRole === 'staff' && (staffAddOwnerState?.entityTypes.length || 0) > 1;
  const staffHeaderAddOwnerId = isMultiRoleStaff && staffAddOwnerIds.length === 1
    ? staffAddOwnerIds[0]
    : null;
  const openStaffAddProduction = useCallback(() => {
    if (!staffHeaderAddOwnerId) return;
    router.push({ pathname: '/add_production', params: { ownerId: staffHeaderAddOwnerId } });
  }, [staffHeaderAddOwnerId]);

  return (
    <>
      <View style={[!embedded && styles.flex1, { backgroundColor: colors.background }]}>
        {!embedded && (<Header
          title="Productions"
          overline="MusikaLokal"
          showTitle={false}
          onAddPress={staffHeaderAddOwnerId ? openStaffAddProduction : undefined}
          addButtonAccessibilityLabel="Add production team"
        />)}

        <ManagedListingContent embedded={embedded} listingType="production" loading={loading} itemCount={visibleTeams.length} error={loadError}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: embedded ? 16 : contentBottomPadding }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {!embedded && <ManageWorkspaceTabs activeKey={historyOnly ? "history" : "production"} />}

          {!embedded && (<Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>PROJECTS & COLLABORATORS</Text>)}

          {!embedded && (<InlineErrorBanner
            message={loadError}
            onRetry={() => {
              if (teams.length === 0) setLoading(true);
              void fetchTeams({ showAlertOnError: true });
            }}
          />)}

          {loading ? (
            <View style={styles.skeletonList}>
              {[0, 1].map((index) => (
                <View key={`production-skeleton-${index}`} style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardIdentity}>
                    <Skeleton width={64} height={64} borderRadius={10} />
                    <View style={styles.cardHeading}>
                      <Skeleton width="80%" height={22} />
                      <Skeleton width="65%" height={14} style={{ marginTop: 6 }} />
                    </View>
                  </View>
                  <Skeleton width="100%" height={14} style={{ marginTop: 10 }} />
                  <Skeleton width="78%" height={14} style={{ marginTop: 6 }} />
                  <View style={styles.skeletonActionRow}>
                    <Skeleton width={124} height={44} borderRadius={9} />
                    <Skeleton width={44} height={44} borderRadius={9} />
                    <Skeleton width={44} height={44} borderRadius={9} />
                  </View>
                </View>
              ))}
            </View>
          ) : visibleTeams.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{historyOnly ? 'No inactive teams yet' : 'No active production teams yet'}</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{historyOnly ? 'Deactivated teams will appear here. Editing a team keeps it inactive until you activate it.' : 'Create your first production team to manage members and gig partnerships.'}</Text>
            </View>
          ) : (
            visibleTeams.map((team) => {
              const isOwnerTeam = team.member_role === 'owner';
              const staffPermissions = team.staff_access_level ? getStaffPermissions(team.staff_access_level, team) : null;
              const canEdit = !isMusicianView && (
                team.member_role === 'owner' ||
                team.member_role === 'manager' ||
                Boolean(staffPermissions?.canEditListing)
              );
              const canDelete = !isMusicianView && (
                (!staffPermissions && team.member_role === 'owner') ||
                Boolean(staffPermissions?.canDeleteListing)
              );
              const canOnlyViewAndChat = isMusicianView && !isOwnerTeam;
              const showManageAsView = canOnlyViewAndChat || Boolean(staffPermissions && staffPermissions.canViewOnly);

              return (
                <View
                  key={team.id}
                  testID={`mobile-production-card-${team.id}`}
                  accessibilityLabel={`mobile-production-card-${team.id}`}
                  style={[styles.cardContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.cardIdentity}>
                    <View style={styles.imageWrapper}>
                      {team.logo_url ? (
                        <CachedImage
                          uri={team.logo_url}
                          style={styles.cardImage}
                          width={128}
                          height={128}
                          quality={68}
                          priority="high"
                        />
                      ) : (
                        <View style={[styles.cardImage, styles.imagePlaceholder, { backgroundColor: colors.primary + '12' }]}>
                          <Ionicons name="people-outline" size={42} color={colors.primary} />
                        </View>
                      )}

                    </View>
                    <View style={styles.cardHeading}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{team.name}</Text>
                      <View style={[styles.roleBadge, { backgroundColor: colors.primary + '16' }]}>
                        <Text style={[styles.roleBadgeText, { color: colors.primary }]}>
                          {team.staff_access_level || /^staff(?:[-_]|$)/i.test(team.member_role) ? 'Staff' : team.member_role}{team.management_status === 'inactive' ? ' \u00b7 Inactive' : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardContent}>
                    <View style={[styles.actionRow, { borderColor: colors.border }]}>
                      <View style={styles.actionLeft}>
                        <TouchableOpacity
                          activeOpacity={1}
                          testID={`mobile-production-manage-${team.id}`}
                          accessibilityLabel={`mobile-production-manage-${team.id}`}
                          onPress={() => router.push({ pathname: '/production_team', params: { teamId: team.id } })}
                          style={[styles.manageBtn, { borderColor: colors.primary }]}
                        >

                          <Text style={[styles.manageBtnText, { color: colors.primary }]}>{showManageAsView ? 'View' : 'Manage'}</Text>
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
                        {staffPermissions?.canAddListing && !staffHeaderAddOwnerId ? (
                          <TouchableOpacity
                            activeOpacity={1}
                            testID={`mobile-production-add-for-owner-${team.id}`}
                            accessibilityLabel={`Add production team for ${team.name}`}
                            onPress={() => router.push({ pathname: '/add_production', params: { ownerId: team.owner_id } })}
                            style={[styles.editBtn, { borderColor: colors.border }]}
                          >
                            <Ionicons name="add-outline" size={20} color={colors.text} />
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

                  </View>
                </View>
              );
            })
          )}
        </ManagedListingContent>

        {!embedded && <Navbar />}
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
  scrollContent: { paddingBottom: 180, paddingTop: 0, paddingHorizontal: 16 },
  sectionHeading: {
    fontFamily: typography.title,
    fontSize: 12,
    letterSpacing: 1.4,
    marginBottom: 16,
  },
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
    fontFamily: typography.semibold,
    fontSize: 12,
  },
  skeletonList: { gap: 16 },
  skeletonCard: { ...managementCardStyles.surface },
  skeletonActionRow: { marginTop: 16, flexDirection: 'row', gap: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { marginTop: 16, fontFamily: typography.heading, fontSize: 20 },
  emptyText: { marginTop: 10, fontFamily: typography.body, textAlign: 'center' },
  cardContainer: { ...managementCardStyles.surface, overflow: 'hidden', borderColor: palette.line, marginBottom: 12 },
  imageWrapper: { width: 64, height: 64, borderRadius: 10, overflow: "hidden" },
  cardImage: { ...managementCardStyles.thumbnail },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  roleBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  roleBadgeText: { fontSize: 12, textTransform: 'capitalize', fontFamily: typography.semibold },
  cardContent: { padding: 0, paddingTop: 8 },
  cardTitle: { ...managementCardStyles.title, marginBottom: 0 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  actionLeft: {
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  manageBtn: {
    ...managementCardStyles.button,
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 88,
    paddingVertical: 8,
  },
  manageBtnText: { fontFamily: typography.semibold },
  editBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    width: 44,
    height: 44,
    borderRadius: 9,
  },
  editBtnIcon: { width: 20, height: 20, lineHeight: 20, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' },
  deleteBtn: {
    width: 44,
    height: 44,
    padding: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIdentity: { ...managementCardStyles.identity },
  cardHeading: { flex: 1, minWidth: 0, gap: 4 },
});

