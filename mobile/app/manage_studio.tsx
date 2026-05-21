import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    InteractionManager,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { supabase } from "../lib/supabase";
import BottomModal from "../src/components/BottomModal";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import InAppMediaViewer, { isInAppMediaUrl } from "../src/components/InAppMediaViewer";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import SlidingTabBar from "../src/components/SlidingTabBar";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useTheme } from "../src/context/ThemeContext";
import {
    hasValidCoordinates,
    openNavigationDirections,
} from "../src/utils/navigation";
import { formatDashedNumericDate, formatFriendlyDateTime } from "../src/utils/friendlyDateTime";
import { getSmoothTabIndex, setSmoothTab, useStagedTabRows } from "../src/utils/smoothTabs";
import { fetchActiveStaffAssignment, getStaffPermissions } from "../src/utils/staffAccess";

const CUSTOM_DATE_PREVIEW_LIMIT = 5;
const STUDIO_TABS = ["About", "Setup", "Bookings", "Review"];

const getBookingDateKey = (booking: any) => {
  const explicitDate = booking?.raw_date || booking?.booking_date;
  if (explicitDate) return explicitDate;

  const parsedDate = new Date(booking?.start_time);
  return Number.isNaN(parsedDate.getTime())
    ? ""
    : parsedDate.toISOString().split("T")[0];
};

const ACTIVE_BOOKING_STATUSES = new Set([
  "pending",
  "confirmed",
  "checked_in",
  "pending_relocation",
]);

const normalizeBookingStatus = (value?: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isActiveBookingStatus = (value?: unknown) =>
  ACTIVE_BOOKING_STATUSES.has(normalizeBookingStatus(value));

const withAlpha = (color: string, alpha: string) =>
  /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;

const canonicalizeStudioType = (
  value: unknown,
): "Rehearsal" | "Recording" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("rehearsal")) return "Rehearsal";
  if (normalized.includes("recording")) return "Recording";
  return null;
};

const inferStudioTypeFromRows = (rows: unknown[]): "Rehearsal" | "Recording" | "Both" => {
  const canonical = Array.from(
    new Set(
      rows
        .map((row) => canonicalizeStudioType(row))
        .filter((type): type is "Rehearsal" | "Recording" => Boolean(type)),
    ),
  );

  if (canonical.length >= 2) return "Both";
  return canonical[0] || "Both";
};

export default function StudioDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { id, tab } = useLocalSearchParams<{ id?: string | string[]; tab?: string | string[] }>(); // Get Studio ID
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  const [activeTab, setActiveTab] = useState(
    STUDIO_TABS.includes(requestedTab || "") ? requestedTab || "About" : "About",
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalButtonText, setModalButtonText] = useState("");
  const [modalAction, setModalAction] = useState<() => Promise<void> | void>(
    () => { },
  );
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const cancellationReasonRef = useRef("");

  // Calendar View State
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState("");

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [studio, setStudio] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (requestedTab && STUDIO_TABS.includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);
  const [mediaViewerUrl, setMediaViewerUrl] = useState<string | null>(null);
  const [mediaViewerTitle, setMediaViewerTitle] = useState("Media");

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
    const lowerTitle = (title || "").toLowerCase();
    let type: AlertType = "info";
    if (
      lowerTitle.includes("error") ||
      lowerTitle.includes("failed") ||
      lowerTitle.includes("unauthorized") ||
      lowerTitle.includes("invalid")
    ) {
      type = "error";
    } else if (lowerTitle.includes("success")) {
      type = "success";
    } else if (
      lowerTitle.includes("warning") ||
      lowerTitle.includes("decline") ||
      lowerTitle.includes("required") ||
      lowerTitle.includes("incomplete")
    ) {
      type = "warning";
    }
    showAlert(type, title || "Notice", message || "", buttons);
  };

  const Alert = { alert: showAlertNative };

  const openMediaOrExternal = async (url: string, title = "File") => {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl) return;

    if (isInAppMediaUrl(normalizedUrl)) {
      setMediaViewerTitle(title);
      setMediaViewerUrl(normalizedUrl);
      return;
    }

    try {
      const supported = await Linking.canOpenURL(normalizedUrl);
      if (supported) {
        await Linking.openURL(normalizedUrl);
      } else {
        Alert.alert("Error", "Unable to open link");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to open link");
    }
  };

  const handleNavigateToStudio = async () => {
    try {
      await openNavigationDirections({
        latitude: studio?.latitude,
        longitude: studio?.longitude,
        label: studio?.address || studio?.name || "Studio location",
      });
    } catch (error) {
      showAlert(
        "warning",
        "Navigation Unavailable",
        "This studio does not have pinned coordinates yet.",
      );
    }
  };

  // State for partial slot approval
  const [selectedBookingForPartial, setSelectedBookingForPartial] =
    useState<any>(null);
  const [selectedSlots, setSelectedSlots] = useState<{
    [key: number]: "accept" | "decline" | null;
  }>({});
  const [partialModalVisible, setPartialModalVisible] = useState(false);

  const toHourMinute = (value?: string | null) => {
    if (!value) return "";
    const segments = value.split(":");
    if (segments.length >= 2) {
      return `${segments[0]}:${segments[1]}`;
    }
    return value;
  };

  const normalizeSessionType = (value?: unknown) => {
    if (typeof value !== "string") return "";
    const normalized = value.trim().toLowerCase();
    if (normalized === "rehearsal" || normalized === "recording" || normalized === "both") {
      return normalized;
    }
    return "";
  };

  const getSessionTypeFromReason = (reason?: unknown) => {
    if (typeof reason !== "string") return "";
    const match = reason.match(/session_type:(rehearsal|recording|both)/i);
    return normalizeSessionType(match?.[1]);
  };

  const formatSessionTypeLabel = (value?: unknown) => {
    const normalized = normalizeSessionType(value);
    if (normalized === "rehearsal") return "Rehearsal";
    if (normalized === "recording") return "Recording";
    if (normalized === "both") return "Rehearsal & Recording";
    return "";
  };

  const formatStatusLabel = (value?: unknown) => {
    const raw = typeof value === "string" ? value : "";
    if (!raw.trim()) return "Not submitted";
    return raw
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const updateBookingStatus = async (
    bookingId: string,
    status: "confirmed" | "cancelled",
    userId: string,
    cancellationReason?: string,
  ) => {
    const { data, error } = await supabase.functions.invoke("manage-bookings", {
      body: {
        action: "update_status",
        booking_id: bookingId,
        new_status: status,
        type_id: "studio_booking",
        cancellation_reason: cancellationReason,
        userId,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  };

  const processPartialSlotApproval = async (
    bookingId: string,
    userId: string,
    acceptedSlots: Array<{ start: string; end: string }>,
    declinedSlots: Array<{ start: string; end: string }>,
    cancellationReason?: string,
  ) => {
    const { data, error } = await supabase.functions.invoke("manage-bookings", {
      body: {
        action: "partial_slot_approval",
        booking_id: bookingId,
        user_id: userId,
        accepted_slots: acceptedSlots,
        declined_slots: declinedSlots,
        cancellation_reason: cancellationReason,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  };

  // Role-based access control + refresh on screen focus (after edits)
  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      const focusTask = InteractionManager.runAfterInteractions(() => {
        if (isActive) {
          void checkAuthorization();
        }
      });

      return () => {
        isActive = false;
        focusTask.cancel();
      };
    }, [id]),
  );

  const checkAuthorization = async () => {
    try {
      setCheckingAuth(true);
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

      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        Alert.alert("Error", "Invalid studio ID");
        router.replace("/home");
        return;
      }

      let canManageStudio = false;
      if (profile?.role === "studio-owner") {
        const { data: ownedStudio, error: ownedStudioError } = await supabase
          .from("studios")
          .select("id")
          .eq("id", studioId)
          .eq("owner_id", user.id)
          .maybeSingle();

        if (ownedStudioError) throw ownedStudioError;
        canManageStudio = !!ownedStudio?.id;
      }

      if (!canManageStudio && profile?.role === "staff") {
        const assignment = await fetchActiveStaffAssignment(supabase, user.id);
        const permissions = getStaffPermissions(assignment?.access_level);
        canManageStudio =
          assignment?.entity_type === "studio" &&
          assignment.studio_id === studioId &&
          permissions.canManageBookings;
      }

      if (!canManageStudio) {
        Alert.alert("Unauthorized", "Only the studio owner or assigned Level 1/2 staff can access this page.");
        router.replace("/home");
        return;
      }

      setAuthorized(true);
      if (id) fetchData(user.id);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/home");
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchData = async (userId: string) => {
    setLoading(true);
    try {
      // Ensure id is a string, not an array
      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        Alert.alert("Error", "Invalid studio ID");
        router.replace("/home");
        return;
      }


      // Base query + legacy projection merge
      const { data: studioData, error: studioError } = await supabase
        .from('studios')
        .select('*')
        .eq('id', studioId)
        .single();

      const { data: legacyStudio, error: legacyStudioError } = await supabase
        .from('studios_legacy_projection')
        .select('amenities, images, types, instruments')
        .eq('id', studioId)
        .single();

      const { data: studioTypesData, error: studioTypesError } = await supabase
        .from('studio_types')
        .select('studio_type')
        .eq('studio_id', studioId);

      const [
        { data: amenityRows, error: amenityRowsError },
        { data: instrumentRows, error: instrumentRowsError },
        { data: normalizedMediaRows, error: normalizedMediaError },
        { data: studioSettings, error: studioSettingsError },
        { data: promotionRows, error: promotionRowsError },
      ] = await Promise.all([
        supabase
          .from('studio_amenities')
          .select('amenity')
          .eq('studio_id', studioId),
        supabase
          .from('studio_instruments')
          .select('*')
          .eq('studio_id', studioId),
        supabase
          .from('studio_media')
          .select('media_url, sort_order, created_at')
          .eq('studio_id', studioId)
          .eq('media_type', 'image')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('studio_settings')
          .select('*')
          .eq('studio_id', studioId)
          .maybeSingle(),
        supabase
          .from('studio_promotions')
          .select('*')
          .eq('studio_id', studioId)
          .order('created_at', { ascending: true }),
      ]);

      if (studioError) {
        // if (studioError.message?.includes("non-2xx")) {
        //   undefined;
        // }
        throw studioError;
      }
      if (studioTypesError) {
        throw studioTypesError;
      }

      const { data: operatingRows } = await supabase
        .from('studio_operating_hours')
        .select('day_of_week, open_time, close_time, slot_order, is_open, reason')
        .eq('studio_id', studioId)
        .order('day_of_week', { ascending: true })
        .order('slot_order', { ascending: true });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const availabilityMap = new Map<number, { day: string; slots: { start: string; end: string; session_type?: string }[] }>();
      (operatingRows || []).forEach((row: any) => {
        if (!availabilityMap.has(row.day_of_week)) {
          availabilityMap.set(row.day_of_week, {
            day: dayNames[row.day_of_week] || `Day ${row.day_of_week}`,
            slots: [],
          });
        }
        if (row.is_open && row.open_time && row.close_time) {
          availabilityMap.get(row.day_of_week)?.slots.push({
            start: row.open_time,
            end: row.close_time,
            session_type: getSessionTypeFromReason(row.reason),
          });
        }
      });

      const { data: overrideRows } = await supabase
        .from('studio_date_overrides')
        .select('override_date, is_open, open_time, close_time, reason, slot_order')
        .eq('studio_id', studioId)
        .order('override_date', { ascending: true })
        .order('slot_order', { ascending: true });

      const calendarAvailabilityMap = new Map<string, { date: string; session_type?: string; slots: { start: string; end: string; session_type?: string }[] }>();
      (overrideRows || []).forEach((row: any) => {
        if (!row.override_date) return;
        if (!calendarAvailabilityMap.has(row.override_date)) {
          calendarAvailabilityMap.set(row.override_date, {
            date: row.override_date,
            session_type: getSessionTypeFromReason(row.reason),
            slots: [],
          });
        }
        if (row.is_open && row.open_time && row.close_time) {
          calendarAvailabilityMap.get(row.override_date)?.slots.push({
            start: row.open_time,
            end: row.close_time,
            session_type: getSessionTypeFromReason(row.reason),
          });
        }
      });
      const calendarAvailability = Array.from(calendarAvailabilityMap.values());

      const normalized3nfTypes = (studioTypesData || [])
        .map((row: any) => row?.studio_type)
        .filter(Boolean);
      const legacyTypes = !legacyStudioError && Array.isArray(legacyStudio?.types)
        ? legacyStudio.types
        : [];
      const resolvedStudioType = normalized3nfTypes.length > 0
        ? inferStudioTypeFromRows(normalized3nfTypes)
        : inferStudioTypeFromRows(legacyTypes);
      const amenitiesFromRows = !amenityRowsError
        ? (amenityRows || [])
          .map((row: any) => row?.amenity)
          .filter((amenity: any) => typeof amenity === 'string' && amenity.trim().length > 0)
        : [];
      const instrumentsFromRows = !instrumentRowsError
        ? (instrumentRows || [])
          .map((row: any) => ({
            id: row?.id,
            name: row?.instrument_name,
            image: row?.image_url || '',
            quantity: row?.quantity,
            description: row?.description || '',
          }))
          .filter((item: any) => typeof item.name === 'string' && item.name.trim().length > 0)
        : [];
      const imagesFromRows = !normalizedMediaError
        ? (normalizedMediaRows || [])
          .map((row: any) => row?.media_url)
          .filter((url: any) => typeof url === 'string' && url.trim().length > 0)
        : [];
      const activePromotions = !promotionRowsError
        ? (promotionRows || []).filter((promo: any) => promo?.is_active !== false)
        : [];

      setStudio({
        ...studioData,
        type: resolvedStudioType,
        amenities: amenitiesFromRows.length > 0 ? amenitiesFromRows : (!legacyStudioError ? legacyStudio?.amenities || [] : []),
        images: imagesFromRows.length > 0 ? imagesFromRows : (!legacyStudioError ? legacyStudio?.images || [] : []),
        instruments: instrumentsFromRows.length > 0 ? instrumentsFromRows : (!legacyStudioError ? legacyStudio?.instruments || [] : []),
        availability: Array.from(availabilityMap.values()),
        calendar_availability: calendarAvailability,
        booking_settings: !studioSettingsError
          ? studioSettings || studioData?.booking_settings || null
          : studioData?.booking_settings || null,
        promotions: activePromotions,
      });

      // Fetch Bookings (normalized-safe)
      try {
        const { data: bookingData, error: bookingError } = await supabase
          .from("studio_bookings")
          .select(
            "*, user:profiles!user_id(full_name, avatar_url, email), studio:studios(name, owner_id, hourly_rate), slots:studio_booking_slots(start_time, end_time, sort_order)",
          )
          .eq("studio_id", studioId)
          .order("booking_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (bookingError) {
        } else {
          const normalizedBookings = (bookingData || []).map((booking: any) => {
            const orderedSlots = (booking.slots || [])
              .slice()
              .sort(
                (a: any, b: any) =>
                  (a.sort_order ?? 0) - (b.sort_order ?? 0),
              );

            const mappedSlots =
              orderedSlots.length > 0
                ? orderedSlots.map((slot: any) => ({
                  start: toHourMinute(slot.start_time),
                  end: toHourMinute(slot.end_time),
                }))
                : booking.start_time && booking.end_time
                  ? [{
                    start: toHourMinute(booking.start_time),
                    end: toHourMinute(booking.end_time),
                  }]
                  : [];

            return {
              ...booking,
              raw_date: booking.booking_date,
              total_price: booking.final_price,
              time_slots: mappedSlots,
            };
          });

          setBookings(normalizedBookings);
        }
      } catch (bookingErr) {
      }

      // Direct query to reviews table
      try {
        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select('*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url)')
          .eq('studio_id', studioId)
          .order('created_at', { ascending: false });
        if (reviewError) {
        } else {
          setReviews(reviewData || []);
        }
      } catch (reviewErr) {
      }

    } catch (e: any) {
      let errorMsg = "Failed to load studio data";
      if (e.message?.includes("non-2xx")) {
        errorMsg += `\n\nServer Error (500). Please check edge function logs.`;
      }
      // Alert.alert("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = (bookingId: string, status: string) => {
    const isDecline = status === "cancelled";
    setModalTitle(
      status === "confirmed" ? "Accept Booking" : "Decline Booking",
    );
    setModalMessage(
      status === "confirmed"
        ? "Are you sure you want to accept this booking request?"
        : "Are you sure you want to decline this booking request? Please provide a reason.",
    );
    setModalButtonText(status === "confirmed" ? "Accept" : "Decline");
    setShowReasonInput(isDecline);
    setCancellationReason("");
    cancellationReasonRef.current = "";
    setModalAction(() => async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        await updateBookingStatus(
          bookingId,
          status as "confirmed" | "cancelled",
          user.id,
          isDecline ? cancellationReasonRef.current.trim() : undefined,
        );

        // Update local state
        setBookings(
          bookings.map((b) => (b.id === bookingId ? { ...b, status } : b)),
        );
        setModalVisible(false);
        setShowReasonInput(false);
        setCancellationReason("");
        cancellationReasonRef.current = "";
      } catch (e) {
        Alert.alert("Error", "Failed to update booking status");
      }
    });
    setModalVisible(true);
  };

  // Helper to format time for display
  const formatTime = (time: string) => {
    if (!time || !time.includes(":")) return time;
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${period}`;
  };

  const getBookingSlots = (booking: any) => {
    const normalizedSlots =
      Array.isArray(booking?.time_slots) && booking.time_slots.length > 0
        ? booking.time_slots
        : booking?.start_time && booking?.end_time
          ? [{ start: booking.start_time, end: booking.end_time }]
          : [];

    return normalizedSlots.filter((slot: any) => slot?.start && slot?.end);
  };

  const getBookingTimeSummary = (booking: any) => {
    const slots = getBookingSlots(booking);
    if (slots.length > 1) return `${slots.length} slots`;
    if (slots.length === 1) {
      return `${formatTime(slots[0].start)} - ${formatTime(slots[0].end)}`;
    }
    return "Time TBA";
  };

  const formatCurrency = (value?: unknown) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Price pending";
    return `₱${amount.toLocaleString()}`;
  };

  const getBookingSessionLabel = (booking: any) =>
    formatSessionTypeLabel(
      booking?.session_type ||
      booking?.modifiers_applied?.session_type ||
      booking?.modifiers_applied?.recording_session?.session_type,
    ) || "Studio session";

  const getBookingStatusTone = (status?: unknown) => {
    switch (normalizeBookingStatus(status)) {
      case "confirmed":
      case "checked_in":
        return {
          color: "#10B981",
          icon: "checkmark-circle" as const,
          label: "Active",
        };
      case "pending":
        return {
          color: "#F59E0B",
          icon: "time-outline" as const,
          label: "Pending",
        };
      case "pending_relocation":
        return {
          color: colors.primary,
          icon: "swap-horizontal-outline" as const,
          label: "Relocation",
        };
      case "completed":
        return {
          color: "#6366F1",
          icon: "checkmark-done-circle" as const,
          label: "Completed",
        };
      case "cancelled":
      case "declined":
      case "rejected":
        return {
          color: "#EF4444",
          icon: "close-circle" as const,
          label: "Inactive",
        };
      default:
        return {
          color: colors.textSecondary,
          icon: "information-circle" as const,
          label: "Status",
        };
    }
  };

  // Open partial approval modal for multi-slot booking
  const openPartialApproval = (booking: any) => {
    setSelectedBookingForPartial(booking);
    // Initialize all slots as null (not yet decided)
    const initialSlots: { [key: number]: "accept" | "decline" | null } = {};
    if (booking.time_slots && Array.isArray(booking.time_slots)) {
      booking.time_slots.forEach((_: any, index: number) => {
        initialSlots[index] = null;
      });
    }
    setSelectedSlots(initialSlots);
    setPartialModalVisible(true);
  };

  // Toggle slot selection
  const toggleSlotSelection = (index: number, action: "accept" | "decline") => {
    setSelectedSlots((prev) => ({
      ...prev,
      [index]: prev[index] === action ? null : action,
    }));
  };

  // Handle partial slot approval submission
  const handlePartialApproval = async () => {
    if (!selectedBookingForPartial) return;

    const booking = selectedBookingForPartial;
    const slots = booking.time_slots || [];

    // Separate accepted and declined slots
    const acceptedSlots = slots.filter(
      (_: any, i: number) => selectedSlots[i] === "accept",
    );
    const declinedSlots = slots.filter(
      (_: any, i: number) => selectedSlots[i] === "decline",
    );

    // Check if all slots have a decision
    const undecidedCount = slots.filter(
      (_: any, i: number) => selectedSlots[i] === null,
    ).length;
    if (undecidedCount > 0) {
      Alert.alert(
        "Incomplete",
        "Please decide on all time slots before submitting.",
      );
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // If all slots are accepted, just confirm the booking
      if (acceptedSlots.length === slots.length) {
        await updateBookingStatus(booking.id, "confirmed", user.id);
        setBookings(
          bookings.map((b) =>
            b.id === booking.id ? { ...b, status: "confirmed" } : b,
          ),
        );
      }
      // If all slots are declined, just cancel the booking
      else if (declinedSlots.length === slots.length) {
        await updateBookingStatus(
          booking.id,
          "cancelled",
          user.id,
          "All requested time slots were declined by the studio owner.",
        );
        setBookings(
          bookings.map((b) =>
            b.id === booking.id ? { ...b, status: "cancelled" } : b,
          ),
        );
      }
      // Partial approval - need to handle specially
      else {
        await processPartialSlotApproval(
          booking.id,
          user.id,
          acceptedSlots,
          declinedSlots,
          declinedSlots.length > 0
            ? "Some time slots were declined by the studio owner."
            : undefined,
        );

        // Refresh the bookings list
        if (user.id) fetchData(user.id);
      }

      setPartialModalVisible(false);
      setSelectedBookingForPartial(null);
      setSelectedSlots({});
      Alert.alert("Success", "Booking updated successfully!");
    } catch (e) {
      Alert.alert("Error", "Failed to update booking status");
    }
  };

  const tabs = STUDIO_TABS;
  const isRecordingOnlyStudio = studio?.type === "Recording";
  const isRehearsalOnlyStudio = studio?.type === "Rehearsal";
  const rehearsalRateValue = Number(studio?.rehearsal_rate || 0);
  const recordingRateValue = Number(studio?.recording_rate || 0);
  const hourlyRateValue = Number(studio?.hourly_rate || 0);
  const hasRehearsalRate = rehearsalRateValue > 0 && !isRecordingOnlyStudio;
  const hasRecordingRate = recordingRateValue > 0 && !isRehearsalOnlyStudio;
  const studioTypeLabel =
    studio?.type === "Both" ? "Rehearsal & Recording" : studio?.type || "N/A";
  const studioRateLabel =
    hasRehearsalRate && hasRecordingRate
      ? "Rates"
      : hasRecordingRate
        ? "Recording Rate"
        : hasRehearsalRate
          ? "Rehearsal Rate"
          : hourlyRateValue > 0
            ? "Hourly Rate"
            : "Rate";
  const studioRateDisplay =
    hasRehearsalRate && hasRecordingRate
      ? `₱${rehearsalRateValue.toLocaleString()}/hr | ₱${recordingRateValue.toLocaleString()}/song`
      : hasRecordingRate
        ? `₱${recordingRateValue.toLocaleString()}/song`
        : hasRehearsalRate
          ? `₱${rehearsalRateValue.toLocaleString()}/hr`
          : hourlyRateValue > 0
            ? `₱${hourlyRateValue.toLocaleString()}/hr`
            : "N/A";
  const studioEquipment = Array.isArray(studio?.instruments)
    ? studio.instruments.filter((item: any) => {
      if (typeof item === "string") return item.trim().length > 0;
      return typeof item?.name === "string" && item.name.trim().length > 0;
    })
    : [];
  const studioPromotions = Array.isArray(studio?.promotions)
    ? studio.promotions.filter((promo: any) => promo?.is_active !== false)
    : [];
  const visibleBookingRows = useStagedTabRows(
    bookings,
    activeTab === "Bookings" && viewMode === "list",
    8,
  );
  const bookingMarkedDates = useMemo(
    () => {
      const summaries = bookings.reduce<
        Record<string, { active: number; inactive: number; accentColor: string }>
      >((acc, booking) => {
        const dateStr = getBookingDateKey(booking);
        if (!dateStr) return acc;

        const isActive = isActiveBookingStatus(booking.status);
        const tone = getBookingStatusTone(booking.status);
        const existing = acc[dateStr] || {
          active: 0,
          inactive: 0,
          accentColor: tone.color,
        };

        acc[dateStr] = {
          active: existing.active + (isActive ? 1 : 0),
          inactive: existing.inactive + (isActive ? 0 : 1),
          accentColor:
            existing.active > 0 && tone.color === "#F59E0B"
              ? existing.accentColor
              : tone.color,
        };
        return acc;
      }, {});

      const markedDates = Object.entries(summaries).reduce<Record<string, any>>(
        (acc, [dateStr, summary]) => {
          const hasActiveBooking = summary.active > 0;
          const isSelected = selectedDate === dateStr;
          const accentColor = hasActiveBooking
            ? summary.accentColor || colors.primary
            : colors.textSecondary;

          acc[dateStr] = {
            marked: true,
            dotColor: isSelected ? "#FFFFFF" : accentColor,
            customStyles: {
              container: {
                backgroundColor: isSelected
                  ? colors.primary
                  : hasActiveBooking
                    ? withAlpha(accentColor, isDark ? "33" : "1F")
                    : "transparent",
                borderColor: hasActiveBooking ? accentColor : colors.border,
                borderRadius: 10,
                borderWidth: hasActiveBooking ? 1 : 0,
              },
              text: {
                color: isSelected
                  ? "#FFFFFF"
                  : hasActiveBooking
                    ? colors.text
                    : colors.textSecondary,
                fontFamily: hasActiveBooking
                  ? "Poppins_600SemiBold"
                  : "Poppins_500Medium",
              },
            },
          };
          return acc;
        },
        {},
      );

      if (selectedDate) {
        const selectedMark = markedDates[selectedDate] || {};
        markedDates[selectedDate] = {
          ...selectedMark,
          marked: selectedMark.marked,
          dotColor: selectedMark.marked ? "#FFFFFF" : selectedMark.dotColor,
          customStyles: {
            ...(selectedMark.customStyles || {}),
            container: {
              ...(selectedMark.customStyles?.container || {}),
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              borderRadius: 10,
              borderWidth: 1,
            },
            text: {
              ...(selectedMark.customStyles?.text || {}),
              color: "#FFFFFF",
              fontFamily: "Poppins_700Bold",
            },
          },
        };
      }

      return markedDates;
    },
    [
      bookings,
      colors.border,
      colors.primary,
      colors.text,
      colors.textSecondary,
      isDark,
      selectedDate,
    ],
  );
  const selectedDateBookings = useMemo(
    () =>
      selectedDate
        ? bookings
          .filter((booking) => getBookingDateKey(booking) === selectedDate)
          .sort((a, b) => {
            const aTime = a.start_time?.includes(":")
              ? a.start_time
              : new Date(a.start_time).toTimeString().slice(0, 5);
            const bTime = b.start_time?.includes(":")
              ? b.start_time
              : new Date(b.start_time).toTimeString().slice(0, 5);
            return aTime.localeCompare(bTime);
          })
        : [],
    [bookings, selectedDate],
  );
  const getEquipmentLabel = (item: any) => {
    const name = typeof item === "string" ? item : item?.name;
    const quantity = typeof item === "object" && item?.quantity ? ` x${item.quantity}` : "";
    return `${name}${quantity}`;
  };
  const getEquipmentDescription = (item: any) =>
    typeof item === "object" && typeof item?.description === "string"
      ? item.description.trim()
      : "";
  const getEquipmentImage = (item: any) =>
    typeof item === "object" && typeof item?.image === "string"
      ? item.image.trim()
      : "";
  const formatPromotionDiscount = (promo: any) => {
    const value = Number(promo?.discount_value || 0);
    if (!value) return "Discount";
    return promo?.discount_type === "fixed_amount"
      ? `₱${value.toLocaleString()} off`
      : `${value}% off`;
  };
  const formatPromotionTarget = (value?: unknown) => {
    const normalized = normalizeSessionType(value);
    return formatSessionTypeLabel(normalized) || "All sessions";
  };
  const formatPromotionDates = (promo: any) => {
    if (promo?.is_permanent) return "Permanent";
    if (promo?.start_date && promo?.end_date) {
      return `${formatDashedNumericDate(promo.start_date)} - ${formatDashedNumericDate(promo.end_date)}`;
    }
    return "Date-limited";
  };
  const renderStudioEquipment = () => (
    <View style={styles.equipmentList}>
      {studioEquipment.map((item: any, i: number) => {
        const imageUrl = getEquipmentImage(item);
        const description = getEquipmentDescription(item);

        return (
          <View
            key={item?.id || `${getEquipmentLabel(item)}-${i}`}
            style={[
              styles.equipmentDetailCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.equipmentThumb} />
            ) : (
              <View
                style={[
                  styles.equipmentThumbPlaceholder,
                  { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                ]}
              >
                <Ionicons name="musical-notes-outline" size={22} color={colors.textSecondary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.equipmentDetailName, { color: colors.text }]}>
                {getEquipmentLabel(item)}
              </Text>
              {description ? (
                <Text style={[styles.equipmentDetailDescription, { color: colors.textSecondary }]}>
                  {description}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
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

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Manage Studio" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        >
          {/* Header Image & Info */}
          <View style={styles.headerContainer}>
            <View
              style={[
                styles.headerImageContainer,
                {
                  shadowColor: colors.primary,
                },
              ]}
            >
              <Image
                source={{
                  uri:
                    (studio?.images && studio.images[0]) ||
                    studio?.image ||
                    null,
                }}
                style={[styles.headerImage, { backgroundColor: colors.border }]}
                resizeMode="cover"
              />
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {studio?.name || "Loading..."}
            </Text>
            <Text
              style={[styles.headerLocation, { color: colors.textSecondary }]}
            >
              {studio?.address || "Location N/A"}
            </Text>
            {hasValidCoordinates(studio?.latitude, studio?.longitude) && (
              <TouchableOpacity activeOpacity={1}
                style={[styles.navigateButton, { backgroundColor: colors.primary }]}
                onPress={handleNavigateToStudio}
              >
                <Ionicons name="navigate-outline" size={16} color="#FFF" />
                <Text style={styles.navigateButtonText}>Navigate</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tabs */}
          <SlidingTabBar
            activeColor={colors.primary}
            activeKey={activeTab}
            borderColor={colors.border}
            indicatorColor={colors.primary}
            indicatorWidthRatio={0.34}
            onChange={(tab) => setSmoothTab(setActiveTab, tab)}
            style={styles.tabsContainer}
            tabs={tabs.map((tab) => ({ key: tab, label: tab }))}
            textStyle={styles.tabText}
          />

          <SmoothTabTransition
            activeKey={activeTab}
            activeIndex={getSmoothTabIndex(tabs, activeTab)}
            renderOutgoing={false}
            style={styles.contentContainer}
          >
            {activeTab === "About" && (
              <View style={styles.aboutContainer}>
                <View>
                  <Text
                    style={[styles.aboutText, { color: colors.textSecondary }]}
                  >
                    {studio?.description || "No description available."}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Type
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {studioTypeLabel}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Capacity
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {studio?.pax ? `${studio.pax} pax` : "N/A"}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {studioRateLabel}
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {studioRateDisplay}
                    </Text>
                  </View>
                </View>

                {studioEquipment.length > 0 && (
                  <View>
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.text, marginBottom: 12 },
                      ]}
                    >
                      Studio Equipment
                    </Text>
                    {renderStudioEquipment()}
                  </View>
                )}

                {/* <View style={{ flexDirection: "row", gap: 16 }}> */}
                {/* Recording Rate removed as requested */}
                {/* </View> */}

                {studioPromotions.length > 0 && (
                  <View>
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.text, marginBottom: 12 },
                      ]}
                    >
                      Promotions
                    </Text>
                    <View style={styles.promotionList}>
                      {studioPromotions.map((promo: any) => (
                        <View
                          key={promo.id || promo.name}
                          style={[
                            styles.promotionCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <View style={styles.promotionHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.promotionTitle, { color: colors.text }]}>
                                {promo.name || "Studio Promotion"}
                              </Text>
                              {promo.description ? (
                                <Text style={[styles.promotionDescription, { color: colors.textSecondary }]}>
                                  {promo.description}
                                </Text>
                              ) : null}
                            </View>
                            <Text style={[styles.promotionDiscount, { color: colors.primary }]}>
                              {formatPromotionDiscount(promo)}
                            </Text>
                          </View>
                          <Text style={[styles.promotionMetaText, { color: colors.textSecondary }]}>
                            {formatPromotionTarget(promo.applies_to)} | {formatPromotionDates(promo)}
                          </Text>
                          {promo.criteria ? (
                            <Text style={[styles.promotionMetaText, { color: colors.textSecondary }]}>
                              How to get promo: {promo.criteria}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Gallery
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.galleryContainer}
                  >
                    {studio?.images && studio.images.length > 0 ? (
                      studio.images.map((img: string, i: number) => (
                        <Image
                          key={i}
                          source={{ uri: img }}
                          style={styles.galleryImage}
                        />
                      ))
                    ) : (
                      <Text style={{ color: colors.textSecondary }}>
                        No images uploaded.
                      </Text>
                    )}
                  </ScrollView>
                </View>

                {/* Contract Section */}
                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Contract
                  </Text>
                  {studio?.contract_url ? (
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => openMediaOrExternal(studio.contract_url, "Contract")}
                      style={[
                        styles.contractCard,
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
                            styles.contractIcon,
                            { backgroundColor: colors.primary },
                          ]}
                        >
                          <Ionicons
                            name="document-text"
                            size={24}
                            color="#fff"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.contractTitle,
                              { color: colors.text },
                            ]}
                          >
                            Studio Contract
                          </Text>
                          <Text
                            style={[
                              styles.contractSubtitle,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Musicians will see this before booking
                          </Text>
                        </View>
                        <Ionicons
                          name="open-outline"
                          size={20}
                          color={colors.primary}
                        />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[
                        styles.noContractCard,
                        {
                          backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                          borderColor: isDark ? "#374151" : "#E5E7EB",
                        },
                      ]}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={32}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.noContractText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        No contract uploaded
                      </Text>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() =>
                          router.push({
                            pathname: "/edit_studio",
                            params: { id: studio?.id, returnTab: "About" },
                          })
                        }
                        style={{ marginTop: 8 }}
                      >
                        <Text
                          style={{
                            color: colors.primary,
                            fontFamily: "Poppins_500Medium",
                            fontSize: 13,
                          }}
                        >
                          Add Contract
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Business Permit
                  </Text>
                  <View
                    style={[
                      styles.documentMetaCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.documentMetaRow}>
                      <View style={[styles.contractIcon, { backgroundColor: colors.primary }]}>
                        <Ionicons name="shield-checkmark-outline" size={24} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.contractTitle, { color: colors.text }]}>
                          {formatStatusLabel(studio?.permit_status)}
                        </Text>
                        {studio?.permit_rejection_reason ? (
                          <Text style={[styles.contractSubtitle, { color: colors.textSecondary }]}>
                            {studio.permit_rejection_reason}
                          </Text>
                        ) : (
                          <Text style={[styles.contractSubtitle, { color: colors.textSecondary }]}>
                            Permit status from the studio profile.
                          </Text>
                        )}
                      </View>
                    </View>
                    {studio?.business_permit_url ? (
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => openMediaOrExternal(studio.business_permit_url, "Business Permit")}
                        style={[styles.mediaButton, { borderColor: colors.primary, marginBottom: 0, marginTop: 12 }]}
                      >
                        <Ionicons name="open-outline" size={18} color={colors.primary} />
                        <Text style={[styles.addGearText, { color: colors.primary, marginLeft: 8 }]}>
                          View Business Permit
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            {activeTab === "Setup" && (
              <View style={styles.aboutContainer}>
                <Text style={[styles.categoryTitle, { color: colors.primary }]}>
                  Amenities & Equipment
                </Text>
                <View style={styles.tagsContainer}>
                  {studio?.amenities?.map((item: string, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.tag,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                        },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: colors.text }]}>
                        {item}
                      </Text>
                    </View>
                  ))}
                  {(!studio?.amenities || studio.amenities.length === 0) && (
                    <Text style={{ color: colors.textSecondary }}>
                      No amenities listed.
                    </Text>
                  )}
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12, marginTop: 16 },
                    ]}
                  >
                    Equipment & Instruments
                  </Text>
                  <View>
                    {studioEquipment.length ? (
                      renderStudioEquipment()
                    ) : (
                      <Text style={{ color: colors.textSecondary }}>
                        No equipment listed.
                      </Text>
                    )}
                  </View>
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12, marginTop: 16 },
                    ]}
                  >
                    Availability
                  </Text>
                  {studio?.availability?.length ? (
                    studio.availability.map((day: any, i: number) => (
                      <View key={i} style={{ marginBottom: 8 }}>
                        <Text
                          style={{
                            fontFamily: "Poppins_600SemiBold",
                            color: colors.text,
                          }}
                        >
                          {day.day}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Poppins_400Regular",
                            color: colors.textSecondary,
                          }}
                        >
                          {day.slots?.length
                            ? day.slots
                              .map(
                                (slot: any) =>
                                  `${formatTime(slot.start)} - ${formatTime(slot.end)}${slot.session_type ? ` (${formatSessionTypeLabel(slot.session_type)})` : ""}`,
                              )
                              .join(", ")
                            : "No slots"}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      No weekly availability set.
                    </Text>
                  )}

                  {studio?.calendar_availability?.length ? (
                    <View style={{ marginTop: 12 }}>
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.text,
                          marginBottom: 6,
                        }}
                      >
                        Custom Dates
                      </Text>
                      {studio.calendar_availability
                        .slice(0, CUSTOM_DATE_PREVIEW_LIMIT)
                        .map((entry: any, i: number) => (
                          <View key={entry?.date || i} style={{ marginBottom: 8 }}>
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                color: colors.text,
                              }}
                            >
                              {formatDashedNumericDate(entry.date)}
                            </Text>
                            <Text
                              style={{
                                fontFamily: "Poppins_400Regular",
                                color: colors.textSecondary,
                              }}
                            >
                              {entry.slots?.length
                                ? entry.slots
                                  .map(
                                    (slot: any) =>
                                      `${formatTime(slot.start)} - ${formatTime(slot.end)}${slot.session_type ? ` (${formatSessionTypeLabel(slot.session_type)})` : entry.session_type ? ` (${formatSessionTypeLabel(entry.session_type)})` : ""}`,
                                  )
                                  .join(", ")
                                : "No slots"}
                            </Text>
                          </View>
                        ))}
                      {studio.calendar_availability.length > CUSTOM_DATE_PREVIEW_LIMIT ? (
                        <Text
                          style={{
                            fontFamily: "Poppins_500Medium",
                            color: colors.textSecondary,
                            marginTop: 2,
                          }}
                        >
                          +{studio.calendar_availability.length - CUSTOM_DATE_PREVIEW_LIMIT} more custom dates
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12, marginTop: 16 },
                    ]}
                  >
                    Booking Settings
                  </Text>
                  {studio?.booking_settings ? (
                    <View style={{ gap: 8 }}>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                        }}
                      >
                        Minimum Booking:{" "}
                        {studio.booking_settings.min_booking_duration_hours || 0} hours
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                        }}
                      >
                        Lead Time:{" "}
                        {studio.booking_settings.lead_time_hours || 0} hours
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                        }}
                      >
                        Weekend Multiplier:{" "}
                        {studio.booking_settings.weekend_multiplier || 1.0}x
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                        }}
                      >
                        Peak Season Multiplier:{" "}
                        {studio.booking_settings.peak_season_multiplier || 1.0}x
                      </Text>
                      {studio.booking_settings.peak_season_dates?.length ? (
                        <Text
                          style={{
                            fontFamily: "Poppins_400Regular",
                            color: colors.textSecondary,
                          }}
                        >
                          Peak Season Dates:{" "}
                          {studio.booking_settings.peak_season_dates
                            .map(
                              (d: any) =>
                                `${formatDashedNumericDate(d.start)} - ${formatDashedNumericDate(d.end)}`,
                            )
                            .join("; ")}
                        </Text>
                      ) : null}
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                        }}
                      >
                        Off-Peak Multiplier:{" "}
                        {studio.booking_settings.off_peak_multiplier || 1.0}x
                      </Text>
                      {studio.booking_settings.off_peak_dates?.length ? (
                        <Text
                          style={{
                            fontFamily: "Poppins_400Regular",
                            color: colors.textSecondary,
                          }}
                        >
                          Off-Peak Dates:{" "}
                          {studio.booking_settings.off_peak_dates
                            .map(
                              (d: any) =>
                                `${formatDashedNumericDate(d.start)} - ${formatDashedNumericDate(d.end)}`,
                            )
                            .join("; ")}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      No booking settings configured.
                    </Text>
                  )}
                </View>

                <TouchableOpacity activeOpacity={1}
                  onPress={() =>
                    router.push({
                      pathname: "/edit_studio",
                      params: { id: studio?.id, returnTab: "Setup" },
                    })
                  }
                  style={[
                    styles.addGearButton,
                    { borderColor: colors.primary, marginTop: 20 },
                  ]}
                >
                  <Text style={[styles.addGearText, { color: colors.primary }]}>
                    Edit Setup
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Acoustics merged into Setup - keeping for reference */}

            {activeTab === "Bookings" && (
              <View style={styles.aboutContainer}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Poppins_600SemiBold",
                      fontSize: 13,
                      color: colors.textSecondary,
                      letterSpacing: 0.5,
                    }}
                  >
                    BOOKING REQUESTS
                  </Text>
                  {/* View Toggle */}
                  <View
                    style={{
                      flexDirection: "row",
                      backgroundColor: isDark ? "#374151" : "#E5E7EB",
                      borderRadius: 8,
                      padding: 2,
                    }}
                  >
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => setViewMode("list")}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor:
                          viewMode === "list"
                            ? isDark
                              ? "#4B5563"
                              : "#FFFFFF"
                            : "transparent",
                      }}
                    >
                      <Ionicons
                        name="list"
                        size={16}
                        color={
                          viewMode === "list"
                            ? colors.text
                            : colors.textSecondary
                        }
                      />
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => setViewMode("calendar")}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor:
                          viewMode === "calendar"
                            ? isDark
                              ? "#4B5563"
                              : "#FFFFFF"
                            : "transparent",
                      }}
                    >
                      <Ionicons
                        name="calendar"
                        size={16}
                        color={
                          viewMode === "calendar"
                            ? colors.text
                            : colors.textSecondary
                        }
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {viewMode === "calendar" ? (
                  <View>
                    {/* Calendar View */}
                    <View
                      style={{
                        backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                        borderRadius: 16,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        marginBottom: 24,
                      }}
                    >
                      <Calendar
                        current={new Date().toISOString().split("T")[0]}
                        markingType="custom"
                        markedDates={bookingMarkedDates}
                        onDayPress={(day) => {
                          setSelectedDate(day.dateString);
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
                    </View>

                    {/* Selected Date Bookings (Slot Grid Style) */}
                    {selectedDate && (
                      <View>
                        <Text
                          style={[
                            styles.sectionTitle,
                            {
                              color: colors.text,
                              fontSize: 16,
                              marginBottom: 12,
                            },
                          ]}
                        >
                          Schedule for{" "}
                          {new Date(selectedDate).toLocaleDateString(
                            undefined,
                            { weekday: "long", month: "short", day: "numeric" },
                          )}
                        </Text>
                        {selectedDateBookings.length > 0 ? (
                          <View style={styles.tagsContainer}>
                            {selectedDateBookings.map((booking) => {
                              const statusTone = getBookingStatusTone(booking.status);
                              const isActive = isActiveBookingStatus(booking.status);
                              const statusLabel = formatStatusLabel(booking.status);
                              const badgeLabel =
                                isActive &&
                                  ["confirmed", "checked_in"].includes(
                                    normalizeBookingStatus(booking.status),
                                  )
                                  ? `Active • ${statusLabel}`
                                  : statusLabel;
                              const slots = getBookingSlots(booking);
                              const notes =
                                typeof booking.notes === "string"
                                  ? booking.notes.trim()
                                  : "";
                              const paymentLabel = booking.payment_status
                                ? `Payment: ${formatStatusLabel(booking.payment_status)}`
                                : "Payment not set";

                              return (
                                <View
                                  key={booking.id}
                                  style={[
                                    styles.calendarBookingCard,
                                    {
                                      backgroundColor: isActive
                                        ? withAlpha(statusTone.color, isDark ? "24" : "12")
                                        : isDark
                                          ? "#1F2937"
                                          : "#F9FAFB",
                                      borderColor: isActive
                                        ? statusTone.color
                                        : colors.border,
                                    },
                                  ]}
                                >
                                  <View style={styles.calendarBookingTopRow}>
                                    <View
                                      style={[
                                        styles.calendarTimePill,
                                        { backgroundColor: statusTone.color },
                                      ]}
                                    >
                                      <Text style={styles.calendarTimePillText}>
                                        {getBookingTimeSummary(booking)}
                                      </Text>
                                    </View>

                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text
                                        style={[
                                          styles.calendarBookingName,
                                          { color: colors.text },
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {booking.user?.full_name ||
                                          "Unknown User"}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.calendarBookingEmail,
                                          { color: colors.textSecondary },
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {booking.user?.email || "No email on profile"}
                                      </Text>
                                    </View>

                                    <View
                                      style={[
                                        styles.calendarStatusBadge,
                                        {
                                          backgroundColor: withAlpha(
                                            statusTone.color,
                                            isDark ? "33" : "18",
                                          ),
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name={statusTone.icon}
                                        size={14}
                                        color={statusTone.color}
                                      />
                                      <Text
                                        style={[
                                          styles.calendarStatusBadgeText,
                                          { color: statusTone.color },
                                        ]}
                                      >
                                        {badgeLabel}
                                      </Text>
                                    </View>
                                  </View>

                                  <View style={styles.calendarBookingMetaRow}>
                                    <View
                                      style={[
                                        styles.calendarMetaPill,
                                        {
                                          backgroundColor: isDark
                                            ? "rgba(15, 23, 42, 0.52)"
                                            : "#FFFFFF",
                                          borderColor: colors.border,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name="musical-notes-outline"
                                        size={14}
                                        color={colors.primary}
                                      />
                                      <Text
                                        style={[
                                          styles.calendarMetaPillText,
                                          { color: colors.text },
                                        ]}
                                      >
                                        {getBookingSessionLabel(booking)}
                                      </Text>
                                    </View>

                                    <View
                                      style={[
                                        styles.calendarMetaPill,
                                        {
                                          backgroundColor: isDark
                                            ? "rgba(15, 23, 42, 0.52)"
                                            : "#FFFFFF",
                                          borderColor: colors.border,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name="cash-outline"
                                        size={14}
                                        color={colors.primary}
                                      />
                                      <Text
                                        style={[
                                          styles.calendarMetaPillText,
                                          { color: colors.text },
                                        ]}
                                      >
                                        {formatCurrency(
                                          booking.total_price || booking.final_price,
                                        )}
                                      </Text>
                                    </View>

                                    <View
                                      style={[
                                        styles.calendarMetaPill,
                                        {
                                          backgroundColor: isDark
                                            ? "rgba(15, 23, 42, 0.52)"
                                            : "#FFFFFF",
                                          borderColor: colors.border,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name="card-outline"
                                        size={14}
                                        color={colors.primary}
                                      />
                                      <Text
                                        style={[
                                          styles.calendarMetaPillText,
                                          { color: colors.text },
                                        ]}
                                      >
                                        {paymentLabel}
                                      </Text>
                                    </View>
                                  </View>

                                  {slots.length > 1 && (
                                    <View style={styles.calendarSlotList}>
                                      {slots.map((slot: any, slotIndex: number) => (
                                        <View
                                          key={`${slot.start}-${slot.end}-${slotIndex}`}
                                          style={[
                                            styles.calendarSlotMiniPill,
                                            {
                                              backgroundColor: isDark
                                                ? "#111827"
                                                : "#EEF2FF",
                                            },
                                          ]}
                                        >
                                          <Ionicons
                                            name="time-outline"
                                            size={13}
                                            color={colors.primary}
                                          />
                                          <Text
                                            style={[
                                              styles.calendarSlotMiniText,
                                              { color: colors.text },
                                            ]}
                                          >
                                            {formatTime(slot.start)} -{" "}
                                            {formatTime(slot.end)}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}

                                  {notes ? (
                                    <View
                                      style={[
                                        styles.calendarNotes,
                                        {
                                          backgroundColor: isDark
                                            ? "rgba(15, 23, 42, 0.52)"
                                            : "#FFFFFF",
                                          borderColor: colors.border,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name="chatbubble-ellipses-outline"
                                        size={14}
                                        color={colors.primary}
                                      />
                                      <Text
                                        style={[
                                          styles.calendarNotesText,
                                          { color: colors.textSecondary },
                                        ]}
                                        numberOfLines={2}
                                      >
                                        {notes}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontStyle: "italic",
                            }}
                          >
                            No bookings for this date.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                ) : // List View (Existing)
                  bookings.length === 0 ? (
                    <Text
                      style={{
                        color: colors.textSecondary,
                        textAlign: "center",
                        marginTop: 20,
                      }}
                    >
                        No bookings found.
                      </Text>
                  ) : (
                    visibleBookingRows.map((booking) => (
                      <View
                        key={booking.id}
                        style={[
                          styles.bookingCard,
                          { backgroundColor: colors.surface, marginBottom: 12 },
                        ]}
                      >
                        <View style={styles.bookingHeader}>
                          <Image
                            source={{
                              uri:
                                booking.user?.avatar_url ||
                                "https://i.pravatar.cc/100",
                            }}
                            style={styles.bookingImage}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.bookingTitle,
                                { color: colors.text },
                              ]}
                            >
                              {booking.user?.full_name || "Unknown User"}
                            </Text>
                            <Text
                              style={[
                                styles.bookingSubtitle,
                                { color: colors.textSecondary },
                              ]}
                            >
                              {booking.user?.email}
                            </Text>
                          </View>
                          <View style={styles.bookingPriceContainer}>
                            <Text
                              style={[
                                styles.bookingPrice,
                                { color: colors.primary },
                              ]}
                            >
                              ₱
                              {(
                                booking.total_price ||
                                booking.final_price ||
                                0
                              ).toLocaleString()}
                            </Text>
                            <Text
                              style={[
                                styles.bookingDuration,
                                { color: colors.textSecondary },
                              ]}
                            >
                              {formatStatusLabel(booking.status)}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.bookingDateContainer,
                            {
                              backgroundColor: isDark
                                ? "rgba(30, 41, 59, 0.5)"
                                : "#F9FAFB",
                            },
                          ]}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={16}
                            color={colors.primary}
                          />
                          <Text
                            style={[styles.bookingDate, { color: colors.text }]}
                          >
                            {formatDashedNumericDate(
                              booking.raw_date || booking.booking_date || booking.start_time,
                            )}
                          </Text>
                        </View>

                        {/* Display time slots */}
                        {booking.time_slots &&
                          Array.isArray(booking.time_slots) &&
                          booking.time_slots.length > 1 ? (
                          // Multi-slot booking - show all slots
                          <View style={{ marginTop: 12, gap: 8 }}>
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                fontSize: 12,
                                color: colors.textSecondary,
                                marginBottom: 4,
                              }}
                            >
                              {booking.time_slots.length} TIME SLOTS REQUESTED
                            </Text>
                            {booking.time_slots.map(
                              (slot: any, index: number) => (
                                <View
                                  key={index}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    backgroundColor: isDark
                                      ? "#374151"
                                      : "#F3F4F6",
                                    padding: 10,
                                    borderRadius: 8,
                                    gap: 8,
                                  }}
                                >
                                  <Ionicons
                                    name="time-outline"
                                    size={16}
                                    color={colors.primary}
                                  />
                                  <Text
                                    style={{
                                      fontFamily: "Poppins_500Medium",
                                      color: colors.text,
                                      flex: 1,
                                    }}
                                  >
                                    {formatTime(slot.start)} -{" "}
                                    {formatTime(slot.end)}
                                  </Text>
                                </View>
                              ),
                            )}
                          </View>
                        ) : (
                          // Single slot - show regular time display
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginTop: 8,
                              gap: 8,
                            }}
                          >
                            <Ionicons
                              name="time-outline"
                              size={16}
                              color={colors.primary}
                            />
                            <Text
                              style={[styles.bookingDate, { color: colors.text }]}
                            >
                              {formatTime(booking.start_time)} -{" "}
                              {formatTime(booking.end_time)}
                            </Text>
                          </View>
                        )}

                        {/* Action buttons if pending */}
                        {booking.status === "pending" && (
                          <View style={{ marginTop: 16 }}>
                            {/* If multi-slot, show partial approval option */}
                            {booking.time_slots &&
                              Array.isArray(booking.time_slots) &&
                              booking.time_slots.length > 1 && (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => openPartialApproval(booking)}
                                  style={[
                                    styles.partialApprovalButton,
                                    {
                                      borderColor: colors.primary,
                                      marginBottom: 12,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name="options-outline"
                                    size={16}
                                    color={colors.primary}
                                  />
                                  <Text
                                    style={{
                                      fontFamily: "Poppins_500Medium",
                                      color: colors.primary,
                                      marginLeft: 8,
                                    }}
                                  >
                                    Approve/Decline Individual Slots
                                  </Text>
                                </TouchableOpacity>
                              )}

                            <View style={styles.actionButtons}>
                              <TouchableOpacity activeOpacity={1}
                                onPress={() =>
                                  confirmAction(booking.id, "cancelled")
                                }
                                style={[
                                  styles.declineButton,
                                  { borderColor: colors.border },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontFamily: "Poppins_600SemiBold",
                                    color: colors.text,
                                  }}
                                >
                                  Decline All
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity activeOpacity={1}
                                onPress={() =>
                                  confirmAction(booking.id, "confirmed")
                                }
                                style={[
                                  styles.acceptButton,
                                  { backgroundColor: colors.primary },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontFamily: "Poppins_600SemiBold",
                                    color: "#FFF",
                                  }}
                                >
                                  Accept All
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    ))
                  )}
              </View>
            )}
            {activeTab === "Review" && (
              <View>
                <View style={styles.reviewHeader}>
                  <Text style={[styles.ratingText, { color: colors.text }]}>
                    {studio?.rating?.toFixed(1) || "0.0"}
                  </Text>
                  <View style={styles.starsRow}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={i}
                        name={
                          i < Math.round(studio?.rating || 0)
                            ? "star"
                            : "star-outline"
                        }
                        size={20}
                        color={colors.primary}
                      />
                    ))}
                  </View>
                  <Text
                    style={{
                      fontFamily: "Poppins_400Regular",
                      color: colors.textSecondary,
                    }}
                  >
                    Based on {studio?.review_count || 0} reviews
                  </Text>
                </View>

                {reviews.map((review) => (
                  <View
                    key={review.id}
                    style={[
                      styles.reviewCard,
                      { backgroundColor: colors.surface, marginBottom: 12 },
                    ]}
                  >
                    <View style={styles.reviewUserHeader}>
                      <View style={styles.userInfo}>
                        <Image
                          source={{
                            uri:
                              review.author?.avatar_url ||
                              "https://i.pravatar.cc/100",
                          }}
                          style={styles.userAvatar}
                        />
                        <Text
                          style={{
                            fontFamily: "Poppins_600SemiBold",
                            color: colors.text,
                          }}
                        >
                          {review.author?.full_name || "User"}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.textSecondary,
                          fontFamily: "Poppins_400Regular",
                        }}
                      >
                        {formatFriendlyDateTime(review.created_at)}
                      </Text>
                    </View>
                    <View style={[styles.starsRow, { marginBottom: 8 }]}>
                      {[...Array(5)].map((_, i) => (
                        <Ionicons
                          key={i}
                          name={i < review.rating ? "star" : "star-outline"}
                          size={14}
                          color={colors.primary}
                        />
                      ))}
                    </View>
                    <Text
                      style={[
                        styles.reviewText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {review.content || review.comment || "No written review."}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </SmoothTabTransition>
        </ScrollView>

        <Navbar />
      </View>
      <Modal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setShowReasonInput(false);
          setCancellationReason("");
          cancellationReasonRef.current = "";
        }}
        onConfirm={modalAction}
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
        danger={modalButtonText === "Decline"}
        showInput={showReasonInput}
        inputValue={cancellationReason}
        onInputChange={(text) => {
          cancellationReasonRef.current = text;
          setCancellationReason(text);
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
      <InAppMediaViewer
        visible={!!mediaViewerUrl}
        uri={mediaViewerUrl}
        title={mediaViewerTitle}
        onClose={() => setMediaViewerUrl(null)}
      />

      {/* Partial Approval Modal for Multi-Slot Bookings */}
      <BottomModal
        visible={partialModalVisible}
        overlayLabel="ManageStudioPartialApprovalModal"
        onClose={() => {
          setPartialModalVisible(false);
          setSelectedBookingForPartial(null);
          setSelectedSlots({});
        }}
      >
          <View
            style={[
              styles.partialModalContainer,
              { backgroundColor: colors.card },
            ]}
          >
            <View style={styles.partialModalHeader}>
              <Text style={[styles.partialModalTitle, { color: colors.text }]}>
                Review Time Slots
              </Text>
              <TouchableOpacity activeOpacity={1}
                onPress={() => {
                  setPartialModalVisible(false);
                  setSelectedBookingForPartial(null);
                  setSelectedSlots({});
                }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text
              style={[
                styles.partialModalSubtitle,
                { color: colors.textSecondary },
              ]}
            >
              Decide on each time slot individually. You can accept some and
              decline others.
            </Text>

            <ScrollView
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
            >
              {selectedBookingForPartial?.time_slots?.map(
                (slot: any, index: number) => (
                  <View
                    key={index}
                    style={[
                      styles.slotDecisionCard,
                      {
                        backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.slotTimeInfo}>
                      <Ionicons
                        name="time-outline"
                        size={20}
                        color={colors.primary}
                      />
                      <Text
                        style={[styles.slotTimeText, { color: colors.text }]}
                      >
                        {formatTime(slot.start)} - {formatTime(slot.end)}
                      </Text>
                    </View>
                    <View style={styles.slotDecisionButtons}>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => toggleSlotSelection(index, "decline")}
                        style={[
                          styles.slotDecisionBtn,
                          {
                            backgroundColor:
                              selectedSlots[index] === "decline"
                                ? "#EF4444"
                                : "transparent",
                            borderColor:
                              selectedSlots[index] === "decline"
                                ? "#EF4444"
                                : colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name="close"
                          size={16}
                          color={
                            selectedSlots[index] === "decline"
                              ? "#FFF"
                              : colors.textSecondary
                          }
                        />
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => toggleSlotSelection(index, "accept")}
                        style={[
                          styles.slotDecisionBtn,
                          {
                            backgroundColor:
                              selectedSlots[index] === "accept"
                                ? "#10B981"
                                : "transparent",
                            borderColor:
                              selectedSlots[index] === "accept"
                                ? "#10B981"
                                : colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={
                            selectedSlots[index] === "accept"
                              ? "#FFF"
                              : colors.textSecondary
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ),
              )}
            </ScrollView>

            {/* Summary */}
            <View style={[styles.slotSummary, { borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <View
                  style={[styles.summaryDot, { backgroundColor: "#10B981" }]}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: "Poppins_500Medium",
                  }}
                >
                  Accepting:{" "}
                  {
                    Object.values(selectedSlots).filter((v) => v === "accept")
                      .length
                  }{" "}
                  slots
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <View
                  style={[styles.summaryDot, { backgroundColor: "#EF4444" }]}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: "Poppins_500Medium",
                  }}
                >
                  Declining:{" "}
                  {
                    Object.values(selectedSlots).filter((v) => v === "decline")
                      .length
                  }{" "}
                  slots
                </Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={1}
              onPress={handlePartialApproval}
              style={[
                styles.submitPartialBtn,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontFamily: "Poppins_600SemiBold",
                  fontSize: 16,
                }}
              >
                Submit Decisions
              </Text>
            </TouchableOpacity>
          </View>
      </BottomModal>
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
    paddingBottom: 180,
  },
  headerContainer: {
    paddingHorizontal: 24,
    marginTop: 16,
    alignItems: "center",
  },
  headerImageContainer: {
    width: "100%",
    height: 192,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 16,
    position: "relative",
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },

  headerTitle: {
    fontSize: 24,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
  },
  headerLocation: {
    textAlign: "center",
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
  },
  navigateButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  navigateButtonText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  tabsContainer: {
    marginHorizontal: 24,
    marginTop: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 13,
  },
  contentContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  aboutContainer: {
    gap: 24,
  },
  aboutText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: "Poppins_400Regular",
  },
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  infoLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: "Poppins_600SemiBold",
  },
  infoValue: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  galleryContainer: {
    gap: 12,
  },
  galleryImage: {
    width: 160,
    height: 112,
    borderRadius: 12,
    marginRight: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  searchText: {
    marginLeft: 12,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  categoryTitle: {
    fontSize: 18,
    marginBottom: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  equipmentList: {
    gap: 12,
  },
  equipmentDetailCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  equipmentThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  equipmentThumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  equipmentDetailName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  equipmentDetailDescription: {
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  promotionList: {
    gap: 12,
  },
  promotionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  promotionHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  promotionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  promotionDescription: {
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  promotionDiscount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  promotionMetaText: {
    marginTop: 8,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  documentMetaCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  documentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  addGearButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addGearText: {
    fontFamily: "Poppins_600SemiBold",
  },
  mediaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  roomProfileCard: {
    padding: 16,
    borderRadius: 16,
  },
  roomProfileTitle: {
    fontSize: 18,
    marginBottom: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  roomProfileTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  roomProfileTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  roomProfileTagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  roomProfileStat: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  roomProfileStatLabel: {
    fontFamily: "Poppins_400Regular",
  },
  roomProfileStatValue: {
    fontFamily: "Poppins_600SemiBold",
  },
  graphContainer: {
    height: 160,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  graphText: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },
  bookingCard: {
    padding: 16,
    borderRadius: 24,
  },
  calendarBookingCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  calendarBookingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  calendarTimePill: {
    minWidth: 92,
    maxWidth: 118,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarTimePillText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
  },
  calendarBookingName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    lineHeight: 20,
  },
  calendarBookingEmail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  calendarStatusBadge: {
    maxWidth: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  calendarStatusBadgeText: {
    flexShrink: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    lineHeight: 14,
  },
  calendarBookingMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  calendarMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  calendarMetaPillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    lineHeight: 15,
  },
  calendarSlotList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  calendarSlotMiniPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  calendarSlotMiniText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    lineHeight: 15,
  },
  calendarNotes: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  calendarNotesText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  bookingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  bookingImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  bookingTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  bookingSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  bookingPriceContainer: {
    alignItems: "flex-end",
  },
  bookingPrice: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  bookingDuration: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  bookingDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    padding: 8,
    borderRadius: 8,
  },
  bookingDate: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  bookingMessage: {
    marginBottom: 16,
    fontStyle: "italic",
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  ratingText: {
    fontSize: 48,
    marginBottom: 8,
    fontFamily: "Poppins_600SemiBold",
  },
  starsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  reviewUserHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reviewText: {
    lineHeight: 20,
  },
  timeSlotChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  contractCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  contractIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contractTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 2,
  },
  contractSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  noContractCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  noContractText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    marginTop: 8,
  },
  // Partial Approval Styles
  partialApprovalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  partialModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  partialModalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  partialModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  partialModalTitle: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  partialModalSubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    marginBottom: 20,
  },
  slotDecisionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  slotTimeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  slotTimeText: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  slotDecisionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  slotDecisionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  slotSummary: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  submitPartialBtn: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});


