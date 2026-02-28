import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  Modal as RNModal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { PH_MUSIC_GROUP_TYPES } from "../src/constants/groupTypes";
import { useTheme } from "../src/context/ThemeContext";
import {
  getGroupMembersLabel,
  getGroupTypeLabel,
  isGroupLeaderMember,
} from "../src/utils/groupMembers";

import { useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

const GENRES = [
  "Rock",
  "Pop",
  "Jazz",
  "Blues",
  "Hip Hop",
  "R&B",
  "Country",
  "Electronic",
  "Classical",
  "Reggae",
  "Metal",
  "Punk",
  "Folk",
  "Soul",
  "Funk",
  "Disco",
  "Indie",
  "Alternative",
  "Latin",
  "World Music",
  "Gospel",
  "EDM",
  "House",
  "Techno",
  "Dubstep",
  "Acoustic",
  "Instrumental",
  "Ambient",
  "Lo-Fi",
  "OPM",
];

export default function EditGroupScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [groupName, setGroupName] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: {
      text: string;
      onPress?: () => void;
      style?: "default" | "cancel" | "destructive";
    }[];
  }>({
    type: "info",
    title: "",
    message: "",
  });

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: {
      text: string;
      onPress?: () => void;
      style?: "default" | "cancel" | "destructive";
    }[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const handleAttemptLeave = useCallback(() => {
    if (saving) return;

    showAlert(
      "warning",
      "Leave edit group?",
      "Your current edits won't be saved unless you tap Save Changes.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => router.back() },
      ],
    );
  }, [saving]);

  // Enhanced member structure: { name, instrument, role?, user_id?, avatar_url? }
  interface MemberDetail {
    name: string;
    instrument: string;
    role?: string; // "Leader" for group creator
    user_id?: string;
    avatar_url?: string;
  }
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [newMemberInstrument, setNewMemberInstrument] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingMember, setPendingMember] = useState<any>(null);

  // Group type based on the constants
  const [groupType, setGroupType] = useState<string>("band");
  const [groupTypeModalVisible, setGroupTypeModalVisible] = useState(false);

  // Leadership Transfer State
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [pendingTransfer, setPendingTransfer] = useState<any>(null);
  const [selectedNewLeader, setSelectedNewLeader] = useState<any>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [groupOwnerId, setGroupOwnerId] = useState<string | null>(null);
  const [initialGroupType, setInitialGroupType] = useState<string>("band");
  const [initialMemberUserIds, setInitialMemberUserIds] = useState<string[]>([]);
  const [impactSummary, setImpactSummary] = useState({
    activeApplications: 0,
    activeBookings: 0,
  });

  // Role-based access control
  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      // Store user ID for leadership transfer
      setCurrentUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profile?.role !== "musician") {
        showAlert("error", "Unauthorized", "Only musicians can edit groups.");
        router.replace("/home");
        return;
      }

      setAuthorized(true);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/home");
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    if (authorized && id) {
      fetchGroupDetails();
    }
  }, [id, authorized]);

  useEffect(() => {
    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleAttemptLeave();
        return true;
      },
    );

    return () => backSubscription.remove();
  }, [handleAttemptLeave]);

  const getLeaderIndex = (list: MemberDetail[] = members) =>
    list.findIndex((member) => isGroupLeaderMember(member, groupOwnerId));

  const hasActiveEngagements =
    impactSummary.activeApplications > 0 || impactSummary.activeBookings > 0;

  const groupMembersLabel = getGroupMembersLabel(groupType);

  const fetchGroupImpactSummary = async (groupId: string) => {
    try {
      const activeApplicationStatuses = [
        "pending",
        "applied",
        "Pending",
        "Applied",
      ];

      const activeBookingStatuses = [
        "accepted",
        "approved",
        "confirmed",
        "Accepted",
        "Approved",
        "Confirmed",
        "Happening Now",
        "happening_now",
        "happening now",
      ];

      const { count: appCount, error: appError } = await supabase
        .from("gig_applications")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .in("status", activeApplicationStatuses);

      const { count: bookingCount, error: bookingError } = await supabase
        .from("gig_applications")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .in("status", activeBookingStatuses);

      if (!appError || !bookingError) {
        setImpactSummary({
          activeApplications: appError ? 0 : appCount || 0,
          activeBookings: bookingError ? 0 : bookingCount || 0,
        });
      }
    } catch (impactError) {
      console.log("Unable to fetch impact summary:", impactError);
    }
  };

  const fetchGroupDetails = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      // Ensure id is a string, not an array
      const groupId = Array.isArray(id) ? id[0] : id;
      if (!groupId) {
        showAlert("error", "Error", "Invalid group ID");
        router.replace("/home");
        return;
      }

      // Base query + legacy projection merge
      const { data: baseData, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .eq('owner_id', user.id)
        .single();

      const { data: legacyData, error: legacyError } = await supabase
        .from('groups_legacy_projection')
        .select('members, images')
        .eq('id', groupId)
        .single();

      if (error) throw error;
      if (legacyError) throw legacyError;

      if (!baseData) {
        showAlert(
          "error",
          "Not Found",
          "Group not found or you do not have permission to edit it.",
        );
        router.replace("/home");
        return;
      }

      const data = {
        ...baseData,
        members: legacyData?.members || [],
        images: legacyData?.images || [],
      } as any;

      // If no data returned, user doesn't own this group
      if (!data) {
        showAlert(
          "error",
          "Not Found",
          "Group not found or you do not have permission to edit it.",
        );
        router.replace("/home");
        return;
      }

      setGroupName(data.name);
      // Parse genre string into array
      if (data.genre) {
        const genreArray = data.genre
          .split(",")
          .map((g: string) => g.trim())
          .filter((g: string) => g);
        setSelectedGenres(genreArray);
      }
      setDescription(data.description);
      setGroupOwnerId(data.owner_id || null);
      setAddress(data.location || "");
      setLatitude(data.latitude || null);
      setLongitude(data.longitude || null);
      // Load group type (default to 'band' for backward compatibility)
      const loadedType = data.group_type || "band";
      setGroupType(loadedType);
      setInitialGroupType(loadedType);
      // Handle both old string[] format and new MemberDetail[] format
      const rawMembers = data.members || [];
      const parsedMembers: MemberDetail[] = rawMembers.map(
        (m: any) => {
          if (typeof m === "string") {
            // Old format: just a string (instrument or name)
            return {
              name: m,
              instrument: m,
            };
          }
          // New format: already an object
          return m;
        },
      );

      const { data: dbMembers, error: dbMembersError } = await supabase
        .from("group_members")
        .select("user_id, role, profiles:user_id(full_name, avatar_url)")
        .eq("group_id", groupId);

      const membersFromDb: MemberDetail[] = [];
      const addedUserIds = new Set<string>();
      const dbRows = dbMembersError ? [] : dbMembers || [];

      dbRows.forEach((row: any) => {
        const matchedByUser = parsedMembers.find(
          (member) => member.user_id && member.user_id === row.user_id,
        );
        const matchedByName = parsedMembers.find(
          (member) =>
            !member.user_id &&
            member.name &&
            row.profiles?.full_name &&
            member.name.toLowerCase() ===
            String(row.profiles.full_name).toLowerCase(),
        );
        const matchedMember = matchedByUser || matchedByName;

        membersFromDb.push({
          name: matchedMember?.name || row.profiles?.full_name || "Unknown",
          instrument: matchedMember?.instrument || "",
          role:
            row.user_id === data.owner_id || row.role === "owner"
              ? "Leader"
              : matchedMember?.role,
          user_id: row.user_id,
          avatar_url: matchedMember?.avatar_url || row.profiles?.avatar_url,
        });
        if (row.user_id) {
          addedUserIds.add(row.user_id);
        }
      });

      const manualMembers = parsedMembers.filter(
        (member) => !member.user_id || !addedUserIds.has(member.user_id),
      );

      const combinedMembers =
        membersFromDb.length > 0
          ? [...membersFromDb, ...manualMembers]
          : parsedMembers.map((member) => ({
            ...member,
            role:
              member.user_id && member.user_id === data.owner_id
                ? "Leader"
                : member.role,
          }));

      setMembers(combinedMembers);
      setInitialMemberUserIds(
        (membersFromDb.length > 0 ? membersFromDb : combinedMembers)
          .map((member) => member.user_id)
          .filter((memberId): memberId is string => !!memberId),
      );
      setImages(data.images || []);
      if (data.images && data.images.length > 0) {
        setThumbnailIndex(0);
      }

      fetchGroupImpactSummary(groupId);
    } catch (e) {
      console.log("Error fetching group details:", e);
      showAlert("error", "Error", "Failed to load group details.");
      router.replace("/home");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    if (!groupName.trim()) {
      showAlert("error", "Required Field", "Please enter a group name");
      return false;
    }
    if (selectedGenres.length === 0) {
      showAlert("error", "Required Field", "Please select at least one genre");
      return false;
    }
    if (!description.trim()) {
      showAlert("error", "Required Field", "Please enter a description");
      return false;
    }
    if (!address || !latitude || !longitude) {
      showAlert(
        "error",
        "Required Field",
        "Please select a location on the map",
      );
      return false;
    }
    if (images.length === 0) {
      showAlert(
        "error",
        "Required Field",
        "Please upload at least one group photo",
      );
      return false;
    }
    // Validate leader has an instrument
    const leader = members.find((m) => isGroupLeaderMember(m, groupOwnerId));
    if (!leader?.instrument?.trim()) {
      showAlert(
        "error",
        "Leader Instrument Required",
        "Please enter your instrument/role as the group leader.",
      );
      return false;
    }
    // Validate member count based on group type
    const selectedType = PH_MUSIC_GROUP_TYPES.find((t) => t.id === groupType);
    if (selectedType) {
      if (members.length < selectedType.minMembers) {
        showAlert(
          "warning",
          `${selectedType.label} Requirement`,
          `A ${selectedType.label} must have at least ${selectedType.minMembers} members. Adjust members or change group type.`,
        );
        return false;
      }
    }
    return true;
  };

  const performSave = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaving(false);
        return;
      }

      // Ensure id is a string, not an array
      const groupId = Array.isArray(id) ? id[0] : id;
      if (!groupId) {
        showAlert("error", "Error", "Invalid group ID");
        setSaving(false);
        return;
      }

      const orderedImages =
        images.length > 0 && images[thumbnailIndex]
          ? [
            images[thumbnailIndex],
            ...images.filter((_, i) => i !== thumbnailIndex),
          ]
          : images;

      const payload = {
        name: groupName,
        genre: selectedGenres.join(", "),
        description,
        location: address,
        latitude,
        longitude,
        members,
        images: orderedImages,
        group_type: groupType, // 'duo' or 'band'
      };

      // Direct update to groups table
      const { error } = await supabase
        .from('groups')
        .update({
          name: payload.name,
          genre: payload.genre,
          description: payload.description,
          location: payload.location,
          latitude: payload.latitude,
          longitude: payload.longitude,
          group_type: payload.group_type,
        })
        .eq('id', groupId)
        .eq('owner_id', user.id);

      if (error) {
        console.error('❌ Update failed with error:', error);
        // Note: invoke returns { data, error } but here only error was destructured. 
        // We can't access data unless we change destructuring, but error usually contains info.

        let errorMsg = error.message || "Unknown error";
        let alertMessage = `Failed to update group: ${errorMsg}`;

        // If it's a FunctionsHttpError, context might have details, 
        // but simply dumping stringified error is a safe bet for "similar all error"
        if (errorMsg.includes("non-2xx")) {
          alertMessage += `\n\nRaw: ${JSON.stringify(error)}`;
        }

        showAlert("error", "Error", alertMessage);
        return;
      }

      await supabase.from('group_roster_members').delete().eq('group_id', groupId);
      const rosterRows = (payload.members || []).map((member: any, index: number) => ({
        group_id: groupId,
        user_id: member.user_id || null,
        member_name: member.name || null,
        member_role: member.role || null,
        instrument: member.instrument || null,
        avatar_url: member.avatar_url || null,
        sort_order: index,
        raw_member: member,
      }));
      if (rosterRows.length > 0) {
        const { error: rosterError } = await supabase
          .from('group_roster_members')
          .insert(rosterRows);
        if (rosterError) {
          showAlert("error", "Error", `Group profile updated but failed to sync roster: ${rosterError.message || "Unknown error"}`);
          return;
        }
      }

      await supabase.from('group_media').delete().eq('group_id', groupId).eq('media_type', 'image');
      const imageRows = (payload.images || []).map((media_url: string, index: number) => ({
        group_id: groupId,
        media_type: 'image',
        media_url,
        sort_order: index,
      }));
      if (imageRows.length > 0) {
        const { error: mediaError } = await supabase
          .from('group_media')
          .insert(imageRows);
        if (mediaError) {
          showAlert("error", "Error", `Group profile updated but failed to sync images: ${mediaError.message || "Unknown error"}`);
          return;
        }
      }

      const desiredMemberUserIds = Array.from(
        new Set(
          [
            user.id,
            ...(members || [])
              .map((member) => member?.user_id)
              .filter((memberId): memberId is string =>
                typeof memberId === "string" && memberId.trim().length > 0,
              ),
          ],
        ),
      );

      const membershipRows = desiredMemberUserIds.map((memberId) => ({
        group_id: groupId,
        user_id: memberId,
        role: memberId === user.id ? "owner" : "member",
      }));

      const { error: upsertMembersError } = await supabase
        .from("group_members")
        .upsert(membershipRows, { onConflict: "group_id,user_id" });

      if (upsertMembersError) {
        showAlert(
          "error",
          "Error",
          `Group profile updated but failed to sync members: ${upsertMembersError.message || "Unknown error"}`,
        );
        return;
      }

      if (desiredMemberUserIds.length > 0) {
        const inClause = `(${desiredMemberUserIds.map((id) => `"${id}"`).join(",")})`;
        const { error: deleteStaleMembersError } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .not("user_id", "in", inClause);

        if (deleteStaleMembersError) {
          showAlert(
            "error",
            "Error",
            `Group profile updated but failed to remove stale members: ${deleteStaleMembersError.message || "Unknown error"}`,
          );
          return;
        }
      }

      console.log("✅ Group Updated");
      showAlert("success", "Success", "Group updated successfully!", [
        {
          text: "OK",
          onPress: () => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace({ pathname: "/manage_group", params: { id: groupId } });
            }
          },
        },
      ]);
    } catch (e: any) {
      console.log("❌ Error updating group:", e);
      showAlert(
        "error",
        "Error",
        `Failed to update group: ${e?.message || "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    const currentMemberUserIds = Array.from(
      new Set(
        members
          .map((member) => member.user_id)
          .filter((memberId): memberId is string =>
            typeof memberId === "string" && memberId.trim().length > 0,
          ),
      ),
    );
    const removedMemberCount = initialMemberUserIds.filter(
      (memberId) => !currentMemberUserIds.includes(memberId),
    ).length;
    const typeChanged = groupType !== initialGroupType;

    const cautionPoints: string[] = [];
    if (typeChanged) {
      cautionPoints.push(
        `- Group type will change from ${getGroupTypeLabel(initialGroupType)} to ${getGroupTypeLabel(groupType)}.`,
      );
    }
    if (removedMemberCount > 0) {
      cautionPoints.push(
        `- ${removedMemberCount} synced member(s) will lose active membership access.`,
      );
    }
    if (hasActiveEngagements && (typeChanged || removedMemberCount > 0)) {
      cautionPoints.push(
        `- This group has ${impactSummary.activeApplications} active application(s) and ${impactSummary.activeBookings} active booking(s).`,
      );
    }

    const cautionMessage =
      cautionPoints.length > 0
        ? `Review impact before saving:\n\n${cautionPoints.join("\n")}`
        : "Are you sure you want to update this group profile?";

    showAlert(
      "warning",
      "Save Changes",
      cautionMessage,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save & Update",
          style: "default",
          onPress: () => performSave(),
        },
      ],
    );
  };

  const searchMusicians = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("role", "musician")
        .ilike("full_name", `%${query}%`)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error("Error searching musicians:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const selectMember = (musician: any) => {
    // Check if already added
    if (
      members.some(
        (m) => m.user_id === musician.id || m.name === musician.full_name,
      )
    ) {
      showAlert(
        "warning",
        "Already Added",
        "This musician is already in the group.",
      );
      setSearchQuery("");
      setSearchResults([]);
      return;
    }
    setPendingMember(musician);
    setSearchQuery("");
    setSearchResults([]);
  };

  const confirmAddMember = (instrument: string) => {
    if (pendingMember && instrument.trim()) {
      const newMember: MemberDetail = {
        name: pendingMember.full_name,
        instrument: instrument.trim(),
        user_id: pendingMember.id,
        avatar_url: pendingMember.avatar_url,
      };
      setMembers([...members, newMember]);
      setPendingMember(null);
      setNewMemberInstrument("");
    }
  };

  const removeMember = (index: number) => {
    const member = members[index];
    if (!member) return;

    // Prevent removing the leader
    if (isGroupLeaderMember(member, groupOwnerId)) {
      showAlert(
        "warning",
        "Cannot Remove",
        "You cannot remove the group leader.",
      );
      return;
    }

    const memberName = member.name || "this member";
    const impactLine = hasActiveEngagements
      ? `\n\nThis group currently has ${impactSummary.activeApplications} active application(s) and ${impactSummary.activeBookings} active booking(s).`
      : "";

    showAlert(
      "warning",
      "Remove Member",
      `Remove ${memberName} from this ${groupType === "duo" ? "duo" : "band"}?${impactLine}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => setMembers(members.filter((_, i) => i !== index)),
        },
      ],
    );
  };

  const updateMemberInstrument = (index: number, instrument: string) => {
    setMembers((prev) =>
      prev.map((member, memberIndex) =>
        memberIndex === index ? { ...member, instrument } : member,
      ),
    );
  };

  const handleGroupTypeChange = (nextType: string) => {
    if (nextType === groupType) return;

    const selectedType = PH_MUSIC_GROUP_TYPES.find((t) => t.id === nextType);
    if (!selectedType) return;

    const memberCount = members.length;
    const typeMismatchWarning =
      memberCount >= selectedType.minMembers
        ? ""
        : `\n\nA ${selectedType.label} requires at least ${selectedType.minMembers} members.`;
    const impactLine = hasActiveEngagements
      ? `\n\nThis group has ${impactSummary.activeApplications} active application(s) and ${impactSummary.activeBookings} active booking(s).`
      : "";

    showAlert(
      "warning",
      "Change Group Type",
      `Switch this group from ${PH_MUSIC_GROUP_TYPES.find((t) => t.id === groupType)?.label || getGroupTypeLabel(groupType)} to ${selectedType.label}?${typeMismatchWarning}${impactLine}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            setGroupType(nextType);
            setGroupTypeModalVisible(false);
          },
        },
      ],
    );
  };

  // ============================================================
  // Leadership Transfer Functions
  // ============================================================

  // Fetch actual group members from group_members table
  const fetchGroupMembers = async () => {
    if (!id) return;

    try {
      const groupId = Array.isArray(id) ? id[0] : id;
      const { data, error } = await supabase
        .from("group_members")
        .select("user_id, role, profiles:user_id(id, full_name, avatar_url)")
        .eq("group_id", groupId);

      if (error) {
        console.log("Error fetching group members:", error);
        return;
      }

      // Only include members who aren't the current user (can't transfer to yourself)
      const filteredMembers = (data || [])
        .filter((m: any) => m.user_id !== currentUserId)
        .map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          full_name: m.profiles?.full_name || "Unknown",
          avatar_url: m.profiles?.avatar_url,
        }));

      setGroupMembers(filteredMembers);
    } catch (e) {
      console.error("Error fetching group members:", e);
    }
  };

  // Fetch pending transfer request for this group
  const fetchPendingTransfer = async () => {
    if (!id) return;

    try {
      const groupId = Array.isArray(id) ? id[0] : id;
      const { data, error } = await supabase
        .from("leadership_transfer_requests")
        .select("*, to_user:to_user_id(full_name, avatar_url)")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .maybeSingle();

      if (error) {
        console.log("Error fetching pending transfer:", error);
        return;
      }

      setPendingTransfer(data);
    } catch (e) {
      console.error("Error fetching pending transfer:", e);
    }
  };

  // Initiate leadership transfer
  const initiateTransfer = async () => {
    if (!selectedNewLeader || !id || !currentUserId) return;

    setIsTransferring(true);
    try {
      const groupId = Array.isArray(id) ? id[0] : id;

      // Create transfer request
      const { data, error } = await supabase
        .from("leadership_transfer_requests")
        .insert({
          group_id: groupId,
          from_user_id: currentUserId,
          to_user_id: selectedNewLeader.user_id,
          message: transferMessage || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating transfer request:", error);
        showAlert(
          "error",
          "Error",
          "Failed to send transfer request. " + (error.message || ""),
        );
        return;
      }

      // Direct insert to notifications table
      await supabase.from('notifications').insert({
        user_id: selectedNewLeader.user_id,
        type: "info",
        title: "Leadership Transfer Request",
        message: `You have been invited to become the leader of "${groupName}". Open to accept or decline.`,
        meta: {
          type: "leadership_transfer",
          request_id: data.id,
          group_id: groupId,
          group_name: groupName,
        },
        read: false,
      });

      showAlert(
        "success",
        "Request Sent",
        `Leadership transfer request sent to ${selectedNewLeader.full_name}. They must accept to complete the transfer.`,
      );

      // Reset and refresh
      setTransferModalVisible(false);
      setSelectedNewLeader(null);
      setTransferMessage("");
      fetchPendingTransfer();
    } catch (e) {
      console.error("Error initiating transfer:", e);
      showAlert("error", "Error", "Failed to send transfer request.");
    } finally {
      setIsTransferring(false);
    }
  };

  // Cancel pending transfer
  const cancelTransfer = async () => {
    if (!pendingTransfer) return;

    showAlert(
      "warning",
      "Cancel Transfer",
      "Are you sure you want to cancel this leadership transfer request?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase.rpc(
                "cancel_leadership_transfer",
                {
                  request_id: pendingTransfer.id,
                },
              );

              if (error) throw error;

              showAlert(
                "success",
                "Cancelled",
                "Transfer request has been cancelled.",
              );
              setPendingTransfer(null);
            } catch (e) {
              console.error("Error cancelling transfer:", e);
              showAlert("error", "Error", "Failed to cancel transfer request.");
            }
          },
        },
      ],
    );
  };

  // Fetch group members and pending transfer when group loads
  useEffect(() => {
    if (authorized && id && currentUserId) {
      fetchGroupMembers();
      fetchPendingTransfer();
    }
  }, [authorized, id, currentUserId]);

  const renderSectionHeader = (title: string, icon: string) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={18} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );

  const renderInput = (
    label: string,
    value: string,
    setValue: (text: string) => void,
    multiline = false,
  ) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.inputWrapper,
          {
            borderColor: isDark ? "#374151" : "#E5E7EB",
            backgroundColor: colors.inputBackground,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          style={[
            styles.input,
            {
              fontFamily: "Poppins_400Regular",
              color: colors.text,
              height: multiline ? 120 : "auto",
              textAlign: "left",
              textAlignVertical: multiline ? "top" : "center",
            },
          ]}
        />
      </View>
    </View>
  );

  // Show loading while checking authorization
  if (checkingAuth) {
    return (
      <View
        style={[
          styles.flex1,
          styles.centerContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={{
            marginTop: 16,
            color: colors.textSecondary,
            fontFamily: "Poppins_400Regular",
          }}
        >
          Checking permissions...
        </Text>
      </View>
    );
  }

  // Don't render if not authorized
  if (!authorized) {
    return null;
  }

  // Show loading while fetching data
  if (loading) {
    return (
      <View
        style={[
          styles.flex1,
          styles.centerContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={{
            marginTop: 16,
            color: colors.textSecondary,
            fontFamily: "Poppins_400Regular",
          }}
        >
          Loading group details...
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Edit Group" onBackPress={handleAttemptLeave} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.flex1}
        >
          {renderSectionHeader("Group Details", "people")}

          {/* Group Type Selection */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Group Type
            </Text>

            <TouchableOpacity activeOpacity={1}
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }
              ]}
              onPress={() => setGroupTypeModalVisible(true)}
            >
              <Text style={{ color: colors.text, fontFamily: "Poppins_400Regular" }}>
                {PH_MUSIC_GROUP_TYPES.find(t => t.id === groupType)?.label || getGroupTypeLabel(groupType)}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Info about selected type */}
            {groupType && PH_MUSIC_GROUP_TYPES.find(t => t.id === groupType) && (
              <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Poppins_400Regular" }}>
                  Minimum Members: {PH_MUSIC_GROUP_TYPES.find(t => t.id === groupType)?.minMembers || 1}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 2 }}>
                  Roles: {PH_MUSIC_GROUP_TYPES.find(t => t.id === groupType)?.requiredRoles.join(", ")}
                </Text>
              </View>
            )}
          </View>

          {renderInput("Group Name", groupName, setGroupName)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Based Location
            </Text>
            <TouchableOpacity activeOpacity={1}
              onPress={() => setLocationPickerVisible(true)}
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  padding: 16,
                },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={colors.textSecondary}
                />
                <Text
                  style={{
                    flex: 1,
                    color: address ? colors.text : colors.textSecondary,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  {address || "Tap to select location on map"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Genre Multi-Select */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Genre
            </Text>
            <View style={styles.genreChipsContainer}>
              {(showAllGenres ? GENRES : GENRES.slice(0, 8)).map((genre) => {
                const selected = selectedGenres.includes(genre);
                return (
                  <TouchableOpacity activeOpacity={1}
                    key={genre}
                    onPress={() => {
                      setSelectedGenres((prev) =>
                        selected
                          ? prev.filter((g) => g !== genre)
                          : [...prev, genre],
                      );
                    }}
                    style={[
                      styles.genreChip,
                      {
                        backgroundColor: selected
                          ? colors.primary
                          : isDark
                            ? "#374151"
                            : "#F3F4F6",
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.genreChipText,
                        {
                          color: selected ? "#FFFFFF" : colors.text,
                        },
                      ]}
                    >
                      {genre}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity activeOpacity={1}
              onPress={() => setShowAllGenres(!showAllGenres)}
              style={styles.showMoreButton}
            >
              <Text style={[styles.showMoreText, { color: colors.primary }]}>
                {showAllGenres
                  ? "Show Less"
                  : `Show More (${GENRES.length - 8} more)`}
              </Text>
              <Ionicons
                name={showAllGenres ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {renderInput("Description", description, setDescription, true)}

          {renderSectionHeader("Visuals", "image")}
          <ImageUploader
            images={images}
            onImagesChange={setImages}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
            maxImages={10}
            bucketName="listings"
            userId={id as string}
            folder="groups"
          />

          {renderSectionHeader(groupMembersLabel, "person")}

          {/* Add Members Section */}
          <View style={styles.addMemberSection}>
            {/* Search Bar */}
            {!pendingMember && (
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.searchIcon}
                />
                <TextInput
                  value={searchQuery}
                  onChangeText={searchMusicians}
                  placeholder="Search musicians by name..."
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: colors.inputBackground,
                      color: colors.text,
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                    },
                  ]}
                />
                {isSearching && (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={styles.searchSpinner}
                  />
                )}
              </View>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && !pendingMember && (
              <View
                style={[
                  styles.searchResults,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  },
                ]}
              >
                {searchResults.map((musician) => (
                  <TouchableOpacity activeOpacity={1}
                    key={musician.id}
                    style={[
                      styles.searchResultItem,
                      { borderBottomColor: isDark ? "#374151" : "#E5E7EB" },
                    ]}
                    onPress={() => selectMember(musician)}
                  >
                    <Image
                      source={
                        musician.avatar_url
                          ? { uri: musician.avatar_url }
                          : require("../assets/images/default_avatar.png")
                      }
                      style={styles.resultAvatar}
                    />
                    <View>
                      <Text
                        style={[styles.resultName, { color: colors.text }]}
                      >
                        {musician.full_name}
                      </Text>
                      <Text
                        style={[
                          styles.resultRole,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {musician.role}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Pending Member Instrument Input */}
            {pendingMember && (
              <View
                style={[
                  styles.pendingMemberCard,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                    borderColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontFamily: "Poppins_500Medium",
                    marginBottom: 8,
                  }}
                >
                  SET INSTRUMENT FOR:
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <Image
                    source={
                      pendingMember.avatar_url
                        ? { uri: pendingMember.avatar_url }
                        : require("../assets/images/default_avatar.png")
                    }
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontFamily: "Poppins_500Medium",
                      fontSize: 16,
                    }}
                  >
                    {pendingMember.full_name}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    value={newMemberInstrument}
                    onChangeText={setNewMemberInstrument}
                    placeholder="Enter instrument (e.g., Vocals)"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: colors.inputBackground,
                        borderRadius: 8,
                        height: 48,
                        paddingHorizontal: 16,
                        color: colors.text,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        borderWidth: 1,
                      },
                    ]}
                  />
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => confirmAddMember(newMemberInstrument)}
                    disabled={!newMemberInstrument.trim()}
                    style={[
                      styles.addMemberButton,
                      {
                        backgroundColor: !newMemberInstrument.trim()
                          ? "#9CA3AF"
                          : colors.primary,
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        justifyContent: "center",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <Ionicons name="checkmark" size={24} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => {
                      setPendingMember(null);
                      setNewMemberInstrument("");
                    }}
                    style={[
                      styles.addMemberButton,
                      {
                        backgroundColor: "#EF4444",
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        justifyContent: "center",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <Ionicons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={styles.membersList}>
            {members.map((member, index) => {
              const isLeader = isGroupLeaderMember(member, groupOwnerId);
              const currentInstrument = member.instrument || "";
              const needsInstrument = isLeader && !currentInstrument.trim();
              return (
                <View
                  key={index}
                  style={[
                    styles.memberItem,
                    {
                      backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      borderColor: needsInstrument
                        ? "#F59E0B"
                        : isDark
                          ? "#374151"
                          : "#F3F4F6",
                    },
                  ]}
                >
                  <View style={styles.memberInfo}>
                    <View
                      style={[
                        styles.avatarPlaceholder,
                        {
                          backgroundColor: isLeader
                            ? colors.primary
                            : "#E0E7FF",
                        },
                      ]}
                    >
                      {member.avatar_url ? (
                        <Image
                          source={{ uri: member.avatar_url }}
                          style={{ width: 32, height: 32, borderRadius: 16 }}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.avatarText,
                            { color: isLeader ? "#fff" : "#4F46E5" },
                          ]}
                        >
                          {member.name?.charAt(0)}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.memberText,
                          {
                            color: colors.text,
                            fontFamily: "Poppins_600SemiBold",
                            fontSize: 14,
                          },
                        ]}
                      >
                        {member.name || "Unnamed"}
                      </Text>
                      {isLeader ? (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 8,
                            marginTop: 6,
                            alignItems: "center",
                          }}
                        >
                          <TextInput
                            placeholder="Enter instrument (e.g., Vocals, Guitar)"
                            placeholderTextColor={colors.textSecondary}
                            value={currentInstrument}
                            onChangeText={(text) =>
                              updateMemberInstrument(index, text)
                            }
                            style={[
                              styles.input,
                              {
                                flex: 1,
                                backgroundColor: colors.inputBackground,
                                borderRadius: 8,
                                height: 40,
                                paddingHorizontal: 12,
                                paddingVertical: 0,
                                textAlign: "left",
                                color: colors.text,
                                borderWidth: 1,
                                borderColor: isDark ? "#374151" : "#E5E7EB",
                              },
                            ]}
                          />
                          <TouchableOpacity activeOpacity={1}
                            onPress={() => {
                              updateMemberInstrument(index, currentInstrument.trim());
                              Keyboard.dismiss();
                            }}
                            disabled={!currentInstrument.trim()}
                            style={[
                              styles.addMemberButton,
                              {
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                backgroundColor: !currentInstrument.trim()
                                  ? "#9CA3AF"
                                  : colors.primary,
                              },
                            ]}
                          >
                            <Ionicons name="checkmark" size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TextInput
                          placeholder="Enter instrument (e.g., Vocals, Guitar)"
                          placeholderTextColor={colors.textSecondary}
                          value={currentInstrument}
                          onChangeText={(text) =>
                            updateMemberInstrument(index, text)
                          }
                          style={[
                            styles.input,
                            {
                              marginTop: 6,
                              backgroundColor: colors.inputBackground,
                              borderRadius: 8,
                              height: 40,
                              paddingHorizontal: 12,
                              paddingVertical: 0,
                              textAlign: "left",
                              color: colors.text,
                              borderWidth: 1,
                              borderColor: isDark ? "#374151" : "#E5E7EB",
                            },
                          ]}
                        />
                      )}
                      {isLeader && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textSecondary,
                            marginTop: 4,
                          }}
                        >
                          Leader
                        </Text>
                      )}
                    </View>
                  </View>
                  {!isLeader && (
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => removeMember(index)}
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          {/* Leadership Transfer Section */}
          {renderSectionHeader("Leadership", "shield-checkmark")}

          {/* Pending Transfer Warning */}
          {pendingTransfer && (
            <View
              style={[
                styles.warningBox,
                { backgroundColor: "#F59E0B20", borderColor: "#F59E0B" },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                }}
              >
                <Ionicons name="time-outline" size={20} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.warningTitle, { color: colors.text }]}>
                    Transfer Pending
                  </Text>
                  <Text
                    style={[
                      styles.warningText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Waiting for {pendingTransfer.to_user?.full_name || "member"}{" "}
                    to accept
                  </Text>
                </View>
              </View>
              <TouchableOpacity activeOpacity={1}
                onPress={cancelTransfer}
                style={styles.cancelTransferButton}
              >
                <Text
                  style={{
                    color: "#EF4444",
                    fontFamily: "Poppins_600SemiBold",
                    fontSize: 12,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Transfer Leadership Button */}
          {!pendingTransfer && (
            <TouchableOpacity activeOpacity={1}
              style={[styles.transferButton, { borderColor: "#F59E0B" }]}
              onPress={() => {
                if (groupMembers.length === 0) {
                  showAlert(
                    "info",
                    "No Eligible Members",
                    "There are no other members in the group_members table to transfer leadership to. Add members to the group first.",
                  );
                  return;
                }
                setTransferModalVisible(true);
              }}
            >
              <Ionicons name="swap-horizontal" size={20} color="#F59E0B" />
              <Text style={[styles.transferButtonText, { color: "#F59E0B" }]}>
                Transfer Leadership
              </Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.transferHint, { color: colors.textSecondary }]}>
            Transfer ownership requires the new leader to accept the request.
          </Text>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: saving
                    ? colors.textSecondary
                    : colors.primary,
                  shadowColor: colors.primary,
                },
              ]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={1}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={1}
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={handleAttemptLeave}
            >
              <Text
                style={{
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={saving}
        loading
        loadingMessage="Saving changes..."
        onClose={() => { }}
      />

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />

      <LocationPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onSelect={(location) => {
          setAddress(location.address);
          setLatitude(location.lat);
          setLongitude(location.lng);
          setLocationPickerVisible(false);
        }}
        initialLocation={
          latitude && longitude ? { lat: latitude, lng: longitude } : undefined
        }
      />

      {/* Leadership Transfer Modal */}
      <RNModal
        visible={transferModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTransferModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={[
              styles.transferModalContent,
              {
                backgroundColor: colors.background,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              },
            ]}
          >
            <Text style={[styles.transferModalTitle, { color: colors.text }]}>
              Transfer Leadership
            </Text>
            <Text
              style={[
                styles.transferModalSubtitle,
                { color: colors.textSecondary },
              ]}
            >
              Select a group member to become the new leader
            </Text>

            {/* Member List */}
            <ScrollView
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
            >
              {groupMembers.length === 0 ? (
                <Text
                  style={{
                    color: colors.textSecondary,
                    textAlign: "center",
                    paddingVertical: 24,
                  }}
                >
                  No other members available. Add members to the group first.
                </Text>
              ) : (
                groupMembers.map((member) => (
                  <TouchableOpacity activeOpacity={1}
                    key={member.user_id}
                    style={[
                      styles.memberSelectItem,
                      {
                        backgroundColor:
                          selectedNewLeader?.user_id === member.user_id
                            ? colors.primary + "20"
                            : colors.surface,
                        borderColor:
                          selectedNewLeader?.user_id === member.user_id
                            ? colors.primary
                            : "transparent",
                      },
                    ]}
                    onPress={() => setSelectedNewLeader(member)}
                  >
                    <Image
                      source={{
                        uri:
                          member.avatar_url || "https://via.placeholder.com/44",
                      }}
                      style={[
                        styles.memberAvatar,
                        { backgroundColor: colors.border },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text }]}>
                        {member.full_name}
                      </Text>
                      <Text
                        style={[
                          styles.memberRole,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {member.role === "admin" ? "Admin" : "Member"}
                      </Text>
                    </View>
                    {selectedNewLeader?.user_id === member.user_id && (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            {/* Optional Message */}
            {selectedNewLeader && (
              <TextInput
                placeholder="Add a message (optional)"
                placeholderTextColor={colors.textSecondary}
                value={transferMessage}
                onChangeText={setTransferMessage}
                multiline
                style={[
                  styles.transferMessageInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.inputBackground,
                  },
                ]}
              />
            )}

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <TouchableOpacity activeOpacity={1}
                style={[
                  styles.cancelButton,
                  { flex: 1, borderColor: colors.border },
                ]}
                onPress={() => {
                  setTransferModalVisible(false);
                  setSelectedNewLeader(null);
                  setTransferMessage("");
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins_600SemiBold",
                    color: colors.text,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.transferConfirmButton,
                  {
                    flex: 1,
                    backgroundColor: selectedNewLeader
                      ? "#F59E0B"
                      : colors.border,
                  },
                ]}
                onPress={initiateTransfer}
                disabled={!selectedNewLeader || isTransferring}
                activeOpacity={1}
              >
                {isTransferring ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.transferConfirmButtonText}>
                    Send Request
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Group Type Selector Modal Native Implementation */}
      {groupTypeModalVisible && (
        <View style={StyleSheet.absoluteFillObject}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
            activeOpacity={1}
            onPress={() => setGroupTypeModalVisible(false)}
          />
          <View style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "80%",
            padding: 24,
            paddingBottom: 24,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: "Poppins_600SemiBold", color: colors.text }}>
                Select Group Type
              </Text>
              <TouchableOpacity activeOpacity={1} onPress={() => setGroupTypeModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {PH_MUSIC_GROUP_TYPES.map((type) => (
                <TouchableOpacity activeOpacity={1}
                  key={type.id}
                  style={{
                    flexDirection: "row",
                    paddingVertical: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: isDark ? "#374151" : "#F3F4F6",
                    alignItems: "center"
                  }}
                  onPress={() => handleGroupTypeChange(type.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 16 }}>
                      {type.label}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 }}>
                      {type.description}
                    </Text>
                    <Text style={{ color: colors.primary, fontFamily: "Poppins_500Medium", fontSize: 12, marginTop: 4 }}>
                      Min: {type.minMembers} members
                    </Text>
                  </View>
                  {groupType === type.id && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} style={{ marginLeft: 16 }} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 160,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    marginBottom: 8,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Poppins_600SemiBold",
  },
  inputWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  input: {
    padding: 16,
    textAlign: "left",
    textAlignVertical: "center",
  },
  genreSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  genreText: {
    fontFamily: "Poppins_400Regular",
  },
  genreChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  genreChipText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  showMoreText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  addMemberSection: {
    marginBottom: 20,
  },
  addMemberButton: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    position: "relative",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: "Poppins_400Regular",
  },
  searchSpinner: {
    position: "absolute",
    right: 12,
  },
  searchResults: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    maxHeight: 200,
    overflow: "hidden",
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
  },
  resultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  resultName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  resultRole: {
    fontSize: 12,
  },
  pendingMemberCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  membersList: {
    flexDirection: "column",
    gap: 0,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberText: {
    marginRight: 8,
    fontFamily: "Poppins_500Medium",
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  footerActions: {
    marginTop: 32,
    marginBottom: 20,
  },
  saveButton: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    marginBottom: 16,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 16,
    color: "white",
    fontFamily: "Poppins_600SemiBold",
  },
  cancelButton: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderWidth: 1,
  },
  // Leadership Transfer Styles
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  warningText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  cancelTransferButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  transferButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  transferButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  transferHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  transferModalContent: {
    padding: 24,
  },
  transferModalTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    marginBottom: 8,
  },
  transferModalSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginBottom: 24,
  },
  memberSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  memberName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  memberRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  transferMessageInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    minHeight: 80,
    textAlignVertical: "top",
    fontFamily: "Poppins_400Regular",
  },
  transferConfirmButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  transferConfirmButtonText: {
    color: "white",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  typeButton: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
