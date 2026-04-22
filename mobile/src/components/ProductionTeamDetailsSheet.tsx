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
  Alert,
  ActivityIndicator,
  InteractionManager,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Easing } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useBottomBarClearance } from "../hooks/useBottomBarClearance";
import { submitListingRequest, uploadListingRequestDocument } from "../utils/listingRequests";
import CachedImage from "./CachedImage";
import DocumentUploader from "./DocumentUploader";
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
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("Musician");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestApplicationContext, setRequestApplicationContext] = useState("");
  const [requestDocumentFile, setRequestDocumentFile] = useState<any>(null);
  const [requestDocumentUrl, setRequestDocumentUrl] = useState("");
  const [requestVideoUrl, setRequestVideoUrl] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [userVenues, setUserVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

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
      setRequestMessage("");
      setRequestApplicationContext("");
      setRequestDocumentFile(null);
      setRequestDocumentUrl("");
      setRequestVideoUrl("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setErrorMessage("");
    setRequestMessage("");
    setRequestApplicationContext("");
    setRequestDocumentFile(null);
    setRequestDocumentUrl("");
    setRequestVideoUrl("");

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

  useEffect(() => {
    let active = true;

    if (!userId) {
      setCurrentUserRole(null);
      setCurrentUserName("Musician");
      setUserVenues([]);
      setSelectedVenueId(null);
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

        if (role === "venue-owner") {
          const { data: venues, error: venuesError } = await supabase
            .from("studios")
            .select("id, name, studio_type")
            .eq("owner_id", userId)
            .order("created_at", { ascending: false });

          if (venuesError) throw venuesError;
          if (!active) return;

          const venueRows = (venues || []).filter((row: any) => {
            const normalizedType = String(row?.studio_type || "").toLowerCase();
            return !normalizedType || normalizedType.includes("venue");
          });
          const nextVenues = (venueRows.length > 0 ? venueRows : venues || []).map((row: any) => ({
            id: row.id,
            name: row.name || "Venue",
          }));

          setUserVenues(nextVenues);
          setSelectedVenueId((current) =>
            current && nextVenues.some((venue) => venue.id === current)
              ? current
              : nextVenues[0]?.id || null,
          );
        } else {
          setUserVenues([]);
          setSelectedVenueId(null);
        }
      } catch (error) {
        console.error("Error loading request context:", error);
        if (!active) return;
        setCurrentUserRole(null);
        setUserVenues([]);
        setSelectedVenueId(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

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
  const canMessageTeamOwner = Boolean(team?.owner_id && team.owner_id !== userId);
  const selectedVenue = useMemo(
    () => userVenues.find((venue) => venue.id === selectedVenueId) || null,
    [selectedVenueId, userVenues],
  );

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
    if (!userId || !team?.id || !team.owner_id) {
      Alert.alert("Error", "This request is unavailable right now.");
      return;
    }

    const normalizedPitchMessage = requestMessage.trim();
    if (!normalizedPitchMessage) {
      Alert.alert("Pitch Required", "Add a short pitch before sending the request.");
      return;
    }

    if (currentUserRole === "venue-owner" && !selectedVenue) {
      Alert.alert("Select Venue", "Choose which venue is inviting this production team.");
      return;
    }

    const normalizedApplicationContext = requestApplicationContext.trim();
    const normalizedVideoUrl = requestVideoUrl.trim();
    if (!normalizedApplicationContext) {
      Alert.alert(
        currentUserRole === "venue-owner" ? "Invite Context Required" : "Application Context Required",
        currentUserRole === "venue-owner"
          ? "Add the invite context before sending this invite."
          : "Add the application context before sending this application.",
      );
      return;
    }

    if (!requestDocumentFile && !requestDocumentUrl.trim()) {
      Alert.alert(
        currentUserRole === "venue-owner" ? "Contract Required" : "CV Required",
        currentUserRole === "venue-owner"
          ? "Upload a contract PDF before sending this invite."
          : "Upload your CV before sending this application.",
      );
      return;
    }

    if (currentUserRole !== "venue-owner" && !normalizedVideoUrl) {
      Alert.alert("Video Required", "Add a video or reel link before sending this application.");
      return;
    }

    let uploadedDocumentUrl = requestDocumentUrl.trim() || null;
    if (requestDocumentFile) {
      try {
        uploadedDocumentUrl = await uploadListingRequestDocument(
          userId,
          requestDocumentFile,
          currentUserRole === "venue-owner" ? "contracts" : "applications",
        );
      } catch (uploadError) {
        console.error("Error uploading request document:", uploadError);
        Alert.alert(
          "Upload Failed",
          currentUserRole === "venue-owner"
            ? "We couldn't upload the contract right now."
            : "We couldn't upload the CV right now.",
        );
        return;
      }
    }

    const requestDetails = {
      pitch_message: normalizedPitchMessage,
      application_context: normalizedApplicationContext,
      context_label: currentUserRole === "venue-owner" ? "Invite Context" : "Application Context",
      request_kind: currentUserRole === "venue-owner" ? "invite" : "application",
      cv_url: currentUserRole === "venue-owner" ? null : uploadedDocumentUrl,
      video_url: currentUserRole === "venue-owner" ? null : normalizedVideoUrl,
      contract_url: currentUserRole === "venue-owner" ? uploadedDocumentUrl : null,
    };

    setIsSendingRequest(true);
    try {
      if (currentUserRole === "venue-owner") {
        await submitListingRequest({
          currentUserId: userId,
          receiverUserId: team.owner_id,
          message: normalizedPitchMessage,
          senderEntityType: "venue",
          senderEntityName: selectedVenue?.name || "Venue",
          senderEntityId: selectedVenue?.id || null,
          receiverEntityType: "production_team",
          receiverEntityName: team.name,
          receiverEntityId: team.id,
          studioId: selectedVenue?.id || null,
          productionTeamId: team.id,
          notificationTitle: "New venue invite",
          notificationMessage: `${selectedVenue?.name || "A venue"} invited your team to connect on MusikaLokal.`,
          notificationImage: team.logo_url || null,
          attachmentUrl: uploadedDocumentUrl,
          extraMeta: {
            source: "production_team_details",
            request_kind: "invite",
            request_details: requestDetails,
          },
        });
      } else {
        await submitListingRequest({
          currentUserId: userId,
          receiverUserId: team.owner_id,
          message: normalizedPitchMessage,
          senderEntityType: "musician",
          senderEntityName: currentUserName,
          senderEntityId: userId,
          receiverEntityType: "production_team",
          receiverEntityName: team.name,
          receiverEntityId: team.id,
          productionTeamId: team.id,
          notificationTitle: "New team application",
          notificationMessage: `${currentUserName} wants to join ${team.name}.`,
          notificationImage: team.logo_url || null,
          attachmentUrl: uploadedDocumentUrl,
          extraMeta: {
            source: "production_team_details",
            request_kind: "application",
            request_details: requestDetails,
          },
        });
      }

      setRequestMessage("");
      setRequestApplicationContext("");
      setRequestDocumentFile(null);
      setRequestDocumentUrl("");
      setRequestVideoUrl("");
      Alert.alert(
        "Success",
        currentUserRole === "venue-owner"
          ? "Your structured team invite has been sent."
          : "Your structured application has been sent.",
      );
    } catch (error) {
      console.error("Error sending production team request:", error);
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "We couldn't send that request right now.";
      Alert.alert("Error", errorMessage);
    } finally {
      setIsSendingRequest(false);
    }
  }, [
    currentUserName,
    currentUserRole,
    requestApplicationContext,
    requestDocumentFile,
    requestDocumentUrl,
    requestMessage,
    requestVideoUrl,
    selectedVenue,
    team?.id,
    team?.logo_url,
    team?.name,
    team?.owner_id,
    userId,
  ]);

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

          {team && membershipRole == null && (currentUserRole === "musician" || currentUserRole === "venue-owner") ? (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {currentUserRole === "venue-owner" ? "Invite Production Team" : "Apply To This Team"}
              </Text>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <Text style={[styles.stateMessage, { color: colors.textSecondary, textAlign: "left", marginTop: 0 }]}> 
                  {currentUserRole === "venue-owner"
                    ? "Choose which venue is reaching out, then send a structured invite with a pitch, invite context, and a required contract upload."
                    : "Introduce yourself with a pitch, application context, a required CV upload, and a required video link."}
                </Text>

                {currentUserRole === "venue-owner" ? (
                  userVenues.length > 0 ? (
                    <View style={styles.selectorWrap}>
                      {userVenues.map((venue) => {
                        const isSelected = selectedVenueId === venue.id;
                        return (
                          <TouchableOpacity
                            key={venue.id}
                            activeOpacity={0.85}
                            onPress={() => setSelectedVenueId(venue.id)}
                            style={[
                              styles.selectorChip,
                              {
                                backgroundColor: isSelected ? colors.primary : colors.background,
                                borderColor: isSelected ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <Ionicons name="business-outline" size={14} color={isSelected ? "#FFF" : colors.textSecondary} />
                            <Text style={[styles.selectorChipText, { color: isSelected ? "#FFF" : colors.text }]}>{venue.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => router.push("/my_venue")}
                      style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 16 }]}
                    >
                      <Text style={styles.primaryButtonText}>Create Venue First</Text>
                    </TouchableOpacity>
                  )
                ) : null}

                <Text style={[styles.infoLabel, { color: colors.textSecondary, marginTop: 16 }]}>Pitch / Intro *</Text>
                <View style={[styles.messageBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 8 }]}> 
                  <TextInput
                    style={[styles.messageInput, { color: colors.text }]}
                    placeholder={currentUserRole === "venue-owner" ? "Tell the team what kind of event or partnership you have in mind." : "Tell the team about your experience and why you'd be a good fit."}
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    textAlignVertical="top"
                    value={requestMessage}
                    onChangeText={setRequestMessage}
                  />
                </View>

                <Text style={[styles.infoLabel, { color: colors.textSecondary, marginTop: 16 }]}>
                  {currentUserRole === "venue-owner" ? "Invite Context *" : "Application Context *"}
                </Text>
                <View style={[styles.messageBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 8 }]}> 
                  <TextInput
                    style={[styles.messageInput, { color: colors.text }]}
                    placeholder={currentUserRole === "venue-owner" ? "Share event details, timing, technical scope, or partnership context." : "Share your strengths, availability, role interest, or what you can contribute."}
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    textAlignVertical="top"
                    value={requestApplicationContext}
                    onChangeText={setRequestApplicationContext}
                  />
                </View>

                <DocumentUploader
                  label={currentUserRole === "venue-owner" ? "Upload Contract *" : "Upload CV/Resume *"}
                  onFileSelect={(file) => {
                    setRequestDocumentFile(file);
                    setRequestDocumentUrl("");
                  }}
                  existingUrl={requestDocumentUrl || undefined}
                />

                {currentUserRole !== "venue-owner" ? (
                  <>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary, marginTop: 16 }]}>Video / Reel Link *</Text>
                    <View style={[styles.compactInputBox, { backgroundColor: colors.background, borderColor: colors.border }]}> 
                      <TextInput
                        style={[styles.compactInput, { color: colors.text }]}
                        placeholder="Paste a YouTube, Drive, or portfolio video link"
                        placeholderTextColor={colors.textSecondary}
                        value={requestVideoUrl}
                        onChangeText={setRequestVideoUrl}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                  </>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleSendConnectionRequest}
                  disabled={isSendingRequest || (currentUserRole === "venue-owner" && userVenues.length === 0)}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 16 }]}
                >
                  {isSendingRequest ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {currentUserRole === "venue-owner" ? "Send Venue Invite" : "Send Team Application"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

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

          <View style={styles.footerActions}>
            {canMessageTeamOwner ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={openTeamChat}
                style={[styles.secondaryIconButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleOpenFullPage}
              style={[styles.primaryButton, { backgroundColor: colors.primary, flex: 1, marginTop: 0 }]}
            >
              <Ionicons name="open-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
            </TouchableOpacity>
          </View>
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
  },
});

export default ProductionTeamDetailsSheet;