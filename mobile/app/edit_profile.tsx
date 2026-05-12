import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    BackHandler,
    Image,

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
import LeafletAddressPicker from "../src/components/LeafletAddressPicker";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import { DEFAULT_AVATAR } from "../src/constants/Images";
import { useTheme } from "../src/context/ThemeContext";
import { ensureUploadPassesSafetyScreening } from "../src/services/uploadSafetyScreen";
import { isE2EFixtureMode } from "../src/utils/e2eFixtures";



const ROLES = [
  "Vocalist",
  "Guitarist",
  "Bassist",
  "Drummer",
  "Keyboardist",
  "DJ",
  "Producer",
  "Sound Engineer",
  "Saxophonist",
  "Violinist",
  "Cellist",
  "Pianist",
  "Flutist",
  "Trumpeter",
  "Percussionist",
  "Harpist",
  "Ukulele Player",
  "Banjo Player",
  "Harmonica Player",
  "Beatboxer",
  "Rapper",
  "Songwriter",
  "Composer",
  "Music Director",
  "Conductor",
  "Session Musician",
  "Live Sound Engineer",
  "Recording Engineer",
  "Mixing Engineer",
];

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

const sanitizeAvatarUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;

  // Legacy rows may have `/object/avatars/...` which is not publicly readable.
  return trimmed.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
};

const withCacheBust = (url: string) => {
  const delimiter = url.includes("?") ? "&" : "?";
  return `${url}${delimiter}v=${Date.now()}`;
};

export default function EditProfileScreen() {
  const { colors, isDark } = useTheme();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<any>(DEFAULT_AVATAR);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [roleSearch, setRoleSearch] = useState("");
  const [genreSearch, setGenreSearch] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState<{
    base64: string;
    ext: string;
  } | null>(null);
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

  const initialSnapshotRef = useRef<{
    contactNumber: string;
    location: string;
    bio: string;
    roles: string[];
    genres: string[];
  } | null>(null);

  const normalizeList = (items: string[]) =>
    Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b),
    );

  const currentSnapshot = useMemo(
    () => ({
      contactNumber: contactNumber.trim(),
      location: location.trim(),
      bio: bio.trim(),
      roles: normalizeList(selectedRoles),
      genres: normalizeList(selectedGenres),
    }),
    [contactNumber, location, bio, selectedRoles, selectedGenres],
  );

  const hasIncompleteRequiredFields = useMemo(
    () =>
      !contactNumber.trim() ||
      !location.trim() ||
      selectedRoles.length === 0 ||
      selectedGenres.length === 0 ||
      !bio.trim(),
    [contactNumber, location, selectedRoles, selectedGenres, bio],
  );

  const hasUnsavedChanges = useMemo(() => {
    const initial = initialSnapshotRef.current;
    if (!initial) return false;

    return (
      initial.contactNumber !== currentSnapshot.contactNumber ||
      initial.location !== currentSnapshot.location ||
      initial.bio !== currentSnapshot.bio ||
      JSON.stringify(initial.roles) !== JSON.stringify(currentSnapshot.roles) ||
      JSON.stringify(initial.genres) !== JSON.stringify(currentSnapshot.genres) ||
      Boolean(pendingAvatar)
    );
  }, [currentSnapshot, pendingAvatar]);

  const handleAttemptLeave = useCallback(() => {
    if (saving) return;
    showAlert(
      "warning",
      "Leave edit profile?",
      hasUnsavedChanges
        ? "You have unsaved changes. Leave without saving?"
        : "Your current edits won't be saved unless you tap Save Profile.",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => router.replace("/profile"),
        },
      ],
    );
  }, [hasUnsavedChanges, saving]);


  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showAlert("warning", "Not Logged In", "Please log in to continue.");
        router.replace("/");
        return;
      }

      setUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Load profile error:", profileError);
      }

      let resolvedProfile = null;

      if (profileData) {
        const [skillsResult, genresResult] = await Promise.all([
          supabase
            .from("profile_skills")
            .select("skill")
            .eq("profile_id", user.id),
          supabase
            .from("profile_genres")
            .select("genre")
            .eq("profile_id", user.id),
        ]);

        resolvedProfile = {
          ...profileData,
          skills: (skillsResult.data || []).map((row: any) => row.skill).filter(Boolean),
          genres: (genresResult.data || []).map((row: any) => row.genre).filter(Boolean),
        };
      }

      if (resolvedProfile) {
        setDisplayName(resolvedProfile.full_name || "");
        setContactNumber(resolvedProfile.contact_number || "");
        setLocation(resolvedProfile.address || resolvedProfile.location || "");
        setBio(resolvedProfile.bio || "");
        const normalizedAvatarUrl = sanitizeAvatarUrl(resolvedProfile.avatar_url);
        setAvatarUrl(normalizedAvatarUrl || DEFAULT_AVATAR);
        setSelectedRoles(Array.isArray(resolvedProfile.skills) ? resolvedProfile.skills : []);
        setSelectedGenres(Array.isArray(resolvedProfile.genres) ? resolvedProfile.genres : []);

        initialSnapshotRef.current = {
          contactNumber: (resolvedProfile.contact_number || "").trim(),
          location: (resolvedProfile.address || resolvedProfile.location || "").trim(),
          bio: (resolvedProfile.bio || "").trim(),
          roles: normalizeList(
            Array.isArray(resolvedProfile.skills) ? resolvedProfile.skills : [],
          ),
          genres: normalizeList(
            Array.isArray(resolvedProfile.genres) ? resolvedProfile.genres : [],
          ),
        };

      }
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }

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



  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }

  async function chooseAvatarFromLibrary() {
    if (!userId) return;

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showAlert(
          "warning",
          "Permission Required",
          "Please allow access to your photos",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true, // Request base64 directly from ImagePicker
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        showAlert("warning", "Couldn't Read Image", "Could not read image data. Please try a different photo.");
        return;
      }

      const ext = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      await ensureUploadPassesSafetyScreening(
        {
          name: (asset as any)?.fileName || `profile-photo.${ext}`,
          mimeType,
          size: Math.floor((asset.base64.length * 3) / 4),
          uri: asset.uri,
          contentDataUrl: `data:${mimeType};base64,${asset.base64}`,
          kind: "photo",
        },
        "edit_profile_avatar",
      );
      setPendingAvatar({ base64: asset.base64, ext });
      setAvatarUrl(asset.uri);
      showAlert("info", "Photo selected", "Tap Save Profile to apply your new photo.");
    } catch (err: any) {
      setUploadingPhoto(false);
      console.error("❌ Error:", err);
      showAlert("warning", "Upload Failed", err.message || "Failed to upload photo");
    }
  }

  async function captureAvatarWithCamera() {
    if (!userId) return;

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        showAlert(
          "warning",
          "Permission Required",
          "Please allow camera access to take a profile photo.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        showAlert("warning", "Couldn't Read Image", "Could not read image data. Please try again.");
        return;
      }

      const ext = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;
      await ensureUploadPassesSafetyScreening(
        {
          name: (asset as any)?.fileName || `profile-photo.${ext}`,
          mimeType,
          size: Math.floor((asset.base64.length * 3) / 4),
          uri: asset.uri,
          contentDataUrl: `data:${mimeType};base64,${asset.base64}`,
          kind: "photo",
        },
        "edit_profile_avatar",
      );
      setPendingAvatar({ base64: asset.base64, ext });
      setAvatarUrl(asset.uri);
      showAlert("info", "Photo selected", "Tap Save Profile to apply your new photo.");
    } catch (err: any) {
      setUploadingPhoto(false);
      console.error("Camera capture error:", err);
      showAlert("warning", "Capture Failed", err.message || "Failed to capture photo.");
    }
  }

  function handleChangePhoto() {
    if (!userId) return;

    showAlert(
      "info",
      "Update Profile Photo",
      "Take a new photo or choose one from your gallery.",
      [
        { text: "Take Photo", onPress: () => void captureAvatarWithCamera() },
        { text: "Choose from Gallery", onPress: () => void chooseAvatarFromLibrary() },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  async function handleSave() {
    if (!userId) {
      showAlert("warning", "Not Logged In", "Please log in to continue.");
      return;
    }

    if (!contactNumber.trim()) {
      showAlert("warning", "Required", "Please enter your contact number.");
      return;
    }
    if (!location.trim()) {
      showAlert("warning", "Required", "Please enter your address.");
      return;
    }
    if (selectedRoles.length === 0) {
      showAlert("warning", "Required", "Please select at least one role or instrument.");
      return;
    }
    if (selectedGenres.length === 0) {
      showAlert("warning", "Required", "Please select at least one genre.");
      return;
    }
    if (!bio.trim()) {
      showAlert("warning", "Required", "Please write a short bio.");
      return;
    }

    setSaving(true);

    try {
      const cleanedRoles = Array.from(
        new Set(selectedRoles.map((role) => role.trim()).filter(Boolean)),
      );
      const cleanedGenres = Array.from(
        new Set(selectedGenres.map((genre) => genre.trim()).filter(Boolean)),
      );

      let uploadedAvatarUrl: string | null = null;

      if (pendingAvatar) {
        setUploadingPhoto(true);

        const path = `${userId}/${Date.now()}.${pendingAvatar.ext}`;
        const contentType = `image/${pendingAvatar.ext === "jpg" ? "jpeg" : pendingAvatar.ext}`;
        const base64 = pendingAvatar.base64;

        const chars =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        const lookup = new Uint8Array(256);
        for (let i = 0; i < chars.length; i++) {
          lookup[chars.charCodeAt(i)] = i;
        }

        let bufferLength = base64.length * 0.75;
        if (base64[base64.length - 1] === "=") bufferLength--;
        if (base64[base64.length - 2] === "=") bufferLength--;

        const bytes = new Uint8Array(Math.floor(bufferLength));
        let p = 0;

        for (let i = 0; i < base64.length; i += 4) {
          const e1 = lookup[base64.charCodeAt(i)];
          const e2 = lookup[base64.charCodeAt(i + 1)];
          const e3 = lookup[base64.charCodeAt(i + 2)];
          const e4 = lookup[base64.charCodeAt(i + 3)];

          if (p < bytes.length) bytes[p++] = (e1 << 2) | (e2 >> 4);
          if (p < bytes.length) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
          if (p < bytes.length) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
        }

        const { data, error } = await supabase.storage
          .from("avatars")
          .upload(path, bytes, {
            contentType,
            upsert: true,
          });

        if (error) {
          throw error;
        }

        const { data: urlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(data.path);
        uploadedAvatarUrl = sanitizeAvatarUrl(urlData.publicUrl);
      }

      const profilePayload: any = {
        bio,
        contact_number: contactNumber,
        address: location,
        location,
      };

      if (uploadedAvatarUrl) {
        profilePayload.avatar_url = uploadedAvatarUrl;
      }

      const { data: updatedProfile, error: profileUpdateError } = await supabase
        .from("profiles")
        .update(profilePayload)
        .eq("id", userId)
        .select("id")
        .maybeSingle();

      if (profileUpdateError) {
        throw profileUpdateError;
      }

      if (!updatedProfile) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw userError || new Error("Unable to resolve your account. Please sign in again.");
        }

        if (!user.email) {
          throw new Error("Your account email is missing. Please sign in again.");
        }

        const metadataRole =
          typeof user.user_metadata?.role === "string"
            ? user.user_metadata.role.trim().toLowerCase()
            : "";
        const normalizedRole = ["musician", "studio-owner", "venue-owner", "producer"].includes(
          metadataRole,
        )
          ? metadataRole
          : "musician";

        const fallbackName =
          displayName.trim() ||
          (typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name.trim()
            : "") ||
          (typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name.trim()
            : "") ||
          user.email.split("@")[0] ||
          "MusikaLokal User";

        const { error: profileInsertError } = await supabase.from("profiles").insert({
          id: userId,
          email: user.email,
          role: normalizedRole,
          full_name: fallbackName,
          ...profilePayload,
        });

        if (profileInsertError) {
          throw profileInsertError;
        }
      }

      const { error: skillsDeleteError } = await supabase
        .from("profile_skills")
        .delete()
        .eq("profile_id", userId);

      if (skillsDeleteError) {
        throw skillsDeleteError;
      }

      if (cleanedRoles.length > 0) {
        const { error: skillsInsertError } = await supabase
          .from("profile_skills")
          .insert(cleanedRoles.map((skill) => ({ profile_id: userId, skill })));

        if (skillsInsertError) {
          throw skillsInsertError;
        }
      }

      const { error: genresDeleteError } = await supabase
        .from("profile_genres")
        .delete()
        .eq("profile_id", userId);

      if (genresDeleteError) {
        throw genresDeleteError;
      }

      if (cleanedGenres.length > 0) {
        const { error: genresInsertError } = await supabase
          .from("profile_genres")
          .insert(cleanedGenres.map((genre) => ({ profile_id: userId, genre })));

        if (genresInsertError) {
          throw genresInsertError;
        }
      }

      if (uploadedAvatarUrl) {
        setAvatarUrl(withCacheBust(uploadedAvatarUrl));
      }

      setPendingAvatar(null);

      initialSnapshotRef.current = {
        contactNumber: contactNumber.trim(),
        location: location.trim(),
        bio: bio.trim(),
        roles: normalizeList(cleanedRoles),
        genres: normalizeList(cleanedGenres),
      };

      showAlert("success", "Success", "Profile updated!", [
        { text: "OK", onPress: () => router.replace("/profile") },
      ]);
    } catch (error: any) {
      showAlert("warning", "Couldn't Save", error?.message || "Failed to save changes.");
    } finally {
      setUploadingPhoto(false);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Edit Profile" onBackPress={handleAttemptLeave} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.editProfileSkeletonContent}>
          <View style={styles.avatarContainer}>
            <Skeleton width={110} height={110} borderRadius={55} />
            <Skeleton width={132} height={14} style={{ marginTop: 12 }} />
          </View>

          <Skeleton width={94} height={12} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={52} borderRadius={10} style={{ marginBottom: 16 }} />

          <Skeleton width={120} height={12} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={90} borderRadius={10} style={{ marginBottom: 16 }} />

          <Skeleton width={110} height={12} style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={52} borderRadius={10} style={{ marginBottom: 16 }} />

          <Skeleton width="100%" height={48} borderRadius={12} style={{ marginTop: 8 }} />
          <Skeleton width="100%" height={48} borderRadius={12} style={{ marginTop: 10 }} />
        </ScrollView>

        <Navbar />
      </View>
    );
  }

  return (
    <View
      testID="mobile-edit-profile-page"
      accessibilityLabel="mobile-edit-profile-page"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Header title="Edit Profile" onBackPress={handleAttemptLeave} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isE2EFixtureMode() && styles.e2eScrollContent,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatarWrapper}>
            <Image
              source={
                typeof avatarUrl === "string" ? { uri: avatarUrl } : avatarUrl
              }
              style={[styles.avatar, { borderColor: colors.primary }]}
            />
            <TouchableOpacity
              testID="mobile-profile-photo-button"
              accessibilityLabel="mobile-profile-photo-button"
              style={[styles.cameraBtn, { backgroundColor: colors.primary, opacity: uploadingPhoto ? 0.6 : 1 }]}
              onPress={handleChangePhoto}
              disabled={uploadingPhoto}
              activeOpacity={uploadingPhoto ? 1 : 0.78}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={[styles.changePhotoText, { color: colors.primary }]}>
            {uploadingPhoto ? "Uploading..." : "Change Photo"}
          </Text>
        </View>

        {/* Display Name (read-only) */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            DISPLAY NAME
          </Text>
          <View
            style={[
              styles.disabledInput,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.disabledText, { color: colors.muted }]}>
              {displayName || "Not set"}
            </Text>
          </View>
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            Cannot be changed
          </Text>
        </View>

        {/* Contact Number */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            CONTACT NUMBER <Text style={{ color: "#ef4444" }}>*</Text>
          </Text>
          <TextInput
            testID="mobile-profile-contact-input"
            accessibilityLabel="mobile-profile-contact-input"
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={contactNumber}
            onChangeText={setContactNumber}
            placeholder="Your contact number"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
          />
        </View>

        {/* Address */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            ADDRESS <Text style={{ color: "#ef4444" }}>*</Text>
          </Text>
          <LeafletAddressPicker
            value={location}
            onAddressSelect={(address) => setLocation(address)}
            placeholder="Tap to select your address"
          />
        </View>

        {/* Roles */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            ROLES & INSTRUMENTS <Text style={{ color: "#ef4444" }}>*</Text>
          </Text>
          {/* Selected roles */}
          {selectedRoles.length > 0 && (
            <View style={styles.selectedChips}>
              {selectedRoles.map((role) => (
                <TouchableOpacity activeOpacity={1}
                  key={role}
                  onPress={() => toggleRole(role)}
                  style={[
                    styles.chipCompact,
                    {
                      borderColor: colors.primary,
                      backgroundColor: isDark
                        ? "rgba(124, 58, 237, 0.3)"
                        : "#EEF2FF",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipTextCompact,
                      { color: isDark ? "#A78BFA" : colors.primary },
                    ]}
                  >
                    {role}
                  </Text>
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color={isDark ? "#A78BFA" : colors.primary}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Search input */}
          <View style={[styles.searchInputWrap, { backgroundColor: isDark ? "#374151" : "#F3F4F6" }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              testID="mobile-profile-role-search-input"
              accessibilityLabel="mobile-profile-role-search-input"
              style={[styles.searchInput, { color: colors.text }]}
              value={roleSearch}
              onChangeText={setRoleSearch}
              placeholder="Search roles & instruments..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          {/* Filtered chips */}
          <View style={styles.chipsCompact}>
            {ROLES.filter(
              (role) =>
                !selectedRoles.includes(role) &&
                role.toLowerCase().includes(roleSearch.toLowerCase())
            )
              .slice(0, roleSearch ? 20 : 8)
              .map((role) => (
                <TouchableOpacity
                  testID={`mobile-profile-role-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  accessibilityLabel={`mobile-profile-role-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  activeOpacity={1}
                  key={role}
                  onPress={() => toggleRole(role)}
                  style={[
                    styles.chipCompact,
                    {
                      borderColor: colors.border,
                      backgroundColor: "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipTextCompact,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {role}
                  </Text>
                </TouchableOpacity>
              ))}
            {!roleSearch && ROLES.filter((r) => !selectedRoles.includes(r)).length > 8 && (
              <Text style={[styles.moreText, { color: colors.textSecondary }]}>
                Search for more...
              </Text>
            )}
          </View>
        </View>

        {/* Genres */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            GENRES <Text style={{ color: "#ef4444" }}>*</Text>
          </Text>
          {/* Selected genres */}
          {selectedGenres.length > 0 && (
            <View style={styles.selectedChips}>
              {selectedGenres.map((genre) => (
                <TouchableOpacity activeOpacity={1}
                  key={genre}
                  onPress={() => toggleGenre(genre)}
                  style={[
                    styles.chipCompact,
                    {
                      borderColor: colors.primary,
                      backgroundColor: isDark
                        ? "rgba(124, 58, 237, 0.3)"
                        : "#EEF2FF",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipTextCompact,
                      { color: isDark ? "#A78BFA" : colors.primary },
                    ]}
                  >
                    {genre}
                  </Text>
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color={isDark ? "#A78BFA" : colors.primary}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* Search input */}
          <View style={[styles.searchInputWrap, { backgroundColor: isDark ? "#374151" : "#F3F4F6" }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              testID="mobile-profile-genre-search-input"
              accessibilityLabel="mobile-profile-genre-search-input"
              style={[styles.searchInput, { color: colors.text }]}
              value={genreSearch}
              onChangeText={setGenreSearch}
              placeholder="Search genres..."
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          {/* Filtered chips */}
          <View style={styles.chipsCompact}>
            {GENRES.filter(
              (genre) =>
                !selectedGenres.includes(genre) &&
                genre.toLowerCase().includes(genreSearch.toLowerCase())
            )
              .slice(0, genreSearch ? 20 : 8)
              .map((genre) => (
                <TouchableOpacity
                  testID={`mobile-profile-genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  accessibilityLabel={`mobile-profile-genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  activeOpacity={1}
                  key={genre}
                  onPress={() => toggleGenre(genre)}
                  style={[
                    styles.chipCompact,
                    {
                      borderColor: colors.border,
                      backgroundColor: "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipTextCompact,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {genre}
                  </Text>
                </TouchableOpacity>
              ))}
            {!genreSearch && GENRES.filter((g) => !selectedGenres.includes(g)).length > 8 && (
              <Text style={[styles.moreText, { color: colors.textSecondary }]}>
                Search for more...
              </Text>
            )}
          </View>
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            BIO <Text style={{ color: "#ef4444" }}>*</Text>
          </Text>
          <TextInput
            testID="mobile-profile-bio-input"
            accessibilityLabel="mobile-profile-bio-input"
            style={[
              styles.textArea,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="center"
          />
        </View>



        {/* Buttons */}
        {hasIncompleteRequiredFields && (
          <Text
            style={{
              color: "#F59E0B",
              fontFamily: "Poppins_500Medium",
              fontSize: 12,
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            Complete required fields marked * before saving.
          </Text>
        )}
        <TouchableOpacity
          testID="mobile-profile-save-button"
          accessibilityLabel="mobile-profile-save-button"
          style={[
            styles.saveBtn,
            {
              backgroundColor:
                saving || hasIncompleteRequiredFields
                  ? colors.textSecondary
                  : colors.primary,
              opacity: saving || hasIncompleteRequiredFields ? 0.6 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={saving || hasIncompleteRequiredFields}
          activeOpacity={saving || hasIncompleteRequiredFields ? 1 : 0.78}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Profile</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          testID="mobile-profile-cancel-button"
          accessibilityLabel="mobile-profile-cancel-button"
          style={[styles.cancelBtn, { borderColor: colors.border }]}
          onPress={handleAttemptLeave}
          disabled={saving}
          activeOpacity={saving ? 1 : 0.78}
        >
          <Text style={[styles.cancelBtnText, { color: colors.text }]}>
            Cancel
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {!isE2EFixtureMode() && <Navbar />}

      <Modal
        visible={saving}
        loading
        loadingMessage="Saving profile..."
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 150 },
  e2eScrollContent: { paddingBottom: 280 },
  editProfileSkeletonContent: { padding: 20, paddingBottom: 150 },

  avatarContainer: { alignItems: "center", marginBottom: 24 },
  avatarWrapper: { position: "relative" },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3 },
  cameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  changePhotoText: {
    marginTop: 10,
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },

  field: { marginBottom: 20 },
  label: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    textAlignVertical: "center",
  },
  disabledInput: { borderWidth: 1, borderRadius: 10, padding: 14 },
  disabledText: { fontSize: 15, fontFamily: "Poppins_500Medium" },
  helper: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 4 },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    minHeight: 100,
    textAlignVertical: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  selectedChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chipsCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  chipCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipTextCompact: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    height: 48,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    height: 24,
    padding: 0,
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
    fontFamily: "Poppins_500Medium",
    textAlign: "left",
    textAlignVertical: "center",
  },
  moreText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    fontStyle: "italic",
    marginTop: 4,
  },

  saveBtn: {
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  cancelBtn: {
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginTop: 10,
  },
  cancelBtnText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },

  // Resume upload styles
  uploadBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  fileInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  fileName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  removeBtn: {
    padding: 4,
  },
});
