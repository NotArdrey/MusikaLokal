import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { DEFAULT_AVATAR } from "../src/constants/Images";
import { useTheme } from "../src/context/ThemeContext";



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
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "Please log in first");
        router.back();
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Load profile error:", error);
      }

      if (data) {
        setDisplayName(data.full_name || "");
        setContactNumber(data.contact_number || "");
        setLocation(data.address || data.location || "");
        setBio(data.bio || "");
        setAvatarUrl(data.avatar_url || DEFAULT_AVATAR);
        setSelectedRoles(Array.isArray(data.skills) ? data.skills : []);
        setSelectedGenres(Array.isArray(data.genres) ? data.genres : []);
        setResumeUrl(data.resume_url || null);
      }
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadResume() {
    if (!userId) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];

      // Check file size (max 10MB)
      if (file.size && file.size > 10 * 1024 * 1024) {
        Alert.alert("File Too Large", "Resume must be under 10MB");
        return;
      }

      setUploadingResume(true);

      // Fetch the file and convert to ArrayBuffer
      const response = await fetch(file.uri);
      const arrayBuffer = await response.arrayBuffer();

      const fileName = `${userId}/resume_${Date.now()}.pdf`;

      console.log("📤 Uploading resume:", fileName);

      const { data, error } = await supabase.storage
        .from("documents")
        .upload(fileName, arrayBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (error) {
        console.error("❌ Resume upload error:", error);
        Alert.alert("Upload Failed", error.message);
        setUploadingResume(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(data.path);
      const newResumeUrl = urlData.publicUrl;

      console.log("✅ Resume uploaded:", newResumeUrl);

      setResumeUrl(newResumeUrl);
      setUploadingResume(false);
      Alert.alert(
        "Success",
        "Resume uploaded! Don't forget to save your profile.",
      );
    } catch (err: any) {
      setUploadingResume(false);
      console.error("❌ Resume error:", err);
      Alert.alert("Error", err.message || "Failed to upload resume");
    }
  }

  function handleRemoveResume() {
    Alert.alert(
      "Remove Resume",
      "Are you sure you want to remove your resume?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => setResumeUrl(null),
        },
      ],
    );
  }

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

  async function handleChangePhoto() {
    if (!userId) return;

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
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
        Alert.alert("Error", "Could not read image data");
        return;
      }

      setUploadingPhoto(true);

      const ext = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;

      console.log("📤 Uploading photo...");
      console.log("📦 Base64 length:", asset.base64.length);

      // Decode base64 to ArrayBuffer
      const base64 = asset.base64;
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

      console.log("📤 Bytes length:", bytes.length);

      const { data, error } = await supabase.storage
        .from("avatars")
        .upload(path, bytes, {
          contentType,
          upsert: true,
        });

      setUploadingPhoto(false);

      if (error) {
        console.error("❌ Upload error:", error);
        Alert.alert("Upload Failed", error.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(data.path);
      const newAvatarUrl = urlData.publicUrl;

      console.log("✅ Uploaded:", newAvatarUrl);

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: newAvatarUrl })
        .eq("id", userId);

      if (updateErr) {
        console.error("❌ Profile update error:", updateErr);
        Alert.alert("Error", "Photo uploaded but failed to save to profile");
        return;
      }

      setAvatarUrl(newAvatarUrl);
      Alert.alert("Success", "Profile photo updated!");
    } catch (err: any) {
      setUploadingPhoto(false);
      console.error("❌ Error:", err);
      Alert.alert("Error", err.message || "Failed to upload photo");
    }
  }

  async function handleSave() {
    if (!userId) {
      Alert.alert("Error", "Not authenticated");
      return;
    }

    setSaving(true);

    const updateData = {
      skills: selectedRoles,
      genres: selectedGenres,
      bio,
      contact_number: contactNumber,
      address: location,
      location: location,
      resume_url: resumeUrl,
    };

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    setSaving(false);

    if (error) {
      Alert.alert("Error", error.message || "Failed to save");
      return;
    }

    Alert.alert("Success", "Profile updated!", [
      { text: "OK", onPress: () => router.back() },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Edit Profile" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
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
              style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
              onPress={handleChangePhoto}
              disabled={uploadingPhoto}
              activeOpacity={0.8}
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
            CONTACT NUMBER
          </Text>
          <TextInput
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

        {/* Location */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            LOCATION
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={location}
            onChangeText={setLocation}
            placeholder="Your location"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* Roles */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            ROLES & INSTRUMENTS
          </Text>
          <View style={styles.chips}>
            {ROLES.map((role) => {
              const selected = selectedRoles.includes(role);
              return (
                <TouchableOpacity
                  key={role}
                  onPress={() => toggleRole(role)}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? isDark
                          ? "rgba(124, 58, 237, 0.3)"
                          : "#EEF2FF"
                        : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: selected
                          ? isDark
                            ? "#A78BFA"
                            : colors.primary
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    {role}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Genres */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            GENRES
          </Text>
          <View style={styles.chips}>
            {GENRES.map((genre) => {
              const selected = selectedGenres.includes(genre);
              return (
                <TouchableOpacity
                  key={genre}
                  onPress={() => toggleGenre(genre)}
                  style={[
                    styles.chip,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? isDark
                          ? "rgba(124, 58, 237, 0.3)"
                          : "#EEF2FF"
                        : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: selected
                          ? isDark
                            ? "#A78BFA"
                            : colors.primary
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    {genre}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            BIO
          </Text>
          <TextInput
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
            textAlignVertical="top"
          />
        </View>

        {/* Resume/CV Upload */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            RESUME / CV
          </Text>

          {!resumeUrl ? (
            <TouchableOpacity
              style={[
                styles.uploadBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? "#374151" : "#F9FAFB",
                },
              ]}
              onPress={handleUploadResume}
              disabled={uploadingResume}
            >
              {uploadingResume ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons
                    name="document-attach-outline"
                    size={24}
                    color={colors.primary}
                  />
                  <Text style={[styles.uploadText, { color: colors.text }]}>
                    Upload PDF Resume
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View
              style={[
                styles.fileContainer,
                {
                  backgroundColor: isDark ? "#374151" : "#F3F4F6",
                  borderColor: colors.primary,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.fileInfo}
                onPress={() => Linking.openURL(resumeUrl)}
              >
                <Ionicons
                  name="document-text"
                  size={24}
                  color={colors.primary}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={[styles.fileName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    Resume.pdf
                  </Text>
                  <Text style={[{ fontSize: 12, color: colors.primary }]}>
                    Tap to view
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRemoveResume}
                style={styles.removeBtn}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
          <Text style={[styles.helper, { color: colors.textSecondary }]}>
            PDF only, max 10MB
          </Text>
        </View>

        {/* Buttons */}
        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: saving ? colors.textSecondary : colors.primary },
          ]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Profile</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: colors.border }]}
          onPress={() => router.back()}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={[styles.cancelBtnText, { color: colors.text }]}>
            Cancel
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Navbar />
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
  scrollContent: { padding: 20, paddingBottom: 100 },

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
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
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
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Poppins_500Medium" },

  saveBtn: {
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
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
