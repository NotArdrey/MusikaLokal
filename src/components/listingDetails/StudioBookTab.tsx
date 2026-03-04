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
  showAlert,
}: StudioBookTabProps) => {
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
    try {
      responseData = await response.clone().json();
    } catch {
      responseData = null;
    }

    if (!response.ok) {
      const httpError: any = new Error("Edge Function returned a non-2xx status code");
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

      {bookings.length > 0 && (
        <View style={[styles.section, { marginBottom: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Bookings ({bookings.length})</Text>
          {bookings.map((booking, index) => {
            const start = new Date(booking.startTime).getTime();
            const end = new Date(booking.endTime).getTime();
            let hours = (end - start) / (1000 * 60 * 60);
            if (hours < 0) hours += 24;

            const cost = booking.pricing?.final_price || parseInt(displayRate.replace(/,/g, "")) * hours;
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
                      ({booking.pricing?.hours?.toFixed(1) || hours.toFixed(1)}h total)
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
                        <Text style={{ color: colors.primary, fontSize: 10 }}>Promo Applied</Text>
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

          {isRecordingMode ? (
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                {
                  borderColor: !isRecordingWholeDayAvailable ? colors.border : colors.primary,
                  backgroundColor: "transparent",
                  marginBottom: 16,
                  opacity: !isRecordingWholeDayAvailable || isCheckingAvailability ? 0.5 : 1,
                },
              ]}
              disabled={!isRecordingWholeDayAvailable || isCheckingAvailability}
              activeOpacity={1}
              onPress={async () => {
                if (selectedDate && recordingDaySlot) {
                  setIsCheckingAvailability(true);
                  try {
                    const bookingDate = selectedDate;
                    const startTime = recordingDaySlot.start;
                    const endTimeStr = recordingDaySlot.end;

                    const existingBookingIndex = bookings.findIndex(
                      (b) => toDateKey(b.date) === bookingDate,
                    );

                    if (existingBookingIndex >= 0) {
                      showAlert("warning", "Booking Exists", "You already have a booking for this date.");
                      setIsCheckingAvailability(false);
                      return;
                    }

                    const { data: isAvailable, error: availError } = await supabase.rpc("is_slot_available", {
                      p_studio_id: group.id,
                      p_booking_date: bookingDate,
                      p_start_time: startTime,
                      p_end_time: endTimeStr,
                      p_user_id: userId,
                    });

                    if (availError) {
                      console.error("Availability check error:", availError);
                      showAlert("error", "Availability Check Failed", "Failed to check availability. Please try again.");
                      setIsCheckingAvailability(false);
                      return;
                    }

                    if (!isAvailable) {
                      showAlert("warning", "Date Unavailable", "This date is not available for booking.");
                      setIsCheckingAvailability(false);
                      return;
                    }

                    const { data: pricing, error: pricingError } = await supabase.rpc("calculate_booking_price", {
                      p_studio_id: group.id,
                      p_booking_date: bookingDate,
                      p_start_time: startTime,
                      p_end_time: endTimeStr,
                    });

                    if (pricingError || !pricing || pricing.length === 0) {
                      console.error("Pricing error:", pricingError);
                      showAlert("error", "Pricing Error", "Failed to calculate price. Please try again.");
                      setIsCheckingAvailability(false);
                      return;
                    }

                    const startDate = new Date(`${bookingDate}T${startTime}`);
                    const endDate = new Date(`${bookingDate}T${endTimeStr}`);

                    setBookings([
                      ...bookings,
                      {
                        date: new Date(`${bookingDate}T00:00:00`),
                        startTime: startDate,
                        endTime: endDate,
                        timeSlots: [{ start: startTime, end: endTimeStr }],
                        pricing: pricing[0],
                      },
                    ]);

                    setShowAddBooking(false);
                    setSelectedDate("");
                    setIsRecordingWholeDayAvailable(false);
                    setRecordingDaySlot(null);
                  } catch (e: any) {
                    console.error("Error adding recording booking:", e);
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
                  <Ionicons name="mic-outline" size={20} color={colors.primary} />
                  <Text style={[styles.secondaryBtnText, { color: colors.primary, marginLeft: 8 }]}>
                    {bookings.length > 0 ? "Add Recording Day" : "Book Recording Session"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <>
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

                        const existingPrice = existingBooking.pricing?.final_price || 0;
                        const newPrice = pricing[0]?.final_price || 0;
                        const totalHours = (existingBooking.pricing?.hours || 0) + (pricing[0]?.hours || 0);

                        const updatedBookings = [...bookings];
                        updatedBookings[existingBookingIndex] = {
                          ...existingBooking,
                          timeSlots: mergedSlots,
                          pricing: {
                            ...pricing[0],
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
                      } else {
                        setBookings([
                          ...bookings,
                          {
                            date: new Date(date),
                            startTime: new Date(date),
                            endTime: new Date(endTime),
                            timeSlots: [currentSlot],
                            pricing: pricing[0],
                          },
                        ]);
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
                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    <Text style={[styles.secondaryBtnText, { color: colors.primary, marginLeft: 8 }]}>
                      {bookings.length > 0 ? "Add Session" : "Add Booking"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
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
            {isRecordingMode ? "Add Another Recording Day" : "Add Another Session"}
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
            <Text style={{ color: colors.text }}>{`₱${displayRate} / hr`}</Text>
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
          <TouchableOpacity activeOpacity={1}
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
                        group.studio_type === "Recording"
                          ? "recording"
                          : group.studio_type === "Both" && selectedSessionType === "Recording"
                            ? "recording"
                            : "rehearsal";

                      debugLog("📤 Creating multi-slot booking:", {
                        studio_id: group.id,
                        user_id: bookingUserId,
                        date: bookingDate,
                        time_slots: timeSlots,
                        notes: bookingNotes,
                        session_type: sessionType,
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
                        }, bookingAccessToken);

                        data = invokeResult.data;
                        error = invokeResult.error;
                      } catch (localBookingError: any) {
                        error = localBookingError;
                      }

                      debugLog("📥 Booking response:", { data, error });

                      if (error) {
                        let errorMessage = error.message || "Unknown error";
                        let serverError: any = null;

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

                        if (error.context && typeof error.context === "object") {
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
                                debugLog("📥 Could not parse as JSON");
                              }
                            }
                          } catch (e) {
                            console.error("Failed to parse error response:", e);
                          }
                        }

                        errors.push({
                          booking,
                          error: { message: errorMessage, serverError },
                        });
                        console.error("❌ Booking error:", errorMessage);
                        if (serverError) {
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

                      if (errorMsg.includes("no_overlapping_bookings") || errorMsg.includes("exclusion constraint")) {
                        errorMsg =
                          "This time slot was just booked by someone else. Please select a different time slot or refresh and try again.";
                      }

                      showAlert("error", "Booking Error", errorMsg);
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
                  ? `Book ${bookings.length} recording session(s) at ${group.name}\nTotal: ₱${totalBookingsCost.toLocaleString()}\n\nRecording sessions occupy the full day. The studio owner will review and approve your booking request.`
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
                    ? `Book ${bookings.length} Recording Date${bookings.length > 1 ? "s" : ""}`
                    : `Book ${bookings.length} Session${bookings.length > 1 ? "s" : ""}`
                  : isRecordingMode
                    ? "Select a recording date"
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

