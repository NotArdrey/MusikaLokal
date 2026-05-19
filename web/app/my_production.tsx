import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import CachedImage from '../src/components/CachedImage';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal, { normalizeConfirmationInput } from '../src/components/modal';
import MusicianWorkspaceTabs from '../src/components/MusicianWorkspaceTabs';
import Navbar from '../src/components/navbar';
import Skeleton from '../src/components/Skeleton';
import { useAuth, useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { getStaffPermissions } from '../src/utils/staffAccess';

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
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width >= 768;

  const pageBackground = isWebDesktop
    ? isDark
      ? '#0A1224'
      : '#E9EEF8'
    : colors.background;
  const pageCardBackground = isWebDesktop
    ? isDark
      ? '#0F172A'
      : '#FFFFFF'
    : colors.surface;
  const borderSoft = isWebDesktop
    ? isDark
      ? '#1E2C48'
      : '#D8E3F2'
    : colors.border;

  const { isAuthenticated, userId } = useRequireAuth();
  const { userRole } = useAuth();
  const isMusicianView = userRole === 'musician';
  const params = useLocalSearchParams<{ refresh?: string }>();
  const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;

  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const invokeProduction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-production', { body });
    if (error) {
      const status = Number((error as any)?.status || (error as any)?.context?.status || 0);
      console.warn('manage-production failed', {
        message: error.message,
        status,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        context: (error as any).context,
        body,
      });

      if ([502, 503, 504].includes(status)) {
        const transientError = new Error('Production services are temporarily unavailable. Please try again.');
        (transientError as any).status = status;
        throw transientError;
      }

      throw error;
    }
    return data;
  }, []);

  const fetchTeams = useCallback(async () => {
    if (!userId) return;

    try {
      const data = await invokeProduction({ action: 'list_my_teams' });
      setTeams((data?.teams || []) as TeamRecord[]);
    } catch (error: any) {
      showAlert('error', 'Error', error?.message || 'Failed to fetch production teams.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [invokeProduction, userId]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated || !userId) return;
      setLoading(true);
      fetchTeams();
    }, [fetchTeams, isAuthenticated, refreshKey, userId]),
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
        throw new Error(data?.error || 'Failed to delete production team.');
      }

      setTeams((prev) => prev.filter((team) => team.id !== selectedTeamId));
      closeDeleteModal();
      showAlert('success', 'Production Team Deleted', 'Production team deleted successfully.');
    } catch (error: any) {
      showAlert('error', 'Error', error?.message || 'Failed to delete production team.');
    } finally {
      setDeleting(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTeams();
  };

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
          <Header title="My Production" />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.scrollContentWeb]}
            style={styles.flex1}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {isMusicianView && (
              <MusicianWorkspaceTabs activeKey="producer" />
            )}

            {loading ? (
              <View style={[styles.gridWrap, isWebDesktop && styles.gridWrapWeb]}>
                {[0, 1].map((index) => (
                  <View key={`production-skeleton-${index}`} style={[styles.gridItem, isWebDesktop && styles.gridItemWeb]}>
                    <View style={[styles.cardContainer, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                      <Skeleton width="100%" height={isWebDesktop ? 186 : 170} borderRadius={0} />
                      <View style={styles.cardContent}>
                        <Skeleton width="56%" height={16} />
                        <Skeleton width="100%" height={12} style={{ marginTop: 8 }} />
                        <Skeleton width="78%" height={12} style={{ marginTop: 6 }} />
                        <View style={styles.skeletonActionRow}>
                          <Skeleton width={92} height={32} borderRadius={10} />
                          <Skeleton width={32} height={32} borderRadius={10} />
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : teams.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No production teams yet</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Create your first production team to manage members and venue partnerships.</Text>
              </View>
            ) : (
              <View style={[styles.gridWrap, isWebDesktop && styles.gridWrapWeb]}>
                {teams.map((team) => {
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
                    <View key={team.id} style={[styles.gridItem, isWebDesktop && styles.gridItemWeb]}>
                      <View style={[styles.cardContainer, {
                        backgroundColor: pageCardBackground,
                        borderColor: borderSoft,
                        shadowColor: isWebDesktop ? '#0F172A' : colors.primary,
                      }, isWebDesktop && styles.webSectionCard]}>
                        <View style={[styles.imageWrapper, isWebDesktop && styles.imageWrapperWeb]}>
                          {team.logo_url ? (
                            <CachedImage uri={team.logo_url} style={styles.cardImage} />
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
                          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{team.name}</Text>
                          <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                            {team.description || 'No description added yet.'}
                          </Text>

                          {canShowActions ? (
                          <View style={[styles.actionRow, { borderColor: colors.border }]}>
                            <View style={styles.actionLeft}>
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => router.push({ pathname: '/production_team', params: { teamId: team.id } })}
                                style={[styles.manageBtn, { backgroundColor: colors.primary }]}
                              >
                                <Ionicons name={showManageAsView ? 'eye-outline' : 'settings-outline'} size={16} color="#FFF" />
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
                                      params: { recipientId: team.owner_id },
                                    });
                                  }}
                                  style={[styles.editBtn, { borderColor: colors.border }]}
                                >
                                  <Ionicons name="chatbubble-outline" size={18} color={colors.text} style={styles.editBtnIcon} />
                                </TouchableOpacity>
                              ) : null}

                              {canEdit ? (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => router.push({ pathname: '/edit_production', params: { id: team.id } })}
                                  style={[styles.editBtn, { borderColor: colors.border }]}
                                >
                                  <Ionicons name="pencil-outline" size={18} color={colors.text} style={styles.editBtnIcon} />
                                </TouchableOpacity>
                              ) : null}
                            </View>

                            {canDelete ? (
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => confirmDelete(team.id, team.name)}
                                style={styles.deleteBtn}
                              >
                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                              </TouchableOpacity>
                            ) : null}
                          </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <Navbar />
        </View>
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
  pageFrame: {
    flex: 1,
    width: '100%',
  },
  pageFrameWeb: {
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 180,
    paddingTop: 12,
  },
  scrollContentWeb: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'center',
    paddingTop: 10,
  },
  gridWrap: { width: '100%' },
  gridWrapWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: { width: '100%', marginBottom: 14 },
  gridItemWeb: { width: '49%', marginBottom: 18 },
  skeletonActionRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { marginTop: 16, fontFamily: 'Poppins_600SemiBold', fontSize: 18 },
  emptyText: { marginTop: 8, fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center' },
  cardContainer: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  webSectionCard: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  imageWrapper: { height: 170, position: 'relative' },
  imageWrapperWeb: { height: 186 },
  cardImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  roleBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  roleBadgeText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'capitalize' },
  cardContent: { paddingHorizontal: 14, paddingVertical: 12 },
  cardTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16, marginBottom: 4 },
  cardDescription: { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  actionLeft: { flexDirection: 'row', gap: 8 },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  manageBtnText: { fontFamily: 'Poppins_500Medium', fontSize: 12, color: '#FFF' },
  editBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1 },
  editBtnIcon: { width: 18, height: 18, lineHeight: 18, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' },
  deleteBtn: { padding: 6 },
});
