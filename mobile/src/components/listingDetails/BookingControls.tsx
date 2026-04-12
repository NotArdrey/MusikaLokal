import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Calendar } from "react-native-calendars";
import styles from "../ListingDetailsSheet.styles";
import { normalizeStudioType } from "./availability";

interface BookingControlsProps {
  colors: any;
  isDark: boolean;
  group: any;
  selectedSessionType: "Rehearsal" | "Recording" | null;
  setSelectedSessionType: (value: "Rehearsal" | "Recording") => void;
  setSelectedDate: (value: string) => void;
  setSelectedSlot: (value: string | null) => void;
  setValidEndTimes: (value: string[]) => void;
  setIsRecordingWholeDayAvailable: (value: boolean) => void;
  setRecordingDaySlot: (value: { start: string; end: string } | null) => void;
  isRecordingMode: boolean;
  duration: number;
  markedDates: any;
  selectedDate: string;
  fetchAvailableSlots: (dateStr: string) => Promise<string[]>;
  setEndTime: (value: any) => void;
  setDate: (value: any) => void;
  availableSlots: string[];
  selectedSlot: string | null;
  validEndTimes: string[];
  date: Date | null;
  endTime: Date | null;
  recordingDaySlot: { start: string; end: string } | null;
  isRecordingWholeDayAvailable: boolean;
  displayRate: string;
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

const BookingControls = ({
  colors,
  isDark,
  group,
  selectedSessionType,
  setSelectedSessionType,
  setSelectedDate,
  setSelectedSlot,
  setValidEndTimes,
  setIsRecordingWholeDayAvailable,
  setRecordingDaySlot,
  isRecordingMode,
  duration,
  markedDates,
  selectedDate,
  fetchAvailableSlots,
  setEndTime,
  setDate,
  availableSlots,
  selectedSlot,
  validEndTimes,
  date,
  endTime,
  recordingDaySlot,
  isRecordingWholeDayAvailable,
  displayRate,
}: BookingControlsProps) => {
  const leadTimeHours = group?.settings?.lead_time_hours || 0;
  const now = new Date();
  const minLeadDateTime = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
  const minSelectableDate = toLocalDateKey(minLeadDateTime);
  const normalizedStudioType = normalizeStudioType(group?.studio_type);
  const supportsSessionTypeSelection = normalizedStudioType === "Both";
  const hasSelectedSessionType = Boolean(selectedSessionType);

  const handleAutoFillTestData = async () => {
    if (supportsSessionTypeSelection && !selectedSessionType) {
      setSelectedSessionType("Rehearsal");
    }

    const candidateDates = Object.keys(markedDates || {})
      .filter(
        (dateKey) =>
          dateKey >= minSelectableDate && !markedDates?.[dateKey]?.disabled,
      )
      .sort();

    if (!candidateDates.includes(minSelectableDate)) {
      candidateDates.unshift(minSelectableDate);
    }

    let chosenDate: string | null = null;
    let chosenSlots: string[] = [];

    for (const dateKey of candidateDates.slice(0, 21)) {
      const slots = await fetchAvailableSlots(dateKey);
      if (Array.isArray(slots) && slots.length > 0) {
        chosenDate = dateKey;
        chosenSlots = slots;
        break;
      }
    }

    if (!chosenDate) return;

    setSelectedDate(chosenDate);
    setSelectedSlot(null);
    setValidEndTimes([]);
    setEndTime(null);
    setDate(new Date(chosenDate));

    if (isRecordingMode) {
      return;
    }

    const firstSlot = chosenSlots[0];
    if (!firstSlot) return;

    setSelectedSlot(firstSlot);

    const [hours, minutes] = firstSlot.split(":");
    const startDate = new Date(chosenDate);
    startDate.setHours(parseInt(hours, 10), parseInt(minutes, 10));
    setDate(startDate);

    const availableHours = new Set(
      chosenSlots.map((slot) => parseInt(slot.split(":")[0], 10)),
    );

    let maxDuration = 0;
    let currentHour = parseInt(hours, 10);

    for (let index = 0; index < 12; index += 1) {
      if (index > 0 && !availableHours.has(currentHour)) break;
      maxDuration += 1;
      currentHour += 1;
      if (currentHour >= 24) break;
    }

    const durations: string[] = [];
    for (let durationValue = 1; durationValue <= maxDuration; durationValue += 1) {
      durations.push(durationValue.toString());
    }

    setValidEndTimes(durations);

    if (maxDuration > 0) {
      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + 1);
      setEndTime(endDate);
    }
  };

  return (
    <View
      style={[
        styles.bookingContainer,
        {
          backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 16,
          overflow: "hidden",
          padding: 16,
          marginBottom: 24,
        },
      ]}
    >
      {supportsSessionTypeSelection && (
        <View style={{ marginBottom: 16 }}>
          <Text
            style={[
              styles.label,
              { color: colors.textSecondary, marginBottom: 8 },
            ]}
          >
            What would you like to book?
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity activeOpacity={1}
              style={[
                {
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor:
                    selectedSessionType === "Rehearsal"
                      ? colors.primary
                      : colors.border,
                  backgroundColor:
                    selectedSessionType === "Rehearsal"
                      ? isDark
                        ? "rgba(124, 58, 237, 0.15)"
                        : "rgba(124, 58, 237, 0.08)"
                      : "transparent",
                },
              ]}
              onPress={() => {
                setSelectedSessionType("Rehearsal");
                setSelectedDate("");
                setSelectedSlot(null);
                setValidEndTimes([]);
                setIsRecordingWholeDayAvailable(false);
                setRecordingDaySlot(null);
              }}
            >
              <Ionicons
                name="musical-notes"
                size={20}
                color={
                  selectedSessionType === "Rehearsal"
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={{
                  fontFamily:
                    selectedSessionType === "Rehearsal"
                      ? "Poppins_600SemiBold"
                      : "Poppins_500Medium",
                  color:
                    selectedSessionType === "Rehearsal"
                      ? colors.primary
                      : colors.text,
                  marginLeft: 8,
                  fontSize: 14,
                }}
              >
                Rehearsal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={1}
              style={[
                {
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor:
                    selectedSessionType === "Recording"
                      ? colors.primary
                      : colors.border,
                  backgroundColor:
                    selectedSessionType === "Recording"
                      ? isDark
                        ? "rgba(124, 58, 237, 0.15)"
                        : "rgba(124, 58, 237, 0.08)"
                      : "transparent",
                },
              ]}
              onPress={() => {
                setSelectedSessionType("Recording");
                setSelectedDate("");
                setSelectedSlot(null);
                setValidEndTimes([]);
                setIsRecordingWholeDayAvailable(false);
                setRecordingDaySlot(null);
              }}
            >
              <Ionicons
                name="mic"
                size={20}
                color={
                  selectedSessionType === "Recording"
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={{
                  fontFamily:
                    selectedSessionType === "Recording"
                      ? "Poppins_600SemiBold"
                      : "Poppins_500Medium",
                  color:
                    selectedSessionType === "Recording"
                      ? colors.primary
                      : colors.text,
                  marginLeft: 8,
                  fontSize: 14,
                }}
              >
                Recording
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.text, fontSize: 16, marginBottom: 0 },
          ]}
        >
          {!hasSelectedSessionType && supportsSessionTypeSelection
            ? "Choose Session Type"
            : isRecordingMode
              ? "Select Recording Date"
              : "Select Date & Time"}
        </Text>
        {isRecordingMode ? (
          <View
            style={[
              styles.durationBadge,
              {
                backgroundColor: isDark
                  ? "rgba(124, 58, 237, 0.15)"
                  : "rgba(124, 58, 237, 0.1)",
              },
            ]}
          >
            <Ionicons name="mic" size={14} color={colors.primary} />
            <Text
              style={{
                fontFamily: "Poppins_600SemiBold",
                color: colors.primary,
                marginLeft: 4,
                fontSize: 12,
              }}
            >
              Whole Day
            </Text>
          </View>
        ) : duration > 0 ? (
          <View
            style={[
              styles.durationBadge,
              {
                backgroundColor: isDark
                  ? "rgba(124, 58, 237, 0.15)"
                  : "rgba(124, 58, 237, 0.1)",
              },
            ]}
          >
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Text
              style={{
                fontFamily: "Poppins_600SemiBold",
                color: colors.primary,
                marginLeft: 4,
                fontSize: 12,
              }}
            >
              {`${duration}h Session`}
            </Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity activeOpacity={1}
        onPress={handleAutoFillTestData}
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: isDark ? "rgba(59, 130, 246, 0.16)" : "#DBEAFE",
          borderWidth: 1,
          borderColor: isDark ? "rgba(96, 165, 250, 0.5)" : "#93C5FD",
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 8,
          marginBottom: 12,
          gap: 8,
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

      {supportsSessionTypeSelection && !hasSelectedSessionType ? (
        <View style={{ marginTop: 4 }}>
          <View
            style={{
              backgroundColor: isDark ? "rgba(59, 130, 246, 0.15)" : "#EFF6FF",
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 14,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Ionicons name="information-circle" size={18} color="#2563EB" />
              <Text
                style={{
                  color: isDark ? "#BFDBFE" : "#1E40AF",
                  fontSize: 13,
                  fontFamily: "Poppins_600SemiBold",
                  marginLeft: 6,
                }}
              >
                Please choose a session type above
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                <Ionicons name="musical-notes" size={14} color={isDark ? "#93C5FD" : "#3B82F6"} style={{ marginTop: 2 }} />
                <Text
                  style={{
                    color: isDark ? "#D1D5DB" : "#4B5563",
                    fontSize: 12,
                    fontFamily: "Poppins_400Regular",
                    flex: 1,
                  }}
                >
                  <Text style={{ fontFamily: "Poppins_600SemiBold" }}>Rehearsal</Text> — Book by the hour, pick your time slots
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                <Ionicons name="mic" size={14} color={isDark ? "#93C5FD" : "#3B82F6"} style={{ marginTop: 2 }} />
                <Text
                  style={{
                    color: isDark ? "#D1D5DB" : "#4B5563",
                    fontSize: 12,
                    fontFamily: "Poppins_400Regular",
                    flex: 1,
                  }}
                >
                  <Text style={{ fontFamily: "Poppins_600SemiBold" }}>Recording</Text> — Whole-day booking for uninterrupted sessions
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <>
          {group?.settings?.lead_time_hours && group.settings.lead_time_hours > 0 && (
            <View
              style={{
                backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#FEF3C7",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                marginBottom: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="time" size={16} color="#F59E0B" />
              <Text
                style={{
                  color: "#D97706",
                  fontSize: 12,
                  fontFamily: "Poppins_500Medium",
                  flex: 1,
                }}
              >
                Advance booking required: {group.settings.lead_time_hours} hours before
                session
              </Text>
            </View>
          )}

          <Calendar
            current={toLocalDateKey(new Date())}
            minDate={minSelectableDate}
            markedDates={{
              ...markedDates,
              [selectedDate]: {
                selected: true,
                selectedColor: colors.primary,
                selectedTextColor: "#FFFFFF",
                customStyles: {
                  container: {
                    backgroundColor: colors.primary,
                    elevation: 2,
                  },
                  text: {
                    fontWeight: "bold",
                  },
                },
              },
            }}
            onDayPress={async (day) => {
              if (day.dateString < minSelectableDate) {
                return;
              }

              if (markedDates[day.dateString]?.disabled) {
                return;
              }

              const slots = await fetchAvailableSlots(day.dateString);
              if (!slots || slots.length === 0) {
                return;
              }

              setSelectedDate(day.dateString);
              setSelectedSlot(null);
              setValidEndTimes([]);
              setEndTime(null);
              const selectedDateObj = new Date(day.dateString);
              setDate(selectedDateObj);
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
            enableSwipeMonths={true}
            style={{
              marginBottom: selectedDate ? 16 : 0,
            }}
          />
        </>
      )}

      {selectedDate && (!supportsSessionTypeSelection || hasSelectedSessionType) && (
        <View
          style={[
            styles.slotGridContainer,
            {
              borderTopWidth: 1,
              borderTopColor: isDark ? "#374151" : "#F3F4F6",
              paddingTop: 16,
            },
          ]}
        >
          {isRecordingMode ? (
            <View>
              <Text
                style={{
                  fontFamily: "Poppins_500Medium",
                  color: colors.textSecondary,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                Recording Session for{" "}
                {new Date(selectedDate).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Text>

              {isRecordingWholeDayAvailable && recordingDaySlot ? (
                <View>
                  <View
                    style={{
                      backgroundColor: isDark
                        ? "rgba(124, 58, 237, 0.1)"
                        : "rgba(124, 58, 237, 0.08)",
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 2,
                      borderColor: colors.primary,
                      marginBottom: 16,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                      <Ionicons name="calendar" size={20} color={colors.primary} />
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          fontSize: 16,
                          color: colors.primary,
                          marginLeft: 8,
                        }}
                      >
                        Whole Day Recording Session
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: "Poppins_400Regular",
                        fontSize: 13,
                        color: colors.textSecondary,
                        marginBottom: 8,
                      }}
                    >
                      Recording studios are booked for the entire day to ensure uninterrupted sessions.
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="time-outline" size={16} color={colors.text} />
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          fontSize: 14,
                          color: colors.text,
                        }}
                      >
                        {formatTime12(recordingDaySlot.start)} - {formatTime12(recordingDaySlot.end)}
                      </Text>
                    </View>
                  </View>

                  {(() => {
                    const startParts = recordingDaySlot.start.split(":").map(Number);
                    const endParts = recordingDaySlot.end.split(":").map(Number);
                    const startMinutes = startParts[0] * 60 + startParts[1];
                    const endMinutes = endParts[0] * 60 + endParts[1];
                    const durationHours = (endMinutes - startMinutes) / 60;
                    const rate = parseInt(displayRate.replace(/,/g, "")) || 0;

                    return (
                      <View
                        style={{
                          backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 16,
                        }}
                      >
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular" }}>Duration</Text>
                          <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>{durationHours} hours</Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular" }}>Rate</Text>
                          <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>₱{displayRate}/song</Text>
                        </View>
                        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold" }}>Minimum (1 song)</Text>
                          <Text style={{ color: colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 16 }}>
                            ₱{rate.toLocaleString()}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontFamily: "Poppins_400Regular",
                            fontSize: 11,
                            marginTop: 8,
                          }}
                        >
                          Final total depends on the number of songs you enter below.
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <Ionicons
                    name="calendar-outline"
                    size={32}
                    color={colors.textSecondary}
                    style={{ marginBottom: 8 }}
                  />
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_500Medium",
                      fontSize: 14,
                      textAlign: "center",
                    }}
                  >
                    This date is not available
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_400Regular",
                      fontSize: 12,
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    Recording studios require the full day. This date already has bookings.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View>
              <Text
                style={{
                  fontFamily: "Poppins_500Medium",
                  color: colors.textSecondary,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                Available Slots for{" "}
                {new Date(selectedDate).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Text>

              {availableSlots.length > 0 ? (
                <View>
                  {(() => {
                    const grouped = {
                      Morning: [] as string[],
                      Afternoon: [] as string[],
                      Evening: [] as string[],
                    };
                    availableSlots.forEach((slot) => {
                      const hour = parseInt(slot.split(":")[0]);
                      if (hour < 12) grouped.Morning.push(slot);
                      else if (hour < 18) grouped.Afternoon.push(slot);
                      else grouped.Evening.push(slot);
                    });

                    return (Object.keys(grouped) as Array<keyof typeof grouped>).map(
                      (period) => {
                        if (grouped[period].length === 0) return null;
                        return (
                          <View key={period} style={{ marginBottom: 16 }}>
                            <Text
                              style={{
                                fontFamily: "Poppins_600SemiBold",
                                color: colors.textSecondary,
                                fontSize: 12,
                                marginBottom: 8,
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                              }}
                            >
                              {period}
                            </Text>
                            <View style={styles.slotGrid}>
                              {grouped[period].map((slot) => {
                                const isSelected = selectedSlot === slot;
                                const slotHour = parseInt(slot.split(":")[0]);
                                const startHour = selectedSlot
                                  ? parseInt(selectedSlot.split(":")[0])
                                  : -1;
                                const endHour = endTime ? endTime.getHours() : -1;
                                const isInRange =
                                  selectedSlot && endTime && slotHour >= startHour && slotHour < endHour;

                                return (
                                  <TouchableOpacity activeOpacity={1}
                                    key={slot}
                                    style={[
                                      styles.slotButton,
                                      {
                                        backgroundColor: isSelected
                                          ? isDark
                                            ? "rgba(124, 58, 237, 0.15)"
                                            : "rgba(124, 58, 237, 0.1)"
                                          : isInRange
                                            ? isDark
                                              ? "rgba(124, 58, 237, 0.05)"
                                              : "rgba(124, 58, 237, 0.05)"
                                            : isDark
                                              ? "#374151"
                                              : "#F3F4F6",
                                        borderColor: isSelected ? colors.primary : "transparent",
                                        borderWidth: isSelected ? 2 : 0,
                                      },
                                    ]}
                                    onPress={() => {
                                      setSelectedSlot(slot);
                                      const [hours, minutes] = slot.split(":");
                                      const startDate = new Date(selectedDate);
                                      startDate.setHours(parseInt(hours), parseInt(minutes));
                                      setDate(startDate);

                                      const availableHours = new Set(
                                        availableSlots.map((s) => parseInt(s.split(":")[0])),
                                      );
                                      let maxDur = 0;
                                      let currentH = parseInt(hours);

                                      for (let i = 0; i < 12; i++) {
                                        if (i > 0 && !availableHours.has(currentH)) break;
                                        maxDur++;
                                        currentH++;
                                        if (currentH >= 24) break;
                                      }

                                      const validDurs: string[] = [];
                                      for (let i = 1; i <= maxDur; i++) validDurs.push(i.toString());
                                      setValidEndTimes(validDurs);

                                      if (maxDur >= 1) {
                                        const newEndDate = new Date(startDate);
                                        newEndDate.setHours(startDate.getHours() + 1);
                                        setEndTime(newEndDate);
                                      }
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: isSelected ? colors.primary : colors.text,
                                        fontFamily: isSelected
                                          ? "Poppins_600SemiBold"
                                          : "Poppins_500Medium",
                                        fontSize: 13,
                                      }}
                                    >
                                      {formatTime12(slot)}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        );
                      },
                    );
                  })()}
                </View>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_400Regular",
                      fontSize: 13,
                    }}
                  >
                    No available slots for this date.
                  </Text>
                </View>
              )}

              {selectedSlot && validEndTimes.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text
                    style={{
                      fontFamily: "Poppins_500Medium",
                      color: colors.textSecondary,
                      fontSize: 13,
                      marginBottom: 12,
                    }}
                  >
                    Duration
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {validEndTimes.map((durStr) => {
                      const dur = parseInt(durStr);
                      let currentDur = 0;
                      if (date && endTime && date.getTime && endTime.getTime) {
                        currentDur =
                          (endTime.getTime() - date.getTime()) / (1000 * 60 * 60);
                      }
                      const isSelected = Math.abs(currentDur - dur) < 0.1;

                      return (
                        <TouchableOpacity activeOpacity={1}
                          key={durStr}
                          style={[
                            {
                              paddingHorizontal: 16,
                              paddingVertical: 8,
                              borderRadius: 100,
                              backgroundColor: isSelected
                                ? colors.primary
                                : isDark
                                  ? "#374151"
                                  : "#F3F4F6",
                            },
                          ]}
                          onPress={() => {
                            if (date) {
                              const newEnd = new Date(date);
                              newEnd.setHours(newEnd.getHours() + dur);
                              setEndTime(newEnd);
                            }
                          }}
                        >
                          <Text
                            style={{
                              color: isSelected ? "#FFFFFF" : colors.text,
                              fontFamily: isSelected
                                ? "Poppins_600SemiBold"
                                : "Poppins_500Medium",
                              fontSize: 13,
                            }}
                          >
                            {`${dur} hr${dur > 1 ? "s" : ""}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default BookingControls;
