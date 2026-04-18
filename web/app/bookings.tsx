import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ExpoLinking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    AppState,
    Dimensions,
    Linking,
    Modal as RNModal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    Platform,
} from "react-native";
import { supabase } from "../lib/supabase";
import BookingDetailsSheet from "../src/components/BookingDetailsSheet";
import CachedImage from "../src/components/CachedImage";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { createBookingCheckout } from "../src/services/paymongo";
import {
  formatRecordingHours,
  formatRecordingRuleShort,
  getRecordingRequiredBlocks,
  getRecordingRequiredHours,
  resolveRecordingRule,
} from "../src/utils/recordingRule";

const debugLog = (..._args: unknown[]) => { };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scaleWidth = Math.min(SCREEN_WIDTH, 600); // Clamp width for web
const scale = (size: number) => {
  const newSize = (scaleWidth / 375) * size;
  return Math.max(newSize, size * 0.85); // Minimum 85% of original size
};
const verticalScale = (size: number) => {
  const baseHeight = 812;
  const ratio = SCREEN_HEIGHT / baseHeight;
  const clampedRatio = Math.max(0.8, Math.min(1.1, ratio));
  return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

type Tab =
  | "Applicants"
  | "Active Musicians"
  | "Pending"
  | "Upcoming"
  | "Ongoing"
  | "Review"
  | "History";

// Venue owner specific tabs for managing gig applications
type VenueOwnerTab = "Applicants" | "Active Musicians" | "Completed";

// Application-specific tabs for musician's gig application flow
type ApplicationTab = "Applied" | "Accepted" | "Completed";

// View mode for musicians to switch between bookings and applications
type ViewMode = "bookings" | "applications";

export default function BookingsScreen() {
  const { colors, isDark } = useTheme();
  const { session, loading: authLoading, userId, isGuest } = useAuth();
  const isAuthenticated = !!session;
  const params = useLocalSearchParams<{
    tab?: string;
    retry_payment?: string;
  }>();
  const [activeTab, setActiveTab] = useState<Tab>("Pending");
  const [activeAppTab, setActiveAppTab] = useState<ApplicationTab>("Applied");
  const [viewMode, setViewMode] = useState<ViewMode>("bookings");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const bookingDetailsRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const pageBackground = isWebDesktop
    ? isDark
      ? "#0A1224"
      : "#E9EEF8"
    : colors.background;
  const pageCardBackground = isWebDesktop
    ? isDark
      ? "#0F172A"
      : "#FFFFFF"
    : colors.card;
  const borderSoft = isWebDesktop
    ? isDark
      ? "#1E2C48"
      : "#D8E3F2"
    : colors.border;
  const [modalMode, setModalMode] = useState<
    "confirm" | "cancel" | "decline" | "fire" | "complete" | "renew" | "clear_balance" | "late" | "late_confirm" | "report_access"
  >("confirm");

  // Renew Contract State
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewGigId, setRenewGigId] = useState<string | null>(null);

  // Payment Option State
  const [showPaymentOptionModal, setShowPaymentOptionModal] = useState(false);
  const [paymentItem, setPaymentItem] = useState<any>(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState<
    "full" | "downpayment"
  >("full");

  // QR Check-in State
  const [showScanModal, setShowScanModal] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // State for fetched data
  const [data, setData] = useState<{
    Applicants: any[];
    ActiveMusicians: any[];
    Pending: any[];
    Upcoming: any[];
    Ongoing: any[];
    Review: any[];
    History: any[];
  }>({
    Applicants: [],
    ActiveMusicians: [],
    Pending: [],
    Upcoming: [],
    Ongoing: [],
    Review: [],
    History: [],
  });
  const [pendingPermitStudios, setPendingPermitStudios] = useState<any[]>([]);
  const [permitDeleting, setPermitDeleting] = useState<string | null>(null);

  // Application data separated by status for musicians
  const [applicationData, setApplicationData] = useState<{
    Applied: any[];
    Accepted: any[];
    Completed: any[];
  }>({
    Applied: [],
    Accepted: [],
    Completed: [],
  });
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [locallyReportedLateBookings, setLocallyReportedLateBookings] = useState<Record<string, boolean>>({});
  const [locallyReportedAccessIssueBookings, setLocallyReportedAccessIssueBookings] = useState<Record<string, boolean>>({});
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

  const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
    const lowerTitle = (title || "").toLowerCase();
    let type: AlertType = "info";
    if (
      lowerTitle.includes("error") ||
      lowerTitle.includes("failed") ||
      lowerTitle.includes("invalid") ||
      lowerTitle.includes("required")
    ) {
      type = "error";
    } else if (lowerTitle.includes("success")) {
      type = "success";
    } else if (lowerTitle.includes("warning") || lowerTitle.includes("info")) {
      type = "warning";
    }
    showAlert(type, title || "Notice", message || "", buttons);
  };

  const Alert = { alert: showAlertNative };

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isGuest) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, isGuest]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 30 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setLocallyReportedLateBookings({});
    setLocallyReportedAccessIssueBookings({});
  }, [userId]);

  // Track if user went to payment page (to auto-refresh on return)
  const paymentInProgressRef = useRef(false);
  const pendingPaymentBookingId = useRef<string | null>(null);
  const appState = useRef(AppState.currentState);
  const autoRefreshInFlightRef = useRef(false);
  const venueTabInitializedRef = useRef(false);

  // Handle route params (from payment result screen)
  useEffect(() => {
    if (params.tab) {
      const validTabs: Tab[] = [
        "Applicants",
        "Active Musicians",
        "Pending",
        "Upcoming",
        "Ongoing",
        "Review",
        "History",
      ];
      if (validTabs.includes(params.tab as Tab)) {
        setActiveTab(params.tab as Tab);
      }
    }

    // If coming from payment result with retry_payment, trigger payment for that booking
    if (params.retry_payment && userId) {
      const bookingId = params.retry_payment;
      // Find the booking and trigger payment
      setTimeout(async () => {
        const { data: booking } = await supabase
          .from("studio_bookings")
          .select("*")
          .eq("id", bookingId)
          .single();

        if (booking) {
          handlePayNow(booking);
        }
      }, 500);
    }
  }, [params.tab, params.retry_payment, userId]);

  // Auto-refresh when returning from payment browser
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        // User returned to app from background (payment browser)
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          debugLog("📱 App returned to foreground");

          // If we were in payment flow, check status and refresh
          if (paymentInProgressRef.current && userId) {
            debugLog("💳 Checking payment status after return...");
            const bookingId = pendingPaymentBookingId.current;
            paymentInProgressRef.current = false;
            pendingPaymentBookingId.current = null;

            // Poll for payment status with retries (webhook might be processing)
            let paymentConfirmed = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
              debugLog(`💳 Payment status check attempt ${attempt}/3...`);
              await new Promise((resolve) =>
                setTimeout(resolve, 1500 * attempt),
              ); // Increasing delay

              // Check the specific booking if we have an ID
              if (bookingId) {
                const { data: booking } = await supabase
                  .from("studio_bookings")
                  .select("id, status, payment_status")
                  .eq("id", bookingId)
                  .single();

                if (booking?.payment_status === "paid") {
                  paymentConfirmed = true;
                  debugLog("✅ Payment confirmed for booking:", bookingId);
                  break;
                }
              } else {
                // Check if any recent booking moved to paid
                const { data: recentPaid } = await supabase
                  .from("studio_bookings")
                  .select("id, status, payment_status")
                  .eq("user_id", userId)
                  .eq("payment_status", "paid")
                  .order("paid_at", { ascending: false })
                  .limit(1);

                if (recentPaid && recentPaid.length > 0) {
                  paymentConfirmed = true;
                  debugLog("✅ Found recently paid booking");
                  break;
                }
              }
            }

            // Refresh bookings
            await fetchBookings(userId);

            if (paymentConfirmed) {
              setActiveTab("Upcoming");
            }
          } else if (userId) {
            // Even if not in payment flow, refresh when returning to app
            fetchBookings(userId);
          }
        }
        appState.current = nextAppState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    let isDisposed = false;
    let channel: any = null;
    let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let needsRefreshAfterFlight = false;

    const runRealtimeRefresh = async () => {
      if (isDisposed || !userId) return;

      if (autoRefreshInFlightRef.current) {
        needsRefreshAfterFlight = true;
        return;
      }

      autoRefreshInFlightRef.current = true;
      try {
        await fetchBookings(userId);
      } finally {
        autoRefreshInFlightRef.current = false;

        if (needsRefreshAfterFlight && !isDisposed) {
          needsRefreshAfterFlight = false;
          queueRealtimeRefresh();
        }
      }
    };

    const queueRealtimeRefresh = () => {
      if (isDisposed || !userId) return;
      if (realtimeRefreshTimer) return;

      realtimeRefreshTimer = setTimeout(async () => {
        realtimeRefreshTimer = null;

        if (isDisposed) return;
        await runRealtimeRefresh();
      }, 350);
    };

    const setupRealtime = async () => {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (isDisposed) return;

      const role = profileData?.role || "";

      let liveChannel = supabase
        .channel(`bookings-live-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            queueRealtimeRefresh();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "studio_bookings",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            queueRealtimeRefresh();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "gig_applications",
            filter: `applicant_id=eq.${userId}`,
          },
          () => {
            queueRealtimeRefresh();
          },
        );

      if (role === "studio-owner") {
        liveChannel = liveChannel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "studios",
            filter: `owner_id=eq.${userId}`,
          },
          () => {
            queueRealtimeRefresh();
          },
        );

        const { data: ownerStudios } = await supabase
          .from("studios")
          .select("id")
          .eq("owner_id", userId);

        (ownerStudios || []).forEach((studio: any) => {
          liveChannel = liveChannel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "studio_bookings",
              filter: `studio_id=eq.${studio.id}`,
            },
            () => {
              queueRealtimeRefresh();
            },
          );
        });
      }

      if (role === "venue-owner") {
        liveChannel = liveChannel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "gigs",
            filter: `organizer_id=eq.${userId}`,
          },
          () => {
            queueRealtimeRefresh();
          },
        );

        const { data: ownerGigs } = await supabase
          .from("gigs")
          .select("id")
          .eq("organizer_id", userId);

        (ownerGigs || []).forEach((gig: any) => {
          liveChannel = liveChannel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "gig_applications",
              filter: `gig_id=eq.${gig.id}`,
            },
            () => {
              queueRealtimeRefresh();
            },
          );
        });
      }

      channel = liveChannel.subscribe((status: string) => {
        debugLog("📡 Realtime status:", status);
      });
    };

    setupRealtime();

    return () => {
      isDisposed = true;
      if (realtimeRefreshTimer) {
        clearTimeout(realtimeRefreshTimer);
      }
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isAuthenticated, userId]);

  useEffect(() => {
    if (isAuthenticated && userId) {
      fetchBookings(userId);
    }
  }, [isAuthenticated, userId]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      if (isAuthenticated && userId) {
        fetchBookings(userId);

        // Auto-refresh so bookings move between tabs based on real time/date
        intervalId = setInterval(async () => {
          if (!isActive || autoRefreshInFlightRef.current) return;

          autoRefreshInFlightRef.current = true;
          try {
            await fetchBookings(userId);
          } finally {
            autoRefreshInFlightRef.current = false;
          }
        }, 30 * 1000);
      }

      return () => {
        isActive = false;
        if (intervalId) clearInterval(intervalId);
      };
    }, [isAuthenticated, userId]),
  );

  async function buildLocalStudioBookingsFallback(
    targetUserId: string,
    role: string,
  ) {
    let studioQuery = supabase
      .from("studio_bookings")
      .select("*, studio:studios(name, owner_id, studio_media(media_url, sort_order))")
      .order("booking_date", { ascending: false });

    if (role === "musician") {
      studioQuery = studioQuery.eq("user_id", targetUserId);
    } else if (role === "studio-owner") {
      const { data: ownerStudios, error: studiosError } = await supabase
        .from("studios")
        .select("id")
        .eq("owner_id", targetUserId);

      if (studiosError) throw studiosError;

      const studioIds = (ownerStudios || []).map((studio: any) => studio.id);
      if (studioIds.length === 0) {
        return {
          Pending: [] as any[],
          Upcoming: [] as any[],
          Ongoing: [] as any[],
          Review: [] as any[],
        };
      }

      studioQuery = studioQuery.in("studio_id", studioIds);
    }

    const { data: studioRows, error: studioError } = await studioQuery;

    if (studioError) throw studioError;

    const lateReportByBookingId = new Map<string, {
      count: number;
      latestReason: string | null;
      latestCreatedAt: string | null;
    }>();
    if (role === "studio-owner" || role === "musician") {
      const bookingIds = (studioRows || []).map((row: any) => row.id).filter(Boolean);

      if (bookingIds.length > 0) {
        const { data: lateEvents, error: lateEventsError } = await supabase
          .from("booking_attendance_events")
          .select("booking_id, reporter_user_id, notes, created_at")
          .in("booking_id", bookingIds)
          .eq("event_type", "late");

        if (!lateEventsError) {
          (lateEvents || []).forEach((event: any) => {
            if (role === "musician" && event.reporter_user_id !== targetUserId) {
              return;
            }

            const existing = lateReportByBookingId.get(event.booking_id) || {
              count: 0,
              latestReason: null,
              latestCreatedAt: null,
            };
            const hasNewerTimestamp =
              !existing.latestCreatedAt ||
              (event.created_at && new Date(event.created_at).getTime() > new Date(existing.latestCreatedAt).getTime());

            lateReportByBookingId.set(event.booking_id, {
              count: existing.count + 1,
              latestReason: hasNewerTimestamp
                ? (event.notes || null)
                : existing.latestReason,
              latestCreatedAt: hasNewerTimestamp
                ? (event.created_at || null)
                : existing.latestCreatedAt,
            });
          });
        }
      }
    }

    const now = new Date();
    const fallback = {
      Pending: [] as any[],
      Upcoming: [] as any[],
      Ongoing: [] as any[],
      Review: [] as any[],
    };

    (studioRows || []).forEach((b: any) => {
      const startDate = new Date(`${b.booking_date}T${b.start_time}`);
      const endDate = new Date(`${b.booking_date}T${b.end_time}`);
      const isUnpaid =
        b.status === "pending" &&
        (!b.payment_status ||
          b.payment_status === "unpaid" ||
          b.payment_status === "pending" ||
          b.payment_status === "failed");

      const lateReportMeta = lateReportByBookingId.get(b.id);

      const item = {
        id: b.id,
        type_id: "studio_booking",
        studio_id: b.studio_id,
        user_id: b.user_id,
        raw_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        name: b.studio?.name || "Unknown Studio",
        date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
        image:
          b.studio?.studio_media
            ?.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))[0]
            ?.media_url ||
          "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop",
        status:
          b.status === "pending"
            ? isUnpaid
              ? "Awaiting Payment"
              : "Paid - Waiting for Confirmation"
            : b.status === "pending_relocation"
              ? "Relocation Request"
              : b.status === "confirmed"
                ? "Confirmed"
                : b.status === "checked_in"
                  ? "In Progress"
                  : b.status === "cancelled"
                    ? "Declined"
                    : b.status,
        type: "Studio Booking",
        isCancelled: b.status === "cancelled",
        action:
          b.status === "pending_relocation"
            ? "Respond"
            : b.status === "pending"
              ? "View Details"
              : "Details",
        raw_status: b.status,
        duration_hours: b.hours,
        base_rate: b.base_rate,
        total_cost: b.final_price,
        modifiers_applied: b.modifiers_applied || {},
        studio_type: null,
        session_type: b.session_type || null,
        song_count:
          b.song_count ||
          b.modifiers_applied?.recording_session?.song_count ||
          b.modifiers_applied?.song_count ||
          null,
        notes: b.notes,
        reviewed_by_customer: b.reviewed_by_customer || false,
        reviewed_by_owner: b.reviewed_by_owner || false,
        proof_url: b.proof_url,
        payment_status: b.payment_status || "unpaid",
        payment_amount: b.payment_amount || b.final_price,
        payment_type: b.payment_type || null,
        remaining_balance: b.remaining_balance || 0,
        studio_owner_id: b.studio?.owner_id || null,
        relocation_requested_at: b.relocation_requested_at,
        relocation_expires_at: b.relocation_expires_at,
        relocation_proposed_date: b.relocation_proposed_date,
        relocation_proposed_start_time: b.relocation_proposed_start_time,
        relocation_proposed_end_time: b.relocation_proposed_end_time,
        has_late_report: (lateReportMeta?.count || 0) > 0,
        late_report_count: lateReportMeta?.count || 0,
        latest_late_report_reason: lateReportMeta?.latestReason || null,
        latest_late_report_at: lateReportMeta?.latestCreatedAt || null,
      };

      if (b.status === "pending" || b.status === "pending_relocation") {
        fallback.Pending.push(item);
      } else if (b.status === "confirmed") {
        if (role === "musician" && b.payment_status === "partial" && (b.remaining_balance || 0) > 0) {
          // Downpayment paid but balance still owed — keep in Pending so musician can pay balance
          fallback.Pending.push({ ...item, status: "Downpayment Paid - Balance Due" });
        } else if (now > endDate) {
          fallback.Review.push({ ...item, status: "Completed" });
        } else if (now >= startDate && now <= endDate) {
          fallback.Ongoing.push({ ...item, status: "In Progress" });
        } else {
          fallback.Upcoming.push(item);
        }
      } else if (b.status === "checked_in") {
        if (now > endDate) {
          fallback.Review.push({ ...item, status: "Completed" });
        } else {
          fallback.Ongoing.push({ ...item, status: "In Progress" });
        }
      } else if (b.status === "completed") {
        if (role === "studio-owner") {
          if (!b.reviewed_by_owner) fallback.Review.push({ ...item, status: "Completed" });
        } else {
          if (!b.reviewed_by_customer) fallback.Review.push({ ...item, status: "Completed" });
        }
      } else if (b.status === "cancelled") {
        fallback.Upcoming.push(item);
      }
    });

    return fallback;
  }

  async function fetchBookings(targetUserId: string) {
    try {
      setLoading(true);

      // Fetch user role first
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", targetUserId)
        .single();

      const role = profile?.role || "";
      if (role) {
        setUserRole(role);
        // If venue owner, default to Applicants tab only once (avoid tab reset on auto-refresh)
        if (role === "venue-owner" && !venueTabInitializedRef.current) {
          setActiveTab("Applicants");
          venueTabInitializedRef.current = true;
        } else if (role !== "venue-owner") {
          venueTabInitializedRef.current = false;
        }
      }

      if (role === "studio-owner" || role === "venue-owner") {
        const permitTable = role === "studio-owner" ? "studios" : "gigs";
        const permitOwnerField = role === "studio-owner" ? "owner_id" : "organizer_id";

        const { data: permitRows, error: permitError } = await supabase
          .from(permitTable)
          .select("id, name, permit_status, permit_rejection_reason, permit_resubmissions_used, permit_reviewed_at, created_at")
          .eq(permitOwnerField, targetUserId)
          .in("permit_status", ["pending", "pending_review", "resubmitted", "rejected"])
          .order("created_at", { ascending: false });

        if (permitError) {
          debugLog("Error fetching pending permit listings:", permitError);
          setPendingPermitStudios([]);
        } else {
          setPendingPermitStudios(
            (permitRows || []).map((row: any) => ({
              ...row,
              entity_type: role === "studio-owner" ? "studio" : "gig",
            })),
          );
        }
      } else {
        setPendingPermitStudios([]);
      }

      const { data: bookings, error } = await supabase.functions.invoke(
        "manage-bookings",
        {
          body: { action: "fetch", userId: targetUserId },
        },
      );

      const fallbackBookings =
        error && role !== "venue-owner"
          ? await buildLocalStudioBookingsFallback(targetUserId, role)
          : null;

      const effectiveBookings = fallbackBookings || bookings;

      if (!effectiveBookings) throw error || new Error("Failed to fetch bookings");

      const combinedBookingItems = [
        ...(effectiveBookings?.Pending || []),
        ...(effectiveBookings?.Upcoming || []),
        ...(effectiveBookings?.Ongoing || []),
        ...(effectiveBookings?.Review || []),
      ];

      const studioBookingIds = [...new Set(
        combinedBookingItems
          .filter((item: any) => item?.type_id === "studio_booking")
          .map((item: any) => item?.id)
          .filter(Boolean),
      )];

      const lateReportByBookingId = new Map<string, {
        count: number;
        latestReason: string | null;
        latestCreatedAt: string | null;
      }>();
      if (
        (role === "studio-owner" || role === "venue-owner" || role === "musician") &&
        studioBookingIds.length > 0
      ) {
        const { data: lateEvents, error: lateEventsError } = await supabase
          .from("booking_attendance_events")
          .select("booking_id, reporter_user_id, notes, created_at")
          .in("booking_id", studioBookingIds)
          .eq("event_type", "late");

        if (!lateEventsError) {
          (lateEvents || []).forEach((event: any) => {
            if (role === "musician" && event.reporter_user_id !== targetUserId) {
              return;
            }

            const existing = lateReportByBookingId.get(event.booking_id) || {
              count: 0,
              latestReason: null,
              latestCreatedAt: null,
            };
            const hasNewerTimestamp =
              !existing.latestCreatedAt ||
              (event.created_at && new Date(event.created_at).getTime() > new Date(existing.latestCreatedAt).getTime());

            lateReportByBookingId.set(event.booking_id, {
              count: existing.count + 1,
              latestReason: hasNewerTimestamp
                ? (event.notes || null)
                : existing.latestReason,
              latestCreatedAt: hasNewerTimestamp
                ? (event.created_at || null)
                : existing.latestCreatedAt,
            });
          });
        }
      }

      const attachLateReportMeta = (items: any[] = []) =>
        items.map((item: any) => {
          if (item?.type_id !== "studio_booking") return item;

          const lateReportMeta = lateReportByBookingId.get(item.id);
          const lateReportCount = lateReportMeta?.count || 0;

          return {
            ...item,
            has_late_report: lateReportCount > 0,
            late_report_count: lateReportCount,
            latest_late_report_reason: lateReportMeta?.latestReason || null,
            latest_late_report_at: lateReportMeta?.latestCreatedAt || null,
          };
        });

      // Separate Items Logic

      // 1. Applicants (Pending Gig items)
      const rawPending = attachLateReportMeta(effectiveBookings?.Pending || []);
      const pendingGigApplications = rawPending.filter(
        (item: any) => item.type_id === "gig_application",
      );

      const applicants = role === "venue-owner" ? pendingGigApplications : [];

      const studioPending = rawPending.filter(
        (item: any) => item.type_id !== "gig_application",
      );

      const pendingItems =
        role === "musician"
          ? [...pendingGigApplications, ...studioPending]
          : studioPending;

      pendingItems.sort(
        (a: any, b: any) =>
          new Date(b.created_at || b.raw_date).getTime() -
          new Date(a.created_at || a.raw_date).getTime(),
      );

      const getPendingStudioBookingEndDate = (item: any) => {
        if (item?.type_id !== "studio_booking") return null;
        if (!item?.raw_date) return null;

        const endTime = item?.end_time || item?.relocation_proposed_end_time;
        if (typeof endTime === "string" && endTime.trim().length > 0) {
          const parsedEnd = new Date(`${item.raw_date}T${endTime}`);
          if (!Number.isNaN(parsedEnd.getTime())) return parsedEnd;
        }

        const fallbackEnd = new Date(`${item.raw_date}T23:59:59`);
        return Number.isNaN(fallbackEnd.getTime()) ? null : fallbackEnd;
      };

      const nowMs = Date.now();
      const expiredPendingStudioItems: any[] = [];
      const activePendingItems = pendingItems.filter((item: any) => {
        const endDate = getPendingStudioBookingEndDate(item);
        const isExpired = !!endDate && endDate.getTime() < nowMs;

        if (isExpired) {
          expiredPendingStudioItems.push({
            ...item,
            status: "Expired",
            action: "Details",
          });
          return false;
        }

        return true;
      });

      // 2. Active Musicians (Confirmed Gig items from Upcoming & Ongoing)
      const rawUpcoming = attachLateReportMeta(effectiveBookings?.Upcoming || []);
      const rawOngoing = attachLateReportMeta(effectiveBookings?.Ongoing || []);

      const activeGigMusicians = [
        ...rawUpcoming.filter(
          (item: any) => item.type_id === "gig_application",
        ),
        ...rawOngoing.filter((item: any) => item.type_id === "gig_application"),
      ];

      // 3. Upcoming/Ongoing - Include ALL items (both studio bookings and approved gig applications)
      // Musicians should see their approved gig applications in Upcoming
      // Filter out cancelled/declined bookings from Upcoming - they go to History
      const allUpcoming = rawUpcoming.filter(
        (item: any) => !item.isCancelled && item.status !== "Declined"
      );
      const allOngoing = rawOngoing;

      // 4. History - Cancelled/Declined bookings + already-reviewed completed items (by current viewer)
      const rawReview = attachLateReportMeta(effectiveBookings?.Review || []);
      const cancelledFromUpcoming = rawUpcoming.filter(
        (item: any) => item.isCancelled || item.status === "Declined"
      );
      const alreadyReviewedCompleted = rawReview.filter((item: any) => {
        if (item.type_id === "gig_application") return false;

        if (role === "studio-owner") {
          return item.reviewed_by_owner === true;
        }

        if (role === "musician") {
          return item.reviewed_by_customer === true;
        }

        return false;
      });
      const normalizeStatus = (status?: string | null) =>
        String(status || "").trim().toLowerCase();

      const terminalGigApplications = rawReview.filter((item: any) => {
        if (item.type_id !== "gig_application") return false;
        const status = normalizeStatus(item.status);
        return ["completed", "fired", "declined", "rejected", "cancelled"].includes(status);
      });

      const historyItems = [...cancelledFromUpcoming, ...alreadyReviewedCompleted, ...terminalGigApplications, ...expiredPendingStudioItems]
        .filter(
          (item: any, index: number, arr: any[]) =>
            arr.findIndex((candidate: any) => candidate.id === item.id && candidate.type_id === item.type_id) === index,
        );
      // Sort history by date (most recent first)
      historyItems.sort(
        (a: any, b: any) =>
          new Date(b.raw_date || b.date).getTime() -
          new Date(a.raw_date || a.date).getTime(),
      );

      // 5. Review - role-aware unreviewed items
      const unreviewedItems = rawReview.filter((item: any) => {
        if (role === "venue-owner") {
          // For venue owners, Review tab = Completed tab: fired musicians + completed contracts.
          // Shows gig applications with status "Fired" or "Completed" (never "Accepted").
          return item.type_id === "gig_application" &&
            (item.status === "Fired" || item.status === "Completed");
        }

        if (item.type_id === "gig_application") return false;

        if (role === "studio-owner") {
          return item.reviewed_by_owner !== true;
        }

        // Default/musician flow
        return item.reviewed_by_customer !== true;
      });

      // Sort lists
      applicants.sort(
        (a: any, b: any) =>
          new Date(b.created_at || b.raw_date).getTime() -
          new Date(a.created_at || a.raw_date).getTime(),
      );
      activeGigMusicians.sort(
        (a: any, b: any) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      ); // Closest gig first

      const processedData = {
        Applicants: applicants,
        ActiveMusicians: activeGigMusicians,
        Pending: activePendingItems,
        Upcoming: allUpcoming,
        Ongoing: allOngoing,
        Review: unreviewedItems,
        History: historyItems,
      };

      setData(processedData);

      // For musicians: Separate gig applications by status for the Applications view
      if (role === "musician") {
        // Get all gig applications from all categories
        const allGigApps = [
          ...rawPending.filter((item: any) => item.type_id === "gig_application"),
          ...rawUpcoming.filter((item: any) => item.type_id === "gig_application"),
          ...rawOngoing.filter((item: any) => item.type_id === "gig_application"),
          ...(effectiveBookings?.Review || []).filter((item: any) => item.type_id === "gig_application"),
        ].filter((item: any) => !item.leader_approval_required);

        // Separate by status (use normalizeStatus for case-insensitive matching)
        const appliedApps = allGigApps.filter(
          (app: any) => {
            const status = normalizeStatus(app.status);
            return status === "applied" || status === "pending";
          },
        );
        const acceptedApps = allGigApps.filter(
          (app: any) => {
            const status = normalizeStatus(app.status);
            return status === "accepted" || status === "happening now" || status === "confirmed";
          },
        );
        const completedApps = allGigApps.filter(
          (app: any) => {
            const status = normalizeStatus(app.status);
            return ["completed", "declined", "rejected", "fired", "cancelled"].includes(status);
          },
        );

        // Sort by date (most recent first for applied, closest first for accepted)
        appliedApps.sort(
          (a: any, b: any) =>
            new Date(b.created_at || b.raw_date).getTime() -
            new Date(a.created_at || a.raw_date).getTime(),
        );
        acceptedApps.sort(
          (a: any, b: any) =>
            new Date(a.raw_date || a.date).getTime() -
            new Date(b.raw_date || b.date).getTime(),
        );
        completedApps.sort(
          (a: any, b: any) =>
            new Date(b.raw_date || b.date).getTime() -
            new Date(a.raw_date || a.date).getTime(),
        );

        setApplicationData({
          Applied: appliedApps,
          Accepted: acceptedApps,
          Completed: completedApps,
        });
      }
    } catch (e) {
      debugLog("Error fetching bookings:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(
    bookingId: string,
    newStatus: string,
    typeId: string = "studio_booking",
    reason?: string,
  ): Promise<boolean> {
    try {
      debugLog("📤 handleStatusUpdate called with:", {
        bookingId,
        newStatus,
        typeId,
        reason,
      });

      const attendanceStatuses = ["late", "no_show"];

      let data: any = null;
      let error: any = null;

      if (typeId === "studio_booking" && attendanceStatuses.includes(newStatus)) {
        const rpcResult = await supabase.rpc("record_booking_attendance", {
          p_booking_id: bookingId,
          p_event_type: newStatus,
          p_notes: reason || null,
        });

        data = rpcResult.data;
        error = rpcResult.error;

        if (error) {
          debugLog("⚠️ record_booking_attendance failed, falling back to manage-bookings:", error);

          const invokeFallback = await supabase.functions.invoke("manage-bookings", {
            body: {
              action: "update_status",
              booking_id: bookingId,
              new_status: newStatus,
              type_id: typeId,
              cancellation_reason: reason,
              userId,
            },
          });

          data = invokeFallback.data;
          error = invokeFallback.error;
        }
      } else {
        const invokeResult = await supabase.functions.invoke("manage-bookings", {
          body: {
            action: "update_status",
            booking_id: bookingId,
            new_status: newStatus,
            type_id: typeId,
            cancellation_reason: reason,
            userId,
          },
        });

        data = invokeResult.data;
        error = invokeResult.error;
      }

      debugLog("📥 handleStatusUpdate response:", { data, error });

      if (error) {
        const errorContext = (error as any)?.context;
        let contextBody: any = null;

        try {
          contextBody = errorContext?.json ? await errorContext.json() : null;
        } catch {
          contextBody = null;
        }

        const contextMessage =
          (contextBody && typeof contextBody === "object" && (contextBody.error || contextBody.message)) ||
          null;

        if (contextMessage && typeof contextMessage === "string") {
          throw new Error(contextMessage);
        }

        throw error;
      }

      if (
        typeId === "studio_booking" &&
        attendanceStatuses.includes(newStatus) &&
        data &&
        typeof data === "object" &&
        data.inserted === false
      ) {
        const duplicateMessage =
          newStatus === "late"
            ? "You already sent a late report for this booking."
            : "You already sent this attendance report for this booking.";
        showAlert("info", "Already Reported", duplicateMessage);
        setModalVisible(false);
        return false;
      }

      // Refresh list
      if (userId) fetchBookings(userId);
      setModalVisible(false);
      return true;
    } catch (e) {
      debugLog("Error updating status:", e);
      const errorMessage =
        (e as any)?.message ||
        (typeof e === "string" ? e : "Failed to update booking status.");
      showAlert("error", "Error", errorMessage);
      return false;
    }
  }

  async function handleReportAccessIssue(
    item: any,
    reason: string,
  ): Promise<boolean> {
    if (!item?.id) {
      showAlert("error", "Error", "Booking not found.");
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke("manage-bookings", {
        body: {
          action: "create_incident",
          booking_id: item.id,
          issue_type: "cannot_access_studio",
          notes: reason,
          userId,
        },
      });

      if (error) {
        const errorContext = (error as any)?.context;
        let contextBody: any = null;

        try {
          contextBody = errorContext?.json ? await errorContext.json() : null;
        } catch {
          contextBody = null;
        }

        const contextMessage =
          (contextBody &&
            typeof contextBody === "object" &&
            (contextBody.error || contextBody.message)) ||
          null;

        if (contextMessage && typeof contextMessage === "string") {
          throw new Error(contextMessage);
        }

        throw error;
      }

      if (data?.incident?.booking_id) {
        setLocallyReportedAccessIssueBookings((prev) => ({
          ...prev,
          [data.incident.booking_id]: true,
        }));
      } else {
        setLocallyReportedAccessIssueBookings((prev) => ({
          ...prev,
          [item.id]: true,
        }));
      }

      if (userId) fetchBookings(userId);
      setModalVisible(false);
      setCancellationReason("");

      showAlert(
        "success",
        "Report submitted",
        "Your report was sent. The studio owner has been notified and the booking issue is now under review.",
      );
      return true;
    } catch (e) {
      debugLog("Error reporting access issue:", e);
      const errorMessage =
        (e as any)?.message ||
        (typeof e === "string"
          ? e
          : "We could not submit your report. Please try again.");
      showAlert("error", "Unable to submit report", errorMessage);
      return false;
    }
  }

  const handleDetailsPress = (item: any) => {
    setSelectedItem(item);
    bookingDetailsRef.current?.present();
  };

  const handleRemovePermitListing = (listing: any) => {
    const listingType = listing?.entity_type === "gig" ? "gig" : "studio";
    const listingLabel = listingType === "gig" ? "Gig" : "Studio";
    showAlert(
      "warning",
      `Remove ${listingLabel}`,
      `Are you sure you want to remove "${listing.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setPermitDeleting(listing.id);
            try {
              if (listingType === "studio") {
                let result: any = null;
                let needsRpcFallback = false;
                const { data: { session } } = await supabase.auth.getSession();
                const accessToken = session?.access_token;

                if (accessToken) {
                  try {
                    const { data, error } = await supabase.functions.invoke("delete-studio-with-storage", {
                      body: { studioId: listing.id, reason: "Removed by owner from pending permits" },
                      headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (error) {
                      needsRpcFallback = true;
                    } else {
                      result = data;
                      // Edge function caught an internal error — fall through to RPC
                      if (result?.code === "DELETE_STUDIO_WITH_STORAGE_FAILED") {
                        needsRpcFallback = true;
                        result = null;
                      }
                    }
                  } catch (e) {
                    needsRpcFallback = true;
                  }
                } else {
                  needsRpcFallback = true;
                }

                if (needsRpcFallback) {
                  const { data: rpcData, error: rpcError } = await supabase.rpc("delete_studio_safely", {
                    p_studio_id: listing.id,
                    p_reason: "Removed by owner from pending permits (RPC fallback)",
                  });
                  if (rpcError) throw rpcError;
                  result = rpcData;
                }

                if (!result?.success) {
                  if (result?.code === "ACTIVE_BOOKINGS_EXIST") {
                    showAlert("warning", "Remove Blocked", `This studio still has ${result.active_booking_count || 0} active booking(s). Resolve bookings first.`);
                    return;
                  }
                  throw new Error(result?.message || result?.error || "Remove failed");
                }
              } else {
                const { data, error } = await supabase.rpc("delete_gig_safely", {
                  p_gig_id: listing.id,
                  p_reason: "Removed by owner from pending permits",
                });
                if (error) throw error;
                const result: any = data;
                if (!result?.success) {
                  if (result?.code === "ACTIVE_ACCEPTED_APPLICATIONS_EXIST") {
                    showAlert("warning", "Remove Blocked", `This gig still has ${result.accepted_application_count || 0} accepted application(s). Resolve them first.`);
                    return;
                  }
                  throw new Error(result?.message || "Remove failed");
                }
              }

              setPendingPermitStudios((prev) => prev.filter((p) => p.id !== listing.id));
              showAlert("success", `${listingLabel} Removed`, `"${listing.name}" has been removed successfully.`);
            } catch (e) {
              console.error("Error removing permit listing:", e);
              showAlert("error", "Error", "Failed to remove listing. Please try again.");
            } finally {
              setPermitDeleting(null);
            }
          },
        },
      ],
    );
  };

  const handleConfirmBooking = async (bookingId: string) => {
    // Open modal instead of confirming immediately
    setModalMode("confirm");
    setModalVisible(true);
  };

  const handleCancelBooking = async (bookingId: string) => {
    // If it's an active musician, we treat it as 'fire'
    const isFire =
      activeTab === "Active Musicians" && userRole === "venue-owner";
    setCancellationReason("");
    setModalMode(isFire ? "fire" : "cancel");
    setModalVisible(true);
  };

  const handleDeclineBooking = (item: any) => {
    setSelectedItem(item);
    setCancellationReason("");
    setModalMode("decline");
    setModalVisible(true);
  };

  const isReviewOrCompletedContext =
    activeTab === "Review" ||
    (userRole === "musician" &&
      viewMode === "applications" &&
      activeAppTab === "Completed");

  const shouldShowLateReportDot = (item: any) => {
    if (item?.type_id !== "studio_booking") return false;

    const isOwnerView =
      userRole === "studio-owner" || userRole === "venue-owner";

    if (!isOwnerView) return false;

    return Boolean(item?.has_late_report);
  };

  const hasLateReportAlready = (item: any) => {
    if (item?.type_id !== "studio_booking") return false;

    return Boolean(item?.has_late_report) || Boolean(locallyReportedLateBookings[item?.id]);
  };

  const isWithinLateReportWindow = (item: any) => {
    if (item?.type_id !== "studio_booking") return false;
    if (!item?.raw_date || !item?.start_time) return false;

    const bookingStart = new Date(`${item.raw_date}T${item.start_time}`);
    if (Number.isNaN(bookingStart.getTime())) return false;

    const minutesUntilStart =
      (bookingStart.getTime() - currentTime.getTime()) / (1000 * 60);

    return minutesUntilStart <= 30 && minutesUntilStart >= 0;
  };

  const shouldShowLateReportButton = (item: any) => {
    if (activeTab !== "Upcoming") return false;
    if (item?.type_id !== "studio_booking") return false;
    if (userRole !== "musician") return false;
    if (item?.isCancelled) return false;
    if (hasLateReportAlready(item)) return false;

    return isWithinLateReportWindow(item);
  };

  const hasAccessIssueAlready = (item: any) => {
    if (item?.type_id !== "studio_booking") return false;

    return (
      Boolean(item?.has_open_incident) ||
      Boolean(locallyReportedAccessIssueBookings[item?.id])
    );
  };

  const shouldShowAccessIssueReportButton = (item: any) => {
    if (activeTab !== "Ongoing") return false;
    if (item?.type_id !== "studio_booking") return false;
    if (userRole !== "musician") return false;
    if (item?.isCancelled) return false;
    if (hasAccessIssueAlready(item)) return false;

    return true;
  };

  const shouldShowMessageForItem = (item: any) => {
    if (isReviewOrCompletedContext) return false;

    if (item.type_id === "studio_booking") {
      return userRole === "musician"
        ? !!item.studio_owner_id
        : !!item.user_id;
    }

    if (item.type_id === "gig_application") {
      if (userRole === "venue-owner") {
        return !!(item.applicant_id || item.user_id || item.submitted_by_user_id);
      }

      if (userRole === "musician") {
        if (item.leader_approval_required) {
          return !!(item.submitted_by_user_id || item.applicant_id);
        }

        return !!(item.organizer_id || item.gig_id);
      }
    }

    return false;
  };

  const handleMessagePress = async (item: any) => {
    if (!userId) {
      showAlert("info", "Sign in required", "Please sign in to use chat.");
      return;
    }

    try {
      let recipientId: string | null = null;
      let recipientName: string | null = null;
      let recipientAvatar: string | null = null;

      const chatContext: Record<string, string> = {};

      if (item.type_id === "studio_booking") {
        chatContext.studioBookingId = item.id;
        if (item.studio_id) chatContext.studioId = item.studio_id;

        if (userRole === "musician") {
          recipientId = item.studio_owner_id || null;
          recipientName = item.studio_name || item.name || "Studio Owner";
        } else {
          recipientId = item.user_id || null;
          recipientName = item.customer_name || "Musician";
          recipientAvatar = item.customer_avatar || null;
        }
      } else if (item.type_id === "gig_application") {
        chatContext.gigApplicationId = item.id;
        if (item.gig_id) chatContext.gigId = item.gig_id;
        if (item.group_id) chatContext.groupId = item.group_id;

        if (userRole === "venue-owner") {
          recipientId =
            item.applicant_id || item.user_id || item.submitted_by_user_id || null;
          recipientName = item.customer_name || item.performer || "Musician";
          recipientAvatar = item.customer_avatar || null;
        } else if (userRole === "musician") {
          if (item.leader_approval_required) {
            recipientId = item.submitted_by_user_id || item.applicant_id || null;
            recipientName = item.customer_name || "Group Member";
            recipientAvatar = item.customer_avatar || null;
          } else {
            recipientId = item.organizer_id || null;
            recipientName = item.organizer_name || "Venue Owner";
            recipientAvatar = item.organizer_avatar || null;

            if (!recipientId && item.gig_id) {
              const { data: gigInfo } = await supabase
                .from("gigs")
                .select("organizer_id")
                .eq("id", item.gig_id)
                .maybeSingle();

              recipientId = gigInfo?.organizer_id || null;
            }
          }
        }
      }

      if (!recipientId) {
        showAlert(
          "warning",
          "Unable to open chat",
          "No recipient found for this booking.",
        );
        return;
      }

      if (recipientId === userId) {
        showAlert(
          "warning",
          "Unable to open chat",
          "You cannot message yourself.",
        );
        return;
      }

      if (!recipientName || !recipientAvatar) {
        const { data: recipientProfile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", recipientId)
          .maybeSingle();

        if (!recipientName) {
          recipientName = recipientProfile?.full_name || "User";
        }

        if (!recipientAvatar) {
          recipientAvatar = recipientProfile?.avatar_url || null;
        }
      }

      router.push({
        pathname: "/chat",
        params: {
          recipientId,
          recipientName: recipientName || "User",
          ...(recipientAvatar ? { recipientAvatar } : {}),
          ...chatContext,
        },
      });
    } catch (e) {
      debugLog("Error opening chat from booking:", e);
      showAlert(
        "error",
        "Chat unavailable",
        "Could not open chat right now. Please try again.",
      );
    }
  };

  const handleLeaderApprovalDecision = async (
    item: any,
    decision: "approved" | "rejected",
  ) => {
    try {
      const invokeOptions: Record<string, any> = {
        body: {
          action: "update_leader_approval",
          applicationId: item.id,
          decision,
          userId,
        },
      };

      if (session?.access_token) {
        invokeOptions.headers = {
          Authorization: `Bearer ${session.access_token}`,
        };
      }

      const { data, error } = await supabase.functions.invoke("gig-applications", {
        ...invokeOptions,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (userId) await fetchBookings(userId);
      setModalVisible(false);
      setCancellationReason("");
    } catch (err: any) {
      showAlert(
        "error",
        "Action Failed",
        err?.message || "Failed to process leader confirmation.",
      );
    }
  };

  const formatRelocationDateTime = (
    dateValue?: string | null,
    timeValue?: string | null,
  ) => {
    if (!dateValue || !timeValue) return "TBA";
    const timePart = timeValue.substring(0, 5);
    const parsed = new Date(`${dateValue}T${timePart}`);
    if (isNaN(parsed.getTime())) return `${dateValue} ${timePart}`;
    return `${parsed.toLocaleDateString()} • ${parsed.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })}`;
  };

  const handleRelocationDecision = async (item: any, accepted: boolean) => {
    if (!userId || !item?.id) return;

    try {
      setLoading(true);

      const { data: latestBooking, error: latestError } = await supabase
        .from("studio_bookings")
        .select(
          "id, user_id, studio_id, status, payment_status, relocation_expires_at, relocation_proposed_date, relocation_proposed_start_time, relocation_proposed_end_time",
        )
        .eq("id", item.id)
        .eq("user_id", userId)
        .single();

      if (latestError || !latestBooking) {
        throw latestError || new Error("Booking not found.");
      }

      if (latestBooking.status !== "pending_relocation") {
        showAlert(
          "warning",
          "Already Updated",
          "This relocation request is no longer pending.",
        );
        await fetchBookings(userId);
        return;
      }

      if (
        latestBooking.relocation_expires_at &&
        new Date(latestBooking.relocation_expires_at) <= new Date()
      ) {
        showAlert(
          "warning",
          "Request Expired",
          "This relocation request has expired and will be auto-processed shortly.",
        );
        await fetchBookings(userId);
        return;
      }

      if (accepted) {
        const { error: acceptError } = await supabase
          .from("studio_bookings")
          .update({
            status: "confirmed",
            booking_date: latestBooking.relocation_proposed_date,
            start_time: latestBooking.relocation_proposed_start_time,
            end_time: latestBooking.relocation_proposed_end_time,
            relocation_requested_at: null,
            relocation_expires_at: null,
            relocation_proposed_date: null,
            relocation_proposed_start_time: null,
            relocation_proposed_end_time: null,
            notes:
              (item.notes || "") +
              "\nRelocation accepted by musician and applied.",
          })
          .eq("id", item.id)
          .eq("user_id", userId);

        if (acceptError) throw acceptError;

        if (item.studio_owner_id) {
          await supabase.from("notifications").insert({
            user_id: item.studio_owner_id,
            type: "success",
            title: "Relocation Accepted",
            message: `The musician accepted your relocation request for ${item.name}.`,
            meta: {
              bookingId: item.id,
              studioId: item.studio_id,
              event_type: "relocation_accepted",
            },
          });
        }

        showAlert(
          "success",
          "Relocation Confirmed",
          "You accepted the moved schedule.",
        );
      } else {
        const { error: declineError } = await supabase
          .from("studio_bookings")
          .update({
            status: "cancelled",
            payment_status: latestBooking.payment_status,
            cancellation_reason:
              "Musician declined the owner relocation request.",
            relocation_requested_at: null,
            relocation_expires_at: null,
            relocation_proposed_date: null,
            relocation_proposed_start_time: null,
            relocation_proposed_end_time: null,
          })
          .eq("id", item.id)
          .eq("user_id", userId);

        if (declineError) throw declineError;

        if (item.studio_owner_id) {
          await supabase.from("notifications").insert({
            user_id: item.studio_owner_id,
            type: "warning",
            title: "Relocation Declined",
            message: `The musician declined your relocation request for ${item.name}. Booking was cancelled.`,
            meta: {
              bookingId: item.id,
              studioId: item.studio_id,
              event_type: "relocation_declined",
            },
          });
        }

        showAlert(
          "info",
          "Relocation Declined",
          "You declined the move request. Booking has been cancelled.",
        );
      }

      await fetchBookings(userId);
    } catch (error: any) {
      showAlert(
        "error",
        "Action Failed",
        error?.message || "Could not process relocation response.",
      );
    } finally {
      setLoading(false);
    }
  };



  // Leave Review handler with proper params
  const handleLeaveReview = (item: any) => {
    // Determine reviewer role based on user role and item type
    const isOwner =
      item.type_id === "studio_booking" && userRole === "studio-owner";
    const isOrganizer =
      item.type_id === "gig_application" && userRole === "venue-owner";

    const reviewerRole =
      item.type_id === "studio_booking"
        ? isOwner
          ? "owner"
          : "customer"
        : isOrganizer
          ? "organizer"
          : "applicant";

    // For studio owners reviewing musicians, target the user
    // For musicians reviewing studios, target the studio
    const params: any = {
      bookingId: item.id,
      bookingType: item.type_id,
      entityName: item.name,
      reviewerRole,
    };

    if (item.type_id === "studio_booking") {
      if (isOwner) {
        // Owner reviews the musician (user)
        params.targetUserId = item.user_id;
      } else {
        // Musician reviews the studio
        params.studioId = item.studio_id;
      }
    } else if (item.type_id === "gig_application") {
      if (isOrganizer) {
        // Venue owner reviews the applicant
        params.targetUserId = item.applicant_id;
      } else {
        // Musician reviews the gig
        params.gigId = item.gig_id;
      }
    }

    router.push({
      pathname: "/submit_review",
      params,
    } as any);
  };

  // Renew Contract Logic
  const handleRenewContract = async (item: any) => {
    setSelectedItem(item);
    setModalMode("renew");
    setModalVisible(true);
  };

  const processRenewContract = async () => {
    if (!selectedItem || !userId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke(
        "manage-bookings",
        {
          body: {
            action: "renew_contract",
            application_id: selectedItem.id,
            gig_id: selectedItem.gig_id,
            applicant_id: selectedItem.applicant_id || selectedItem.user_id,
            organizer_id: userId,
          },
        },
      );

      if (error) throw error;

      Alert.alert(
        "Success",
        "Contract renewal sent! The musician will be notified.",
      );
      setModalVisible(false);
      fetchBookings(userId);
    } catch (e: any) {
      console.error("Renew contract error:", e);
      Alert.alert(
        "Error",
        e?.message || "Failed to renew contract. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Show payment option modal before paying
  const showPaymentOptions = (item: any) => {
    setPaymentItem(item);

    // Check if user already paid a downpayment - if so, they should only pay remaining balance
    const hasDownpaymentPaid = item.payment_type === "downpayment" && item.remaining_balance > 0;

    if (hasDownpaymentPaid) {
      // Skip modal and directly pay balance
      handlePayBalance(item);
      return;
    }

    setSelectedPaymentType("full"); // Reset to full payment as default
    setShowPaymentOptionModal(true);
  };

  // PayMongo Payment Handler
  const handlePayNow = async (
    item: any,
    paymentType: "full" | "downpayment" = "full",
  ) => {
    if (!item || !userId) return;

    try {
      setLoading(true);
      const totalAmount = item.payment_amount || item.total_cost;
      const payAmount =
        paymentType === "downpayment"
          ? Math.round(totalAmount / 2)
          : totalAmount;
      const remainingBalance =
        paymentType === "downpayment" ? Math.round(totalAmount / 2) : 0;

      debugLog(
        "💳 Initiating payment for booking:",
        item.id,
        "Type:",
        paymentType,
        "Amount:",
        payAmount,
      );

      // Generate environment-aware redirect URL
      const redirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "success", booking_id: item.id },
      });
      const cancelRedirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "cancelled", booking_id: item.id },
      });

      // Use local PayMongo service instead of edge function
      const result = await createBookingCheckout({
        bookingId: item.id,
        userId,
        amount: payAmount,
        totalAmount,
        paymentType,
        remainingBalance,
        studioName: item.name,
        bookingDate: item.raw_date,
        description:
          paymentType === "downpayment"
            ? `Downpayment (50%) for studio booking at ${item.name}`
            : `Studio booking at ${item.name}`,
        redirectUrl,
        cancelRedirectUrl,
      });

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to create payment session.");
        return;
      }

      if (result.checkout_url) {
        debugLog("✅ Opening checkout URL:", result.checkout_url);
        const canOpen = await Linking.canOpenURL(result.checkout_url);
        if (canOpen) {
          paymentInProgressRef.current = true;
          pendingPaymentBookingId.current = item.id;
          await Linking.openURL(result.checkout_url);
        } else {
          Alert.alert(
            "Error",
            "Unable to open payment page. Please try again.",
          );
        }
      } else {
        Alert.alert("Error", "Failed to get payment URL. Please try again.");
      }
    } catch (e: any) {
      console.error("Pay now error:", e);
      Alert.alert(
        "Error",
        e?.message || "Failed to initiate payment. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Pay Remaining Balance Handler
  const handlePayBalance = async (item: any) => {
    if (!item || !userId || !item.remaining_balance) return;

    try {
      setLoading(true);
      debugLog(
        "💳 Paying remaining balance for booking:",
        item.id,
        "Amount:",
        item.remaining_balance,
      );

      // Generate environment-aware redirect URL
      const redirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "success", booking_id: item.id },
      });
      const cancelRedirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "cancelled", booking_id: item.id },
      });

      // Use local PayMongo service instead of edge function
      const result = await createBookingCheckout({
        bookingId: item.id,
        userId,
        amount: item.remaining_balance,
        totalAmount: item.total_cost,
        paymentType: "balance",
        remainingBalance: 0,
        studioName: item.name,
        bookingDate: item.raw_date,
        description: `Remaining balance payment for studio booking at ${item.name}`,
        redirectUrl,
        cancelRedirectUrl,
      });

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to create payment session.");
        return;
      }

      if (result.checkout_url) {
        debugLog("✅ Opening checkout URL:", result.checkout_url);
        const canOpen = await Linking.canOpenURL(result.checkout_url);
        if (canOpen) {
          paymentInProgressRef.current = true;
          pendingPaymentBookingId.current = item.id;
          await Linking.openURL(result.checkout_url);
        } else {
          Alert.alert(
            "Error",
            "Unable to open payment page. Please try again.",
          );
        }
      } else {
        Alert.alert("Error", "Failed to get payment URL. Please try again.");
      }
    } catch (e: any) {
      console.error("Pay balance error:", e);
      Alert.alert(
        "Error",
        e?.message || "Failed to initiate payment. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Clear Remaining Balance Handler (F2F Payment)
  const handleClearBalance = (item: any) => {
    setSelectedItem(item);
    setModalMode("clear_balance");
    setModalVisible(true);
  };

  // Process Clear Balance (called from modal confirm) - Direct DB queries
  const processClearBalance = async () => {
    if (!selectedItem || !userId) return;

    try {
      setLoading(true);
      const bookingId = selectedItem.id;
      const balanceAmount = selectedItem.remaining_balance;

      debugLog(
        "💵 Clearing remaining balance for booking:",
        bookingId,
        "Amount:",
        balanceAmount,
      );

      // 1. Get the booking and verify ownership
      const { data: booking, error: bookingError } = await supabase
        .from("studio_bookings")
        .select("*, studio:studios(id, owner_id, name)")
        .eq("id", bookingId)
        .single();

      if (bookingError || !booking) {
        throw new Error("Booking not found");
      }

      // 2. Verify the owner owns this studio
      if (booking.studio?.owner_id !== userId) {
        throw new Error("You are not authorized to modify this booking");
      }

      // 3. Verify there's a remaining balance
      if (!booking.remaining_balance || booking.remaining_balance <= 0) {
        throw new Error("No remaining balance to clear");
      }

      // 4. Update the booking to clear the balance
      const { error: updateError } = await supabase
        .from("studio_bookings")
        .update({
          remaining_balance: 0,
          payment_status: "paid",
          payment_amount: booking.final_price,
        })
        .eq("id", bookingId);

      if (updateError) {
        console.error("Error updating booking:", updateError);
        throw new Error("Failed to update booking");
      }

      // 5. Credit the owner's wallet
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", userId)
        .single();

      if (!walletError && wallet) {
        // Update wallet balance
        await supabase
          .from("wallets")
          .update({ balance: (wallet.balance || 0) + balanceAmount })
          .eq("id", wallet.id);

        // Create transaction record
        await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          amount: balanceAmount,
          type: "credit",
          description: `F2F payment collected - ${booking.studio?.name || "Studio"}`,
          reference_id: bookingId,
          is_credit: true,
          status: "completed",
        });
      }

      // 6. Notify the customer
      await supabase.from("notifications").insert({
        user_id: booking.user_id,
        type: "success",
        title: "Balance Cleared! ✅",
        message: `Your remaining balance of ₱${balanceAmount.toLocaleString()} for ${booking.studio?.name || "your booking"} has been marked as paid.`,
        read: false,
        meta: {
          type: "balance_cleared",
          booking_id: bookingId,
          amount: balanceAmount,
        },
      });

      debugLog(`💵 Balance cleared: ₱${balanceAmount} for booking ${bookingId}`);

      Alert.alert(
        "Balance Cleared",
        `₱${balanceAmount?.toLocaleString()} has been marked as paid and credited to your wallet.`,
      );
      setModalVisible(false);
      if (userId) fetchBookings(userId);
    } catch (e: any) {
      console.error("Clear balance error:", e);
      Alert.alert(
        "Error",
        e?.message || "Failed to clear balance. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Check payment status (for returning from payment)
  const checkPaymentStatus = async (bookingId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("paymongo", {
        body: {
          action: "check_payment",
          booking_id: bookingId,
        },
      });

      if (data?.payment_status === "paid") {
        Alert.alert(
          "Success",
          "Payment confirmed! Your booking is now in Upcoming.",
        );
        if (userId) fetchBookings(userId);
      }
    } catch (e) {
      console.error("Check payment error:", e);
    }
  };

  const handleScanOpen = async () => {
    if (!permission) {
      // Permission status not yet loaded
      return;
    }
    if (!permission.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Camera access is required to scan entry passes.",
        );
        return;
      }
    }
    setScanned(false);
    setShowScanModal(true);
  };

  const handleBarCodeScanned = async ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    setScanned(true);
    setShowScanModal(false);

    // Call backend to verify check-in
    try {
      setLoading(true);
      debugLog("📷 Scanning QR code:", {
        qr_code: data,
        scanner_id: userId,
      });

      const { data: response, error } = await supabase.rpc(
        "record_booking_attendance",
        {
          p_booking_id: data,
          p_event_type: "checked_in",
          p_notes: null,
        },
      );

      setLoading(false);

      debugLog("📷 Check-in response:", response);
      debugLog("📷 Check-in error:", error);

      if (error) {
        console.error("Check-in error:", error);
        Alert.alert(
          "Check-In Failed",
          error.message || "Could not verify booking. Please try again.",
        );
        return;
      }

      if (response?.success) {
        Alert.alert("Success", "Check-in confirmed! Booking is now LIVE.");
        if (userId) fetchBookings(userId);
      } else {
        Alert.alert("Success", "Check-in processed.");
        if (userId) fetchBookings(userId);
      }
    } catch (e: any) {
      setLoading(false);
      console.error("Scan error:", e);
      Alert.alert("Error", e?.message || "An error occurred during check-in.");
    }
  };

  // Determine items to show based on view mode
  const currentItems = userRole === "musician" && viewMode === "applications"
    ? applicationData[activeAppTab as keyof typeof applicationData] || []
    : activeTab === "Active Musicians"
      ? data.ActiveMusicians
      : data[activeTab as keyof typeof data] || [];

  // Render application tab for musicians
  const renderAppTab = (tab: ApplicationTab) => {
    const count = applicationData[tab]?.length || 0;
    const isActive = activeAppTab === tab;

    return (
      <TouchableOpacity activeOpacity={1}
        key={tab}
        onPress={() => setActiveAppTab(tab)}
        style={[
          styles.tabButton,
          {
            backgroundColor: isActive ? colors.primary : "transparent",
            borderColor: isActive ? colors.primary : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.tabText,
            {
              color: isActive ? "#FFF" : colors.textSecondary,
            },
          ]}
        >
          {tab}
        </Text>

        {/* Badge count */}
        {count > 0 && (
          <View
            style={{
              marginLeft: 6,
              backgroundColor: isActive ? "white" : colors.primary,
              borderRadius: 10,
              paddingHorizontal: 6,
              paddingVertical: 1,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Poppins_600SemiBold",
                color: isActive ? colors.primary : "white",
              }}
            >
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render venue owner specific tab for managing gig applications
  const renderVenueOwnerTab = (tab: VenueOwnerTab) => {
    // Map tab to actual data key
    const getTabData = (): any[] => {
      switch (tab) {
        case "Applicants":
          return data.Applicants;
        case "Active Musicians":
          return data.ActiveMusicians;
        case "Completed":
          return data.Review.filter((item: any) => item.type_id === "gig_application");
        default:
          return [];
      }
    };

    const tabData = getTabData();
    const count = tabData.length;
    const isActive = activeTab === (tab === "Completed" ? "Review" : tab);

    return (
      <TouchableOpacity activeOpacity={1}
        key={tab}
        onPress={() => setActiveTab(tab === "Completed" ? "Review" : tab as Tab)}
        style={[
          styles.tabButton,
          {
            backgroundColor: isActive ? colors.primary : "transparent",
            borderColor: isActive ? colors.primary : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.tabText,
            {
              color: isActive ? "#FFF" : colors.textSecondary,
            },
          ]}
        >
          {tab}
        </Text>

        {/* Badge count if > 0 */}
        {count > 0 && (
          <View
            style={{
              marginLeft: 6,
              backgroundColor: isActive ? "white" : colors.primary,
              borderRadius: 10,
              paddingHorizontal: 6,
              paddingVertical: 1,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Poppins_600SemiBold",
                color: isActive ? colors.primary : "white",
              }}
            >
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderTab = (tab: Tab) => {
    // Hide Applicants tab if not venue owner AND empty
    if (
      tab === "Applicants" &&
      userRole !== "venue-owner" &&
      data.Applicants.length === 0
    ) {
      return null;
    }

    return (
      <TouchableOpacity activeOpacity={1}
        key={tab}
        onPress={() => setActiveTab(tab)}
        style={[
          styles.tabButton,
          {
            backgroundColor: activeTab === tab ? colors.primary : "transparent",
            borderColor: activeTab === tab ? colors.primary : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.tabText,
            {
              color: activeTab === tab ? "#FFF" : colors.textSecondary,
            },
          ]}
        >
          {tab === "Applicants"
            ? userRole === "venue-owner"
              ? "Applicants"
              : "Applications"
            : tab}
        </Text>

        {/* Badge count for Applicants if > 0 */}
        {tab === "Applicants" && data.Applicants.length > 0 && (
          <View
            style={{
              marginLeft: 6,
              backgroundColor: activeTab === tab ? "white" : colors.primary,
              borderRadius: 10,
              paddingHorizontal: 6,
              paddingVertical: 1,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Poppins_600SemiBold",
                color: activeTab === tab ? colors.primary : "white",
              }}
            >
              {data.Applicants.length}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (isGuest) {
    return (
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}> 
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        <Header title="My Activity" />
        <GuestSignInGate message="Sign in to view your bookings and activity." />
        <Navbar />
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}> 
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        <Header title={userRole === "venue-owner" ? "Manage Applications" : "My Activity"} />

        {/* Tab Navigation */}
        <View
          style={[
            styles.tabContainer,
            width >= 768 && { width: '100%' },
            isWebDesktop && [
              styles.webSectionCard,
              { backgroundColor: pageCardBackground, borderColor: borderSoft },
            ],
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {userRole === "venue-owner" ? (
              // Venue owner specific tabs for managing gig applications
              (["Applicants", "Active Musicians", "Completed"] as VenueOwnerTab[]).map(
                (tab) => renderVenueOwnerTab(tab),
              )
            ) : (
              // Default tabs for other users (musicians, studio-owners)
              ["Pending", "Upcoming", "Ongoing", "Review", "History"].map(
                (tab) => renderTab(tab as Tab),
              )
            )}
          </ScrollView>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            width >= 768 && { width: '100%' },
            isWebDesktop && styles.scrollContentWeb,
          ]}
        >
          {!loading &&
            ((userRole === "studio-owner" && activeTab === "Pending") ||
              (userRole === "venue-owner" && activeTab === "Applicants")) &&
            pendingPermitStudios.length > 0 && (
              <View style={{ paddingHorizontal: scale(16), marginBottom: moderateScale(12), gap: moderateScale(8) }}>
                {pendingPermitStudios.map((listing: any) => {
                  const normalizedStatus = String(listing?.permit_status || "pending_review").toLowerCase();
                  const isRejected = normalizedStatus === "rejected";
                  const permitResubmissionsUsed = Number(listing?.permit_resubmissions_used || 0);
                  const hasReapplyRemaining = permitResubmissionsUsed < 1;
                  const statusLabel = isRejected
                    ? "Rejected - Action Needed"
                    : normalizedStatus === "resubmitted"
                      ? "Resubmitted - Awaiting Admin Review"
                      : "Pending Admin Review";
                  const statusColor = isRejected ? "#EF4444" : "#F59E0B";
                  const chipLabel = isRejected
                    ? "Rejected"
                    : normalizedStatus === "resubmitted"
                      ? "Resubmitted"
                      : "Pending";
                  const statusChipBackground = isRejected
                    ? isDark
                      ? "rgba(239,68,68,0.2)"
                      : "#FEE2E2"
                    : isDark
                      ? "rgba(245,158,11,0.2)"
                      : "#FEF3C7";
                  const noticeBackground = isRejected
                    ? isDark
                      ? "rgba(239,68,68,0.08)"
                      : "#FEF2F2"
                    : isDark
                      ? "rgba(245,158,11,0.08)"
                      : "#FFFBEB";
                  const listingType = listing?.entity_type === "gig" ? "gig" : "studio";
                  const listingName = listing?.name || (listingType === "gig" ? "Gig" : "Studio");
                  const rejectionReason = String(listing?.permit_rejection_reason || "").trim();

                  return (
                    <View
                      key={`permit-${listingType}-${listing.id}`}
                      style={[
                        styles.cardContainer,
                        isWebDesktop && styles.cardContainerWeb,
                        {
                          backgroundColor: pageCardBackground,
                          borderColor: borderSoft,
                          borderWidth: 1,
                          borderWidth: 1,
                          marginBottom: 0,
                        },
                      ]}
                    >
                      <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardTitleContainer}>
                            <Text
                              style={[styles.cardTitle, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {listingName}
                            </Text>
                            <View style={styles.cardDetailRow}>
                              <Ionicons
                                name={listingType === "gig" ? "musical-notes-outline" : "business-outline"}
                                size={moderateScale(14)}
                                color={colors.textSecondary}
                              />
                              <Text style={[styles.cardDetailText, { color: colors.textSecondary }]}> 
                                {listingType === "gig" ? "Venue Listing Permit" : "Studio Listing Permit"}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.permitStatusChip,
                              { backgroundColor: statusChipBackground, borderColor: statusColor },
                            ]}
                          >
                            <Text style={[styles.permitStatusChipText, { color: statusColor }]}> 
                              {chipLabel}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.permitNoticeBox,
                            { backgroundColor: noticeBackground, borderColor: statusColor },
                          ]}
                        >
                          <Text style={[styles.permitNoticeTitle, { color: statusColor }]}> 
                            {statusLabel}
                          </Text>
                          {isRejected && rejectionReason.length > 0 && (
                            <Text style={styles.permitNoticeReason}>
                              Reason: {rejectionReason}
                            </Text>
                          )}
                          <Text style={[styles.permitNoticeText, { color: colors.textSecondary }]}> 
                            {isRejected
                              ? hasReapplyRemaining
                                ? `This ${listingType} remains hidden from Home. You have one reapply attempt left after this decline.`
                                : `This ${listingType} remains hidden from Home. Your one allowed reapply attempt has already been used.`
                              : `This ${listingType} remains hidden from Home until permit approval is completed in Admin > Permits.`}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.cardFooter,
                            { 
                              borderColor: borderSoft, 
                              marginTop: moderateScale(12),
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: moderateScale(12)
                            },
                          ]}
                        >
                          <View style={styles.statusContainer}>
                            <Ionicons
                              name={isRejected ? "alert-circle-outline" : "time-outline"}
                              size={moderateScale(14)}
                              color={statusColor}
                            />
                            <Text style={[styles.statusText, { color: statusColor, flex: 1 }]} numberOfLines={2}> 
                              {isRejected
                                ? hasReapplyRemaining
                                  ? "One reapply attempt available"
                                  : "Reapply attempt already used"
                                : "Awaiting admin permit review"}
                            </Text>
                          </View>

                          <View style={{ flexDirection: "row", width: "100%", justifyContent: "flex-end", alignItems: "center", gap: scale(8) }}>
                            {isRejected && hasReapplyRemaining && (
                              <TouchableOpacity
                                activeOpacity={1}
                                onPress={() =>
                                  router.push({
                                    pathname: listingType === "gig" ? "/edit_gig" : "/edit_studio",
                                    params: { id: listing.id, reapply: "1" },
                                  } as any)
                                }
                                style={[
                                  styles.outlineButton,
                                  {
                                    borderColor: "#F97316",
                                    backgroundColor: isDark
                                      ? "rgba(249,115,22,0.12)"
                                      : "#FFF7ED",
                                    paddingHorizontal: scale(12),
                                    paddingVertical: moderateScale(7),
                                  },
                                ]}
                              >
                                <View style={styles.detailsButtonLabelContainer}>
                                  <Ionicons
                                    name="refresh-outline"
                                    size={moderateScale(14)}
                                    color="#EA580C"
                                  />
                                  <Text
                                    style={[
                                      styles.outlineButtonText,
                                      {
                                        color: "#EA580C",
                                        fontFamily: "Poppins_600SemiBold",
                                      },
                                    ]}
                                  >
                                    Edit & Reapply
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              activeOpacity={1}
                              disabled={permitDeleting === listing.id}
                              onPress={() => handleRemovePermitListing(listing)}
                              style={[
                                styles.outlineButton,
                                {
                                  borderColor: "#EF4444",
                                  backgroundColor: isDark
                                    ? "rgba(239,68,68,0.12)"
                                    : "#FEF2F2",
                                  paddingHorizontal: scale(12),
                                  paddingVertical: moderateScale(7),
                                  opacity: permitDeleting === listing.id ? 0.5 : 1,
                                },
                              ]}
                            >
                              <View style={styles.detailsButtonLabelContainer}>
                                <Ionicons
                                  name="trash-outline"
                                  size={moderateScale(14)}
                                  color="#DC2626"
                                />
                                <Text
                                  style={[
                                    styles.outlineButtonText,
                                    {
                                      color: "#DC2626",
                                      fontFamily: "Poppins_600SemiBold",
                                    },
                                  ]}
                                >
                                  {permitDeleting === listing.id ? "Removing..." : "Remove"}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

          {loading ? (
            <View style={styles.centerContainer}>
              <Text
                style={[styles.loadingText, { color: colors.textSecondary }]}
              >
                Loading bookings...
              </Text>
            </View>
          ) : currentItems.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons
                name={userRole === "venue-owner" ? "people-outline" : "calendar-outline"}
                size={48}
                color={colors.border}
              />
              <Text
                style={[styles.emptyTitle, { color: colors.textSecondary }]}
              >
                {userRole === "venue-owner"
                  ? activeTab === "Applicants"
                    ? "No pending applications"
                    : activeTab === "Active Musicians"
                      ? "No active musicians"
                      : activeTab === "Review"
                        ? "No completed gigs"
                        : "No items"
                    : userRole === "studio-owner" && activeTab === "Pending" && pendingPermitStudios.length > 0
                      ? "No pending booking requests below"
                      : `No ${activeTab.toLowerCase()} bookings`}
              </Text>
                {userRole === "studio-owner" && activeTab === "Pending" && pendingPermitStudios.length > 0 && (
                  <Text
                    style={[styles.emptySubtitle, { color: colors.textSecondary, marginTop: 8, textAlign: "center", paddingHorizontal: 24 }]}
                  >
                    Permit review items are listed above. New booking requests will appear here.
                  </Text>
                )}
              {userRole === "venue-owner" && activeTab === "Applicants" && (
                <Text
                  style={[styles.emptySubtitle, { color: colors.textSecondary, marginTop: 8, textAlign: "center", paddingHorizontal: 24 }]}
                >
                  When musicians apply to your gigs, they'll appear here
                </Text>
              )}
            </View>
          ) : (
            <View style={[styles.gridWrap, isWebDesktop && styles.gridWrapWeb]}>
              {currentItems.map((item: any) => {
                // ==========================================
              // 1. GIG APPLICATION CARD (Recruitment View)
              // ==========================================
              if (item.type_id === "gig_application") {
                // Determine if this is the musician's own application view
                const isMusicianView = userRole === "musician";
                const isLeaderConfirmation = !!item.leader_approval_required;
                const gigName = item.name ? item.name.split(" - ")[0] : "Gig";

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.cardContainer,
                      isWebDesktop && styles.cardContainerWeb,
                      isWebDesktop && styles.gridItemWeb,
                      {
                        backgroundColor: pageCardBackground,
                        borderColor: borderSoft,
                          borderWidth: 1,
                      },
                    ]}
                  >
                    {/* Banner Image */}
                    <View>
                      <CachedImage
                        uri={
                          item.image ||
                          "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400&h=200&fit=crop"
                        }
                        style={[
                          styles.cardImage,
                          { opacity: item.isCancelled ? 0.6 : 1 },
                        ]}
                        width={800}
                        height={400}
                        quality={72}
                        cacheVersion={item.updated_at || item.created_at || item.id}
                      />
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>
                          {item.type || "Application"}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.typeBadge,
                          {
                            left: undefined,
                            right: scale(12),
                            backgroundColor:
                              item.status === "Accepted" ||
                                item.status === "Happening Now" ||
                                item.status === "Confirmed"
                                ? "rgba(16, 185, 129, 0.85)"
                                : item.status === "Declined"
                                  ? "rgba(239, 68, 68, 0.85)"
                                  : "rgba(0,0,0,0.6)",
                          },
                        ]}
                      >
                        <Text style={styles.typeBadgeText}>{item.status}</Text>
                      </View>
                      {item.status === "Happening Now" && (
                        <View style={styles.liveBadge}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveText}>Live</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.cardContent}>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardTitleContainer}>
                          <TouchableOpacity activeOpacity={1}
                            onPress={() => handleDetailsPress(item)}
                          >
                            <Text
                              style={[styles.cardTitle, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {isMusicianView
                                ? gigName
                                : item.customer_name || "Applicant"}
                            </Text>
                          </TouchableOpacity>

                          <View style={{ marginTop: 8, gap: 4 }}>
                            {/* Role / Context */}
                            <View style={styles.cardDetailRow}>
                              <Ionicons
                                name={isMusicianView ? "person-outline" : item.group_id ? "people-outline" : "mic-outline"}
                                size={14}
                                color={colors.primary}
                              />
                              <Text style={[styles.cardDetailText, { color: colors.textSecondary }]}>
                                {isMusicianView
                                  ? isLeaderConfirmation
                                    ? `Member submission by ${item.customer_name || "Group Member"}`
                                    : item.performer
                                      ? `Applied as ${item.performer}`
                                      : "Applied as Solo Artist"
                                  : item.group_id
                                    ? `Applied for ${gigName}`
                                    : `Applied for ${gigName}`}
                              </Text>
                            </View>

                            {/* Location */}
                            {item.location && (
                              <View style={styles.cardDetailRow}>
                                <Ionicons
                                  name="location-outline"
                                  size={14}
                                  color={colors.textSecondary}
                                />
                                <Text
                                  style={[styles.cardDetailText, { color: colors.textSecondary }]}
                                  numberOfLines={1}
                                >
                                  {item.location}
                                </Text>
                              </View>
                            )}

                            {/* Date */}
                            {item.date && item.date !== "TBA" && (
                              <View style={styles.cardDetailRow}>
                                <Ionicons
                                  name="calendar-outline"
                                  size={14}
                                  color={colors.textSecondary}
                                />
                                <Text
                                  style={[styles.cardDetailText, { color: colors.textSecondary }]}
                                  numberOfLines={1}
                                >
                                  {item.date}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Content: Pitch & Audition (for venue owners) */}
                      {!isMusicianView && (
                        <View style={{ marginBottom: 16 }}>
                          {item.note && (
                            <View
                              style={{
                                backgroundColor: isDark
                                  ? "rgba(255,255,255,0.05)"
                                  : "#F9FAFB",
                                padding: 10,
                                borderRadius: 8,
                                marginBottom: 8,
                                borderLeftWidth: 3,
                                borderLeftColor: colors.primary,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: "Poppins_400Regular",
                                  fontSize: 13,
                                  color: colors.text,
                                  fontStyle: "italic",
                                }}
                                numberOfLines={3}
                              >
                                "{item.note}"
                              </Text>
                            </View>
                          )}

                          <View
                            style={{
                              flexDirection: "row",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {/* Video Link */}
                            {item.video_url && (
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => Linking.openURL(item.video_url)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  backgroundColor: isDark
                                    ? "rgba(59, 130, 246, 0.2)"
                                    : "#EFF6FF",
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                  borderRadius: 6,
                                }}
                              >
                                <Ionicons
                                  name="play-circle"
                                  size={16}
                                  color="#3B82F6"
                                  style={{ marginRight: 4 }}
                                />
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: "#3B82F6",
                                    fontFamily: "Poppins_500Medium",
                                  }}
                                >
                                  Watch Audition
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* CV Link */}
                            {item.cv_url && (
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => Linking.openURL(item.cv_url)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  backgroundColor: isDark
                                    ? "rgba(139, 92, 246, 0.2)"
                                    : "#F3E8FF",
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                  borderRadius: 6,
                                }}
                              >
                                <Ionicons
                                  name="document-text"
                                  size={16}
                                  color="#8B5CF6"
                                  style={{ marginRight: 4 }}
                                />
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: "#8B5CF6",
                                    fontFamily: "Poppins_500Medium",
                                  }}
                                >
                                  View CV/Resume
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      )}

                      {/* Footer: Actions */}
                      <View
                        style={[
                          styles.cardFooter,
                          {
                            borderColor: isDark ? colors.border : "#F3F4F6",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: moderateScale(12),
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: "100%",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: moderateScale(8),
                          }}
                        >
                          <View style={styles.statusContainer}>
                            {item.status === "Happening Now" || item.status === "Accepted" || item.status === "Confirmed" || item.status === "Completed" ? (
                              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                            ) : item.status === "Declined" || item.status === "Fired" ? (
                              <Ionicons name="close-circle" size={16} color="#EF4444" />
                            ) : (
                              <Ionicons name="time-outline" size={16} color="#F59E0B" />
                            )}
                            <Text
                              style={[
                                styles.statusText,
                                {
                                  color:
                                    item.status === "Happening Now" ||
                                      item.status === "Accepted" ||
                                      item.status === "Confirmed" ||
                                      item.status === "Completed"
                                      ? "#10B981"
                                      : item.status === "Declined" || item.status === "Fired"
                                        ? "#EF4444"
                                        : "#F59E0B",
                                },
                              ]}
                            >
                              {item.status}
                            </Text>
                          </View>

                          {shouldShowMessageForItem(item) && (
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={() => handleMessagePress(item)}
                              style={[
                                styles.messageIconButton,
                                {
                                  borderColor: colors.border,
                                  backgroundColor: colors.card,
                                },
                              ]}
                            >
                              <Ionicons
                                name="chatbubble-ellipses-outline"
                                size={16}
                                color={colors.primary}
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                        <View
                          style={[
                            styles.actionButtonsContainer,
                            { marginTop: 0, width: "100%", flexDirection: "column", gap: moderateScale(8) },
                          ]}
                        >
                          {activeTab === "Applicants" ? (
                            userRole === "venue-owner" ? (
                              <>
                                {/* View Details Button for Venue Owners */}
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => handleDetailsPress(item)}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: isDark
                                      ? "rgba(99, 102, 241, 0.15)"
                                      : "#EEF2FF",
                                    padding: 10,
                                    borderRadius: 8,
                                    gap: 6,
                                  }}
                                >
                                  <Ionicons
                                    name="eye-outline"
                                    size={16}
                                    color={colors.primary}
                                  />
                                  <Text
                                    style={{
                                      color: colors.primary,
                                      fontFamily: "Poppins_500Medium",
                                      fontSize: 12,
                                    }}
                                  >
                                    View Full Details
                                  </Text>
                                </TouchableOpacity>
                                {/* Decline / Accept Row */}
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                  <TouchableOpacity activeOpacity={1}
                                    onPress={() => handleDeclineBooking(item)}
                                    style={{
                                      flex: 1,
                                      backgroundColor: isDark
                                        ? "rgba(239, 68, 68, 0.2)"
                                        : "#FEF2F2",
                                      padding: 10,
                                      borderRadius: 100,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "#EF4444",
                                        fontFamily: "Poppins_600SemiBold",
                                        fontSize: 12,
                                      }}
                                    >
                                      Decline
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity activeOpacity={1}
                                    onPress={() => {
                                      setSelectedItem(item);
                                      setModalMode("confirm");
                                      setModalVisible(true);
                                    }}
                                    style={{
                                      flex: 1,
                                      backgroundColor: "#10B981",
                                      padding: 10,
                                      borderRadius: 8,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: "white",
                                        fontFamily: "Poppins_600SemiBold",
                                        fontSize: 12,
                                      }}
                                    >
                                      Accept
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </>
                            ) : (
                              // Musician View: View Details + Withdraw Button
                              <View
                                style={{ flexDirection: "row", gap: 8, flex: 1 }}
                              >
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => handleDetailsPress(item)}
                                  style={{
                                    flex: 1,
                                    borderColor: colors.border,
                                    borderWidth: 1,
                                    padding: 10,
                                    borderRadius: 100,
                                    alignItems: "center",
                                    flexDirection: "row",
                                    justifyContent: "center",
                                    gap: 6,
                                  }}
                                >
                                  <Ionicons
                                    name="eye-outline"
                                    size={16}
                                    color={colors.textSecondary}
                                  />
                                  <Text
                                    style={{
                                      color: colors.textSecondary,
                                      fontFamily: "Poppins_500Medium",
                                      fontSize: 12,
                                    }}
                                  >
                                    View Details
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => {
                                    setSelectedItem(item);
                                    handleCancelBooking(item.id);
                                  }}
                                  style={{
                                    flex: 1,
                                    backgroundColor: isDark
                                      ? "rgba(239, 68, 68, 0.2)"
                                      : "#FEF2F2",
                                    padding: 10,
                                    borderRadius: 100,
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: "#EF4444",
                                      fontFamily: "Poppins_600SemiBold",
                                      fontSize: 12,
                                    }}
                                  >
                                    Withdraw
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )
                          ) : activeTab === "Pending" && isMusicianView && isLeaderConfirmation ? (
                            <>
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => handleDetailsPress(item)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: isDark
                                    ? "rgba(99, 102, 241, 0.15)"
                                    : "#EEF2FF",
                                  padding: 10,
                                  borderRadius: 100,
                                  gap: 6,
                                }}
                              >
                                <Ionicons
                                  name="eye-outline"
                                  size={16}
                                  color={colors.primary}
                                />
                                <Text
                                  style={{
                                    color: colors.primary,
                                    fontFamily: "Poppins_500Medium",
                                    fontSize: 12,
                                  }}
                                >
                                  View Full Details
                                </Text>
                              </TouchableOpacity>
                              <View style={{ flexDirection: "row", gap: 8 }}>
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => handleDeclineBooking(item)}
                                  style={{
                                    flex: 1,
                                    backgroundColor: isDark
                                      ? "rgba(239, 68, 68, 0.2)"
                                      : "#FEF2F2",
                                    padding: 10,
                                    borderRadius: 100,
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: "#EF4444",
                                      fontFamily: "Poppins_600SemiBold",
                                      fontSize: 12,
                                    }}
                                  >
                                    Reject
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => {
                                    setSelectedItem(item);
                                    setModalMode("confirm");
                                    setModalVisible(true);
                                  }}
                                  style={{
                                    flex: 1,
                                    backgroundColor: "#10B981",
                                    padding: 10,
                                    borderRadius: 100,
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: "white",
                                      fontFamily: "Poppins_600SemiBold",
                                      fontSize: 12,
                                    }}
                                  >
                                    Approve
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </>
                          ) : activeTab === "Active Musicians" ? (
                            // FIRE & COMPLETE BUTTONS
                            <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => {
                                  setSelectedItem(item);
                                  setModalMode("fire");
                                  setCancellationReason("");
                                  setModalVisible(true);
                                }}
                                style={{
                                  flex: 1,
                                  backgroundColor: isDark
                                    ? "rgba(239, 68, 68, 0.2)"
                                    : "#FEF2F2",
                                  padding: 10,
                                  borderRadius: 100,
                                  alignItems: "center",
                                  flexDirection: "row",
                                  justifyContent: "center",
                                  gap: 6,
                                }}
                              >
                                <Ionicons name="flame" size={16} color="#EF4444" />
                                <Text
                                  style={{
                                    color: "#EF4444",
                                    fontFamily: "Poppins_700Bold",
                                    fontSize: 12,
                                  }}
                                >
                                  FIRE
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity activeOpacity={1}
                                onPress={() => {
                                  setSelectedItem(item);
                                  setModalMode("complete");
                                  setModalVisible(true);
                                }}
                                style={{
                                  flex: 1,
                                  backgroundColor: "#10B981",
                                  padding: 10,
                                  borderRadius: 100,
                                  alignItems: "center",
                                  flexDirection: "row",
                                  justifyContent: "center",
                                  gap: 6,
                                }}
                              >
                                <Ionicons
                                  name="checkmark-circle"
                                  size={16}
                                  color="white"
                                />
                                <Text
                                  style={{
                                    color: "white",
                                    fontFamily: "Poppins_700Bold",
                                    fontSize: 12,
                                  }}
                                >
                                  COMPLETE
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : activeTab === "Review" ? (
                            // Review Tab: Leave Review + Renew Contract for venue owners
                            <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => handleLeaveReview(item)}
                                style={{
                                  flex: 1,
                                  borderColor: colors.primary,
                                  borderWidth: 1,
                                  padding: 10,
                                  borderRadius: 100,
                                  alignItems: "center",
                                  flexDirection: "row",
                                  justifyContent: "center",
                                  gap: 6,
                                }}
                              >
                                <Ionicons
                                  name="star-outline"
                                  size={16}
                                  color={colors.primary}
                                />
                                <Text
                                  style={{
                                    color: colors.primary,
                                    fontFamily: "Poppins_500Medium",
                                    fontSize: 12,
                                  }}
                                >
                                  Leave Review
                                </Text>
                              </TouchableOpacity>

                              {userRole === "venue-owner" && (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => handleRenewContract(item)}
                                  style={{
                                    flex: 1,
                                    backgroundColor: "#7C3AED",
                                    padding: 10,
                                    borderRadius: 100,
                                    alignItems: "center",
                                    flexDirection: "row",
                                    justifyContent: "center",
                                    gap: 6,
                                  }}
                                >
                                  <Ionicons
                                    name="refresh"
                                    size={16}
                                    color="white"
                                  />
                                  <Text
                                    style={{
                                      color: "white",
                                      fontFamily: "Poppins_600SemiBold",
                                      fontSize: 12,
                                    }}
                                  >
                                    Renew
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ) : (
                            // Default / Details
                            <TouchableOpacity activeOpacity={1}
                              onPress={() => handleDetailsPress(item)}
                              style={{
                                flex: 1,
                                borderColor: colors.border,
                                borderWidth: 1,
                                padding: 10,
                                borderRadius: 100,
                                alignItems: "center",
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.textSecondary,
                                  fontFamily: "Poppins_500Medium",
                                  fontSize: 12,
                                }}
                              >
                                View Details
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }

              // ==========================================
              // 2. STUDIO BOOKING CARD (Standard View)
              // ==========================================
              return (
                <View
                  key={item.id}
                  style={[
                    styles.cardContainer,
                    isWebDesktop && styles.cardContainerWeb,
                    isWebDesktop && styles.gridItemWeb,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View>
                    <CachedImage
                      uri={item.image}
                      style={[
                        styles.cardImage,
                        { opacity: item.isCancelled ? 0.6 : 1 },
                      ]}
                      width={800}
                      height={400}
                      quality={72}
                      cacheVersion={item.updated_at || item.created_at || item.id}
                    />
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{item.type}</Text>
                    </View>

                    {/* Pax Badge for Studios */}
                    {item.pax && (
                      <View
                        style={[
                          styles.typeBadge,
                          {
                            left: undefined,
                            right: 10,
                            backgroundColor: "#10B981",
                          },
                        ]}
                      >
                        <Text style={styles.typeBadgeText}>{item.pax} pax</Text>
                      </View>
                    )}

                    {/* Status Overlays */}
                    {activeTab === "Ongoing" && (
                      <View style={styles.liveBadge}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>Live</Text>
                      </View>
                    )}

                    {item.isCancelled && (
                      <View style={styles.cancelledOverlay}>
                        <View style={styles.cancelledBadge}>
                          <Text style={styles.cancelledText}>Cancelled</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleContainer}>
                        <Text
                          style={[styles.cardTitle, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>

                        {/* Booker Info for Studio/Venue Owners */}
                        {(userRole === "studio-owner" ||
                          userRole === "venue-owner") &&
                          item.customer_name && (
                            <TouchableOpacity activeOpacity={1}
                              style={[
                                styles.customerInfoContainer,
                                {
                                  backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#F3F4F6",
                                  padding: 8,
                                  borderRadius: 8,
                                  marginTop: 8
                                }
                              ]}
                              onPress={() =>
                                router.push({
                                  pathname: "/profile",
                                  params: { userId: item.user_id },
                                })
                              }
                            >
                              <CachedImage
                                uri={
                                  item.customer_avatar ||
                                  "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100&h=100&fit=crop"
                                }
                                style={styles.customerAvatar}
                                width={100}
                                height={100}
                                quality={68}
                                cacheVersion={item.customer_updated_at || item.updated_at || item.id}
                              />
                              <Text
                                style={[
                                  styles.customerName,
                                  { color: colors.textSecondary, flex: 1 },
                                ]}
                                numberOfLines={1}
                              >
                                {item.type_id === "gig_application"
                                  ? "Applied by "
                                  : "Booked by "}
                                <Text
                                  style={{
                                    fontFamily: "Poppins_600SemiBold",
                                    color: colors.text,
                                  }}
                                >
                                  {item.customer_name}
                                </Text>
                              </Text>
                              <Ionicons
                                name="chevron-forward"
                                size={14}
                                color={colors.textSecondary}
                              />
                            </TouchableOpacity>
                          )}

                        {/* Contact Info (Studio Owners) */}
                        {userRole === "studio-owner" &&
                          item.type_id === "studio_booking" && (
                            <View style={{ marginTop: 4, gap: 4 }}>
                              {item.customer_contact && (
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <Ionicons
                                    name="call-outline"
                                    size={12}
                                    color={colors.primary}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontFamily: "Poppins_400Regular",
                                      color: colors.text,
                                    }}
                                  >
                                    {item.customer_contact}
                                  </Text>
                                </View>
                              )}
                              {item.customer_address && (
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <Ionicons
                                    name="location-outline"
                                    size={12}
                                    color={colors.primary}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontFamily: "Poppins_400Regular",
                                      color: colors.text,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {item.customer_address}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}

                        {/* Video & Note (Venue Owners / Gig Applications) */}
                        {userRole === "venue-owner" &&
                          item.type_id === "gig_application" && (
                            <View style={{ marginTop: 8, gap: 8 }}>
                              {item.video_url && (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() =>
                                    Linking.openURL(item.video_url)
                                  }
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                    backgroundColor: isDark
                                      ? "rgba(59, 130, 246, 0.2)"
                                      : "#EFF6FF",
                                    padding: 8,
                                    borderRadius: 8,
                                  }}
                                >
                                  <Ionicons
                                    name="play-circle"
                                    size={20}
                                    color="#3B82F6"
                                  />
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontFamily: "Poppins_500Medium",
                                      color: "#3B82F6",
                                    }}
                                  >
                                    Watch Audition Video
                                  </Text>
                                </TouchableOpacity>
                              )}

                              {item.note && (
                                <View
                                  style={{
                                    backgroundColor: isDark
                                      ? "#374151"
                                      : "#F9FAFB",
                                    padding: 8,
                                    borderRadius: 8,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontFamily: "Poppins_600SemiBold",
                                      color: colors.textSecondary,
                                      marginBottom: 2,
                                    }}
                                  >
                                    Note:
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontFamily: "Poppins_400Regular",
                                      color: colors.text,
                                    }}
                                  >
                                    "{item.note}"
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}

                        <View style={{ marginTop: 8, gap: 4 }}>
                          {(() => {
                            const dateStr = item.raw_date
                              ? new Date(item.raw_date).toLocaleDateString()
                              : new Date(item.start_time).toLocaleDateString();

                            let timeStr = "";
                            if (item.start_time) {
                              if (item.start_time.includes("T")) {
                                timeStr = new Date(
                                  item.start_time,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                });
                              } else if (item.start_time.includes(":")) {
                                const [hours, minutes] =
                                  item.start_time.split(":");
                                const h = parseInt(hours);
                                if (!isNaN(h)) {
                                  const period = h >= 12 ? "PM" : "AM";
                                  const h12 = h % 12 || 12;
                                  timeStr = `${h12}:${minutes} ${period}`;
                                }
                              }
                            }

                            const parsedSongCount = Number(
                              item.song_count ??
                                item.modifiers_applied?.recording_session
                                  ?.song_count ??
                                item.modifiers_applied?.song_count ??
                                0,
                            );
                            const recordingSongCount =
                              Number.isFinite(parsedSongCount) &&
                              parsedSongCount > 0
                                ? parsedSongCount
                                : null;
                            const parsedLegacyMinHoursPerSong = Number(
                              item.modifiers_applied?.recording_session
                                ?.min_hours_per_song ??
                                item.modifiers_applied?.min_hours_per_song ??
                                0,
                            );
                            const legacyMinHoursPerSong =
                              Number.isFinite(parsedLegacyMinHoursPerSong) &&
                              parsedLegacyMinHoursPerSong > 0
                                ? parsedLegacyMinHoursPerSong
                                : null;
                            const recordingRule = resolveRecordingRule({
                              ...(typeof item.modifiers_applied === "object" &&
                              item.modifiers_applied
                                ? item.modifiers_applied
                                : {}),
                              ...(typeof item.modifiers_applied?.recording_session ===
                                "object" && item.modifiers_applied?.recording_session
                                ? item.modifiers_applied.recording_session
                                : {}),
                              ...(legacyMinHoursPerSong
                                ? {
                                    recording_songs_per_block: 1,
                                    recording_hours_per_block:
                                      legacyMinHoursPerSong,
                                  }
                                : {}),
                            });
                            const recordingRuleLabel = formatRecordingRuleShort(
                              recordingRule,
                            );
                            const parsedRequiredBlocks = Number(
                              item.modifiers_applied?.recording_session
                                ?.required_blocks ??
                                item.modifiers_applied?.required_blocks ??
                                0,
                            );
                            const requiredBlocks =
                              Number.isFinite(parsedRequiredBlocks) &&
                              parsedRequiredBlocks > 0
                                ? parsedRequiredBlocks
                                : recordingSongCount
                                  ? getRecordingRequiredBlocks(
                                      recordingSongCount,
                                      recordingRule,
                                    )
                                  : null;
                            const parsedRequiredTotalHours = Number(
                              item.modifiers_applied?.recording_session
                                ?.required_total_hours ??
                                item.modifiers_applied?.required_total_hours ??
                                0,
                            );
                            const requiredTotalHours =
                              Number.isFinite(parsedRequiredTotalHours) &&
                              parsedRequiredTotalHours > 0
                                ? parsedRequiredTotalHours
                                : recordingSongCount
                                  ? getRecordingRequiredHours(
                                      recordingSongCount,
                                      recordingRule,
                                    )
                                  : null;
                            const parsedSelectedTotalHours = Number(
                              item.modifiers_applied?.recording_session
                                ?.selected_total_hours ??
                                item.modifiers_applied?.selected_total_hours ??
                                item.duration_hours ??
                                item.modifiers_applied?.hours ??
                                0,
                            );
                            const selectedTotalHours =
                              Number.isFinite(parsedSelectedTotalHours) &&
                              parsedSelectedTotalHours > 0
                                ? parsedSelectedTotalHours
                                : null;
                            const showRecordingMeta =
                              Boolean(recordingSongCount) ||
                              Boolean(requiredTotalHours) ||
                              Boolean(recordingRuleLabel);
                            const recordingDurationColor =
                              selectedTotalHours &&
                              requiredTotalHours &&
                              selectedTotalHours + 1e-9 < requiredTotalHours
                                ? "#F59E0B"
                                : colors.textSecondary;

                            return (
                              <>
                                <View style={styles.cardDetailRow}>
                                  <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                                  <Text style={[styles.cardDetailText, { color: colors.textSecondary }]}>
                                    {dateStr}
                                  </Text>
                                </View>
                                {timeStr ? (
                                  <View style={styles.cardDetailRow}>
                                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                                    <Text style={[styles.cardDetailText, { color: colors.textSecondary }]}>
                                      {timeStr}
                                    </Text>
                                  </View>
                                ) : null}
                                {showRecordingMeta ? (
                                  <>
                                    {recordingSongCount ? (
                                      <View style={styles.cardDetailRow}>
                                        <Ionicons
                                          name="musical-notes-outline"
                                          size={14}
                                          color={colors.textSecondary}
                                        />
                                        <Text
                                          style={[
                                            styles.cardDetailText,
                                            { color: colors.textSecondary },
                                          ]}
                                        >
                                          Recording • {recordingSongCount} song
                                          {recordingSongCount > 1 ? "s" : ""}
                                        </Text>
                                      </View>
                                    ) : null}
                                    {recordingRuleLabel ? (
                                      <View style={styles.cardDetailRow}>
                                        <Ionicons
                                          name="layers-outline"
                                          size={14}
                                          color={colors.textSecondary}
                                        />
                                        <Text
                                          style={[
                                            styles.cardDetailText,
                                            { color: colors.textSecondary },
                                          ]}
                                        >
                                          Rule • {recordingRuleLabel}
                                        </Text>
                                      </View>
                                    ) : null}
                                    {requiredTotalHours ? (
                                      <View style={styles.cardDetailRow}>
                                        <Ionicons
                                          name="hourglass-outline"
                                          size={14}
                                          color={recordingDurationColor}
                                        />
                                        <Text
                                          style={[
                                            styles.cardDetailText,
                                            { color: recordingDurationColor },
                                          ]}
                                        >
                                          {requiredBlocks
                                            ? `Need ${requiredBlocks} block${requiredBlocks > 1 ? "s" : ""} • `
                                            : ""}
                                          Min {formatRecordingHours(requiredTotalHours)}h
                                          {selectedTotalHours
                                            ? ` • Selected ${formatRecordingHours(selectedTotalHours)}h`
                                            : ""}
                                        </Text>
                                      </View>
                                    ) : null}
                                  </>
                                ) : null}
                              </>
                            );
                          })()}
                        </View>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.cardFooter,
                        { borderColor: isDark ? colors.border : "#F3F4F6" },
                        // FORCE COLUMN LAYOUT for proper vertical stacking
                        {
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: moderateScale(12),
                        },
                      ]}
                    >
                      {/* Status Text with Icon - Now at the Top */}
                      <View
                        style={{
                          width: "100%",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: moderateScale(8),
                        }}
                      >
                        <View
                          style={[styles.statusContainer, { marginBottom: 0 }]}
                        >
                          {item.isCancelled ? (
                            <Ionicons
                              name="close-circle"
                              size={16}
                              color="#EF4444"
                            />
                          ) : activeTab === "Ongoing" ? (
                            <Ionicons
                              name="play-circle"
                              size={16}
                              color="#10B981"
                            />
                          ) : activeTab === "Review" ? (
                            <Ionicons
                              name="checkmark-done-circle"
                              size={16}
                              color={colors.textSecondary}
                            />
                          ) : activeTab === "Pending" ? (
                            <Ionicons
                              name="time-outline"
                              size={16}
                              color="#F59E0B"
                            />
                          ) : (
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color="#10B981"
                            />
                          )}

                          <Text
                            style={[
                              styles.statusText,
                              {
                                color: item.isCancelled
                                  ? "#EF4444"
                                  : activeTab === "Pending"
                                    ? "#F59E0B"
                                    : activeTab === "Ongoing"
                                      ? "#10B981"
                                      : activeTab === "Review"
                                        ? colors.textSecondary
                                        : "#10B981",
                              },
                            ]}
                          >
                            {item.status}
                          </Text>

                          {/* Downpayment Badge - only show if balance remains AND not fully paid */}
                          {item.payment_type === "downpayment" &&
                            item.remaining_balance > 0 &&
                            item.payment_status !== "paid" && (
                              <View
                                style={[
                                  styles.downpaymentBadge,
                                  { backgroundColor: "#F59E0B20" },
                                ]}
                              >
                                <Ionicons
                                  name="warning"
                                  size={12}
                                  color="#F59E0B"
                                />
                                <Text
                                  style={[
                                    styles.downpaymentText,
                                    { color: "#F59E0B" },
                                  ]}
                                >
                                  Balance: ₱
                                  {item.remaining_balance?.toLocaleString()}
                                </Text>
                              </View>
                            )}
                        </View>

                        {shouldShowMessageForItem(item) && (
                          <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => handleMessagePress(item)}
                            style={[
                              styles.messageIconButton,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.card,
                              },
                            ]}
                          >
                            <Ionicons
                              name="chatbubble-ellipses-outline"
                              size={16}
                              color={colors.primary}
                            />
                          </TouchableOpacity>
                        )}
                      </View>

                      <View
                        style={[
                          styles.actionButtonsContainer,
                          { marginTop: 0, width: "100%" },
                        ]}
                      >
                        {/* PENDING TAB: Studio Bookings - Payment Button for Musicians */}
                        {activeTab === "Pending" &&
                          item.type_id === "studio_booking" &&
                          userRole === "musician" &&
                          (item.raw_status === "pending_relocation" ||
                            item.status === "Relocation Request") ? (
                          <View style={{ width: "100%", gap: scale(8) }}>
                            <View
                              style={{
                                backgroundColor: isDark
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "#FFFBEB",
                                borderColor: "#F59E0B",
                                borderWidth: 1,
                                borderRadius: 8,
                                padding: 10,
                                gap: 4,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#D97706",
                                  fontSize: 12,
                                  fontFamily: "Poppins_600SemiBold",
                                }}
                              >
                                Studio requested a schedule move
                              </Text>
                              <Text
                                style={{
                                  color: colors.text,
                                  fontSize: 12,
                                  fontFamily: "Poppins_500Medium",
                                }}
                              >
                                New slot: {formatRelocationDateTime(
                                  item.relocation_proposed_date,
                                  item.relocation_proposed_start_time,
                                )}
                                {item.relocation_proposed_end_time
                                  ? ` - ${item.relocation_proposed_end_time.substring(0, 5)}`
                                  : ""}
                              </Text>
                              {item.relocation_expires_at ? (
                                <Text
                                  style={{
                                    color: colors.textSecondary,
                                    fontSize: 11,
                                    fontFamily: "Poppins_400Regular",
                                  }}
                                >
                                  Respond before: {new Date(item.relocation_expires_at).toLocaleString()}
                                </Text>
                              ) : null}
                            </View>

                            <View
                              style={{ flexDirection: "row", gap: scale(8) }}
                            >
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => {
                                  showAlert(
                                    "warning",
                                    "Accept Move",
                                    "Accept this relocated schedule?",
                                    [
                                      { text: "Cancel", style: "cancel" },
                                      {
                                        text: "Accept",
                                        onPress: () =>
                                          handleRelocationDecision(item, true),
                                      },
                                    ],
                                  );
                                }}
                                style={[
                                  styles.actionButton,
                                  {
                                    backgroundColor: "#16A34A",
                                    flex: 1,
                                    alignItems: "center",
                                    borderRadius: 100,
                                  },
                                ]}
                              >
                                <Text style={[styles.actionButtonText, { color: "white" }]}>Accept Move</Text>
                              </TouchableOpacity>

                              <TouchableOpacity activeOpacity={1}
                                onPress={() => {
                                  showAlert(
                                    "warning",
                                    "Decline Move",
                                    "Decline this move request? Booking will be cancelled.",
                                    [
                                      { text: "Keep Booking", style: "cancel" },
                                      {
                                        text: "Decline",
                                        style: "destructive",
                                        onPress: () =>
                                          handleRelocationDecision(item, false),
                                      },
                                    ],
                                  );
                                }}
                                style={[
                                  styles.cancelButton,
                                  {
                                    backgroundColor: isDark
                                      ? "rgba(127, 29, 29, 0.2)"
                                      : "#FEF2F2",
                                    flex: 1,
                                    alignItems: "center",
                                    borderRadius: 100,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.cancelButtonText,
                                    isDark
                                      ? { color: "#F87171" }
                                      : { color: "#DC2626" },
                                  ]}
                                >
                                  Decline Move
                                </Text>
                              </TouchableOpacity>
                            </View>

                            <TouchableOpacity activeOpacity={1}
                              onPress={() => handleDetailsPress(item)}
                              style={[
                                styles.outlineButton,
                                {
                                  borderColor: colors.border,
                                  width: "100%",
                                  alignItems: "center",
                                },
                              ]}
                            >
                              <View style={styles.detailsButtonLabelContainer}>
                                <Text
                                  style={[
                                    styles.outlineButtonText,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  View Details
                                </Text>
                                {shouldShowLateReportDot(item) && (
                                  <View
                                    style={[
                                      styles.lateReportBadge,
                                      { borderColor: isDark ? colors.card : "#FFFFFF" },
                                    ]}
                                  >
                                    <View style={styles.lateReportDot} />
                                    {item?.late_report_count > 1 ? (
                                      <Text style={styles.lateReportBadgeText}>
                                        {item.late_report_count}
                                      </Text>
                                    ) : null}
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          </View>
                        ) : activeTab === "Pending" &&
                          item.type_id === "studio_booking" &&
                          userRole === "musician" ? (
                          <View
                            style={{
                              gap: scale(6),
                              flex: 1,
                            }}
                          >
                            {/* Row 1 — Details + Pay Now (hidden when fully paid & awaiting confirmation) */}
                            <View style={{ flexDirection: "row", gap: scale(8) }}>
                              {/* Details Button */}
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => handleDetailsPress(item)}
                                style={[
                                  styles.outlineButton,
                                  {
                                    borderColor: colors.border,
                                    flex: 1,
                                    justifyContent: "center",
                                    alignItems: "center",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.outlineButtonText,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  Details
                                </Text>
                              </TouchableOpacity>

                              {/* Pay Now / Pay Balance — only when payment is not fully settled */}
                              {item.payment_status !== "paid" && (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => showPaymentOptions(item)}
                                  style={[
                                    styles.actionButton,
                                    {
                                      backgroundColor: "#16A34A",
                                      flex: 2,
                                      justifyContent: "center",
                                      alignItems: "center",
                                      flexDirection: "row",
                                      gap: 6,
                                    },
                                  ]}
                                >
                                  <Ionicons name="card-outline" size={16} color="white" />
                                  <Text
                                    style={[
                                      styles.actionButtonText,
                                      { color: "white" },
                                    ]}
                                  >
                                    {item.payment_type === "downpayment" && item.remaining_balance > 0
                                      ? `Pay Balance ₱${item.remaining_balance?.toLocaleString()}`
                                      : "Pay Now"}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            <TouchableOpacity activeOpacity={1}
                              onPress={() => {
                                setSelectedItem(item);
                                setModalMode("cancel");
                                setCancellationReason("");
                                setModalVisible(true);
                              }}
                              style={[
                                styles.cancelButton,
                                {
                                  backgroundColor: isDark
                                    ? "rgba(127, 29, 29, 0.2)"
                                    : "#FEF2F2",
                                  width: "100%",
                                  alignItems: "center",
                                  borderRadius: 100,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.cancelButtonText,
                                  isDark
                                    ? { color: "#F87171" }
                                    : { color: "#DC2626" },
                                ]}
                              >
                                Cancel Booking
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : activeTab === "Pending" &&
                          item.type_id === "studio_booking" &&
                          (userRole === "studio-owner" || userRole === "venue-owner") ? (
                          // Studio Owner view for pending bookings
                          <View
                            style={{
                              flexDirection: "row",
                              gap: scale(8),
                              flex: 1,
                            }}
                          >
                            <TouchableOpacity activeOpacity={1}
                              onPress={() => handleDetailsPress(item)}
                              style={[
                                styles.outlineButton,
                                {
                                  borderColor: colors.border,
                                  flex: 1,
                                  justifyContent: "center",
                                  alignItems: "center",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.outlineButtonText,
                                  { color: colors.textSecondary },
                                ]}
                              >
                                View Details
                              </Text>
                            </TouchableOpacity>

                            {!item.isCancelled && (
                              <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => {
                                  setSelectedItem(item);
                                  setModalMode("cancel");
                                  setCancellationReason("");
                                  setModalVisible(true);
                                }}
                                style={[
                                  styles.cancelButton,
                                  {
                                    backgroundColor: isDark
                                      ? "rgba(127, 29, 29, 0.2)"
                                      : "#FEF2F2",
                                    flex: 1,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 100,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.cancelButtonText,
                                    isDark
                                      ? { color: "#F87171" }
                                      : { color: "#DC2626" },
                                  ]}
                                >
                                  Cancel Booking
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ) : activeTab === "Review" ? (
                          <TouchableOpacity activeOpacity={1}
                            onPress={() => handleLeaveReview(item)}
                            style={[
                              styles.outlineButton,
                              { borderColor: colors.primary },
                            ]}
                          >
                            <Text
                              style={[
                                styles.outlineButtonText,
                                { color: colors.primary },
                              ]}
                            >
                              Leave Review
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          // Default / Upcoming Buttons
                          <View
                            style={{ width: "100%", gap: moderateScale(8) }}
                          >
                            {shouldShowLateReportButton(item) && (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => {
                                    setSelectedItem(item);
                                    setModalMode("late");
                                    setCancellationReason("");
                                    setModalVisible(true);
                                  }}
                                  style={[
                                    styles.outlineButton,
                                    {
                                      borderColor: "#F59E0B",
                                      backgroundColor: isDark
                                        ? "rgba(245, 158, 11, 0.14)"
                                        : "#FFF7ED",
                                      width: "100%",
                                      alignItems: "center",
                                      borderRadius: 100,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.outlineButtonText,
                                      { color: "#D97706" },
                                    ]}
                                  >
                                    Report Late
                                  </Text>
                                </TouchableOpacity>
                              )}

                            {shouldShowAccessIssueReportButton(item) && (
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => {
                                  setSelectedItem(item);
                                  setModalMode("report_access");
                                  setCancellationReason("");
                                  setModalVisible(true);
                                }}
                                style={[
                                  styles.outlineButton,
                                  {
                                    borderColor: "#EF4444",
                                    backgroundColor: isDark
                                      ? "rgba(239, 68, 68, 0.12)"
                                      : "#FEF2F2",
                                    width: "100%",
                                    alignItems: "center",
                                    borderRadius: 100,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.outlineButtonText,
                                    { color: "#DC2626" },
                                  ]}
                                >
                                  Report Access Issue
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Pay Balance / Clear Balance (F2F) Buttons */}
                            {activeTab === "Upcoming" &&
                              item.type_id === "studio_booking" &&
                              item.payment_type === "downpayment" &&
                              item.remaining_balance > 0 &&
                              item.payment_status !== "paid" && (
                                <>
                                  {userRole === "musician" ? (
                                    <TouchableOpacity activeOpacity={1}
                                      onPress={() => handlePayBalance(item)}
                                      style={[
                                        styles.actionButton,
                                        {
                                          backgroundColor: "#F59E0B",
                                          width: "100%",
                                          alignItems: "center",
                                          flexDirection: "row",
                                          justifyContent: "center",
                                          borderRadius: 100,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name="card-outline"
                                        size={18}
                                        color="white"
                                        style={{ marginRight: 8 }}
                                      />
                                      <Text
                                        style={[
                                          styles.actionButtonText,
                                          {
                                            color: "white",
                                            fontSize: moderateScale(14),
                                          },
                                        ]}
                                      >
                                        Pay Remaining ₱{item.remaining_balance?.toLocaleString()}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}

                                  {userRole === "studio-owner" || userRole === "venue-owner" ? (
                                    <TouchableOpacity activeOpacity={1}
                                      onPress={() => handleClearBalance(item)}
                                      style={[
                                        styles.actionButton,
                                        {
                                          backgroundColor: "#10B981",
                                          width: "100%",
                                          alignItems: "center",
                                          flexDirection: "row",
                                          justifyContent: "center",
                                          borderRadius: 100,
                                        },
                                      ]}
                                    >
                                      <Ionicons
                                        name="checkmark-circle-outline"
                                        size={18}
                                        color="white"
                                        style={{ marginRight: 8 }}
                                      />
                                      <Text
                                        style={[
                                          styles.actionButtonText,
                                          {
                                            color: "white",
                                            fontSize: moderateScale(14),
                                          },
                                        ]}
                                      >
                                        Clear Balance ₱{item.remaining_balance?.toLocaleString()} (F2F)
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </>
                              )}

                            {/* 2. Secondary Actions: Details & Cancel (Row) */}
                            <View
                              style={{ flexDirection: "row", gap: scale(8) }}
                            >
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => handleDetailsPress(item)}
                                style={[
                                  styles.outlineButton,
                                  {
                                    borderColor: colors.border,
                                    flex: 1,
                                    alignItems: "center",
                                  },
                                ]}
                              >
                                <View style={styles.detailsButtonLabelContainer}>
                                  <Text
                                    style={[
                                      styles.outlineButtonText,
                                      { color: colors.textSecondary },
                                    ]}
                                  >
                                    Details
                                  </Text>
                                  {shouldShowLateReportDot(item) && (
                                    <View
                                      style={[
                                        styles.lateReportBadge,
                                        { borderColor: isDark ? colors.card : "#FFFFFF" },
                                      ]}
                                    >
                                      <View style={styles.lateReportDot} />
                                      {item?.late_report_count > 1 ? (
                                        <Text style={styles.lateReportBadgeText}>
                                          {item.late_report_count}
                                        </Text>
                                      ) : null}
                                    </View>
                                  )}
                                </View>
                              </TouchableOpacity>

                              {activeTab === "Upcoming" &&
                                !item.isCancelled && (
                                  <TouchableOpacity activeOpacity={1}
                                    onPress={() => {
                                      setSelectedItem(item);
                                      setModalMode("cancel");
                                      setCancellationReason("");
                                      setModalVisible(true);
                                    }}
                                    style={[
                                      styles.cancelButton,
                                      {
                                        backgroundColor: isDark
                                          ? "rgba(127, 29, 29, 0.2)"
                                          : "#FEF2F2",
                                        flex: 1,
                                        alignItems: "center",
                                        borderRadius: 100,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.cancelButtonText,
                                        isDark
                                          ? { color: "#F87171" }
                                          : { color: "#DC2626" },
                                      ]}
                                    >
                                      Cancel
                                    </Text>
                                  </TouchableOpacity>
                                )}
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
            </View>
          )}
        </ScrollView>

        <View style={styles.navbarPosition}>
          <Navbar />
        </View>
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={
          modalMode === "confirm"
            ? selectedItem?.type_id === "gig_application"
              ? selectedItem?.leader_approval_required
                ? "Approve for Venue Review"
                : "Accept Application"
              : "Confirm Booking"
            : modalMode === "decline"
              ? selectedItem?.type_id === "gig_application"
                ? selectedItem?.leader_approval_required
                  ? "Reject Member Submission"
                  : "Decline Application"
                : "Decline Booking"
              : modalMode === "fire"
                ? "Terminate Agreement"
                : modalMode === "complete"
                  ? "Complete Contract"
                  : modalMode === "renew"
                    ? "Renew Contract"
                    : modalMode === "clear_balance"
                      ? "Clear Remaining Balance"
                  : modalMode === "late_confirm"
                        ? "Confirm Late Report"
                      : modalMode === "late"
                        ? "Report Late"
                        : modalMode === "report_access"
                          ? "Report Access Issue"
                          : selectedItem?.type_id === "gig_application"
                            ? "Withdraw from Gig"
                            : "Cancel Booking"
        }
        message={
          modalMode === "confirm"
            ? selectedItem?.type_id === "gig_application"
              ? selectedItem?.leader_approval_required
                ? "Approve this member submission so it can be sent to the venue owner for review?"
                : "Are you sure you want to accept this application? The musician will be notified."
              : "Are you sure you want to confirm this booking?"
            : modalMode === "decline"
              ? selectedItem?.type_id === "gig_application"
                ? selectedItem?.leader_approval_required
                  ? "Reject this member submission? The member will be notified."
                  : "Are you sure you want to decline this application? The musician will be notified and cannot re-apply to this gig."
                : "Are you sure you want to decline this booking? The user will be notified."
              : modalMode === "fire"
                ? "Are you sure you want to fire this musician? This will cancel their upcoming gigs with you."
                : modalMode === "complete"
                  ? "Confirm efficient completion of this gig? You will be redirected to review the musician."
                  : modalMode === "renew"
                    ? `Would you like to send a contract renewal offer to ${selectedItem?.customer_name || "this musician"}? They will receive a notification and can accept or decline the offer.`
                    : modalMode === "clear_balance"
                      ? `Mark ₱${selectedItem?.remaining_balance?.toLocaleString() || 0} as paid via face-to-face payment? This amount will be credited to your wallet.`
                      : modalMode === "late_confirm"
                        ? `Send this late-arrival reason to the studio owner?\n\n${cancellationReason.trim()}`
                      : modalMode === "late"
                        ? "Please provide your reason for being late."
                        : modalMode === "report_access"
                          ? "Describe the access issue. Your report will be sent to the studio owner and the booking will be flagged for review."
                          : (() => {
                          // Cancel mode
                          if (selectedItem?.type_id === "gig_application") {
                            // For gig applications
                            if (userRole === "venue-owner") {
                              return "Are you sure you want to revoke this accepted application? The musician will be notified.";
                            } else {
                              // Musician withdrawing
                              if (selectedItem?.raw_date) {
                                const eventDate = new Date(selectedItem.raw_date);
                                const now = new Date();
                                const diffTime =
                                  eventDate.getTime() - now.getTime();
                                const diffDays = Math.ceil(
                                  diffTime / (1000 * 60 * 60 * 24),
                                );

                                if (diffDays > 7) {
                                  return "Warning: You are withdrawing from an accepted gig with more than 7 days notice. This may affect your reputation with this venue.";
                                } else if (diffDays >= 3) {
                                  return "Warning: You are withdrawing within 3-7 days. This may significantly affect your reputation with this venue.";
                                }
                                return "You are withdrawing with less than 3 days notice. This may severely damage your reputation with this venue.";
                              }
                              return "Are you sure you want to withdraw from this gig? The venue owner will be notified.";
                            }
                          } else {
                            // For studio bookings - strictly no-refund policy
                            const isFullyPaid = selectedItem?.payment_status === "paid";
                            const isPartialPaid = selectedItem?.payment_status === "partial";

                            if (isFullyPaid) {
                              const paidAmount = selectedItem?.payment_amount || selectedItem?.total_cost || 0;
                              return `Cancellation Policy: Booking cancellations are non-refundable. Your paid amount of ₱${paidAmount.toLocaleString()} will be forfeited.`;
                            }

                            if (isPartialPaid) {
                              const paidPortion =
                                (selectedItem?.payment_amount || selectedItem?.total_cost || 0) -
                                (selectedItem?.remaining_balance || 0);
                              return `Cancellation Policy: Booking cancellations are non-refundable. Your downpayment of ₱${Math.max(0, paidPortion).toLocaleString()} will be forfeited.`;
                            }

                            return "Cancellation Policy: Booking cancellations are non-refundable. Any amount already paid will be forfeited.";
                          }
                        })()
        }
        buttonText={
          modalMode === "confirm"
            ? selectedItem?.type_id === "gig_application"
              ? selectedItem?.leader_approval_required
                ? "Approve"
                : "Accept"
              : "Confirm"
            : modalMode === "decline"
              ? selectedItem?.type_id === "gig_application"
                ? selectedItem?.leader_approval_required
                  ? "Reject"
                  : "Decline Application"
                : "Decline Booking"
              : modalMode === "fire"
                ? "Fire Musician"
                : modalMode === "complete"
                  ? "Complete & Review"
                  : modalMode === "renew"
                    ? "Send Renewal Offer"
                    : modalMode === "clear_balance"
                        ? `Mark ₱${selectedItem?.remaining_balance?.toLocaleString() || 0} as Paid`
                        : modalMode === "late_confirm"
                          ? "Send Report"
                        : modalMode === "late"
                          ? "Submit"
                          : modalMode === "report_access"
                            ? "Submit Report"
                            : "Yes, Cancel Booking"
        }
        showInput={
          modalMode !== "confirm" &&
          modalMode !== "complete" &&
          modalMode !== "renew" &&
          modalMode !== "late_confirm" &&
          modalMode !== "clear_balance" &&
          !(modalMode === "decline" && selectedItem?.leader_approval_required)
        } // Show input for cancel AND decline AND fire AND late AND report_access
        danger={
          modalMode === "fire" ||
          modalMode === "decline" ||
          modalMode === "cancel"
        }
        onInputChange={setCancellationReason}
        onConfirm={async () => {
          // Validation for modes that require input
          if (
            (modalMode === "cancel" ||
              modalMode === "decline" ||
              modalMode === "fire" ||
              modalMode === "late" ||
              modalMode === "report_access") &&
            !(modalMode === "decline" && selectedItem?.leader_approval_required) &&
            !cancellationReason.trim()
          ) {
            showAlert("warning", "Required", "Please provide a reason.");
            return;
          }

          if (modalMode === "late_confirm" && selectedItem && hasLateReportAlready(selectedItem)) {
            showAlert("info", "Already Reported", "You already sent a late report for this booking.");
            setModalVisible(false);
            return;
          }

          if (selectedItem) {
            debugLog("🔍 Modal onConfirm - selectedItem:", selectedItem);
            debugLog("🔍 Modal onConfirm - modalMode:", modalMode);
            debugLog(
              "🔍 Modal onConfirm - selectedItem.type_id:",
              selectedItem.type_id,
            );

            // Handle renew contract separately
            if (modalMode === "renew") {
              await processRenewContract();
              return;
            }

            if (
              selectedItem?.type_id === "gig_application" &&
              selectedItem?.leader_approval_required &&
              (modalMode === "confirm" || modalMode === "decline")
            ) {
              await handleLeaderApprovalDecision(
                selectedItem,
                modalMode === "confirm" ? "approved" : "rejected",
              );
              return;
            }

            // Handle clear balance separately
            if (modalMode === "clear_balance") {
              await processClearBalance();
              return;
            }

            if (modalMode === "late") {
              setModalMode("late_confirm");
              return;
            }

            if (modalMode === "report_access") {
              await handleReportAccessIssue(selectedItem, cancellationReason);
              return;
            }

            let status = "cancelled"; // Default for studio bookings
            if (modalMode === "confirm") {
              status =
                selectedItem.type_id === "gig_application"
                  ? "accepted"
                  : "confirmed";
            } else if (modalMode === "decline") {
              status =
                selectedItem.type_id === "gig_application"
                  ? "rejected"
                  : "cancelled";
            } else if (modalMode === "cancel" || modalMode === "fire") {
              // Cancel mode (from Upcoming tab) or Fire mode
              status =
                selectedItem.type_id === "gig_application"
                  ? "rejected"
                  : "cancelled";
            } else if (modalMode === "complete") {
              status = "completed";
            } else if (modalMode === "late_confirm") {
              status = "late";
            }

            debugLog("🔍 Modal onConfirm - Final status:", status);
            debugLog(
              "🔍 Modal onConfirm - Calling handleStatusUpdate with:",
              {
                id: selectedItem.id,
                status,
                type_id: selectedItem?.type_id,
                reason: cancellationReason,
              },
            );

            // For decline/cancel, we send cancellationReason
            const didUpdate = await handleStatusUpdate(
              selectedItem.id,
              status,
              selectedItem?.type_id,
              cancellationReason,
            );

            if (didUpdate && modalMode === "late_confirm") {
              setLocallyReportedLateBookings((prev) => ({
                ...prev,
                [selectedItem.id]: true,
              }));
              showAlert(
                "success",
                "Late report sent",
                "Studio owner has been notified.",
              );
            }

            // If FIRING or COMPLETED, redirect to review
            if (modalMode === "fire" || modalMode === "complete") {
              // Give a small delay or just switch
              setActiveTab("Review");
              // Open review flow for this item
              handleLeaveReview(selectedItem);
            }
          }
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

      <BookingDetailsSheet
        ref={bookingDetailsRef}
        booking={selectedItem}
        onConfirm={handleConfirmBooking}
        onCancel={handleCancelBooking}
      />

      {/* Payment Option Modal */}
      <RNModal
        visible={showPaymentOptionModal}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setShowPaymentOptionModal(false)}
      >
        <BlurView intensity={60} tint="dark" style={styles.modalOverlay}>
          <View
            style={[
              styles.paymentOptionContainer,
              { backgroundColor: colors.card },
            ]}
          >
            {/* Close button - absolutely positioned inside the card */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowPaymentOptionModal(false)}
              style={styles.modalCloseIcon}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.paymentOptionTitle, { color: colors.text }]}>
              Payment Option
            </Text>
            <Text
              style={[
                styles.paymentOptionSubtitle,
                { color: colors.textSecondary },
              ]}
            >
              Total Amount: ₱
              {(
                paymentItem?.payment_amount ||
                paymentItem?.total_cost ||
                0
              ).toLocaleString()}
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
                <View style={styles.paymentOptionInfo}>
                  <Text
                    style={[styles.paymentOptionLabel, { color: colors.text }]}
                  >
                    Full Payment
                  </Text>
                  <Text
                    style={[
                      styles.paymentOptionAmount,
                      { color: colors.primary },
                    ]}
                  >
                    ₱
                    {(
                      paymentItem?.payment_amount ||
                      paymentItem?.total_cost ||
                      0
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
                <View style={styles.paymentOptionInfo}>
                  <Text
                    style={[styles.paymentOptionLabel, { color: colors.text }]}
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
                      (paymentItem?.payment_amount ||
                        paymentItem?.total_cost ||
                        0) / 2,
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
                  (paymentItem?.payment_amount ||
                    paymentItem?.total_cost ||
                    0) / 2,
                ).toLocaleString()}{" "}
                due before session
              </Text>
            </TouchableOpacity>

            {/* Action Buttons */}
            <View style={styles.paymentOptionButtons}>
              <TouchableOpacity activeOpacity={1}
                onPress={() => {
                  setShowPaymentOptionModal(false);
                  handlePayNow(paymentItem, selectedPaymentType);
                }}
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
              onPress={() => setShowPaymentOptionModal(false)}
              style={{ marginTop: 16, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_500Medium' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </RNModal>

      {/* Scanner Modal (Studio Owner) */}
      <RNModal
        visible={showScanModal}
        animationType="slide"
        onRequestClose={() => setShowScanModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scanBox} />
            <Text style={styles.scanText}>Scan Musician's Entry Pass</Text>
            <TouchableOpacity activeOpacity={1}
              onPress={() => setShowScanModal(false)}
              style={styles.closeScannerButton}
            >
              <Ionicons name="close-circle" size={48} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  pageFrame: {
    flex: 1,
    width: "100%",
  },
  pageFrameWeb: {
    maxWidth: 1240,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  tabContainer: {
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(8),
  },
  webSectionCard: {
    borderRadius: moderateScale(18),
    borderWidth: 1,
    paddingVertical: moderateScale(12),
    marginTop: moderateScale(8),
    marginBottom: moderateScale(8),
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  tabScrollContent: {
    paddingHorizontal: scale(24),
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(9999),
    marginRight: scale(8),
    borderWidth: 1,
  },
  tabText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_600SemiBold",
  },
  scrollContent: {
    paddingBottom:
      SCREEN_HEIGHT < 700 ? verticalScale(150) : verticalScale(180),
    paddingHorizontal: scale(24),
    paddingTop: moderateScale(16),
  },
  scrollContentWeb: {
    maxWidth: 1160,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingTop: moderateScale(18),
  },
  gridWrap: {
    width: "100%",
  },
  gridWrapWeb: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItemWeb: {
    width: "49%",
    marginBottom: moderateScale(18),
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(80),
  },
  loadingText: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
  },
  emptyTitle: {
    marginTop: moderateScale(16),
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
  },
  emptySubtitle: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    opacity: 0.7,
  },
  cardContainer: {
    marginBottom: SCREEN_HEIGHT < 700 ? moderateScale(12) : moderateScale(16),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    // Tighter, crisp native mobile shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardContainerWeb: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 3,
  },
  cardImage: {
    width: "100%",
    height: SCREEN_HEIGHT < 700 ? verticalScale(130) : verticalScale(160),
    borderTopLeftRadius: moderateScale(16),
    borderTopRightRadius: moderateScale(16),
  },
  typeBadge: {
    position: "absolute",
    top: moderateScale(12),
    left: scale(12),
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(9999),
    backgroundColor: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(4px)",
  },
  typeBadgeText: {
    color: "white",
    fontSize: moderateScale(10),
    fontFamily: "Poppins_600SemiBold",
  },
  liveBadge: {
    position: "absolute",
    top: moderateScale(12),
    right: scale(12),
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(6),
    borderRadius: moderateScale(9999),
    backgroundColor: "#22C55E", // green-500
    flexDirection: "row",
    alignItems: "center",
  },
  liveDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    backgroundColor: "white",
    marginRight: scale(6),
  },
  liveText: {
    color: "white",
    fontSize: moderateScale(10),
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  cancelledOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  cancelledBadge: {
    paddingHorizontal: scale(12),
    paddingVertical: moderateScale(4),
    backgroundColor: "#EF4444", // red-500
    borderRadius: moderateScale(8),
  },
  cancelledText: {
    color: "white",
    fontSize: moderateScale(12),
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  cardContent: {
    padding: SCREEN_HEIGHT < 700 ? moderateScale(12) : moderateScale(16),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: moderateScale(8),
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: scale(8),
  },
  cardTitle: {
    fontSize: moderateScale(17),
    fontFamily: "Poppins_700Bold",
  },
  cardDate: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(4),
    fontFamily: "Poppins_400Regular",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: moderateScale(8),
    paddingTop: moderateScale(12),
    borderTopWidth: 1,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    fontSize: moderateScale(12),
    marginLeft: scale(6),
    fontFamily: "Poppins_500Medium",
  },
  permitStatusChip: {
    borderWidth: 1,
    borderRadius: moderateScale(999),
    paddingHorizontal: scale(10),
    paddingVertical: moderateScale(5),
    marginLeft: scale(8),
  },
  permitStatusChipText: {
    fontSize: moderateScale(10),
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
  },
  permitNoticeBox: {
    borderWidth: 1,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(10),
    paddingVertical: moderateScale(9),
    marginTop: moderateScale(4),
  },
  permitNoticeTitle: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_600SemiBold",
  },
  permitNoticeReason: {
    marginTop: moderateScale(4),
    fontSize: moderateScale(11),
    fontFamily: "Poppins_500Medium",
    color: "#DC2626",
  },
  permitNoticeText: {
    marginTop: moderateScale(4),
    fontSize: moderateScale(11),
    fontFamily: "Poppins_400Regular",
  },
  customerInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: moderateScale(4),
    marginBottom: moderateScale(2),
  },
  customerAvatar: {
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(10),
    marginRight: scale(6),
  },
  customerName: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    marginRight: scale(4),
  },
  locationContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: moderateScale(4),
    gap: scale(4),
  },
  locationText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    flex: 1,
  },
  actionButtonsContainer: {
    flexDirection: "row",
    marginTop: moderateScale(12),
    width: "100%",
    justifyContent: "flex-end",
  },
  messageIconButton: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(999),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  qrContainer: {
    width: "100%",
    padding: 30,
    borderRadius: 20,
    alignItems: "center",
  },
  qrTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    color: "black",
  },
  qrSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },
  qrWrapper: {
    padding: 20,
    backgroundColor: "white",
    borderRadius: 10,
    overflow: "hidden",
  },
  closeButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: "black",
    borderRadius: 10,
  },
  closeButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  scanText: {
    color: "white",
    fontSize: 16,
    marginTop: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 5,
  },
  closeScannerButton: {
    position: "absolute",
    bottom: 50,
  },

  actionButton: {
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(100),
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },
  outlineButton: {
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(100),
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
  detailsButtonLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(8),
  },
  lateReportBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(4),
    paddingHorizontal: scale(6),
    paddingVertical: moderateScale(2),
    borderRadius: moderateScale(10),
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
  },
  lateReportDot: {
    width: moderateScale(7),
    height: moderateScale(7),
    borderRadius: moderateScale(3.5),
    backgroundColor: "#EF4444",
  },
  lateReportBadgeText: {
    color: "#B91C1C",
    fontSize: moderateScale(10),
    fontFamily: "Poppins_600SemiBold",
    lineHeight: moderateScale(12),
  },
  defaultButtons: {
    flexDirection: "row",
    gap: scale(8),
  },
  cancelButton: {
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(100),
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },
  navbarPosition: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  // Downpayment Badge Styles
  downpaymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  downpaymentText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  // Payment Option Modal Styles
  paymentOptionContainer: {
    width: "90%",
    borderRadius: 24,
    padding: 24,
    paddingTop: 20,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 20,
    position: 'relative',
  },
  paymentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  paymentOptionTitle: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
    marginTop: 8,
    paddingRight: 32,
  },
  paymentOptionSubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    marginBottom: 20,
  },
  modalCloseIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  paymentOptionCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  paymentOptionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  paymentOptionInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  paymentOptionLabel: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    flex: 1,
    flexShrink: 1,
  },
  paymentOptionAmount: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
    flexShrink: 0,
  },
  paymentOptionDesc: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 4,
  },
  paymentOptionButtons: {
    marginTop: 20,
  },
  paymentOptionConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  paymentOptionConfirmText: {
    color: "white",
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  // New detail styles for cards
  cardDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: moderateScale(6),
    gap: scale(6),
  },
  cardDetailText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    flex: 1,
  },
});

