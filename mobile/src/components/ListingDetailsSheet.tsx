import { Ionicons } from "@expo/vector-icons";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    useBottomSheetSpringConfigs,
} from "@gorhom/bottom-sheet";
import * as ExpoLinking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import React, {
    forwardRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import {
    ActivityIndicator,
    BackHandler,
    Dimensions,
    InteractionManager,
    Linking,
    Modal as RNModal,
    ScrollView,
    Share,
    StyleSheet,
    Text,
  TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useBottomOverlayVisibility } from "../context/BottomOverlayContext";
import { useTheme } from "../context/ThemeContext";
import { useApplicationSubmissionAction } from "../hooks/useApplicationSubmissionAction";
import { useBottomBarClearance } from "../hooks/useBottomBarClearance";
import { useBookingRequestAction } from "../hooks/useBookingRequestAction";
import { useCurrentUserVenueRole } from "../hooks/useCurrentUserVenueRole";
import { useListingSheetDerived } from "../hooks/useListingSheetDerived";
import { useListingSheetEffects } from "../hooks/useListingSheetEffects";
import { useProfileCompletion } from "../hooks/useProfileCompletion";
import { emitFavoriteChanged } from "../utils/favoriteEvents";
import { submitListingRequest, uploadListingRequestDocument } from "../utils/listingRequests";
import {
  clearListingDetailsRequestInFlight,
  getListingDetailsCacheEntry,
  hasListingDetailsRequestInFlight,
  LISTING_DETAILS_CACHE_TTL_MS,
  markListingDetailsRequestInFlight,
  setListingDetailsCacheEntry,
} from "../utils/listingDetailsCache";
import { usePageLoadLogger } from "../utils/loadTimeLogger";
import { bottomSheetSpringConfig } from "../utils/motion";
import { isFanUserRole } from "../utils/roleRouting";
import { getSmoothTabIndex, setSmoothTab } from "../utils/smoothTabs";
import { fetchActiveStaffAssignment, getStaffPermissions } from "../utils/staffAccess";
import CustomAlert from "./CustomAlert";
import DocumentUploader from "./DocumentUploader";
import ReportModal from "./ReportModal";
import SlidingTabBar from "./SlidingTabBar";
import VideoUploader from "./VideoUploader";
import BookingControls from "./listingDetails/BookingControls";
import GigApplyTab from "./listingDetails/GigApplyTab";
import GigInfoTab from "./listingDetails/GigInfoTab";
import GroupAboutTab from "./listingDetails/GroupAboutTab";
import GroupConnectTab from "./listingDetails/GroupConnectTab";
import GroupSetupTab from "./listingDetails/GroupSetupTab";
import GroupTimelineTab from "./listingDetails/GroupTimelineTab";
import ListingContentBody from "./listingDetails/ListingContentBody";
import ListingHeroSection from "./listingDetails/ListingHeroSection";
import ReviewsTab from "./listingDetails/ReviewsTab";
import StudioBookTab from "./listingDetails/StudioBookTab";
import StudioGigVenueAboutTab from "./listingDetails/StudioGigVenueAboutTab";
import StudioSetupTab from "./listingDetails/StudioSetupTab";
import { isRecordingStudioMode, normalizeStudioType } from "./listingDetails/availability";
import Modal from "./modal";
import TrackedBottomSheetModal from "./TrackedBottomSheetModal";

const debugLog = (..._args: unknown[]) => { };

const { width, height } = Dimensions.get("window");
const IMG_HEIGHT = height < 700 ? height * 0.3 : height * 0.35;

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scale = (size: number) => {
  const newSize = (width / 375) * size;
  return Math.max(newSize, size * 0.85);
};
const verticalScale = (size: number) => {
  const baseHeight = 812;
  const ratio = height / baseHeight;
  const clampedRatio = Math.max(0.8, Math.min(1.2, ratio));
  return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

interface ListingDetailsSheetProps {
  initialListing?: any | null;
  listingId: string | null;
  onDismiss?: () => void;
}

type ConfirmationSummaryItem = {
  label: string;
  value: string | number | null | undefined;
  icon?: keyof typeof Ionicons.glyphMap;
};

const formatTime12 = (time24: string) => {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":");
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${suffix}`;
};

const toLocalDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type ScheduleSessionType = "rehearsal" | "recording" | "both";

const normalizeScheduleSessionType = (
  value: unknown,
  fallback: ScheduleSessionType = "both",
): ScheduleSessionType => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "rehearsal" ||
    normalized === "recording" ||
    normalized === "both"
  ) {
    return normalized;
  }
  return fallback;
};

const parseScheduleSessionType = (
  reason: unknown,
  fallback: ScheduleSessionType = "both",
): ScheduleSessionType => {
  const match = String(reason || "").match(/session_type:(rehearsal|recording|both)/i);
  return match ? normalizeScheduleSessionType(match[1], fallback) : fallback;
};

const getRequestedScheduleSessionType = (
  studioType?: string | null,
  selectedSessionType?: "Rehearsal" | "Recording" | null,
): ScheduleSessionType | null => {
  if (selectedSessionType === "Rehearsal") return "rehearsal";
  if (selectedSessionType === "Recording") return "recording";

  const normalizedStudioType = normalizeStudioType(studioType);
  if (normalizedStudioType === "Rehearsal") return "rehearsal";
  if (normalizedStudioType === "Recording") return "recording";
  return null;
};

const getScheduleSessionType = (schedule: any): ScheduleSessionType =>
  normalizeScheduleSessionType(
    schedule?.sessionType ?? schedule?.session_type,
    parseScheduleSessionType(schedule?.reason, "both"),
  );

const scheduleAllowsRequestedSession = (
  schedule: any,
  studioType?: string | null,
  selectedSessionType?: "Rehearsal" | "Recording" | null,
) => {
  const requestedSessionType = getRequestedScheduleSessionType(
    studioType,
    selectedSessionType,
  );
  if (!requestedSessionType) return true;

  const scheduleSessionType = getScheduleSessionType(schedule);
  return scheduleSessionType === "both" || scheduleSessionType === requestedSessionType;
};

const getDateOverrideSchedule = (
  dateStr: string,
  date: Date,
  dateOverrides?: any[],
  studioType?: string | null,
  selectedSessionType?: "Rehearsal" | "Recording" | null,
) => {
  if (!Array.isArray(dateOverrides)) {
    return undefined;
  }

  const rows = dateOverrides.filter((override) => override?.override_date === dateStr);
  if (rows.length === 0) {
    return undefined;
  }

  const openRows = rows
    .filter((override) => override?.is_open && override?.open_time && override?.close_time)
    .filter((override) =>
      scheduleAllowsRequestedSession(override, studioType, selectedSessionType),
    )
    .sort((a, b) => {
      const orderDiff = Number(a?.slot_order ?? 0) - Number(b?.slot_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a?.open_time || "").localeCompare(String(b?.open_time || ""));
    });

  if (openRows.length === 0) {
    return null;
  }

  return {
    day: date.toLocaleDateString("en-US", { weekday: "long" }),
    slots: openRows.map((override) => ({
      start: override.open_time,
      end: override.close_time,
      sessionType: getScheduleSessionType(override),
    })),
    isOverride: true,
  };
};

const weeklyScheduleAllowsDate = (
  settings: any,
  dateStr: string,
  daySchedule?: any,
): boolean => {
  const scope =
    daySchedule?.weekly_schedule_scope ??
    daySchedule?.weeklyScheduleScope ??
    settings?.weekly_schedule_scope ??
    "indefinite";
  if (scope === "until") {
    const endDate =
      daySchedule?.weekly_schedule_end_date ??
      daySchedule?.weeklyScheduleEndDate ??
      settings?.weekly_schedule_end_date;
    return typeof endDate === "string" && endDate.length > 0
      ? dateStr <= endDate
      : true;
  }

  if (scope === "specific_dates") {
    const dates =
      daySchedule?.weekly_schedule_dates ??
      daySchedule?.weeklyScheduleDates ??
      settings?.weekly_schedule_dates;
    if (Array.isArray(dates)) {
      return dates.includes(dateStr);
    }
    if (dates && typeof dates === "object") {
      return Boolean(dates[dateStr]);
    }
    return false;
  }

  return true;
};

const withDefaultStudioSettings = (settings?: any | null) => ({
  lead_time_hours: 24,
  weekend_multiplier: 1.0,
  peak_season_multiplier: 1.0,
  peak_season_dates: [],
  off_peak_multiplier: 1.0,
  off_peak_dates: [],
  weekly_schedule_scope: "indefinite",
  weekly_schedule_end_date: null,
  weekly_schedule_dates: [],
  ...(settings || {}),
});

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const inferStudioTypeFromRates = (
  rehearsalRate: unknown,
  recordingRate: unknown,
) => {
  const rehearsal = toPositiveNumber(rehearsalRate);
  const recording = toPositiveNumber(recordingRate);

  if (rehearsal > 0 && recording > 0) return "Both" as const;
  if (recording > 0) return "Recording" as const;
  if (rehearsal > 0) return "Rehearsal" as const;
  return null;
};

const inferStudioTypeFromTypeRows = (rows: unknown[]) => {
  const canonicalSet = new Set<"Rehearsal" | "Recording">();

  rows.forEach((row) => {
    const value = normalizeStudioType(
      typeof row === "string" ? row : null,
    );
    if (value === "Both") {
      canonicalSet.add("Rehearsal");
      canonicalSet.add("Recording");
      return;
    }
    if (value === "Rehearsal" || value === "Recording") {
      canonicalSet.add(value);
    }
  });

  const hasRehearsal = canonicalSet.has("Rehearsal");
  const hasRecording = canonicalSet.has("Recording");

  if (hasRehearsal && hasRecording) return "Both" as const;
  if (hasRecording) return "Recording" as const;
  if (hasRehearsal) return "Rehearsal" as const;
  return null;
};

const normalizeListingKind = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "group") return "Group";
  if (normalized === "studio" || normalized === "rehearsal" || normalized === "recording") return "Studio";
  if (normalized === "venue") return "Venue";
  if (normalized === "gig") return "Gig";
  if (normalized === "artist" || normalized === "musician") return "Artist";
  return null;
};

const getInitialListingKind = (listing: any, listingId: string | null) => {
  if (!listing || !listingId || String(listing.id || "") !== String(listingId)) {
    return null;
  }

  return normalizeListingKind(listing.type);
};

const fetchListingBaseByKind = async (listingId: string, kind: string | null) => {
  if (kind === "Group") {
    const { data } = await supabase
      .from("groups_with_stats")
      .select("*")
      .eq("id", listingId)
      .single();
    return data ? { data, ownerId: data.owner_id, type: "Group" } : null;
  }

  if (kind === "Studio" || kind === "Venue") {
    const { data } = await supabase
      .from("studios_with_stats")
      .select("*")
      .eq("id", listingId)
      .single();
    if (!data) return null;

    const resolvedType = kind === "Venue" || data.amenities?.includes("Stage") ? "Venue" : "Studio";
    return { data, ownerId: data.owner_id, type: resolvedType };
  }

  if (kind === "Gig") {
    const { data } = await supabase
      .from("gigs_with_stats")
      .select("*")
      .eq("id", listingId)
      .single();
    return data ? { data, ownerId: data.organizer_id, type: "Gig" } : null;
  }

  if (kind === "Artist") {
    const { data } = await supabase
      .from("profiles_with_stats")
      .select("*")
      .eq("id", listingId)
      .single();
    return data && data.role === "musician"
      ? { data, ownerId: data.id, type: "Artist" }
      : null;
  }

  return null;
};

const ListingDetailsSheet = forwardRef<
  BottomSheetModal,
  ListingDetailsSheetProps
>(function ListingDetailsSheet({ initialListing = null, listingId, onDismiss }, ref) {
  const { colors, isDark } = useTheme();
  const { userId, userRole, isGuest, isSystemLocked, showLockAlert } = useAuth();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isProfileComplete } = useProfileCompletion();
  const initialListingKind = useMemo(
    () => getInitialListingKind(initialListing, listingId),
    [initialListing, listingId],
  );
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const latestListingIdRef = useRef(listingId);
  const [staffAssignment, setStaffAssignment] = useState<any>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [bookingNotes, setBookingNotes] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadStaffAssignment = async () => {
      if (userRole !== "staff" || !userId) {
        setStaffAssignment(null);
        return;
      }

      try {
        const assignment = await fetchActiveStaffAssignment(supabase, userId);
        if (!cancelled) setStaffAssignment(assignment);
      } catch (error) {
        console.warn("Failed to load staff listing assignment", error);
        if (!cancelled) setStaffAssignment(null);
      }
    };

    void loadStaffAssignment();

    return () => {
      cancelled = true;
    };
  }, [userId, userRole]);

  // Application State (for Gig applications)
  const [pitchMessage, setPitchMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [cvFile, setCvFile] = useState<any>(null); // File object from picker
  const [cvUrl, setCvUrl] = useState(""); // Uploaded URL (optional if we just upload on submit)
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const [hasExistingApplication, setHasExistingApplication] = useState(false);
  const [existingApplicationStatus, setExistingApplicationStatus] = useState<
    string | null
  >(null);

  // Studio Booking State (prevent spam)
  const [hasExistingStudioBooking, setHasExistingStudioBooking] =
    useState(false);
  const [existingStudioBookingStatus, setExistingStudioBookingStatus] =
    useState<string | null>(null);

  // Group Selection State (for gig applications)
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [productionTeams, setProductionTeams] = useState<any[]>([]);
  const [loadingProductionTeams, setLoadingProductionTeams] = useState(false);
  const [hasLoadedProductionTeams, setHasLoadedProductionTeams] = useState(false);
  const [selectedProductionTeamId, setSelectedProductionTeamId] = useState<string | null>(null);
  const [productionRoster, setProductionRoster] = useState<any[]>([]);
  const [selectedProductionRosterId, setSelectedProductionRosterId] = useState<string | null>(null);
  const [selectedSlotType, setSelectedSlotType] = useState<
    "solo" | "duo" | "band" | null
  >(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Group Deduplication State (prevent same group applying twice)
  const [groupAlreadyApplied, setGroupAlreadyApplied] = useState(false);
  const [groupApplicationBy, setGroupApplicationBy] = useState<string | null>(
    null,
  );

  // Spam Block State
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
    buttons?: any[];
  }>({ type: "info", title: "", message: "" });
  const [showListingReportModal, setShowListingReportModal] = useState(false);

  // Booking Request State (Invites)
  const [requestMessage, setRequestMessage] = useState("");
  const [requestPitchMessage, setRequestPitchMessage] = useState("");
  const [requestApplicationContext, setRequestApplicationContext] = useState("");
  const [requestDocumentFile, setRequestDocumentFile] = useState<any>(null);
  const [requestDocumentUrl, setRequestDocumentUrl] = useState("");
  const [requestVideoUrl, setRequestVideoUrl] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const listingRequestInFlightRef = useRef(false);

  // Venue Selection State (for venue owners sending invites)
  const [userVenues, setUserVenues] = useState<any[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const {
    currentUserRole,
    currentUserId,
    checkingVenue,
  } = useCurrentUserVenueRole();
  const activeUserId = userId || currentUserId;
  const selectedProductionTeam = useMemo(
    () => productionTeams.find((team: any) => team.id === selectedProductionTeamId) || null,
    [productionTeams, selectedProductionTeamId],
  );
  const requestSlotOptions = useMemo(() => {
    const slots = group?.requirements?.slots || {};

    return ([
      { id: "solo", name: "Solo" },
      { id: "duo", name: "Duo" },
      { id: "band", name: "Band" },
    ] as const).filter(({ id }) => (slots?.[id]?.needed || 0) > 0);
  }, [group?.requirements?.slots]);
  const filteredRequestRoster = useMemo(
    () =>
      productionRoster.filter((entry: any) => {
        if (selectedSlotType === "solo") return entry.entity_kind === "musician";
        if (selectedSlotType === "duo") {
          return entry.group_type === "duo" || entry.group?.group_type === "duo" || entry.entity_kind === "duo";
        }
        if (selectedSlotType === "band") {
          return entry.group_type === "band" || entry.group?.group_type === "band" || entry.entity_kind === "group";
        }

        return true;
      }),
    [productionRoster, selectedSlotType],
  );
  const listingCompletionRate = useMemo(() => {
    if (group?.completion_rate === null || group?.completion_rate === undefined || group?.completion_rate === "") {
      return null;
    }

    const parsed = Number(group?.completion_rate);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.max(0, Math.min(100, Math.round(parsed)));
  }, [group?.completion_rate]);
  const selectedProductionRosterEntry = useMemo(
    () => filteredRequestRoster.find((entry: any) => entry.id === selectedProductionRosterId) || null,
    [filteredRequestRoster, selectedProductionRosterId],
  );

  useEffect(() => {
    setSelectedProductionRosterId((current) =>
      current && filteredRequestRoster.some((entry: any) => entry.id === current)
        ? current
        : null,
    );
  }, [filteredRequestRoster]);

  // Review State
  const [reviews, setReviews] = useState<any[]>([]);
  const [existingBookings, setExistingBookings] = useState<any[]>([]); // Bookings from DB
  const [relatedListings, setRelatedListings] = useState<any[]>([]);

  // Tab State
  const [activeTab, setActiveTab] = useState("About");

  // Booking State
  const [date, setDate] = useState(new Date());
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 4);
    return d;
  });
  const [duration, setDuration] = useState(4);

  // New Calendar and Slot State
  const [selectedDate, setSelectedDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [validEndTimes, setValidEndTimes] = useState<string[]>([]);
  const [markedDates, setMarkedDates] = useState<any>({});

  // Recording studio whole-day booking state
  const [isRecordingWholeDayAvailable, setIsRecordingWholeDayAvailable] = useState(false);
  const [recordingDaySlot, setRecordingDaySlot] = useState<{ start: string; end: string } | null>(null);

  // Session type selection for studios offering Both (Rehearsal & Recording)
  const [selectedSessionType, setSelectedSessionType] = useState<"Rehearsal" | "Recording" | null>(null);

  // Helper: Check if we're in recording mode (either pure Recording studio OR Both with Recording selected)
  const normalizedGroupStudioType = normalizeStudioType(group?.studio_type);
  const isRecordingMode = isRecordingStudioMode(group?.studio_type, selectedSessionType);

  useEffect(() => {
    if (!group?.id) return;

    if (normalizedGroupStudioType === "Both") {
      setSelectedSessionType(null);
      return;
    }

    if (normalizedGroupStudioType === "Recording") {
      setSelectedSessionType("Recording");
      return;
    }

    if (normalizedGroupStudioType === "Rehearsal") {
      setSelectedSessionType("Rehearsal");
      return;
    }

    setSelectedSessionType(null);
  }, [group?.id, normalizedGroupStudioType]);

  // Multiple time slots state for multi-slot bookings (same day)
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<
    { start: string; end: string }[]
  >([]);

  // Multiple bookings state with pricing (different days)
  const [bookings, setBookings] = useState<
    {
      date: Date;
      startTime: Date;
      endTime: Date;
      timeSlots?: { start: string; end: string }[];
      songCount?: number;
      pricing?: any;
    }[]
  >([]);
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  // Payment Option Modal State
  const [showPaymentOptionModal, setShowPaymentOptionModal] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<
    "full" | "downpayment"
  >("full");
  const [paymentBookingData, setPaymentBookingData] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  useBottomOverlayVisibility(showPaymentOptionModal, "ListingPaymentOptionModal");

  // Auto-calculate duration (only if validEndTimes is empty to avoid overwrite loop)
  useEffect(() => {
    if (!date || !endTime) {
      setDuration(0);
      return;
    }

    const start = new Date(date).getTime();
    const end = new Date(endTime).getTime();

    // Calculate diff in hours
    let diff = (end - start) / (1000 * 60 * 60);

    // Handle next day wraps if needed, but for now we assume same-day or flexible
    if (diff < 0) diff += 24;

    // Round to 1 decimal
    setDuration(Math.max(1, parseFloat(diff.toFixed(1))));
  }, [date, endTime]);

  // Confirmation State (reusing modal props logic or simple alerts)
  const [confirmAction, setConfirmAction] = useState<() => void>(() => { });
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmRequireTerms, setConfirmRequireTerms] = useState(false);
  const [confirmContractUrl, setConfirmContractUrl] = useState<string | null>(null);
  const [confirmContractName, setConfirmContractName] = useState<string | undefined>(undefined);
  const [confirmSummaryItems, setConfirmSummaryItems] = useState<ConfirmationSummaryItem[]>([]);

  // BackHandler Logic
  const [sheetIndex, setSheetIndex] = useState(-1);
  const previousSheetIndex = useRef(-1);

  const fetchStudioBookings = useCallback(async (studioId: string) => {
    const { data: bookingData, error: bookingError } = await supabase
      .from("studio_bookings")
      .select("id, studio_id, booking_date, start_time, end_time, status")
      .eq("studio_id", studioId)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (bookingError) {
      console.error("Error fetching studio bookings:", bookingError);
      return [];
    }

    return Array.isArray(bookingData) ? bookingData : [];
  }, []);

  const handleSheetChanges = useCallback(
    async (index: number) => {
      const wasHidden = previousSheetIndex.current < 0;
      const isNowVisible = index >= 0;
      previousSheetIndex.current = index;
      setSheetIndex(index);

      if (wasHidden && isNowVisible) {
        const resolvedUserRole = userRole || currentUserRole;
        if (resolvedUserRole === "producer" && activeUserId) {
          void fetchProductionTeams();
        }
      }

      // Refresh studio data when sheet becomes visible (reopened or returned from payment)
      // This ensures calendar availability is up-to-date with edited operating hours and date overrides
      if (
        wasHidden &&
        isNowVisible &&
        listingId &&
        group &&
        (group.type === "Studio" || group.type === "Venue")
      ) {
        debugLog(
          "📅 Sheet opened - refreshing studio availability and bookings...",
        );
        try {
          // Fetch fresh operating hours from database
          const { data: operatingHours, error: hoursError } = await supabase
            .from("studio_operating_hours")
            .select("*")
            .eq("studio_id", listingId)
            .order("slot_order", { ascending: true });

          // Fetch fresh date overrides from database
          const { data: dateOverrides, error: overridesError } = await supabase
            .from("studio_date_overrides")
            .select("*")
            .eq("studio_id", listingId)
            .order("override_date", { ascending: true })
            .order("slot_order", { ascending: true });

          const { data: studioSettings, error: settingsError } = await supabase
            .from("studio_settings")
            .select("*")
            .eq("studio_id", listingId)
            .maybeSingle();

          let freshAvailability = group.availability;
          let freshDateOverrides = group.dateOverrides;
          let freshSettings = group.settings;

          if (!hoursError && Array.isArray(operatingHours) && operatingHours.length > 0) {
            debugLog("📅 Fresh operating hours fetched:", operatingHours.length);
            const dayNames = [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ];
            freshAvailability = dayNames.map((dayName, idx) => {
              const dayHours = operatingHours.filter(
                (h: any) => h.day_of_week === idx && h.is_open,
              );
              return {
                day: dayName,
                slots: dayHours.map((h: any) => ({
                  start: h.open_time,
                  end: h.close_time,
                  sessionType: getScheduleSessionType(h),
                })),
                sessionType: dayHours[0] ? getScheduleSessionType(dayHours[0]) : "both",
                weekly_schedule_scope: dayHours[0]?.weekly_schedule_scope,
                weekly_schedule_end_date: dayHours[0]?.weekly_schedule_end_date,
                weekly_schedule_dates: dayHours[0]?.weekly_schedule_dates,
                weeklyScheduleScope: dayHours[0]?.weekly_schedule_scope,
                weeklyScheduleEndDate: dayHours[0]?.weekly_schedule_end_date,
                weeklyScheduleDates: dayHours[0]?.weekly_schedule_dates,
              };
            });
            // Update group state with fresh availability
            setGroup((prev: any) => prev ? { ...prev, availability: freshAvailability } : prev);
          }

          if (!overridesError && dateOverrides) {
            debugLog("📅 Fresh date overrides fetched:", dateOverrides.length);
            freshDateOverrides = dateOverrides;
            // Update group state with fresh date overrides
            setGroup((prev: any) => prev ? { ...prev, dateOverrides: freshDateOverrides } : prev);
          }

          if (!settingsError && studioSettings) {
            debugLog("⚙️ Fresh studio settings fetched");
            freshSettings = withDefaultStudioSettings(studioSettings);
            setGroup((prev: any) => prev ? { ...prev, settings: freshSettings } : prev);
          }

          // Fetch fresh bookings
          const fetchedBookings = await fetchStudioBookings(listingId);
          setExistingBookings(fetchedBookings);

          // Re-check user's latest payment-blocking booking status when sheet reopens
          if (userId) {
            const { data: latestUserBooking, error: latestUserBookingError } = await supabase
              .from("studio_bookings")
              .select("id, status, payment_status")
              .eq("user_id", userId)
              .eq("studio_id", listingId)
              .eq("status", "confirmed")
              .in("payment_status", ["unpaid", "pending", "failed"])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestUserBookingError) {
              console.error("Error refreshing studio booking payment status:", latestUserBookingError);
            } else if (latestUserBooking) {
              setHasExistingStudioBooking(true);
              setExistingStudioBookingStatus("unpaid");
              setBookings([]);
              setSelectedTimeSlots([]);
              setShowAddBooking(false);
            } else {
              setHasExistingStudioBooking(false);
              setExistingStudioBookingStatus(null);
            }
          }

          // Re-process availability with fresh data
          if (freshAvailability) {
            processAvailability(
              freshAvailability,
              fetchedBookings,
              freshDateOverrides,
              bookings,
              freshSettings,
            );
          }
        } catch (e) {
          console.error("Error refreshing studio data:", e);
        }
      }
    },
    [activeUserId, bookings, currentUserRole, group, listingId, userRole],
  );

  useEffect(() => {
    const backAction = () => {
      if (sheetIndex >= 0) {
        (ref as any)?.current?.dismiss();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction,
    );
    return () => backHandler.remove();
  }, [sheetIndex, ref]);

  const handleConfirm = (
    action: () => void,
    title: string,
    message: string,
    options?: {
      requireTerms?: boolean;
      contractUrl?: string | null;
      contractName?: string;
      summaryItems?: ConfirmationSummaryItem[];
    },
  ) => {
    debugLog("🔵 handleConfirm called");

    // System Lock Check - Block if user has unpaid balance
    if (isSystemLocked) {
      // Dismiss the bottom sheet first so navigation is visible after "Pay Now" is pressed
      showLockAlert(() => onDismiss?.());
      return;
    }

    // Profile Check Gate
    // Profile Check Gate
    if (!isProfileComplete) {
      setAlertConfig({
        type: "warning",
        title: "Profile Incomplete",
        message:
          "You need to complete your profile details (contact & address) before you can proceed.",
        buttons: [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setAlertVisible(false),
          },
          {
            text: "Complete Now",
            onPress: () => {
              setAlertVisible(false);
              router.push("/edit_profile");
            },
          },
        ],
      });
      setAlertVisible(true);
      return;
    }

    debugLog("Title:", title);
    debugLog("Message:", message);
    debugLog("Action function:", action.name || "anonymous");
    setConfirmAction(() => action);
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmRequireTerms(Boolean(options?.requireTerms));
    setConfirmContractUrl(options?.contractUrl ?? null);
    setConfirmContractName(options?.contractName);
    setConfirmSummaryItems(options?.summaryItems || []);
    setModalVisible(true);
    debugLog("Modal should now be visible");
  };

  const showSheetAlert = (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const getReportTargetType = (listingType?: string) => {
    const normalized = (listingType || "").toLowerCase();
    if (normalized === "artist") return "profile";
    if (normalized === "venue") return "studio";
    return normalized || "profile";
  };

  const getFavoriteTargetType = (
    listingType?: string,
  ): "group" | "studio" | "gig" | "profile" | null => {
    const normalized = (listingType || "").toLowerCase();
    if (normalized === "group") return "group";
    if (normalized === "artist" || normalized === "musician") return "profile";
    if (normalized === "studio" || normalized === "venue") return "studio";
    if (normalized === "gig") return "gig";
    return null;
  };

  const syncFavoriteMetadata = useCallback(
    async (
      targetType: "group" | "studio" | "gig" | "profile" | null,
      targetId: string | null | undefined,
      currentUserId?: string | null,
    ) => {
      if (!targetType || !targetId) {
        setIsFavorited(false);
        setFavoriteCount(0);
        return;
      }

      const totalFavoritePromise = supabase
        .from("favorites")
        .select("id", { count: "exact", head: true })
        .eq(`${targetType}_id`, targetId);

      const userFavoritePromise = currentUserId
        ? supabase
          .from("favorites")
          .select("id", { count: "exact", head: true })
          .eq(`${targetType}_id`, targetId)
          .eq("user_id", currentUserId)
        : Promise.resolve({ count: 0, error: null } as any);

      const [totalFavoriteResult, userFavoriteResult] = await Promise.all([
        totalFavoritePromise,
        userFavoritePromise,
      ]);

      if (totalFavoriteResult.error) throw totalFavoriteResult.error;
      if (userFavoriteResult.error) throw userFavoriteResult.error;

      const nextFavoriteCount = totalFavoriteResult.count || 0;
      const nextIsFavorited = (userFavoriteResult.count || 0) > 0;

      setFavoriteCount(nextFavoriteCount);
      setIsFavorited(nextIsFavorited);
      emitFavoriteChanged({
        favoriteCount: nextFavoriteCount,
        id: targetId,
        isFavorited: nextIsFavorited,
        targetType,
      });
    },
    [],
  );

  const normalizedListingType = String(group?.type || "").toLowerCase();
  const listingOwnerId =
    group?.owner_id ||
    group?.organizer_id ||
    (normalizedListingType === "artist" ? group?.id || null : null);
  const isOwnListing = !!userId && !!listingOwnerId && listingOwnerId === userId;
  const staffTargetMatchesListing =
    !!group &&
    (
      (staffAssignment?.entity_type === "studio" &&
        normalizedListingType === "studio" &&
        staffAssignment.studio_id === group.id) ||
      (staffAssignment?.entity_type === "venue" &&
        (normalizedListingType === "gig" || normalizedListingType === "venue") &&
        staffAssignment.gig_id === group.id) ||
      (staffAssignment?.entity_type === "production" &&
        (normalizedListingType === "production" || normalizedListingType === "production_team") &&
        staffAssignment.production_team_id === group.id)
    );
  const isStaffViewOnlyListing =
    staffTargetMatchesListing &&
    getStaffPermissions(staffAssignment?.access_level).canViewOnly;
  const showReportButton = !!group && !isOwnListing && !isGuest && !isStaffViewOnlyListing;

  const submitReport = async (reason: string, details?: string) => {
    if (!userId) {
      showSheetAlert("warning", "Login Required", "You need to be logged in to submit a report.");
      return;
    }

    if (isOwnListing) {
      showSheetAlert("info", "Can't Report Your Listing", "You can't report your own listing.");
      return;
    }

    if (!group?.id) {
      showSheetAlert("error", "Unable to Report", "Missing listing details.");
      return;
    }

    const { error } = await supabase.functions.invoke("manage-details", {
      body: {
        action: "report",
        type: getReportTargetType(group.type),
        id: group.id,
        userId,
        reason,
        details: details || null,
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to submit report.");
    }
  };

  const handleReport = () => {
    if (isGuest) {
      return;
    }

    if (!group?.id) {
      showSheetAlert("error", "Unable to Report", "Missing listing details.");
      return;
    }

    if (isOwnListing) {
      showSheetAlert("info", "Can't Report Your Listing", "You can't report your own listing.");
      return;
    }

    setShowListingReportModal(true);
  };

  const buildListingShareUrl = () => {
    if (!group?.id) return ExpoLinking.createURL("/home");

    const normalizedType = String(group?.type || "").toLowerCase();

    if (normalizedType === "group") {
      return ExpoLinking.createURL("/group_details", {
        queryParams: { id: group.id },
      });
    }

    if (normalizedType === "artist") {
      return ExpoLinking.createURL("/profile", {
        queryParams: { userId: group.id },
      });
    }

    return ExpoLinking.createURL("/home", {
      queryParams: {
        listingId: group.id,
        listingType: normalizedType || "listing",
      },
    });
  };

  const handleShare = async () => {
    try {
      const name = group?.name || 'this listing';
      const type = group?.type || 'Listing';
      const shareUrl = buildListingShareUrl();
      await Share.share({
        message: `Check out ${name} (${type}) on MusikaLokal!\n${shareUrl}`,
        url: shareUrl,
      });
    } catch {
      // user cancelled or share failed — no action needed
    }
  };

  // Refresh studio bookings and calendar availability (e.g. after booking creation or payment modal dismissal)
  const refreshStudioCalendar = useCallback(async () => {
    if (!listingId || !group || (group.type !== "Studio" && group.type !== "Venue")) return;
    try {
      const freshBookings = await fetchStudioBookings(listingId);
      setExistingBookings(freshBookings);
      if (group.availability) {
        processAvailability(
          group.availability,
          freshBookings,
          group.dateOverrides,
          bookings,
          group.settings,
        );
      }
      // Re-check unpaid booking status
      if (userId) {
        const { data: latestUserBooking } = await supabase
          .from("studio_bookings")
          .select("id, status, payment_status")
          .eq("user_id", userId)
          .eq("studio_id", listingId)
          .eq("status", "confirmed")
          .in("payment_status", ["unpaid", "pending", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestUserBooking) {
          setHasExistingStudioBooking(true);
          setExistingStudioBookingStatus("unpaid");
          setBookings([]);
          setSelectedTimeSlots([]);
          setShowAddBooking(false);
        } else {
          setHasExistingStudioBooking(false);
          setExistingStudioBookingStatus(null);
        }
      }
    } catch (e) {
      console.error("Error refreshing studio calendar:", e);
    }
  }, [listingId, group, bookings, userId, fetchStudioBookings]);

  // Process payment with selected payment type (full or downpayment)
  const processPaymentWithType = async (
    paymentType: "full" | "downpayment",
  ) => {
    if (!paymentBookingData) return;

    const { booking, studioName, totalAmount } = paymentBookingData;
    const bookingIds = Array.isArray(paymentBookingData.bookingIds)
      ? paymentBookingData.bookingIds.filter(Boolean)
      : Array.isArray(paymentBookingData.bookings)
        ? paymentBookingData.bookings.map((item: any) => item?.id).filter(Boolean)
        : [booking?.id].filter(Boolean);
    const primaryBookingId = bookingIds[0] || booking.id;
    const bookingCount = bookingIds.length || 1;
    const payAmount =
      paymentType === "downpayment" ? Math.round(totalAmount / 2) : totalAmount;
    const remainingBalance =
      paymentType === "downpayment" ? Math.round(totalAmount / 2) : 0;

    try {
      setIsProcessingPayment(true);
      debugLog("💳 Creating PayMongo checkout session...", {
        paymentType,
        payAmount,
        remainingBalance,
      });

      // Generate environment-aware redirect URLs
      const redirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "success", booking_id: primaryBookingId },
      });
      const cancelRedirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "cancelled", booking_id: primaryBookingId },
      });

      const { data: paymentData, error: paymentError } =
        await supabase.functions.invoke("paymongo", {
          body: {
            action: "create_checkout",
            booking_id: primaryBookingId,
            booking_ids: bookingIds,
            user_id: userId,
            amount: payAmount,
            total_amount: totalAmount,
            payment_type: paymentType,
            remaining_balance: remainingBalance,
            studio_name: studioName,
            booking_date: booking.booking_date,
            description:
              paymentType === "downpayment"
                ? `Downpayment (50%) for ${bookingCount > 1 ? `${bookingCount} studio bookings` : `studio booking at ${studioName}`}`
                : `${bookingCount > 1 ? `${bookingCount} studio bookings` : `Studio booking at ${studioName}`}`,
            redirect_url: redirectUrl,
            cancel_redirect_url: cancelRedirectUrl,
          },
        });

      if (paymentError) {
        console.error("❌ Payment error:", paymentError);
        setIsProcessingPayment(false);
        setShowPaymentOptionModal(false);
        showSheetAlert(
          "warning",
          "Payment Setup Failed",
          "Booking created! However, payment setup failed. Please go to Pending bookings to complete payment.",
        );

        // Clear form and close
        setBookings([]);
        setSelectedTimeSlots([]);
        setBookingNotes("");
        setModalVisible(false);
        (ref as any)?.current?.dismiss();

        setTimeout(() => {
          router.push("/bookings" as any);
        }, 100);
        return;
      }

      if (paymentData?.checkout_url) {
        debugLog("✅ Checkout URL:", paymentData.checkout_url);

        // Clear form
        setBookings([]);
        setSelectedTimeSlots([]);
        setBookingNotes("");
        setModalVisible(false);
        setShowPaymentOptionModal(false);
        setPaymentBookingData(null);
        (ref as any)?.current?.dismiss();

        // Open PayMongo checkout in browser
        const canOpen = await Linking.canOpenURL(paymentData.checkout_url);
        if (canOpen) {
          await Linking.openURL(paymentData.checkout_url);
        } else {
          showSheetAlert(
            "info",
            "Booking Created",
            "Booking created! Please complete payment from your Pending bookings.",
          );
          setTimeout(() => {
            router.push("/bookings" as any);
          }, 100);
        }
      } else {
        setShowPaymentOptionModal(false);
        showSheetAlert(
          "info",
          "Booking Created",
          "Booking created! Please complete payment from your Pending bookings.",
        );

        // Clear form and close
        setBookings([]);
        setSelectedTimeSlots([]);
        setBookingNotes("");
        setModalVisible(false);
        (ref as any)?.current?.dismiss();

        setTimeout(() => {
          router.push("/bookings" as any);
        }, 100);
      }
    } catch (payErr: any) {
      console.error("❌ Payment initiation error:", payErr);
      showSheetAlert(
        "warning",
        "Payment Pending",
        "Booking created! Please complete payment from your Pending bookings to confirm.",
      );

      // Clear form and close
      setBookings([]);
      setSelectedTimeSlots([]);
      setBookingNotes("");
      setModalVisible(false);
      setShowPaymentOptionModal(false);
      (ref as any)?.current?.dismiss();

      setTimeout(() => {
        router.push("/bookings" as any);
      }, 100);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Check if user has already applied to this gig
  const checkExistingApplication = async () => {
    if (!userId || !listingId || !group) return;

    if (group.type === "Group") {
      try {
        const { data, error } = await supabase
          .from("booking_requests")
          .select("id, created_at, status, event_details")
          .eq("sender_id", userId)
          .eq("group_id", listingId)
          .in("status", ["pending", "accepted", "approved", "connected"])
          .contains("event_details", {
            type: "listing_connection_request",
            request_kind: "application",
            application_scope: "group_member",
          })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error checking existing group application:", error);
          return;
        }

        if (data) {
          setHasExistingApplication(true);
          setExistingApplicationStatus(data.status || "pending");
        } else {
          setHasExistingApplication(false);
          setExistingApplicationStatus(null);
        }
      } catch (err) {
        console.error("Error checking group application:", err);
      }

      return;
    }

    if (group.type !== "Gig") return;

    if (userRole === "producer") {
      if (!selectedProductionTeamId) {
        setHasExistingApplication(false);
        setExistingApplicationStatus(null);
        setCvUrl("");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke(
          "gig-applications",
          {
            body: {
              action: "check_existing_production_application",
              userId,
              gigId: listingId,
              teamId: selectedProductionTeamId,
            },
          },
        );

        if (error) {
          console.error("Error checking existing production application:", error);
          return;
        }

        const application = data?.application || null;

        if (application) {
          setHasExistingApplication(true);
          setExistingApplicationStatus(application.status || "pending");
          setSelectedProductionRosterId(application.production_roster_id || null);
          if (
            application.slot_type === "solo" ||
            application.slot_type === "duo" ||
            application.slot_type === "band"
          ) {
            setSelectedSlotType(application.slot_type);
          }
          if (application.cv_url) setCvUrl(application.cv_url);
        } else {
          setHasExistingApplication(false);
          setExistingApplicationStatus(null);
          setCvUrl("");
        }
      } catch (err) {
        console.error("Error checking production application:", err);
      }

      return;
    }

    try {
      // Active direct applications block only the direct path. Group and production paths stay separate.
      const { data, error } = await supabase
        .from("gig_applications")
        .select("id, status, group_id, cv_url")
        .eq("applicant_id", userId)
        .eq("gig_id", listingId)
        .is("group_id", null)
        .is("production_team_id", null)
        .in("status", ["pending", "accepted", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error checking existing application:", error);
        return;
      }

      if (data) {
        debugLog("📋 User has already applied to this gig:", data);
        setHasExistingApplication(true);
        setExistingApplicationStatus(data.status);
        if (data.cv_url) setCvUrl(data.cv_url);
      } else {
        setHasExistingApplication(false);
        setExistingApplicationStatus(null);
        setCvUrl("");
      }
    } catch (err) {
      console.error("Error checking application:", err);
    }
  };

  const fetchProductionTeamRoster = async (teamId: string) => {
    if (!teamId) {
      setProductionRoster([]);
      setSelectedProductionRosterId(null);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("manage-production", {
        body: { action: "list_team_roster", teamId },
      });

      if (error) throw error;

      const rosterEntries = data?.roster || [];
      setProductionRoster(rosterEntries);
      setSelectedProductionRosterId((current) =>
        current && rosterEntries.some((entry: any) => entry.id === current)
          ? current
          : null,
      );
    } catch (err) {
      console.error("Error fetching production roster:", err);
      setProductionRoster([]);
      setSelectedProductionRosterId(null);
    }
  };

  // Fetch user's groups for gig application (owned OR member of)
  const fetchUserGroups = async () => {
    if (!userId || !group || group.type !== "Gig") return;

    setLoadingGroups(true);
    try {
      // Fetch groups where user is owner (legacy-shaped fields from stats view)
      const { data: ownedGroups, error: ownedError } = await supabase
        .from("groups_with_stats")
        .select("id, owner_id, name, images, genre, group_type")
        .eq("owner_id", userId);

      // Fetch group IDs where user is a member
      const { data: membershipRows, error: memberError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

      const memberGroupIds = Array.from(
        new Set(
          (membershipRows || [])
            .map((row: any) => row.group_id)
            .filter((id: any) => typeof id === "string" && id.length > 0),
        ),
      );

      let memberGroups: any[] = [];
      if (memberGroupIds.length > 0) {
        const { data: memberGroupData, error: memberGroupDataError } = await supabase
          .from("groups_with_stats")
          .select("id, owner_id, name, images, genre, group_type")
          .in("id", memberGroupIds);

        if (memberGroupDataError) {
          console.error("Error fetching member group details:", memberGroupDataError);
        } else {
          memberGroups = memberGroupData || [];
        }
      }

      if (ownedError) {
        console.error("Error fetching owned groups:", ownedError);
      }
      if (memberError) {
        console.error("Error fetching member groups:", memberError);
        // If group_members table doesn't exist yet, just use owned groups
      }

      // Combine and deduplicate
      const allGroups = [
        ...(ownedGroups || []),
        ...memberGroups,
      ];

      // Remove duplicates by id
      const uniqueGroups = allGroups.filter(
        (g, idx, arr) => arr.findIndex((x) => x.id === g.id) === idx,
      );

      debugLog("📋 Fetched groups (owned + member):", uniqueGroups.length);
      setUserGroups(uniqueGroups);
    } catch (err) {
      console.error("Error fetching groups:", err);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchProductionTeams = useCallback(async () => {
    const resolvedUserRole = userRole || currentUserRole;

    if (!activeUserId || resolvedUserRole !== "producer") {
      setProductionTeams([]);
      setSelectedProductionTeamId(null);
      setProductionRoster([]);
      setSelectedProductionRosterId(null);
      setLoadingProductionTeams(false);
      setHasLoadedProductionTeams(false);
      return;
    }

    setHasLoadedProductionTeams(false);
    setLoadingProductionTeams(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-production", {
        body: { action: "list_my_teams" },
      });

      if (error) throw error;

      const teams = data?.teams || [];
      setProductionTeams(teams);
      setSelectedProductionTeamId((current) => {
        if (current && teams.some((team: any) => team.id === current)) {
          return current;
        }
        return teams[0]?.id || null;
      });
      setHasLoadedProductionTeams(true);
    } catch (err) {
      console.error("Error fetching production teams:", err);
      setProductionTeams([]);
      setSelectedProductionTeamId(null);
      setProductionRoster([]);
      setSelectedProductionRosterId(null);
      setHasLoadedProductionTeams(true);
    } finally {
      setLoadingProductionTeams(false);
    }
  }, [activeUserId, currentUserRole, userRole]);

  const fetchOwnedVenues = async () => {
    if (!currentUserId || currentUserRole !== "venue-owner") {
      setUserVenues([]);
      setSelectedVenueId(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("studios")
        .select("id, name, studio_type")
        .eq("owner_id", currentUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const venueRows = (data || []).filter((row: any) => {
        const normalizedType = String(row?.studio_type || "").toLowerCase();
        return !normalizedType || normalizedType.includes("venue");
      });
      const nextVenues = (venueRows.length > 0 ? venueRows : data || []).map((row: any) => ({
        id: row.id,
        name: row.name || "Venue",
      }));

      setUserVenues(nextVenues);
      setSelectedVenueId((current) =>
        current && nextVenues.some((venue: any) => venue.id === current)
          ? current
          : nextVenues[0]?.id || null,
      );
    } catch (err) {
      console.error("Error fetching owned venues:", err);
      setUserVenues([]);
      setSelectedVenueId(null);
    }
  };

  // Check if selected group has already applied to this gig
  const checkGroupApplication = async (groupId: string) => {
    if (!groupId || !listingId) {
      setGroupAlreadyApplied(false);
      setGroupApplicationBy(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("gig_applications")
        .select("id, applicant_id, status, profiles:applicant_id(full_name)")
        .eq("gig_id", listingId)
        .eq("group_id", groupId)
        .in("status", ["pending", "accepted", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error checking group application:", error);
        return;
      }

      if (data && data.applicant_id !== userId) {
        debugLog("⚠️ Group already applied by another member:", data);
        setGroupAlreadyApplied(true);
        setGroupApplicationBy(
          (data.profiles as any)?.full_name || "Another member",
        );
      } else {
        setGroupAlreadyApplied(false);
        setGroupApplicationBy(null);
      }
    } catch (err) {
      console.error("Error checking group application:", err);
    }
  };

  // Check if user has an unpaid booking for this studio (blocks new bookings until paid)
  const checkExistingStudioBooking = async () => {
    if (
      !userId ||
      !listingId ||
      !group ||
      (group.type !== "Studio" && group.type !== "Venue")
    )
      return;

    try {
      // Only check for confirmed bookings with unpaid/pending payment (need to pay before booking again)
      // Pending bookings (awaiting owner response) no longer block new bookings
      const { data, error } = await supabase
        .from("studio_bookings")
        .select(
          "id, status, booking_date, payment_status, payment_amount, remaining_balance",
        )
        .eq("user_id", userId)
        .eq("studio_id", listingId)
        .eq("status", "confirmed")
        .in("payment_status", ["unpaid", "pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error checking existing studio booking:", error);
        return;
      }

      if (data) {
        debugLog("📋 User has an unpaid booking for this studio:", data);
        setHasExistingStudioBooking(true);
        setExistingStudioBookingStatus(data.payment_status || "unpaid");
      } else {
        setHasExistingStudioBooking(false);
        setExistingStudioBookingStatus(null);
      }
    } catch (err) {
      console.error("Error checking studio booking:", err);
    }
  };

  // Check Eligibility (Spam Block)
  const checkEligibility = async (targetGigId: string) => {
    if (!userId || !targetGigId) return;
    try {
      const { data, error } = await supabase.functions.invoke(
        "gig-applications",
        {
          body: {
            action: "check_eligibility",
            userId,
            gigId: targetGigId,
            groupId: selectedGroupId || null,
            productionTeamId: userRole === "producer" ? selectedProductionTeamId || null : null,
          },
        },
      );

      // Handle error gracefully - don't block user on eligibility check failure
      if (error) {
        console.warn(
          "Eligibility check failed, allowing access:",
          error.message,
        );
        setIsBlocked(false);
        setBlockReason(null);
        return;
      }

      if (data && data.blocked) {
        setIsBlocked(true);
        setBlockReason(data.reason);
      } else {
        setIsBlocked(false);
        setBlockReason(null);
      }
    } catch (err: any) {
      // Fail-open: Allow user to proceed if eligibility check fails
      console.warn(
        "Eligibility check error, allowing access:",
        err?.message || err,
      );
      setIsBlocked(false);
      setBlockReason(null);
    }
  };

  const { handleSubmitApplication } = useApplicationSubmissionAction({
    userId,
    userRole,
    listingId,
    group,
    groupAlreadyApplied,
    groupApplicationBy,
    selectedGroupId,
    selectedProductionTeamId,
    selectedProductionRosterId,
    productionRoster,
    selectedSlotType,
    pitchMessage,
    cvFile,
    cvUrl,
    videoUrl,
    userGroups,
    setAlertConfig,
    setAlertVisible,
    requestConfirmation: handleConfirm,
    setIsSubmittingApplication,
    setHasExistingApplication,
    setExistingApplicationStatus,
    setPitchMessage,
    setVideoUrl,
    setCvFile,
    setCvUrl,
    closeSheet: () => {
      if (ref && "current" in ref && ref.current) {
        ref.current.dismiss();
      }
    },
  });

  // Fixed sheet height
  const snapPoints = useMemo(() => ["90%"], []);
  const animationConfigs = useBottomSheetSpringConfigs(bottomSheetSpringConfig);
  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingBottom: contentBottomPadding }],
    [contentBottomPadding],
  );

  useEffect(() => {
    latestListingIdRef.current = listingId;
  }, [listingId]);

  useEffect(() => {
    debugLog("=== ListingDetailsSheet useEffect triggered ===");
    debugLog("listingId:", listingId);
    if (listingId) {
      setGroup(null);
      setExistingBookings([]);
      setLoading(true);
      debugLog("Fetching group details for:", listingId);
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        fetchGroupDetails();
      });
      setActiveTab("About");
      // Reset booking state
      setDate(null as any);
      setEndTime(null as any);
      setBookings([]);
      setBookingNotes("");
      // Reset application state
      setPitchMessage("");
      setVideoUrl("");
      setHasExistingApplication(false);
      setExistingApplicationStatus(null);
      setRequestMessage("");
      setRequestPitchMessage("");
      setRequestApplicationContext("");
      setRequestDocumentFile(null);
      setRequestDocumentUrl("");
      setRequestVideoUrl("");
      // Reset studio booking state
      setHasExistingStudioBooking(false);
      setExistingStudioBookingStatus(null);
      // Reset group selection state
      setSelectedGroupId(null);
      setSelectedSlotType(null);
      setUserGroups([]);
      setProductionTeams([]);
      setLoadingProductionTeams(false);
      setSelectedProductionTeamId(null);
      setProductionRoster([]);
      setSelectedProductionRosterId(null);
      // Reset venue selection state
      setSelectedVenueId(null);
      setUserVenues([]);

      debugLog("Application form reset");
      setShowAddBooking(false);

      return () => {
        interactionTask.cancel();
      };
    }

    setGroup(null);
    setExistingBookings([]);
    setLoading(false);
  }, [listingId]);

  // Check for existing application when group data is loaded
  useEffect(() => {
    if (group && userId && (group.type === "Gig" || group.type === "Group")) {
      if (group.type === "Group") {
        checkExistingApplication();
      }
      if (group.type === "Gig") {
        if (userRole !== "producer") {
          checkExistingApplication();
        }
      }
      if (group.type === "Gig" && userRole !== "producer") {
        fetchUserGroups();
      }
    }
  }, [group, userId, userRole]);

  useEffect(() => {
    const resolvedUserRole = userRole || currentUserRole;

    if (listingId && group && resolvedUserRole === "producer") {
      fetchProductionTeams();
      return;
    }

    setProductionTeams([]);
    setSelectedProductionTeamId(null);
    setProductionRoster([]);
    setSelectedProductionRosterId(null);
    setLoadingProductionTeams(false);
    setHasLoadedProductionTeams(false);
  }, [currentUserRole, fetchProductionTeams, group, listingId, userId, userRole]);

  useFocusEffect(
    useCallback(() => {
      const resolvedUserRole = userRole || currentUserRole;
      if (listingId && group && resolvedUserRole === "producer" && activeUserId) {
        let isActive = true;
        const focusTask = InteractionManager.runAfterInteractions(() => {
          if (isActive) {
            void fetchProductionTeams();
          }
        });

        return () => {
          isActive = false;
          focusTask.cancel();
        };
      }
    }, [activeUserId, currentUserRole, fetchProductionTeams, group, listingId, userRole]),
  );

  useEffect(() => {
    if (listingId && group && currentUserRole === "venue-owner") {
      fetchOwnedVenues();
    }
  }, [currentUserRole, currentUserId, group, listingId]);

  useEffect(() => {
    if (group?.type !== "Gig" || userRole !== "producer") return;

    if (selectedProductionTeamId) {
      fetchProductionTeamRoster(selectedProductionTeamId);
    } else {
      setProductionRoster([]);
      setSelectedProductionRosterId(null);
    }

    checkExistingApplication();
  }, [group?.id, userId, userRole, selectedProductionTeamId]);

  // Check for existing studio booking when group data is loaded
  useEffect(() => {
    if (
      group &&
      userId &&
      (group.type === "Studio" || group.type === "Venue")
    ) {
      checkExistingStudioBooking();
    }
  }, [group, userId]);

  // Re-check the cancellation limit when the applicant entity changes.
  useEffect(() => {
    if (group && userId && group.type === "Gig") {
      checkEligibility(group.id);
    }
  }, [group?.id, group?.type, selectedGroupId, selectedProductionTeamId, userId, userRole]);

  // Check if selected group has already applied (group-level deduplication)
  useEffect(() => {
    if (userRole === "producer") {
      setGroupAlreadyApplied(false);
      setGroupApplicationBy(null);
      return;
    }

    if (selectedGroupId) {
      checkGroupApplication(selectedGroupId);
    } else {
      setGroupAlreadyApplied(false);
      setGroupApplicationBy(null);
    }
  }, [selectedGroupId, listingId]);

  // Debug effect to monitor application state changes
  useEffect(() => {
    debugLog("📝 Application State Updated:");
    debugLog("  - pitchMessage:", pitchMessage);
    debugLog("  - videoUrl:", videoUrl);
    debugLog("  - isSubmittingApplication:", isSubmittingApplication);
  }, [pitchMessage, videoUrl, isSubmittingApplication]);

  // Debug effect to monitor userId changes
  useEffect(() => {
    debugLog("👤 userId changed:", userId);
  }, [userId]);

  const fetchGroupDetails = async () => {
    debugLog("=== fetchGroupDetails called ===");
    const activeListingId = listingId;
    if (!activeListingId) return;

    const cachedDetails = getListingDetailsCacheEntry(activeListingId);
    if (cachedDetails?.data) {
      setGroup(cachedDetails.data);
      setExistingBookings(cachedDetails.existingBookings || []);
      if (
        cachedDetails.data.availability &&
        latestListingIdRef.current === activeListingId
      ) {
        processAvailability(
          cachedDetails.data.availability,
          cachedDetails.existingBookings || [],
          cachedDetails.data.dateOverrides,
          undefined,
          cachedDetails.data.settings,
        );
      }

      const isCachedStudio =
        cachedDetails.data?.type === "Studio" ||
        cachedDetails.data?.type === "Venue";

      if (
        !isCachedStudio &&
        Date.now() - cachedDetails.fetchedAt < LISTING_DETAILS_CACHE_TTL_MS
      ) {
        setLoading(false);
        return;
      }
    }

    if (hasListingDetailsRequestInFlight(activeListingId)) {
      setLoading(!cachedDetails);
      return;
    }

    markListingDetailsRequestInFlight(activeListingId);
    setLoading(!cachedDetails);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      debugLog("User:", user?.id);

      let data: any = null;
      let type = "Group";
      let ownerId = null;
      const preferredListing = await fetchListingBaseByKind(
        activeListingId,
        initialListingKind,
      );

      if (preferredListing) {
        data = preferredListing.data;
        type = preferredListing.type;
        ownerId = preferredListing.ownerId;
      } else {
        // Try Group
        const { data: groupData } = await supabase
          .from("groups_with_stats")
          .select("*")
          .eq("id", activeListingId)
          .single();

        if (groupData) {
          data = groupData;
          type = "Group";
          ownerId = groupData.owner_id;
        } else {
          // Try Studio
          const { data: studioData } = await supabase
            .from("studios_with_stats")
            .select("*")
            .eq("id", activeListingId)
            .single();

          if (studioData) {
            data = studioData;
            type = "Studio";
            ownerId = studioData.owner_id;
            if (studioData.amenities?.includes("Stage")) type = "Venue";
          } else {
            // Try Gig
            const { data: gigData } = await supabase
              .from("gigs_with_stats")
              .select("*")
              .eq("id", activeListingId)
              .single();

            if (gigData) {
              data = gigData;
              type = "Gig";
              ownerId = gigData.organizer_id;
            } else {
              // Try Profile (Solo Artist)
              const { data: profileData } = await supabase
                .from("profiles_with_stats")
                .select("*")
                .eq("id", activeListingId)
                .single();

              if (profileData && profileData.role === "musician") {
                data = profileData;
                type = "Artist";
                ownerId = profileData.id; // Self-managed
              } else {
                const { data: productionTeamData } = await supabase
                  .from("production_teams")
                  .select("id")
                  .eq("id", activeListingId)
                  .maybeSingle();

                if (productionTeamData?.id) {
                  setGroup(null);
                  router.push({
                    pathname: "/production_team",
                    params: { teamId: productionTeamData.id },
                  });
                  return;
                }
              }
            }
          }
        }
      }

      if (data && ownerId) {
        debugLog("Found data:", {
          type,
          id: data.id,
          name: data.name || data.full_name,
        });

        let resolvedOpenGroupApplications: boolean | null = null;

        const normalizeImageArray = (value: any): string[] => {
          if (Array.isArray(value)) {
            return value
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter((item) => item.length > 0);
          }

          if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return [];

            if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
              try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                  return parsed
                    .filter((item): item is string => typeof item === "string")
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0);
                }
              } catch {
                // Fallback below
              }
            }

            return trimmed
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item.length > 0);
          }

          return [];
        };

        let resolvedImages = normalizeImageArray(data.images);

        if (type === "Group") {
          const [
            mediaRowsResult,
            groupSettingsResult,
            groupMembersResult,
          ] = await Promise.all([
            supabase
              .from("group_media")
              .select("media_url, sort_order")
              .eq("group_id", data.id)
              .eq("media_type", "image")
              .order("sort_order", { ascending: true }),
            supabase
              .from("groups")
              .select("open_group_applications")
              .eq("id", data.id)
              .single(),
            supabase
              .from("group_members")
              .select("user_id, role, profiles:user_id(full_name, avatar_url)")
              .eq("group_id", data.id),
          ]);

          const mediaRows = mediaRowsResult.data;
          const mediaError = mediaRowsResult.error;
          const groupSettings = groupSettingsResult.data;
          const groupSettingsError = groupSettingsResult.error;

          if (!mediaError && Array.isArray(mediaRows)) {
            const groupMediaImages = mediaRows
              .map((row: any) => row?.media_url)
              .filter((url: any): url is string => typeof url === "string")
              .map((url: string) => url.trim())
              .filter((url: string) => url.length > 0);

            if (groupMediaImages.length > 0) {
              resolvedImages = groupMediaImages;
            }
          } else if (mediaError) {
            debugLog("⚠️ group_media fetch failed, using fallback images:", mediaError);
          }

          if (!groupSettingsError && groupSettings) {
            resolvedOpenGroupApplications =
              groupSettings.open_group_applications === true;
          }

          if (!groupMembersResult.error && Array.isArray(groupMembersResult.data) && groupMembersResult.data.length > 0) {
            const legacyMembers: any[] = Array.isArray(data.members) ? data.members : [];
            const linkedMembers = groupMembersResult.data.map((row: any) => {
              const legacy = legacyMembers.find((m: any) => m?.user_id && m.user_id === row.user_id);
              return {
                user_id: row.user_id,
                name: row.profiles?.full_name || "Member",
                avatar_url: row.profiles?.avatar_url || null,
                instrument: legacy?.instrument || row.role || "Member",
                role: row.role === "owner" || row.user_id === data.owner_id ? "Leader" : "Member",
              };
            });
            // Sort: owner/leader first
            linkedMembers.sort((a: any, b: any) => (a.role === "Leader" ? -1 : 1) - (b.role === "Leader" ? -1 : 1));
            data = { ...data, members: linkedMembers };
          }
        }
        // Fetch owner profile separately
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, role")
          .eq("id", ownerId)
          .single();
        debugLog("Owner profile:", ownerProfile);

        const studioTypeFromData =
          data?.type === "Rehearsal" ||
          data?.type === "Recording" ||
          data?.type === "Both"
            ? data.type
            : null;
        const inferredStudioTypeFromRates = inferStudioTypeFromRates(
          data?.rehearsal_rate,
          data?.recording_rate,
        );
        const normalizedStudioType =
          type === "Studio" || type === "Venue"
            ? normalizeStudioType(data?.studio_type || studioTypeFromData) ||
            inferredStudioTypeFromRates ||
            data?.studio_type ||
            studioTypeFromData
            : null;

        const normalizedData = {
          ...data,
          type,
          name: data.name || data.full_name, // Handle profile name
          description: data.description || data.bio, // Handle profile bio
          image: data.image || data.avatar_url, // Handle profile avatar
          images: resolvedImages.length > 0 ? resolvedImages : (data.avatar_url ? [data.avatar_url] : []),
          location: data.location || data.address, // Handle profile address
          genre: data.genre || (data.genres ? data.genres.join(", ") : ""),
          owner_id: data.owner_id || ownerId,
          organizer_id: data.organizer_id || null,
          owner_name:
            ownerProfile?.full_name || data.name || data.full_name || "Unknown", // Use data.full_name if ownerProfile fails (self-managed)
          owner_avatar: ownerProfile?.avatar_url || data.avatar_url,
          role: ownerProfile?.role || data.role,
          rate:
            data.hourly_rate?.toString() ||
            data.budget?.toString() ||
            data.rate ||
            "0",
          review_count: data.review_count || 0,
          rating: data.rating || 0,
          studio_type: normalizedStudioType,
          open_group_applications:
            typeof data.open_group_applications === "boolean"
              ? data.open_group_applications
              : resolvedOpenGroupApplications ?? true,
        };

        // If studio or venue, fetch availability from operating hours
        if (type === "Studio" || type === "Venue") {
          debugLog("📅 Fetching studio availability data...");
          const [
            operatingHoursResult,
            dateOverridesResult,
            studioSettingsResult,
            studioTypesResult,
            studioPromotionsResult,
          ] = await Promise.all([
            supabase
              .from("studio_operating_hours")
              .select("*")
              .eq("studio_id", data.id)
              .order("slot_order", { ascending: true }),
            supabase
              .from("studio_date_overrides")
              .select("*")
              .eq("studio_id", data.id)
              .order("override_date", { ascending: true })
              .order("slot_order", { ascending: true }),
            supabase
              .from("studio_settings")
              .select("*")
              .eq("studio_id", data.id)
              .single(),
            supabase
              .from("studio_types")
              .select("studio_type")
              .eq("studio_id", data.id),
            supabase
              .from("studio_promotions")
              .select("*")
              .eq("studio_id", data.id)
              .eq("is_active", true),
          ]);

          const operatingHours = operatingHoursResult.data;
          const hoursError = operatingHoursResult.error;
          const dateOverrides = dateOverridesResult.data;
          const overridesError = dateOverridesResult.error;
          const studioSettings = studioSettingsResult.data;
          const settingsError = studioSettingsResult.error;
          const studioTypes = studioTypesResult.data;
          const studioTypesError = studioTypesResult.error;

          // Attach promotions to normalizedData
          normalizedData.promotions = studioPromotionsResult.data || [];

          if (studioTypesError) {
            debugLog("⚠️ Failed fetching studio_types, falling back to compatibility fields:", studioTypesError);
          } else if (Array.isArray(studioTypes)) {
            const inferredStudioTypeFromTypeRows = inferStudioTypeFromTypeRows(
              studioTypes.map((row: any) => row?.studio_type),
            );
            if (inferredStudioTypeFromTypeRows) {
              normalizedData.studio_type = inferredStudioTypeFromTypeRows;
            }
          }

          if (!hoursError && Array.isArray(operatingHours) && operatingHours.length > 0) {
            debugLog("📅 Operating hours fetched:", operatingHours);
            // Convert operating hours to availability format - now supports multiple slots per day
            const dayNames = [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ];
            const availability = dayNames.map((dayName, index) => {
              const dayHours = operatingHours.filter(
                (h: any) => h.day_of_week === index && h.is_open,
              );
              return {
                day: dayName,
                slots: dayHours.map((h: any) => ({
                  start: h.open_time,
                  end: h.close_time,
                  sessionType: getScheduleSessionType(h),
                })),
                sessionType: dayHours[0] ? getScheduleSessionType(dayHours[0]) : "both",
                weekly_schedule_scope: dayHours[0]?.weekly_schedule_scope,
                weekly_schedule_end_date: dayHours[0]?.weekly_schedule_end_date,
                weekly_schedule_dates: dayHours[0]?.weekly_schedule_dates,
                weeklyScheduleScope: dayHours[0]?.weekly_schedule_scope,
                weeklyScheduleEndDate: dayHours[0]?.weekly_schedule_end_date,
                weeklyScheduleDates: dayHours[0]?.weekly_schedule_dates,
              };
            });
            normalizedData.availability = availability;
            debugLog("📅 Converted availability:", availability);
          } else if (data.availability) {
            debugLog(
              "⚠️ No operating hours found, checking availability column...",
            );
            // Fallback: check if availability exists in the data (JSONB column)
            normalizedData.availability = data.availability;
            debugLog(
              "📅 Using availability from JSONB column:",
              data.availability,
            );
          }

          // Store date overrides for use in availability processing
          if (!overridesError && Array.isArray(dateOverrides)) {
            if (dateOverrides.length > 0) {
              debugLog("📅 Date overrides fetched:", dateOverrides);
            }
            normalizedData.dateOverrides = dateOverrides;
          }

          if (!settingsError && studioSettings) {
            debugLog("⚙️ Studio settings fetched:", studioSettings);
            normalizedData.settings = withDefaultStudioSettings(studioSettings);
          } else {
            debugLog("⚠️ No studio settings found, using defaults");
            normalizedData.settings = withDefaultStudioSettings();
          }
        }

        setListingDetailsCacheEntry(activeListingId, {
          data: normalizedData,
          existingBookings: cachedDetails?.existingBookings || [],
          fetchedAt: Date.now(),
        });

        if (latestListingIdRef.current !== activeListingId) {
          return;
        }

        debugLog("Setting group data:", normalizedData);
        setGroup(normalizedData);

        try {
          await syncFavoriteMetadata(
            getFavoriteTargetType(type),
            data.id,
            user?.id,
          );
        } catch (favoriteMetaError) {
          debugLog("Failed to sync favorite metadata:", favoriteMetaError);
          setIsFavorited(false);
          setFavoriteCount(0);
        }

        if (type === "Studio" || type === "Venue") {
          // Fetch existing bookings for availability calculation
          const fetchedBookings = await fetchStudioBookings(data.id);

          setListingDetailsCacheEntry(activeListingId, {
            data: normalizedData,
            existingBookings: fetchedBookings,
            fetchedAt: Date.now(),
          });

          if (latestListingIdRef.current !== activeListingId) {
            return;
          }

          setExistingBookings(fetchedBookings);

          // Process availability (Availability + Bookings + Date Overrides)
          if (normalizedData.availability) {
            debugLog("📅 Processing availability for calendar...");
            processAvailability(
              normalizedData.availability,
              fetchedBookings,
              normalizedData.dateOverrides,
              undefined,
              normalizedData.settings,
            );
          } else {
            debugLog("⚠️ No availability data to process");
          }
        } else {
          setListingDetailsCacheEntry(activeListingId, {
            data: normalizedData,
            existingBookings: [],
            fetchedAt: Date.now(),
          });
          setExistingBookings([]);
        }
      } else {
        debugLog("No data found for listingId:", listingId);
      }
    } catch (e) {
      debugLog("Error fetching details:", e);
    } finally {
      clearListingDetailsRequestInFlight(activeListingId);
      setLoading(false);
      debugLog("fetchGroupDetails complete, loading:", false);
    }
  };

  const processAvailability = (
    availability: any[],
    dbBookings: any[],
    dateOverrides?: any[],
    cartBookings?: any[],
    settingsOverride?: any,
  ) => {
    // Safeguard against undefined or non-array dbBookings
    const safeDbBookings = Array.isArray(dbBookings) ? dbBookings : [];

    debugLog("📅 processAvailability called with:", {
      availability,
      dbBookingsCount: safeDbBookings.length,
      dateOverridesCount: dateOverrides?.length || 0,
      cartBookingsCount: cartBookings?.length || 0,
    });
    const marked: any = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get lead time for filtering slots that are too soon
    const effectiveSettings = settingsOverride ?? group?.settings;
    const leadTimeHours = effectiveSettings?.lead_time_hours || 0;
    const minBookingTime = new Date();
    minBookingTime.setHours(minBookingTime.getHours() + leadTimeHours);

    // Map availability for easier lookup (weekly schedule)
    const availabilityMap: { [key: number]: any } = {};
    availability.forEach((daySchedule: any) => {
      const dayIndex = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ].indexOf(daySchedule.day.toLowerCase());
      if (dayIndex !== -1) {
        availabilityMap[dayIndex] = daySchedule;
        debugLog(
          `📅 Mapped ${daySchedule.day} (index ${dayIndex}) with ${daySchedule.slots?.length || 0} slots`,
        );
      }
    });

    // Map date overrides for easier lookup (specific dates override weekly schedule)
    const dateOverrideMap: { [key: string]: any[] } = {};
    if (dateOverrides && Array.isArray(dateOverrides)) {
      dateOverrides.forEach((override: any) => {
        const dateStr = override.override_date;
        if (!dateOverrideMap[dateStr]) {
          dateOverrideMap[dateStr] = [];
        }
        dateOverrideMap[dateStr].push(override);
        debugLog(
          `📅 Mapped date override for ${dateStr}: open=${override.is_open}, ${override.open_time} - ${override.close_time}`,
        );
      });
    }

    debugLog("📅 Availability map:", availabilityMap);
    debugLog("📅 Date override map:", dateOverrideMap);

    // Loop next 90 days to ensure coverage
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      // Use local date string to avoid timezone issues
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const dayIndex = date.getDay();

      // Check if there's a specific date override for this date (priority over weekly schedule)
      const dateOverrideRows = dateOverrideMap[dateStr];
      let daySchedule: any = null;

      if (dateOverrideRows) {
        // Use date override instead of weekly schedule
        daySchedule = getDateOverrideSchedule(
          dateStr,
          date,
          dateOverrideRows,
          group?.studio_type,
          selectedSessionType,
        );
        if (daySchedule) {
          debugLog(`📅 Using date override for ${dateStr}:`, daySchedule);
        }
      } else {
        // Use weekly schedule
        daySchedule = weeklyScheduleAllowsDate(
          effectiveSettings,
          dateStr,
          availabilityMap[dayIndex],
        )
          ? availabilityMap[dayIndex]
          : null;
      }

      // Check if Open
      if (daySchedule && daySchedule.slots && daySchedule.slots.length > 0) {
        const sessionAllowedSlots = daySchedule.slots.filter((slot: any) =>
          scheduleAllowsRequestedSession(
            {
              ...slot,
              sessionType: slot?.sessionType ?? slot?.session_type ?? daySchedule?.sessionType ?? daySchedule?.session_type,
              reason: slot?.reason ?? daySchedule?.reason,
            },
            group?.studio_type,
            selectedSessionType,
          ),
        );

        if (sessionAllowedSlots.length === 0) {
          marked[dateStr] = {
            disabled: true,
            disableTouchEvent: true,
            textColor: isDark ? "#4B5563" : "#D1D5DB",
          };
          continue;
        }

        // Calculate if Fully Booked
        // 1. Generate all potential slots for this day (considering lead time)
        const potentialSlots: string[] = [];
        sessionAllowedSlots.forEach((slot: any) => {
          const start = new Date(`${dateStr}T${slot.start}`);
          const end = new Date(`${dateStr}T${slot.end}`);
          const current = new Date(start);
          while (current < end) {
            // Only count slot if it passes lead time check
            if (current >= minBookingTime) {
              potentialSlots.push(current.toTimeString().slice(0, 5));
            }
            current.setHours(current.getHours() + 1);
          }
        });

        // If no potential slots available after lead time check, mark as unavailable
        if (potentialSlots.length === 0) {
          marked[dateStr] = {
            disabled: true,
            disableTouchEvent: true,
            textColor: isDark ? "#4B5563" : "#D1D5DB",
          };
          continue;
        }

        // 2. Check database bookings for this day (Confirmed OR Pending should block)
        // Studio bookings have separate booking_date (DATE), start_time (TIME), end_time (TIME) columns
        const dayDbBookings = safeDbBookings.filter((b: any) => {
          if (b.status === "cancelled" || b.status === "rejected") return false;
          // Match booking_date directly with the selected date string
          return b.booking_date === dateStr;
        });

        const blockedTimes = new Set<string>();


        dayDbBookings.forEach((b: any) => {

          const bStart = new Date(`${b.booking_date}T${b.start_time}`);
          const bEnd = new Date(`${b.booking_date}T${b.end_time}`);

          if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) {
            debugLog("⚠️ Invalid booking times in processAvailability:", b);
            return;
          }

          const current = new Date(bStart);
          while (current < bEnd) {
            blockedTimes.add(current.toTimeString().slice(0, 5));
            current.setHours(current.getHours() + 1);
          }
        });

        // Also block times from cart bookings (same date)
        if (cartBookings && cartBookings.length > 0) {
          const cartBookingsForDate = cartBookings.filter((b) => {
            const cartDate = b?.date instanceof Date ? b.date : new Date(b?.date);
            if (Number.isNaN(cartDate.getTime())) return false;
            const cartDateStr = toLocalDateKey(cartDate);
            return cartDateStr === dateStr;
          });

          cartBookingsForDate.forEach((b) => {
            // If booking has timeSlots array, use that (multi-slot booking)
            if (b.timeSlots && b.timeSlots.length > 0) {
              b.timeSlots.forEach((slot: any) => {
                const slotStart = new Date(`${dateStr}T${slot.start}`);
                const slotEnd = new Date(`${dateStr}T${slot.end}`);
                const current = new Date(slotStart);
                while (current < slotEnd) {
                  blockedTimes.add(current.toTimeString().slice(0, 5));
                  current.setHours(current.getHours() + 1);
                }
              });
            } else if (b.startTime && b.endTime) {
              // Single slot booking - use startTime and endTime
              const current = new Date(b.startTime);
              while (current < b.endTime) {
                blockedTimes.add(current.toTimeString().slice(0, 5));
                current.setHours(current.getHours() + 1);
              }
            }
          });
        }

        const availableCount = potentialSlots.filter(
          (s) => !blockedTimes.has(s),
        ).length;

        if (availableCount > 0) {
          marked[dateStr] = {
            marked: true,
            dotColor: "#10B981",
          };
        } else {
          // Fully Booked
          marked[dateStr] = {
            disabled: true,
            disableTouchEvent: true,
            textColor: isDark ? "#4B5563" : "#D1D5DB",
          };
        }
      } else {
        // Close / Unavailable
        marked[dateStr] = {
          disabled: true,
          disableTouchEvent: true,
          textColor: isDark ? "#4B5563" : "#D1D5DB", // Gray out
        };
      }
    }

    debugLog("📅 Marked dates count:", Object.keys(marked).length);
    debugLog("📅 Sample marked dates:", Object.keys(marked).slice(0, 5));
    setMarkedDates(marked);

    if (selectedDate && marked[selectedDate]?.disabled) {
      setSelectedDate("");
      setSelectedSlot(null);
      setValidEndTimes([]);
      setEndTime(null as any);
      setDate(null as any);
      setAvailableSlots([]);
    }
  };

  const fetchAvailableSlots = async (dateStr: string): Promise<string[]> => {
    debugLog("🕐 fetchAvailableSlots called for date:", dateStr);
    debugLog("🕐 group.availability:", group?.availability);
    debugLog("🕐 group.dateOverrides:", group?.dateOverrides);

    if (!group?.availability) {
      debugLog("⚠️ No availability data in group");
      setAvailableSlots([]);
      return [];
    }

    const selectedDate = new Date(dateStr);
    const dayName = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][selectedDate.getDay()];
    debugLog("🕐 Looking for day:", dayName);

    // Check if there's a specific date override for this date
    let daySchedule: any = null;

    if (group.dateOverrides && Array.isArray(group.dateOverrides)) {
      const dateOverrideRows = group.dateOverrides.filter(
        (o: any) => o.override_date === dateStr,
      );
      if (dateOverrideRows.length > 0) {
        debugLog("🕐 Found date override:", dateOverrideRows);
        daySchedule = getDateOverrideSchedule(
          dateStr,
          selectedDate,
          dateOverrideRows,
          group?.studio_type,
          selectedSessionType,
        );
        if (!daySchedule) {
          // Date is closed
          debugLog("⚠️ Date override marks this date as closed");
          setAvailableSlots([]);
          return [];
        }
      }
    }

    // Fall back to weekly schedule if no override
    if (!daySchedule) {
      const weeklyDaySchedule = group.availability.find(
        (a: any) => a.day.toLowerCase() === dayName,
      );
      if (
        weeklyDaySchedule &&
        weeklyScheduleAllowsDate(group?.settings, dateStr, weeklyDaySchedule)
      ) {
        daySchedule = weeklyDaySchedule;
      }
    }

    debugLog("🕐 Found day schedule:", daySchedule);

    if (!daySchedule || !daySchedule.slots) {
      debugLog("⚠️ No slots for this day");
      setAvailableSlots([]);
      return [];
    }

    const sessionAllowedSlots = daySchedule.slots.filter((slot: any) =>
      scheduleAllowsRequestedSession(
        {
          ...slot,
          sessionType: slot?.sessionType ?? slot?.session_type ?? daySchedule?.sessionType ?? daySchedule?.session_type,
          reason: slot?.reason ?? daySchedule?.reason,
        },
        group?.studio_type,
        selectedSessionType,
      ),
    );

    if (sessionAllowedSlots.length === 0) {
      debugLog("⚠️ No slots for selected session type on this day");
      setAvailableSlots([]);
      return [];
    }

    // Generate time slots from the availability
    // Use Set to prevent duplicates
    const slotsSet = new Set<string>();

    // Identify blocked times from existing bookings (Confirmed OR Pending)
    // Studio bookings have separate booking_date (DATE), start_time (TIME), end_time (TIME) columns
    const safeExistingBookings = Array.isArray(existingBookings) ? existingBookings : [];
    const dayBookings = safeExistingBookings.filter((b: any) => {
      if (b.status === "cancelled" || b.status === "rejected") return false;
      // Match booking_date directly with the selected date string
      const bookingDateStr = b.booking_date;
      return bookingDateStr === dateStr;
    });
    debugLog(
      "🕐 Day bookings:",
      dayBookings.length,
      dayBookings.map((b: any) => ({
        date: b.booking_date,
        start: b.start_time,
        end: b.end_time,
        status: b.status,
      })),
    );

    // Recording now uses the same slot-based flow as rehearsal.
    setIsRecordingWholeDayAvailable(false);
    setRecordingDaySlot(null);

    const blockedTimes = new Set<string>();

    // Block times from existing database bookings
    dayBookings.forEach((b: any) => {
      // start_time and end_time are TIME columns (e.g., "09:00:00" or "09:00")
      // Combine with booking_date to create proper Date objects
      const bStart = new Date(`${b.booking_date}T${b.start_time}`);
      const bEnd = new Date(`${b.booking_date}T${b.end_time}`);

      if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) {
        debugLog("⚠️ Invalid booking times:", b);
        return;
      }

      const current = new Date(bStart);
      while (current < bEnd) {
        blockedTimes.add(current.toTimeString().slice(0, 5));
        current.setHours(current.getHours() + 1);
      }
    });

    // Also block times from bookings already added to cart (same date)
    const cartBookingsForDate = bookings.filter((b) => {
      const cartDate = b?.date instanceof Date ? b.date : new Date(b?.date);
      if (Number.isNaN(cartDate.getTime())) return false;
      const cartDateStr = toLocalDateKey(cartDate);
      return cartDateStr === dateStr;
    });

    cartBookingsForDate.forEach((b) => {
      // If booking has timeSlots array, use that (multi-slot booking)
      if (b.timeSlots && b.timeSlots.length > 0) {
        b.timeSlots.forEach((slot) => {
          const slotStart = new Date(`${dateStr}T${slot.start}`);
          const slotEnd = new Date(`${dateStr}T${slot.end}`);
          const current = new Date(slotStart);
          while (current < slotEnd) {
            blockedTimes.add(current.toTimeString().slice(0, 5));
            current.setHours(current.getHours() + 1);
          }
        });
      } else {
        // Single slot booking - use startTime and endTime
        const current = new Date(b.startTime);
        while (current < b.endTime) {
          blockedTimes.add(current.toTimeString().slice(0, 5));
          current.setHours(current.getHours() + 1);
        }
      }
    });

    // Also block times from currently selected time slots (for multi-slot selection on same day)
    selectedTimeSlots.forEach((slot) => {
      const slotStart = new Date(`${dateStr}T${slot.start}`);
      const slotEnd = new Date(`${dateStr}T${slot.end}`);
      const current = new Date(slotStart);
      while (current < slotEnd) {
        blockedTimes.add(current.toTimeString().slice(0, 5));
        current.setHours(current.getHours() + 1);
      }
    });

    debugLog("🕐 Blocked times (including cart):", Array.from(blockedTimes));

    sessionAllowedSlots.forEach((slot: any) => {
      debugLog("🕐 Processing slot:", slot);
      const start = new Date(`${dateStr}T${slot.start}`);
      const end = new Date(`${dateStr}T${slot.end}`);

      // Get lead time for filtering slots that are too soon
      const leadTimeHours = group?.settings?.lead_time_hours || 0;
      const minBookingTime = new Date();
      minBookingTime.setHours(minBookingTime.getHours() + leadTimeHours);

      // Generate hourly slots or based on duration
      const current = new Date(start);
      while (current < end) {
        const timeStr = current.toTimeString().slice(0, 5); // HH:MM

        // Check if this slot is past the lead time requirement
        const slotDateTime = new Date(`${dateStr}T${timeStr}`);
        const passesLeadTime = slotDateTime >= minBookingTime;

        // Only add if not blocked AND passes lead time check
        if (!blockedTimes.has(timeStr) && passesLeadTime) {
          slotsSet.add(timeStr);
        }
        current.setHours(current.getHours() + 1); // Assuming 1-hour slots
      }
    });

    const uniqueSlots = Array.from(slotsSet).sort();
    debugLog("🕐 Generated slots:", uniqueSlots);
    setAvailableSlots(uniqueSlots);
    return uniqueSlots;
  };

  const toggleFavorite = async () => {
    const targetType = getFavoriteTargetType(group?.type);
    if (!targetType || !group?.id) {
      showSheetAlert(
        "info",
        "Bookmark Unavailable",
        "Bookmarking is currently available for artists, groups, studios, and gigs.",
      );
      return;
    }

    if (!userId) {
      showSheetAlert(
        "warning",
        "Login Required",
        "Please sign in to bookmark listings.",
      );
      return;
    }

    const previousState = isFavorited;
    const previousCount = favoriteCount;
    const optimisticState = !previousState;
    const optimisticCount = Math.max(
      0,
      previousCount + (optimisticState ? 1 : -1),
    );

    setIsFavorited(optimisticState);
    setFavoriteCount(optimisticCount);
    emitFavoriteChanged({
      favoriteCount: optimisticCount,
      id: group.id,
      isFavorited: optimisticState,
      targetType,
    });

    try {
      const { data, error } = await supabase.functions.invoke("manage-details", {
        body: {
          action: "toggle_favorite",
          type: targetType,
          id: group.id,
          userId,
        },
      });

      if (error) throw error;

      const resolvedFavorited =
        typeof data?.is_favorited === "boolean"
          ? data.is_favorited
          : optimisticState;

      setIsFavorited(resolvedFavorited);

      if (typeof data?.favorites_count === "number") {
        const resolvedFavoriteCount = Math.max(0, data.favorites_count);
        setFavoriteCount(resolvedFavoriteCount);
        emitFavoriteChanged({
          favoriteCount: resolvedFavoriteCount,
          id: group.id,
          isFavorited: resolvedFavorited,
          targetType,
        });
      } else {
        await syncFavoriteMetadata(targetType, group.id, userId);
      }

      // AI LEARNING: If favoriting, update user interest profile
      if (resolvedFavorited && !previousState && group.embedding) {
        try {
          await supabase.rpc("update_user_interest", {
            p_user_id: userId,
            p_item_vector: group.embedding,
            p_weight: 0.3, // Strong learning signal for explicit favorite
          });
        } catch (e) {
          debugLog("Error updating interest:", e);
        }
      }
    } catch (e: any) {
      setIsFavorited(previousState);
      setFavoriteCount(previousCount);
      emitFavoriteChanged({
        favoriteCount: previousCount,
        id: group.id,
        isFavorited: previousState,
        targetType,
      });
      showSheetAlert(
        "error",
        "Bookmark Failed",
        e?.message || "Unable to update bookmark right now.",
      );
    }
  };

  useListingSheetEffects({
    group,
    listingId,
    userId,
    bookings,
    selectedTimeSlots,
    selectedSessionType,
    existingBookings,
    selectedDate,
    processAvailability,
    fetchAvailableSlots,
    setReviews,
    setRelatedListings,
  });

  usePageLoadLogger({
    counts: {
      bookings: bookings.length,
      existingBookings: existingBookings.length,
      relatedListings: relatedListings.length,
      reviews: reviews.length,
      userGroups: userGroups.length,
    },
    details: {
      listingId: listingId ? "present" : "missing",
      type: group?.type || "unknown",
      user: userId ? "signed-in" : "guest",
    },
    loading,
    page: "ListingDetailsSheet",
    ready: !loading && Boolean(group),
    enabled: Boolean(listingId),
  });

  const renderBackdrop = React.useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    [],
  );

  const {
    labels,
    rehearsalRate,
    recordingRate,
    hasDualPricing,
    displayRate,
    showTabs: hasDefaultTabs,
  } = useListingSheetDerived(group);

  const effectiveDisplayRate = useMemo(() => {
    const isStudioLike = group?.type === "Studio" || group?.type === "Venue";
    if (!isStudioLike) return displayRate;

    const rehearsal = Number(group?.rehearsal_rate || 0);
    const recording = Number(group?.recording_rate || 0);
    const normalizedType = normalizeStudioType(group?.studio_type);

    if (normalizedType === "Recording") {
      if (recording > 0) return recording.toLocaleString();
      if (rehearsal > 0) return rehearsal.toLocaleString();
      return displayRate;
    }

    if (normalizedType === "Rehearsal") {
      if (rehearsal > 0) return rehearsal.toLocaleString();
      if (recording > 0) return recording.toLocaleString();
      return displayRate;
    }

    if (normalizedType === "Both") {
      if (selectedSessionType === "Recording" && recording > 0) {
        return recording.toLocaleString();
      }
      if (selectedSessionType === "Rehearsal" && rehearsal > 0) {
        return rehearsal.toLocaleString();
      }
      if (rehearsal > 0) return rehearsal.toLocaleString();
      if (recording > 0) return recording.toLocaleString();
      return displayRate;
    }

    return displayRate;
  }, [
    displayRate,
    group?.rehearsal_rate,
    group?.recording_rate,
    group?.studio_type,
    group?.type,
    selectedSessionType,
  ]);

  const isGroupListing = group?.type === "Group";
  const isGigListing = group?.type === "Gig";
  const normalizedGigStatus = String(group?.status || "").trim().toLowerCase();
  const gigTotalSlotsNeeded = Number(group?.requirements?.total_slots_needed ?? group?.total_slots_needed ?? 0);
  const gigTotalSlotsFilled = Number(group?.total_slots_filled ?? 0);
  const isGigFull =
    isGigListing &&
    (
      normalizedGigStatus === "closed" ||
      normalizedGigStatus === "cancelled" ||
      (
        Number.isFinite(gigTotalSlotsNeeded) &&
        gigTotalSlotsNeeded > 0 &&
        Number.isFinite(gigTotalSlotsFilled) &&
        gigTotalSlotsFilled >= gigTotalSlotsNeeded
      )
    );
  const effectiveUserRole = userRole || currentUserRole;
  const isFan = isFanUserRole(effectiveUserRole);
  const isMusicianUser = effectiveUserRole === "musician";
  const hasStructuredConnectionTab =
    !isGuest &&
    effectiveUserRole === "producer" &&
    (group?.type === "Group" || group?.type === "Artist");
  const hasGroupConnectContent =
    !isGuest &&
    group?.type === "Group" &&
    (effectiveUserRole === "venue-owner" ||
      (effectiveUserRole === "musician" && !!group?.requirements?.audition) ||
      hasStructuredConnectionTab);
  const shouldShowConnectTab = hasStructuredConnectionTab || hasGroupConnectContent;
  const canApplyToGroup =
    isGroupListing &&
    !isGuest &&
    group?.open_group_applications === true &&
    !!userId &&
    effectiveUserRole === "musician" &&
    group?.owner_id !== userId;

  useEffect(() => {
    if (!isGuest && activeTab === "Connect" && effectiveUserRole === "producer" && activeUserId) {
      void fetchProductionTeams();
    }
  }, [activeTab, activeUserId, effectiveUserRole, fetchProductionTeams, isGuest]);

  const tabsToRender = useMemo(() => {
    const baseTabs = Array.isArray(labels.tabs) ? [...labels.tabs] : [];

    if (!baseTabs.includes("Review")) {
      baseTabs.push("Review");
    }

    const roleFilteredTabs = isMusicianUser
      ? baseTabs
      : baseTabs.filter((tab) => !["Apply", "Book"].includes(tab));
    const availabilityFilteredTabs = isGigFull
      ? roleFilteredTabs.filter((tab) => tab !== "Apply")
      : roleFilteredTabs;

    if (isGuest) {
      return availabilityFilteredTabs.filter((tab) => tab !== "Connect");
    }

    if (shouldShowConnectTab && !availabilityFilteredTabs.includes("Connect")) {
      const reviewTabIndex = availabilityFilteredTabs.indexOf("Review");
      if (reviewTabIndex === -1) {
        availabilityFilteredTabs.push("Connect");
      } else {
        availabilityFilteredTabs.splice(reviewTabIndex, 0, "Connect");
      }
    }

    if (!isGroupListing) {
      return availabilityFilteredTabs;
    }

    const withoutApply = availabilityFilteredTabs.filter((tab) => tab !== "Apply");
    if (!canApplyToGroup) {
      return withoutApply;
    }

    if (withoutApply.includes("Apply")) {
      return withoutApply;
    }

    const reviewTabIndex = withoutApply.indexOf("Review");
    if (reviewTabIndex === -1) {
      return [...withoutApply, "Apply"];
    }

    const nextTabs = [...withoutApply];
    nextTabs.splice(reviewTabIndex, 0, "Apply");
    return nextTabs;
  }, [canApplyToGroup, isGigFull, isGroupListing, isGuest, isMusicianUser, labels.tabs, shouldShowConnectTab]);

  const showTabs = hasDefaultTabs && tabsToRender.length > 0;
  const visibleActiveTab = tabsToRender.includes(activeTab)
    ? activeTab
    : tabsToRender[0] || "About";
  const activeTabIndex = getSmoothTabIndex(tabsToRender, visibleActiveTab);

  useEffect(() => {
    if (!tabsToRender.length) {
      return;
    }

    if (!tabsToRender.includes(activeTab)) {
      setActiveTab(tabsToRender[0]);
    }
  }, [activeTab, tabsToRender]);

  const renderTabs = () => (
    <SlidingTabBar
      activeColor={colors.primary}
      activeKey={visibleActiveTab}
      borderColor={colors.border}
      indicatorColor={colors.primary}
      indicatorWidthRatio={0.34}
      onChange={(tab) => setSmoothTab(setActiveTab, tab)}
      tabs={tabsToRender.map((tab) => ({ key: tab, label: tab }))}
      textStyle={styles.tabText}
    />
  );

  const renderBookingControls = () => (
    <BookingControls
      colors={colors}
      isDark={isDark}
      group={group}
      selectedSessionType={selectedSessionType}
      setSelectedSessionType={setSelectedSessionType}
      setSelectedDate={setSelectedDate}
      setSelectedSlot={setSelectedSlot}
      setValidEndTimes={setValidEndTimes}
      setIsRecordingWholeDayAvailable={setIsRecordingWholeDayAvailable}
      setRecordingDaySlot={setRecordingDaySlot}
      isRecordingMode={isRecordingMode}
      duration={duration}
      markedDates={markedDates}
      selectedDate={selectedDate}
      fetchAvailableSlots={fetchAvailableSlots}
      setEndTime={setEndTime}
      setDate={setDate}
      availableSlots={availableSlots}
      selectedSlot={selectedSlot}
      validEndTimes={validEndTimes}
      date={date}
      endTime={endTime}
      recordingDaySlot={recordingDaySlot}
      isRecordingWholeDayAvailable={isRecordingWholeDayAvailable}
      displayRate={effectiveDisplayRate}
    />
  );

  const renderDurationControl = () => null; // Removed in favor of computed duration

  // --- SUB-SECTIONS ---

  const renderReviews = () => (
    <ReviewsTab
      group={group}
      colors={colors}
      styles={styles}
      reviews={reviews}
      relatedListings={relatedListings}
    />
  );

  // Studio: Setup Tab (also used for Venue Specs)
  const renderStudioSetup = () => (
    <StudioSetupTab
      group={group}
      colors={colors}
      isDark={isDark}
      styles={styles}
    />
  );

  // Studio: Book Tab
  const renderStudioBook = () => (
    <StudioBookTab
      group={group}
      bookings={bookings}
      setBookings={setBookings}
      displayRate={effectiveDisplayRate}
      isDark={isDark}
      colors={colors}
      hasExistingStudioBooking={hasExistingStudioBooking}
      existingStudioBookingStatus={existingStudioBookingStatus}
      sheetRef={ref}
      router={router}
      renderBookingControls={renderBookingControls}
      isRecordingMode={isRecordingMode}
      isRecordingWholeDayAvailable={isRecordingWholeDayAvailable}
      isCheckingAvailability={isCheckingAvailability}
      setIsCheckingAvailability={setIsCheckingAvailability}
      selectedDate={selectedDate}
      recordingDaySlot={recordingDaySlot}
      userId={userId}
      supabase={supabase}
      setShowAddBooking={setShowAddBooking}
      setSelectedDate={setSelectedDate}
      setIsRecordingWholeDayAvailable={setIsRecordingWholeDayAvailable}
      setRecordingDaySlot={setRecordingDaySlot}
      date={date}
      endTime={endTime}
      selectedSlot={selectedSlot}
      selectedTimeSlots={selectedTimeSlots}
      setSelectedTimeSlots={setSelectedTimeSlots}
      setDate={setDate}
      setEndTime={setEndTime}
      setSelectedSlot={setSelectedSlot}
      setValidEndTimes={setValidEndTimes}
      showAddBooking={showAddBooking}
      bookingNotes={bookingNotes}
      setBookingNotes={setBookingNotes}
      loading={loading}
      setLoading={setLoading}
      handleConfirm={handleConfirm}
      setModalVisible={setModalVisible}
      setPaymentBookingData={setPaymentBookingData}
      setSelectedPaymentType={setSelectedPaymentType}
      setShowPaymentOptionModal={setShowPaymentOptionModal}
      showPaymentOptionModal={showPaymentOptionModal}
      selectedSessionType={selectedSessionType}
      promotions={group?.promotions || []}
      showAlert={showSheetAlert}
    />
  );

  // Gig: Info Tab
  const renderGigInfo = () => {
    return (
      <GigInfoTab
        group={group}
        colors={colors}
        isDark={isDark}
        styles={styles}
      />
    );
  };

  // Gig: Apply Tab
  const renderGigApply = () => (
    <GigApplyTab
      colors={colors}
      isDark={isDark}
      group={group}
      applicationContext="gig"
      userId={userId}
      pitchMessage={pitchMessage}
      setPitchMessage={setPitchMessage}
      cvFile={cvFile}
      cvUrl={cvUrl}
      setCvFile={setCvFile}
      setCvUrl={setCvUrl}
      videoUrl={videoUrl}
      setVideoUrl={setVideoUrl}
      isSubmittingApplication={isSubmittingApplication}
      hasExistingApplication={hasExistingApplication}
      existingApplicationStatus={existingApplicationStatus}
      isBlocked={isBlocked}
      blockReason={blockReason}
      userGroups={userGroups}
      selectedGroupId={selectedGroupId}
      setSelectedGroupId={setSelectedGroupId}
      userRole={userRole}
      productionTeams={productionTeams}
      loadingProductionTeams={loadingProductionTeams}
      selectedProductionTeamId={selectedProductionTeamId}
      setSelectedProductionTeamId={setSelectedProductionTeamId}
      productionRoster={productionRoster}
      selectedProductionRosterId={selectedProductionRosterId}
      setSelectedProductionRosterId={setSelectedProductionRosterId}
      selectedSlotType={selectedSlotType}
      setSelectedSlotType={setSelectedSlotType}
      groupAlreadyApplied={groupAlreadyApplied}
      groupApplicationBy={groupApplicationBy}
      handleSubmitApplication={handleSubmitApplication}
    />
  );

  const renderGroupApply = () => (
    <GigApplyTab
      colors={colors}
      isDark={isDark}
      group={group}
      applicationContext="group"
      userId={userId}
      pitchMessage={pitchMessage}
      setPitchMessage={setPitchMessage}
      cvFile={cvFile}
      cvUrl={cvUrl}
      setCvFile={setCvFile}
      setCvUrl={setCvUrl}
      videoUrl={videoUrl}
      setVideoUrl={setVideoUrl}
      isSubmittingApplication={isSubmittingApplication}
      hasExistingApplication={hasExistingApplication}
      existingApplicationStatus={existingApplicationStatus}
      isBlocked={isBlocked}
      blockReason={blockReason}
      userGroups={userGroups}
      selectedGroupId={selectedGroupId}
      setSelectedGroupId={setSelectedGroupId}
      userRole={userRole}
      productionTeams={productionTeams}
      loadingProductionTeams={loadingProductionTeams}
      selectedProductionTeamId={selectedProductionTeamId}
      setSelectedProductionTeamId={setSelectedProductionTeamId}
      productionRoster={productionRoster}
      selectedProductionRosterId={selectedProductionRosterId}
      setSelectedProductionRosterId={setSelectedProductionRosterId}
      selectedSlotType={selectedSlotType}
      setSelectedSlotType={setSelectedSlotType}
      groupAlreadyApplied={groupAlreadyApplied}
      groupApplicationBy={groupApplicationBy}
      handleSubmitApplication={handleSubmitApplication}
    />
  );

  // --- GROUP TABS ---

  const handleProfileNavigation = () => {
    const targetProfileId = group?.owner_id || group?.organizer_id || null;

    if (!targetProfileId) {
      showSheetAlert(
        "error",
        "Profile Unavailable",
        "We couldn't find this profile right now.",
      );
      return;
    }

    if (ref && "current" in ref && ref.current) {
      (ref as any).current.dismiss();
    }

    setTimeout(() => {
      router.push({
        pathname: "/profile",
        params: {
          userId: targetProfileId,
          returnToHome: "1",
          returnListingId: listingId || "",
        },
      });
    }, 200);
  };

  const openListingChat = useCallback(() => {
    if (!userId) {
      showSheetAlert("info", "Login Required", "Please sign in to start chatting.");
      return;
    }

    const recipientId = group?.owner_id || group?.organizer_id || (group?.type === "Artist" ? group?.id : null);
    if (!recipientId) {
      showSheetAlert("error", "Chat Unavailable", "We couldn't find who to message for this listing.");
      return;
    }

    if (recipientId === userId) {
      showSheetAlert("info", "You're the Owner", "This listing already belongs to you.");
      return;
    }

    if (ref && "current" in ref && ref.current) {
      (ref as any).current.dismiss();
    }

    setTimeout(() => {
      router.push({
        pathname: "/chat",
        params: {
          recipientId,
          recipientName: group?.name || "Listing Owner",
          recipientAvatar: group?.owner_avatar || group?.avatar_url || group?.image || "",
          groupId: group?.type === "Group" ? group?.id : undefined,
          studioId:
            group?.type === "Studio" || group?.type === "Venue" ? group?.id : undefined,
          gigId: group?.type === "Gig" ? group?.id : undefined,
        },
      });
    }, 200);
  }, [group, ref, showSheetAlert, userId]);

  const createListingRequest = useCallback(
    async (request: {
      receiverUserId: string;
      senderEntityType: "musician" | "group" | "venue" | "production_team";
      senderEntityName: string;
      senderEntityId?: string | null;
      receiverEntityType: "musician" | "group" | "venue" | "production_team";
      receiverEntityName: string;
      receiverEntityId?: string | null;
      groupId?: string | null;
      studioId?: string | null;
      productionTeamId?: string | null;
      notificationTitle: string;
      notificationMessage: string;
      notificationImage?: string | null;
      requestKind: "invite" | "application";
      contextLabel?: string;
      requireSlotSelection?: boolean;
      requireRosterSelection?: boolean;
      extraMeta?: Record<string, unknown> | null;
    }) => {
      if (listingRequestInFlightRef.current || isSendingRequest) {
        return;
      }

      if (!currentUserId) {
        showSheetAlert("info", "Login Required", "Please sign in to send requests.");
        return;
      }

      const normalizedPitchMessage = requestPitchMessage.trim();
      if (!normalizedPitchMessage) {
        showSheetAlert("error", "Pitch Required", "Add a short pitch before sending the request.");
        return;
      }

      const normalizedApplicationContext = requestApplicationContext.trim();
      const normalizedVideoUrl = requestVideoUrl.trim();
      if (!normalizedApplicationContext) {
        showSheetAlert(
          "error",
          `${request.contextLabel || "Context"} Required`,
          `Add ${String(request.contextLabel || "the request context").toLowerCase()} before sending the request.`,
        );
        return;
      }

      if (!requestDocumentFile && !requestDocumentUrl.trim()) {
        showSheetAlert(
          "error",
          request.requestKind === "invite" ? "Contract Required" : "CV Required",
          request.requestKind === "invite"
            ? "Upload a contract PDF before sending this invite."
            : "Upload your CV before sending this application.",
        );
        return;
      }

      if (request.requestKind === "application" && !normalizedVideoUrl) {
        showSheetAlert("error", "Video Required", "Upload a video or reel before sending this application.");
        return;
      }

      if (request.requireSlotSelection && requestSlotOptions.length > 0 && !selectedSlotType) {
        showSheetAlert("error", "Preferred Slot Required", "Choose the slot you want to fill before sending this application.");
        return;
      }

      if (request.requireRosterSelection) {
        if (!filteredRequestRoster.length) {
          showSheetAlert(
            "error",
            "Featured Performer Required",
            selectedProductionTeam
              ? `Add a matching roster entry to ${selectedProductionTeam.name} before sending this application.`
              : "Add a matching roster entry before sending this application.",
          );
          return;
        }

        if (!selectedProductionRosterEntry) {
          showSheetAlert("error", "Featured Performer Required", "Choose which performer this application is for before sending it.");
          return;
        }
      }

      listingRequestInFlightRef.current = true;
      setIsSendingRequest(true);
      try {
        let uploadedDocumentUrl = requestDocumentUrl.trim() || null;
        if (requestDocumentFile) {
          try {
            uploadedDocumentUrl = await uploadListingRequestDocument(
              currentUserId,
              requestDocumentFile,
              request.requestKind === "invite" ? "contracts" : "applications",
            );
          } catch (uploadError) {
            console.error("Error uploading request document:", uploadError);
            showSheetAlert(
              "error",
              "Upload Failed",
              request.requestKind === "invite"
                ? "We couldn't upload the contract right now."
                : "We couldn't upload the CV right now.",
            );
            return;
          }
        }

        const requestDetails = {
          pitch_message: normalizedPitchMessage,
          application_context: normalizedApplicationContext,
          context_label: request.contextLabel || null,
          request_kind: request.requestKind,
          cv_url: request.requestKind === "application" ? uploadedDocumentUrl : null,
          video_url: request.requestKind === "application" ? normalizedVideoUrl : null,
          contract_url: request.requestKind === "invite" ? uploadedDocumentUrl : null,
          slot_type: selectedSlotType || null,
          roster_entry_id: selectedProductionRosterEntry?.id || null,
          roster_entry_name:
            selectedProductionRosterEntry?.display_name ||
            selectedProductionRosterEntry?.group?.name ||
            selectedProductionRosterEntry?.full_name ||
            null,
          roster_entry_kind: selectedProductionRosterEntry?.entity_kind || null,
        };

        await submitListingRequest({
          currentUserId,
          receiverUserId: request.receiverUserId,
          message: normalizedPitchMessage,
          senderEntityType: request.senderEntityType,
          senderEntityName: request.senderEntityName,
          senderEntityId: request.senderEntityId,
          receiverEntityType: request.receiverEntityType,
          receiverEntityName: request.receiverEntityName,
          receiverEntityId: request.receiverEntityId,
          groupId: request.groupId,
          studioId: request.studioId,
          productionTeamId: request.productionTeamId,
          notificationTitle: request.notificationTitle,
          notificationMessage: request.notificationMessage,
          notificationImage: request.notificationImage,
          attachmentUrl: uploadedDocumentUrl,
          extraMeta: {
            listing_type: group?.type || null,
            listing_id: group?.id || listingId || null,
            ...(request.extraMeta || {}),
            request_details: requestDetails,
          },
        });

        setRequestPitchMessage("");
        setRequestApplicationContext("");
        setRequestDocumentFile(null);
        setRequestDocumentUrl("");
        setRequestVideoUrl("");
        showSheetAlert(
          "success",
          request.requestKind === "invite" ? "Invite Sent" : "Application Sent",
          request.requestKind === "invite"
            ? `Your invite to ${request.receiverEntityName || "this performer"} has been sent.`
            : "Your application has been sent.",
        );
      } catch (error) {
        console.error("Error creating listing request:", error);
        const errorMessage =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "We couldn't send that request right now.";
        showSheetAlert("error", "Request Failed", errorMessage);
      } finally {
        listingRequestInFlightRef.current = false;
        setIsSendingRequest(false);
      }
    },
    [
      currentUserId,
      group?.id,
      group?.type,
      listingId,
      requestApplicationContext,
      requestDocumentFile,
      requestDocumentUrl,
      requestPitchMessage,
      requestVideoUrl,
      filteredRequestRoster,
      isSendingRequest,
      selectedProductionRosterEntry,
      selectedProductionTeam,
      selectedSlotType,
      showSheetAlert,
      requestSlotOptions.length,
    ],
  );

  const handleInviteGroupToTeam = useCallback(() => {
    if (!selectedProductionTeam) {
      showSheetAlert("error", "Select Team", "Choose which production team will send the invite.");
      return;
    }

    const receiverUserId = group?.owner_id || (group?.type === "Artist" ? group?.id : null);
    if (!receiverUserId) {
      showSheetAlert("error", "Invite Unavailable", "We couldn't identify who should receive this invite.");
      return;
    }

    void createListingRequest({
      receiverUserId,
      senderEntityType: "production_team",
      senderEntityName: selectedProductionTeam.name || "Production Team",
      senderEntityId: selectedProductionTeam.id,
      receiverEntityType: group?.type === "Artist" ? "musician" : "group",
      receiverEntityName: group?.name || "Musician",
      receiverEntityId: group?.id || null,
      groupId: group?.type === "Group" ? group?.id : null,
      productionTeamId: selectedProductionTeam.id,
      notificationTitle: "New production team invite",
      notificationMessage: `${selectedProductionTeam.name} invited you to connect on MusikaLokal.`,
      notificationImage: selectedProductionTeam.logo_url || null,
      requestKind: "invite",
      contextLabel: "Invite Context",
      extraMeta: { request_kind: "invite" },
    });
  }, [createListingRequest, group, selectedProductionTeam, showSheetAlert]);

  const handleApplyTeamToVenue = useCallback(() => {
    if (!selectedProductionTeam) {
      showSheetAlert("error", "Select Team", "Choose which production team is applying.");
      return;
    }

    const receiverUserId = group?.owner_id || group?.organizer_id;
    if (!receiverUserId || !group?.id) {
      showSheetAlert("error", "Apply Unavailable", "We couldn't identify this venue owner right now.");
      return;
    }

    void createListingRequest({
      receiverUserId,
      senderEntityType: "production_team",
      senderEntityName: selectedProductionTeam.name || "Production Team",
      senderEntityId: selectedProductionTeam.id,
      receiverEntityType: "venue",
      receiverEntityName: group?.name || "Venue",
      receiverEntityId: group?.id,
      studioId: group?.id,
      productionTeamId: selectedProductionTeam.id,
      notificationTitle: "New venue application",
      notificationMessage: `${selectedProductionTeam.name} wants to work with your venue.`,
      notificationImage: selectedProductionTeam.logo_url || null,
      requestKind: "application",
      contextLabel: "Application Context",
      requireSlotSelection: true,
      requireRosterSelection: true,
      extraMeta: { request_kind: "application" },
    });
  }, [createListingRequest, group, selectedProductionTeam, showSheetAlert]);

  const renderRequestSelectorChips = (
    items: any[],
    selectedId: string | null,
    onSelect: (value: string) => void,
    iconName: React.ComponentProps<typeof Ionicons>["name"],
  ) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={1}
            onPress={() => onSelect(item.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 999,
              minHeight: 40,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: isSelected ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: isSelected ? colors.primary : colors.border,
            }}
          >
            <Ionicons name={iconName} size={14} color={isSelected ? "#FFF" : colors.textSecondary} />
            <Text
              style={{
                color: isSelected ? "#FFF" : colors.text,
                fontFamily: "Poppins_500Medium",
                fontSize: 12,
                lineHeight: 14,
                includeFontPadding: false,
                textAlignVertical: "center",
              }}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderConnectionPanel = () => {
    const renderProductionTeamSelector = () => {
      if (loadingProductionTeams || !hasLoadedProductionTeams) {
        return (
          <View style={{ paddingVertical: 12, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        );
      }

      if (productionTeams.length > 0) {
        return renderRequestSelectorChips(
          productionTeams,
          selectedProductionTeamId,
          setSelectedProductionTeamId,
          "people-outline",
        );
      }

      return (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => router.push("/my_production")}
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
        >
          <Text style={styles.primaryBtnText}>Manage Production Teams</Text>
        </TouchableOpacity>
      );
    };

    const renderStructuredRequestFields = (options: {
      requestKind: "invite" | "application";
      pitchPlaceholder: string;
      contextLabel: string;
      contextPlaceholder: string;
      showSlotSelector?: boolean;
      showRosterSelector?: boolean;
    }) => {
      const rosterChipItems = filteredRequestRoster.map((entry: any) => ({
        id: entry.id,
        name: entry.display_name || entry.group?.name || entry.full_name || "Roster Entry",
      }));

      return (
        <>
          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Pitch / Intro *</Text>
          <View style={[styles.inputWrapper, { backgroundColor: isDark ? "#374151" : "#F9FAFB", marginTop: 8, height: 110 }]}> 
            <TextInput
              style={[styles.input, { color: colors.text, height: "100%" }]}
              placeholder={options.pitchPlaceholder}
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              value={requestPitchMessage}
              onChangeText={setRequestPitchMessage}
            />
          </View>

          {options.showSlotSelector && requestSlotOptions.length > 0 ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Preferred Slot *</Text>
              {renderRequestSelectorChips(
                requestSlotOptions.map((slot) => ({ id: slot.id, name: slot.name })),
                selectedSlotType,
                (value) => setSelectedSlotType(value as "solo" | "duo" | "band"),
                "albums-outline",
              )}
            </>
          ) : null}

          {options.showRosterSelector && selectedProductionTeam ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Featured Performer *</Text>
              {rosterChipItems.length > 0 ? (
                renderRequestSelectorChips(
                  rosterChipItems,
                  selectedProductionRosterId,
                  setSelectedProductionRosterId,
                  "person-outline",
                )
              ) : (
                <Text style={[styles.description, { color: colors.textSecondary, marginTop: 8 }]}>Add a matching roster entry to {selectedProductionTeam.name} before you can send this application.</Text>
              )}
            </>
          ) : null}

          <DocumentUploader
            label={options.requestKind === "invite" ? "Upload Contract *" : "Upload CV/Resume *"}
            onFileSelect={(file) => {
              setRequestDocumentFile(file);
              setRequestDocumentUrl("");
            }}
            existingUrl={requestDocumentUrl || undefined}
          />

          {options.requestKind === "application" ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>Upload Video / Reel *</Text>
              <View style={{ marginTop: 8 }}>
                <VideoUploader
                  videoUrl={requestVideoUrl || null}
                  onVideoChange={(url) => setRequestVideoUrl(url || "")}
                  userId={activeUserId || ""}
                  bucketName="documents"
                  folder="performance-videos"
                  maxSizeMB={50}
                />
              </View>
            </>
          ) : null}

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>{options.contextLabel} *</Text>
          <View style={[styles.inputWrapper, { backgroundColor: isDark ? "#374151" : "#F9FAFB", marginTop: 8, height: 96 }]}> 
            <TextInput
              style={[styles.input, { color: colors.text, height: "100%" }]}
              placeholder={options.contextPlaceholder}
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              value={requestApplicationContext}
              onChangeText={setRequestApplicationContext}
            />
          </View>
        </>
      );
    };

    if (group?.type === "Group" || group?.type === "Artist") {
      if (effectiveUserRole !== "producer") {
        return null;
      }

      return (
        <View style={[styles.section, { marginBottom: 0 }]}> 
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Invite To Your Team</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>Select one of your production teams and send an invite with a pitch, details, and the required contract.</Text>
          {renderProductionTeamSelector()}
          {renderStructuredRequestFields({
            requestKind: "invite",
            pitchPlaceholder: `Tell ${group?.name || "this musician"} what your team needs and why they are a fit.`,
            contextLabel: "Invite Context",
            contextPlaceholder: "Share the project scope, schedule, and the kind of collaboration you want.",
          })}
          <TouchableOpacity
            activeOpacity={isSendingRequest || loadingProductionTeams ? 1 : 0.78}
            onPress={handleInviteGroupToTeam}
            disabled={isSendingRequest || loadingProductionTeams}
            style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 12, opacity: isSendingRequest || loadingProductionTeams ? 0.6 : 1 }]}
          >
            {isSendingRequest ? (
              <View style={styles.loadingButtonContent}>
                <ActivityIndicator color="#FFF" />
                <Text style={styles.primaryBtnText}>Sending Invite...</Text>
              </View>
            ) : <Text style={styles.primaryBtnText}>Send Team Invite</Text>}
          </TouchableOpacity>
        </View>
      );
    }

    if (group?.type === "Venue" && effectiveUserRole === "producer") {
      return (
        <View style={[styles.section, { marginBottom: 0 }]}> 
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Apply As Production Team</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>Choose a team and send an application with a pitch, selected slot, CV, and video.</Text>
          {renderProductionTeamSelector()}
          {renderStructuredRequestFields({
            requestKind: "application",
            pitchPlaceholder: `Tell ${group?.name || "this venue"} how your team can help and what you bring.`,
            contextLabel: "Application Context",
            contextPlaceholder: "Add event context, availability, technical strengths, or other production notes.",
            showSlotSelector: true,
            showRosterSelector: true,
          })}
          <TouchableOpacity
            activeOpacity={isSendingRequest || loadingProductionTeams ? 1 : 0.78}
            onPress={handleApplyTeamToVenue}
            disabled={isSendingRequest || loadingProductionTeams}
            style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 12, opacity: isSendingRequest || loadingProductionTeams ? 0.6 : 1 }]}
          >
            {isSendingRequest ? (
              <View style={styles.loadingButtonContent}>
                <ActivityIndicator color="#FFF" />
                <Text style={styles.primaryBtnText}>Sending Application...</Text>
              </View>
            ) : <Text style={styles.primaryBtnText}>Send Venue Application</Text>}
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  // Group: About Tab
  const renderGroupAbout = () => (
    <GroupAboutTab
      group={group}
      colors={colors}
      isDark={isDark}
      styles={styles}
      currentUserId={currentUserId}
      onProfilePress={handleProfileNavigation}
      completionRate={listingCompletionRate}
      sheetRef={ref}
      listingId={listingId}
    />
  );

  // Group: Timeline Tab - Shows pictures like Instagram
  const renderGroupTimeline = () => (
    <GroupTimelineTab
      group={group}
      colors={colors}
      isDark={isDark}
      styles={styles}
      width={width}
    />
  );

  // Group: Setup Tab (legacy - keeping for reference)
  const renderGroupSetup = () => (
    <GroupSetupTab
      colors={colors}
      isDark={isDark}
      styles={styles}
    />
  );

  const handleSendBookingRequest = useBookingRequestAction({
    currentUserRole: effectiveUserRole,
    userVenues,
    selectedVenueId,
    requestMessage,
    currentUserId,
    group,
    setAlertConfig,
    setAlertVisible,
    handleConfirm,
    setIsSendingRequest,
    setRequestMessage,
    closeSheet: () => {
      if (ref && "current" in ref && ref.current) {
        (ref as any).current.dismiss();
      }
    },
  });

  const renderConnectionTab = () => {
    const connectionPanel = hasStructuredConnectionTab ? renderConnectionPanel() : null;

    if (group?.type === "Group") {
      return (
        <GroupConnectTab
          currentUserRole={effectiveUserRole}
          userVenues={userVenues}
          colors={colors}
          isDark={isDark}
          styles={styles}
          selectedVenueId={selectedVenueId}
          setSelectedVenueId={setSelectedVenueId}
          checkingVenue={checkingVenue}
          requestMessage={requestMessage}
          setRequestMessage={setRequestMessage}
          handleSendBookingRequest={handleSendBookingRequest}
          isSendingRequest={isSendingRequest}
          renderBookingControls={renderBookingControls}
          group={group}
          handleConfirm={handleConfirm}
          connectionPanel={connectionPanel}
        />
      );
    }

    if (!connectionPanel) {
      return null;
    }

    return <View style={styles.tabContent}>{connectionPanel}</View>;
  };

  const renderStudioGigVenueAbout = () => (
    <StudioGigVenueAboutTab
      group={group}
      colors={colors}
      isDark={isDark}
      styles={styles}
      hasDualPricing={Boolean(hasDualPricing)}
      rehearsalRate={rehearsalRate || ""}
      recordingRate={recordingRate || ""}
      displayRate={effectiveDisplayRate}
      labels={labels}
      currentUserId={currentUserId}
      handleProfileNavigation={handleProfileNavigation}
      promotions={group?.promotions || []}
    />
  );

  const paymentModalBookingCount =
    Array.isArray(paymentBookingData?.bookingIds)
      ? paymentBookingData.bookingIds.filter(Boolean).length
      : Array.isArray(paymentBookingData?.bookings)
        ? paymentBookingData.bookings.filter((item: any) => item?.id).length
        : 1;
  const paymentModalTotalAmount = Number(paymentBookingData?.totalAmount || 0);
  const paymentModalHalfAmount = Math.round(paymentModalTotalAmount / 2);

  return (
    <>
      <TrackedBottomSheetModal
        ref={ref}
        overlayLabel="ListingDetailsSheet"
        index={0}
        snapPoints={snapPoints}
        animationConfigs={animationConfigs}
        animateOnMount={true}
        enableDynamicSizing={false}
        enableContentPanningGesture={false}
        enableOverDrag={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? "#4B5563" : "#E5E7EB",
          width: 40,
        }}
        enablePanDownToClose={true}
        onChange={handleSheetChanges}
        onDismiss={onDismiss}
      >
        {loading && !group ? (
          <View
            style={[
              styles.loadingContainer,
              { backgroundColor: colors.background },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : group ? (
          <ScrollView
            contentContainerStyle={scrollContentStyle}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
          >
            <ListingHeroSection
              group={group}
              colors={colors}
              styles={styles}
              isFavorited={isFavorited}
              favoriteCount={favoriteCount}
              showFavoriteButton={!isGuest && !isStaffViewOnlyListing}
              showReportButton={showReportButton}
              onClose={() => (ref as any)?.current?.dismiss()}
              onToggleFavorite={toggleFavorite}
              onReport={handleReport}
              onShare={handleShare}
              onChat={isGuest || isFan || isStaffViewOnlyListing ? undefined : openListingChat}
            />

            {/* TABS SELECTOR */}
            {showTabs && renderTabs()}

            <ListingContentBody
              styles={styles}
              colors={colors}
              group={group}
              activeTab={visibleActiveTab}
              activeTabIndex={activeTabIndex}
              showTabs={showTabs}
              renderGroupAbout={renderGroupAbout}
              renderGroupApply={renderGroupApply}
              renderGroupTimeline={renderGroupTimeline}
              renderConnectionTab={renderConnectionTab}
              renderReviews={renderReviews}
              renderStudioGigVenueAbout={renderStudioGigVenueAbout}
              renderStudioSetup={renderStudioSetup}
              renderStudioBook={renderStudioBook}
              renderGigInfo={renderGigInfo}
              renderGigApply={renderGigApply}
            />
          </ScrollView>
        ) : null}
      </TrackedBottomSheetModal>

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={[
          {
            text: "OK",
            style: "default",
            onPress: () => setAlertVisible(false),
          },
        ]}
        onClose={() => setAlertVisible(false)}
      />

      <Modal
        visible={isSubmittingApplication || isSendingRequest}
        onClose={() => { }}
        loading
        loadingMessage={
          isSubmittingApplication
            ? "Sending application..."
            : "Sending request..."
        }
      />

      {showListingReportModal ? (
        <ReportModal
          visible
          onClose={() => setShowListingReportModal(false)}
          onSubmit={submitReport}
          targetName={group?.name || 'this listing'}
          title={group?.type ? `Report ${group.type}` : 'Report Listing'}
          reportType={group?.type?.toLowerCase()}
        />
      ) : null}

      {modalVisible ? (
        <Modal
          visible
          onClose={() => {
            debugLog("🔴 Modal closed without confirmation");
            setConfirmRequireTerms(false);
            setConfirmContractUrl(null);
            setConfirmContractName(undefined);
            setConfirmSummaryItems([]);
            setConfirmAction(() => () => { });
            setConfirmTitle("");
            setConfirmMessage("");
            setModalVisible(false);
          }}
          onConfirm={() => {
            debugLog("🟢 Modal CONFIRMED - executing action");
            debugLog("confirmAction:", confirmAction);
            const actionToRun = confirmAction;
            setConfirmRequireTerms(false);
            setConfirmContractUrl(null);
            setConfirmContractName(undefined);
            setConfirmSummaryItems([]);
            setConfirmAction(() => () => { });
            setConfirmTitle("");
            setConfirmMessage("");
            setModalVisible(false);
            try {
              actionToRun();
              debugLog("✅ confirmAction executed successfully");
            } catch (error) {
              console.error("❌ Error executing confirmAction:", error);
            }
          }}
          title={confirmTitle}
          message={confirmMessage}
          buttonText="Confirm"
          requireTermsAcceptance={confirmRequireTerms}
          contractUrl={confirmContractUrl}
          contractName={confirmContractName}
          summaryItems={confirmSummaryItems}
        />
      ) : null}

      {/* Payment Option Modal */}
      {showPaymentOptionModal ? (
      <RNModal
        visible
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        hardwareAccelerated
        animationType="fade"
        onRequestClose={() => {
          if (!isProcessingPayment) {
            setShowPaymentOptionModal(false);
            refreshStudioCalendar();
          }
        }}
      >
        <View style={styles.paymentModalOverlay}>
          {isProcessingPayment ? (
            // Loading Screen while PayMongo processes
            <View
              style={[
                styles.paymentLoadingContainer,
                { backgroundColor: colors.card },
              ]}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={[styles.paymentLoadingTitle, { color: colors.text }]}
              >
                Processing Payment
              </Text>
              <Text
                style={[
                  styles.paymentLoadingSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                Please wait while we set up your payment...
              </Text>
            </View>
          ) : (
            // Payment Option Selection
            <View
              style={[
                styles.paymentOptionContainer,
                { backgroundColor: colors.card },
              ]}
            >
              <Text style={[styles.paymentOptionTitle, { color: colors.text }]}>
                {paymentModalBookingCount > 1
                  ? `Pay ${paymentModalBookingCount} bookings`
                  : "Choose Payment Option"}
              </Text>
              <Text
                style={[
                  styles.paymentOptionSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                Total booking amount: ₱{paymentModalTotalAmount.toLocaleString()}
              </Text>
              <Text style={[styles.paymentOptionHint, { color: colors.textSecondary }]}>
                Full payment settles the booking. Downpayment leaves the other half in Pending as Balance Due.
              </Text>

              {/* Full Payment Option */}
              <TouchableOpacity activeOpacity={1}
                onPress={() => setSelectedPaymentType("full")}
                style={[
                  styles.paymentOptionCard,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                    borderColor:
                      selectedPaymentType === "full"
                        ? colors.primary
                        : colors.border,
                    borderWidth: selectedPaymentType === "full" ? 2 : 1,
                    transform: [{ scale: selectedPaymentType === "full" ? 1.02 : 1 }]
                  },
                ]}
              >
                <View style={styles.paymentOptionRow}>
                  <Ionicons
                    name={selectedPaymentType === 'full' ? "radio-button-on" : "radio-button-off"}
                    size={24}
                    color={selectedPaymentType === 'full' ? colors.primary : colors.textSecondary}
                    style={{ marginRight: 12 }}
                  />
                  <View style={styles.paymentOptionInfo}>
                    <Text
                      style={[
                        styles.paymentOptionLabel,
                        { color: colors.text },
                      ]}
                    >
                      Pay in full
                    </Text>
                    <Text
                      style={[
                        styles.paymentOptionAmount,
                        { color: colors.primary },
                      ]}
                    >
                      ₱{paymentModalTotalAmount.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.paymentOptionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  Settles the booking amount in one payment.
                </Text>
              </TouchableOpacity>

              {/* Downpayment Option */}
              <TouchableOpacity activeOpacity={1}
                onPress={() => setSelectedPaymentType("downpayment")}
                style={[
                  styles.paymentOptionCard,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                    borderColor:
                      selectedPaymentType === "downpayment"
                        ? colors.primary
                        : colors.border,
                    borderWidth: selectedPaymentType === "downpayment" ? 2 : 1,
                    transform: [{ scale: selectedPaymentType === "downpayment" ? 1.02 : 1 }]
                  },
                ]}
              >
                <View style={styles.paymentOptionRow}>
                  <Ionicons
                    name={selectedPaymentType === 'downpayment' ? "radio-button-on" : "radio-button-off"}
                    size={24}
                    color={selectedPaymentType === 'downpayment' ? colors.primary : colors.textSecondary}
                    style={{ marginRight: 12 }}
                  />
                  <View style={styles.paymentOptionInfo}>
                    <Text
                      style={[
                        styles.paymentOptionLabel,
                        { color: colors.text },
                      ]}
                    >
                      Pay 50% now
                    </Text>
                    <Text
                      style={[
                        styles.paymentOptionAmount,
                        { color: colors.primary },
                      ]}
                    >
                      ₱
                      {paymentModalHalfAmount.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.paymentOptionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  Pay half today. Remaining balance: ₱
                  {paymentModalHalfAmount.toLocaleString()} shown in Pending.
                </Text>
              </TouchableOpacity>

              {/* Action Buttons */}
              <View style={styles.paymentOptionButtons}>
                <TouchableOpacity activeOpacity={1}
                  onPress={() => processPaymentWithType(selectedPaymentType)}
                  style={[
                    styles.paymentOptionConfirmBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.paymentOptionConfirmText}>
                    Pay ₱
                    {(selectedPaymentType === "downpayment"
                      ? paymentModalHalfAmount
                      : paymentModalTotalAmount
                    ).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity activeOpacity={1}
                onPress={() => {
                  setShowPaymentOptionModal(false);
                  // Clear form and navigate to bookings
                  setBookings([]);
                  setSelectedTimeSlots([]);
                  setBookingNotes("");
                  setModalVisible(false);
                  (ref as any)?.current?.dismiss();
                  setTimeout(() => {
                    router.push("/bookings" as any);
                  }, 100);
                }}
                style={{ marginTop: 16, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </RNModal>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    height: 300,
  },
  scrollContent: {
    paddingBottom: 100,
    minHeight: "100%",
  },
  imageContainer: {
    height: IMG_HEIGHT,
    width: "100%",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerActions: {
    position: "absolute",
    top: moderateScale(16),
    left: scale(20),
    right: scale(20),
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  rightActions: {
    flexDirection: "row",
    gap: scale(12),
  },
  roundBtn: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  heroIdentity: {
    position: "absolute",
    bottom: moderateScale(24),
    left: scale(24),
    right: scale(24),
  },
  heroTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: height < 700 ? moderateScale(24) : moderateScale(28),
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroLocation: {
    color: "#FFF",
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(14),
    marginLeft: scale(4),
  },
  statusRow: {
    flexDirection: "row",
    gap: scale(8),
    marginBottom: moderateScale(8),
  },
  // Tabs
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: moderateScale(16),
  },
  tabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: moderateScale(14),
  },
  contentBody: {
    flex: 1,
    minHeight: verticalScale(500),
  },
  tabContent: {
    padding: height < 700 ? scale(16) : scale(24),
  },
  // Sections
  section: {
    marginBottom: height < 700 ? moderateScale(16) : moderateScale(24),
  },
  sectionTitle: {
    fontSize: height < 700 ? moderateScale(16) : moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
    marginBottom: moderateScale(12),
  },
  description: {
    fontSize: moderateScale(14),
    lineHeight: moderateScale(22),
  },
  // Stats
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  offerCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  // Gallery
  galleryContainer: {
    gap: 12,
  },
  galleryImage: {
    width: 160,
    height: 112,
    borderRadius: 12,
    marginRight: 12,
  },
  // Picker / Booking Widgets
  pickerSection: {
    marginBottom: 24,
  },
  dateTimeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dateIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTimeLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  timeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  timeIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pickerContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  nativePickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  pickerLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  pickerValue: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  durationWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  durationBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  durationVal: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },

  // Reviews
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
  },
  ratingBig: {
    fontSize: 56,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 64,
    letterSpacing: -1,
  },
  reviewsScroll: {
    gap: 16,
    paddingRight: 24,
  },
  reviewCard: {
    width: "100%",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  reviewUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  reviewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  reviewName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  reviewDate: {
    fontSize: 12,
    opacity: 0.7,
  },
  reviewBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
  // Setup / Tags
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  amenityChip: {
    minWidth: 124,
    maxWidth: "100%",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  // Forms
  inputContainer: {
    marginBottom: moderateScale(16),
  },
  label: {
    fontFamily: "Poppins_500Medium",
    marginBottom: moderateScale(8),
  },
  inputWrapper: {
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(12),
    justifyContent: "center",
  },
  input: {
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(14),
    padding: 0,
    textAlignVertical: "center",
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  paymentSummary: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    width: "100%",
  },
  primaryBtn: {
    paddingVertical: moderateScale(16),
    borderRadius: moderateScale(16),
    alignItems: "center",
    justifyContent: "center",
  },
  loadingButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(16),
  },
  secondaryBtn: {
    paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12),
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(14),
  },
  groupSelectChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  bookingCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  timeSlotChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  // Info Box (for warnings/notices)
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  // Gig Info
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  equipmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  equipmentCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  equipmentImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  // Upload Box
  uploadBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  // Bottom Bar (Group)
  bottomBar: {
    paddingHorizontal: scale(24),
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(32),
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceContainer: {
    justifyContent: "center",
  },
  priceText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(18),
  },
  bookBtn: {
    paddingHorizontal: scale(24),
    paddingVertical: moderateScale(12),
    borderRadius: moderateScale(12),
  },
  bookBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(15),
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Manager Card
  managerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  managerLabel: {
    fontSize: 10,
    textTransform: "uppercase",
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  managerName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  visitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  // Stage Plot
  stagePlotPlaceholder: {
    height: 200,
    width: "100%",
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  // Connect Tab
  roleHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  roleTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  auditionBanner: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
  },
  // Integrated Picker Styles
  integratedCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    justifyContent: "space-between",
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  timeContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  timeButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  durationText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginLeft: 4,
  },
  bookingContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    marginBottom: 24,
  },
  slotGridContainer: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 8,
  },
  // Payment Option Modal Styles
  paymentModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(15,23,42,0.62)",
  },
  paymentLoadingContainer: {
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  paymentLoadingTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    marginTop: 20,
    textAlign: "center",
  },
  paymentLoadingSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  paymentOptionContainer: {
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  paymentOptionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 22,
    marginBottom: 6,
    textAlign: "center",
  },
  paymentOptionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginBottom: 6,
    textAlign: "center",
  },
  paymentOptionHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
    textAlign: "center",
  },
  paymentOptionCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  paymentOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  paymentOptionRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  paymentOptionRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  paymentOptionInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  paymentOptionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    flex: 1,
  },
  paymentOptionAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  paymentOptionDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 34,
  },
  paymentOptionButtons: {
    marginTop: 20,
  },
  paymentOptionConfirmBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  paymentOptionConfirmText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
});

export default ListingDetailsSheet;




