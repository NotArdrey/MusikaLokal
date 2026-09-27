import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { Calendar } from "../src/components/CenteredCalendar";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import GigReapplicationCooldownField, {
  formatGigReapplicationCooldown,
} from "../src/components/GigReapplicationCooldownField";
import GigRecommendationSettings, {
  DEFAULT_GIG_RECOMMENDATION_SETTINGS,
  type GigRecommendationSettingsValue,
} from "../src/components/GigRecommendationSettings";
import GigPresetDropdown, {
  GIG_GENRE_OPTIONS,
  GIG_INSTRUMENT_OPTIONS,
} from "../src/components/GigPresetDropdown";
import GigSpecificSlotRequirements from "../src/components/GigSpecificSlotRequirements";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal from "../src/components/modal";
import { useTheme } from "../src/context/ThemeContext";
import { wizardFormStyles } from "../src/theme/formStyles";
import { radius, typography } from "../src/theme/tokens";
import { createE2EImageFixtureUrls, isE2EFixtureMode } from "../src/utils/e2eFixtures";
import {
  DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY,
  sanitizeStorageFileName,
  uploadStorageObject,
} from "../src/utils/storageUpload";
import { invalidateListingCaches } from "../src/utils/listingCacheInvalidation";
import {
  aggregateSpecificSlotRequirements,
  getSpecificSlotRequirementLines,
  normalizeSpecificSlotRequirements,
  type GigSpecificSlotRequirement,
} from "../src/utils/gigSlotRequirements";

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
const normalizeE2ETestId = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const DATE_ONLY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

const toCalendarDateString = (value: unknown): string => {
  if (!value) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  const dateOnlyMatch = raw.match(DATE_ONLY_PREFIX);
  if (dateOnlyMatch) return dateOnlyMatch[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLocalCalendarDate = () => toCalendarDateString(new Date());
const isPastCalendarDate = (dateString: string, today = getLocalCalendarDate()) =>
  Boolean(dateString) && dateString < today;
const getE2EEventDate = () => toCalendarDateString(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));

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
  const formScrollViewRef = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      formScrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    }, []),
  );

  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ ownerId?: string }>();
  const delegatedOwnerId = Array.isArray(params.ownerId) ? params.ownerId[0] : params.ownerId;
  const todayCalendarDate = getLocalCalendarDate();
  const [step, setStep] = useState(1);
  useEffect(() => {
    formScrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [step]);
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

  useEffect(() => {
    if (!isE2EFixtureMode()) return;
    const e2eEventDate = getE2EEventDate();
    setImages((current) => current.length > 0 ? current : createE2EImageFixtureUrls(1));
    setAddress((current) => current.trim() ? current : "E2E Gig Address");
    setLatitude((current) => current ?? 14.5995);
    setLongitude((current) => current ?? 120.9842);
    setAddressVerified(true);
    setAddressVerificationStatus("verified");
    setCost((current) => current.trim() ? current : "5000");
    setEventDate((current) => current.trim() ? current : e2eEventDate);
    setEventSchedules((current) => current.length > 0 ? current : [{
      date: e2eEventDate,
      start_time: "06:00 PM",
      end_time: "11:00 PM",
    }]);
  }, []);

  // Requirements state
  const [requiredGenres, setRequiredGenres] = useState<string[]>([]);
  const [newGenre, setNewGenre] = useState("");
  const [genreSearch, setGenreSearch] = useState("");
  const [requiredInstruments, setRequiredInstruments] = useState<string[]>([]);
  const [newInstrument, setNewInstrument] = useState("");
  const [musicianType, setMusicianType] = useState<"solo" | "group" | "both">(
    "both",
  );

  // Detailed Looking For Slots with Counts
  const [soloSlotsNeeded, setSoloSlotsNeeded] = useState<number>(0);
  const [duoSlotsNeeded, setDuoSlotsNeeded] = useState<number>(0);
  const [bandSlotsNeeded, setBandSlotsNeeded] = useState<number>(0);

    // Requirements for each performer slot
  const [soloSpecificRequirements, setSoloSpecificRequirements] = useState<GigSpecificSlotRequirement[]>([]);
  const [duoSpecificRequirements, setDuoSpecificRequirements] = useState<GigSpecificSlotRequirement[]>([]);
  const [bandSpecificRequirements, setBandSpecificRequirements] = useState<GigSpecificSlotRequirement[]>([]);

  // Anti-spam settings
  const [reapplicationCooldownHours, setReapplicationCooldownHours] = useState<number>(30 * 24);
  const [aiRecommendationSettings, setAiRecommendationSettings] =
    useState<GigRecommendationSettingsValue>(() => ({
      ...DEFAULT_GIG_RECOMMENDATION_SETTINGS,
      criteria: { ...DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria },
    }));

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
        const { data: canCreateAsStaff, error: staffAccessError } = await supabase.rpc(
          'staff_can_create_listing_for_owner',
          { p_entity_type: 'venue', p_owner_id: delegatedOwnerId || null },
        );
        if (profile?.role !== 'staff' || !delegatedOwnerId || staffAccessError || !canCreateAsStaff) {
          showAlert("warning", "Unauthorized", "Only gig owners or full-access staff can create gigs.");
          router.replace("/home");
          return;
        }
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
    const nextEventDate = eventDate.trim() || (isE2EFixtureMode() ? getE2EEventDate() : "");

    if (!nextEventDate) {
      showAlert("warning", "Required Field", "Please select an event date first");
      return;
    }

    if (isPastCalendarDate(nextEventDate)) {
      showAlert("warning", "Invalid Date", "Please select today or a future event date.");
      return;
    }

    if (!eventStartTime || !eventEndTime) {
      showAlert("warning", "Required Field", "Please set both start and end time first");
      return;
    }

    const newCondition: EventSchedule = {
      date: nextEventDate,
      start_time: eventStartTime,
      end_time: eventEndTime,
    };
    if (!eventDate.trim()) setEventDate(nextEventDate);

    const alreadyExists = eventSchedules.some(
      (item) =>
        item.date === newCondition.date &&
        item.start_time === newCondition.start_time &&
        item.end_time === newCondition.end_time,
    );

    if (alreadyExists) {
      showAlert("warning", "Already Added", "This event date and time condition is already in the list.");
      setEventDate("");
      setEventStartTime("06:00 PM");
      setEventEndTime("11:00 PM");
      return;
    }

    setEventSchedules((prev) => [...prev, newCondition]);
    setEventDate("");
    setEventStartTime("06:00 PM");
    setEventEndTime("11:00 PM");
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

    const updateSoloSlotCount = (next: number) => {
    const count = Math.max(0, next);
    setSoloSlotsNeeded(count);
    setSoloSpecificRequirements((current) => normalizeSpecificSlotRequirements(current, count, "solo"));
  };

  const updateDuoSlotCount = (next: number) => {
    const count = Math.max(0, next);
    setDuoSlotsNeeded(count);
    setDuoSpecificRequirements((current) => normalizeSpecificSlotRequirements(current, count, "duo"));
  };

  const updateBandSlotCount = (next: number) => {
    const count = Math.max(0, next);
    setBandSlotsNeeded(count);
    setBandSpecificRequirements((current) => normalizeSpecificSlotRequirements(current, count, "band"));
  };

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
          "Please enter a gig address",
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
      if (schedules.some((schedule) => isPastCalendarDate(schedule.date))) {
        showAlert(
          "warning",
          "Invalid Date",
          "Event dates cannot be yesterday or any past date.",
        );
        return false;
      }
    }
    return true;
  };

  const isCurrentStepComplete =
    step !== 1 ||
    (gigName.trim().length > 0 &&
      description.trim().length > 0 &&
      address.trim().length > 0 &&
      cost.trim().length > 0 &&
      Number.parseFloat(cost) > 0 &&
      images.length > 0 &&
      getNormalizedEventSchedules().length > 0);

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
    else router.replace("/my_venue");
  };

  const createGig = async () => {
    if (creating) return;
    setCreating(true);
    let createdGigId: string | null = null;
    let createdGigOwnerId: string | null = null;

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
      createdGigOwnerId = delegatedOwnerId || session.user.id;

      const orderedImages = images.length > 0 && images[thumbnailIndex]
        ? [images[thumbnailIndex], ...images.filter((_, i) => i !== thumbnailIndex)]
        : images;
      const normalizedSchedules = getNormalizedEventSchedules();
      const primarySchedule = normalizedSchedules[0];
      const normalizedSoloRequirements = normalizeSpecificSlotRequirements(soloSpecificRequirements, soloSlotsNeeded, "solo");
      const normalizedDuoRequirements = normalizeSpecificSlotRequirements(duoSpecificRequirements, duoSlotsNeeded, "duo");
      const normalizedBandRequirements = normalizeSpecificSlotRequirements(bandSpecificRequirements, bandSlotsNeeded, "band");
      const soloAggregate = aggregateSpecificSlotRequirements(normalizedSoloRequirements);
      const duoAggregate = aggregateSpecificSlotRequirements(normalizedDuoRequirements);
      const bandAggregate = aggregateSpecificSlotRequirements(normalizedBandRequirements);
      const preferredGroupTypes = normalizedBandRequirements
        .map((slot) => slot.group_type || "")
        .filter(Boolean);

      const payload = {
        name: gigName,
        description,
        location: address,
        budget: parseFloat(cost) || 0,
        status: "open",
        images: orderedImages,
        contract_url: contractUrl || null,
        latitude,
        longitude,
        event_date: primarySchedule?.date || eventDate,
        reapplication_cooldown_days: reapplicationCooldownHours / 24,
        requirements: {
          genres: requiredGenres,
          instruments: requiredInstruments,
          event_start_time: primarySchedule?.start_time || eventStartTime,
          event_end_time: primarySchedule?.end_time || eventEndTime,
          event_schedules: normalizedSchedules,
          musician_type: musicianType,
          // Detailed slots with counts
          slots: {
            solo: {
              needed: soloSlotsNeeded,
              ...soloAggregate,
              specific_requirements: normalizedSoloRequirements,
            },
            duo: {
              needed: duoSlotsNeeded,
              ...duoAggregate,
              specific_requirements: normalizedDuoRequirements,
            },
            band: {
              needed: bandSlotsNeeded,
              ...bandAggregate,
              preferred_group_types: preferredGroupTypes,
              specific_requirements: normalizedBandRequirements,
            },
          },
          total_slots_needed: soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded,
          ai_recommendation_settings: aiRecommendationSettings,
        },
      };


      // Insert base gig row (3NF-safe)
      const { data, error } = await supabase
        .from('gigs')
        .insert({
          organizer_id: createdGigOwnerId,
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
      createdGigId = data.id;

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

      invalidateListingCaches(session.user.id, ["details", "feed", "home", "search"]);
      setNewGigId(data.id);
      setModalVisible(true);
    } catch (e: any) {
      if (createdGigId && createdGigOwnerId) {
        let rollbackError: any = null;
        if (delegatedOwnerId) {
          const { data: rollbackResult, error } = await supabase.rpc('delete_gig_as_full_access_staff', {
            p_gig_id: createdGigId,
            p_reason: 'Rolled back an incomplete staff-created gig',
          });
          rollbackError = error || (rollbackResult?.success
            ? null
            : new Error(rollbackResult?.message || rollbackResult?.error || 'Staff gig rollback failed'));
        } else {
          const { error } = await supabase
            .from('gigs')
            .delete()
            .eq('id', createdGigId)
            .eq('organizer_id', createdGigOwnerId);
          rollbackError = error;
        }

        if (rollbackError) {
          console.error("Failed to roll back partial gig create", {
            gigId: createdGigId,
            ownerId: createdGigOwnerId,
            message: rollbackError.message,
            code: rollbackError.code,
            details: rollbackError.details,
            hint: rollbackError.hint,
          });
        }
      }
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

  const handleLocationSelectPress = () => {
    if (isE2EFixtureMode()) {
      setAddress("E2E Gig Address");
      setLatitude(14.5995);
      setLongitude(120.9842);
      setAddressVerified(true);
      setAddressVerificationStatus("verified");
      return;
    }

    setLocationPickerVisible(true);
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
            `Your gig address has been verified:\n\n${data.extracted_address}`
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
        "Could not start address verification. You can verify your gig address later from My Gig."
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
          testID={`mobile-add-gig-${normalizeE2ETestId(label)}-input`}
          accessibilityLabel={`mobile-add-gig-${normalizeE2ETestId(label)}-input`}
          value={value}
          onChangeText={setValue}
          maxLength={inputMaxLength}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={keyboardType}
          autoCapitalize={isE2EFixtureMode() ? "none" : "sentences"}
          autoCorrect={!isE2EFixtureMode()}
          style={[
            styles.textInput,
            {
              color: colors.text,
              height: multiline ? 104 : 56,
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
      documentPickerInProgressRef.current = true;
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY,
        base64: false,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets?.[0];
      if (!file) {
        throw new Error("No contract file was selected.");
      }
      const fileName = file.name;
      const fileUri = file.uri;
      const fileSizeBytes = Number(file.size || 0);
      if (!/\.pdf$/i.test(fileName) && file.mimeType?.toLowerCase() !== "application/pdf") {
        showAlert("warning", "PDF Required", "Please select a PDF contract.");
        return;
      }
      if (fileSizeBytes > 20 * 1024 * 1024) {
        showAlert("warning", "File Too Large", "Contract PDFs must be 20 MB or smaller.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        setUploadingContract(false);
        return;
      }

      const safeFileName = sanitizeStorageFileName(fileName, "contract.pdf");
      const filePath = `contracts/${session.user.id}/${Date.now()}_${safeFileName}`;
      const { error } = await uploadStorageObject({
        bucket: "documents",
        path: filePath,
        uri: fileUri,
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
      documentPickerInProgressRef.current = false;
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
        copyToCacheDirectory: DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY,
      });
      documentPickerInProgressRef.current = false;

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
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        setUploadingBusinessPermit(false);
        return;
      }

      const contentType = fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : `image/${fileName.split('.').pop()?.toLowerCase() || 'jpeg'}`;

      const safeFileName = sanitizeStorageFileName(fileName, "business-permit.pdf");
      const filePath = `business-permits/${session.user.id}/${Date.now()}_${safeFileName}`;
      const { error } = await uploadStorageObject({
        bucket: "documents",
        path: filePath,
        uri: fileUri,
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

      const safeFileName = sanitizeStorageFileName(fileName, "business-permit.pdf");
      const filePath = `business-permits/${session.user.id}/${Date.now()}_${safeFileName}`;
      const { error } = await uploadStorageObject({
        bucket: "documents",
        path: filePath,
        body: file,
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

    if (!/\.pdf$/i.test(file.name) && file.type?.toLowerCase() !== "application/pdf") {
      showAlert("warning", "PDF Required", "Please select a PDF contract.");
      event.target.value = "";
      return;
    }
    if (Number(file.size || 0) > 20 * 1024 * 1024) {
      showAlert("warning", "File Too Large", "Contract PDFs must be 20 MB or smaller.");
      event.target.value = "";
      return;
    }

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
      const safeFileName = sanitizeStorageFileName(fileName, "contract.pdf");
      const filePath = `contracts/${session.user.id}/${Date.now()}_${safeFileName}`;
      const { error } = await uploadStorageObject({
        bucket: "documents",
        path: filePath,
        body: file,
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
      <View
        testID="mobile-add-gig-page"
        accessibilityLabel="mobile-add-gig-page"
        style={[styles.flex1, { backgroundColor: colors.background }]}
      >
        <Header title="Create Gig" onBackPress={handleBack} />

        <ScrollView
          ref={formScrollViewRef}
          style={styles.formContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Step indicator */}
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
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                      style={[
                        styles.stepText,
                        {
                          fontFamily: isCurrent
                            ? typography.semibold
                            : typography.medium,
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
                <ImageUploader relatedType="gig" relatedId={newGigId || undefined}
                  enableAiSafetyScreening={false}
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

              {/* Gig Location - Pin on Map */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Gig Address
                </Text>
                <TouchableOpacity
                  activeOpacity={1}
                  testID="mobile-add-gig-location-button"
                  accessibilityLabel="mobile-add-gig-location-button"
                  onPress={handleLocationSelectPress}
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
                      {address || "Tap to select gig location on map"}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* OLD Address Verification Section - Commented Out
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Gig Address
                </Text>
                <Text
                  style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 12 }]}
                >
                  Verify your gig address using a utility bill (Meralco, Maynilad, etc.)
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
                  <TouchableOpacity activeOpacity={addressVerificationLoading ? 1 : 0.78}
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
                              Verify Your Gig Address
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                              Upload a recent utility bill to verify and auto-fill your gig address
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
                "Payout (PHP)",
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
                    current={
                      eventDate && !isPastCalendarDate(eventDate, todayCalendarDate)
                        ? eventDate
                        : todayCalendarDate
                    }
                    minDate={todayCalendarDate}
                    disableAllTouchEventsForDisabledDays
                    markedDates={{
                      [eventDate]: {
                        selected: true,
                        selectedColor: colors.primary,
                        selectedTextColor: "#FFFFFF",
                      },
                    }}
                    onDayPress={(day) => {
                      if (isPastCalendarDate(day.dateString, todayCalendarDate)) return;
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
                      "stylesheet.day.basic": {
                        base: {
                          width: 32,
                          height: 32,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                        selected: {
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          alignSelf: "center",
                        },
                        text: {
                          marginTop: 0,
                          includeFontPadding: false,
                          textAlign: "center",
                          textAlignVertical: "center",
                        },
                      },
                    } as any}
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
                  <View style={styles.timeSlotRow}>
                    <View style={styles.timeSlotGroup}>
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
                      <View style={styles.timeInputRow}>
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
                          <Text style={[styles.ampmBtnText, { color: colors.text }]}>
                            {eventStartTime.split(" ")[1]}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Ionicons
                      name="arrow-forward"
                      size={20}
                      color={colors.textSecondary}
                      style={styles.timeSlotArrow}
                    />
                    <View style={styles.timeSlotGroup}>
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
                      <View style={styles.timeInputRow}>
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
                          <Text style={[styles.ampmBtnText, { color: colors.text }]}>
                            {eventEndTime.split(" ")[1]}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity activeOpacity={1}
                    testID="mobile-add-gig-add-schedule-button"
                    accessibilityLabel="mobile-add-gig-add-schedule-button"
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
                    activeOpacity={uploadingContract ? 1 : 0.78}
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
                          PDF only • Max 20 MB
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
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Default genres (optional)</Text>
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

                <GigPresetDropdown
                  options={GIG_GENRE_OPTIONS}
                  selectedValues={requiredGenres}
                  onSelect={(value) => setRequiredGenres((current) => [...current, value])}
                  placeholder="Choose a genre"
                />

                <View style={[styles.searchInputWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                  <Ionicons name="search" size={20} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    value={genreSearch}
                    onChangeText={setGenreSearch}
                    placeholder="Enter another genre..."
                    placeholderTextColor={colors.textSecondary}
                    onSubmitEditing={() => {
                      const trimmed = genreSearch.trim();
                      if (!trimmed || requiredGenres.some((genre) => genre.toLowerCase() === trimmed.toLowerCase())) return;
                      setRequiredGenres((current) => [...current, trimmed]);
                      setGenreSearch("");
                    }}
                  />
                </View>

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
                  Equipment supplied by organizer (optional)
                </Text>
                <GigPresetDropdown
                  options={GIG_INSTRUMENT_OPTIONS}
                  selectedValues={requiredInstruments}
                  onSelect={(value) => setRequiredInstruments((current) => [...current, value])}
                  placeholder="Choose supplied equipment"
                />
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

              {/* Detailed Slots Configuration */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  How many performers do you need?
                </Text>
                <Text style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 12, fontSize: 12 }]}>
                  Set the number of slots needed in each category.
                </Text>

                <GigSpecificSlotRequirements
                  slotType="solo"
                  count={soloSlotsNeeded}
                  onCountChange={updateSoloSlotCount}
                  value={soloSpecificRequirements}
                  onChange={setSoloSpecificRequirements}
                />
                <GigSpecificSlotRequirements
                  slotType="duo"
                  count={duoSlotsNeeded}
                  onCountChange={updateDuoSlotCount}
                  value={duoSpecificRequirements}
                  onChange={setDuoSpecificRequirements}
                />
                <GigSpecificSlotRequirements
                  slotType="band"
                  count={bandSlotsNeeded}
                  onCountChange={updateBandSlotCount}
                  value={bandSpecificRequirements}
                  onChange={setBandSpecificRequirements}
                />

                {(soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded) > 0 && (
                  <View style={[styles.totalSummary, { backgroundColor: colors.primary + "15", marginTop: 16 }]}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    <Text style={[styles.totalSummaryText, { color: colors.primary }]}>
                      Total slots: {soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded} performer(s) needed
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.inputContainer}>
                <GigRecommendationSettings
                  value={aiRecommendationSettings}
                  onChange={setAiRecommendationSettings}
                />
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
                        {formatGigReapplicationCooldown(reapplicationCooldownHours)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <GigReapplicationCooldownField
                      hours={reapplicationCooldownHours}
                      onChangeHours={setReapplicationCooldownHours}
                      colors={colors}
                      isDark={isDark}
                    />
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
                    Payout: PHP {cost}
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
                  requiredInstruments.length > 0) && (
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
                              Equipment supplied by organizer (optional):
                            </Text>
                            <Text style={{ color: colors.text }}>
                              {requiredInstruments.join(", ")}
                            </Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}

                {/* Slots Summary in Review */}
                {(soloSlotsNeeded + duoSlotsNeeded + bandSlotsNeeded) > 0 && (
                  <>
                    <View style={[styles.divider, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]} />
                    <View>
                      <Text style={styles.reviewLabel}>Looking For</Text>
                      <View style={{ gap: 8 }}>
                        {soloSlotsNeeded > 0 && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <Ionicons name="person" size={16} color="#EC4899" />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>
                              {soloSlotsNeeded} Solo Artist{soloSlotsNeeded > 1 ? "s" : ""}
                            </Text>
                          </View>
                        )}
                        {getSpecificSlotRequirementLines({ specific_requirements: soloSpecificRequirements }).map((requirement) => (
                          <Text key={requirement} style={{ color: colors.text, fontSize: 12, marginLeft: 24 }}>
                            {requirement}
                          </Text>
                        ))}
                        {duoSlotsNeeded > 0 && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <Ionicons name="people" size={16} color="#8B5CF6" />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>
                              {duoSlotsNeeded} Duo{duoSlotsNeeded > 1 ? "s" : ""}
                            </Text>
                          </View>
                        )}
                        {getSpecificSlotRequirementLines({ specific_requirements: duoSpecificRequirements }).map((requirement) => (
                          <Text key={requirement} style={{ color: colors.text, fontSize: 12, marginLeft: 24 }}>
                            {requirement}
                          </Text>
                        ))}
                        {bandSlotsNeeded > 0 && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <Ionicons name="people-circle" size={16} color="#3B82F6" />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>
                              {bandSlotsNeeded} Group{bandSlotsNeeded > 1 ? "s" : ""}
                            </Text>
                          </View>
                        )}
                        {getSpecificSlotRequirementLines({ specific_requirements: bandSpecificRequirements }).map((requirement) => (
                          <Text key={requirement} style={{ color: colors.text, fontSize: 12, marginLeft: 24 }}>
                            {requirement}
                          </Text>
                        ))}
                      </View>
                    </View>
                  </>
                )}
              </View>

              <Text style={styles.termsText}>
                By tapping Create Gig, you agree to our Terms and Conditions.
              </Text>
            </View>
          )}

          {/* Navigation Buttons */}
          <View style={[styles.navigationButtons, styles.navigationButtonRow]}>
              <TouchableOpacity
                testID="mobile-add-gig-back-button"
                accessibilityLabel="mobile-add-gig-back-button"
                onPress={handleBack}
              disabled={creating}
              activeOpacity={creating ? 1 : 0.78}
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
                testID="mobile-add-gig-next-button"
                accessibilityLabel="mobile-add-gig-next-button"
                onPress={handleNext}
              disabled={creating || !isCurrentStepComplete}
              activeOpacity={creating || !isCurrentStepComplete ? 1 : 0.78}
              style={[
                styles.nextBtn,
                {
                  flex: 1,
                  backgroundColor: isCurrentStepComplete ? colors.primary : colors.border,
                  shadowColor: colors.primary,
                  opacity: creating || !isCurrentStepComplete ? 0.6 : 1,
                },
              ]}
            >
              {creating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.nextBtnText, { color: isCurrentStepComplete ? "#FFFFFF" : colors.textSecondary }]}>
                  {step === 3 ? "Create Gig" : "Next"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

      </View>

      <Modal
        visible={modalVisible}
        title="Success!"
        message={`Gig "${gigName}" has been successfully posted!`}
        buttonText="Go to Gig"
        onClose={handleSuccessRedirect}
        showCancelButton={false}
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
                Verify Gig Address
              </Text>
              <TouchableOpacity activeOpacity={1} onPress={skipAddressVerification} style={styles.skipButton}>
                <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>Skip for now</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.verificationInfoBanner, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="information-circle" size={20} color={colors.primary} />
              <Text style={[styles.verificationInfoText, { color: colors.text }]}>
                Upload a recent utility bill (Meralco, Maynilad, etc.) to verify your gig address. The name on the bill should match your verified identity.
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
    marginHorizontal: -24,
    marginTop: 0,
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
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
    height: 3,
    top: 16,
    zIndex: 0,
  },
  activeProgressLine: {
    position: "absolute",
    left: 0,
    height: 3,
    top: 16,
    zIndex: 0,
  },
  stepItem: {
    alignItems: "center",
    zIndex: 10,
    flex: 1,
    minWidth: 0,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  stepText: {
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 15,
    includeFontPadding: false,
    width: "100%",
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 0,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 22,
    marginBottom: 18,
    textAlign: "left",
    fontFamily: typography.title,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    marginBottom: 10,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: typography.bold,
  },
  inputWrapper: {
    borderRadius: radius.input,
    borderWidth: 1,
    overflow: "hidden",
  },
  textInput: {
    padding: 16,
    fontFamily: typography.body,
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
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    paddingHorizontal: 16,
    marginTop: 8,
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
  navigationButtonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
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
    height: 44,
    minWidth: 74,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  ampmBtn: {
    width: 52,
    height: 44,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  ampmBtnText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
    includeFontPadding: false,
  },
  timeSlotRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  timeSlotGroup: {
    flex: 1,
    minWidth: 130,
  },
  timeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeSlotArrow: {
    marginBottom: 12,
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
  ...wizardFormStyles,
});

