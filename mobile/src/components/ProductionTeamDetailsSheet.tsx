import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetTimingConfigs,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import React, { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Easing } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useBottomBarClearance } from "../hooks/useBottomBarClearance";
import CachedImage from "./CachedImage";
import TrackedBottomSheetModal from "./TrackedBottomSheetModal";

type ProductionTeamRecord = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  created_at: string;
};

type ProductionTeamMember = {
  user_id: string;
  role: string;
  full_name: string;
  avatar_url: string | null;
};

interface ProductionTeamDetailsSheetProps {
  teamId: string | null;
  onDismiss?: () => void;
}

const formatRoleLabel = (value: string | null | undefined) => {
  if (!value) return "Member";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatCreatedLabel = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const ProductionTeamDetailsSheet = forwardRef<
  BottomSheetModal,
  ProductionTeamDetailsSheetProps
>(function ProductionTeamDetailsSheet({ teamId, onDismiss }, ref) {
  const { colors, isDark } = useTheme();
  const { userId } = useAuth();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const snapPoints = useMemo(() => ["86%"], []);
  const animationConfigs = useBottomSheetTimingConfigs({
    duration: 260,
    easing: Easing.out(Easing.cubic),
  });

  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState<ProductionTeamRecord | null>(null);
  const [members, setMembers] = useState<ProductionTeamMember[]>([]);
  const [membershipRole, setMembershipRole] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const closeSheet = useCallback(() => {
    if (ref && typeof ref !== "function") {
      ref.current?.dismiss();
    }
  }, [ref]);

  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    let active = true;

    if (!teamId) {
      setLoading(false);
      setTeam(null);
      setMembers([]);
      setMembershipRole(null);
      setErrorMessage("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setErrorMessage("");

    void (async () => {
      try {
        const membershipRequest = userId
          ? supabase
              .from("production_team_members")
              .select("role")
              .eq("team_id", teamId)
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any);

        const [teamResponse, membersResponse, membershipResponse] = await Promise.all([
          supabase
            .from("production_teams")
            .select("id, name, description, logo_url, owner_id, created_at")
            .eq("id", teamId)
            .maybeSingle(),
          supabase
            .from("production_team_members")
            .select("user_id, role, profiles(id, full_name, avatar_url)")
            .eq("team_id", teamId),
          membershipRequest,
        ]);

        if (teamResponse.error) throw teamResponse.error;
        if (!teamResponse.data) throw new Error("Production team not found.");
        if (membersResponse.error) throw membersResponse.error;

        if (!active) return;

        const mappedMembers: ProductionTeamMember[] = (membersResponse.data || []).map(
          (member: any) => ({
            user_id: member.user_id,
            role: member.role,
            full_name: member.profiles?.full_name || "Unknown member",
            avatar_url: member.profiles?.avatar_url || null,
          }),
        );

        mappedMembers.sort((left, right) => {
          const leftPriority = left.role === "owner" ? 0 : left.role === "manager" ? 1 : 2;
          const rightPriority = right.role === "owner" ? 0 : right.role === "manager" ? 1 : 2;
          if (leftPriority !== rightPriority) return leftPriority - rightPriority;
          return left.full_name.localeCompare(right.full_name);
        });

        setTeam(teamResponse.data as ProductionTeamRecord);
        setMembers(mappedMembers);
        setMembershipRole(
          membershipResponse?.data?.role ||
            (teamResponse.data.owner_id === userId ? "owner" : null),
        );
      } catch (error: any) {
        if (!active) return;
        setTeam(null);
        setMembers([]);
        setMembershipRole(null);
        setErrorMessage(error?.message || "Failed to load production team.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [teamId, userId]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
      />
    ),
    [],
  );

  const createdLabel = useMemo(() => formatCreatedLabel(team?.created_at), [team?.created_at]);
  const ownerMember = useMemo(
    () => members.find((member) => member.role === "owner") || null,
    [members],
  );
  const primaryActionLabel =
    membershipRole === "owner" || membershipRole === "manager"
      ? "Open Team Workspace"
      : "Open Team Page";

  const handleOpenFullPage = useCallback(() => {
    if (!team?.id) return;

    closeSheet();

    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        router.push({ pathname: "/production_team", params: { teamId: team.id } });
      });
    });
  }, [closeSheet, team?.id]);

  const accentColor = "#F97316";
  const accentSoft = isDark ? "rgba(249, 115, 22, 0.18)" : "rgba(249, 115, 22, 0.12)";

  return (
    <TrackedBottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      animationConfigs={animationConfigs}
      animateOnMount={true}
      enableDynamicSizing={false}
      enableOverDrag={false}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Production Team</Text>
          <Text style={[styles.title, { color: colors.text }]}>Team Details</Text>
        </View>
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeSheet}
          style={[styles.closeButton, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Ionicons name="close" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>Loading team details</Text>
          <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>Fetching the latest production team info.</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.stateContainer}>
          <View style={[styles.stateIcon, { backgroundColor: colors.card }]}> 
            <Ionicons name="alert-circle-outline" size={28} color={accentColor} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.text }]}>Unable to load this team</Text>
          <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>{errorMessage}</Text>
        </View>
      ) : !team ? (
        <View style={styles.stateContainer}>
          <View style={[styles.stateIcon, { backgroundColor: colors.card }]}> 
            <Ionicons name="people-outline" size={28} color={colors.textSecondary} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.text }]}>Team unavailable</Text>
          <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>This production team could not be found.</Text>
        </View>
      ) : (
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        >
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            {team.logo_url ? (
              <CachedImage uri={team.logo_url} style={styles.teamLogo} />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: accentSoft }]}> 
                <Ionicons name="people" size={34} color={accentColor} />
              </View>
            )}

            <Text style={[styles.teamName, { color: colors.text }]}>{team.name}</Text>
            <Text style={[styles.teamDescription, { color: colors.textSecondary }]}>
              {team.description?.trim() || "Production crew, management, and venue-ready coordination in one team."}
            </Text>

            <View style={styles.chipRow}>
              <View style={[styles.chip, { backgroundColor: accentSoft }]}> 
                <Text style={[styles.chipText, { color: accentColor }]}>Production Team</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: colors.border }]}> 
                <Text style={[styles.chipText, { color: colors.text }]}> 
                  {members.length} {members.length === 1 ? "Member" : "Members"}
                </Text>
              </View>
              {membershipRole ? (
                <View style={[styles.chip, { backgroundColor: colors.border }]}> 
                  <Text style={[styles.chipText, { color: colors.text }]}>Your role: {formatRoleLabel(membershipRole)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Overview</Text>
            <View style={styles.infoGrid}>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Owner</Text>
                <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
                  {ownerMember?.full_name || "Not listed"}
                </Text>
              </View>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Created</Text>
                <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
                  {createdLabel || "Recently added"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <View style={styles.membersHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Members</Text>
              <Text style={[styles.membersCount, { color: colors.textSecondary }]}>
                {members.length} total
              </Text>
            </View>

            {members.length === 0 ? (
              <View style={[styles.emptyMembersCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <Text style={[styles.emptyMembersText, { color: colors.textSecondary }]}>No members were listed for this team yet.</Text>
              </View>
            ) : (
              members.map((member) => (
                <View
                  key={member.user_id}
                  style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.memberRow}>
                    {member.avatar_url ? (
                      <CachedImage uri={member.avatar_url} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}> 
                        <Ionicons name="person" size={18} color={colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.memberCopy}>
                      <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                        {member.full_name}
                      </Text>
                      <Text style={[styles.memberRole, { color: colors.textSecondary }]}>
                        {formatRoleLabel(member.role)}
                      </Text>
                    </View>
                    {member.role === "owner" ? (
                      <View style={[styles.ownerBadge, { backgroundColor: accentSoft }]}> 
                        <Text style={[styles.ownerBadgeText, { color: accentColor }]}>Owner</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity
            activeOpacity={1}
            onPress={handleOpenFullPage}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="open-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      )}
    </TrackedBottomSheetModal>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 16,
  },
  eyebrow: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 56,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  stateTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    textAlign: "center",
  },
  stateMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    alignItems: "center",
  },
  teamLogo: {
    width: 96,
    height: 96,
    borderRadius: 24,
    marginBottom: 16,
  },
  teamLogoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  teamName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    textAlign: "center",
  },
  teamDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  sectionBlock: {
    marginTop: 18,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    marginBottom: 12,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
  },
  infoCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  infoLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    marginBottom: 6,
  },
  infoValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  membersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  membersCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  memberCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  memberCopy: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 10,
  },
  memberName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    marginBottom: 2,
  },
  memberRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  ownerBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ownerBadgeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  emptyMembersCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  emptyMembersText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: 20,
    borderRadius: 18,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
});

export default ProductionTeamDetailsSheet;