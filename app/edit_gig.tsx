import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Navbar from "../src/components/navbar";
import { useTheme } from "../src/context/ThemeContext";

import { useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

// Helper function to format time input
const formatTimeInput = (text: string): string => {
  // Remove all non-digit characters except colon
  let cleaned = text.replace(/[^0-9:]/g, "");

  // Limit to 5 characters (HH:MM)
  if (cleaned.length > 5) cleaned = cleaned.substring(0, 5);

  // Auto-add colon after 2 digits
  if (cleaned.length === 2 && !cleaned.includes(":")) {
    cleaned = cleaned + ":";
  }

  // If user types more than 2 digits before colon, insert colon
  if (cleaned.length > 2 && !cleaned.includes(":")) {
    cleaned = cleaned.substring(0, 2) + ":" + cleaned.substring(2);
  }

  // Validate hour (01-12)
  const parts = cleaned.split(":");
  if (parts[0] && parts[0].length === 2) {
    const hour = parseInt(parts[0]);
    if (hour < 1 || hour > 12) {
      return cleaned.substring(0, 1);
    }
  }

  // Validate minute (00-59)
  if (parts[1] && parts[1].length === 2) {
    const minute = parseInt(parts[1]);
    if (minute > 59) {
      return parts[0] + ":" + parts[1].substring(0, 1);
    }
  }

  return cleaned;
};

export default function EditGigScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [gigName, setGigName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [cost, setCost] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("06:00 PM");
  const [eventEndTime, setEventEndTime] = useState("11:00 PM");
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

  // Mock Data
  const [documents, setDocuments] = useState(["Contract.pdf", "Rider_v2.pdf"]);
  const [images, setImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [musicianType, setMusicianType] = useState<"solo" | "group" | "both">(
    "both",
  );
  const [requiredGenres, setRequiredGenres] = useState<string[]>([]);
  const [newGenre, setNewGenre] = useState("");
  const [requiredInstruments, setRequiredInstruments] = useState<string[]>([]);
  const [newInstrument, setNewInstrument] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");

  // Detailed Looking For Slots with Counts
  const [soloSlotsNeeded, setSoloSlotsNeeded] = useState<number>(0);
  const [duoSlotsNeeded, setDuoSlotsNeeded] = useState<number>(0);
  const [bandSlotsNeeded, setBandSlotsNeeded] = useState<number>(0);

  // Specific roles/instruments needed
  const [soloRolesNeeded, setSoloRolesNeeded] = useState<string[]>([]);
  const [newSoloRole, setNewSoloRole] = useState("");
  const [duoRolesNeeded, setDuoRolesNeeded] = useState<string[]>([]);
  const [newDuoRole, setNewDuoRole] = useState("");
  const [bandRolesNeeded, setBandRolesNeeded] = useState<string[]>([]);
  const [newBandRole, setNewBandRole] = useState("");

  // Anti-spam settings
  const [reapplicationCooldownDays, setReapplicationCooldownDays] = useState<number>(30);

  // Contract state
  const [contractUrl, setContractUrl] = useState<string>("");
  const [contractFileName, setContractFileName] = useState<string>("");
  const [uploadingContract, setUploadingContract] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Business Permit state
  const [businessPermitUrl, setBusinessPermitUrl] = useState<string>("");
  const [businessPermitFileName, setBusinessPermitFileName] = useState<string>("");
  const [uploadingBusinessPermit, setUploadingBusinessPermit] = useState(false);
  const businessPermitInputRef = useRef<HTMLInputElement>(null);

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

      if (profile?.role !== "venue-owner") {
        showAlert("error", "Unauthorized", "Only venue owners can edit gigs.");
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
      fetchGigDetails();
    }
  }, [id, authorized]);

  const fetchGigDetails = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      // Ensure id is a string, not an array
      const gigId = Array.isArray(id) ? id[0] : id;
      if (!gigId) {
        showAlert("error", "Error", "Invalid gig ID");
        router.replace("/home");
        return;
      }

      // Direct query to gigs table
      const { data, error } = await supabase
        .from('gigs')
        .select('*')
        .eq('id', gigId)
        .eq('organizer_id', user.id)
        .single();

      console.log('📥 ===== DATABASE QUERY RESPONSE =====');
      console.log('📥 Error object:', error);
      console.log('📥 Data object:', data);
      console.log('📥 Data type:', typeof data);
      console.log('📥 Data stringified:', JSON.stringify(data, null, 2));

      if (error) throw error;

      // If no data returned, user doesn't own this gig
      if (!data) {
        showAlert(
          "error",
          "Not Found",
          "Gig not found or you do not have permission to edit it.",
        );
        router.replace("/home");
        return;
      }

      console.log('📦 ===== GIG DATA ANALYSIS =====');
      console.log('📦 name:', data.name);
      console.log('📦 description:', data.description?.substring(0, 50));
      console.log('📦 location:', data.location);
      console.log('📦 budget:', data.budget, '(type:', typeof data.budget, ')');
      console.log('📦 event_date:', data.event_date);
      console.log('📦 requirements:', data.requirements);
      console.log('📦 requirements type:', typeof data.requirements);
      console.log('📦 requirements stringified:', JSON.stringify(data.requirements, null, 2));
      console.log('📦 requirements?.genres:', data.requirements?.genres);
      console.log('📦 requirements?.instruments:', data.requirements?.instruments);
      console.log('📦 requirements?.experience_level:', data.requirements?.experience_level);
      console.log('📦 requirements?.event_start_time:', data.requirements?.event_start_time);
      console.log('📦 requirements?.event_end_time:', data.requirements?.event_end_time);
      console.log('📦 requirements?.musician_type:', data.requirements?.musician_type);
      console.log('📦 contract_url:', data.contract_url);
      console.log('📦 images:', data.images);

      console.log('🔧 ===== SETTING STATE VALUES =====');

      setGigName(data.name);
      console.log('🔧 setGigName:', data.name);

      setDescription(data.description);
      console.log('🔧 setDescription:', data.description?.substring(0, 50));

      setAddress(data.location);
      console.log('🔧 setAddress:', data.location);

      setLatitude(data.latitude || null);
      setLongitude(data.longitude || null);
      setCost(data.budget?.toString() || "");
      setEventDate(data.event_date || "");
      // Read event times from requirements JSONB field
      setEventStartTime(data.requirements?.event_start_time || "06:00 PM");
      setEventEndTime(data.requirements?.event_end_time || "11:00 PM");
      setMusicianType(data.requirements?.musician_type || "both");
      setRequiredGenres(
        Array.isArray(data.requirements?.genres)
          ? data.requirements.genres
          : [],
      );
      setRequiredInstruments(
        Array.isArray(data.requirements?.instruments)
          ? data.requirements.instruments
          : [],
      );
      setExperienceLevel(data.requirements?.experience_level || "");

      // Load detailed slot data
      const slots = data.requirements?.slots;
      if (slots) {
        setSoloSlotsNeeded(slots.solo?.needed || 0);
        setSoloRolesNeeded(Array.isArray(slots.solo?.roles) ? slots.solo.roles : []);
        setDuoSlotsNeeded(slots.duo?.needed || 0);
        setDuoRolesNeeded(Array.isArray(slots.duo?.roles) ? slots.duo.roles : []);
        setBandSlotsNeeded(slots.band?.needed || 0);
        setBandRolesNeeded(Array.isArray(slots.band?.roles) ? slots.band.roles : []);
      }

      // Load anti-spam settings
      setReapplicationCooldownDays(data.reapplication_cooldown_days ?? 30);

      setContractUrl(data.contract_url || "");
      if (data.contract_url) {
        const fileName = data.contract_url.split("/").pop() || "Contract.pdf";
        setContractFileName(decodeURIComponent(fileName));
        console.log('🔧 setContractFileName:', fileName);
      }
      setBusinessPermitUrl(data.business_permit_url || "");
      if (data.business_permit_url) {
        const fileName = data.business_permit_url.split("/").pop() || "BusinessPermit.pdf";
        setBusinessPermitFileName(decodeURIComponent(fileName));
        console.log('🔧 setBusinessPermitFileName:', fileName);
      }
      setImages(data.images || []);
      console.log('🔧 setImages:', data.images || []);

      if (data.images && data.images.length > 0) {
        setThumbnailIndex(0);
      }

      console.log('✅ ===== FETCH GIG DETAILS COMPLETED =====');
    } catch (e) {
      console.log("Error fetching gig details:", e);
      showAlert("error", "Error", "Failed to load gig details.");
      router.replace("/home");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    if (!gigName.trim()) {
      showAlert("error", "Required Field", "Please enter a gig name");
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
    if (!cost.trim() || parseFloat(cost) <= 0) {
      showAlert(
        "error",
        "Required Field",
        "Please enter a valid payout amount",
      );
      return false;
    }
    if (images.length === 0) {
      showAlert(
        "error",
        "Required Field",
        "Please upload at least one event photo",
      );
      return false;
    }
    if (!eventDate.trim()) {
      showAlert("error", "Required Field", "Please select an event date");
      return false;
    }
    if (!eventStartTime || !eventEndTime) {
      showAlert(
        "error",
        "Required Field",
        "Please set event start and end times",
      );
      return false;
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
      const gigId = Array.isArray(id) ? id[0] : id;
      if (!gigId) {
        showAlert("error", "Error", "Invalid gig ID");
        setSaving(false);
        return;
      }

      const orderedImages = images.length > 0 && images[thumbnailIndex]
        ? [images[thumbnailIndex], ...images.filter((_, i) => i !== thumbnailIndex)]
        : images;

      const payload = {
        name: gigName,
        description,
        location: address,
        budget: parseFloat(cost) || 0,
        images: orderedImages,
        contract_url: contractUrl || null,
        business_permit_url: businessPermitUrl || null,
        latitude,
        longitude,
        event_date: eventDate,
        reapplication_cooldown_days: reapplicationCooldownDays,
        requirements: {
          genres: requiredGenres,
          instruments: requiredInstruments,
          experience_level: experienceLevel || null,
          event_start_time: eventStartTime,
          event_end_time: eventEndTime,
          musician_type: musicianType,
          // Detailed slots with counts
          slots: {
            solo: {
              needed: soloSlotsNeeded,
              roles: soloRolesNeeded,
            },
            duo: {
              needed: duoSlotsNeeded,
              roles: duoRolesNeeded,
            },
            band: {
              needed: bandSlotsNeeded,
              roles: bandRolesNeeded,
            },
          },
          total_slots_needed: soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded,
        },
      };

      console.log(
        "🔵 Updating gig with payload:",
        JSON.stringify(
          {
            action: "update",
            type: "gig",
            id: gigId,
            userId: user.id,
            payload,
          },
          null,
          2,
        ),
      );

      // Direct update to gigs table
      const { data: responseData, error: updateError } = await supabase
        .from('gigs')
        .update({
          name: payload.name,
          description: payload.description,
          location: payload.location,
          budget: payload.budget,
          images: payload.images,
          contract_url: payload.contract_url,
          business_permit_url: payload.business_permit_url,
          latitude: payload.latitude,
          longitude: payload.longitude,
          event_date: payload.event_date,
          reapplication_cooldown_days: payload.reapplication_cooldown_days,
          requirements: payload.requirements,
        })
        .eq('id', gigId)
        .eq('organizer_id', user.id)
        .select()
        .single();

      console.log('📥 Update response data:', JSON.stringify(responseData, null, 2));
      console.log('📥 Update response error:', updateError);

      if (updateError) {
        console.error('❌ Update failed with error:', updateError);

        let alertMessage = `Failed to update gig: ${updateError.message}`;
        if (updateError.hint) alertMessage += `\n\nHint: ${updateError.hint}`;
        if (updateError.details) alertMessage += `\n\nDetails: ${updateError.details}`;

        Alert.alert("Error", alertMessage);
        return;
      }

      console.log("✅ Gig Updated successfully");
      showAlert("success", "Success", "Gig updated successfully!", [
        {
          text: "OK",
          onPress: () => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/manage_gig");
            }
          },
        },
      ]);
    } catch (e: any) {
      console.error("❌ Error updating gig:", e);
      showAlert(
        "error",
        "Error",
        `Failed to update gig: ${e?.message || "Unknown error"}`,
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
      "Are you sure you want to update this gig profile?",
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
    numeric = false,
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
          keyboardType={numeric ? "numeric" : "default"}
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

  const handleContractUpload = async () => {
    try {
      setUploadingContract(true);

      if (Platform.OS === "web") {
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
        setUploadingContract(false);
        return;
      }

      // Dynamic import for native platforms only
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setUploadingContract(false);
        return;
      }

      const file = result.assets[0];
      const fileName = file.name;
      const fileUri = file.uri;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("error", "Error", "Session expired. Please log in again.");
        setUploadingContract(false);
        return;
      }

      const response = await fetch(fileUri);
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(filePath);

      setContractUrl(publicUrl);
      setContractFileName(fileName);
      showAlert("success", "Success", "Contract uploaded successfully!");
    } catch (error) {
      console.error("Error uploading contract:", error);
      showAlert(
        "error",
        "Error",
        "Failed to upload contract. Please try again.",
      );
    } finally {
      setUploadingContract(false);
    }
  };

  const removeContract = () => {
    setContractUrl("");
    setContractFileName("");
  };

  // Business Permit Upload Handler
  const handleBusinessPermitUpload = async () => {
    try {
      setUploadingBusinessPermit(true);

      if (Platform.OS === "web") {
        if (businessPermitInputRef.current) {
          businessPermitInputRef.current.click();
        }
        setUploadingBusinessPermit(false);
        return;
      }

      // Dynamic import for native platforms only
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setUploadingBusinessPermit(false);
        return;
      }

      const file = result.assets[0];
      const fileName = file.name;
      const fileUri = file.uri;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("error", "Error", "Session expired. Please log in again.");
        setUploadingBusinessPermit(false);
        return;
      }

      const response = await fetch(fileUri);
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const contentType = fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : `image/${fileName.split('.').pop()?.toLowerCase() || 'jpeg'}`;

      const filePath = `business-permits/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, bytes, {
          contentType,
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(filePath);

      setBusinessPermitUrl(publicUrl);
      setBusinessPermitFileName(fileName);
      showAlert("success", "Success", "Business permit uploaded successfully!");
    } catch (error) {
      console.error("Error uploading business permit:", error);
      showAlert(
        "error",
        "Error",
        "Failed to upload business permit. Please try again.",
      );
    } finally {
      setUploadingBusinessPermit(false);
    }
  };

  const removeBusinessPermit = () => {
    setBusinessPermitUrl("");
    setBusinessPermitFileName("");
  };

  const handleWebBusinessPermitSelect = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingBusinessPermit(true);
      const fileName = file.name;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("error", "Error", "Session expired. Please log in again.");
        setUploadingBusinessPermit(false);
        return;
      }

      const contentType = fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : file.type || 'image/jpeg';

      const filePath = `business-permits/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          contentType,
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(filePath);

      setBusinessPermitUrl(publicUrl);
      setBusinessPermitFileName(fileName);
      showAlert("success", "Success", "Business permit uploaded successfully!");
    } catch (error) {
      console.error("Error uploading business permit:", error);
      showAlert("error", "Error", "Failed to upload business permit. Please try again.");
    } finally {
      setUploadingBusinessPermit(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const handleWebFileSelect = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingContract(true);
      const fileName = file.name;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("error", "Error", "Session expired. Please log in again.");
        setUploadingContract(false);
        return;
      }

      const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(filePath);

      setContractUrl(publicUrl);
      setContractFileName(fileName);
      showAlert("success", "Success", "Contract uploaded successfully!");
    } catch (error) {
      console.error("Error uploading contract:", error);
      showAlert(
        "error",
        "Error",
        "Failed to upload contract. Please try again.",
      );
    } finally {
      setUploadingContract(false);
      if (event.target) {
        event.target.value = "";
      }
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
          Loading gig details...
        </Text>
      </View>
    );
  }

  return (
    <>
      {Platform.OS === "web" && (
        <input
          ref={fileInputRef as any}
          type="file"
          accept="application/pdf"
          onChange={handleWebFileSelect}
          style={{ display: "none" }}
        />
      )}
      {Platform.OS === "web" && (
        <input
          ref={businessPermitInputRef as any}
          type="file"
          accept="application/pdf,image/*"
          onChange={handleWebBusinessPermitSelect}
          style={{ display: "none" }}
        />
      )}
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Edit Gig" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.flex1}
        >
          {renderSectionHeader("Basic Details", "information-circle")}
          {renderInput("Gig Title", gigName, setGigName)}
          {renderInput("Description", description, setDescription, true)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Location
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
          {renderInput("Payout (₱)", cost, setCost, false, true)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Event Date
            </Text>
            <View
              style={[
                styles.calendarContainer,
                {
                  backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                  borderColor: colors.border,
                },
              ]}
            >
              <Calendar
                current={eventDate || new Date().toISOString().split("T")[0]}
                minDate={new Date().toISOString().split("T")[0]}
                markedDates={{
                  [eventDate]: {
                    selected: true,
                    selectedColor: colors.primary,
                    selectedTextColor: "#FFFFFF",
                  },
                }}
                onDayPress={(day) => {
                  setEventDate(day.dateString);
                }}
                theme={{
                  backgroundColor: "transparent",
                  calendarBackground: "transparent",
                  textSectionTitleColor: colors.textSecondary,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: "#FFFFFF",
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: isDark ? "#4B5563" : "#D1D5DB",
                  dotColor: colors.primary,
                  selectedDotColor: "#FFFFFF",
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  indicatorColor: colors.primary,
                  textDayFontFamily: "Poppins_500Medium",
                  textMonthFontFamily: "Poppins_600SemiBold",
                  textDayHeaderFontFamily: "Poppins_500Medium",
                  textDayFontSize: 14,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12,
                }}
              />
              {eventDate && (
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingBottom: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="calendar" size={16} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.text,
                      fontFamily: "Poppins_600SemiBold",
                    }}
                  >
                    Selected:{" "}
                    {new Date(eventDate).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Event Time
            </Text>
            <View
              style={[
                styles.dayCard,
                {
                  backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                  borderColor: colors.border,
                  padding: 16,
                },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      marginBottom: 4,
                      fontFamily: "Poppins_600SemiBold",
                    }}
                  >
                    START TIME
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <TextInput
                      value={eventStartTime.split(" ")[0]}
                      onChangeText={(text) => {
                        const formatted = formatTimeInput(text);
                        const period = eventStartTime.split(" ")[1];
                        setEventStartTime(`${formatted} ${period}`);
                      }}
                      placeholder="06:00"
                      keyboardType="numeric"
                      maxLength={5}
                      style={[
                        styles.timeInput,
                        {
                          backgroundColor: isDark ? "#374151" : "white",
                          borderColor: colors.border,
                          color: colors.text,
                          flex: 1,
                        },
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const [time, period] = eventStartTime.split(" ");
                        setEventStartTime(
                          `${time} ${period === "AM" ? "PM" : "AM"}`,
                        );
                      }}
                      style={[
                        styles.ampmBtn,
                        { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.text,
                        }}
                      >
                        {eventStartTime.split(" ")[1]}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={{ marginTop: 20 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      marginBottom: 4,
                      fontFamily: "Poppins_600SemiBold",
                    }}
                  >
                    END TIME
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <TextInput
                      value={eventEndTime.split(" ")[0]}
                      onChangeText={(text) => {
                        const formatted = formatTimeInput(text);
                        const period = eventEndTime.split(" ")[1];
                        setEventEndTime(`${formatted} ${period}`);
                      }}
                      placeholder="11:00"
                      keyboardType="numeric"
                      maxLength={5}
                      style={[
                        styles.timeInput,
                        {
                          backgroundColor: isDark ? "#374151" : "white",
                          borderColor: colors.border,
                          color: colors.text,
                          flex: 1,
                        },
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const [time, period] = eventEndTime.split(" ");
                        setEventEndTime(
                          `${time} ${period === "AM" ? "PM" : "AM"}`,
                        );
                      }}
                      style={[
                        styles.ampmBtn,
                        { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.text,
                        }}
                      >
                        {eventEndTime.split(" ")[1]}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {renderSectionHeader("Looking For", "people")}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
              Select types to accept
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                { value: "solo", label: "Solo Artists", icon: "person" },
                { value: "group", label: "Bands/Groups", icon: "people" },
                { value: "both", label: "Both", icon: "people-circle" },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() =>
                    setMusicianType(option.value as "solo" | "group" | "both")
                  }
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      gap: 8,
                      backgroundColor:
                        musicianType === option.value
                          ? colors.primary
                          : isDark
                            ? "#1F2937"
                            : "#F9FAFB",
                      borderColor:
                        musicianType === option.value
                          ? colors.primary
                          : isDark
                            ? "#374151"
                            : "#E5E7EB",
                    },
                  ]}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={18}
                    color={musicianType === option.value ? "#fff" : colors.text}
                  />
                  <Text
                    style={{
                      fontFamily: "Poppins_500Medium",
                      fontSize: 14,
                      color:
                        musicianType === option.value ? "#fff" : colors.text,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Detailed Slots Configuration */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              How many performers do you need?
            </Text>
            <Text style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 12, fontSize: 12 }]}>
              Set limits per category. Applicants cannot apply more than once per gig.
            </Text>

            {/* Solo Artists Slots */}
            {(musicianType === "solo" || musicianType === "both") && (
              <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                <View style={styles.slotHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="person" size={20} color="#EC4899" />
                    <Text style={[styles.slotTitle, { color: colors.text }]}>Solo Artists</Text>
                  </View>
                  <View style={styles.counterContainer}>
                    <TouchableOpacity
                      onPress={() => setSoloSlotsNeeded(Math.max(0, soloSlotsNeeded - 1))}
                      style={[styles.counterBtn, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}
                    >
                      <Ionicons name="remove" size={18} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.counterValue, { color: colors.text }]}>{soloSlotsNeeded}</Text>
                    <TouchableOpacity
                      onPress={() => setSoloSlotsNeeded(soloSlotsNeeded + 1)}
                      style={[styles.counterBtn, { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
                {soloSlotsNeeded > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.slotSubLabel, { color: colors.textSecondary }]}>
                      Specific roles/instruments needed (optional):
                    </Text>
                    <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                      <View
                        style={[
                          styles.inputWrapper,
                          styles.flex1,
                          { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" },
                        ]}
                      >
                        <TextInput
                          value={newSoloRole}
                          onChangeText={setNewSoloRole}
                          placeholder="e.g., Acoustic Guitarist, Singer..."
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.textInput, { color: colors.text }]}
                          onSubmitEditing={() => {
                            if (newSoloRole.trim()) {
                              setSoloRolesNeeded([...soloRolesNeeded, newSoloRole.trim()]);
                              setNewSoloRole("");
                            }
                          }}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (newSoloRole.trim()) {
                            setSoloRolesNeeded([...soloRolesNeeded, newSoloRole.trim()]);
                            setNewSoloRole("");
                          }
                        }}
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    {soloRolesNeeded.length > 0 && (
                      <View style={[styles.chipContainer, { marginTop: 8 }]}>
                        {soloRolesNeeded.map((role, index) => (
                          <View key={index} style={[styles.chip, { backgroundColor: "#EC489920" }]}>
                            <Text style={[styles.chipText, { color: "#EC4899" }]}>{role}</Text>
                            <TouchableOpacity onPress={() => setSoloRolesNeeded(soloRolesNeeded.filter((_, i) => i !== index))}>
                              <Ionicons name="close-circle" size={16} color="#EC4899" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Duo Slots */}
            {(musicianType === "group" || musicianType === "both") && (
              <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB", marginTop: 12 }]}>
                <View style={styles.slotHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="people" size={20} color="#8B5CF6" />
                    <Text style={[styles.slotTitle, { color: colors.text }]}>Duos (2 members)</Text>
                  </View>
                  <View style={styles.counterContainer}>
                    <TouchableOpacity
                      onPress={() => setDuoSlotsNeeded(Math.max(0, duoSlotsNeeded - 1))}
                      style={[styles.counterBtn, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}
                    >
                      <Ionicons name="remove" size={18} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.counterValue, { color: colors.text }]}>{duoSlotsNeeded}</Text>
                    <TouchableOpacity
                      onPress={() => setDuoSlotsNeeded(duoSlotsNeeded + 1)}
                      style={[styles.counterBtn, { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
                {duoSlotsNeeded > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.slotSubLabel, { color: colors.textSecondary }]}>
                      Specific roles/instruments needed (optional):
                    </Text>
                    <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                      <View
                        style={[
                          styles.inputWrapper,
                          styles.flex1,
                          { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" },
                        ]}
                      >
                        <TextInput
                          value={newDuoRole}
                          onChangeText={setNewDuoRole}
                          placeholder="e.g., Vocalist + Guitarist..."
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.textInput, { color: colors.text }]}
                          onSubmitEditing={() => {
                            if (newDuoRole.trim()) {
                              setDuoRolesNeeded([...duoRolesNeeded, newDuoRole.trim()]);
                              setNewDuoRole("");
                            }
                          }}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (newDuoRole.trim()) {
                            setDuoRolesNeeded([...duoRolesNeeded, newDuoRole.trim()]);
                            setNewDuoRole("");
                          }
                        }}
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    {duoRolesNeeded.length > 0 && (
                      <View style={[styles.chipContainer, { marginTop: 8 }]}>
                        {duoRolesNeeded.map((role, index) => (
                          <View key={index} style={[styles.chip, { backgroundColor: "#8B5CF620" }]}>
                            <Text style={[styles.chipText, { color: "#8B5CF6" }]}>{role}</Text>
                            <TouchableOpacity onPress={() => setDuoRolesNeeded(duoRolesNeeded.filter((_, i) => i !== index))}>
                              <Ionicons name="close-circle" size={16} color="#8B5CF6" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Band Slots */}
            {(musicianType === "group" || musicianType === "both") && (
              <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB", marginTop: 12 }]}>
                <View style={styles.slotHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="people-circle" size={20} color="#3B82F6" />
                    <Text style={[styles.slotTitle, { color: colors.text }]}>Bands (3+ members)</Text>
                  </View>
                  <View style={styles.counterContainer}>
                    <TouchableOpacity
                      onPress={() => setBandSlotsNeeded(Math.max(0, bandSlotsNeeded - 1))}
                      style={[styles.counterBtn, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}
                    >
                      <Ionicons name="remove" size={18} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.counterValue, { color: colors.text }]}>{bandSlotsNeeded}</Text>
                    <TouchableOpacity
                      onPress={() => setBandSlotsNeeded(bandSlotsNeeded + 1)}
                      style={[styles.counterBtn, { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
                {bandSlotsNeeded > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.slotSubLabel, { color: colors.textSecondary }]}>
                      Specific requirements/genres (optional):
                    </Text>
                    <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                      <View
                        style={[
                          styles.inputWrapper,
                          styles.flex1,
                          { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" },
                        ]}
                      >
                        <TextInput
                          value={newBandRole}
                          onChangeText={setNewBandRole}
                          placeholder="e.g., Rock Band, Jazz Ensemble..."
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.textInput, { color: colors.text }]}
                          onSubmitEditing={() => {
                            if (newBandRole.trim()) {
                              setBandRolesNeeded([...bandRolesNeeded, newBandRole.trim()]);
                              setNewBandRole("");
                            }
                          }}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          if (newBandRole.trim()) {
                            setBandRolesNeeded([...bandRolesNeeded, newBandRole.trim()]);
                            setNewBandRole("");
                          }
                        }}
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    {bandRolesNeeded.length > 0 && (
                      <View style={[styles.chipContainer, { marginTop: 8 }]}>
                        {bandRolesNeeded.map((role, index) => (
                          <View key={index} style={[styles.chip, { backgroundColor: "#3B82F620" }]}>
                            <Text style={[styles.chipText, { color: "#3B82F6" }]}>{role}</Text>
                            <TouchableOpacity onPress={() => setBandRolesNeeded(bandRolesNeeded.filter((_, i) => i !== index))}>
                              <Ionicons name="close-circle" size={16} color="#3B82F6" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Total Summary */}
            {(soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded) > 0 && (
              <View style={[styles.totalSummary, { backgroundColor: colors.primary + "15", marginTop: 16 }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <Text style={[styles.totalSummaryText, { color: colors.primary }]}>
                  Total slots: {soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded} performer(s) needed
                </Text>
              </View>
            )}

            {/* Reapplication Cooldown Setting */}
            <View style={styles.inputContainer}>
              <Text
                style={[styles.inputLabel, { color: colors.textSecondary }]}
              >
                Rejected Musician Reapplication Cooldown
              </Text>
              <Text
                style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 12, fontSize: 12 }]}
              >
                How long must a rejected musician wait before they can apply again?
              </Text>
              <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                <View style={styles.slotHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="time-outline" size={20} color={colors.primary} />
                    <Text style={[styles.slotTitle, { color: colors.text }]}>Cooldown Period</Text>
                  </View>
                  <View style={styles.counterContainer}>
                    <TouchableOpacity
                      onPress={() => setReapplicationCooldownDays(Math.max(0, reapplicationCooldownDays - 7))}
                      style={[styles.counterBtn, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}
                    >
                      <Ionicons name="remove" size={18} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.counterValue, { color: colors.text, minWidth: 60, textAlign: "center" }]}>
                      {reapplicationCooldownDays === 0 ? "None" : `${reapplicationCooldownDays} days`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setReapplicationCooldownDays(Math.min(365, reapplicationCooldownDays + 7))}
                      style={[styles.counterBtn, { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.slotSubLabel, { color: colors.textSecondary, fontSize: 11 }]}>
                    {reapplicationCooldownDays === 0
                      ? "Musicians can reapply immediately after rejection."
                      : `Musicians must wait ${reapplicationCooldownDays} days after rejection before reapplying.`}
                  </Text>
                </View>
                {/* Quick preset buttons */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "None", value: 0 },
                    { label: "7 days", value: 7 },
                    { label: "14 days", value: 14 },
                    { label: "30 days", value: 30 },
                    { label: "90 days", value: 90 },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.value}
                      onPress={() => setReapplicationCooldownDays(preset.value)}
                      style={[
                        {
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor: reapplicationCooldownDays === preset.value
                            ? colors.primary
                            : isDark ? "#374151" : "#E5E7EB",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Poppins_500Medium",
                          color: reapplicationCooldownDays === preset.value ? "#fff" : colors.text,
                        }}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {renderSectionHeader("Requirements", "list")}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Genres
            </Text>
            <View style={[styles.addMemberRow, { marginBottom: 8 }]}>
              <View
                style={[
                  styles.inputWrapper,
                  styles.flex1,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  },
                ]}
              >
                <TextInput
                  value={newGenre}
                  onChangeText={setNewGenre}
                  placeholder="Add genre (e.g., Rock, Jazz)..."
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.textInput, { color: colors.text }]}
                  onSubmitEditing={() => {
                    if (newGenre.trim()) {
                      setRequiredGenres([...requiredGenres, newGenre.trim()]);
                      setNewGenre("");
                    }
                  }}
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (newGenre.trim()) {
                    setRequiredGenres([...requiredGenres, newGenre.trim()]);
                    setNewGenre("");
                  }
                }}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {requiredGenres.length > 0 && (
              <View style={styles.chipContainer}>
                {requiredGenres.map((genre, index) => (
                  <View
                    key={index}
                    style={[
                      styles.chip,
                      { backgroundColor: isDark ? "#1F2937" : "#F3F4F6" },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>
                      {genre}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setRequiredGenres(
                          requiredGenres.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Equipments
            </Text>
            <View style={[styles.addMemberRow, { marginBottom: 8 }]}>
              <View
                style={[
                  styles.inputWrapper,
                  styles.flex1,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  },
                ]}
              >
                <TextInput
                  value={newInstrument}
                  onChangeText={setNewInstrument}
                  placeholder="Add equipment (e.g., Guitar, Drums)..."
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.textInput, { color: colors.text }]}
                  onSubmitEditing={() => {
                    if (newInstrument.trim()) {
                      setRequiredInstruments([
                        ...requiredInstruments,
                        newInstrument.trim(),
                      ]);
                      setNewInstrument("");
                    }
                  }}
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (newInstrument.trim()) {
                    setRequiredInstruments([
                      ...requiredInstruments,
                      newInstrument.trim(),
                    ]);
                    setNewInstrument("");
                  }
                }}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {requiredInstruments.length > 0 && (
              <View style={styles.chipContainer}>
                {requiredInstruments.map((instrument, index) => (
                  <View
                    key={index}
                    style={[
                      styles.chip,
                      { backgroundColor: isDark ? "#1F2937" : "#F3F4F6" },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>
                      {instrument}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setRequiredInstruments(
                          requiredInstruments.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Experience Level
            </Text>
            <View style={styles.experienceLevelContainer}>
              {["Beginner", "Intermediate", "Advanced", "Professional"].map(
                (level) => (
                  <TouchableOpacity
                    key={level}
                    onPress={() => setExperienceLevel(level)}
                    style={[
                      styles.experienceButton,
                      {
                        backgroundColor:
                          experienceLevel === level
                            ? colors.primary
                            : isDark
                              ? "#1F2937"
                              : "#F9FAFB",
                        borderColor:
                          experienceLevel === level
                            ? colors.primary
                            : isDark
                              ? "#374151"
                              : "#E5E7EB",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.experienceButtonText,
                        {
                          color:
                            experienceLevel === level ? "#fff" : colors.text,
                        },
                      ]}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          </View>

          {renderSectionHeader("Visuals", "image")}
          <ImageUploader
            images={images}
            onImagesChange={setImages}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
            maxImages={10}
            bucketName="listings"
            userId={id as string}
            folder="gigs"
          />

          {renderSectionHeader("Contract", "document-text")}
          <View style={styles.inputContainer}>
            <Text
              style={[styles.inputSubLabel, { color: colors.textSecondary }]}
            >
              Upload a PDF contract that musicians will see before applying
            </Text>
            {contractUrl ? (
              <View
                style={[
                  styles.contractPreview,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    flex: 1,
                  }}
                >
                  <View
                    style={[
                      styles.pdfIcon,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Ionicons name="document-text" size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.contractFileName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {contractFileName}
                    </Text>
                    <Text
                      style={[
                        styles.contractFileSize,
                        { color: colors.textSecondary },
                      ]}
                    >
                      PDF Document
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={removeContract}
                  style={styles.removeContractBtn}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleContractUpload}
                disabled={uploadingContract}
                activeOpacity={0.8}
                style={[
                  styles.uploadContractBtn,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  },
                ]}
              >
                {uploadingContract ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons
                      name="cloud-upload-outline"
                      size={32}
                      color={colors.textSecondary}
                    />
                    <Text style={[styles.uploadText, { color: colors.text }]}>
                      Upload Contract (PDF)
                    </Text>
                    <Text
                      style={[
                        styles.uploadSubText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Tap to browse files
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {renderSectionHeader("Business Permit", "shield-checkmark")}
          <View style={styles.inputContainer}>
            <Text
              style={[styles.inputSubLabel, { color: colors.textSecondary }]}
            >
              Upload your business permit (PDF or Image)
            </Text>
            {businessPermitUrl ? (
              <View
                style={[
                  styles.contractPreview,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    flex: 1,
                  }}
                >
                  <View
                    style={[
                      styles.pdfIcon,
                      { backgroundColor: "#10B981" },
                    ]}
                  >
                    <Ionicons name="shield-checkmark" size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.contractFileName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {businessPermitFileName}
                    </Text>
                    <Text
                      style={[
                        styles.contractFileSize,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Business Permit
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={removeBusinessPermit}
                  style={styles.removeContractBtn}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleBusinessPermitUpload}
                disabled={uploadingBusinessPermit}
                activeOpacity={0.8}
                style={[
                  styles.uploadContractBtn,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                  },
                ]}
              >
                {uploadingBusinessPermit ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={32}
                      color={colors.textSecondary}
                    />
                    <Text style={[styles.uploadText, { color: colors.text }]}>
                      Upload Business Permit
                    </Text>
                    <Text
                      style={[
                        styles.uploadSubText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      PDF or Image format
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

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
    marginTop: 24,
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
  documentItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  documentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  uploadButtonText: {
    marginLeft: 8,
    fontFamily: "Poppins_600SemiBold",
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
  inputSubLabel: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginBottom: 8,
  },
  uploadContractBtn: {
    padding: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    marginTop: 8,
  },
  uploadSubText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  contractPreview: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  pdfIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contractFileName: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  contractFileSize: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 2,
  },
  removeContractBtn: {
    padding: 8,
  },
  dayCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  timeInput: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  ampmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  calendarContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  addMemberRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  experienceLevelContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  experienceButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
  },
  experienceButtonText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  textInput: {
    padding: 16,
    fontFamily: "Poppins_400Regular",
  },
  // Slot Card Styles
  slotCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  slotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slotTitle: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  slotSubLabel: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  counterContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  counterBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    minWidth: 24,
    textAlign: "center",
  },
  totalSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  totalSummaryText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
});
