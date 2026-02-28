import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    BackHandler,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { Calendar } from "react-native-calendars";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { PH_MUSIC_GROUP_TYPES } from "../src/constants/groupTypes";
import { useTheme } from "../src/context/ThemeContext";

// Decode base64 to Uint8Array without using fetch().arrayBuffer() which crashes on Android New Architecture
const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const b64 = base64.replace(/=/g, "");
  const bufLen = Math.floor(b64.length * 0.75);
  const bytes = new Uint8Array(bufLen);
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const e1 = lookup[b64.charCodeAt(i)];
    const e2 = lookup[b64.charCodeAt(i + 1)];
    const e3 = lookup[b64.charCodeAt(i + 2)];
    const e4 = lookup[b64.charCodeAt(i + 3)];
    if (p < bufLen) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufLen) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
};

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

type EventSchedule = {
  date: string;
  start_time: string;
  end_time: string;
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
  const [eventSchedules, setEventSchedules] = useState<EventSchedule[]>([]);
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
      "Leave edit gig?",
      "Your current edits won't be saved unless you tap Save Changes.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => router.back() },
      ],
    );
  }, [saving]);

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

  // Preferred group types for band slots
  const [preferredGroupTypes, setPreferredGroupTypes] = useState<string[]>([]);

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

  const getNormalizedEventSchedules = (): EventSchedule[] => {
    const cleanedSchedules = eventSchedules
      .filter((item) => item.date && item.start_time && item.end_time)
      .map((item) => ({
        date: item.date,
        start_time: item.start_time,
        end_time: item.end_time,
      }));

    if (cleanedSchedules.length > 0) {
      return cleanedSchedules;
    }

    if (eventDate.trim() && eventStartTime && eventEndTime) {
      return [
        {
          date: eventDate,
          start_time: eventStartTime,
          end_time: eventEndTime,
        },
      ];
    }

    return [];
  };

  const handleAddEventCondition = () => {
    if (!eventDate.trim()) {
      showAlert("error", "Required Field", "Please select an event date first");
      return;
    }

    if (!eventStartTime || !eventEndTime) {
      showAlert("error", "Required Field", "Please set both start and end time first");
      return;
    }

    const newCondition: EventSchedule = {
      date: eventDate,
      start_time: eventStartTime,
      end_time: eventEndTime,
    };

    const alreadyExists = eventSchedules.some(
      (item) =>
        item.date === newCondition.date &&
        item.start_time === newCondition.start_time &&
        item.end_time === newCondition.end_time,
    );

    if (alreadyExists) {
      showAlert("warning", "Already Added", "This event date and time condition is already in the list.");
      return;
    }

    setEventSchedules((prev) => [...prev, newCondition]);
  };

  const removeEventCondition = (indexToRemove: number) => {
    setEventSchedules((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

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

  useEffect(() => {
    const hasSolo = soloSlotsNeeded > 0;
    const hasGroup = duoSlotsNeeded > 0 || bandSlotsNeeded > 0;

    if (hasSolo && hasGroup) {
      setMusicianType("both");
      return;
    }

    if (hasSolo) {
      setMusicianType("solo");
      return;
    }

    if (hasGroup) {
      setMusicianType("group");
      return;
    }

    setMusicianType("both");
  }, [soloSlotsNeeded, duoSlotsNeeded, bandSlotsNeeded]);

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

      // Base query + normalized child tables merge
      const { data: baseData, error: baseError } = await supabase
        .from('gigs')
        .select('*')
        .eq('id', gigId)
        .eq('organizer_id', user.id)
        .single();

      const [
        { data: requirementRows, error: requirementsError },
        { data: mediaRows, error: mediaError },
      ] = await Promise.all([
        supabase
          .from('gig_requirements')
          .select('requirement_key, requirement_value')
          .eq('gig_id', gigId),
        supabase
          .from('gig_media')
          .select('media_type, media_url, sort_order, created_at')
          .eq('gig_id', gigId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

      console.log('📥 ===== DATABASE QUERY RESPONSE =====');
      console.log('📥 Error object:', baseError);
      console.log('📥 Data object:', baseData);
      console.log('📥 Data type:', typeof baseData);
      console.log('📥 Data stringified:', JSON.stringify(baseData, null, 2));

      if (baseError) throw baseError;
      if (requirementsError) throw requirementsError;
      if (mediaError) throw mediaError;

      if (!baseData) {
        showAlert(
          "error",
          "Not Found",
          "Gig not found or you do not have permission to edit it.",
        );
        router.replace("/home");
        return;
      }

      const requirements = (requirementRows || []).reduce(
        (acc: Record<string, any>, row: any) => {
          if (!row?.requirement_key) return acc;
          acc[row.requirement_key] = row.requirement_value;
          return acc;
        },
        {},
      );

      const images = (mediaRows || [])
        .filter((row: any) => row?.media_type === 'image')
        .map((row: any) => row.media_url)
        .filter(Boolean);

      const documents = (mediaRows || [])
        .filter((row: any) => row?.media_type === 'document')
        .map((row: any) => row.media_url)
        .filter(Boolean);

      const data = {
        ...baseData,
        requirements,
        images,
        documents,
      } as any;

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
      const schedulesFromRequirements = Array.isArray(data.requirements?.event_schedules)
        ? data.requirements.event_schedules
          .filter((item: any) => item?.date && item?.start_time && item?.end_time)
          .map((item: any) => ({
            date: item.date,
            start_time: item.start_time,
            end_time: item.end_time,
          }))
        : [];

      if (schedulesFromRequirements.length > 0) {
        setEventSchedules(schedulesFromRequirements);
        setEventDate(schedulesFromRequirements[0].date);
        setEventStartTime(schedulesFromRequirements[0].start_time);
        setEventEndTime(schedulesFromRequirements[0].end_time);
      } else {
        const fallbackDate = data.event_date || "";
        const fallbackStart = data.requirements?.event_start_time || "06:00 PM";
        const fallbackEnd = data.requirements?.event_end_time || "11:00 PM";
        setEventDate(fallbackDate);
        setEventStartTime(fallbackStart);
        setEventEndTime(fallbackEnd);
        setEventSchedules(
          fallbackDate
            ? [
              {
                date: fallbackDate,
                start_time: fallbackStart,
                end_time: fallbackEnd,
              },
            ]
            : [],
        );
      }
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
        setPreferredGroupTypes(Array.isArray(slots.band?.preferred_group_types) ? slots.band.preferred_group_types : []);
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
    const schedules = getNormalizedEventSchedules();

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
    if (schedules.length === 0) {
      showAlert(
        "error",
        "Required Field",
        "Please add at least one event date and time condition",
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

      const normalizedSchedules = getNormalizedEventSchedules();
      const primarySchedule = normalizedSchedules[0];

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
        event_date: primarySchedule?.date || eventDate,
        reapplication_cooldown_days: reapplicationCooldownDays,
        requirements: {
          genres: requiredGenres,
          instruments: requiredInstruments,
          experience_level: experienceLevel || null,
          event_start_time: primarySchedule?.start_time || eventStartTime,
          event_end_time: primarySchedule?.end_time || eventEndTime,
          event_schedules: normalizedSchedules,
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
              preferred_group_types: preferredGroupTypes,
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

      const { data: responseData, error: updateError } = await supabase.rpc(
        'update_gig_safely',
        {
          p_gig_id: gigId,
          p_payload: {
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
          },
          p_reason: 'Updated from Edit Gig screen by organizer',
        },
      );

      console.log('📥 Update response data:', JSON.stringify(responseData, null, 2));
      console.log('📥 Update response error:', updateError);

      if (updateError) {
        console.error('❌ Update failed with error:', updateError);

        let alertMessage = `Failed to update gig: ${updateError.message}`;
        if (updateError.hint) alertMessage += `\n\nHint: ${updateError.hint}`;
        if (updateError.details) alertMessage += `\n\nDetails: ${updateError.details}`;

        showAlert("error", "Error", alertMessage);
        return;
      }

      const rpcResult: any = responseData;
      if (!rpcResult?.success) {
        if (
          rpcResult?.code === 'SLOT_CONFLICT_TOTAL' ||
          rpcResult?.code === 'SLOT_CONFLICT_SOLO' ||
          rpcResult?.code === 'SLOT_CONFLICT_DUO' ||
          rpcResult?.code === 'SLOT_CONFLICT_BAND'
        ) {
          showAlert(
            'warning',
            'Slot Conflict',
            rpcResult?.message || 'Accepted applications exceed the updated slot capacity.',
          );
          return;
        }

        if (rpcResult?.code === 'GIG_NOT_FOUND') {
          showAlert('warning', 'Not Found', 'Gig not found. It may have been removed.');
          return;
        }

        throw new Error(rpcResult?.message || 'Failed to update gig');
      }

      const reconfirmRequired = Number(rpcResult?.reconfirmation?.required_count || 0);
      const systemRejectedPending = Number(rpcResult?.system_rejected_pending_count || 0);
      const softClosed = Boolean(rpcResult?.soft_closed);
      const softClosedRejected = Number(rpcResult?.soft_closed_rejected_count || 0);

      let successMessage = 'Gig updated successfully!';
      const updateNotes: string[] = [];

      if (reconfirmRequired > 0) {
        const hours = Number(rpcResult?.reconfirmation?.window_hours || 24);
        updateNotes.push(`${reconfirmRequired} accepted applicant(s) moved to reconfirmation with a ${hours}-hour response window.`);
      }

      if (systemRejectedPending > 0) {
        updateNotes.push(`${systemRejectedPending} pending applicant(s) were system-closed because requirements changed.`);
      }

      if (softClosed) {
        updateNotes.push('Gig was soft-closed because accepted applicants now fill all available slots.');
        if (softClosedRejected > 0) {
          updateNotes.push(`${softClosedRejected} pending applicant(s) were notified that slots are full.`);
        }
      }

      if (updateNotes.length > 0) {
        successMessage += `\n\n${updateNotes.join('\n')}`;
      }

      console.log("✅ Gig Updated successfully");
      showAlert("success", "Success", successMessage, [
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
    placeholder = "",
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
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={numeric ? "numeric" : "default"}
          style={[
            styles.textInput,
            {
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

      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToUint8Array(base64);

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

      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToUint8Array(base64);

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
        <Header title="Edit Gig" onBackPress={handleAttemptLeave} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.flex1}
        >
          {renderSectionHeader("Basic Details", "information-circle")}
          {renderInput("Gig Title", gigName, setGigName, "e.g. Saturday Night Live")}
          {renderInput("Description", description, setDescription, "Brief description of the gig", true)}

          {/* Event Photos */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Event Photos
            </Text>
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
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Location
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
          {renderInput("Payout (₱)", cost, setCost, "e.g. 5000", false, true)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Event Date (for condition entry)
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
              Event Time (for condition entry)
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
                          textAlign: "center",
                          flex: 1,
                        },
                      ]}
                    />
                    <TouchableOpacity activeOpacity={1}
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
                          textAlign: "center",
                          flex: 1,
                        },
                      ]}
                    />
                    <TouchableOpacity activeOpacity={1}
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

              <TouchableOpacity activeOpacity={1}
                onPress={handleAddEventCondition}
                style={{
                  marginTop: 12,
                  backgroundColor: colors.primary,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>
                  Add Date & Time Condition
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Event Date & Time Conditions
            </Text>
            <Text style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 10, fontSize: 12 }]}>
              Add one or more schedules. The first entry is used as the primary event date.
            </Text>
            {eventSchedules.length === 0 ? (
              <View style={[styles.dayCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: colors.border, padding: 12 }]}>
                <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12 }}>
                  No conditions added yet.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {eventSchedules.map((item, index) => (
                  <View
                    key={`${item.date}-${item.start_time}-${item.end_time}-${index}`}
                    style={[styles.dayCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: colors.border, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
                        {new Date(item.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium", fontSize: 11, marginTop: 2 }}>
                        {item.start_time} - {item.end_time}
                      </Text>
                    </View>
                    <TouchableOpacity activeOpacity={1} onPress={() => removeEventCondition(index)}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {renderSectionHeader("Looking For", "people")}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
              Configure Solo, Duo, and Group slots separately below.
            </Text>
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
            <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
              <View style={styles.slotHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="person" size={20} color="#EC4899" />
                  <Text style={[styles.slotTitle, { color: colors.text }]}>Solo Artists</Text>
                </View>
                <View style={styles.counterContainer}>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => setSoloSlotsNeeded(Math.max(0, soloSlotsNeeded - 1))}
                    style={[styles.counterBtn, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}
                  >
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.counterValue, { color: colors.text }]}>{soloSlotsNeeded}</Text>
                  <TouchableOpacity activeOpacity={1}
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
                    <TouchableOpacity activeOpacity={1}
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
                          <TouchableOpacity activeOpacity={1} onPress={() => setSoloRolesNeeded(soloRolesNeeded.filter((_, i) => i !== index))}>
                            <Ionicons name="close-circle" size={16} color="#EC4899" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Duo Slots */}
            <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB", marginTop: 12 }]}>
              <View style={styles.slotHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="people" size={20} color="#8B5CF6" />
                  <Text style={[styles.slotTitle, { color: colors.text }]}>Duos (2 members)</Text>
                </View>
                <View style={styles.counterContainer}>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => setDuoSlotsNeeded(Math.max(0, duoSlotsNeeded - 1))}
                    style={[styles.counterBtn, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}
                  >
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.counterValue, { color: colors.text }]}>{duoSlotsNeeded}</Text>
                  <TouchableOpacity activeOpacity={1}
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
                    <TouchableOpacity activeOpacity={1}
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
                          <TouchableOpacity activeOpacity={1} onPress={() => setDuoRolesNeeded(duoRolesNeeded.filter((_, i) => i !== index))}>
                            <Ionicons name="close-circle" size={16} color="#8B5CF6" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Preferred Group Type Slots */}
            <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB", marginTop: 12 }]}>
              <View style={styles.slotHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="musical-notes" size={20} color="#3B82F6" />
                  <Text style={[styles.slotTitle, { color: colors.text }]}>Preferred Group Type</Text>
                </View>
                <View style={styles.counterContainer}>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => setBandSlotsNeeded(Math.max(0, bandSlotsNeeded - 1))}
                    style={[styles.counterBtn, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}
                  >
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.counterValue, { color: colors.text }]}>{bandSlotsNeeded}</Text>
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => setBandSlotsNeeded(bandSlotsNeeded + 1)}
                    style={[styles.counterBtn, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
              {bandSlotsNeeded > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Poppins_400Regular", marginBottom: 12 }}>
                    Select the type(s) of group you prefer for this gig (Max: {bandSlotsNeeded}).
                  </Text>
                  <View style={[styles.chipContainer, { marginTop: 0 }]}>
                    {PH_MUSIC_GROUP_TYPES.map((type) => {
                      const isSelected = preferredGroupTypes.includes(type.id);
                      return (
                        <TouchableOpacity
                          key={type.id}
                          activeOpacity={1}
                          onPress={() => {
                            setPreferredGroupTypes(prev => {
                              if (isSelected) {
                                return prev.filter(id => id !== type.id);
                              } else {
                                if (prev.length >= bandSlotsNeeded) {
                                  return prev;
                                }
                                return [...prev, type.id];
                              }
                            });
                          }}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isSelected ? "rgba(59, 130, 246, 0.2)" : (isDark ? "#374151" : "#F3F4F6"),
                              borderWidth: isSelected ? 1 : 0,
                              borderColor: "#3B82F6",
                            }
                          ]}
                        >
                          <Text style={[styles.chipText, { color: isSelected ? "#3B82F6" : colors.textSecondary }]}>
                            {type.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 16 }]}>
                    Any other specific requirements/genres (optional):
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
                        placeholder="e.g., specific instruments..."
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
                    <TouchableOpacity activeOpacity={1}
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
                          <TouchableOpacity activeOpacity={1} onPress={() => setBandRolesNeeded(bandRolesNeeded.filter((_, i) => i !== index))}>
                            <Ionicons name="close-circle" size={16} color="#3B82F6" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Total Summary */}
            {(soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded) > 0 && (
              <View style={[styles.totalSummary, { backgroundColor: colors.primary + "15", marginTop: 16 }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <Text style={[styles.totalSummaryText, { color: colors.primary }]}>
                  Total slots: {soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded} performer(s) needed
                </Text>
              </View>
            )}

          </View>

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
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.primary + '20' }}>
                  <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>
                    {reapplicationCooldownDays === 0 ? "None" : `${reapplicationCooldownDays} days`}
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.slotSubLabel, { color: colors.textSecondary, fontSize: 11 }]}>
                  {reapplicationCooldownDays === 0
                    ? "Musicians can reapply immediately after rejection."
                    : `Musicians must wait ${reapplicationCooldownDays} days after rejection before reapplying.`}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {[
                  { label: "None", value: 0 },
                  { label: "7 days", value: 7 },
                  { label: "14 days", value: 14 },
                  { label: "30 days", value: 30 },
                  { label: "90 days", value: 90 },
                ].map((preset) => (
                  <TouchableOpacity activeOpacity={1}
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
              <TouchableOpacity activeOpacity={1}
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
                    <TouchableOpacity activeOpacity={1}
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
              <TouchableOpacity activeOpacity={1}
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
                    <TouchableOpacity activeOpacity={1}
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
                  <TouchableOpacity activeOpacity={1}
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
                <TouchableOpacity activeOpacity={1}
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
                activeOpacity={1}
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
                <TouchableOpacity activeOpacity={1}
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
                activeOpacity={1}
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
    paddingTop: 16,
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
    textAlign: "left",
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
  lookingForCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  lookingForGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  lookingForOption: {
    minWidth: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  lookingForOptionLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  settingsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  settingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingTitleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  cooldownValueText: {
    minWidth: 120,
    textAlign: "right",
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  cooldownHintText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
  },
  presetWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  presetPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  presetPillText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
});
