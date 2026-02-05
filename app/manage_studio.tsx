import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal as RNModal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { useTheme } from "../src/context/ThemeContext";

import { useLocalSearchParams } from "expo-router";

export default function StudioDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams(); // Get Studio ID
  const [activeTab, setActiveTab] = useState("About");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalButtonText, setModalButtonText] = useState("");
  const [modalAction, setModalAction] = useState<() => Promise<void> | void>(
    () => { },
  );
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  // Calendar View State
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState("");

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [studio, setStudio] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // State for partial slot approval
  const [selectedBookingForPartial, setSelectedBookingForPartial] =
    useState<any>(null);
  const [selectedSlots, setSelectedSlots] = useState<{
    [key: number]: "accept" | "decline" | null;
  }>({});
  const [partialModalVisible, setPartialModalVisible] = useState(false);

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

      if (profile?.role !== "studio-owner") {
        Alert.alert("Unauthorized", "Only studio owners can access this page.");
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

      console.log(`[manage_studio] Fetching data for studioId: ${studioId}, userId: ${userId}`);

      // Direct query to studios table
      const { data: studioData, error: studioError } = await supabase
        .from('studios')
        .select('*')
        .eq('id', studioId)
        .eq('owner_id', userId)
        .single();

      if (studioError) {
        console.error('[manage_studio] Failed to fetch studio details:', studioError);
        if (studioError.message?.includes("non-2xx")) {
          console.error('[manage_studio] Full error object:', JSON.stringify(studioError));
        }
        throw studioError;
      }
      setStudio(studioData);

      // Fetch Bookings
      try {
        const { data: bookingData, error: bookingError } =
          await supabase.functions.invoke("bookings-manage", {
            body: { action: "fetch_studio_bookings", studioId: studioId, userId },
          });
        if (bookingError) {
          console.error('[manage_studio] Failed to fetch bookings:', bookingError);
        } else {
          setBookings(bookingData || []);
        }
      } catch (bookingErr) {
        console.error('[manage_studio] Exception fetching bookings:', bookingErr);
      }

      // Direct query to reviews table
      try {
        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select('*, reviewer:profiles!reviews_reviewer_id_fkey(id, full_name, avatar_url)')
          .eq('entity_type', 'studio')
          .eq('entity_id', studioId)
          .order('created_at', { ascending: false });
        if (reviewError) {
          console.error('[manage_studio] Failed to fetch reviews:', reviewError);
        } else {
          setReviews(reviewData || []);
        }
      } catch (reviewErr) {
        console.error('[manage_studio] Exception fetching reviews:', reviewErr);
      }

    } catch (e: any) {
      console.error("[manage_studio] Critical error fetching data:", e);
      let errorMsg = "Failed to load studio data";
      if (e.message?.includes("non-2xx")) {
        errorMsg += `\n\nServer Error (500). Please check edge function logs.`;
      }
      Alert.alert("Error", errorMsg);
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
    setModalAction(() => async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.functions.invoke("bookings-manage", {
          body: {
            action: "update_booking_status",
            bookingId,
            status,
            userId: user.id,
            cancellation_reason: isDecline ? cancellationReason : undefined,
          },
        });
        if (error) throw error;

        // Update local state
        setBookings(
          bookings.map((b) => (b.id === bookingId ? { ...b, status } : b)),
        );
        setModalVisible(false);
        setShowReasonInput(false);
        setCancellationReason("");
      } catch (e) {
        console.log("Error updating booking:", e);
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
        const { error } = await supabase.functions.invoke("bookings-manage", {
          body: {
            action: "update_booking_status",
            bookingId: booking.id,
            status: "confirmed",
            userId: user.id,
          },
        });
        if (error) throw error;
        setBookings(
          bookings.map((b) =>
            b.id === booking.id ? { ...b, status: "confirmed" } : b,
          ),
        );
      }
      // If all slots are declined, just cancel the booking
      else if (declinedSlots.length === slots.length) {
        const { error } = await supabase.functions.invoke("bookings-manage", {
          body: {
            action: "update_booking_status",
            bookingId: booking.id,
            status: "cancelled",
            userId: user.id,
            cancellation_reason:
              "All requested time slots were declined by the studio owner.",
          },
        });
        if (error) throw error;
        setBookings(
          bookings.map((b) =>
            b.id === booking.id ? { ...b, status: "cancelled" } : b,
          ),
        );
      }
      // Partial approval - need to handle specially
      else {
        const { error } = await supabase.functions.invoke("bookings-manage", {
          body: {
            action: "partial_slot_approval",
            bookingId: booking.id,
            userId: user.id,
            acceptedSlots: acceptedSlots,
            declinedSlots: declinedSlots,
            cancellation_reason:
              declinedSlots.length > 0
                ? "Some time slots were declined by the studio owner."
                : undefined,
          },
        });
        if (error) throw error;

        // Refresh the bookings list
        if (user.id) fetchData(user.id);
      }

      setPartialModalVisible(false);
      setSelectedBookingForPartial(null);
      setSelectedSlots({});
      Alert.alert("Success", "Booking updated successfully!");
    } catch (e) {
      console.log("Error with partial approval:", e);
      Alert.alert("Error", "Failed to update booking status");
    }
  };

  const tabs = ["About", "Setup", "Bookings", "Review"];

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
          contentContainerStyle={styles.scrollContent}
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
              <View style={styles.headerImageGradient} />
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {studio?.name || "Loading..."}
            </Text>
            <Text
              style={[styles.headerLocation, { color: colors.textSecondary }]}
            >
              {studio?.address || "Location N/A"}
            </Text>
          </View>

          {/* Segmented Control Tabs */}
          <View
            style={[
              styles.tabsContainer,
              { backgroundColor: colors.inputBackground },
            ]}
          >
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tab,
                  {
                    backgroundColor:
                      activeTab === tab ? colors.surface : "transparent",
                    shadowColor: "#000",
                    shadowOffset: {
                      width: 0,
                      height: activeTab === tab ? 2 : 0,
                    },
                    shadowOpacity: activeTab === tab ? 0.05 : 0,
                    shadowRadius: 4,
                    elevation: activeTab === tab ? 2 : 0,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      fontFamily:
                        activeTab === tab
                          ? "Poppins_600SemiBold"
                          : "Poppins_500Medium",
                      color:
                        activeTab === tab
                          ? colors.primary
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.contentContainer}>
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
                      {studio?.type || "N/A"}
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
                      Rehearsal Rate
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      ₱{(studio?.rehearsal_rate || 0).toLocaleString()}/hr
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
                      Recording Rate
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      ₱{(studio?.recording_rate || 0).toLocaleString()}/song
                    </Text>
                  </View>
                </View>

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
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const supported = await Linking.canOpenURL(
                            studio.contract_url,
                          );
                          if (supported) {
                            await Linking.openURL(studio.contract_url);
                          } else {
                            Alert.alert(
                              "Error",
                              "Unable to open contract document",
                            );
                          }
                        } catch (error) {
                          Alert.alert(
                            "Error",
                            "Failed to open contract document",
                          );
                        }
                      }}
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
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: "/edit_studio",
                            params: { id: studio?.id },
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
                  <View style={styles.tagsContainer}>
                    {studio?.instruments?.length ? (
                      studio.instruments.map((item: any, i: number) => {
                        const name = item?.name || item;
                        const quantity = item?.quantity
                          ? ` ×${item.quantity}`
                          : "";
                        return (
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
                            <Text
                              style={[styles.tagText, { color: colors.text }]}
                            >{`${name}${quantity}`}</Text>
                          </View>
                        );
                      })
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
                                  `${formatTime(slot.start)} - ${formatTime(slot.end)}`,
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
                      {studio.calendar_availability.map(
                        (entry: any, i: number) => (
                          <View key={i} style={{ marginBottom: 8 }}>
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                color: colors.text,
                              }}
                            >
                              {new Date(entry.date).toLocaleDateString()}
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
                                      `${formatTime(slot.start)} - ${formatTime(slot.end)}`,
                                  )
                                  .join(", ")
                                : "No slots"}
                            </Text>
                          </View>
                        ),
                      )}
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
                                `${new Date(d.start).toLocaleDateString()} - ${new Date(d.end).toLocaleDateString()}`,
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
                                `${new Date(d.start).toLocaleDateString()} - ${new Date(d.end).toLocaleDateString()}`,
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

                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/edit_studio",
                      params: { id: studio?.id },
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
                    <TouchableOpacity
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
                    <TouchableOpacity
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
                        markedDates={{
                          ...bookings.reduce((acc, booking) => {
                            const dateStr =
                              booking.raw_date ||
                              booking.booking_date ||
                              new Date(booking.start_time)
                                .toISOString()
                                .split("T")[0];
                            acc[dateStr] = {
                              marked: true,
                              dotColor: colors.primary,
                            };
                            return acc;
                          }, {}),
                          [selectedDate]: {
                            selected: true,
                            selectedColor: colors.primary,
                            selectedTextColor: "#FFFFFF",
                          },
                        }}
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
                        {bookings.filter(
                          (b) =>
                            (b.raw_date ||
                              b.booking_date ||
                              new Date(b.start_time)
                                .toISOString()
                                .split("T")[0]) === selectedDate,
                        ).length > 0 ? (
                          <View style={styles.tagsContainer}>
                            {bookings
                              .filter(
                                (b) =>
                                  (b.raw_date ||
                                    b.booking_date ||
                                    new Date(b.start_time)
                                      .toISOString()
                                      .split("T")[0]) === selectedDate,
                              )
                              .sort((a, b) => {
                                const aTime = a.start_time.includes(":")
                                  ? a.start_time
                                  : new Date(a.start_time)
                                    .toTimeString()
                                    .slice(0, 5);
                                const bTime = b.start_time.includes(":")
                                  ? b.start_time
                                  : new Date(b.start_time)
                                    .toTimeString()
                                    .slice(0, 5);
                                return aTime.localeCompare(bTime);
                              })
                              .map((booking, index) => (
                                <TouchableOpacity
                                  key={booking.id}
                                  style={[
                                    styles.bookingCard,
                                    {
                                      backgroundColor: isDark
                                        ? "#1F2937"
                                        : "#F9FAFB",
                                      borderColor:
                                        booking.status === "confirmed"
                                          ? colors.primary
                                          : colors.border,
                                      borderWidth:
                                        booking.status === "confirmed" ? 2 : 1, // Gold/Neon border for confirmed
                                      width: "100%",
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      marginBottom: 8,
                                    },
                                  ]}
                                >
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 12,
                                    }}
                                  >
                                    <View
                                      style={[
                                        styles.timeSlotChip,
                                        {
                                          backgroundColor: colors.primary,
                                          borderWidth: 0,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          color: "#FFF",
                                          fontSize: 12,
                                          fontFamily: "Poppins_600SemiBold",
                                        }}
                                      >
                                        {booking.start_time &&
                                          booking.start_time.includes(":")
                                          ? (() => {
                                            const [hours, minutes] =
                                              booking.start_time.split(":");
                                            const h = parseInt(hours);
                                            const period =
                                              h >= 12 ? "PM" : "AM";
                                            const h12 = h % 12 || 12;
                                            return `${h12}:${minutes} ${period}`;
                                          })()
                                          : new Date(
                                            booking.start_time,
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          })}
                                      </Text>
                                    </View>
                                    <View>
                                      <Text
                                        style={{
                                          fontFamily: "Poppins_600SemiBold",
                                          color: colors.text,
                                        }}
                                      >
                                        {booking.user?.full_name ||
                                          "Generous Patron"}
                                      </Text>
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          color: colors.textSecondary,
                                        }}
                                      >
                                        {booking.status}
                                      </Text>
                                    </View>
                                  </View>
                                  {booking.status === "confirmed" && (
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={20}
                                      color={colors.primary}
                                    />
                                  )}
                                </TouchableOpacity>
                              ))}
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
                    bookings.map((booking) => (
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
                              {booking.status}
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
                            {booking.raw_date
                              ? new Date(booking.raw_date).toLocaleDateString()
                              : booking.booking_date
                                ? new Date(
                                  booking.booking_date,
                                ).toLocaleDateString()
                                : new Date(
                                  booking.start_time,
                                ).toLocaleDateString()}
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
                                <TouchableOpacity
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
                              <TouchableOpacity
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
                              <TouchableOpacity
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
                        {new Date(review.created_at).toLocaleDateString()}
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
                      {review.comment}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        <Navbar />
      </View>
      <Modal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setShowReasonInput(false);
          setCancellationReason("");
        }}
        onConfirm={modalAction}
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
        showInput={showReasonInput}
        onInputChange={setCancellationReason}
      />

      {/* Partial Approval Modal for Multi-Slot Bookings */}
      <RNModal
        visible={partialModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setPartialModalVisible(false);
          setSelectedBookingForPartial(null);
          setSelectedSlots({});
        }}
      >
        <View style={styles.partialModalOverlay}>
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
              <TouchableOpacity
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
                      <TouchableOpacity
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
                      <TouchableOpacity
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

            <TouchableOpacity
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
        </View>
      </RNModal>
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
    paddingBottom: 150,
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
  headerImageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
    // Approximate gradient with transparent black
    backgroundColor: "rgba(0,0,0,0.4)",
    top: 100, // cheat to make it look like bottom gradient
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
  tabsContainer: {
    marginHorizontal: 24,
    marginTop: 24,
    padding: 4,
    borderRadius: 16,
    flexDirection: "row",
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
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addGearText: {
    fontFamily: "Poppins_600SemiBold",
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
  },
});
