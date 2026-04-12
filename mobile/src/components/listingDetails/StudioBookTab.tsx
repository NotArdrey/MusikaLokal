import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import React from "react";
import {
    ActivityIndicator,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import styles from "../ListingDetailsSheet.styles";
import { isRecordingStudioMode } from "./availability";

const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log("[StudioBookTab]", ...args);
  }
};

const warnLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.warn("[StudioBookTab]", ...args);
  }
};

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "";
const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const getProjectRefFromUrl = (url: string): string | null => {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
};

const decodeJwtClaims = (token?: string | null): Record<string, any> | null => {
  if (!token || typeof token !== "string") return null;

  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;

    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

    if (typeof globalThis.atob !== "function") return null;

    const decoded = globalThis.atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

interface StudioBookTabProps {
  group: any;
  bookings: any[];
  setBookings: (value: any[]) => void;
  displayRate: string;
  isDark: boolean;
  colors: any;
  hasExistingStudioBooking: boolean;
  existingStudioBookingStatus: string | null;
  sheetRef: any;
  router: any;
  renderBookingControls: () => React.ReactNode;
  isRecordingMode: boolean;
  isRecordingWholeDayAvailable: boolean;
  isCheckingAvailability: boolean;
  setIsCheckingAvailability: (value: boolean) => void;
  selectedDate: string;
  recordingDaySlot: { start: string; end: string } | null;
  userId: string | null;
  supabase: any;
  setShowAddBooking: (value: boolean) => void;
  setSelectedDate: (value: string) => void;
  setIsRecordingWholeDayAvailable: (value: boolean) => void;
  setRecordingDaySlot: (value: { start: string; end: string } | null) => void;
  date: Date | null;
  endTime: Date | null;
  selectedSlot: string | null;
  selectedTimeSlots: { start: string; end: string }[];
  setSelectedTimeSlots: (value: { start: string; end: string }[]) => void;
  setDate: (value: Date) => void;
  setEndTime: (value: Date) => void;
  setSelectedSlot: (value: string | null) => void;
  showAddBooking: boolean;
  bookingNotes: string;
  setBookingNotes: (value: string) => void;
  loading: boolean;
  setLoading: (value: boolean) => void;
  handleConfirm: (action: () => void, title: string, message: string, options?: { requireTerms?: boolean }) => void;
  setModalVisible: (value: boolean) => void;
  setPaymentBookingData: (value: any) => void;
  setSelectedPaymentType: (value: "full" | "downpayment") => void;
  setShowPaymentOptionModal: (value: boolean) => void;
  showPaymentOptionModal: boolean;
  selectedSessionType: "Rehearsal" | "Recording" | null;
  promotions?: any[];
  showAlert: (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message: string,
  ) => void;
}

const StudioBookTab = ({
  group,
  bookings,
  setBookings,
  displayRate,
  isDark,
  colors,
  hasExistingStudioBooking,
  existingStudioBookingStatus,
  sheetRef,
  router,
  renderBookingControls,
  isRecordingMode,
  isRecordingWholeDayAvailable,
  isCheckingAvailability,
  setIsCheckingAvailability,
  selectedDate,
  recordingDaySlot,
  userId,
  supabase,
  setShowAddBooking,
  setSelectedDate,
  setIsRecordingWholeDayAvailable,
  setRecordingDaySlot,
  date,
  endTime,
  selectedSlot,
  selectedTimeSlots,
  setSelectedTimeSlots,
  setDate,
  setEndTime,
  setSelectedSlot,
  showAddBooking,
  bookingNotes,
  setBookingNotes,
  loading,
  setLoading,
  handleConfirm,
  setModalVisible,
  setPaymentBookingData,
  setSelectedPaymentType,
  setShowPaymentOptionModal,
  showPaymentOptionModal,
  selectedSessionType,
  promotions = [],
  showAlert,
}: StudioBookTabProps) => {
  const usesRecordingWholeDayMode = isRecordingStudioMode(
    group?.studio_type,
    selectedSessionType,
  );
  const [recordingSongCountInput, setRecordingSongCountInput] = React.useState("1");

  const parsePositiveInteger = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const whole = Math.floor(parsed);
    return whole > 0 ? whole : null;
  };

  const parsePositiveDecimal = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const getRecordingSongCount = (): number | null =>
    parsePositiveInteger(recordingSongCountInput);

  const getRecordingMinHoursPerSong = (): number =>
    parsePositiveDecimal(group?.settings?.min_booking_duration_hours) || 3;

  const getRecordingRatePerSong = (): number => {
    const fromGroup = Number(group?.recording_rate || 0);
    if (Number.isFinite(fromGroup) && fromGroup > 0) return fromGroup;

    const fromDisplay = Number(String(displayRate || "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(fromDisplay) && fromDisplay > 0) return fromDisplay;

    return 0;
  };

  const getRecordingSongLimitForDate = (bookingDate: string): number | null => {
    if (!bookingDate) return null;

    const dateOverrides = Array.isArray(group?.dateOverrides)
      ? group.dateOverrides
      : [];
    const matchingOverride = dateOverrides.find(
      (entry: any) => entry?.override_date === bookingDate,
    );
    const overrideLimit = parsePositiveInteger(
      matchingOverride?.max_recording_songs_per_day,
    );
    if (overrideLimit) return overrideLimit;

    return parsePositiveInteger(group?.settings?.max_recording_songs_per_day);
  };

  const recordingSongLimitForSelectedDate = selectedDate
    ? getRecordingSongLimitForDate(selectedDate)
    : parsePositiveInteger(group?.settings?.max_recording_songs_per_day);
  const recordingMinHoursPerSong = getRecordingMinHoursPerSong();

  const getSlotDurationHours = (start: string, end: string): number => {
    const startMinutes = toTimeMinutes(start);
    const endMinutes = toTimeMinutes(end);

    if (startMinutes === null || endMinutes === null) return 0;

    const rawDuration = endMinutes - startMinutes;
    if (rawDuration <= 0) return 0;
    return rawDuration / 60;
  };

  const getTotalSlotDurationHours = (
    slots: { start: string; end: string }[],
  ): number =>
    (Array.isArray(slots) ? slots : []).reduce(
      (total, slot) => total + getSlotDurationHours(slot.start, slot.end),
      0,
    );

  const toValidDate = (value: any): Date | null => {
    if (!value) return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "string") {
      const dateOnlyMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
      const parsed = dateOnlyMatch ? new Date(`${value}T00:00:00`) : new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const toDateKey = (value: any): string | null => {
    const parsed = toValidDate(value);
    if (!parsed) return null;

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const toTimeLabel = (value: any): string => {
    if (!value) return "--:--";

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? "--:--" : value.toTimeString().slice(0, 5);
    }

    if (typeof value === "string") {
      const timeMatch = value.match(/^(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hour = String(Number(timeMatch[1])).padStart(2, "0");
        return `${hour}:${timeMatch[2]}`;
      }

      const parsed = toValidDate(value);
      if (parsed) {
        return parsed.toTimeString().slice(0, 5);
      }
    }

    const parsed = toValidDate(value);
    return parsed ? parsed.toTimeString().slice(0, 5) : "--:--";
  };

  const toTimeMinutes = (value: string): number | null => {
    const normalized = toTimeLabel(value);
    const match = normalized.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  const getStudioLeadTimeHours = (): number => {
    const rawLeadTime = Number(group?.settings?.lead_time_hours ?? group?.lead_time_hours);
    if (!Number.isFinite(rawLeadTime)) return 24;
    return Math.max(0, rawLeadTime);
  };

  const activePromotionsForBooking = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const normalizedPromotions = Array.isArray(promotions) ? promotions : [];
    const currentSessionType = usesRecordingWholeDayMode ? "recording" : "rehearsal";
    const shouldFilterBySession =
      String(group?.studio_type || "").toLowerCase() !== "both" ||
      Boolean(selectedSessionType);

    return normalizedPromotions
      .filter((promo: any) => {
        if (!promo || promo.is_active === false) return false;

        const isInRange =
          promo.is_permanent ||
          (!promo.start_date || promo.start_date <= today) &&
            (!promo.end_date || promo.end_date >= today);

        if (!isInRange) return false;

        if (!shouldFilterBySession) return true;

        const appliesTo = String(promo.applies_to || "both").toLowerCase();
        return appliesTo === "both" || appliesTo === currentSessionType;
      })
      .sort((a: any, b: any) => Number(b.discount_value || 0) - Number(a.discount_value || 0));
  }, [promotions, usesRecordingWholeDayMode, group?.studio_type, selectedSessionType]);

  const formatPromotionDiscountText = (promo: any) => {
    const discountValue = Number(promo?.discount_value || 0);
    const discountType = String(promo?.discount_type || "percentage").toLowerCase();
    if (discountType === "percentage") {
      return `${discountValue}% off`;
    }
    return `PHP ${discountValue} off`;
  };

  const formatPromotionWindow = (promo: any) => {
    if (promo?.is_permanent) return "Always active";
    if (!promo?.start_date || !promo?.end_date) return "Limited-time promo";

    return `Valid ${new Date(`${promo.start_date}T00:00:00`).toLocaleDateString()} - ${new Date(
      `${promo.end_date}T00:00:00`,
    ).toLocaleDateString()}`;
  };

  const getLeadTimeViolationMessage = (
    bookingDate: string,
    slots: { start: string; end: string }[],
  ): string | null => {
    if (!bookingDate || !Array.isArray(slots) || slots.length === 0) return null;

    const leadTimeHours = getStudioLeadTimeHours();
    if (leadTimeHours <= 0) return null;

    const earliestSlotStart = [...slots]
      .map((slot) => toTimeLabel(slot.start))
      .filter((time) => /^\d{2}:\d{2}$/.test(time))
      .sort()[0];

    if (!earliestSlotStart) return null;

    const slotStart = new Date(`${bookingDate}T${earliestSlotStart}:00`);
    if (Number.isNaN(slotStart.getTime())) return null;

    const minAllowedStartMs = Date.now() + leadTimeHours * 60 * 60 * 1000;
    if (slotStart.getTime() < minAllowedStartMs) {
      return `This studio requires at least ${leadTimeHours} hour(s) advance booking.`;
    }

    return null;
  };

  const isExpectedBookingValidationError = (
    status: number | undefined,
    message: string,
  ) => {
    const normalized = String(message || "").toLowerCase();
    return (
      status === 409 ||
      normalized.includes("advance booking") ||
      normalized.includes("cannot create a booking in the past") ||
      normalized.includes("bookings can only be made up to") ||
      normalized.includes("time slot") ||
      normalized.includes("already have a pending booking") ||
      normalized.includes("outside operating hours")
    );
  };

  const slotsOverlap = (
    a: { start: string; end: string },
    b: { start: string; end: string },
  ): boolean => {
    const aStart = toTimeMinutes(a.start);
    const aEnd = toTimeMinutes(a.end);
    const bStart = toTimeMinutes(b.start);
    const bEnd = toTimeMinutes(b.end);

    if (
      aStart === null ||
      aEnd === null ||
      bStart === null ||
      bEnd === null ||
      aStart >= aEnd ||
      bStart >= bEnd
    ) {
      return false;
    }

    return aStart < bEnd && bStart < aEnd;
  };

  const formatBookingDate = (booking: any): string => {
    const parsedDate = toValidDate(booking?.date) || toValidDate(booking?.startTime);
    if (!parsedDate) return "Invalid date";

    return parsedDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const totalBookingsCost = bookings.reduce((sum, booking) => {
    if (booking.pricing?.final_price) {
      return sum + booking.pricing.final_price;
    }

    if (usesRecordingWholeDayMode) {
      const recordingSongCount =
        parsePositiveInteger(
          booking.songCount ??
            booking.pricing?.modifiers?.recording_session?.song_count ??
            booking.pricing?.modifiers?.song_count,
        ) || 1;
      const recordingRate = getRecordingRatePerSong();
      if (recordingRate > 0) {
        return sum + recordingRate * recordingSongCount;
      }
    }

    const start = new Date(booking.startTime).getTime();
    const end = new Date(booking.endTime).getTime();
    let hours = (end - start) / (1000 * 60 * 60);
    if (hours < 0) hours += 24;
    return sum + parseInt(displayRate.replace(/,/g, "")) * hours;
  }, 0);

  const isJwtLike = (token?: string | null): token is string => {
    if (typeof token !== "string") return false;
    const parts = token.split(".");
    return parts.length === 3 && parts.every((part) => part.length > 0);
  };

  const summarizeToken = (token?: string | null) => {
    if (typeof token !== "string") {
      return {
        present: false,
      };
    }

    const parts = token.split(".");
    const claims = decodeJwtClaims(token);

    return {
      present: true,
      length: token.length,
      isJwtLike: isJwtLike(token),
      prefix: token.slice(0, 16),
      segmentLengths: parts.map((part) => part.length),
      claims: claims
        ? {
          iss: claims.iss || null,
          aud: claims.aud || null,
          sub: claims.sub || null,
          role: claims.role || null,
          exp: claims.exp || null,
        }
        : null,
    };
  };

  const logAuthDiagnostics = async (phase: string) => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      debugLog(`🔐 Auth diagnostics (${phase})`, {
        userId: user?.id || null,
        userError: userError?.message || null,
        sessionError: sessionError?.message || null,
        expiresAt: session?.expires_at || null,
        tokenSummary: summarizeToken(session?.access_token),
      });
    } catch (diagError: any) {
      warnLog(`⚠️ Failed to collect auth diagnostics (${phase})`, {
        message: diagError?.message || String(diagError),
      });
    }
  };

  /**
   * Prefer current session/getUser first, then refresh as fallback.
   * This avoids refresh-token rotation races while still recovering
   * from stale sessions when needed.
   */
  const getFreshBookingAuth = async (): Promise<{
    userId: string;
    accessToken: string;
  } | null> => {
    try {
      const expectedProjectRef = getProjectRefFromUrl(supabaseUrl);

      const {
        data: { session: currentSession },
        error: currentSessionError,
      } = await supabase.auth.getSession();
      const {
        data: { user: currentUser },
        error: currentUserError,
      } = await supabase.auth.getUser();

      if (
        !currentSessionError &&
        !currentUserError &&
        currentUser?.id &&
        currentSession?.access_token &&
        isJwtLike(currentSession.access_token)
      ) {
        const currentClaims = decodeJwtClaims(currentSession.access_token);
        const currentIssuerProjectRef = currentClaims?.iss
          ? getProjectRefFromUrl(String(currentClaims.iss))
          : null;

        debugLog("🔐 Current booking auth snapshot", {
          userId: currentUser?.id || null,
          expiresAt: currentSession?.expires_at || null,
          tokenSummary: summarizeToken(currentSession?.access_token),
          expectedProjectRef,
          tokenIssuerProjectRef: currentIssuerProjectRef,
        });

        if (
          expectedProjectRef &&
          currentIssuerProjectRef &&
          expectedProjectRef !== currentIssuerProjectRef
        ) {
          warnLog("⚠️ Session token issuer does not match configured Supabase project", {
            expectedProjectRef,
            tokenIssuerProjectRef: currentIssuerProjectRef,
          });
        } else {
          return {
            userId: currentUser.id,
            accessToken: currentSession.access_token,
          };
        }
      }

      const {
        data: { session: refreshedSession },
        error: refreshError,
      } = await supabase.auth.refreshSession();

      if (refreshError) {
        warnLog("⚠️ refreshSession failed before booking", {
          message: refreshError.message,
          code: (refreshError as any)?.code,
          status: (refreshError as any)?.status,
        });
      }

      const {
        data: { user: refreshedUser },
        error: refreshedUserError,
      } = await supabase.auth.getUser();

      if (refreshedUserError) {
        warnLog("⚠️ getUser failed after refreshSession", {
          message: refreshedUserError.message,
          code: (refreshedUserError as any)?.code,
          status: (refreshedUserError as any)?.status,
        });
      }

      debugLog("🔐 Refreshed booking auth snapshot", {
        userId: refreshedUser?.id || null,
        expiresAt: refreshedSession?.expires_at || null,
        tokenSummary: summarizeToken(refreshedSession?.access_token),
      });

      if (
        !refreshError &&
        refreshedUser?.id &&
        refreshedSession?.access_token &&
        isJwtLike(refreshedSession.access_token)
      ) {
        const refreshedClaims = decodeJwtClaims(refreshedSession.access_token);
        const refreshedIssuerProjectRef = refreshedClaims?.iss
          ? getProjectRefFromUrl(String(refreshedClaims.iss))
          : null;

        if (
          expectedProjectRef &&
          refreshedIssuerProjectRef &&
          expectedProjectRef !== refreshedIssuerProjectRef
        ) {
          warnLog("⚠️ Refreshed token issuer does not match configured Supabase project", {
            expectedProjectRef,
            tokenIssuerProjectRef: refreshedIssuerProjectRef,
          });
          return null;
        }

        return {
          userId: refreshedUser.id,
          accessToken: refreshedSession.access_token,
        };
      }
    } catch (authError: any) {
      warnLog("⚠️ Unexpected auth exception before booking", {
        message: authError?.message || String(authError),
      });
      // fall through to null — user must re-auth
    }

    return null;
  };

  const invokeManageBookingsCreate = async (payload: {
    action: "create";
    studio_id: string;
    user_id: string;
    date: string;
    time_slots: { start: string; end: string }[];
    notes: string | null;
    session_type: "recording" | "rehearsal";
    song_count?: number | null;
  }, accessToken: string) => {
    if (!supabaseUrl || !supabaseAnonKey) {
      warnLog("⚠️ Missing Supabase URL/Anon key for direct function fetch; falling back to invoke().");
      return await supabase.functions.invoke("manage-bookings", {
        body: payload,
      });
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/manage-bookings`;

    debugLog("📡 Direct function fetch auth meta", {
      endpoint,
      hasAccessToken: Boolean(accessToken),
      accessTokenSummary: summarizeToken(accessToken),
      anonKeyPrefix: supabaseAnonKey.slice(0, 14),
      anonKeyLength: supabaseAnonKey.length,
      endpointProjectRef: getProjectRefFromUrl(endpoint),
      configuredProjectRef: getProjectRefFromUrl(supabaseUrl),
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        "x-client-info": "musika-lokal",
      },
      body: JSON.stringify(payload),
    });

    let responseData: any = null;
    let responseText: string | null = null;
    try {
      responseData = await response.clone().json();
    } catch {
      responseData = null;
      try {
        responseText = await response.clone().text();
      } catch {
        responseText = null;
      }
    }

    if (!response.ok) {
      const extractedMessage =
        (responseData && typeof responseData === "object" &&
          (responseData.error || responseData.message)) ||
        (typeof responseText === "string" && responseText.trim().length > 0
          ? responseText.trim()
          : null) ||
        null;
      const httpError: any = new Error(
        extractedMessage ||
          response.statusText ||
          `Request failed (${response.status}). Please try again.`,
      );
      httpError.name = "FunctionsHttpError";
      httpError.context = response;
      httpError.status = response.status;
      if (responseData && typeof responseData === "object") {
        httpError.serverError = responseData;
      }
      throw httpError;
    }

    return {
      data: responseData,
      error: null,
    };
  };

  return (
    <View style={styles.tabContent}>
      {hasExistingStudioBooking && existingStudioBookingStatus === "unpaid" && (
        <View
          style={{
            backgroundColor: isDark ? "#1F2937" : "#FFF7ED",
            borderLeftWidth: 4,
            borderLeftColor: "#F59700",
            borderRadius: 8,
            marginBottom: 20,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: 1,
            },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <Ionicons
                name="alert-circle"
                size={16}
                color="#F59700"
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  fontFamily: "Poppins_600SemiBold",
                  fontSize: 14,
                  color: isDark ? "#F59700" : "#D97706",
                }}
              >
                Payment Pending
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Poppins_400Regular",
                fontSize: 12,
                color: colors.textSecondary,
                lineHeight: 18,
              }}
            >
              Complete payment for your existing booking to unlock new sessions.
            </Text>
          </View>

          <TouchableOpacity activeOpacity={1}
            style={{
              backgroundColor: "#F59700",
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 100,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              shadowColor: "#F59700",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 3,
              elevation: 3,
            }}
            onPress={() => {
              (sheetRef as any)?.current?.dismiss();
              router.push({ pathname: "/bookings", params: { tab: "Pending" } } as any);
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "Poppins_600SemiBold",
                fontSize: 12,
              }}
            >
              Pay Now
            </Text>
            <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {activePromotionsForBooking.length > 0 && (
        <View
          style={{
            backgroundColor: isDark ? "rgba(16, 185, 129, 0.16)" : "#ECFDF5",
            borderColor: isDark ? "rgba(52, 211, 153, 0.45)" : "#A7F3D0",
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="pricetag" size={16} color="#10B981" />
            <Text
              style={{
                color: isDark ? "#6EE7B7" : "#065F46",
                fontFamily: "Poppins_600SemiBold",
                fontSize: 13,
                marginLeft: 6,
              }}
            >
              Active Promotion{activePromotionsForBooking.length > 1 ? "s" : ""}
            </Text>
          </View>

          {activePromotionsForBooking.slice(0, 2).map((promo: any, index: number) => {
            const appliesTo = String(promo?.applies_to || "both").toLowerCase();
            const appliesToLabel =
              appliesTo === "rehearsal"
                ? "Rehearsal"
                : appliesTo === "recording"
                  ? "Recording"
                  : "All sessions";

            return (
              <View key={String(promo.id || promo.name || index)}>
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: "Poppins_600SemiBold",
                    fontSize: 12,
                  }}
                >
                  {promo?.name || "Studio Promo"}
                </Text>
                <Text
                  style={{
                    color: isDark ? "#A7F3D0" : "#047857",
                    fontFamily: "Poppins_500Medium",
                    fontSize: 12,
                    marginTop: 1,
                  }}
                >
                  {formatPromotionDiscountText(promo)} - {appliesToLabel}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: "Poppins_400Regular",
                    fontSize: 11,
                    marginTop: 1,
                  }}
                >
                  {formatPromotionWindow(promo)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {bookings.length > 0 && (
        <View style={[styles.section, { marginBottom: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Bookings ({bookings.length})</Text>
          {bookings.map((booking, index) => {
            const start = new Date(booking.startTime).getTime();
            const end = new Date(booking.endTime).getTime();
            let hours = (end - start) / (1000 * 60 * 60);
            if (hours < 0) hours += 24;

            const bookingSongCount = parsePositiveInteger(
              booking.songCount ??
                booking.pricing?.modifiers?.recording_session?.song_count ??
                booking.pricing?.modifiers?.song_count,
            );
            const cost = booking.pricing?.final_price ||
              (usesRecordingWholeDayMode && bookingSongCount
                ? getRecordingRatePerSong() * bookingSongCount
                : parseInt(displayRate.replace(/,/g, "")) * hours);
            const hasModifiers = booking.pricing?.modifiers && Object.keys(booking.pricing.modifiers).length > 0;
            const slots = booking.timeSlots || [
              {
                start: toTimeLabel(booking.startTime),
                end: toTimeLabel(booking.endTime),
              },
            ];
            const isMultiSlot = slots.length > 1;

            return (
              <View
                key={index}
                style={[
                  styles.bookingCard,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                    borderColor: colors.border,
                    marginBottom: 8,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Ionicons name="calendar" size={14} color={colors.primary} />
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: "Poppins_600SemiBold",
                        marginLeft: 6,
                        fontSize: 13,
                      }}
                    >
                      {formatBookingDate(booking)}
                    </Text>
                    {isMultiSlot && (
                      <View
                        style={{
                          marginLeft: 8,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          backgroundColor: "#10B98120",
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: "#10B981",
                            fontSize: 10,
                            fontFamily: "Poppins_600SemiBold",
                          }}
                        >
                          {slots.length} slots
                        </Text>
                      </View>
                    )}
                  </View>
                  {slots.map((slot: any, slotIndex: number) => (
                    <View
                      key={slotIndex}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: slotIndex < slots.length - 1 ? 2 : 0,
                      }}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text
                        style={{
                          color: colors.textSecondary,
                          marginLeft: 6,
                          fontSize: 12,
                        }}
                      >
                        {toTimeLabel(slot.start)} - {toTimeLabel(slot.end)}
                      </Text>
                    </View>
                  ))}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontFamily: "Poppins_600SemiBold",
                      }}
                    >
                      ₱{cost.toLocaleString()}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 11,
                        marginLeft: 8,
                      }}
                    >
                      {usesRecordingWholeDayMode && bookingSongCount
                        ? `${bookingSongCount} song${bookingSongCount > 1 ? "s" : ""}`
                        : `(${booking.pricing?.hours?.toFixed(1) || hours.toFixed(1)}h total)`}
                    </Text>
                    {hasModifiers && (
                      <View
                        style={{
                          marginLeft: 8,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          backgroundColor: colors.primary + "20",
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ color: colors.primary, fontSize: 10 }}>
                          {booking.pricing?.modifiers?.promotion?.name || "Promo Applied"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity activeOpacity={1}
                  onPress={() => {
                    const newBookings = [...bookings];
                    newBookings.splice(index, 1);
                    setBookings(newBookings);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {!(hasExistingStudioBooking && existingStudioBookingStatus === "unpaid") &&
        (showAddBooking || bookings.length === 0) ? (
        <>
          {renderBookingControls()}

          {isRecordingMode && (
            <View style={[styles.inputContainer, { marginBottom: 12 }]}> 
              <Text style={[styles.label, { color: colors.textSecondary }]}>Songs to Record</Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isDark ? "#374151" : "#F9FAFB",
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                  },
                ]}
              >
                <Ionicons name="musical-notes-outline" size={16} color={colors.primary} />
                <TextInput
                  style={[styles.input, { color: colors.text, marginLeft: 8, flex: 1 }]}
                  keyboardType="number-pad"
                  value={recordingSongCountInput}
                  onChangeText={(text) =>
                    setRecordingSongCountInput(text.replace(/[^0-9]/g, ""))
                  }
                  placeholder="Number of songs"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
                {recordingSongLimitForSelectedDate
                  ? `Recording sessions are priced per song. Max ${recordingSongLimitForSelectedDate} song${recordingSongLimitForSelectedDate > 1 ? "s" : ""} for this date. Minimum hours required: songs × ${recordingMinHoursPerSong}.`
                  : `Recording sessions are priced per song. Minimum hours required: songs × ${recordingMinHoursPerSong}.`}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              {
                borderColor: !selectedSlot || !endTime ? colors.border : colors.primary,
                backgroundColor: "transparent",
                marginBottom: 16,
                opacity: !selectedSlot || !endTime || isCheckingAvailability ? 0.5 : 1,
              },
            ]}
            disabled={!selectedSlot || !endTime || isCheckingAvailability}
            activeOpacity={1}
            onPress={async () => {
              if (date && endTime) {
                setIsCheckingAvailability(true);
                try {
                  const bookingDate = toDateKey(date);
                  if (!bookingDate) {
                    showAlert("error", "Invalid Booking Date", "Invalid booking date. Please reselect your schedule.");
                    setIsCheckingAvailability(false);
                    return;
                  }
                  const startTime = date.toTimeString().slice(0, 5);
                  const endTime2 = endTime.toTimeString().slice(0, 5);

                  const currentSlot = { start: startTime, end: endTime2 };

                  const existingBookingIndex = bookings.findIndex(
                    (b) => toDateKey(b.date) === bookingDate,
                  );

                  let recordingSongCount: number | null = null;
                  let recordingRate = 0;
                  if (isRecordingMode) {
                    recordingSongCount = getRecordingSongCount();
                    if (!recordingSongCount) {
                      showAlert(
                        "warning",
                        "Song Count Required",
                        "Please enter how many songs you plan to record.",
                      );
                      setIsCheckingAvailability(false);
                      return;
                    }

                    const recordingSongLimit = getRecordingSongLimitForDate(bookingDate);
                    if (recordingSongLimit && recordingSongCount > recordingSongLimit) {
                      showAlert(
                        "warning",
                        "Song Limit Exceeded",
                        `This studio allows up to ${recordingSongLimit} song${recordingSongLimit > 1 ? "s" : ""} on ${new Date(`${bookingDate}T00:00:00`).toLocaleDateString()}.`,
                      );
                      setIsCheckingAvailability(false);
                      return;
                    }

                    recordingRate = getRecordingRatePerSong();
                    if (recordingRate <= 0) {
                      showAlert(
                        "error",
                        "Recording Rate Missing",
                        "This studio does not have a valid recording rate yet.",
                      );
                      setIsCheckingAvailability(false);
                      return;
                    }
                  }

                  const { data: isAvailable, error: availError } = await supabase.rpc("is_slot_available", {
                    p_studio_id: group.id,
                    p_booking_date: bookingDate,
                    p_start_time: startTime,
                    p_end_time: endTime2,
                    p_user_id: userId,
                  });

                  if (availError) {
                    console.error("Availability check error:", availError);
                    showAlert("error", "Availability Check Failed", "Failed to check availability. Please try again.");
                    setIsCheckingAvailability(false);
                    return;
                  }

                  if (!isAvailable) {
                    showAlert("warning", "Time Slot Unavailable", "This time slot is not available. Please choose a different time.");
                    setIsCheckingAvailability(false);
                    return;
                  }

                  let finalPricing: any = null;

                  if (isRecordingMode) {
                    const songCount = recordingSongCount || 1;
                    const currentSlotHours = getSlotDurationHours(startTime, endTime2);
                    const baseRecordingPrice = recordingRate * songCount;
                    const requiredTotalHours = songCount * recordingMinHoursPerSong;

                    finalPricing = {
                      base_rate: recordingRate,
                      hours: currentSlotHours,
                      total_hours: currentSlotHours,
                      subtotal: baseRecordingPrice,
                      modifiers: {
                        rate_model: "per_song",
                        song_count: songCount,
                        min_hours_per_song: recordingMinHoursPerSong,
                        required_total_hours: requiredTotalHours,
                        selected_total_hours: currentSlotHours,
                        recording_session: {
                          rate_model: "per_song",
                          song_count: songCount,
                          min_hours_per_song: recordingMinHoursPerSong,
                          required_total_hours: requiredTotalHours,
                          selected_total_hours: currentSlotHours,
                        },
                      },
                      final_price: baseRecordingPrice,
                    };

                    try {
                      const { data: promoResult } = await supabase.rpc("apply_studio_promotion", {
                        p_studio_id: group.id,
                        p_booking_date: bookingDate,
                        p_session_type: selectedSessionType?.toLowerCase() || "recording",
                        p_base_price: finalPricing.final_price || 0,
                        p_hours: songCount,
                      });
                      if (promoResult) {
                        finalPricing = {
                          ...finalPricing,
                          final_price: promoResult.final_price_after_promo,
                          modifiers: { ...(finalPricing.modifiers || {}), promotion: promoResult },
                        };
                      }
                    } catch (promoErr) {
                      debugLog("Promotion RPC not available, skipping:", promoErr);
                    }
                  } else {
                    const { data: pricing, error: pricingError } = await supabase.rpc("calculate_booking_price", {
                      p_studio_id: group.id,
                      p_booking_date: bookingDate,
                      p_start_time: startTime,
                      p_end_time: endTime2,
                    });

                    if (pricingError || !pricing || pricing.length === 0) {
                      console.error("Pricing error:", pricingError);
                      showAlert("error", "Pricing Error", "Failed to calculate price. Please try again.");
                      setIsCheckingAvailability(false);
                      return;
                    }

                    finalPricing = pricing[0];
                    try {
                      const { data: promoResult } = await supabase.rpc("apply_studio_promotion", {
                        p_studio_id: group.id,
                        p_booking_date: bookingDate,
                        p_session_type: selectedSessionType?.toLowerCase() || "rehearsal",
                        p_base_price: finalPricing.final_price || 0,
                        p_hours: finalPricing.hours || 0,
                      });
                      if (promoResult) {
                        finalPricing = {
                          ...finalPricing,
                          final_price: promoResult.final_price_after_promo,
                          modifiers: { ...(finalPricing.modifiers || {}), promotion: promoResult },
                        };
                      }
                    } catch (promoErr) {
                      debugLog("Promotion RPC not available, skipping:", promoErr);
                    }
                  }

                  if (existingBookingIndex >= 0) {
                    const existingBooking = bookings[existingBookingIndex];
                    const existingSlots =
                      existingBooking.timeSlots &&
                        existingBooking.timeSlots.length > 0
                        ? existingBooking.timeSlots
                        : [
                          {
                            start: toTimeLabel(existingBooking.startTime),
                            end: toTimeLabel(existingBooking.endTime),
                          },
                        ];

                    const hasDuplicateOrOverlap = existingSlots.some((slot: { start: string; end: string }) =>
                      slotsOverlap(slot, currentSlot),
                    );

                    if (hasDuplicateOrOverlap) {
                      showAlert(
                        "warning",
                        "Duplicate Time Slot",
                        "You already added this time slot for the selected date.",
                      );
                      setIsCheckingAvailability(false);
                      return;
                    }

                    const mergedSlots = [...existingSlots, currentSlot];
                    mergedSlots.sort((a, b) => a.start.localeCompare(b.start));

                    const updatedBookings = [...bookings];

                    if (isRecordingMode) {
                      const songCount = recordingSongCount || 1;
                      const totalHours = getTotalSlotDurationHours(mergedSlots);
                      const requiredTotalHours = songCount * recordingMinHoursPerSong;
                      const updatedStart = new Date(`${bookingDate}T${mergedSlots[0].start}`);
                      const updatedEnd = new Date(`${bookingDate}T${mergedSlots[mergedSlots.length - 1].end}`);

                      updatedBookings[existingBookingIndex] = {
                        ...existingBooking,
                        startTime: updatedStart,
                        endTime: updatedEnd,
                        timeSlots: mergedSlots,
                        songCount,
                        pricing: {
                          ...(finalPricing || {}),
                          hours: totalHours,
                          total_hours: totalHours,
                          subtotal: recordingRate * songCount,
                          final_price: finalPricing?.final_price || recordingRate * songCount,
                          modifiers: {
                            ...(finalPricing?.modifiers || {}),
                            rate_model: "per_song",
                            song_count: songCount,
                            min_hours_per_song: recordingMinHoursPerSong,
                            required_total_hours: requiredTotalHours,
                            selected_total_hours: totalHours,
                            recording_session: {
                              ...(finalPricing?.modifiers?.recording_session || {}),
                              rate_model: "per_song",
                              song_count: songCount,
                              min_hours_per_song: recordingMinHoursPerSong,
                              required_total_hours: requiredTotalHours,
                              selected_total_hours: totalHours,
                            },
                          },
                        },
                      };

                      setBookings(updatedBookings);
                      showAlert(
                        "success",
                        "Recording Session Updated",
                        `Added time slot for ${new Date(`${bookingDate}T00:00:00`).toLocaleDateString()}. Total selected time: ${totalHours.toFixed(1)}h (minimum required: ${requiredTotalHours.toFixed(1)}h).`,
                      );
                    } else {
                      const existingPrice = existingBooking.pricing?.final_price || 0;
                      const newPrice = finalPricing?.final_price || 0;
                      const totalHours = (existingBooking.pricing?.hours || 0) + (finalPricing?.hours || 0);

                      updatedBookings[existingBookingIndex] = {
                        ...existingBooking,
                        timeSlots: mergedSlots,
                        pricing: {
                          ...finalPricing,
                          final_price: existingPrice + newPrice,
                          hours: totalHours,
                        },
                      };
                      setBookings(updatedBookings);
                      showAlert(
                        "success",
                        "Session Added",
                        `Added time slot to your booking for ${new Date(`${bookingDate}T00:00:00`).toLocaleDateString()}. You now have ${mergedSlots.length} slot(s) for this day.`,
                      );
                    }
                  } else {
                    if (isRecordingMode) {
                      const songCount = recordingSongCount || 1;
                      const totalHours = getSlotDurationHours(startTime, endTime2);
                      const requiredTotalHours = songCount * recordingMinHoursPerSong;

                      setBookings([
                        ...bookings,
                        {
                          date: new Date(date),
                          startTime: new Date(date),
                          endTime: new Date(endTime),
                          timeSlots: [currentSlot],
                          songCount,
                          pricing: {
                            ...(finalPricing || {}),
                            hours: totalHours,
                            total_hours: totalHours,
                            modifiers: {
                              ...(finalPricing?.modifiers || {}),
                              min_hours_per_song: recordingMinHoursPerSong,
                              required_total_hours: requiredTotalHours,
                              selected_total_hours: totalHours,
                              recording_session: {
                                ...(finalPricing?.modifiers?.recording_session || {}),
                                min_hours_per_song: recordingMinHoursPerSong,
                                required_total_hours: requiredTotalHours,
                                selected_total_hours: totalHours,
                              },
                            },
                          },
                        },
                      ]);
                    } else {
                      setBookings([
                        ...bookings,
                        {
                          date: new Date(date),
                          startTime: new Date(date),
                          endTime: new Date(endTime),
                          timeSlots: [currentSlot],
                          pricing: finalPricing,
                        },
                      ]);
                    }
                  }

                  setShowAddBooking(false);
                  setSelectedTimeSlots([]);
                  setDate(null as any);
                  setEndTime(null as any);
                  setSelectedSlot(null);
                } catch (e: any) {
                  console.error("Error adding booking:", e);
                  showAlert("error", "Error", "An error occurred. Please try again.");
                } finally {
                  setIsCheckingAvailability(false);
                }
              }
            }}
          >
            {isCheckingAvailability ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons
                  name={isRecordingMode ? "mic-outline" : "add-circle-outline"}
                  size={20}
                  color={colors.primary}
                />
                <Text style={[styles.secondaryBtnText, { color: colors.primary, marginLeft: 8 }]}>
                  {bookings.length > 0
                    ? isRecordingMode
                      ? "Add Recording Session"
                      : "Add Session"
                    : isRecordingMode
                      ? "Add Recording Slot"
                      : "Add Booking"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : !(hasExistingStudioBooking && existingStudioBookingStatus === "unpaid") ? (
        <TouchableOpacity activeOpacity={1}
          style={[
            styles.secondaryBtn,
            {
              borderColor: showPaymentOptionModal ? colors.border : colors.primary,
              backgroundColor: "transparent",
              marginBottom: 16,
              opacity: showPaymentOptionModal ? 0.5 : 1,
            },
          ]}
          disabled={showPaymentOptionModal}
          onPress={() => setShowAddBooking(true)}
        >
          <Ionicons
            name={isRecordingMode ? "mic-outline" : "add-circle-outline"}
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.secondaryBtnText, { color: colors.primary, marginLeft: 8 }]}>
            {isRecordingMode ? "Add Another Recording Session" : "Add Another Session"}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Notes (Optional)</Text>
        <View
          style={[
            styles.inputWrapper,
            { backgroundColor: isDark ? "#374151" : "#F9FAFB", height: 80 },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.text, height: "100%" }]}
            placeholder="Tell us about your sessions..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            value={bookingNotes}
            onChangeText={setBookingNotes}
          />
        </View>
      </View>

      {bookings.length > 0 && !(hasExistingStudioBooking && existingStudioBookingStatus === "unpaid") && (
        <View
          style={[
            styles.paymentSummary,
            { backgroundColor: isDark ? "#1F2937" : "#F9FAFB" },
          ]}
        >
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textSecondary }}>Rate</Text>
            <Text style={{ color: colors.text }}>
              {usesRecordingWholeDayMode ? `₱${displayRate} / song` : `₱${displayRate} / hr`}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textSecondary }}>Total Sessions</Text>
            <Text style={{ color: colors.text }}>{String(bookings.length)}</Text>
          </View>
          <View style={[styles.divider, { marginVertical: 12 }]} />
          <View style={styles.summaryRow}>
            <Text
              style={{
                color: colors.text,
                fontFamily: "Poppins_600SemiBold",
              }}
            >
              Total
            </Text>
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Poppins_600SemiBold",
                fontSize: 18,
              }}
            >
              ₱{totalBookingsCost.toLocaleString()}
            </Text>
          </View>
        </View>
      )}

      {!(hasExistingStudioBooking && existingStudioBookingStatus === "unpaid") && (
        <>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: bookings.length > 0 ? colors.primary : colors.border,
                opacity: loading ? 0.6 : 1,
              },
            ]}
            disabled={bookings.length === 0 || loading}
            activeOpacity={1}
            onPress={() =>
              bookings.length > 0 &&
              handleConfirm(
                async () => {
                  try {
                    await logAuthDiagnostics("before-confirm");
                    const auth = await getFreshBookingAuth();

                    if (!auth) {
                      try {
                        await supabase.auth.signOut({ scope: "local" });
                      } catch {
                        // no-op
                      }
                      showAlert("warning", "Session Expired", "Please sign in again to continue booking.");
                      router.replace("/");
                      return;
                    }

                    const bookingUserId = auth.userId;
                    const bookingAccessToken = auth.accessToken;

                    setLoading(true);
                    const results = [];
                    const errors = [];

                    debugLog("🛒 Total bookings to create:", bookings.length);
                    debugLog("📋 Bookings array:", bookings);

                    for (const booking of bookings) {
                      const bookingDate = toDateKey(booking.date) || toDateKey(booking.startTime);

                      if (!bookingDate) {
                        errors.push({
                          booking,
                          error: { message: "Invalid booking date. Please reselect your schedule.", serverError: null },
                        });
                        continue;
                      }

                      const timeSlots =
                        booking.timeSlots && booking.timeSlots.length > 0
                          ? booking.timeSlots
                          : [
                            {
                              start: toTimeLabel(booking.startTime),
                              end: toTimeLabel(booking.endTime),
                            },
                          ];

                      const sessionType =
                        usesRecordingWholeDayMode ? "recording" : "rehearsal";
                      const bookingSongCount =
                        sessionType === "recording"
                          ? parsePositiveInteger(
                            booking.songCount ??
                              booking.pricing?.modifiers?.recording_session?.song_count ??
                              booking.pricing?.modifiers?.song_count,
                          )
                          : null;

                      if (sessionType === "recording" && !bookingSongCount) {
                        errors.push({
                          booking,
                          error: {
                            message: "Recording bookings require a valid song count.",
                            serverError: null,
                          },
                        });
                        continue;
                      }

                      debugLog("📤 Creating multi-slot booking:", {
                        studio_id: group.id,
                        user_id: bookingUserId,
                        date: bookingDate,
                        time_slots: timeSlots,
                        notes: bookingNotes,
                        session_type: sessionType,
                        song_count: bookingSongCount,
                      });

                      let data: any = null;
                      let error: any = null;

                      try {
                        const normalizedSlots = [...timeSlots]
                          .map((slot) => ({
                            start: String(slot.start || "").slice(0, 5),
                            end: String(slot.end || "").slice(0, 5),
                          }))
                          .filter((slot) => slot.start && slot.end);

                        if (normalizedSlots.length === 0) {
                          throw new Error("At least one valid time slot is required.");
                        }

                        const sortedByStart = [...normalizedSlots].sort((a, b) =>
                          a.start.localeCompare(b.start),
                        );

                        const leadTimeViolationMessage = getLeadTimeViolationMessage(
                          bookingDate,
                          sortedByStart,
                        );
                        if (leadTimeViolationMessage) {
                          warnLog("⚠️ Lead-time validation blocked booking before submit", {
                            bookingDate,
                            slots: sortedByStart,
                            leadTimeHours: getStudioLeadTimeHours(),
                          });
                          errors.push({
                            booking,
                            error: {
                              message: leadTimeViolationMessage,
                              serverError: null,
                            },
                          });
                          continue;
                        }

                        if (sessionType === "recording" && bookingSongCount) {
                          const totalSelectedHours = getTotalSlotDurationHours(sortedByStart);
                          const requiredHours =
                            bookingSongCount * recordingMinHoursPerSong;

                          if (totalSelectedHours + 1e-9 < requiredHours) {
                            errors.push({
                              booking,
                              error: {
                                message: `Recording booking requires at least ${requiredHours.toFixed(1)} hour(s) for ${bookingSongCount} song(s), but only ${totalSelectedHours.toFixed(1)} hour(s) are selected.`,
                                serverError: null,
                              },
                            });
                            continue;
                          }
                        }

                        debugLog("📡 Invoking manage-bookings:create", {
                          bookingDate,
                          studioId: group.id,
                          userId: bookingUserId,
                          slots: sortedByStart,
                        });

                        const invokeResult = await invokeManageBookingsCreate({
                          action: "create",
                          studio_id: group.id,
                          user_id: bookingUserId,
                          date: bookingDate,
                          time_slots: sortedByStart,
                          notes: bookingNotes || null,
                          session_type: sessionType,
                          song_count: sessionType === "recording" ? bookingSongCount : null,
                        }, bookingAccessToken);

                        data = invokeResult.data;
                        error = invokeResult.error;

                        if (
                          !error &&
                          data &&
                          typeof data === "object" &&
                          (data.error || data.success === false)
                        ) {
                          error = {
                            name: "FunctionsHttpError",
                            message:
                              data.error ||
                              data.message ||
                              "Booking request failed. Please try again.",
                            status: typeof data.status === "number" ? data.status : 400,
                            serverError: data,
                          };
                        }
                      } catch (localBookingError: any) {
                        error = localBookingError;
                      }

                      debugLog("📥 Booking response:", { data, error });

                      if (error) {
                        let errorMessage = error.message || "Unknown error";
                        let serverError: any = null;

                        if (error?.serverError && typeof error.serverError === "object") {
                          serverError = error.serverError;
                          if (serverError?.error) {
                            errorMessage = serverError.error;
                          }
                        }

                        let shouldLogAsError = !isExpectedBookingValidationError(
                          Number(error?.status),
                          errorMessage,
                        );

                        if (shouldLogAsError) {
                          console.error("❌ Booking invoke error details:", {
                            name: error?.name,
                            message: error?.message,
                            status: error?.status,
                            code: error?.code,
                            details: error?.details,
                            hint: error?.hint,
                            hasContext: Boolean(error?.context),
                            contextType: error?.context?.constructor?.name || null,
                          });
                        } else {
                          warnLog("⚠️ Booking validation rejected by server", {
                            status: error?.status,
                            message: errorMessage,
                          });
                        }

                        if (!serverError && error.context && typeof error.context === "object") {
                          try {
                            const response = error.context;
                            debugLog("📥 Error response status:", response.status);
                            debugLog("📥 Error response (raw):", response);

                            if (response?.headers && typeof response.headers?.entries === "function") {
                              const responseHeaders = Object.fromEntries(response.headers.entries());
                              debugLog("📥 Error response headers:", responseHeaders);
                            }

                            if (response.json && typeof response.json === "function") {
                              serverError = await response.json();
                              debugLog("📥 Parsed server error:", serverError);
                              if (serverError?.error) {
                                errorMessage = serverError.error;
                              }
                              if (serverError?.debug) {
                                debugLog("📥 Debug info:", serverError.debug);
                              }
                            } else if (response.text && typeof response.text === "function") {
                              const textBody = await response.text();
                              debugLog("📥 Error body (text):", textBody);
                              try {
                                serverError = JSON.parse(textBody);
                                if (serverError?.error) {
                                  errorMessage = serverError.error;
                                }
                              } catch (e) {
                                if (typeof textBody === "string" && textBody.trim().length > 0) {
                                  errorMessage = textBody.trim();
                                }
                                debugLog("📥 Could not parse as JSON");
                              }
                            }
                          } catch (e) {
                            console.error("Failed to parse error response:", e);
                          }
                        }

                        shouldLogAsError = !isExpectedBookingValidationError(
                          Number(error?.status),
                          errorMessage,
                        );

                        errors.push({
                          booking,
                          error: { message: errorMessage, serverError },
                        });
                        if (shouldLogAsError) {
                          console.error("❌ Booking error:", errorMessage);
                        } else {
                          warnLog("⚠️ Booking blocked:", errorMessage);
                        }
                        if (serverError && shouldLogAsError) {
                          console.error("❌ Full server error:", JSON.stringify(serverError, null, 2));
                        }

                        if (
                          String(errorMessage).toLowerCase().includes("invalid jwt") ||
                          error?.status === 401 ||
                          serverError?.message === "Invalid JWT"
                        ) {
                          await logAuthDiagnostics("after-401-invalid-jwt");
                        }
                      } else {
                        results.push(data);
                        debugLog("✅ Booking created successfully");
                      }
                    }

                    setLoading(false);

                    if (errors.length > 0 && results.length === 0) {
                      let errorMsg = errors[0].error?.message || "Failed to create bookings";
                      const normalizedErrorMsg = String(errorMsg).toLowerCase();

                      if (errorMsg.includes("no_overlapping_bookings") || errorMsg.includes("exclusion constraint")) {
                        errorMsg =
                          "This time slot was just booked by someone else. Please select a different time slot or refresh and try again.";
                      }

                      if (normalizedErrorMsg.includes("advance booking")) {
                        showAlert("warning", "Advance Booking Required", errorMsg);
                      } else if (
                        normalizedErrorMsg.includes("cannot create a booking in the past") ||
                        normalizedErrorMsg.includes("bookings can only be made up to")
                      ) {
                        showAlert("warning", "Invalid Booking Date", errorMsg);
                      } else if (
                        normalizedErrorMsg.includes("time slot") ||
                        normalizedErrorMsg.includes("outside operating hours")
                      ) {
                        showAlert("warning", "Time Slot Unavailable", errorMsg);
                      } else {
                        showAlert("error", "Booking Error", errorMsg);
                      }
                    } else if (errors.length > 0) {
                      showAlert("warning", "Partial Success", `${results.length} booking(s) created successfully, but ${errors.length} failed. Please check the Bookings page.`);
                      setBookings([]);
                      setSelectedTimeSlots([]);
                      setBookingNotes("");
                      setModalVisible(false);
                      (sheetRef as any)?.current?.dismiss();
                    } else {
                      if (group && group.embedding && bookingUserId) {
                        try {
                          await supabase.rpc("update_user_interest", {
                            p_user_id: bookingUserId,
                            p_item_vector: group.embedding,
                            p_weight: 0.5,
                          });
                          debugLog("🤖 AI learned from studio booking:", group.name);
                        } catch (e) {
                          debugLog("Error updating AI interest from booking:", e);
                        }
                      }

                      debugLog("✅ All bookings created, showing payment options...");

                      const firstBooking = results[0];

                      if (firstBooking?.id) {
                        setPaymentBookingData({
                          booking: firstBooking,
                          studioName: group.name,
                          totalAmount:
                            firstBooking.payment_amount ||
                            firstBooking.final_price ||
                            totalBookingsCost,
                        });
                        setSelectedPaymentType("full");
                        setShowPaymentOptionModal(true);
                      } else {
                        showAlert("success", "Booking Created", `Successfully created ${results.length} booking(s)! Please complete payment to confirm.`);
                        setBookings([]);
                        setSelectedTimeSlots([]);
                        setBookingNotes("");
                        setModalVisible(false);
                        (sheetRef as any)?.current?.dismiss();

                        setTimeout(() => {
                          router.push({ pathname: "/bookings", params: { tab: "Pending" } } as any);
                        }, 100);
                      }
                    }
                  } catch (e: any) {
                    setLoading(false);
                    console.error("Booking creation error:", e);
                    showAlert("error", "Unexpected Error", "An unexpected error occurred. Please try again.");
                  }
                },
                isRecordingMode ? "Confirm Recording Booking" : "Confirm Session Booking",
                isRecordingMode
                  ? `Book ${bookings.length} recording session(s) at ${group.name}\nTotal: ₱${totalBookingsCost.toLocaleString()}\n\nRecording uses time slots and is priced per song. Minimum selected hours must meet songs × ${recordingMinHoursPerSong}. The studio owner will review and approve your booking request.`
                  : `Book ${bookings.length} session(s) at ${group.name}\nTotal: ₱${totalBookingsCost.toLocaleString()}\n\nThe studio owner will review and approve your booking request.`,
                { requireTerms: true },
              )
            }
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.primaryBtnText,
                  {
                    color: bookings.length > 0 ? "#FFFFFF" : colors.textSecondary,
                  },
                ]}
              >
                {bookings.length > 0
                  ? isRecordingMode
                    ? `Book ${bookings.length} Recording Session${bookings.length > 1 ? "s" : ""}`
                    : `Book ${bookings.length} Session${bookings.length > 1 ? "s" : ""}`
                  : isRecordingMode
                    ? "Add at least one recording session"
                    : "Add at least one session"}
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

export default StudioBookTab;

