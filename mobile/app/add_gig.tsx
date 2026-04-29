import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Calendar } from "react-native-calendars";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { PH_MUSIC_GROUP_TYPES } from "../src/constants/groupTypes";
import { useTheme } from "../src/context/ThemeContext";
import { ensureUploadPassesSafetyScreening } from "../src/services/uploadSafetyScreen";

// Decode base64 to Uint8Array without using fetch().arrayBuffer() which crashes on Android New Architecture
const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const b64 = base64.replace(/=/g, "");
  let bufLen = Math.floor(b64.length * 0.75);
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

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;

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

type EventSchedule = {
  date: string;
  start_time: string;
  end_time: string;
};

export default function AddGigScreen() {
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams();
  const [step, setStep] = useState(1);
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
  const [modalVisible, setModalVisible] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Address Verification State
  const [addressVerificationModalVisible, setAddressVerificationModalVisible] = useState(false);
  const [addressVerificationUrl, setAddressVerificationUrl] = useState<string | null>(null);
  const [addressVerificationLoading, setAddressVerificationLoading] = useState(false);
  const [addressVerificationStatus, setAddressVerificationStatus] = useState<'pending' | 'verified' | 'failed' | null>(null);
  const [addressVerified, setAddressVerified] = useState(false);
  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);

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

  // Images state
  const [images, setImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);

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
  const documentPickerInProgressRef = useRef(false);

  // Requirements state
  const [requiredGenres, setRequiredGenres] = useState<string[]>([]);
  const [newGenre, setNewGenre] = useState("");
  const [genreSearch, setGenreSearch] = useState("");
  const [requiredInstruments, setRequiredInstruments] = useState<string[]>([]);
  const [newInstrument, setNewInstrument] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [musicianType, setMusicianType] = useState<"solo" | "group" | "both">(
    "both",
  );

  // Detailed Looking For Slots with Counts
  const [soloSlotsNeeded, setSoloSlotsNeeded] = useState<number>(0);
  const [duoSlotsNeeded, setDuoSlotsNeeded] = useState<number>(0);
  const [bandSlotsNeeded, setBandSlotsNeeded] = useState<number>(0);

  // Specific roles/instruments needed
  const [soloRolesNeeded, setSoloRolesNeeded] = useState<string[]>([]);
  const [newSoloRole, setNewSoloRole] = useState("");
  const [soloPreferredGenres, setSoloPreferredGenres] = useState<string[]>([]);
  const [newSoloPreferredGenre, setNewSoloPreferredGenre] = useState("");
  const [soloPreferredInstruments, setSoloPreferredInstruments] = useState<string[]>([]);
  const [newSoloPreferredInstrument, setNewSoloPreferredInstrument] = useState("");
  const [duoRolesNeeded, setDuoRolesNeeded] = useState<string[]>([]);
  const [newDuoRole, setNewDuoRole] = useState("");
  const [duoPreferredGenres, setDuoPreferredGenres] = useState<string[]>([]);
  const [newDuoPreferredGenre, setNewDuoPreferredGenre] = useState("");
  const [duoPreferredInstruments, setDuoPreferredInstruments] = useState<string[]>([]);
  const [newDuoPreferredInstrument, setNewDuoPreferredInstrument] = useState("");
  const [bandRolesNeeded, setBandRolesNeeded] = useState<string[]>([]);
  const [newBandRole, setNewBandRole] = useState("");
  const [bandPreferredGenres, setBandPreferredGenres] = useState<string[]>([]);
  const [newBandPreferredGenre, setNewBandPreferredGenre] = useState("");
  const [bandPreferredInstruments, setBandPreferredInstruments] = useState<string[]>([]);
  const [newBandPreferredInstrument, setNewBandPreferredInstrument] = useState("");

  // Preferred group types for band slots
  const [preferredGroupTypes, setPreferredGroupTypes] = useState<string[]>([]);
  const [groupTypePickerVisible, setGroupTypePickerVisible] = useState(false);

  // Anti-spam settings
  const [reapplicationCooldownDays, setReapplicationCooldownDays] = useState<number>(30);

  // Form Steps Configuration
  const steps = [
    { id: 1, title: "Gig Details", icon: "information-circle" },
    { id: 2, title: "Amenities", icon: "list" },
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

      if (profile?.role !== "venue-owner") {
        showAlert("warning", "Unauthorized", "Only venue owners can create gigs.");
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

  const [creating, setCreating] = useState(false);
  const [newGigId, setNewGigId] = useState<string | null>(null);

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
      showAlert("warning", "Required Field", "Please select an event date first");
      return;
    }

    if (!eventStartTime || !eventEndTime) {
      showAlert("warning", "Required Field", "Please set both start and end time first");
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

  useEffect(() => {
    if (bandSlotsNeeded !== preferredGroupTypes.length) {
      setBandSlotsNeeded(preferredGroupTypes.length);
    }
  }, [preferredGroupTypes, bandSlotsNeeded]);

  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      const schedules = getNormalizedEventSchedules();

      if (!gigName.trim()) {
        showAlert("warning", "Required Field", "Please enter a gig name");
        return false;
      }
      if (!description.trim()) {
        showAlert("warning", "Required Field", "Please enter a description");
        return false;
      }
      if (!address.trim()) {
        showAlert(
          "warning",
          "Required Field",
          "Please enter a venue address",
        );
        return false;
      }
      if (!cost.trim() || parseFloat(cost) <= 0) {
        showAlert(
          "warning",
          "Required Field",
          "Please enter a valid payout amount",
        );
        return false;
      }
      if (images.length === 0) {
        showAlert(
          "warning",
          "Required Field",
          "Please upload at least one event photo",
        );
        return false;
      }
      if (schedules.length === 0) {
        showAlert(
          "warning",
          "Required Field",
          "Please add at least one event date and time condition",
        );
        return false;
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
      // Confirmation before creating
      showAlert(
        "warning",
        "Confirm Gig Creation",
        "Are you sure you want to create this gig? Please review all details before proceeding.",
        [
          { text: "Cancel", style: "cancel", onPress: () => { } },
          { text: "Create", style: "default", onPress: () => createGig() },
        ],
      );
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const handleAutoFillTestData = () => {
    const eventDateValue = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    setGigName((prev) => prev.trim() || "Test Gig Night");
    setDescription(
      (prev) =>
        prev.trim() ||
        "QA test listing for quick booking and application flow checks.",
    );
    setAddress((prev) => prev.trim() || "Makati City, Metro Manila");
    setLatitude((prev) => prev ?? 14.5547);
    setLongitude((prev) => prev ?? 121.0244);
    setCost((prev) => prev.trim() || "5000");
    setEventDate(eventDateValue);
    setEventStartTime("06:00 PM");
    setEventEndTime("09:00 PM");
    setEventSchedules((prev) =>
      prev.length > 0
        ? prev
        : [
          {
            date: eventDateValue,
            start_time: "06:00 PM",
            end_time: "09:00 PM",
          },
        ],
    );
    setImages((prev) =>
      prev.length > 0
        ? prev
        : [
          "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=1200&h=900&fit=crop",
        ],
    );
    setThumbnailIndex(0);
    setRequiredGenres((prev) => (prev.length > 0 ? prev : ["OPM", "Pop"]));
    setRequiredInstruments((prev) =>
      prev.length > 0 ? prev : ["Vocals", "Guitar"],
    );
    setMusicianType("both");
    setSoloSlotsNeeded((prev) => (prev > 0 ? prev : 1));
    setDuoSlotsNeeded((prev) => (prev > 0 ? prev : 1));
    setPreferredGroupTypes((prev) =>
      prev.length > 0
        ? prev
        : PH_MUSIC_GROUP_TYPES.length > 0
          ? [PH_MUSIC_GROUP_TYPES[0].id]
          : [],
    );
    setExperienceLevel((prev) => prev || "Intermediate");
    setSoloRolesNeeded((prev) => (prev.length > 0 ? prev : ["Vocalist"]));
    setDuoRolesNeeded((prev) =>
      prev.length > 0 ? prev : ["Acoustic Duo"],
    );
    setBandRolesNeeded((prev) =>
      prev.length > 0 ? prev : ["House Band"],
    );

    showAlert(
      "success",
      "Test Autofill Applied",
      "Sample gig values were filled for testing.",
    );
  };

  const createGig = async () => {
    if (creating) return;
    setCreating(true);

    try {
      // Get current session (auto-refresh is handled by Supabase client)
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        showAlert("warning", "Session Expired", "Please log in again.");
        router.replace("/");
        return;
      }

      const normalizedSchedules = getNormalizedEventSchedules();
      const primarySchedule = normalizedSchedules[0];

      const payload = {
        name: gigName,
        description,
        location: address,
        budget: parseFloat(cost) || 0,
        status: "open",
        images: images,
        contract_url: contractUrl || null,
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
              preferred_genres: soloPreferredGenres,
              preferred_instruments: soloPreferredInstruments,
            },
            duo: {
              needed: duoSlotsNeeded,
              roles: duoRolesNeeded,
              preferred_genres: duoPreferredGenres,
              preferred_instruments: duoPreferredInstruments,
            },
            band: {
              needed: bandSlotsNeeded,
              roles: bandRolesNeeded,
              preferred_group_types: preferredGroupTypes,
              preferred_genres: bandPreferredGenres,
              preferred_instruments: bandPreferredInstruments,
            },
          },
          total_slots_needed: soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded,
        },
      };


      // Insert base gig row (3NF-safe)
      const { data, error } = await supabase
        .from('gigs')
        .insert({
          organizer_id: session.user.id,
          name: payload.name,
          description: payload.description,
          location: payload.location,
          budget: payload.budget,
          status: payload.status,
          contract_url: payload.contract_url,
          business_permit_url: null,
          latitude: payload.latitude,
          longitude: payload.longitude,
          event_date: payload.event_date,
          reapplication_cooldown_days: payload.reapplication_cooldown_days,
          permit_status: 'approved',
        })
        .select()
        .single();


      if (error) {
        console.error("❌ Error details:", JSON.stringify(error, null, 2));
        let alertMessage = `Failed to create gig: ${error.message}`;
        if (error.hint) alertMessage += `\n\nHint: ${error.hint}`;
        if (error.details) alertMessage += `\n\nDetails: ${error.details}`;
        showAlert("warning", "Couldn't Create Gig", alertMessage);
        return;
      }

      const requirementRows = Object.entries(payload.requirements || {})
        .filter(([, requirement_value]) => requirement_value !== null && requirement_value !== undefined)
        .map(([requirement_key, requirement_value]) => ({
          gig_id: data.id,
          requirement_key,
          requirement_value,
        }));

      if (requirementRows.length > 0) {
        const { error: requirementsError } = await supabase
          .from('gig_requirements')
          .insert(requirementRows);
        if (requirementsError) {
          throw new Error(`Failed to save gig requirements: ${requirementsError.message}`);
        }
      }

      const imageRows = (payload.images || []).map((media_url, index) => ({
        gig_id: data.id,
        media_type: 'image',
        media_url,
        sort_order: index,
      }));

      if (imageRows.length > 0) {
        const { error: mediaError } = await supabase
          .from('gig_media')
          .insert(imageRows);
        if (mediaError) {
          throw new Error(`Failed to save gig images: ${mediaError.message}`);
        }
      }

      setNewGigId(data.id);
      setModalVisible(true);
    } catch (e: any) {
      console.error("❌ Error creating gig:", e);
      console.error("❌ Error message:", e?.message);
      console.error("❌ Error stack:", e?.stack);
      console.error(
        "❌ Full error object:",
        JSON.stringify(e, Object.getOwnPropertyNames(e), 2),
      );
      showAlert(
        "warning",
        "Couldn't Create Gig",
        `Failed to create gig: ${e?.message || "Unknown error"}`,
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSuccessRedirect = () => {
    setModalVisible(false);
    router.replace({ pathname: "/my_venue", params: { refresh: String(Date.now()) } });
  };

  // Start address verification (before gig creation)
  const startAddressVerification = async () => {
    setAddressVerificationLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        return;
      }

      // Create the redirect URL for after verification
      const redirectUrl = Linking.createURL('address-verified', {
        queryParams: {
          entity_type: 'gig',
          mode: 'pre_creation'
        }
      });

      // Create address verification session (pre-creation mode)
      const { data, error } = await supabase.functions.invoke('create-address-verification', {
        body: {
          action: 'create',
          userId: session.user.id,
          entityType: 'gig',
          mode: 'pre_creation', // No entity ID yet - just verifying address
          redirect_url: redirectUrl
        }
      });


      // For Supabase functions, the error body is sometimes returned in data even when there's an error
      if (error || (data && data.error)) {
        let errorMessage = "Could not start address verification. Please try again.";

        // First check if data contains the error response (Supabase sometimes does this)
        if (data && data.error) {
          errorMessage = data.error;
          if (data.message) {
            errorMessage += `: ${data.message}`;
          }
        } else if (error) {

          // Try to get the response body from FunctionsHttpError
          try {
            // FunctionsHttpError has a context with the Response object
            if (error.context && typeof error.context.json === 'function') {
              const errorBody = await error.context.json();
              if (errorBody?.error) {
                errorMessage = errorBody.error;
                if (errorBody.message) {
                  errorMessage += `: ${errorBody.message}`;
                }
              }
            }
          } catch (parseErr) {
            console.error('Error parsing error response:', parseErr);
          }
        }

        throw new Error(errorMessage);
      }

      if (data?.verificationUrl) {
        setVerificationSessionId(data.sessionId);
        setAddressVerificationUrl(data.verificationUrl);
        setAddressVerificationModalVisible(true);
      } else {
        throw new Error('No verification URL returned');
      }
    } catch (e: any) {
      console.error('Address verification error:', e);
      showAlert(
        "warning",
        "Verification Error",
        e.message || "Could not start address verification. Please try again."
      );
    } finally {
      setAddressVerificationLoading(false);
    }
  };

  // Called after user completes address verification (before gig creation)
  const handleAddressVerificationComplete = async () => {
    setAddressVerificationModalVisible(false);
    setAddressVerificationUrl(null);

    // Fetch the verified address from the session
    if (verificationSessionId) {
      try {
        const { data, error } = await supabase.functions.invoke('create-address-verification', {
          body: {
            action: 'get_session',
            session_id: verificationSessionId
          }
        });

        if (data?.extracted_address) {
          setAddress(data.extracted_address);
          setAddressVerified(true);
          setAddressVerificationStatus('verified');
          showAlert(
            "success",
            "Address Verified!",
            `Your venue address has been verified:\n\n${data.extracted_address}`
          );
        } else {
          // Verification may still be processing
          showAlert(
            "info",
            "Processing",
            "Your verification is being processed. The address will be updated once approved."
          );
          setAddressVerificationStatus('pending');
        }
      } catch (e) {
        console.error('Error fetching verification result:', e);
        showAlert(
          "info",
          "Verification Submitted",
          "Your verification has been submitted. You may need to refresh to see the verified address."
        );
      }
    }
  };

  // Legacy function for post-creation verification
  const initiateAddressVerification = async () => {
    if (!newGigId) return;

    try {
      setAddressVerificationLoading(true);
      setAddressVerificationModalVisible(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Call the address verification edge function
      const { data, error } = await supabase.functions.invoke('create-address-verification', {
        body: {
          action: 'create',
          userId: user.id,
          entityType: 'gig',
          entityId: newGigId,
          address: address,
        }
      });

      if (error) throw error;

      if (data?.session_url) {
        setAddressVerificationUrl(data.session_url);
      } else {
        throw new Error("No verification URL received");
      }
    } catch (e: any) {
      console.error("Address verification error:", e);
      showAlert(
        "warning",
        "Verification Error",
        "Could not start address verification. You can verify your venue address later from My Venue."
      );
      setAddressVerificationModalVisible(false);
      router.replace({ pathname: "/my_venue", params: { refresh: String(Date.now()) } });
    } finally {
      setAddressVerificationLoading(false);
    }
  };

  const skipAddressVerification = () => {
    setAddressVerificationModalVisible(false);
    setAddressVerificationUrl(null);
    // Just close the modal - user can continue filling form
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

  const handleContractUpload = async () => {
    try {
      if (uploadingContract || documentPickerInProgressRef.current) {
        return;
      }

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
      documentPickerInProgressRef.current = true;
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      documentPickerInProgressRef.current = false;

      if (result.canceled) {
        setUploadingContract(false);
        return;
      }

      const file = result.assets[0];
      const fileName = file.name;
      const fileUri = file.uri;

      await ensureUploadPassesSafetyScreening(
        {
          name: fileName,
          mimeType: "application/pdf",
          size: typeof (file as any)?.size === "number" ? (file as any).size : undefined,
          uri: fileUri,
          kind: "document",
        },
        "add_gig_contract",
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
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
      documentPickerInProgressRef.current = false;
      console.error("Error uploading contract:", error);
      showAlert(
        "warning",
        "Upload Failed",
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
      if (uploadingBusinessPermit || documentPickerInProgressRef.current) {
        return;
      }

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
      documentPickerInProgressRef.current = true;
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      documentPickerInProgressRef.current = false;

      if (result.canceled) {
        setUploadingBusinessPermit(false);
        return;
      }

      const file = result.assets[0];
      const fileName = file.name;
      const fileUri = file.uri;
      const isPdf = fileName.toLowerCase().endsWith('.pdf');

      await ensureUploadPassesSafetyScreening(
        {
          name: fileName,
          mimeType: isPdf
            ? "application/pdf"
            : (typeof (file as any)?.mimeType === "string" ? (file as any).mimeType : undefined),
          size: typeof (file as any)?.size === "number" ? (file as any).size : undefined,
          uri: fileUri,
          kind: isPdf ? "document" : "photo",
        },
        "add_gig_business_permit",
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
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
      documentPickerInProgressRef.current = false;
      console.error("Error uploading business permit:", error);
      showAlert(
        "warning",
        "Upload Failed",
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
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        setUploadingBusinessPermit(false);
        return;
      }

      const contentType = fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : file.type || 'image/jpeg';

      await ensureUploadPassesSafetyScreening(
        {
          name: fileName,
          mimeType: contentType,
          size: typeof file?.size === "number" ? file.size : undefined,
          kind: contentType === "application/pdf" ? "document" : "photo",
        },
        "add_gig_business_permit_web",
      );

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
      showAlert("warning", "Upload Failed", "Failed to upload business permit. Please try again.");
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
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        setUploadingContract(false);
        return;
      }

      await ensureUploadPassesSafetyScreening(
        {
          name: fileName,
          mimeType: "application/pdf",
          size: typeof file?.size === "number" ? file.size : undefined,
          kind: "document",
        },
        "add_gig_contract_web",
      );

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
      showAlert("warning", "Upload Failed", "Failed to upload contract. Please try again.");
    } finally {
      setUploadingContract(false);
      if (event.target) {
        event.target.value = "";
      }
    }
  };

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
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Create Gig" />

        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
          <TouchableOpacity activeOpacity={1}
            onPress={handleAutoFillTestData}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: isDark ? "rgba(59, 130, 246, 0.16)" : "#DBEAFE",
              borderWidth: 1,
              borderColor: isDark ? "rgba(96, 165, 250, 0.5)" : "#93C5FD",
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Ionicons name="flask-outline" size={15} color={colors.primary} />
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Poppins_600SemiBold",
                fontSize: 12,
              }}
            >
              Auto Fill Test Data
            </Text>
          </TouchableOpacity>
        </View>

        {/* Enhanced Step Indicator (Fixed at top) */}
        <View style={styles.stepIndicatorContainer}>
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
                            : "#F3F4F6", // using primaryLight approx
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

        <ScrollView
          style={styles.formContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Gig Information
              </Text>
              {renderInput(
                "Event Name",
                gigName,
                setGigName,
                "e.g. Saturday Night Live",
              )}
              {renderInput(
                "Description",
                description,
                setDescription,
                "Brief description of the gig",
                true,
              )}

              {/* Image Upload */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Event Photos
                </Text>
                <ImageUploader
                  images={images}
                  onImagesChange={setImages}
                  thumbnailIndex={thumbnailIndex}
                  onThumbnailChange={setThumbnailIndex}
                  maxImages={10}
                  bucketName="listings"
                  userId={newGigId || "temp"}
                  folder="gigs"
                />
              </View>

              {/* Venue Location - Pin on Map */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Venue Address
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
                      {address || "Tap to select venue location on map"}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* OLD Address Verification Section - Commented Out
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Venue Address
                </Text>
                <Text
                  style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 12 }]}
                >
                  Verify your venue address using a utility bill (Meralco, Maynilad, etc.)
                </Text>
                
                {addressVerified && address ? (
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.primary + '10',
                        borderColor: colors.primary,
                        padding: 16,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      <View style={{
                        backgroundColor: colors.primary,
                        borderRadius: 20,
                        padding: 6,
                      }}>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
                          Verified Address
                        </Text>
                        <Text style={{ color: colors.text, fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 2 }}>
                          {address}
                        </Text>
                      </View>
                      <Ionicons name="lock-closed" size={18} color={colors.primary} />
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity activeOpacity={1}
                    onPress={startAddressVerification}
                    disabled={addressVerificationLoading}
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        borderStyle: 'dashed',
                        padding: 20,
                      },
                    ]}
                  >
                    <View style={{ alignItems: "center", gap: 12 }}>
                      {addressVerificationLoading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <View style={{
                            backgroundColor: colors.primary + '15',
                            borderRadius: 30,
                            padding: 12,
                          }}>
                            <Ionicons name="document-text-outline" size={28} color={colors.primary} />
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                              Verify Your Venue Address
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                              Upload a recent utility bill to verify and auto-fill your venue address
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              </View>
              */}



              {renderInput(
                "Payout (₱)",
                cost,
                setCost,
                "e.g. 5000",
                false,
                "numeric",
              )}

              {/* Event Date & Time Section */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
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
                    current={new Date().toISOString().split("T")[0]}
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
                      <Ionicons
                        name="calendar"
                        size={16}
                        color={colors.primary}
                      />
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
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
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
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
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
                        <View style={{ flex: 1, minWidth: 150, paddingRight: 8 }}>
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

              {/* Contract Upload */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Custom Contract
                </Text>
                <Text
                  style={[
                    styles.inputSubLabel,
                    { color: colors.textSecondary },
                  ]}
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
                      minWidth: 150 }}
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
                          style={[
                            styles.contractFileName,
                            { color: colors.text },
                          ]}
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
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#EF4444"
                      />
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
                        <Text
                          style={[styles.uploadText, { color: colors.text }]}
                        >
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
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Needs
              </Text>

              {/* Genre Requirements (searchable chips) */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Genres</Text>
                {requiredGenres.length > 0 && (
                  <View style={styles.selectedChips}>
                    {requiredGenres.map((genre) => (
                      <TouchableOpacity activeOpacity={1}
                        key={genre}
                        onPress={() => setRequiredGenres(requiredGenres.filter((g) => g !== genre))}
                        style={[
                          styles.chipCompact,
                          { borderColor: colors.primary, backgroundColor: isDark ? "rgba(124, 58, 237, 0.3)" : "#EEF2FF" },
                        ]}
                      >
                        <Text style={[styles.chipTextCompact, { color: isDark ? "#A78BFA" : colors.primary }]}>{genre}</Text>
                        <Ionicons name="close-circle" size={14} color={isDark ? "#A78BFA" : colors.primary} style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TextInput
                  style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                  value={genreSearch}
                  onChangeText={setGenreSearch}
                  placeholder="Search genres..."
                  placeholderTextColor={colors.textSecondary}
                />

                <View style={styles.chipsCompact}>
                  {GENRES.filter((g) => !requiredGenres.includes(g) && g.toLowerCase().includes(genreSearch.toLowerCase()))
                    .slice(0, genreSearch ? 20 : 8)
                    .map((g) => (
                      <TouchableOpacity activeOpacity={1}
                        key={g}
                        onPress={() => setRequiredGenres([...requiredGenres, g])}
                        style={[styles.chipCompact, { borderColor: colors.border, backgroundColor: "transparent" }]}
                      >
                        <Text style={[styles.chipTextCompact, { color: colors.textSecondary }]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  {!genreSearch && GENRES.filter((g) => !requiredGenres.includes(g)).length > 8 && (
                    <Text style={[styles.moreText, { color: colors.textSecondary }]}>Search for more...</Text>
                  )}
                </View>
              </View>

              {/* Equipment Requirements */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Provided equipments
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

              {/* Experience Level */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
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
                                experienceLevel === level
                                  ? "#fff"
                                  : colors.text,
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

              {/* Looking For */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Looking For
                </Text>
                <Text style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
                  Configure Solo, Duo, and Group slots separately below.
                </Text>
              </View>

              {/* Detailed Slots Configuration */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  How many performers do you need?
                </Text>
                <Text
                  style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 12, fontSize: 12 }]}
                >
                  Set limits per category. Applicants cannot apply more than once per gig.
                </Text>

                <View style={[styles.slotCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                  <View style={styles.slotHeader}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
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

                      <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 12 }]}>
                        Preferred genres (optional):
                      </Text>
                      <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                        <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                          <TextInput
                            value={newSoloPreferredGenre}
                            onChangeText={setNewSoloPreferredGenre}
                            placeholder="e.g., Pop, Acoustic..."
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.textInput, { color: colors.text }]}
                            onSubmitEditing={() => {
                              const trimmed = newSoloPreferredGenre.trim();
                              if (!trimmed) return;
                              if (soloPreferredGenres.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                                setNewSoloPreferredGenre("");
                                return;
                              }
                              setSoloPreferredGenres([...soloPreferredGenres, trimmed]);
                              setNewSoloPreferredGenre("");
                            }}
                          />
                        </View>
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => {
                            const trimmed = newSoloPreferredGenre.trim();
                            if (!trimmed) return;
                            if (soloPreferredGenres.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                              setNewSoloPreferredGenre("");
                              return;
                            }
                            setSoloPreferredGenres([...soloPreferredGenres, trimmed]);
                            setNewSoloPreferredGenre("");
                          }}
                          style={[styles.addBtn, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      {soloPreferredGenres.length > 0 && (
                        <View style={[styles.chipContainer, { marginTop: 8 }]}>
                          {soloPreferredGenres.map((genre, index) => (
                            <View key={index} style={[styles.chip, { backgroundColor: "#EC489920" }]}>
                              <Text style={[styles.chipText, { color: "#EC4899" }]}>{genre}</Text>
                              <TouchableOpacity activeOpacity={1} onPress={() => setSoloPreferredGenres(soloPreferredGenres.filter((_, i) => i !== index))}>
                                <Ionicons name="close-circle" size={16} color="#EC4899" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}

                      <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 12 }]}>
                        Preferred instruments (optional):
                      </Text>
                      <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                        <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                          <TextInput
                            value={newSoloPreferredInstrument}
                            onChangeText={setNewSoloPreferredInstrument}
                            placeholder="e.g., Acoustic Guitar, Cajon..."
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.textInput, { color: colors.text }]}
                            onSubmitEditing={() => {
                              const trimmed = newSoloPreferredInstrument.trim();
                              if (!trimmed) return;
                              if (soloPreferredInstruments.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                                setNewSoloPreferredInstrument("");
                                return;
                              }
                              setSoloPreferredInstruments([...soloPreferredInstruments, trimmed]);
                              setNewSoloPreferredInstrument("");
                            }}
                          />
                        </View>
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => {
                            const trimmed = newSoloPreferredInstrument.trim();
                            if (!trimmed) return;
                            if (soloPreferredInstruments.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                              setNewSoloPreferredInstrument("");
                              return;
                            }
                            setSoloPreferredInstruments([...soloPreferredInstruments, trimmed]);
                            setNewSoloPreferredInstrument("");
                          }}
                          style={[styles.addBtn, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      {soloPreferredInstruments.length > 0 && (
                        <View style={[styles.chipContainer, { marginTop: 8 }]}>
                          {soloPreferredInstruments.map((instrument, index) => (
                            <View key={index} style={[styles.chip, { backgroundColor: "#EC489920" }]}>
                              <Text style={[styles.chipText, { color: "#EC4899" }]}>{instrument}</Text>
                              <TouchableOpacity activeOpacity={1} onPress={() => setSoloPreferredInstruments(soloPreferredInstruments.filter((_, i) => i !== index))}>
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
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
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

                      <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 12 }]}>
                        Preferred genres (optional):
                      </Text>
                      <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                        <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                          <TextInput
                            value={newDuoPreferredGenre}
                            onChangeText={setNewDuoPreferredGenre}
                            placeholder="e.g., OPM, Pop..."
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.textInput, { color: colors.text }]}
                            onSubmitEditing={() => {
                              const trimmed = newDuoPreferredGenre.trim();
                              if (!trimmed) return;
                              if (duoPreferredGenres.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                                setNewDuoPreferredGenre("");
                                return;
                              }
                              setDuoPreferredGenres([...duoPreferredGenres, trimmed]);
                              setNewDuoPreferredGenre("");
                            }}
                          />
                        </View>
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => {
                            const trimmed = newDuoPreferredGenre.trim();
                            if (!trimmed) return;
                            if (duoPreferredGenres.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                              setNewDuoPreferredGenre("");
                              return;
                            }
                            setDuoPreferredGenres([...duoPreferredGenres, trimmed]);
                            setNewDuoPreferredGenre("");
                          }}
                          style={[styles.addBtn, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      {duoPreferredGenres.length > 0 && (
                        <View style={[styles.chipContainer, { marginTop: 8 }]}>
                          {duoPreferredGenres.map((genre, index) => (
                            <View key={index} style={[styles.chip, { backgroundColor: "#8B5CF620" }]}>
                              <Text style={[styles.chipText, { color: "#8B5CF6" }]}>{genre}</Text>
                              <TouchableOpacity activeOpacity={1} onPress={() => setDuoPreferredGenres(duoPreferredGenres.filter((_, i) => i !== index))}>
                                <Ionicons name="close-circle" size={16} color="#8B5CF6" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}

                      <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 12 }]}>
                        Preferred instruments (optional):
                      </Text>
                      <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                        <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                          <TextInput
                            value={newDuoPreferredInstrument}
                            onChangeText={setNewDuoPreferredInstrument}
                            placeholder="e.g., Keyboard, Violin..."
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.textInput, { color: colors.text }]}
                            onSubmitEditing={() => {
                              const trimmed = newDuoPreferredInstrument.trim();
                              if (!trimmed) return;
                              if (duoPreferredInstruments.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                                setNewDuoPreferredInstrument("");
                                return;
                              }
                              setDuoPreferredInstruments([...duoPreferredInstruments, trimmed]);
                              setNewDuoPreferredInstrument("");
                            }}
                          />
                        </View>
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => {
                            const trimmed = newDuoPreferredInstrument.trim();
                            if (!trimmed) return;
                            if (duoPreferredInstruments.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                              setNewDuoPreferredInstrument("");
                              return;
                            }
                            setDuoPreferredInstruments([...duoPreferredInstruments, trimmed]);
                            setNewDuoPreferredInstrument("");
                          }}
                          style={[styles.addBtn, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      {duoPreferredInstruments.length > 0 && (
                        <View style={[styles.chipContainer, { marginTop: 8 }]}>
                          {duoPreferredInstruments.map((instrument, index) => (
                            <View key={index} style={[styles.chip, { backgroundColor: "#8B5CF620" }]}>
                              <Text style={[styles.chipText, { color: "#8B5CF6" }]}>{instrument}</Text>
                              <TouchableOpacity activeOpacity={1} onPress={() => setDuoPreferredInstruments(duoPreferredInstruments.filter((_, i) => i !== index))}>
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
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <Ionicons name="musical-notes" size={20} color="#3B82F6" />
                      <Text style={[styles.slotTitle, { color: colors.text }]}>Preferred Group Type</Text>
                    </View>
                    <Text style={[styles.counterValue, { color: colors.text }]}>{bandSlotsNeeded}</Text>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Poppins_400Regular", marginBottom: 12, textAlign: "center" }}>
                      Tap a group type to add needed count.
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "Poppins_400Regular", marginBottom: 12, textAlign: "center" }}>
                      Tap + to add. Use the remove icon on selected types to reduce by 1.
                    </Text>
                    {preferredGroupTypes.length > 0 && (
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={() => setPreferredGroupTypes([])}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 14,
                            backgroundColor: isDark ? "#374151" : "#E5E7EB",
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Poppins_500Medium" }}>Clear all</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={[styles.chipContainer, { marginTop: 0 }]}>
                      {PH_MUSIC_GROUP_TYPES.map((type) => {
                        const typeCount = preferredGroupTypes.filter((id) => id === type.id).length;
                        const isSelected = typeCount > 0;
                        return (
                          <TouchableOpacity
                            key={type.id}
                            activeOpacity={1}
                            onPress={() => {
                              setPreferredGroupTypes((prev) => [...prev, type.id]);
                            }}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: isSelected ? "rgba(59, 130, 246, 0.2)" : (isDark ? "#374151" : "#F3F4F6"),
                                borderWidth: isSelected ? 1 : 0,
                                borderColor: "#3B82F6",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }
                            ]}
                          >
                            <Text style={[styles.chipText, { color: isSelected ? "#3B82F6" : colors.textSecondary }]}>
                              {type.label}
                            </Text>
                            {typeCount > 0 && (
                              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                                <View
                                  style={{
                                    minWidth: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: "#3B82F6",
                                    paddingHorizontal: 6,
                                  }}
                                >
                                  <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>
                                    {typeCount}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  activeOpacity={1}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    setPreferredGroupTypes((prev) => {
                                      const lastIndex = prev.lastIndexOf(type.id);
                                      if (lastIndex === -1) return prev;
                                      return prev.filter((_, index) => index !== lastIndex);
                                    });
                                  }}
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: isDark ? "#1F2937" : "#E5E7EB",
                                  }}
                                >
                                  <Ionicons name="trash-outline" size={12} color="#EF4444" />
                                </TouchableOpacity>
                              </View>
                            )}
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

                    <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 12 }]}>
                      Preferred genres (optional):
                    </Text>
                    <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                      <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                        <TextInput
                          value={newBandPreferredGenre}
                          onChangeText={setNewBandPreferredGenre}
                          placeholder="e.g., Funk, R&B..."
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.textInput, { color: colors.text }]}
                          onSubmitEditing={() => {
                            const trimmed = newBandPreferredGenre.trim();
                            if (!trimmed) return;
                            if (bandPreferredGenres.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                              setNewBandPreferredGenre("");
                              return;
                            }
                            setBandPreferredGenres([...bandPreferredGenres, trimmed]);
                            setNewBandPreferredGenre("");
                          }}
                        />
                      </View>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => {
                          const trimmed = newBandPreferredGenre.trim();
                          if (!trimmed) return;
                          if (bandPreferredGenres.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                            setNewBandPreferredGenre("");
                            return;
                          }
                          setBandPreferredGenres([...bandPreferredGenres, trimmed]);
                          setNewBandPreferredGenre("");
                        }}
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    {bandPreferredGenres.length > 0 && (
                      <View style={[styles.chipContainer, { marginTop: 8 }]}>
                        {bandPreferredGenres.map((genre, index) => (
                          <View key={index} style={[styles.chip, { backgroundColor: "#3B82F620" }]}>
                            <Text style={[styles.chipText, { color: "#3B82F6" }]}>{genre}</Text>
                            <TouchableOpacity activeOpacity={1} onPress={() => setBandPreferredGenres(bandPreferredGenres.filter((_, i) => i !== index))}>
                              <Ionicons name="close-circle" size={16} color="#3B82F6" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 12 }]}>
                      Preferred instruments (optional):
                    </Text>
                    <View style={[styles.addMemberRow, { marginTop: 8 }]}>
                      <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                        <TextInput
                          value={newBandPreferredInstrument}
                          onChangeText={setNewBandPreferredInstrument}
                          placeholder="e.g., Brass section, Synths..."
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.textInput, { color: colors.text }]}
                          onSubmitEditing={() => {
                            const trimmed = newBandPreferredInstrument.trim();
                            if (!trimmed) return;
                            if (bandPreferredInstruments.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                              setNewBandPreferredInstrument("");
                              return;
                            }
                            setBandPreferredInstruments([...bandPreferredInstruments, trimmed]);
                            setNewBandPreferredInstrument("");
                          }}
                        />
                      </View>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => {
                          const trimmed = newBandPreferredInstrument.trim();
                          if (!trimmed) return;
                          if (bandPreferredInstruments.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                            setNewBandPreferredInstrument("");
                            return;
                          }
                          setBandPreferredInstruments([...bandPreferredInstruments, trimmed]);
                          setNewBandPreferredInstrument("");
                        }}
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    {bandPreferredInstruments.length > 0 && (
                      <View style={[styles.chipContainer, { marginTop: 8 }]}>
                        {bandPreferredInstruments.map((instrument, index) => (
                          <View key={index} style={[styles.chip, { backgroundColor: "#3B82F620" }]}>
                            <Text style={[styles.chipText, { color: "#3B82F6" }]}>{instrument}</Text>
                            <TouchableOpacity activeOpacity={1} onPress={() => setBandPreferredInstruments(bandPreferredInstruments.filter((_, i) => i !== index))}>
                              <Ionicons name="close-circle" size={16} color="#3B82F6" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
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
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
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
                  {/* Quick preset buttons */}
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
                  <Text style={styles.reviewLabel}>Gig Info</Text>
                  <Text style={[styles.reviewValue, { color: colors.text }]}>
                    {gigName || "No Name"}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    {address || "No Location"}
                  </Text>
                  <Text
                    style={{
                      color: colors.primary,
                      fontFamily: "Poppins_600SemiBold",
                      marginTop: 4,
                    }}
                  >
                    Payout: ₱{cost}
                  </Text>
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                  ]}
                />

                <View>
                  <Text style={styles.reviewLabel}>Description</Text>
                  <Text
                    style={[styles.reviewDescription, { color: colors.text }]}
                  >
                    {description || "No description provided."}
                  </Text>
                </View>

                {(requiredGenres.length > 0 ||
                  requiredInstruments.length > 0 ||
                  experienceLevel) && (
                    <>
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                        ]}
                      />
                      <View>
                        <Text style={styles.reviewLabel}>Amenities</Text>
                        {requiredGenres.length > 0 && (
                          <View style={{ marginBottom: 8 }}>
                            <Text
                              style={[
                                styles.requirementSubLabel,
                                { color: colors.textSecondary },
                              ]}
                            >
                              Genres:
                            </Text>
                            <Text style={{ color: colors.text }}>
                              {requiredGenres.join(", ")}
                            </Text>
                          </View>
                        )}
                        {requiredInstruments.length > 0 && (
                          <View style={{ marginBottom: 8 }}>
                            <Text
                              style={[
                                styles.requirementSubLabel,
                                { color: colors.textSecondary },
                              ]}
                            >
                              Provided equipments:
                            </Text>
                            <Text style={{ color: colors.text }}>
                              {requiredInstruments.join(", ")}
                            </Text>
                          </View>
                        )}
                        {experienceLevel && (
                          <View>
                            <Text
                              style={[
                                styles.requirementSubLabel,
                                { color: colors.textSecondary },
                              ]}
                            >
                              Experience Level:
                            </Text>
                            <Text style={{ color: colors.text }}>
                              {experienceLevel}
                            </Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}

                {/* Slots Summary in Review */}
                {(soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded) > 0 && (
                  <>
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                      ]}
                    />
                    <View>
                      <Text style={styles.reviewLabel}>Looking For</Text>
                      <View style={{ gap: 8 }}>
                        {soloSlotsNeeded > 0 && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <Ionicons name="person" size={16} color="#EC4899" />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>
                              {soloSlotsNeeded} Solo Artist{soloSlotsNeeded > 1 ? "s" : ""}
                              {soloRolesNeeded.length > 0 && ` (${soloRolesNeeded.join(", ")})`}
                            </Text>
                          </View>
                        )}
                        {soloSlotsNeeded > 0 && (soloPreferredGenres.length > 0 || soloPreferredInstruments.length > 0) && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 24 }}>
                            {soloPreferredGenres.length > 0 ? `Genres: ${soloPreferredGenres.join(", ")}` : ""}
                            {soloPreferredGenres.length > 0 && soloPreferredInstruments.length > 0 ? " | " : ""}
                            {soloPreferredInstruments.length > 0 ? `Instruments: ${soloPreferredInstruments.join(", ")}` : ""}
                          </Text>
                        )}
                        {duoSlotsNeeded > 0 && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <Ionicons name="people" size={16} color="#8B5CF6" />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>
                              {duoSlotsNeeded} Duo{duoSlotsNeeded > 1 ? "s" : ""}
                              {duoRolesNeeded.length > 0 && ` (${duoRolesNeeded.join(", ")})`}
                            </Text>
                          </View>
                        )}
                        {duoSlotsNeeded > 0 && (duoPreferredGenres.length > 0 || duoPreferredInstruments.length > 0) && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 24 }}>
                            {duoPreferredGenres.length > 0 ? `Genres: ${duoPreferredGenres.join(", ")}` : ""}
                            {duoPreferredGenres.length > 0 && duoPreferredInstruments.length > 0 ? " | " : ""}
                            {duoPreferredInstruments.length > 0 ? `Instruments: ${duoPreferredInstruments.join(", ")}` : ""}
                          </Text>
                        )}
                        {bandSlotsNeeded > 0 && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <Ionicons name="people-circle" size={16} color="#3B82F6" />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>
                              {bandSlotsNeeded} Group{bandSlotsNeeded > 1 ? "s" : ""}
                              {bandRolesNeeded.length > 0 && ` (${bandRolesNeeded.join(", ")})`}
                            </Text>
                          </View>
                        )}
                        {bandSlotsNeeded > 0 && (bandPreferredGenres.length > 0 || bandPreferredInstruments.length > 0) && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 24 }}>
                            {bandPreferredGenres.length > 0 ? `Genres: ${bandPreferredGenres.join(", ")}` : ""}
                            {bandPreferredGenres.length > 0 && bandPreferredInstruments.length > 0 ? " | " : ""}
                            {bandPreferredInstruments.length > 0 ? `Instruments: ${bandPreferredInstruments.join(", ")}` : ""}
                          </Text>
                        )}
                      </View>
                    </View>
                  </>
                )}
              </View>

              {/* Partnership Proposal Entry Point */}
              <View style={{ marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: isDark ? "#374151" : "#E5E7EB", backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Ionicons name="people-outline" size={20} color={colors.primary} />
                  <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: colors.text, marginLeft: 8 }}>
                    Production Partnership
                  </Text>
                </View>
                <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: colors.textSecondary, marginBottom: 10 }}>
                  After creating this gig, you can coordinate venue partnerships with a production team from your production workspace.
                </Text>
                <TouchableOpacity activeOpacity={1}
                  onPress={() => router.push("/production_team" as any)}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: colors.primary }}>
                    Manage Production Teams
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>

              <Text style={styles.termsText}>
                By tapping Create Gig, you agree to our Terms and Conditions.
              </Text>
            </View>
          )}

          {/* Navigation Buttons */}
          <View style={styles.navigationButtons}>
            <TouchableOpacity
              onPress={handleBack}
              disabled={creating}
              activeOpacity={1}
              style={[
                styles.backBtn,
                {
                  flex: 1,
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  opacity: creating ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.backBtnText, { color: colors.text }]}>
                {step === 1 ? "Cancel" : "Back"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              disabled={creating}
              activeOpacity={1}
              style={[
                styles.nextBtn,
                {
                  flex: 1,
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                  opacity: creating ? 0.7 : 1,
                },
              ]}
            >
              {creating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.nextBtnText}>
                  {step === 3 ? "Create Gig" : "Next"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        title="Success!"
        message={`Gig "${gigName}" has been successfully posted!`}
        buttonText="Go to Gig"
        onClose={handleSuccessRedirect}
      />

      <Modal
        visible={creating}
        loading
        loadingMessage="Creating gig..."
        onClose={() => { }}
      />

      {/* Address Verification Modal - Commented Out
      {addressVerificationModalVisible && (
        <View style={styles.verificationModalOverlay}>
          <View style={[styles.verificationModalContainer, { backgroundColor: colors.background }]}>
            <View style={styles.verificationModalHeader}>
              <Text style={[styles.verificationModalTitle, { color: colors.text }]}>
                Verify Venue Address
              </Text>
              <TouchableOpacity activeOpacity={1} onPress={skipAddressVerification} style={styles.skipButton}>
                <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>Skip for now</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.verificationInfoBanner, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="information-circle" size={20} color={colors.primary} />
              <Text style={[styles.verificationInfoText, { color: colors.text }]}>
                Upload a recent utility bill (Meralco, Maynilad, etc.) to verify your venue address. The name on the bill should match your verified identity.
              </Text>
            </View>
            {addressVerificationUrl ? (
              <View style={styles.webviewContainer}>
                {Platform.OS === 'web' ? (
                  <iframe
                    src={addressVerificationUrl}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                    allow="camera; microphone; fullscreen"
                  />
                ) : (
                  <WebView
                    source={{ uri: addressVerificationUrl }}
                    style={styles.webview}
                    onNavigationStateChange={(navState) => {
                      if (navState.url.includes('address-verified') || 
                          navState.url.includes('verification-complete') ||
                          navState.url.includes('status=approved') ||
                          navState.url.includes('smile-webhook') ||
                          navState.url.includes('callback=') ||
                          navState.url.includes('/link/success')) {
                        handleAddressVerificationComplete();
                      }
                    }}
                    onMessage={(event) => {
                      try {
                        const data = JSON.parse(event.nativeEvent.data);
                        if (data.eventName === 'UPLOADS_CREATED' || 
                            data.eventName === 'LINK_CLOSED' ||
                            data.type === 'close' ||
                            data.type === 'success') {
                          handleAddressVerificationComplete();
                        }
                      } catch (e) {}
                    }}
                    javaScriptEnabled
                    domStorageEnabled
                    startInLoadingState
                    renderLoading={() => (
                      <View style={styles.webviewLoading}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
                          Loading verification...
                        </Text>
                      </View>
                    )}
                  />
                )}
              </View>
            ) : (
              <View style={styles.webviewLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
                  Preparing verification...
                </Text>
              </View>
            )}
            <View style={styles.verificationModalFooter}>
              <TouchableOpacity activeOpacity={1}
                onPress={handleAddressVerificationComplete}
                style={[styles.verificationCompleteBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.verificationCompleteBtnText}>I've Completed Verification</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      */}

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
  stepIndicatorContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  stepIndicatorContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  progressLineBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  activeProgressLine: {
    position: "absolute",
    left: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  stepItem: {
    alignItems: "center",
    zIndex: 10,
    width: 80,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
  },
  stepText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  scrollContent: {
    paddingBottom: 150,
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 24,
    textAlign: "center",
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
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  textInput: {
    padding: 16,
    fontFamily: "Poppins_400Regular",
    textAlign: "left",
    textAlignVertical: "center",
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
  reviewDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  requirementSubLabel: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  divider: {
    height: 1,
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
  chipTextCompact: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    textAlignVertical: "center",
    marginTop: 8,
  },
  moreText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    fontStyle: "italic",
    marginTop: 4,
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
    justifyContent: "center",
  },
  experienceButtonText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  termsText: {
    textAlign: "center",
    fontSize: 12,
    color: "#9CA3AF",
    paddingHorizontal: 16,
  },
  navigationButtons: {
    marginTop: 32,
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  backBtnText: {
    fontFamily: "Poppins_600SemiBold",
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextBtnText: {
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
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
    textAlignVertical: "center",
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
  // Address Verification Modal Styles
  verificationModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  verificationModalContainer: {
    width: '95%',
    height: '90%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  verificationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  verificationModalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  skipButton: {
    padding: 8,
  },
  skipButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  verificationInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    gap: 10,
  },
  verificationInfoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 18,
  },
  webviewContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  verificationCompleteBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationCompleteBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
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

