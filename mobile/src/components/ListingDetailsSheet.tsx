import { Ionicons } from "@expo/vector-icons";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
    useBottomSheetTimingConfigs,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import * as ExpoLinking from "expo-linking";
import { router } from "expo-router";
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
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { Easing } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useApplicationSubmissionAction } from "../hooks/useApplicationSubmissionAction";
import { useBookingRequestAction } from "../hooks/useBookingRequestAction";
import { useCurrentUserVenueRole } from "../hooks/useCurrentUserVenueRole";
import { useListingSheetDerived } from "../hooks/useListingSheetDerived";
import { useListingSheetEffects } from "../hooks/useListingSheetEffects";
import { useProfileCompletion } from "../hooks/useProfileCompletion";
import CustomAlert from "./CustomAlert";
import ReportModal from "./ReportModal";
import BookingControls from "./listingDetails/BookingControls";
import GigApplyTab from "./listingDetails/GigApplyTab";
import GigInfoTab from "./listingDetails/GigInfoTab";
import GroupAboutTab from "./listingDetails/GroupAboutTab";
import GroupConnectTab from "./listingDetails/GroupConnectTab";
import GroupSetupTab from "./listingDetails/GroupSetupTab";
import GroupTimelineTab from "./listingDetails/GroupTimelineTab";
import ListingBottomBar from "./listingDetails/ListingBottomBar";
import ListingContentBody from "./listingDetails/ListingContentBody";
import ListingHeroSection from "./listingDetails/ListingHeroSection";
import ReviewsTab from "./listingDetails/ReviewsTab";
import StudioBookTab from "./listingDetails/StudioBookTab";
import StudioGigVenueAboutTab from "./listingDetails/StudioGigVenueAboutTab";
import StudioSetupTab from "./listingDetails/StudioSetupTab";
import { isRecordingStudioMode, normalizeStudioType } from "./listingDetails/availability";
import Modal from "./modal";

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
  listingId: string | null;
  onDismiss?: () => void;
}

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

const ListingDetailsSheet = forwardRef<
  BottomSheetModal,
  ListingDetailsSheetProps
>(function ListingDetailsSheet({ listingId, onDismiss }, ref) {
  const { colors, isDark } = useTheme();
  const { userId, userRole, isGuest, isSystemLocked, showLockAlert } = useAuth();
  const { isProfileComplete } = useProfileCompletion();
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [bookingNotes, setBookingNotes] = useState("");

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
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Venue Selection State (for venue owners sending invites)
  const [userVenues, setUserVenues] = useState<any[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

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
            .eq("studio_id", listingId);

          let freshAvailability = group.availability;
          let freshDateOverrides = group.dateOverrides;

          if (!hoursError && operatingHours) {
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
                })),
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
            );
          }
        } catch (e) {
          console.error("Error refreshing studio data:", e);
        }
      }
    },
    [listingId, group, bookings],
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
    options?: { requireTerms?: boolean },
  ) => {
    debugLog("🔵 handleConfirm called");

    // System Lock Check - Block if user has unpaid balance
    if (isSystemLocked) {
      showLockAlert();
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

  const normalizedListingType = String(group?.type || "").toLowerCase();
  const listingOwnerId =
    group?.owner_id ||
    group?.organizer_id ||
    (normalizedListingType === "artist" ? group?.id || null : null);
  const isOwnListing = !!userId && !!listingOwnerId && listingOwnerId === userId;
  const showReportButton = !!group && !isOwnListing && !isGuest;

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

  const handleShare = async () => {
    try {
      const name = group?.name || 'this listing';
      const type = group?.type || 'Listing';
      await Share.share({
        message: `Check out ${name} (${type}) on MusikaLokal!`,
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
        queryParams: { status: "success", booking_id: booking.id },
      });
      const cancelRedirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "cancelled", booking_id: booking.id },
      });

      const { data: paymentData, error: paymentError } =
        await supabase.functions.invoke("paymongo", {
          body: {
            action: "create_checkout",
            booking_id: booking.id,
            user_id: userId,
            amount: payAmount,
            total_amount: totalAmount,
            payment_type: paymentType,
            remaining_balance: remainingBalance,
            studio_name: studioName,
            booking_date: booking.booking_date,
            description:
              paymentType === "downpayment"
                ? `Downpayment (50%) for studio booking at ${studioName}`
                : `Studio booking at ${studioName}`,
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
          .from("notifications")
          .select("id, created_at")
          .eq("user_id", userId)
          .eq("title", "Group Application Submitted")
          .contains("meta", { group_listing_id: listingId })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error checking existing group application:", error);
          return;
        }

        if (data) {
          setHasExistingApplication(true);
          setExistingApplicationStatus("pending");
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

    try {
      // Check for any existing application to this specific gig
      // Once rejected, musician cannot re-apply to the same gig
      const { data, error } = await supabase
        .from("gig_applications")
        .select("id, status, group_id, cv_url")
        .eq("applicant_id", userId)
        .eq("gig_id", listingId)
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
        .neq("status", "rejected")
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
        setExistingStudioBookingStatus("unpaid");
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
          body: { action: "check_eligibility", userId, gigId: targetGigId },
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
    listingId,
    group,
    groupAlreadyApplied,
    groupApplicationBy,
    selectedGroupId,
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
  const animationConfigs = useBottomSheetTimingConfigs({
    duration: 320,
    easing: Easing.inOut(Easing.cubic),
  });

  useEffect(() => {
    debugLog("=== ListingDetailsSheet useEffect triggered ===");
    debugLog("listingId:", listingId);
    if (listingId) {
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
      // Reset studio booking state
      setHasExistingStudioBooking(false);
      setExistingStudioBookingStatus(null);
      // Reset group selection state
      setSelectedGroupId(null);
      setSelectedSlotType(null);
      setUserGroups([]);
      // Reset venue selection state
      setSelectedVenueId(null);
      setUserVenues([]);

      debugLog("Application form reset");
      setShowAddBooking(false);

      return () => {
        interactionTask.cancel();
      };
    }
  }, [listingId]);

  // Check for existing application when group data is loaded
  useEffect(() => {
    if (group && userId && (group.type === "Gig" || group.type === "Group")) {
      checkExistingApplication();
      if (group.type === "Gig") {
        fetchUserGroups();
      }
    }
  }, [group, userId]);

  // Check for existing studio booking when group data is loaded
  useEffect(() => {
    if (
      group &&
      userId &&
      (group.type === "Studio" || group.type === "Venue")
    ) {
      checkExistingStudioBooking();
    }
    // Check eligibility if Gig (uses gig_id)
    if (group && userId && group.type === "Gig") {
      checkEligibility(group.id);
    }
  }, [group, userId]);

  // Check if selected group has already applied (group-level deduplication)
  useEffect(() => {
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
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      debugLog("User:", user?.id);

      let data = null;
      let type = "Group";
      let ownerId = null;

      // Try Group
      const { data: groupData } = await supabase
        .from("groups_with_stats")
        .select("*")
        .eq("id", listingId)
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
          .eq("id", listingId)
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
            .eq("id", listingId)
            .single();

          if (gigData) {
            data = gigData;
            type = "Gig";
            ownerId = gigData.organizer_id;
          } else {
            // Try Profile (Solo Artist)
            const { data: profileData } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", listingId)
              .single();

            if (profileData && profileData.role === "musician") {
              data = profileData;
              type = "Artist";
              ownerId = profileData.id; // Self-managed
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
              .eq("studio_id", data.id),
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

          if (!hoursError && operatingHours) {
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
                })),
              };
            });
            normalizedData.availability = availability;
            debugLog("📅 Converted availability:", availability);
          } else if (!data.availability) {
            debugLog(
              "⚠️ No operating hours found, checking availability column...",
            );
            // Fallback: check if availability exists in the data (JSONB column)
            if (data.availability) {
              normalizedData.availability = data.availability;
              debugLog(
                "📅 Using availability from JSONB column:",
                data.availability,
              );
            }
          }

          // Store date overrides for use in availability processing
          if (!overridesError && dateOverrides && dateOverrides.length > 0) {
            debugLog("📅 Date overrides fetched:", dateOverrides);
            normalizedData.dateOverrides = dateOverrides;
          }

          if (!settingsError && studioSettings) {
            debugLog("⚙️ Studio settings fetched:", studioSettings);
            normalizedData.settings = studioSettings;
          } else {
            debugLog("⚠️ No studio settings found, using defaults");
            normalizedData.settings = {
              lead_time_hours: 24,
              weekend_multiplier: 1.0,
              peak_season_multiplier: 1.0,
              peak_season_dates: [],
              off_peak_multiplier: 1.0,
              off_peak_dates: [],
            };
          }
        }

        debugLog("Setting group data:", normalizedData);
        setGroup(normalizedData);

        if (type === "Studio" || type === "Venue") {
          // Fetch existing bookings for availability calculation
          const fetchedBookings = await fetchStudioBookings(data.id);
          setExistingBookings(fetchedBookings);

          // Process availability (Availability + Bookings + Date Overrides)
          if (normalizedData.availability) {
            debugLog("📅 Processing availability for calendar...");
            processAvailability(
              normalizedData.availability,
              fetchedBookings,
              normalizedData.dateOverrides,
            );
          } else {
            debugLog("⚠️ No availability data to process");
          }
        } else {
          setExistingBookings([]);
        }
      } else {
        debugLog("No data found for listingId:", listingId);
      }
    } catch (e) {
      debugLog("Error fetching details:", e);
    } finally {
      setLoading(false);
      debugLog("fetchGroupDetails complete, loading:", false);
    }
  };

  const processAvailability = (
    availability: any[],
    dbBookings: any[],
    dateOverrides?: any[],
    cartBookings?: any[],
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
    const leadTimeHours = group?.settings?.lead_time_hours || 0;
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
    const dateOverrideMap: { [key: string]: any } = {};
    if (dateOverrides && Array.isArray(dateOverrides)) {
      dateOverrides.forEach((override: any) => {
        const dateStr = override.override_date;
        dateOverrideMap[dateStr] = override;
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
      const dateOverride = dateOverrideMap[dateStr];
      let daySchedule: any = null;

      if (dateOverride) {
        // Use date override instead of weekly schedule
        if (
          dateOverride.is_open &&
          dateOverride.open_time &&
          dateOverride.close_time
        ) {
          daySchedule = {
            day: date.toLocaleDateString("en-US", { weekday: "long" }),
            slots: [
              { start: dateOverride.open_time, end: dateOverride.close_time },
            ],
            isOverride: true,
          };
          debugLog(`📅 Using date override for ${dateStr}:`, daySchedule);
        } else {
          // Date is closed via override
          daySchedule = null;
        }
      } else {
        // Use weekly schedule
        daySchedule = availabilityMap[dayIndex];
      }

      // Check if Open
      if (daySchedule && daySchedule.slots && daySchedule.slots.length > 0) {
        // Calculate if Fully Booked
        // 1. Generate all potential slots for this day (considering lead time)
        const potentialSlots: string[] = [];
        daySchedule.slots.forEach((slot: any) => {
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
            dotColor: daySchedule.isOverride ? "#F59E0B" : colors.primary, // Orange for overrides
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
      const dateOverride = group.dateOverrides.find(
        (o: any) => o.override_date === dateStr,
      );
      if (dateOverride) {
        debugLog("🕐 Found date override:", dateOverride);
        if (
          dateOverride.is_open &&
          dateOverride.open_time &&
          dateOverride.close_time
        ) {
          daySchedule = {
            day: dayName,
            slots: [
              { start: dateOverride.open_time, end: dateOverride.close_time },
            ],
            isOverride: true,
          };
        } else {
          // Date is closed
          debugLog("⚠️ Date override marks this date as closed");
          setAvailableSlots([]);
          return [];
        }
      }
    }

    // Fall back to weekly schedule if no override
    if (!daySchedule) {
      daySchedule = group.availability.find(
        (a: any) => a.day.toLowerCase() === dayName,
      );
    }

    debugLog("🕐 Found day schedule:", daySchedule);

    if (!daySchedule || !daySchedule.slots) {
      debugLog("⚠️ No slots for this day");
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

    daySchedule.slots.forEach((slot: any) => {
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
    const nextState = !isFavorited;
    setIsFavorited(nextState);

    // AI LEARNING: If favoriting, update user interest profile
    if (nextState && group && group.embedding) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.rpc("update_user_interest", {
            p_user_id: user.id,
            p_item_vector: group.embedding,
            p_weight: 0.3, // Strong learning signal for explicit favorite
          });
          // debugLog('AI Learned from Favorite!');
        }
      } catch (e) {
        debugLog("Error updating interest:", e);
      }
    }
  };

  useListingSheetEffects({
    group,
    listingId,
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
    currentUserRole,
    currentUserId,
    checkingVenue,
  } = useCurrentUserVenueRole();

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
  const effectiveUserRole = userRole || currentUserRole;
  const canApplyToGroup =
    isGroupListing &&
    group?.open_group_applications === true &&
    !!userId &&
    effectiveUserRole === "musician" &&
    group?.owner_id !== userId;

  const tabsToRender = useMemo(() => {
    const baseTabs = Array.isArray(labels.tabs) ? [...labels.tabs] : [];

    if (!isGroupListing) {
      return baseTabs;
    }

    const withoutApply = baseTabs.filter((tab) => tab !== "Apply");
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
  }, [canApplyToGroup, isGroupListing, labels.tabs]);

  const showTabs = hasDefaultTabs && tabsToRender.length > 0;

  useEffect(() => {
    if (!tabsToRender.length) {
      return;
    }

    if (!tabsToRender.includes(activeTab)) {
      setActiveTab(tabsToRender[0]);
    }
  }, [activeTab, tabsToRender]);

  const renderTabs = () => (
    <View style={[styles.tabsContainer, { borderBottomColor: colors.border }]}>
      {tabsToRender.map((tab) => (
        <TouchableOpacity activeOpacity={1}
          key={tab}
          style={[
            styles.tab,
            activeTab === tab && {
              borderBottomColor: colors.primary,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === tab
                ? { color: colors.primary, fontFamily: "Poppins_600SemiBold" }
                : { color: colors.textSecondary },
            ]}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
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

  // Helper to calculate profile completion
  const calculateCompletion = () => {
    let score = 0;
    let total = 5;
    if (group.name) score++;
    if (group.owner_avatar || group.image) score++;
    if (group.description && group.description.length > 20) score++;
    if (group.location) score++;
    if (group.images && group.images.length > 1) score++;

    return Math.round((score / total) * 100);
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
      calculateCompletion={calculateCompletion}
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
    currentUserRole,
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

  // Group: Connect Tab
  const renderGroupConnect = () => (
    <GroupConnectTab
      currentUserRole={currentUserRole}
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
    />
  );

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
      calculateCompletion={calculateCompletion}
      handleProfileNavigation={handleProfileNavigation}
      promotions={group?.promotions || []}
    />
  );

  return (
    <>
      <BottomSheetModal
        ref={ref}
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
        {loading ? (
          <View
            style={[
              styles.loadingContainer,
              { backgroundColor: colors.background },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : group ? (
          <BottomSheetScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
          >
            <ListingHeroSection
              group={group}
              colors={colors}
              styles={styles}
              isFavorited={isFavorited}
              showReportButton={showReportButton}
              onClose={() => (ref as any)?.current?.dismiss()}
              onToggleFavorite={toggleFavorite}
              onReport={handleReport}
              onShare={handleShare}
            />

            {/* TABS SELECTOR */}
            {showTabs && renderTabs()}

            <ListingContentBody
              styles={styles}
              colors={colors}
              group={group}
              activeTab={activeTab}
              showTabs={showTabs}
              renderGroupAbout={renderGroupAbout}
              renderGroupApply={renderGroupApply}
              renderGroupTimeline={renderGroupTimeline}
              renderReviews={renderReviews}
              renderStudioGigVenueAbout={renderStudioGigVenueAbout}
              renderStudioSetup={renderStudioSetup}
              renderStudioBook={renderStudioBook}
              renderGigInfo={renderGigInfo}
              renderGigApply={renderGigApply}
            />

            {/* Bottom Bar for GROUP/Default only - Tabs have their own CTAs */}
            {!showTabs && (
              <ListingBottomBar
                styles={styles}
                colors={colors}
                displayRate={effectiveDisplayRate}
                labels={labels}
                onReserve={() =>
                  handleConfirm(
                    () => debugLog("Group Reserved"),
                    "Reserve Artist",
                    "Confirm reservation request?",
                  )
                }
              />
            )}
          </BottomSheetScrollView>
        ) : null}
      </BottomSheetModal>

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

      <ReportModal
        visible={showListingReportModal}
        onClose={() => setShowListingReportModal(false)}
        onSubmit={submitReport}
        targetName={group?.name || 'this listing'}
        title={group?.type ? `Report ${group.type}` : 'Report Listing'}
        reportType={group?.type?.toLowerCase()}
      />

      <Modal
        visible={modalVisible}
        onClose={() => {
          debugLog("🔴 Modal closed without confirmation");
          setConfirmRequireTerms(false);
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
      />

      {/* Payment Option Modal */}
      <RNModal
        visible={showPaymentOptionModal}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => {
          if (!isProcessingPayment) {
            setShowPaymentOptionModal(false);
            refreshStudioCalendar();
          }
        }}
      >
        <BlurView intensity={60} tint="dark" style={styles.paymentModalOverlay}>
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
                Choose Payment Option
              </Text>
              <Text
                style={[
                  styles.paymentOptionSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                Total Amount: ₱
                {(paymentBookingData?.totalAmount || 0).toLocaleString()}
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
                      Full Payment
                    </Text>
                    <Text
                      style={[
                        styles.paymentOptionAmount,
                        { color: colors.primary },
                      ]}
                    >
                      ₱{(paymentBookingData?.totalAmount || 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.paymentOptionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  Pay the full amount now and complete your booking
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
                      Downpayment (50%)
                    </Text>
                    <Text
                      style={[
                        styles.paymentOptionAmount,
                        { color: colors.primary },
                      ]}
                    >
                      ₱
                      {Math.round(
                        (paymentBookingData?.totalAmount || 0) / 2,
                      ).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.paymentOptionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  Pay half now, remaining ₱
                  {Math.round(
                    (paymentBookingData?.totalAmount || 0) / 2,
                  ).toLocaleString()}{" "}
                  due before session
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
                    Proceed to Payment
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
        </BlurView>
      </RNModal>
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
  dealCard: {
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
    marginBottom: 24,
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


