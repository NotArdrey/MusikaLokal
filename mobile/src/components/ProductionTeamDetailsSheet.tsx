import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
} from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  InteractionManager,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useBottomBarClearance } from "../hooks/useBottomBarClearance";
import { submitListingRequest, uploadListingRequestDocument } from "../utils/listingRequests";
import { bottomSheetSpringConfig } from "../utils/motion";
import { isFanUserRole } from "../utils/roleRouting";
import { getSmoothTabIndex, setSmoothTab } from "../utils/smoothTabs";
import { formatDashedNumericDate } from "../utils/friendlyDateTime";
import CachedImage from "./CachedImage";
import CustomAlert, { AlertType } from "./CustomAlert";
import DocumentUploader from "./DocumentUploader";
import Modal from "./modal";
import SlidingTabBar from "./SlidingTabBar";
import SmoothTabTransition from "./SmoothTabTransition";
import TrackedBottomSheetModal from "./TrackedBottomSheetModal";
import VideoUploader from "./VideoUploader";

type ProductionTeamRecord = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  open_production_applications?: boolean | null;
  created_at: string;
};

type ProductionTeamMember = {
  user_id: string;
  role: string;
  full_name: string;
  avatar_url: string | null;
};

type UserGroup = {
  id: string;
  owner_id: string;
  name: string;
  images?: string[] | null;
  genre?: string | null;
  group_type?: string | null;
};

type ReviewRecord = {
  id: string;
  rating: number | null;
  content: string | null;
  created_at: string;
  author?: {
    full_name?: string | null;
    avatar_url?: string | null;
    updated_at?: string | null;
  } | null;
  updated_at?: string | null;
};

interface ProductionTeamDetailsSheetProps {
  teamId: string | null;
  onDismiss?: () => void;
}

type SheetAlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

type ProductionTeamTab = "About" | "Connect" | "Review";

type ProductionTeamBaseDetails = {
  team: ProductionTeamRecord;
  members: ProductionTeamMember[];
  membershipRole: string | null;
};

type ProductionTeamBaseCacheEntry = {
  payload?: ProductionTeamBaseDetails;
  cachedAt: number;
  inFlight?: Promise<ProductionTeamBaseDetails>;
};

const PRODUCTION_TEAM_DETAILS_CACHE_TTL_MS = 60_000;
const productionTeamBaseCache = new Map<string, ProductionTeamBaseCacheEntry>();

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

const loadProductionTeamBaseDetails = async (
  targetTeamId: string,
  targetUserId?: string | null,
): Promise<ProductionTeamBaseDetails> => {
  const membershipRequest = targetUserId
    ? supabase
        .from("production_team_members")
        .select("role")
        .eq("team_id", targetTeamId)
        .eq("user_id", targetUserId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null } as any);

  const [teamResponse, membersResponse, membershipResponse] = await Promise.all([
    supabase
      .from("production_teams")
      .select("*")
      .eq("id", targetTeamId)
      .maybeSingle(),
    supabase
      .from("production_team_members")
      .select("user_id, role, profiles(id, full_name, avatar_url)")
      .eq("team_id", targetTeamId),
    membershipRequest,
  ]);

  if (teamResponse.error) throw teamResponse.error;
  if (!teamResponse.data) throw new Error("Production team not found.");
  if (membersResponse.error) throw membersResponse.error;

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

  const team = teamResponse.data as ProductionTeamRecord;

  return {
    team,
    members: mappedMembers,
    membershipRole:
      membershipResponse?.data?.role ||
      (team.owner_id === targetUserId ? "owner" : null),
  };
};

const ProductionTeamDetailsSheet = forwardRef<
  BottomSheetModal,
  ProductionTeamDetailsSheetProps
>(function ProductionTeamDetailsSheet({ teamId, onDismiss }, ref) {
  const { colors, isDark } = useTheme();
  const { userId, userRole } = useAuth();
  const isFan = isFanUserRole(userRole);
  const { contentBottomPadding } = useBottomBarClearance(24);
  const snapPoints = useMemo(() => ["86%"], []);
  const animationConfigs = useBottomSheetSpringConfigs(bottomSheetSpringConfig);

  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState<ProductionTeamRecord | null>(null);
  const [members, setMembers] = useState<ProductionTeamMember[]>([]);
  const [membershipRole, setMembershipRole] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("Musician");
  const [activeTab, setActiveTab] = useState<ProductionTeamTab>("About");
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestApplicationContext, setRequestApplicationContext] = useState("");
  const [requestDocumentFile, setRequestDocumentFile] = useState<any>(null);
  const [requestDocumentUrl, setRequestDocumentUrl] = useState("");
  const [requestVideoUrl, setRequestVideoUrl] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const requestInFlightRef = useRef(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: SheetAlertButton[];
  }>({ type: "info", title: "", message: "" });

  const showSheetAlert = useCallback(
    (
      type: AlertType,
      title: string,
      message: string,
      buttons?: SheetAlertButton[],
    ) => {
      setAlertConfig({ type, title, message, buttons });
      setAlertVisible(true);
    },
    [],
  );

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
      setActiveTab("About");
      setUserGroups([]);
      setSelectedGroupId(null);
      setReviews([]);
      setErrorMessage("");
      setRequestMessage("");
      setRequestApplicationContext("");
      setRequestDocumentFile(null);
      setRequestDocumentUrl("");
      setRequestVideoUrl("");
      setIsFavorited(false);
      setFavoriteCount(0);
      return () => {
        active = false;
      };
    }

    const cacheKey = `${teamId}:${userId || "guest"}`;
    const cached = productionTeamBaseCache.get(cacheKey);
    const cacheIsFresh =
      cached?.payload &&
      Date.now() - cached.cachedAt < PRODUCTION_TEAM_DETAILS_CACHE_TTL_MS;

    if (cached?.payload) {
      setTeam(cached.payload.team);
      setMembers(cached.payload.members);
      setMembershipRole(cached.payload.membershipRole);
    }

    if (cacheIsFresh) {
      setLoading(false);
      setErrorMessage("");
      return () => {
        active = false;
      };
    }

    setLoading(!cached?.payload);
    setErrorMessage("");
    setRequestMessage("");
    setRequestApplicationContext("");
    setRequestDocumentFile(null);
    setRequestDocumentUrl("");
    setRequestVideoUrl("");

    void (async () => {
      try {
        const inFlight =
          cached?.inFlight || loadProductionTeamBaseDetails(teamId, userId);

        productionTeamBaseCache.set(cacheKey, {
          payload: cached?.payload,
          cachedAt: cached?.cachedAt || 0,
          inFlight,
        });

        const payload = await inFlight;
        productionTeamBaseCache.set(cacheKey, {
          payload,
          cachedAt: Date.now(),
        });

        if (!active) return;

        setTeam(payload.team);
        setMembers(payload.members);
        setMembershipRole(payload.membershipRole);
      } catch (error: any) {
        if (!active) return;
        const currentCache = productionTeamBaseCache.get(cacheKey);
        if (currentCache?.inFlight) {
          if (currentCache.payload) {
            productionTeamBaseCache.set(cacheKey, {
              payload: currentCache.payload,
              cachedAt: currentCache.cachedAt,
            });
          } else {
            productionTeamBaseCache.delete(cacheKey);
          }
        }
        if (cached?.payload) {
          setTeam(cached.payload.team);
          setMembers(cached.payload.members);
          setMembershipRole(cached.payload.membershipRole);
          setErrorMessage("");
        } else {
          setTeam(null);
          setMembers([]);
          setMembershipRole(null);
          setErrorMessage(error?.message || "Failed to load production team.");
        }
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

  useEffect(() => {
    let active = true;

    if (!teamId || !userId) {
      setCurrentUserRole(null);
      setCurrentUserName("Musician");
      setUserGroups([]);
      setSelectedGroupId(null);
      return () => {
        active = false;
      };
    }

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role, full_name")
          .eq("id", userId)
          .maybeSingle();

        if (error) throw error;
        if (!active) return;

        const role = data?.role || null;
        setCurrentUserRole(role);
        setCurrentUserName(data?.full_name?.trim() || "Musician");
      } catch (error) {
        console.error("Error loading request context:", error);
        if (!active) return;
        setCurrentUserRole(null);
        setUserGroups([]);
        setSelectedGroupId(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [teamId, userId]);

  useEffect(() => {
    let active = true;

    if (!teamId || !userId || currentUserRole !== "musician") {
      setUserGroups([]);
      setSelectedGroupId(null);
      setLoadingGroups(false);
      return () => {
        active = false;
      };
    }

    void (async () => {
      setLoadingGroups(true);
      try {
        const { data: ownedGroups, error: ownedError } = await supabase
          .from("groups_with_stats")
          .select("id, owner_id, name, images, genre, group_type")
          .eq("owner_id", userId);

        const { data: membershipRows, error: memberError } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", userId);

        const memberGroupIds = Array.from(
          new Set(
            (membershipRows || [])
              .map((row: any) => row.group_id)
              .filter((id: any) => typeof id === "string" && id.length > 0),
          ),
        );

        let memberGroups: UserGroup[] = [];
        if (memberGroupIds.length > 0) {
          const { data: memberGroupData, error: memberGroupDataError } = await supabase
            .from("groups_with_stats")
            .select("id, owner_id, name, images, genre, group_type")
            .in("id", memberGroupIds);

          if (memberGroupDataError) {
            console.error("Error fetching member group details:", memberGroupDataError);
          } else {
            memberGroups = (memberGroupData || []) as UserGroup[];
          }
        }

        if (ownedError) {
          console.error("Error fetching owned groups:", ownedError);
        }
        if (memberError) {
          console.error("Error fetching member groups:", memberError);
        }
        if (!active) return;

        const combinedGroups = [...((ownedGroups || []) as UserGroup[]), ...memberGroups];
        const uniqueGroups = combinedGroups.filter(
          (groupItem, index, array) => array.findIndex((entry) => entry.id === groupItem.id) === index,
        );

        setUserGroups(uniqueGroups);
      } catch (error) {
        console.error("Error fetching musician groups:", error);
        if (!active) return;
        setUserGroups([]);
      } finally {
        if (active) {
          setLoadingGroups(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUserRole, teamId, userId]);

  useEffect(() => {
    let active = true;

    if (!team?.owner_id) {
      setReviews([]);
      setLoadingReviews(false);
      return () => {
        active = false;
      };
    }

    void (async () => {
      setLoadingReviews(true);
      try {
        const reviewSelect = "*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url)";
        const { data } = await supabase
          .from("reviews")
          .select(reviewSelect)
          .eq("user_id", team.owner_id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (!active) return;

        setReviews(
          ((data || []) as any[]).map((row) => ({
            ...row,
            content: row?.content ?? row?.comment ?? null,
          })) as ReviewRecord[],
        );
      } catch (error) {
        console.error("Error loading production team reviews:", error);
        if (!active) return;
        setReviews([]);
      } finally {
        if (active) {
          setLoadingReviews(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [team?.owner_id]);

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
  const applyAsGroups = useMemo(
    () => userGroups.filter((groupItem) => groupItem.group_type === "duo" || groupItem.group_type === "band"),
    [userGroups],
  );
  const selectedApplicationGroup = useMemo(
    () => applyAsGroups.find((groupItem) => groupItem.id === selectedGroupId) || null,
    [applyAsGroups, selectedGroupId],
  );
  const reviewAverage = useMemo(() => {
    if (!reviews.length) return 0;
    const ratings = reviews.map((review) => Number(review.rating) || 0).filter((rating) => rating > 0);
    if (!ratings.length) return 0;
    return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  }, [reviews]);
  const canShowConnectTab = Boolean(
    team &&
      team.open_production_applications !== false &&
      membershipRole == null &&
      currentUserRole === "musician" &&
      team.owner_id !== userId,
  );
  const tabsToRender = useMemo<readonly ProductionTeamTab[]>(
    () => (canShowConnectTab ? (["About", "Connect", "Review"] as const) : (["About", "Review"] as const)),
    [canShowConnectTab],
  );
  const showTabs = tabsToRender.length > 1;
  const activeTabIndex = getSmoothTabIndex(tabsToRender, activeTab);
  const primaryActionLabel =
    membershipRole === "owner" || membershipRole === "manager"
      ? "Open Team Workspace"
      : "Open Team Page";

  const handleShare = useCallback(async () => {
    if (!team) return;
    try {
      await Share.share({
        message: `Check out ${team.name} (Production Team) on MusikaLokal!`,
      });
    } catch {
      // user cancelled or share failed
    }
  }, [team]);

  const toggleFavorite = useCallback(async () => {
    if (!userId || !team?.id) return;
    const prev = isFavorited;
    const prevCount = favoriteCount;
    setIsFavorited(!prev);
    setFavoriteCount(Math.max(0, prevCount + (prev ? -1 : 1)));
    try {
      const { error } = await supabase.functions.invoke("manage-details", {
        body: { action: "toggle_favorite", type: "production_team", id: team.id, userId },
      });
      if (error) throw error;
    } catch {
      setIsFavorited(prev);
      setFavoriteCount(prevCount);
    }
  }, [userId, team?.id, isFavorited, favoriteCount]);

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
  const canMessageTeamOwner = !isFan && Boolean(team?.owner_id && team.owner_id !== userId);

  useEffect(() => {
    if (!tabsToRender.includes(activeTab)) {
      setActiveTab(tabsToRender[0]);
    }
  }, [activeTab, tabsToRender]);

  useEffect(() => {
    if (!selectedGroupId) return;
    const stillVisible = applyAsGroups.some((groupItem) => groupItem.id === selectedGroupId);
    if (!stillVisible) {
      setSelectedGroupId(null);
    }
  }, [applyAsGroups, selectedGroupId]);

  const openTeamChat = useCallback(() => {
    if (!team?.owner_id || team.owner_id === userId) {
      Alert.alert("Info", "This team is already yours.");
      return;
    }

    closeSheet();

    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        router.push({
          pathname: "/chat",
          params: {
            recipientId: team.owner_id,
            recipientName: ownerMember?.full_name || team.name,
            recipientAvatar: ownerMember?.avatar_url || team.logo_url || "",
          },
        });
      });
    });
  }, [closeSheet, ownerMember?.avatar_url, ownerMember?.full_name, team?.logo_url, team?.name, team?.owner_id, userId]);

  const handleSendConnectionRequest = useCallback(async () => {
    if (requestInFlightRef.current || isSendingRequest) {
      return;
    }

    if (!userId || !team?.id || !team.owner_id) {
      showSheetAlert("error", "Error", "This request is unavailable right now.");
      return;
    }

    if (currentUserRole !== "musician") {
      showSheetAlert("warning", "Unavailable", "Only musicians can apply to this production team.");
      return;
    }

    if (team.open_production_applications === false) {
      showSheetAlert("warning", "Applications Closed", "This production team is not accepting applications right now.");
      return;
    }

    const normalizedPitchMessage = requestMessage.trim();
    if (!normalizedPitchMessage) {
      showSheetAlert("warning", "Pitch Required", "Add a short pitch before sending the request.");
      return;
    }

    const normalizedApplicationContext = requestApplicationContext.trim();
    const normalizedVideoUrl = requestVideoUrl.trim();
    if (!normalizedApplicationContext) {
      showSheetAlert(
        "warning",
        "Application Context Required",
        "Add the application context before sending this application.",
      );
      return;
    }

    if (!requestDocumentFile && !requestDocumentUrl.trim()) {
      showSheetAlert(
        "warning",
        "CV Required",
        "Upload your CV before sending this application.",
      );
      return;
    }

    if (!normalizedVideoUrl) {
      showSheetAlert("warning", "Video Required", "Upload a video or reel before sending this application.");
      return;
    }

    requestInFlightRef.current = true;
    setIsSendingRequest(true);
    try {
      let uploadedDocumentUrl = requestDocumentUrl.trim() || null;
      if (requestDocumentFile) {
        try {
          uploadedDocumentUrl = await uploadListingRequestDocument(
            userId,
            requestDocumentFile,
            "applications",
          );
        } catch (uploadError) {
          console.error("Error uploading request document:", uploadError);
          showSheetAlert("error", "Upload Failed", "We couldn't upload the CV right now.");
          return;
        }
      }

      const senderEntityType = selectedApplicationGroup ? "group" : "musician";
      const senderEntityName = selectedApplicationGroup?.name || currentUserName;
      const senderEntityId = selectedApplicationGroup?.id || userId;

      const requestDetails = {
        pitch_message: normalizedPitchMessage,
        application_context: normalizedApplicationContext,
        context_label: "Application Context",
        request_kind: "application",
        cv_url: uploadedDocumentUrl,
        video_url: normalizedVideoUrl,
        contract_url: null,
        apply_as: selectedApplicationGroup ? "group" : "solo",
        selected_group_id: selectedApplicationGroup?.id || null,
        selected_group_type: selectedApplicationGroup?.group_type || null,
      };

      await submitListingRequest({
        currentUserId: userId,
        receiverUserId: team.owner_id,
        message: normalizedPitchMessage,
        senderEntityType,
        senderEntityName,
        senderEntityId,
        receiverEntityType: "production_team",
        receiverEntityName: team.name,
        receiverEntityId: team.id,
        groupId: selectedApplicationGroup?.id || null,
        productionTeamId: team.id,
        notificationTitle: "New team application",
        notificationMessage: `${senderEntityName} wants to join ${team.name}.`,
        notificationImage: team.logo_url || null,
        attachmentUrl: uploadedDocumentUrl,
        extraMeta: {
          source: "production_team_details",
          request_kind: "application",
          request_details: requestDetails,
        },
      });

      setRequestMessage("");
      setRequestApplicationContext("");
      setRequestDocumentFile(null);
      setRequestDocumentUrl("");
      setRequestVideoUrl("");
      setSelectedGroupId(null);
      showSheetAlert(
        "success",
        "Application Sent",
        "Your application has been sent to the production team. We'll let you know when they respond.",
        [
          {
            text: "OK",
            onPress: () => {
              closeSheet();
            },
          },
        ],
      );
    } catch (error) {
      console.error("Error sending production team request:", error);
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "We couldn't send that request right now.";
      showSheetAlert("error", "Error", errorMessage);
    } finally {
      requestInFlightRef.current = false;
      setIsSendingRequest(false);
    }
  }, [
    closeSheet,
    currentUserName,
    currentUserRole,
    requestApplicationContext,
    requestDocumentFile,
    requestDocumentUrl,
    requestMessage,
    requestVideoUrl,
    isSendingRequest,
    selectedApplicationGroup,
    team?.id,
    team?.logo_url,
    team?.name,
    team?.open_production_applications,
    team?.owner_id,
    showSheetAlert,
    userId,
  ]);

  const renderTabs = () => (
    <SlidingTabBar
      activeColor={colors.primary}
      activeKey={activeTab}
      borderColor={colors.border}
      indicatorColor={colors.primary}
      indicatorWidthRatio={0.34}
      onChange={(tab) => setSmoothTab(setActiveTab, tab)}
      tabs={tabsToRender.map((tab) => ({ key: tab, label: tab }))}
      textStyle={styles.tabText}
    />
  );

  const renderApplyAsOptions = () => {
    const applyOptions = [
      {
        id: null,
        name: "Individual",
        subtitle: "Apply as a solo musician",
        icon: "person" as const,
      },
      ...applyAsGroups.map((groupItem) => ({
        id: groupItem.id,
        name: groupItem.name,
        subtitle: groupItem.group_type === "duo" ? "Duo" : "Group",
        icon: "people" as const,
      })),
    ];

    return (
      <View style={styles.sectionBlock}>
        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Apply As</Text>
        {loadingGroups ? (
          <View style={styles.selectorLoadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={styles.optionList}>
            {applyOptions.map((option) => {
              const isSelected = selectedGroupId === option.id;
              return (
                <TouchableOpacity
                  key={option.id ?? "__solo__"}
                  activeOpacity={1}
                  onPress={() => setSelectedGroupId(option.id)}
                  style={[
                    styles.optionCard,
                    {
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected
                        ? isDark
                          ? `${colors.primary}26`
                          : `${colors.primary}14`
                        : colors.background,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.optionIconWrap,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Ionicons name={option.icon} size={16} color={isSelected ? "#FFF" : colors.primary} />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>{option.name}</Text>
                    <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>{option.subtitle}</Text>
                  </View>
                  {isSelected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderAboutContent = () => (
    <>
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
        <Text style={[styles.aboutDescription, { color: colors.textSecondary }]}> 
          {team?.description?.trim() || "No description provided."}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View
          style={[
            styles.statCard,
            { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Category</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>Production Team</Text>
        </View>
        <View
          style={[
            styles.statCard,
            { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>-</Text>
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


    </>
  );

  const renderConnectContent = () => {
    if (!canShowConnectTab) {
      return null;
    }

    return (
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.stateMessage, { color: colors.textSecondary, textAlign: "left", marginTop: 0 }]}> 
          Introduce yourself with a pitch, application context, a required CV upload, and a required video upload.
        </Text>

        {renderApplyAsOptions()}

        <Text style={[styles.infoLabel, { color: colors.textSecondary, marginTop: 16 }]}>Pitch / Intro *</Text>
        <View style={[styles.messageBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 8 }]}> 
          <TextInput
            style={[styles.messageInput, { color: colors.text }]}
            placeholder="Tell the team about your experience and why you'd be a good fit."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            value={requestMessage}
            onChangeText={setRequestMessage}
          />
        </View>

        <Text style={[styles.infoLabel, { color: colors.textSecondary, marginTop: 16 }]}>Application Context *</Text>
        <View style={[styles.messageBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 8 }]}> 
          <TextInput
            style={[styles.messageInput, { color: colors.text }]}
            placeholder="Share your strengths, availability, role interest, or what you can contribute."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            value={requestApplicationContext}
            onChangeText={setRequestApplicationContext}
          />
        </View>

        <View style={styles.uploadFieldWrap}>
          <DocumentUploader
            label="Upload CV/Resume *"
            onFileSelect={(file) => {
              setRequestDocumentFile(file);
              setRequestDocumentUrl("");
            }}
            existingUrl={requestDocumentUrl || undefined}
          />
        </View>

        <Text style={[styles.infoLabel, { color: colors.textSecondary, marginTop: 16 }]}>Upload Video / Reel *</Text>
        <VideoUploader
          videoUrl={requestVideoUrl || null}
          onVideoChange={(url) => setRequestVideoUrl(url || "")}
          userId={userId || ""}
          bucketName="documents"
          folder="performance-videos"
          maxSizeMB={50}
        />

        <TouchableOpacity
          activeOpacity={isSendingRequest ? 1 : 0.78}
          onPress={handleSendConnectionRequest}
          disabled={isSendingRequest}
          style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 16, opacity: isSendingRequest ? 0.6 : 1 }]}
        >
          {isSendingRequest ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {selectedApplicationGroup
                ? `Apply as ${selectedApplicationGroup.group_type === "duo" ? "Duo" : "Group"}`
                : "Apply as Solo"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderReviewContent = () => (
    <View>
      <View style={styles.reviewHeader}>
        <Text style={[styles.reviewRatingBig, { color: colors.text }]}>{reviewAverage.toFixed(1)}</Text>
        <View>
          <View style={{ flexDirection: "row" }}>
            {[1, 2, 3, 4, 5].map((index) => (
              <Ionicons
                key={index}
                name={index <= Math.round(reviewAverage) ? "star" : "star-outline"}
                size={14}
                color={colors.primary}
              />
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {reviews.length} reviews
          </Text>
        </View>
      </View>

      {loadingReviews ? (
        <View style={styles.selectorLoadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : reviews.length > 0 ? (
        <View style={styles.reviewsScroll}>
          {reviews.map((review) => (
            <View key={review.id} style={[styles.reviewCard, { borderColor: colors.border }]}>
              <View style={styles.reviewUser}>
                <CachedImage
                  uri={review.author?.avatar_url || null}
                  style={styles.reviewAvatar}
                  width={100}
                  height={100}
                  quality={68}
                  cacheVersion={review.author?.updated_at || review.updated_at || review.created_at || review.id}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reviewName, { color: colors.text }]}>
                    {review.author?.full_name || "Anonymous"}
                  </Text>
                  <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                    {formatDashedNumericDate(review.created_at)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.reviewBody, { color: colors.text }]}>{review.content || "No written review."}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>No reviews yet.</Text>
      )}
    </View>
  );

  return (
    <>
      <TrackedBottomSheetModal
        ref={ref}
        overlayLabel="ProductionTeamDetailsSheet"
        index={0}
        snapPoints={snapPoints}
        animationConfigs={animationConfigs}
        animateOnMount={true}
        enableDynamicSizing={false}
        enableOverDrag={false}
        enablePanDownToClose={true}
        backdropComponent={renderBackdrop}
        onDismiss={handleDismiss}
        backgroundStyle={{ backgroundColor: colors.background, borderRadius: 32 }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? "#4B5563" : "#E5E7EB",
          width: 40,
          marginTop: 10,
        }}
      >
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
            <View style={styles.imageContainer}>
              {team.logo_url ? (
                <CachedImage
                  uri={team.logo_url}
                  style={[styles.image, { backgroundColor: colors.border }]}
                />
              ) : (
                <View style={[styles.image, { backgroundColor: accentColor }]}>
                  <View style={[styles.heroFallbackMark, { backgroundColor: accentSoft }]}> 
                    <Ionicons name="people" size={42} color="#FFFFFF" />
                  </View>
                </View>
              )}

              <LinearGradient
                colors={
                  team.logo_url
                    ? ["rgba(0,0,0,0.48)", "transparent", "rgba(0,0,0,0.72)"]
                    : ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.28)", "rgba(0,0,0,0.56)"]
                }
                style={styles.gradient}
              />

              <View style={styles.headerActions}>
                <TouchableOpacity activeOpacity={1} onPress={closeSheet} style={styles.roundBtn}>
                  <Ionicons name="close" size={22} color="#000" />
                </TouchableOpacity>

                <View style={styles.rightActions}>
                  {canMessageTeamOwner ? (
                    <TouchableOpacity activeOpacity={1} onPress={openTeamChat} style={styles.roundBtn}>
                      <Ionicons name="chatbubble-ellipses-outline" size={22} color="#000" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity activeOpacity={1} onPress={handleShare} style={styles.roundBtn}>
                    <Ionicons name="share-outline" size={22} color="#000" />
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={1} onPress={toggleFavorite} style={styles.roundBtn}>
                    <Ionicons name={isFavorited ? "bookmark" : "bookmark-outline"} size={22} color={isFavorited ? "#6366F1" : "#000"} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.heroIdentity}>
                <Text style={styles.heroTitle}>{team.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                  <Ionicons name="people" size={14} color="#FFF" />
                  <Text style={[styles.heroMetaText, { marginLeft: 4 }]}>
                    {members.length} {members.length === 1 ? "member" : "members"}
                  </Text>
                  <Text style={[styles.heroMetaText, { marginLeft: 12 }]}>
                    {"• Led by "}{ownerMember?.full_name || "Production owner"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                  <Ionicons name="bookmark" size={13} color="#FFF" />
                  <Text style={[styles.heroMetaText, { marginLeft: 6 }]}>
                    {favoriteCount} bookmarked
                  </Text>
                </View>
              </View>
            </View>

            {showTabs ? renderTabs() : null}
            <SmoothTabTransition
              activeKey={activeTab}
              activeIndex={activeTabIndex}
              slideDistance={28}
              style={styles.contentBody}
            >
              {activeTab === "Connect"
                ? renderConnectContent()
                : activeTab === "Review"
                  ? renderReviewContent()
                  : renderAboutContent()}
            </SmoothTabTransition>
          </BottomSheetScrollView>
        )}
      </TrackedBottomSheetModal>

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />

      <Modal
        visible={isSendingRequest}
        onClose={() => { }}
        loading
        loadingMessage="Sending application..."
      />
    </>
  );
});

const styles = StyleSheet.create({
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
    paddingBottom: 24,
  },
  imageContainer: {
    height: 280,
    width: "100%",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerActions: {
    position: "absolute",
    top: 16,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  rightActions: {
    flexDirection: "row",
    gap: 12,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  heroIdentity: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 24,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  heroPill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroPillText: {
    color: "#FFF",
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  heroTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  heroMetaText: {
    color: "#FFF",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  heroMetaBullet: {
    color: "#FFF",
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    marginHorizontal: 2,
  },
  heroFallbackMark: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  contentBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flex: 1,
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  tabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  aboutDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "left",
  },
  aboutActionButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  aboutActionButtonText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    padding: 12,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
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
  optionList: {
    gap: 10,
    marginTop: 10,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  optionCopy: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  optionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  optionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
  selectorLoadingWrap: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
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
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    marginTop: 8,
  },
  reviewRatingBig: {
    fontSize: 56,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 64,
    letterSpacing: -1,
  },
  reviewsScroll: {
    gap: 16,
  },
  reviewCard: {
    width: "100%",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  reviewUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  reviewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  reviewName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  reviewDate: {
    fontSize: 12,
    opacity: 0.7,
  },
  reviewBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
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
  footerActions: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  secondaryIconButton: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  selectorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectorChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  messageBox: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 118,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageInput: {
    minHeight: 92,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  uploadFieldWrap: {
    paddingTop: 16,
  },
  compactInputBox: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 54,
    justifyContent: "center",
  },
  compactInput: {
    minHeight: 42,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlignVertical: "center",
  },
});

export default ProductionTeamDetailsSheet;
