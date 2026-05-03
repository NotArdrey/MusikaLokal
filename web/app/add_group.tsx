import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal, { normalizeVisibleInput } from "../src/components/modal";
import Navbar from "../src/components/navbar";
import {
    isDuoGroupType,
    mapDbGroupTypeToUiGroupType,
    mapUiGroupTypeToDbGroupType,
    PH_MUSIC_GROUP_TYPES,
} from "../src/constants/groupTypes";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { isGroupLeaderMember } from "../src/utils/groupMembers";

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

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;
const IS_WEB = Platform.OS === "web";

export default function AddGroupScreen() {
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isDuoMode = params.mode === "duo";
  const { isSystemLocked, showLockAlert } = useAuth();
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [description, setDescription] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  // Group type based on the 11 PH Music Group Types
  const [groupType, setGroupType] = useState<string>(
    mapDbGroupTypeToUiGroupType(isDuoMode ? "duo" : "band"),
  );
  const [groupTypeModalVisible, setGroupTypeModalVisible] = useState(false);
  // Enhanced member structure: { name, instrument, role?, user_id?, avatar_url? }
  interface MemberDetail {
    name: string;
    instrument: string;
    role?: string; // "Leader" for group creator
    user_id?: string;
    avatar_url?: string;
  }
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [leaderInstrument, setLeaderInstrument] = useState(""); // Separate state for leader instrument input
  const [isLeaderInstrumentFinalized, setIsLeaderInstrumentFinalized] = useState(false);
  const [memberInstrumentFinalization, setMemberInstrumentFinalization] = useState<Record<number, boolean>>({});

  const [newMemberInstrument, setNewMemberInstrument] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: "info",
    title: "",
    message: "",
  });

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  // Musician search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const searchMusicians = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const normalizeMemberName = (value?: string | null) =>
      (value || "").trim().toLowerCase();

    const isMusicianAlreadyAdded = (musician: {
      id?: string | null;
      full_name?: string | null;
    }) => {
      const musicianName = normalizeMemberName(musician.full_name);
      return members.some((member) => {
        const sameId = Boolean(
          member.user_id && musician.id && member.user_id === musician.id,
        );
        const sameName = Boolean(
          musicianName &&
            normalizeMemberName(member.name) === musicianName,
        );
        return sameId || sameName;
      });
    };

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("role", "musician")
        .ilike("full_name", `%${query}%`)
        .limit(5);

      if (error) throw error;
      const filteredResults = (data || []).filter(
        (musician) => !isMusicianAlreadyAdded(musician),
      );
      setSearchResults(filteredResults);
    } catch (error) {
      console.error("Error searching musicians:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Pending member to add (need to select instrument first)
  const [pendingMember, setPendingMember] = useState<any>(null);

  const selectMember = (musician: any) => {
    // Check if already added
    if (
      members.some((m) => {
        const normalizedMusicianName = (musician.full_name || "")
          .trim()
          .toLowerCase();
        const normalizedMemberName = (m.name || "").trim().toLowerCase();
        return (
          (m.user_id && musician.id && m.user_id === musician.id) ||
          (normalizedMusicianName &&
            normalizedMemberName === normalizedMusicianName)
        );
      })
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
    // Set as pending and prompt for instrument
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
      setMembers((prev) => {
        const nextMembers = [...prev, newMember];
        setMemberInstrumentFinalization((prevFinalization) => ({
          ...prevFinalization,
          [nextMembers.length - 1]: true,
        }));
        return nextMembers;
      });
      setPendingMember(null);
      setNewMemberInstrument("");
    }
  };



  // Images state
  const [images, setImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);

  const steps = [
    { id: 1, title: "Group Info", icon: "people" },
    { id: 2, title: "Members", icon: "person-add" },
    { id: 3, title: "Review", icon: "checkmark-circle" },
  ];

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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profile?.role !== "musician") {
        showAlert("error", "Unauthorized", "Only musicians can create groups.");
        router.replace("/home");
        return;
      }

      // Store current user info and add them as first member with Leader role
      setCurrentUserId(user.id);
      const userName = profile?.full_name || "Me";
      setCurrentUserName(userName);
      // Add as first member with Leader role - instrument to be filled in step 2
      setMembers([
        {
          name: userName,
          instrument: "", // Will prompt to fill in step 2
          role: "Leader",
          user_id: user.id,
          avatar_url: profile?.avatar_url,
        },
      ]);
      setIsLeaderInstrumentFinalized(false);
      setMemberInstrumentFinalization({ 0: false });

      setAuthorized(true);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/home");
    } finally {
      setCheckingAuth(false);
    }
  };

  const [creating, setCreating] = useState(false);
  const [newGroupId, setNewGroupId] = useState<string | null>(null);

  const getLeaderIndex = () =>
    members.findIndex(
      (member) =>
        isGroupLeaderMember(member, currentUserId) || member?.user_id === currentUserId,
    );

  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      if (!groupName.trim()) {
        showAlert("error", "Required Field", "Please enter a group name");
        return false;
      }
      if (selectedGenres.length === 0) {
        showAlert(
          "error",
          "Required Field",
          "Please select at least one genre",
        );
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
    }
    if (currentStep === 2) {
      const leaderIndex = getLeaderIndex();
      const normalizedLeaderInstrument = leaderInstrument.trim();
      let membersForValidation = members;

      // Resolve leader instrument in-memory first to avoid stale state reads.
      if (
        normalizedLeaderInstrument &&
        leaderIndex >= 0 &&
        members[leaderIndex]?.instrument?.trim() !== normalizedLeaderInstrument
      ) {
        membersForValidation = members.map((member, index) =>
          index === leaderIndex
            ? { ...member, instrument: normalizedLeaderInstrument }
            : member,
        );
        setMembers(membersForValidation);
      }

      // Validate leader has an instrument/role
      const leaderMember =
        leaderIndex >= 0
          ? membersForValidation[leaderIndex]
          : membersForValidation.find((m) =>
              isGroupLeaderMember(m, currentUserId),
            );
      if (!leaderMember?.instrument?.trim()) {
        showAlert(
          "error",
          "Leader Instrument Required",
          "Please enter your instrument/role as the group leader.",
        );
        return false;
      }
      if (!isLeaderInstrumentFinalized) {
        showAlert(
          "error",
          "Leader Instrument Not Finalized",
          "Tap the check icon beside the leader instrument to finalize it before continuing.",
        );
        return false;
      }
      const unfinalizedMember = membersForValidation.find((member, index) => {
        if (isGroupLeaderMember(member, currentUserId)) {
          return false;
        }
        return Boolean(member.instrument?.trim()) && !memberInstrumentFinalization[index];
      });
      if (unfinalizedMember) {
        showAlert(
          "error",
          "Member Instrument Not Finalized",
          `Tap the check icon beside ${unfinalizedMember.name || "this member"}'s instrument before continuing.`,
        );
        return false;
      }
      // Validate all members have instruments
      const memberWithoutInstrument = membersForValidation.find(
        (m) => !m.instrument?.trim(),
      );
      if (memberWithoutInstrument) {
        showAlert(
          "error",
          "Missing Instrument",
          `Please enter an instrument for ${memberWithoutInstrument.name}`,
        );
        return false;
      }
      // Validate member count based on group type
      const selectedType = PH_MUSIC_GROUP_TYPES.find((t) => t.id === groupType);
      if (selectedType) {
        if (membersForValidation.length < selectedType.minMembers) {
          showAlert(
            "warning",
            `${selectedType.label} Requirement`,
            `A ${selectedType.label} must have at least ${selectedType.minMembers} members.`
          );
          return false;
        }
      }
    }
    return true;
  };

  const handleNext = async () => {
    if (!validateStep(step)) {
      return;
    }

    if (step < 3) {
      setStep(step + 1);
    } else {
      // System lock check
      if (isSystemLocked) {
        showLockAlert();
        return;
      }

      const selectedTypeLabel = PH_MUSIC_GROUP_TYPES.find((t) => t.id === groupType)?.label || "Group";

      showAlert(
        "warning",
        `Confirm ${selectedTypeLabel} Creation`,
        `Are you sure you want to create this ${selectedTypeLabel}? Please review all details before proceeding.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Create", onPress: () => createGroup() },
        ],
      );
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const createGroup = async () => {
    if (creating) return;
    setCreating(true);

    try {
      // Get current session (auto-refresh is handled by Supabase client)
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        showAlert("error", "Session Expired", "Please log in again.");
        router.replace("/");
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
        location: address,
        genre: selectedGenres.join(", "),
        description,
        members,
        images: orderedImages,
        latitude,
        longitude,
        group_type: mapUiGroupTypeToDbGroupType(groupType),
      };

      // Insert base group row (3NF-safe)
      const { data, error } = await supabase
        .from('groups')
        .insert({
          owner_id: session.user.id,
          name: payload.name,
          location: payload.location,
          genre: payload.genre,
          description: payload.description,
          latitude: payload.latitude,
          longitude: payload.longitude,
          group_type: payload.group_type,
        })
        .select()
        .single();

      // console.log("🔵 Response data:", JSON.stringify(data, null, 2));
      // console.log("🔵 Response error:", error);

      if (error) {
        try {
          console.error("❌ Error details:", error.message);
        } catch (err) {
          console.error("❌ Error details: Could not log error details");
        }

        let alertMessage = `Failed to create group: ${error.message}`;
        if (error.hint) alertMessage += `\n\nHint: ${error.hint}`;
        if (error.details) alertMessage += `\n\nDetails: ${error.details}`;

        showAlert("error", "Error", alertMessage);
        return;
      }

      const rosterRows = (payload.members || []).map((member: any, index: number) => ({
        group_id: data.id,
        user_id: member.user_id || null,
        member_name: member.name || null,
        member_role: member.role || null,
        instrument: member.instrument || null,
        avatar_url: member.avatar_url || null,
        sort_order: index,
        raw_member: {
          ...member,
          group_type_ui: groupType,
        },
      }));

      if (rosterRows.length > 0) {
        const { error: rosterError } = await supabase
          .from('group_roster_members')
          .insert(rosterRows);
        if (rosterError) {
          throw new Error(`Failed to save group roster: ${rosterError.message}`);
        }
      }

      const imageRows = (payload.images || []).map((media_url: string, index: number) => ({
        group_id: data.id,
        media_type: 'image',
        media_url,
        sort_order: index,
      }));

      if (imageRows.length > 0) {
        const { error: mediaError } = await supabase
          .from('group_media')
          .insert(imageRows);
        if (mediaError) {
          throw new Error(`Failed to save group images: ${mediaError.message}`);
        }
      }

      const desiredMemberUserIds = Array.from(
        new Set(
          [
            session.user.id,
            ...(payload.members || [])
              .map((member: any) => member?.user_id)
              .filter((memberId: any): memberId is string =>
                typeof memberId === 'string' && memberId.trim().length > 0,
              ),
          ],
        ),
      );

      const membershipRows = desiredMemberUserIds.map((memberId) => ({
        group_id: data.id,
        user_id: memberId,
        role: memberId === session.user.id ? 'owner' : 'member',
      }));

      if (membershipRows.length > 0) {
        const { error: membershipError } = await supabase
          .from('group_members')
          .upsert(membershipRows, { onConflict: 'group_id,user_id' });

        if (membershipError) {
          console.log('Failed to sync group_members during create:', membershipError);
        }
      }

      setNewGroupId(data.id);
      setModalVisible(true);
      console.log("Group Created");
    } catch (e: any) {
      console.log("Error creating group:", e);
      showAlert("error", "Error", "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleSuccessRedirect = () => {
    setModalVisible(false);
    if (newGroupId) {
      router.replace({ pathname: "/manage_group", params: { id: newGroupId } });
    } else {
      router.back();
    }
  };

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

  const removeMember = (index: number) => {
    // Prevent removing yourself (first member)
    if (isGroupLeaderMember(members[index], currentUserId)) {
      showAlert(
        "warning",
        "Cannot Remove",
        "You cannot remove yourself from the group.",
      );
      return;
    }
    setMembers((prev) => prev.filter((_, i) => i !== index));
    setMemberInstrumentFinalization((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([rawIndex, isFinalized]) => {
        const memberIndex = Number(rawIndex);
        if (memberIndex < index) {
          next[memberIndex] = isFinalized;
          return;
        }
        if (memberIndex > index) {
          next[memberIndex - 1] = isFinalized;
        }
      });
      return next;
    });
  };

  const updateMemberInstrument = (index: number, instrument: string) => {
    setMemberInstrumentFinalization((prev) => ({
      ...prev,
      [index]: false,
    }));

    setMembers((prev) => {
      const updated = prev.map((member, memberIndex) =>
        memberIndex === index ? { ...member, instrument } : member,
      );

      if (isGroupLeaderMember(updated[index], currentUserId)) {
        setLeaderInstrument(instrument);
        setIsLeaderInstrumentFinalized(false);
      }

      return updated;
    });
  };

  const finalizeMemberInstrument = (index: number) => {
    const value = members[index]?.instrument?.trim() || "";
    const isLeader = isGroupLeaderMember(members[index], currentUserId);

    if (!value) {
      showAlert(
        "warning",
        isLeader ? "Leader Instrument Required" : "Member Instrument Required",
        isLeader
          ? "Please enter the leader instrument before finalizing."
          : "Please enter the member instrument before finalizing.",
      );
      return;
    }

    updateMemberInstrument(index, value);
    setMemberInstrumentFinalization((prev) => ({
      ...prev,
      [index]: true,
    }));
    if (isLeader) {
      setLeaderInstrument(value);
      setIsLeaderInstrumentFinalized(true);
    }
    Keyboard.dismiss();
  };

  const enableMemberInstrumentEdit = (index: number) => {
    const isLeader = isGroupLeaderMember(members[index], currentUserId);
    setMemberInstrumentFinalization((prev) => ({
      ...prev,
      [index]: false,
    }));
    if (isLeader) {
      setIsLeaderInstrumentFinalized(false);
    }
  };

  const renderInput = (
    label: string,
    value: string,
    setValue: (text: string) => void,
    placeholder: string,
    multiline = false,
    keyboardType: any = "default",
  ) => {
    const normalizedLabel = label.trim().toLowerCase();
    const inputMaxLength = normalizedLabel.includes("description")
      ? DESCRIPTION_MAX_LENGTH
      : normalizedLabel.includes("name") || normalizedLabel.includes("title")
        ? TITLE_MAX_LENGTH
        : undefined;
    const isRequiredLabel =
      normalizedLabel.includes("name") ||
      normalizedLabel.includes("title") ||
      normalizedLabel.includes("description") ||
      normalizedLabel.includes("payout");

    return (
      <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
        {label}
        {isRequiredLabel ? (
          <Text style={{ color: "#EF4444" }}> *</Text>
        ) : null}
      </Text>
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.inputBackground,
            borderColor: isDark ? "#374151" : "#E5E7EB",
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={setValue}
          maxLength={inputMaxLength}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={keyboardType}
          style={[
            styles.textInput,
            {
              color: colors.text,
              height: multiline ? 120 : "auto",
              textAlign: "left",
              textAlignVertical: multiline ? "top" : "center",
              paddingVertical: multiline ? 12 : 16,
            },
          ]}
        />
      </View>
      </View>
    );
  };

  const membersMissingInstrumentCount = members.filter(
    (member) => !member.instrument?.trim(),
  ).length;
  const leaderIndexForStep = getLeaderIndex();
  const leaderNeedsFinalization =
    step === 2 &&
    leaderIndexForStep >= 0 &&
    Boolean(members[leaderIndexForStep]?.instrument?.trim()) &&
    !isLeaderInstrumentFinalized;
  const membersNeedFinalizationCount =
    step === 2
      ? members.reduce((count, member, index) => {
          const hasInstrument = Boolean(member.instrument?.trim());
          if (!hasInstrument) {
            return count;
          }
          const isLeader = isGroupLeaderMember(member, currentUserId);
          if (isLeader) {
            return leaderNeedsFinalization ? count + 1 : count;
          }
          return memberInstrumentFinalization[index] ? count : count + 1;
        }, 0)
      : 0;
  const nonLeaderNeedsFinalization =
    membersNeedFinalizationCount - (leaderNeedsFinalization ? 1 : 0) > 0;
  const disableNextForMissingInstruments =
    step === 2 &&
    (membersMissingInstrumentCount > 0 || membersNeedFinalizationCount > 0);
  const selectedGroupType = PH_MUSIC_GROUP_TYPES.find((type) => type.id === groupType);
  const requiredMemberCount = selectedGroupType?.minMembers || 1;
  const remainingMemberCount = Math.max(requiredMemberCount - members.length, 0);
  const isCurrentStepComplete =
    step === 1
      ? groupName.trim().length > 0 &&
        selectedGenres.length > 0 &&
        description.trim().length > 0 &&
        Boolean(address && latitude && longitude) &&
        images.length > 0
      : step === 2
        ? remainingMemberCount === 0 && !disableNextForMissingInstruments
        : true;

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Create Group" />

        <View style={styles.contentFrame}>

        {/* Enhanced Step Indicator (Fixed at top) */}
        <View
          style={[
            styles.stepIndicatorContainer,
            {
              backgroundColor: isDark ? "#111827" : "#FFFFFF",
              borderColor: isDark ? "#1F2937" : "#E5E7EB",
            },
          ]}
        >
          <View style={styles.stepIndicatorContent}>
            {/* Progress Line Background */}
            <View
              style={[
                styles.progressLineBg,
                { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
              ]}
            />

            {/* Active Progress Line */}
            <View
              style={[
                styles.activeProgressLine,
                {
                  width: `${((step - 1) / (steps.length - 1)) * 100}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />

            {steps.map((s) => {
              const isActive = step >= s.id;
              const isCurrent = step === s.id;
              return (
                <View key={s.id} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      {
                        backgroundColor: isActive
                          ? colors.primary
                          : isDark
                            ? "#334155"
                            : "#E5E7EB",
                        borderColor: isActive
                          ? "#818cf8"
                          : isDark
                            ? "#1E293B"
                            : "#F3F4F6",
                      },
                    ]}
                  >
                    <Ionicons
                      name={isActive ? "checkmark" : (s.icon as any)}
                      size={18}
                      color={isActive ? "#fff" : colors.textSecondary}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                    style={[
                      styles.stepText,
                      {
                        fontFamily: isCurrent
                          ? "Poppins_600SemiBold"
                          : "Poppins_400Regular",
                        color: isActive ? colors.text : colors.textSecondary,
                        fontWeight: isCurrent ? "bold" : "normal",
                      },
                    ]}
                  >
                    {s.title}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <ScrollView
            style={[
              styles.formContainer,
              {
                backgroundColor: isDark ? "#111827" : "#FFFFFF",
                borderColor: isDark ? "#1F2937" : "#E5E7EB",
              },
            ]}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              isKeyboardVisible && {
                paddingBottom: keyboardHeight + 220,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {step === 1 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Tell us about your Group
                </Text>

                {/* Group Type Selection */}
                {!isDuoMode && (
                  <View style={[styles.inputContainer, { zIndex: 100 }]}>
                    <Text
                      style={[styles.inputLabel, { color: colors.textSecondary }]}
                    >
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
                        {PH_MUSIC_GROUP_TYPES.find(t => t.id === groupType)?.label || "Select Group Type"}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {/* Info about selected type */}
                    {groupType && (
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
                )}

                {renderInput(
                  "Group Name",
                  groupName,
                  setGroupName,
                  "e.g. The Sunday Collective",
                )}
                {/* Genre Multi-Select */}
                <View style={styles.inputContainer}>
                  <Text
                    style={[styles.inputLabel, { color: colors.textSecondary }]}
                  >
                    Genre
                  </Text>
                  <View style={styles.genreChipsContainer}>
                    {(showAllGenres ? GENRES : GENRES.slice(0, 8)).map(
                      (genre) => {
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
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
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
                      },
                    )}
                  </View>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => setShowAllGenres(!showAllGenres)}
                    style={styles.showMoreButton}
                  >
                    <Text
                      style={[styles.showMoreText, { color: colors.primary }]}
                    >
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
                {renderInput(
                  "Description",
                  description,
                  setDescription,
                  "Brief bio about your band...",
                  true,
                )}

                {/* Image Upload */}
                <View style={styles.inputContainer}>
                  <Text
                    style={[styles.inputLabel, { color: colors.textSecondary }]}
                  >
                    Group Photos
                  </Text>
                  <ImageUploader
                    images={images}
                    onImagesChange={setImages}
                    thumbnailIndex={thumbnailIndex}
                    onThumbnailChange={setThumbnailIndex}
                    maxImages={10}
                    bucketName="listings"
                    userId={newGroupId || "temp"}
                    folder="groups"
                    safetyContext="add_group_images"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text
                    style={[styles.inputLabel, { color: colors.textSecondary }]}
                  >
                    Based Location
                  </Text>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => setLocationPickerVisible(true)}
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        height: 56,
                        justifyContent: "center",
                        paddingHorizontal: 16,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
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
                          textAlignVertical: "center",
                        }}
                      >
                        {address || "Tap to select location on map"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Who's in the {isDuoGroupType(groupType) ? "duo" : "band"}?
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 13,
                    marginBottom: 16,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  {isDuoGroupType(groupType)
                    ? "Add yourself and one other member (exactly 2 members required)."
                    : "Add yourself and at least 2 other members (minimum 3 members required)."}
                </Text>

                <View
                  style={[
                    styles.addMemberRow,
                    { flexDirection: "column", alignItems: "stretch" },
                  ]}
                >
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 12,
                      }}
                    >
                      <Ionicons
                        name="search"
                        size={20}
                        color={colors.textSecondary}
                      />
                      <TextInput
                        value={searchQuery}
                        onChangeText={searchMusicians}
                        placeholder="Search musicians by name..."
                        placeholderTextColor={colors.textSecondary}
                        style={[
                          styles.textInput,
                          {
                            color: colors.text,
                            flex: 1,
                            height: 50,
                            textAlign: "left",
                            paddingVertical: 0,
                          },
                        ]}
                      />
                      {isSearching && (
                        <ActivityIndicator size="small" color={colors.primary} />
                      )}
                    </View>
                  </View>

                  {/* Search Results Dropdown */}
                  {searchResults.length > 0 && (
                    <View
                      style={[
                        styles.searchResultsContainer,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {searchResults.map((musician) => (
                        <TouchableOpacity activeOpacity={1}
                          key={musician.id}
                          onPress={() => selectMember(musician)}
                          style={[
                            styles.searchResultItem,
                            { borderBottomColor: colors.border },
                          ]}
                        >
                          <View
                            style={[
                              styles.avatarPlaceholder,
                              {
                                backgroundColor: colors.primary + "20",
                                marginRight: 12,
                              },
                            ]}
                          >
                            {musician.avatar_url ? (
                              <Image
                                source={{ uri: musician.avatar_url }}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 16,
                                }}
                              />
                            ) : (
                              <Text
                                style={{
                                  color: colors.primary,
                                  fontWeight: "bold",
                                }}
                              >
                                {musician.full_name.charAt(0)}
                              </Text>
                            )}
                          </View>
                          <View>
                            <Text
                              style={{
                                color: colors.text,
                                fontFamily: "Poppins_500Medium",
                              }}
                            >
                              {musician.full_name}
                            </Text>
                            <Text
                              style={{
                                color: colors.textSecondary,
                                fontSize: 12,
                              }}
                            >
                              Musician
                            </Text>
                          </View>
                          <Ionicons
                            name="add-circle-outline"
                            size={24}
                            color={colors.primary}
                            style={{ marginLeft: "auto" }}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Pending Member Instrument Selection */}
                {pendingMember && (
                  <View
                    style={[
                      styles.memberItem,
                      {
                        backgroundColor: colors.primary + "10",
                        borderColor: colors.primary,
                        marginBottom: 16,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <View
                          style={[
                            styles.avatarPlaceholder,
                            {
                              backgroundColor: colors.primary + "20",
                              marginRight: 12,
                            },
                          ]}
                        >
                          {pendingMember.avatar_url ? (
                            <Image
                              source={{ uri: pendingMember.avatar_url }}
                              style={{ width: 32, height: 32, borderRadius: 16 }}
                            />
                          ) : (
                            <Text
                              style={{
                                color: colors.primary,
                                fontWeight: "bold",
                              }}
                            >
                              {pendingMember.full_name?.charAt(0)}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={{
                            color: colors.text,
                            fontFamily: "Poppins_500Medium",
                          }}
                        >
                          {pendingMember.full_name}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 , flexWrap: "wrap", minWidth: "100%" }}>
                        <TextInput
                          value={newMemberInstrument}
                          onChangeText={setNewMemberInstrument}
                          placeholder="Enter instrument (e.g., Vocals, Guitar)"
                          placeholderTextColor={colors.textSecondary}
                          style={[
                            styles.textInput,
                            {
                              flex: 1,
                              backgroundColor: colors.inputBackground,
                              borderRadius: 8,
                              height: 40,
                              paddingHorizontal: 12,
                              paddingVertical: 0,
                              textAlign: "left",
                              color: colors.text,
                            },
                          ]}
                        />
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => confirmAddMember(newMemberInstrument)}
                          style={[
                            styles.addBtn,
                            { backgroundColor: colors.primary },
                          ]}
                        >
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => {
                            setPendingMember(null);
                            setNewMemberInstrument("");
                          }}
                          style={[styles.addBtn, { backgroundColor: "#EF4444" }]}
                        >
                          <Ionicons name="close" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}



                {members.length === 0 ? (
                  <View
                    style={[
                      styles.dashedBox,
                      { borderColor: isDark ? "#374151" : "#D1D5DB" },
                    ]}
                  >
                    <Ionicons
                      name="people-outline"
                      size={48}
                      color={colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.dashedBoxText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      No members added yet
                    </Text>
                  </View>
                ) : (
                  <View style={styles.membersList}>
                    {members.map((member, index) => {
                      const isLeader = isGroupLeaderMember(member, currentUserId);
                      const currentInstrument = member.instrument || "";
                      const needsInstrument = !normalizeVisibleInput(currentInstrument);
                      const isInstrumentFinalized = isLeader
                        ? isLeaderInstrumentFinalized
                        : Boolean(memberInstrumentFinalization[index]);
                      const needsMemberFinalization =
                        Boolean(normalizeVisibleInput(currentInstrument)) && !isInstrumentFinalized;
                      return (
                        <View
                          key={member.user_id || `member-${index}`}
                          style={[
                            styles.memberItem,
                            {
                              backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                              borderColor: needsInstrument
                                || needsMemberFinalization
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
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 16,
                                  }}
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
                                  styles.memberName,
                                  { color: colors.text },
                                ]}
                              >
                                {member.name}
                              </Text>
                              {isInstrumentFinalized ? (
                                <View
                                  style={{
                                    flexDirection: "row",
                                    gap: 8,
                                    marginTop: 6,
                                    alignItems: "center",
                                  }}
                                >
                                  <View
                                    style={{
                                      flex: 1,
                                      backgroundColor: colors.inputBackground,
                                      borderRadius: 8,
                                      height: 40,
                                      paddingHorizontal: 12,
                                      justifyContent: "center",
                                      borderWidth: 1,
                                      borderColor: "#10B981",
                                    }}
                                  >
                                    <Text style={{ color: colors.text, fontSize: 14 }}>
                                      {currentInstrument}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={() => enableMemberInstrumentEdit(index)}
                                    style={[
                                      styles.addBtn,
                                      {
                                        width: 40,
                                        height: 40,
                                        borderRadius: 8,
                                        backgroundColor: "#0EA5E9",
                                      },
                                    ]}
                                  >
                                    <Ionicons name="create-outline" size={18} color="#fff" />
                                  </TouchableOpacity>
                                </View>
                              ) : (
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
                                    onEndEditing={(event) =>
                                      updateMemberInstrument(
                                        index,
                                        normalizeVisibleInput(event.nativeEvent.text),
                                      )
                                    }
                                    style={[
                                      styles.textInput,
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
                                        borderColor: needsInstrument || needsMemberFinalization
                                          ? "#F59E0B"
                                          : isDark
                                            ? "#374151"
                                            : "#E5E7EB",
                                      },
                                    ]}
                                  />
                                  <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={() => finalizeMemberInstrument(index)}
                                    disabled={!normalizeVisibleInput(currentInstrument)}
                                    style={[
                                      styles.addBtn,
                                      {
                                        width: 40,
                                        height: 40,
                                        borderRadius: 8,
                                        backgroundColor: !normalizeVisibleInput(currentInstrument)
                                          ? "#9CA3AF"
                                          : colors.primary,
                                      },
                                    ]}
                                  >
                                    <Ionicons name="checkmark" size={20} color="#fff" />
                                  </TouchableOpacity>
                                </View>
                              )}
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: needsInstrument || needsMemberFinalization
                                    ? "#F59E0B"
                                    : colors.textSecondary,
                                  marginTop: 4,
                                }}
                              >
                                {needsInstrument
                                  ? isLeader
                                    ? "Leader (required before continuing)"
                                    : "Member (required before continuing)"
                                  : needsMemberFinalization
                                    ? isLeader
                                      ? "Leader (tap check icon to finalize)"
                                      : "Member (tap check icon to finalize)"
                                    : isLeader
                                      ? "Leader (confirmed)"
                                      : "Member (confirmed)"}
                              </Text>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  marginTop: 4,
                                }}
                              >
                                <Ionicons
                                  name={
                                    needsInstrument || needsMemberFinalization
                                      ? "alert-circle-outline"
                                      : "checkmark-circle"
                                  }
                                  size={12}
                                  color={
                                    needsInstrument || needsMemberFinalization
                                      ? "#F59E0B"
                                      : "#10B981"
                                  }
                                />
                                <Text
                                  style={{
                                    fontSize: 10,
                                    marginLeft: 4,
                                    color: needsInstrument || needsMemberFinalization
                                      ? "#F59E0B"
                                      : "#10B981",
                                  }}
                                >
                                  {needsInstrument || needsMemberFinalization
                                    ? `${isLeader ? "Leader" : "Member"} instrument not confirmed`
                                    : `${isLeader ? "Leader" : "Member"} instrument confirmed`}
                                </Text>
                              </View>
                            </View>
                          </View>
                          {!isLeader && (
                            <TouchableOpacity activeOpacity={1} onPress={() => removeMember(index)}>
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
                )}
              </View>
            )}

            {step === 3 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Review Details
                </Text>

                <View
                  style={[
                    styles.reviewContainer,
                    { backgroundColor: isDark ? "#1F2937" : "#F9FAFB" },
                  ]}
                >
                  <View>
                    <Text style={styles.reviewLabel}>Group Info</Text>
                    <Text style={[styles.reviewValue, { color: colors.text }]}>
                      {groupName || "No Name"}
                    </Text>
                    <Text style={{ color: colors.textSecondary }}>
                      {selectedGenres.length > 0
                        ? selectedGenres.join(", ")
                        : "No Genre"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.divider,
                      { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                    ]}
                  />

                  <View>
                    <Text style={styles.reviewLabel}>
                      Members ({members.length})
                    </Text>
                    <View style={{ gap: 8 }}>
                      {members.map((m, i) => (
                        <View
                          key={i}
                          style={[
                            styles.tag,
                            {
                              backgroundColor: isDark ? "#374151" : "white",
                              borderColor: isDark ? "#4B5563" : "#E5E7EB",
                              flexDirection: "row",
                              alignItems: "center",
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                            },
                          ]}
                        >
                          <Ionicons
                            name={m.role === "Leader" ? "star" : "person"}
                            size={14}
                            color={
                              m.role === "Leader"
                                ? colors.primary
                                : colors.textSecondary
                            }
                            style={{ marginRight: 8 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 13,
                                color: colors.text,
                                fontFamily: "Poppins_500Medium",
                              }}
                            >
                              {m.name}
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: colors.textSecondary,
                              }}
                            >
                              {m.instrument}
                              {m.role === "Leader" ? " • Leader" : ""}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={styles.termsText}>
                  By tapping Create Group, you agree to our Terms and Conditions.
                </Text>
              </View>
            )}

            {/* Navigation Buttons */}
            {!isKeyboardVisible && (
              <View style={styles.navigationButtons}>
                {(remainingMemberCount > 0 || disableNextForMissingInstruments) && (
                  <Text
                    style={{
                      width: "100%",
                      textAlign: "center",
                      marginBottom: 8,
                      color: "#F59E0B",
                      fontFamily: "Poppins_500Medium",
                      fontSize: 12,
                    }}
                  >
                    {remainingMemberCount > 0
                      ? `${selectedGroupType?.label || "This group type"} requires at least ${requiredMemberCount} members. Add ${remainingMemberCount} more member${remainingMemberCount === 1 ? "" : "s"} to continue.`
                      : leaderNeedsFinalization
                        ? "Tap the check icon to finalize the leader instrument."
                        : nonLeaderNeedsFinalization
                          ? "Tap each check icon to finalize member instruments."
                          : "Add instruments for all members to continue."}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={handleBack}
                  disabled={creating}
                  activeOpacity={1}
                  style={[
                    styles.backBtn,
                    {
                      flex: 1,
                      borderColor: isDark ? "#6366F1" : "#E5E7EB",
                      backgroundColor: isDark ? "transparent" : "#fff",
                      opacity: creating ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.backBtnText,
                      { color: isDark ? "#A5B4FC" : colors.text },
                    ]}
                  >
                    {step === 1 ? "Cancel" : "Back"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleNext}
                  disabled={creating || !isCurrentStepComplete}
                  activeOpacity={1}
                  style={[
                    styles.nextBtn,
                    {
                      backgroundColor: creating
                        ? isDark
                          ? "#4338CA"
                          : "#9CA3AF"
                        : isCurrentStepComplete
                          ? colors.primary
                          : colors.border,
                      opacity: creating ? 0.7 : 1,
                      flex: 1
                    },
                  ]}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={[styles.nextBtnText, { color: isCurrentStepComplete ? "#FFFFFF" : colors.textSecondary }]}>
                      {step === 3 ? "Create Group" : "Next"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        </View>

        {!isKeyboardVisible && <Navbar />}
      </View>

      <Modal
        visible={modalVisible}
        title="Success!"
        message={`"${groupName}" has been successfully created.`}
        buttonText={"Manage Group"}
        onClose={handleSuccessRedirect}
      />

      <Modal
        visible={creating}
        loading
        loadingMessage="Creating group..."
        onClose={() => { }}
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
      />
      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />

      {/* Group Type Selector Modal Native Implementation */}
      {groupTypeModalVisible && (
        <View style={StyleSheet.absoluteFillObject}>
          <TouchableOpacity
            style={{ flex: 1, minWidth: 150, backgroundColor: "rgba(0,0,0,0.5)" }}
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
            paddingBottom: Platform.OS === "ios" ? 40 : 24,
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
                  onPress={() => {
                    setGroupType(type.id);
                    setGroupTypeModalVisible(false);
                  }}
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
  contentFrame: {
    flex: 1,
    width: "100%",
    maxWidth: IS_WEB ? 1080 : undefined,
    alignSelf: "center",
    paddingHorizontal: IS_WEB ? 24 : 0,
    paddingTop: IS_WEB ? 16 : 0,
  },
  stepIndicatorContainer: {
    paddingHorizontal: IS_WEB ? 22 : 16,
    paddingTop: IS_WEB ? 18 : 24,
    paddingBottom: IS_WEB ? 14 : 8,
    borderRadius: IS_WEB ? 20 : 0,
    borderWidth: IS_WEB ? 1 : 0,
    marginBottom: IS_WEB ? 12 : 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: IS_WEB ? 0.08 : 0,
    shadowRadius: IS_WEB ? 16 : 0,
    elevation: IS_WEB ? 2 : 0,
  },
  stepIndicatorContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    paddingHorizontal: IS_WEB ? 8 : 0,
  },
  progressLineBg: {
    position: "absolute",
    left: IS_WEB ? 8 : 0,
    right: IS_WEB ? 8 : 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  activeProgressLine: {
    position: "absolute",
    left: IS_WEB ? 8 : 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  stepItem: {
    alignItems: "center",
    zIndex: 10,
    flex: 1,
    minWidth: 0,
  },
  stepCircle: {
    width: IS_WEB ? 44 : 40,
    height: IS_WEB ? 44 : 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
  },
  stepText: {
    fontSize: IS_WEB ? 13 : 11,
    marginTop: 8,
    textAlign: "center",
    lineHeight: IS_WEB ? 18 : 15,
    includeFontPadding: false,
    width: "100%",
  },
  formContainer: {
    flex: 1,
    marginTop: IS_WEB ? 0 : 16,
    borderRadius: IS_WEB ? 20 : 0,
    borderWidth: IS_WEB ? 1 : 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: IS_WEB ? 0.08 : 0,
    shadowRadius: IS_WEB ? 22 : 0,
    elevation: IS_WEB ? 3 : 0,
  },
  scrollContent: {
    paddingHorizontal: IS_WEB ? 28 : 24,
    paddingTop: IS_WEB ? 26 : 0,
    paddingBottom: IS_WEB ? 170 : 150,
  },
  sectionTitle: {
    fontSize: IS_WEB ? 24 : 20,
    marginBottom: IS_WEB ? 22 : 24,
    textAlign: IS_WEB ? "left" : "center",
    fontFamily: "Poppins_600SemiBold",
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    marginBottom: 10,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Poppins_600SemiBold",
  },
  inputWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  textInput: {
    paddingHorizontal: 16,
    paddingVertical: IS_WEB ? 14 : 16,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "left",
    textAlignVertical: "center",
  },
  addMemberRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  addBtn: {
    width: IS_WEB ? 44 : 48,
    height: IS_WEB ? 44 : 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dashedBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
    marginBottom: 24,
  },
  dashedBoxText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  membersList: {
    gap: 8,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontWeight: "bold",
    color: "#312E81", // primaryDark approx
  },
  memberName: {
    fontFamily: "Poppins_500Medium",
  },
  reviewContainer: {
    padding: 16,
    borderRadius: 16,
    gap: 16,
    marginBottom: 16,
  },
  reviewLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    color: "#9CA3AF",
    fontWeight: "bold",
    marginBottom: 4,
  },
  reviewValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  divider: {
    height: 1,
  },
  tagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  termsText: {
    textAlign: "center",
    fontSize: 12,
    color: "#9CA3AF",
    paddingHorizontal: 16,
  },
  navigationButtons: {
    marginTop: IS_WEB ? 30 : 32,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    height: 56,
  },
  backBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
  },
  nextBtnText: {
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
    fontSize: 16,
  },
  searchResultsContainer: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
  },
  typeButton: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
});
