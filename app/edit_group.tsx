import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal as RNModal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Navbar from "../src/components/navbar";
import { useTheme } from "../src/context/ThemeContext";

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

  // Enhanced member structure: { name, instrument, role?, user_id?, avatar_url? }
  interface MemberDetail {
    name: string;
    instrument: string;
    role?: string; // "Leader" for group creator
    user_id?: string;
    avatar_url?: string;
  }
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberInstrument, setNewMemberInstrument] = useState("");
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);

  // Group type: duo (exactly 2 members) or band (3+ members)
  const [groupType, setGroupType] = useState<"duo" | "band">("band");

  // Leadership Transfer State
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [pendingTransfer, setPendingTransfer] = useState<any>(null);
  const [selectedNewLeader, setSelectedNewLeader] = useState<any>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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

      const { data: profile } = await supabase.functions.invoke(
        "manage-profile",
        {
          body: { action: "fetch", userId: user.id },
        },
      );

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

      const { data, error } = await supabase.functions.invoke(
        "listings-crud",
        {
          body: {
            action: "fetch_one",
            type: "group",
            id: groupId,
            userId: user.id,
          },
        },
      );

      if (error) throw error;

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
      setAddress(data.location || "");
      setLatitude(data.latitude || null);
      setLongitude(data.longitude || null);
      // Load group type (default to 'band' for backward compatibility)
      setGroupType(data.group_type || "band");
      // Handle both old string[] format and new MemberDetail[] format
      const rawMembers = data.members || [];
      const parsedMembers: MemberDetail[] = rawMembers.map(
        (m: any, index: number) => {
          if (typeof m === "string") {
            // Old format: just a string (instrument or name)
            return {
              name: m,
              instrument: m,
              role: index === 0 ? "Leader" : undefined,
            };
          }
          // New format: already an object
          return m;
        },
      );
      setMembers(parsedMembers);
      setImages(data.images || []);
      if (data.images && data.images.length > 0) {
        setThumbnailIndex(0);
      }
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
    const leader = members.find((m) => m.role === "Leader");
    if (!leader?.instrument?.trim()) {
      showAlert(
        "error",
        "Leader Instrument Required",
        "Please enter your instrument/role as the group leader.",
      );
      return false;
    }
    // Validate member count based on group type
    if (groupType === "duo") {
      if (members.length !== 2) {
        showAlert(
          "warning",
          "Duo Requirement",
          "A duo must have exactly 2 members. Adjust members or change group type.",
        );
        return false;
      }
    } else {
      if (members.length < 3) {
        showAlert(
          "warning",
          "Band Requirement",
          'A band must have at least 3 members. Add more members or change to "Duo" type.',
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

      const { error } = await supabase.functions.invoke("listings-crud", {
        body: {
          action: "update",
          type: "group",
          id: groupId,
          userId: user.id,
          payload,
        },
      });

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

        Alert.alert("Error", alertMessage);
        return;
      }

      console.log("✅ Group Updated");
      showAlert("success", "Success", "Group updated successfully!", [
        {
          text: "OK",
          onPress: () => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/manage_group");
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

    showAlert(
      "warning",
      "Save Changes",
      "Are you sure you want to update this group profile?",
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

  const addMember = () => {
    if (newMemberName.trim() && newMemberInstrument.trim()) {
      const newMember: MemberDetail = {
        name: newMemberName.trim(),
        instrument: newMemberInstrument.trim(),
      };
      setMembers([...members, newMember]);
      setNewMemberName("");
      setNewMemberInstrument("");
      setShowAddMemberForm(false);
    }
  };

  const removeMember = (index: number) => {
    // Prevent removing the leader (first member)
    if (index === 0) {
      showAlert(
        "warning",
        "Cannot Remove",
        "You cannot remove the group leader.",
      );
      return;
    }
    setMembers(members.filter((_, i) => i !== index));
  };

  const updateMemberInstrument = (index: number, instrument: string) => {
    const updated = [...members];
    updated[index] = { ...updated[index], instrument };
    setMembers(updated);
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

      // Send notification to new leader
      await supabase.functions.invoke("listings-crud", {
        body: {
          action: "create_notification",
          userId: currentUserId,
          targetUserId: selectedNewLeader.user_id,
          type: "info",
          title: "Leadership Transfer Request",
          message: `You have been invited to become the leader of "${groupName}". Open to accept or decline.`,
          meta: {
            type: "leadership_transfer",
            request_id: data.id,
            group_id: groupId,
            group_name: groupName,
          },
        },
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
        <Header title="Edit Group" />

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
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setGroupType("duo")}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor:
                      groupType === "duo"
                        ? colors.primary
                        : colors.inputBackground,
                    borderColor:
                      groupType === "duo"
                        ? colors.primary
                        : isDark
                          ? "#374151"
                          : "#E5E7EB",
                    flex: 1,
                  },
                ]}
              >
                <Ionicons
                  name="people-outline"
                  size={24}
                  color={groupType === "duo" ? "#FFF" : colors.text}
                />
                <Text
                  style={{
                    color: groupType === "duo" ? "#FFF" : colors.text,
                    fontFamily: "Poppins_600SemiBold",
                    fontSize: 16,
                    marginTop: 4,
                  }}
                >
                  Duo
                </Text>
                <Text
                  style={{
                    color:
                      groupType === "duo"
                        ? "rgba(255,255,255,0.8)"
                        : colors.textSecondary,
                    fontFamily: "Poppins_400Regular",
                    fontSize: 12,
                  }}
                >
                  Exactly 2 members
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setGroupType("band")}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor:
                      groupType === "band"
                        ? colors.primary
                        : colors.inputBackground,
                    borderColor:
                      groupType === "band"
                        ? colors.primary
                        : isDark
                          ? "#374151"
                          : "#E5E7EB",
                    flex: 1,
                  },
                ]}
              >
                <Ionicons
                  name="musical-notes-outline"
                  size={24}
                  color={groupType === "band" ? "#FFF" : colors.text}
                />
                <Text
                  style={{
                    color: groupType === "band" ? "#FFF" : colors.text,
                    fontFamily: "Poppins_600SemiBold",
                    fontSize: 16,
                    marginTop: 4,
                  }}
                >
                  Band
                </Text>
                <Text
                  style={{
                    color:
                      groupType === "band"
                        ? "rgba(255,255,255,0.8)"
                        : colors.textSecondary,
                    fontFamily: "Poppins_400Regular",
                    fontSize: 12,
                  }}
                >
                  3 or more members
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {renderInput("Group Name", groupName, setGroupName)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Based Location
            </Text>
            <TouchableOpacity
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
                  <TouchableOpacity
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
            <TouchableOpacity
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

          {renderSectionHeader("Band Members", "person")}

          {/* Toggle Add Member Form */}
          <TouchableOpacity
            onPress={() => setShowAddMemberForm(!showAddMemberForm)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
              gap: 8,
            }}
          >
            <Ionicons
              name={showAddMemberForm ? "chevron-down" : "add-circle"}
              size={20}
              color={colors.primary}
            />
            <Text
              style={{ color: colors.primary, fontFamily: "Poppins_500Medium" }}
            >
              {showAddMemberForm ? "Hide form" : "Add new member"}
            </Text>
          </TouchableOpacity>

          {/* Add Member Form */}
          {showAddMemberForm && (
            <View
              style={[
                styles.addMemberContainer,
                {
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 16,
                  padding: 12,
                  backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                  borderRadius: 12,
                },
              ]}
            >
              <TextInput
                value={newMemberName}
                onChangeText={setNewMemberName}
                placeholder="Member name"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  {
                    fontFamily: "Poppins_400Regular",
                    color: colors.text,
                    backgroundColor: colors.inputBackground,
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={newMemberInstrument}
                  onChangeText={setNewMemberInstrument}
                  placeholder="Instrument (e.g., Vocals, Guitar)"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      fontFamily: "Poppins_400Regular",
                      color: colors.text,
                      backgroundColor: colors.inputBackground,
                      borderRadius: 8,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <TouchableOpacity
                  onPress={addMember}
                  disabled={
                    !newMemberName.trim() || !newMemberInstrument.trim()
                  }
                  style={[
                    styles.addMemberButton,
                    {
                      backgroundColor:
                        !newMemberName.trim() || !newMemberInstrument.trim()
                          ? "#9CA3AF"
                          : colors.primary,
                    },
                  ]}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.membersList}>
            {members.map((member, index) => {
              const isLeader = member.role === "Leader" || index === 0;
              return (
                <View
                  key={index}
                  style={[
                    styles.memberItem,
                    {
                      backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                      padding: 12,
                      marginBottom: 8,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flex: 1,
                      gap: 12,
                    }}
                  >
                    <View
                      style={[
                        styles.avatarPlaceholder,
                        {
                          backgroundColor: isLeader
                            ? colors.primary
                            : isDark
                              ? "#374151"
                              : "#E0E7FF",
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      {member.avatar_url ? (
                        <Image
                          source={{ uri: member.avatar_url }}
                          style={{ width: 44, height: 44, borderRadius: 22 }}
                        />
                      ) : (
                        <Text
                          style={{
                            color: isLeader
                              ? "#fff"
                              : isDark
                                ? "#A5B4FC"
                                : "#4F46E5",
                            fontWeight: "bold",
                            fontSize: 16,
                          }}
                        >
                          {member.name?.charAt(0)?.toUpperCase() || "?"}
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
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 2,
                        }}
                      >
                        <Ionicons
                          name="musical-note"
                          size={12}
                          color={colors.primary}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.primary,
                            fontFamily: "Poppins_500Medium",
                          }}
                        >
                          {member.instrument || "No instrument"}
                        </Text>
                        {isLeader && (
                          <View
                            style={{
                              backgroundColor: colors.primary + "20",
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 10,
                              marginLeft: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                color: colors.primary,
                                fontFamily: "Poppins_600SemiBold",
                              }}
                            >
                              Leader
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  {!isLeader && (
                    <TouchableOpacity
                      onPress={() => removeMember(index)}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close-circle" size={24} color="#EF4444" />
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
              <TouchableOpacity
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
            <TouchableOpacity
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
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => router.back()}
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
                  <TouchableOpacity
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
              <TouchableOpacity
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
                activeOpacity={0.8}
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
  addMemberContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  addMemberInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  addMemberButton: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
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
