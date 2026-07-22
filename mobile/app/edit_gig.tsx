import { Ionicons } from "@expo/vector-icons";
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
import GigRecommendationSettings, {
  DEFAULT_GIG_RECOMMENDATION_SETTINGS,
  normalizeGigRecommendationSettings,
  type GigRecommendationSettingsValue,
} from "../src/components/GigRecommendationSettings";
import GigPresetDropdown, {
  GIG_GENRE_OPTIONS,
  GIG_INSTRUMENT_OPTIONS,
  GIG_ROLE_OPTIONS,
} from "../src/components/GigPresetDropdown";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { PH_MUSIC_GROUP_TYPES } from "../src/constants/groupTypes";
import { useTheme } from "../src/context/ThemeContext";
import { sanitizeStorageFileName, uploadStorageObject } from "../src/utils/storageUpload";

import { useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { fetchActiveStaffAssignment, getStaffPermissions } from "../src/utils/staffAccess";

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

type EventSchedule = {
  date: string;
  start_time: string;
  end_time: string;
};

const DATE_ONLY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
const DISPLAY_TIME_PATTERN = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const DATABASE_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

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

const toDisplayTimeString = (value: unknown): string => {
  if (!value) return "";

  const raw = String(value).trim();
  const displayMatch = raw.match(DISPLAY_TIME_PATTERN);
  if (displayMatch) {
    return `${displayMatch[1].padStart(2, "0")}:${displayMatch[2]} ${displayMatch[3].toUpperCase()}`;
  }

  const databaseMatch = raw.match(DATABASE_TIME_PATTERN);
  if (!databaseMatch) return raw;

  const hour24 = Number(databaseMatch[1]);
  const minute = databaseMatch[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return raw;

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${minute} ${period}`;
};

const normalizeEventSchedules = (items: any[]): EventSchedule[] =>
  items
    .map((item: any) => ({
      date: toCalendarDateString(item?.date ?? item?.slot_date),
      start_time: toDisplayTimeString(item?.start_time ?? item?.start),
      end_time: toDisplayTimeString(item?.end_time ?? item?.end),
    }))
    .filter((item) => item.date && item.start_time && item.end_time);

export default function EditGigScreen() {
  const { colors, isDark } = useTheme();
  const todayCalendarDate = getLocalCalendarDate();
  const { id, reapply, focusSection } = useLocalSearchParams<{
    id?: string | string[];
    reapply?: string | string[];
    returnTab?: string | string[];
    focusSection?: string | string[];
  }>();
  const focusSectionParam = Array.isArray(focusSection) ? focusSection[0] : focusSection;
  const editScrollRef = useRef<ScrollView>(null);
  const focusedAiSectionRef = useRef(false);
  const [aiSectionY, setAiSectionY] = useState(0);
  const returnTab = useLocalSearchParams<{
    returnTab?: string | string[];
  }>().returnTab;
  const returnTabParam = Array.isArray(returnTab) ? returnTab[0] : returnTab;
  const normalizedReturnTab = ["About", "Applicants", "Review"].includes(returnTabParam || "")
    ? returnTabParam || "About"
    : "About";
  const reapplyParam = Array.isArray(reapply) ? reapply[0] : reapply;
  const isReapplyRequested =
    reapplyParam === "1" || reapplyParam === "true";

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

  useEffect(() => {
    if (focusSectionParam !== "ai" || loading || aiSectionY <= 0 || focusedAiSectionRef.current) return;
    focusedAiSectionRef.current = true;
    const timer = setTimeout(() => editScrollRef.current?.scrollTo({ y: Math.max(0, aiSectionY - 20), animated: true }), 120);
    return () => clearTimeout(timer);
  }, [aiSectionY, focusSectionParam, loading]);

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

  const handleReturnToTabs = useCallback(() => {
    const gigId = Array.isArray(id) ? id[0] : id;
    if (gigId) {
      router.replace({
        pathname: "/manage_gig",
        params: { id: gigId, tab: normalizedReturnTab },
      });
      return;
    }

    router.replace("/my_venue");
  }, [id, normalizedReturnTab]);

  const handleAttemptLeave = useCallback(() => {
    if (saving) return;

    showAlert(
      "warning",
      "Leave edit gig?",
      "Your current edits won't be saved unless you tap Save Changes.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: handleReturnToTabs },
      ],
    );
  }, [handleReturnToTabs, saving]);

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
  const [newGroupType, setNewGroupType] = useState("");

  // Anti-spam settings
  const [reapplicationCooldownDays, setReapplicationCooldownDays] = useState<number>(30);
  const [aiRecommendationSettings, setAiRecommendationSettings] =
    useState<GigRecommendationSettingsValue>(() => ({
      ...DEFAULT_GIG_RECOMMENDATION_SETTINGS,
      criteria: { ...DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria },
    }));

  // Contract state
  const [contractUrl, setContractUrl] = useState<string>("");
  const [contractFileName, setContractFileName] = useState<string>("");
  const [uploadingContract, setUploadingContract] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Business Permit state
  const [businessPermitUrl, setBusinessPermitUrl] = useState<string>("");
  const [initialBusinessPermitUrl, setInitialBusinessPermitUrl] = useState<string>("");
  const [businessPermitFileName, setBusinessPermitFileName] = useState<string>("");
  const [uploadingBusinessPermit, setUploadingBusinessPermit] = useState(false);
  const businessPermitInputRef = useRef<HTMLInputElement>(null);
  const [permitStatus, setPermitStatus] = useState<string>("pending_review");
  const [permitRejectionReason, setPermitRejectionReason] = useState<string>("");
  const [permitResubmissionsUsed, setPermitResubmissionsUsed] = useState(0);
  const hasPermitResubmissionRemaining = permitResubmissionsUsed < 1;
  const canReapplyPermit =
    permitStatus === "rejected" && hasPermitResubmissionRemaining;

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

    if (isPastCalendarDate(eventDate)) {
      showAlert("warning", "Invalid Date", "Please select today or a future event date.");
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

      const gigId = Array.isArray(id) ? id[0] : id;
      if (!gigId) {
        showAlert("error", "Error", "Invalid gig ID");
        router.replace("/home");
        return;
      }

      const isVenueOwner = profile?.role === "venue-owner";
      let canEditGig = false;

      if (isVenueOwner) {
        const { data: ownedGig, error: ownedGigError } = await supabase
          .from("gigs")
          .select("id")
          .eq("id", gigId)
          .eq("organizer_id", user.id)
          .maybeSingle();

        if (ownedGigError) throw ownedGigError;
        canEditGig = !!ownedGig?.id;
      }

      if (!canEditGig && profile?.role === "staff") {
        const assignment = await fetchActiveStaffAssignment(supabase, user.id);
        const permissions = getStaffPermissions(assignment?.access_level);
        canEditGig =
          assignment?.entity_type === "venue" &&
          assignment.gig_id === gigId &&
          permissions.canEditListing;
      }

      if (!canEditGig) {
        showAlert("warning", "Unauthorized", "Only the gig owner or assigned Level 1 staff can edit this gig.");
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

  useEffect(() => {
    if (bandSlotsNeeded !== preferredGroupTypes.length) {
      setBandSlotsNeeded(preferredGroupTypes.length);
    }
  }, [preferredGroupTypes, bandSlotsNeeded]);

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
        showAlert("warning", "Invalid Gig", "Invalid gig ID. Please try again.");
        router.replace("/home");
        return;
      }

      // Base query + normalized child tables merge
      const { data: baseData, error: baseError } = await supabase
        .from('gigs')
        .select('*')
        .eq('id', gigId)
        .single();

      const [
        { data: requirementRows, error: requirementsError },
        { data: mediaRows, error: mediaError },
        { data: availabilityRows, error: availabilityError },
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
        supabase
          .from('gig_availability_slots')
          .select('slot_date, start_time, end_time, is_available, created_at')
          .eq('gig_id', gigId)
          .order('slot_date', { ascending: true })
          .order('start_time', { ascending: true }),
      ]);


      if (baseError) throw baseError;
      if (requirementsError) throw requirementsError;
      if (mediaError) throw mediaError;
      if (availabilityError) throw availabilityError;

      if (!baseData) {
        showAlert(
          "warning",
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
          "warning",
          "Not Found",
          "Gig not found or you do not have permission to edit it.",
        );
        router.replace("/home");
        return;
      }



      setGigName(data.name);

      setDescription(data.description);

      setAddress(data.location);

      setLatitude(data.latitude === null || data.latitude === undefined ? null : Number(data.latitude));
      setLongitude(data.longitude === null || data.longitude === undefined ? null : Number(data.longitude));
      setCost(data.budget?.toString() || "");

      const schedulesFromRequirements = normalizeEventSchedules(
        Array.isArray(data.requirements?.event_schedules)
          ? data.requirements.event_schedules
          : [],
      );
      const schedulesFromAvailability = normalizeEventSchedules(
        (availabilityRows || []).filter((item: any) => item?.is_available !== false),
      );
      const fallbackDate = toCalendarDateString(data.event_date);
      const fallbackStart =
        toDisplayTimeString(data.requirements?.event_start_time) || "06:00 PM";
      const fallbackEnd =
        toDisplayTimeString(data.requirements?.event_end_time) || "11:00 PM";
      let resolvedSchedules =
        schedulesFromRequirements.length > 0
          ? schedulesFromRequirements
          : schedulesFromAvailability;

      if (fallbackDate) {
        if (resolvedSchedules.length === 0) {
          resolvedSchedules = [
            {
              date: fallbackDate,
              start_time: fallbackStart,
              end_time: fallbackEnd,
            },
          ];
        } else if (resolvedSchedules[0].date !== fallbackDate) {
          resolvedSchedules = [
            {
              ...resolvedSchedules[0],
              date: fallbackDate,
              start_time: resolvedSchedules[0].start_time || fallbackStart,
              end_time: resolvedSchedules[0].end_time || fallbackEnd,
            },
            ...resolvedSchedules
              .slice(1)
              .filter((schedule) => schedule.date !== fallbackDate),
          ];
        }
      }

      if (resolvedSchedules.length > 0) {
        setEventSchedules(resolvedSchedules);
        setEventDate(resolvedSchedules[0].date);
        setEventStartTime(resolvedSchedules[0].start_time);
        setEventEndTime(resolvedSchedules[0].end_time);
      } else {
        setEventDate("");
        setEventStartTime(fallbackStart);
        setEventEndTime(fallbackEnd);
        setEventSchedules([]);
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
      // Load detailed slot data
      const slots = data.requirements?.slots;
      if (slots) {
        setSoloSlotsNeeded(slots.solo?.needed || 0);
        setSoloRolesNeeded(Array.isArray(slots.solo?.roles) ? slots.solo.roles : []);
        setSoloPreferredGenres(Array.isArray(slots.solo?.preferred_genres) ? slots.solo.preferred_genres : []);
        setSoloPreferredInstruments(Array.isArray(slots.solo?.preferred_instruments) ? slots.solo.preferred_instruments : []);
        setDuoSlotsNeeded(slots.duo?.needed || 0);
        setDuoRolesNeeded(Array.isArray(slots.duo?.roles) ? slots.duo.roles : []);
        setDuoPreferredGenres(Array.isArray(slots.duo?.preferred_genres) ? slots.duo.preferred_genres : []);
        setDuoPreferredInstruments(Array.isArray(slots.duo?.preferred_instruments) ? slots.duo.preferred_instruments : []);
        setBandSlotsNeeded(slots.band?.needed || 0);
        setBandRolesNeeded(Array.isArray(slots.band?.roles) ? slots.band.roles : []);
        setPreferredGroupTypes(Array.isArray(slots.band?.preferred_group_types) ? slots.band.preferred_group_types : []);
        setBandPreferredGenres(Array.isArray(slots.band?.preferred_genres) ? slots.band.preferred_genres : []);
        setBandPreferredInstruments(Array.isArray(slots.band?.preferred_instruments) ? slots.band.preferred_instruments : []);
      }

      // Load anti-spam settings
      setReapplicationCooldownDays(data.reapplication_cooldown_days ?? 30);
      setAiRecommendationSettings(
        normalizeGigRecommendationSettings(data.requirements?.ai_recommendation_settings),
      );

      setContractUrl(data.contract_url || "");
      if (data.contract_url) {
        const fileName = data.contract_url.split("/").pop() || "Contract.pdf";
        setContractFileName(decodeURIComponent(fileName));
      }
      setBusinessPermitUrl(data.business_permit_url || "");
      setInitialBusinessPermitUrl(data.business_permit_url || "");
      setPermitStatus(String(data.permit_status || "pending_review").toLowerCase());
      setPermitRejectionReason(data.permit_rejection_reason || "");
      setPermitResubmissionsUsed(Number(data.permit_resubmissions_used || 0));
      if (data.business_permit_url) {
        const fileName = data.business_permit_url.split("/").pop() || "BusinessPermit.pdf";
        setBusinessPermitFileName(decodeURIComponent(fileName));
      }
      setImages(data.images || []);

      if (data.images && data.images.length > 0) {
        setThumbnailIndex(0);
      }

    } catch (e) {
      showAlert("warning", "Couldn't Load Details", "Failed to load gig details.");
      router.replace("/home");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
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
    return true;
  };

  const isFormComplete =
    gigName.trim().length > 0 &&
    description.trim().length > 0 &&
    address.trim().length > 0 &&
    cost.trim().length > 0 &&
    Number.parseFloat(cost) > 0 &&
    images.length > 0 &&
    getNormalizedEventSchedules().length > 0;

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
        showAlert("warning", "Invalid Gig", "Invalid gig ID. Please try again.");
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
          ai_recommendation_settings: aiRecommendationSettings,
        },
      };


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


      if (updateError) {
        console.error('❌ Update failed with error:', updateError);

        let alertMessage = `Failed to update gig: ${updateError.message}`;
        if (updateError.hint) alertMessage += `\n\nHint: ${updateError.hint}`;
        if (updateError.details) alertMessage += `\n\nDetails: ${updateError.details}`;

        showAlert("warning", "Couldn't Save Gig", alertMessage);
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

      const shouldResetPermitReview =
        !!businessPermitUrl &&
        businessPermitUrl !== initialBusinessPermitUrl;

      const isReapplyAction =
        isReapplyRequested && canReapplyPermit;
      const reapplyLimitReached =
        permitStatus === "rejected" &&
        (shouldResetPermitReview || isReapplyRequested) &&
        !hasPermitResubmissionRemaining;

      if ((shouldResetPermitReview || isReapplyAction) && !reapplyLimitReached) {
        const nextPermitStatus =
          isReapplyAction || permitStatus === "rejected"
            ? "resubmitted"
            : "pending_review";

        const { error: permitStatusError } = await supabase
          .from("gigs")
          .update({
            permit_status: nextPermitStatus,
            permit_rejection_reason: null,
            permit_admin_notes: null,
            permit_reviewed_by: null,
            permit_reviewed_at: null,
          })
          .eq("id", gigId);

        if (permitStatusError) {
          throw new Error(`Failed to update permit status: ${permitStatusError.message}`);
        }

        setPermitStatus(nextPermitStatus);
        setPermitRejectionReason("");
        if (nextPermitStatus === "resubmitted") {
          setPermitResubmissionsUsed(1);
        }
      }

      const reconfirmRequired = Number(rpcResult?.reconfirmation?.required_count || 0);
      const systemRejectedPending = Number(rpcResult?.system_rejected_pending_count || 0);
      const softClosed = Boolean(rpcResult?.soft_closed);
      const softClosedRejected = Number(rpcResult?.soft_closed_rejected_count || 0);

      let successMessage =
        isReapplyAction
          ? 'Gig updated and permit resubmitted for permit review.'
          : 'Gig updated successfully!';
      const updateNotes: string[] = [];

      if (reconfirmRequired > 0) {
        const hours = Number(rpcResult?.reconfirmation?.window_hours || 24);
        updateNotes.push(`${reconfirmRequired} accepted applicant(s) moved to reconfirmation with a ${hours}-hour response window.`);
      }

      if (systemRejectedPending > 0) {
        updateNotes.push(`${systemRejectedPending} pending applicant(s) were system-closed because requirements changed.`);
      }

      if (softClosed) {
        updateNotes.push('Gig was soft-closed because accepted/approved applicants now fill all available slots.');
        if (softClosedRejected > 0) {
          updateNotes.push(`${softClosedRejected} pending applicant(s) were notified that slots are full.`);
        }
      }

      if (reapplyLimitReached) {
        updateNotes.push('Permit remains rejected because the one allowed resubmission after decline was already used.');
      }

      if (updateNotes.length > 0) {
        successMessage += `\n\n${updateNotes.join('\n')}`;
      }

      showAlert("success", "Success", successMessage, [
        {
          text: "OK",
          onPress: () => {
            handleReturnToTabs();
          },
        },
      ]);
    } catch (e: any) {
      console.error("❌ Error updating gig:", e);
      showAlert(
        "warning",
        "Couldn't Save Gig",
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

    const isReapplyAction = isReapplyRequested && canReapplyPermit;
    const reapplyLimitReached =
      permitStatus === "rejected" &&
      isReapplyRequested &&
      !hasPermitResubmissionRemaining;

    showAlert(
      "warning",
      isReapplyAction ? "Save & Reapply" : "Save Changes",
      reapplyLimitReached
        ? "Save your updates now? Permit resubmission is no longer available because the one allowed retry was already used."
        : isReapplyAction
        ? "Save your updates and resubmit this gig permit for permit review?"
        : "Are you sure you want to update this gig profile?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isReapplyAction ? "Save & Reapply" : "Save & Update",
          style: "default",
          onPress: () => performSave(),
        },
      ],
    );
  };

  const renderSectionHeader = (
    title: string,
    icon: string,
    isFirstSection = false,
  ) => (
    <View style={[styles.sectionHeader, isFirstSection && styles.firstSectionHeader]}>
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
            borderColor: isDark ? "#374151" : "#E5E7EB",
            backgroundColor: colors.inputBackground,
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
          keyboardType={numeric ? "numeric" : "default"}
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
      showAlert(
        "warning",
        "Upload Failed",
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
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Edit Gig" onBackPress={handleAttemptLeave} />

        <ScrollView
          ref={editScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.flex1}
        >
          {renderSectionHeader("Basic Details", "information-circle", true)}
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
                style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}
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
                  <GigPresetDropdown options={[...GIG_ROLE_OPTIONS, ...GIG_INSTRUMENT_OPTIONS]} selectedValues={soloRolesNeeded} onSelect={(value) => setSoloRolesNeeded((current) => [...current, value])} placeholder="Choose a role or instrument" />
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
                    Genres (optional):
                  </Text>
                  <GigPresetDropdown options={GIG_GENRE_OPTIONS} selectedValues={soloPreferredGenres} onSelect={(value) => setSoloPreferredGenres((current) => [...current, value])} placeholder="Choose a genre" />
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
                    Instruments (optional):
                  </Text>
                  <GigPresetDropdown options={GIG_INSTRUMENT_OPTIONS} selectedValues={soloPreferredInstruments} onSelect={(value) => setSoloPreferredInstruments((current) => [...current, value])} placeholder="Choose an instrument" />
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
                  <GigPresetDropdown options={[...GIG_ROLE_OPTIONS, ...GIG_INSTRUMENT_OPTIONS]} selectedValues={duoRolesNeeded} onSelect={(value) => setDuoRolesNeeded((current) => [...current, value])} placeholder="Choose a role or instrument" />
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
                    Genres (optional):
                  </Text>
                  <GigPresetDropdown options={GIG_GENRE_OPTIONS} selectedValues={duoPreferredGenres} onSelect={(value) => setDuoPreferredGenres((current) => [...current, value])} placeholder="Choose a genre" />
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
                    Instruments (optional):
                  </Text>
                  <GigPresetDropdown options={GIG_INSTRUMENT_OPTIONS} selectedValues={duoPreferredInstruments} onSelect={(value) => setDuoPreferredInstruments((current) => [...current, value])} placeholder="Choose an instrument" />
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
                  <Text style={[styles.slotTitle, { color: colors.text }]}>Group Type</Text>
                </View>
                <Text style={[styles.counterValue, { color: colors.text }]}>{bandSlotsNeeded}</Text>
              </View>
              <View style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Poppins_400Regular", marginBottom: 12 }}>
                    Tap a group type to add needed count.
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "Poppins_400Regular", marginBottom: 12 }}>
                    Tap + to add. Use the remove icon on selected types to reduce by 1.
                  </Text>
                  <GigPresetDropdown options={PH_MUSIC_GROUP_TYPES.map((type) => ({ label: type.label, value: type.id }))} selectedValues={preferredGroupTypes} onSelect={(value) => setPreferredGroupTypes((current) => [...current, value])} placeholder="Choose a group type" allowDuplicates />
                  <View style={[styles.addMemberRow, { marginTop: 8, marginBottom: 12 }]}>
                    <View style={[styles.inputWrapper, styles.flex1, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
                      <TextInput value={newGroupType} onChangeText={setNewGroupType} placeholder="Enter another group type..." placeholderTextColor={colors.textSecondary} style={[styles.textInput, { color: colors.text }]} />
                    </View>
                    <TouchableOpacity onPress={() => { const trimmed = newGroupType.trim(); if (!trimmed) return; setPreferredGroupTypes((current) => [...current, trimmed]); setNewGroupType(""); }} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                      <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
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

                  {preferredGroupTypes
                    .filter((value, index, values) => !PH_MUSIC_GROUP_TYPES.some((type) => type.id === value) && values.indexOf(value) === index)
                    .map((value) => (
                      <TouchableOpacity key={value} onPress={() => setPreferredGroupTypes((current) => { const index = current.lastIndexOf(value); return current.filter((_, itemIndex) => itemIndex !== index); })} style={[styles.chip, { alignSelf: "flex-start", backgroundColor: "rgba(59, 130, 246, 0.2)", marginBottom: 8 }]}>
                        <Text style={[styles.chipText, { color: "#3B82F6" }]}>{value} ({preferredGroupTypes.filter((item) => item === value).length})</Text>
                        <Ionicons name="close-circle" size={16} color="#3B82F6" />
                      </TouchableOpacity>
                    ))}

                  <Text style={[styles.slotSubLabel, { color: colors.textSecondary, marginTop: 16 }]}>
                    Any other specific requirements/genres (optional):
                  </Text>
                  <GigPresetDropdown options={[...GIG_ROLE_OPTIONS, ...GIG_INSTRUMENT_OPTIONS, ...GIG_GENRE_OPTIONS]} selectedValues={bandRolesNeeded} onSelect={(value) => setBandRolesNeeded((current) => [...current, value])} placeholder="Choose a requirement" />
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
                    Genres (optional):
                  </Text>
                  <GigPresetDropdown options={GIG_GENRE_OPTIONS} selectedValues={bandPreferredGenres} onSelect={(value) => setBandPreferredGenres((current) => [...current, value])} placeholder="Choose a genre" />
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
                    Instruments (optional):
                  </Text>
                  <GigPresetDropdown options={GIG_INSTRUMENT_OPTIONS} selectedValues={bandPreferredInstruments} onSelect={(value) => setBandPreferredInstruments((current) => [...current, value])} placeholder="Choose an instrument" />
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

          <View style={styles.inputContainer} onLayout={(event) => setAiSectionY(event.nativeEvent.layout.y)}>
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
              Default genres (optional)
            </Text>
            <GigPresetDropdown options={GIG_GENRE_OPTIONS} selectedValues={requiredGenres} onSelect={(value) => setRequiredGenres((current) => [...current, value])} placeholder="Choose a genre" />
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
              Equipment supplied by organizer (optional)
            </Text>
            <GigPresetDropdown options={GIG_INSTRUMENT_OPTIONS} selectedValues={requiredInstruments} onSelect={(value) => setRequiredInstruments((current) => [...current, value])} placeholder="Choose supplied equipment" />
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
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: saving
                    ? colors.textSecondary
                    : isFormComplete
                      ? colors.primary
                      : colors.border,
                  opacity: saving || !isFormComplete ? 0.6 : 1,
                  shadowColor: colors.primary,
                },
              ]}
              onPress={handleSave}
              disabled={saving || !isFormComplete}
              activeOpacity={saving || !isFormComplete ? 1 : 0.78}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.saveButtonText, { color: isFormComplete ? "#FFFFFF" : colors.textSecondary }]}>
                  {isReapplyRequested && canReapplyPermit
                    ? "Save & Reapply"
                    : "Save Changes"}
                </Text>
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
          latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : undefined
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
    marginTop: 24,
    marginBottom: 16,
  },
  firstSectionHeader: {
    marginTop: 0,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
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
  rejectionNotice: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  rejectionNoticeTitle: {
    color: "#B91C1C",
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
  },
  rejectionNoticeText: {
    marginTop: 4,
    color: "#DC2626",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Poppins_500Medium",
  },
  rejectionNoticeReason: {
    marginTop: 6,
    color: "#DC2626",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Poppins_600SemiBold",
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
  textInput: {
    padding: 16,
    fontFamily: "Poppins_400Regular",
    textAlignVertical: "center",
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
