export type SessionType = "Rehearsal" | "Recording" | null;
export type CanonicalStudioType = "Rehearsal" | "Recording" | "Both" | null;

export interface TimeSlot {
  start: string;
  end: string;
  sessionType?: ScheduleSessionType;
  session_type?: ScheduleSessionType;
  reason?: string | null;
}

export interface DaySchedule {
  day: string;
  slots: TimeSlot[];
  isOverride?: boolean;
  sessionType?: ScheduleSessionType;
  session_type?: ScheduleSessionType;
  reason?: string | null;
}

export interface DateOverride {
  override_date: string;
  is_open: boolean;
  open_time?: string | null;
  close_time?: string | null;
  slot_order?: number | null;
  sessionType?: ScheduleSessionType;
  session_type?: ScheduleSessionType;
  reason?: string | null;
}

export interface CartBooking {
  date: Date;
  startTime: Date;
  endTime: Date;
  timeSlots?: TimeSlot[];
}

export interface BuildMarkedDatesParams {
  availability: DaySchedule[];
  dbBookings: any[];
  dateOverrides?: DateOverride[];
  cartBookings?: CartBooking[];
  leadTimeHours?: number;
  studioType?: string | null;
  selectedSessionType?: SessionType;
  primaryColor: string;
  isDark: boolean;
}

export interface BuildAvailableSlotsParams {
  dateStr: string;
  availability: DaySchedule[];
  dateOverrides?: DateOverride[];
  existingBookings: any[];
  cartBookings: CartBooking[];
  selectedTimeSlots: TimeSlot[];
  leadTimeHours?: number;
  studioType?: string | null;
  selectedSessionType?: SessionType;
}

export interface BuildAvailableSlotsResult {
  availableSlots: string[];
  isRecordingWholeDayAvailable: boolean;
  recordingDaySlot: TimeSlot | null;
}

const DISABLED_TEXT_DARK = "#4B5563";
const DISABLED_TEXT_LIGHT = "#D1D5DB";
const OVERRIDE_DOT = "#F59E0B";
type ScheduleSessionType = "rehearsal" | "recording" | "both";

const toDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const isRecordingStudioMode = (
  studioType?: string | null,
  selectedSessionType?: SessionType,
) => {
  const normalizedStudioType = normalizeStudioType(studioType);
  return (
    normalizedStudioType === "Recording" ||
    (normalizedStudioType === "Both" && selectedSessionType === "Recording")
  );
};

export const normalizeStudioType = (
  studioType?: string | null,
): CanonicalStudioType => {
  if (typeof studioType !== "string") {
    return null;
  }

  const normalized = studioType.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const hasRehearsal = normalized.includes("rehearsal");
  const hasRecording = normalized.includes("recording");

  if (
    normalized === "both" ||
    normalized === "rehearsal & recording" ||
    normalized === "rehearsal and recording" ||
    (hasRehearsal && hasRecording)
  ) {
    return "Both";
  }

  if (normalized === "rehearsal" || hasRehearsal) {
    return "Rehearsal";
  }

  if (normalized === "recording" || hasRecording) {
    return "Recording";
  }

  return null;
};

const getDotColor = (isOverride: boolean | undefined, primaryColor: string) =>
  isOverride ? OVERRIDE_DOT : primaryColor;

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
  selectedSessionType?: SessionType,
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
  selectedSessionType?: SessionType,
) => {
  const requestedSessionType = getRequestedScheduleSessionType(
    studioType,
    selectedSessionType,
  );
  if (!requestedSessionType) return true;

  const scheduleSessionType = getScheduleSessionType(schedule);
  return scheduleSessionType === "both" || scheduleSessionType === requestedSessionType;
};

const buildAvailabilityMap = (availability: DaySchedule[]) => {
  const dayIndexes = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  const availabilityMap: Record<number, DaySchedule> = {};

  availability.forEach((daySchedule) => {
    const dayIndex = dayIndexes.indexOf(daySchedule.day.toLowerCase());
    if (dayIndex !== -1) {
      availabilityMap[dayIndex] = daySchedule;
    }
  });

  return availabilityMap;
};

const buildDateOverrideMap = (dateOverrides?: DateOverride[]) => {
  const dateOverrideMap: Record<string, DateOverride[]> = {};

  if (!Array.isArray(dateOverrides)) {
    return dateOverrideMap;
  }

  dateOverrides.forEach((override) => {
    if (!dateOverrideMap[override.override_date]) {
      dateOverrideMap[override.override_date] = [];
    }
    dateOverrideMap[override.override_date].push(override);
  });

  return dateOverrideMap;
};

const resolveDaySchedule = (
  dateStr: string,
  date: Date,
  availabilityMap: Record<number, DaySchedule>,
  dateOverrideMap: Record<string, DateOverride[]>,
  studioType?: string | null,
  selectedSessionType?: SessionType,
): DaySchedule | null => {
  const dateOverrides = dateOverrideMap[dateStr];

  if (dateOverrides) {
    const openOverrides = dateOverrides
      .filter((override) => override.is_open && override.open_time && override.close_time)
      .filter((override) =>
        scheduleAllowsRequestedSession(override, studioType, selectedSessionType),
      )
      .sort((a: any, b: any) => {
        const orderDiff = Number(a?.slot_order ?? 0) - Number(b?.slot_order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a?.open_time || "").localeCompare(String(b?.open_time || ""));
      });

    if (openOverrides.length > 0) {
      return {
        day: date.toLocaleDateString("en-US", { weekday: "long" }),
        slots: openOverrides.map((override) => ({
          start: override.open_time as string,
          end: override.close_time as string,
          sessionType: getScheduleSessionType(override),
        })),
        isOverride: true,
      };
    }

    return null;
  }

  const weeklySchedule = availabilityMap[date.getDay()];
  if (!weeklySchedule) return null;

  const sessionAllowedSlots = (weeklySchedule.slots || []).filter((slot) =>
    scheduleAllowsRequestedSession(
      {
        ...slot,
        sessionType: slot?.sessionType ?? slot?.session_type ?? weeklySchedule?.sessionType ?? weeklySchedule?.session_type,
        reason: slot?.reason ?? weeklySchedule?.reason,
      },
      studioType,
      selectedSessionType,
    ),
  );

  if (sessionAllowedSlots.length === 0) return null;

  return {
    ...weeklySchedule,
    slots: sessionAllowedSlots,
  };
};

const getBlockedTimeStringsFromDbBookings = (dayBookings: any[]) => {
  const blockedTimes = new Set<string>();

  dayBookings.forEach((booking) => {
    const bookingStart = new Date(`${booking.booking_date}T${booking.start_time}`);
    const bookingEnd = new Date(`${booking.booking_date}T${booking.end_time}`);

    if (isNaN(bookingStart.getTime()) || isNaN(bookingEnd.getTime())) {
      return;
    }

    const current = new Date(bookingStart);
    while (current < bookingEnd) {
      blockedTimes.add(current.toTimeString().slice(0, 5));
      current.setHours(current.getHours() + 1);
    }
  });

  return blockedTimes;
};

const blockTimesFromCartBookings = (
  blockedTimes: Set<string>,
  cartBookingsForDate: CartBooking[],
  dateStr: string,
) => {
  cartBookingsForDate.forEach((booking) => {
    if (booking.timeSlots && booking.timeSlots.length > 0) {
      booking.timeSlots.forEach((slot) => {
        const slotStart = new Date(`${dateStr}T${slot.start}`);
        const slotEnd = new Date(`${dateStr}T${slot.end}`);
        const current = new Date(slotStart);
        while (current < slotEnd) {
          blockedTimes.add(current.toTimeString().slice(0, 5));
          current.setHours(current.getHours() + 1);
        }
      });
      return;
    }

    const current = new Date(booking.startTime);
    while (current < booking.endTime) {
      blockedTimes.add(current.toTimeString().slice(0, 5));
      current.setHours(current.getHours() + 1);
    }
  });
};

const getCartBookingsForDate = (cartBookings: CartBooking[] | undefined, dateStr: string) =>
  (cartBookings || []).filter((booking) => {
    const cartDateStr = booking.date.toISOString().split("T")[0];
    return cartDateStr === dateStr;
  });

export const buildMarkedDates = ({
  availability,
  dbBookings,
  dateOverrides,
  cartBookings,
  leadTimeHours = 0,
  studioType,
  selectedSessionType,
  primaryColor,
  isDark,
}: BuildMarkedDatesParams) => {
  const marked: Record<string, any> = {};
  const safeDbBookings = Array.isArray(dbBookings) ? dbBookings : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const minBookingTime = new Date();
  minBookingTime.setHours(minBookingTime.getHours() + leadTimeHours);

  const availabilityMap = buildAvailabilityMap(availability || []);
  const dateOverrideMap = buildDateOverrideMap(dateOverrides);
  const isRecordingStudio = isRecordingStudioMode(studioType, selectedSessionType);

  for (let i = 0; i < 90; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = toDateString(date);

    const daySchedule = resolveDaySchedule(
      dateStr,
      date,
      availabilityMap,
      dateOverrideMap,
      studioType,
      selectedSessionType,
    );

    if (!daySchedule || !daySchedule.slots || daySchedule.slots.length === 0) {
      marked[dateStr] = {
        disabled: true,
        disableTouchEvent: true,
        textColor: isDark ? DISABLED_TEXT_DARK : DISABLED_TEXT_LIGHT,
      };
      continue;
    }

    const potentialSlots: string[] = [];
    daySchedule.slots.forEach((slot) => {
      const start = new Date(`${dateStr}T${slot.start}`);
      const end = new Date(`${dateStr}T${slot.end}`);
      const current = new Date(start);

      while (current < end) {
        if (current >= minBookingTime) {
          potentialSlots.push(current.toTimeString().slice(0, 5));
        }
        current.setHours(current.getHours() + 1);
      }
    });

    if (potentialSlots.length === 0) {
      marked[dateStr] = {
        disabled: true,
        disableTouchEvent: true,
        textColor: isDark ? DISABLED_TEXT_DARK : DISABLED_TEXT_LIGHT,
      };
      continue;
    }

    const dayDbBookings = safeDbBookings.filter((booking) => {
      if (booking.status === "cancelled" || booking.status === "rejected") return false;
      return booking.booking_date === dateStr;
    });

    const cartBookingsForDate = getCartBookingsForDate(cartBookings, dateStr);

    if (isRecordingStudio) {
      if (dayDbBookings.length > 0 || cartBookingsForDate.length > 0) {
        marked[dateStr] = {
          disabled: true,
          disableTouchEvent: true,
          textColor: isDark ? DISABLED_TEXT_DARK : DISABLED_TEXT_LIGHT,
        };
      } else {
        marked[dateStr] = {
          marked: true,
          dotColor: getDotColor(daySchedule.isOverride, primaryColor),
        };
      }
      continue;
    }

    const blockedTimes = getBlockedTimeStringsFromDbBookings(dayDbBookings);
    blockTimesFromCartBookings(blockedTimes, cartBookingsForDate, dateStr);

    const availableCount = potentialSlots.filter((slot) => !blockedTimes.has(slot)).length;

    marked[dateStr] =
      availableCount > 0
        ? {
            marked: true,
            dotColor: getDotColor(daySchedule.isOverride, primaryColor),
          }
        : {
            disabled: true,
            disableTouchEvent: true,
            textColor: isDark ? DISABLED_TEXT_DARK : DISABLED_TEXT_LIGHT,
          };
  }

  return marked;
};

export const buildAvailableSlots = ({
  dateStr,
  availability,
  dateOverrides,
  existingBookings,
  cartBookings,
  selectedTimeSlots,
  leadTimeHours = 0,
  studioType,
  selectedSessionType,
}: BuildAvailableSlotsParams): BuildAvailableSlotsResult => {
  if (!availability || availability.length === 0) {
    return {
      availableSlots: [],
      isRecordingWholeDayAvailable: false,
      recordingDaySlot: null,
    };
  }

  const selectedDate = new Date(dateStr);
  const availabilityMap = buildAvailabilityMap(availability || []);
  const dateOverrideMap = buildDateOverrideMap(dateOverrides);
  const daySchedule = resolveDaySchedule(
    dateStr,
    selectedDate,
    availabilityMap,
    dateOverrideMap,
    studioType,
    selectedSessionType,
  );

  if (!daySchedule || !daySchedule.slots) {
    return {
      availableSlots: [],
      isRecordingWholeDayAvailable: false,
      recordingDaySlot: null,
    };
  }

  const safeExistingBookings = Array.isArray(existingBookings) ? existingBookings : [];
  const dayBookings = safeExistingBookings.filter((booking) => {
    if (booking.status === "cancelled" || booking.status === "rejected") return false;
    return booking.booking_date === dateStr;
  });

  const isRecordingStudio = isRecordingStudioMode(studioType, selectedSessionType);
  const cartBookingsForDate = getCartBookingsForDate(cartBookings, dateStr);

  if (isRecordingStudio) {
    if (dayBookings.length > 0 || cartBookingsForDate.length > 0) {
      return {
        availableSlots: [],
        isRecordingWholeDayAvailable: false,
        recordingDaySlot: null,
      };
    }

    const operatingSlot = daySchedule.slots[0];
    return {
      availableSlots: ["whole-day"],
      isRecordingWholeDayAvailable: true,
      recordingDaySlot: {
        start: operatingSlot.start,
        end: operatingSlot.end,
      },
    };
  }

  const blockedTimes = getBlockedTimeStringsFromDbBookings(dayBookings);
  blockTimesFromCartBookings(blockedTimes, cartBookingsForDate, dateStr);

  selectedTimeSlots.forEach((slot) => {
    const slotStart = new Date(`${dateStr}T${slot.start}`);
    const slotEnd = new Date(`${dateStr}T${slot.end}`);
    const current = new Date(slotStart);
    while (current < slotEnd) {
      blockedTimes.add(current.toTimeString().slice(0, 5));
      current.setHours(current.getHours() + 1);
    }
  });

  const minBookingTime = new Date();
  minBookingTime.setHours(minBookingTime.getHours() + leadTimeHours);

  const slotsSet = new Set<string>();
  daySchedule.slots.forEach((slot) => {
    const start = new Date(`${dateStr}T${slot.start}`);
    const end = new Date(`${dateStr}T${slot.end}`);
    const current = new Date(start);

    while (current < end) {
      const timeStr = current.toTimeString().slice(0, 5);
      const slotDateTime = new Date(`${dateStr}T${timeStr}`);
      const passesLeadTime = slotDateTime >= minBookingTime;

      if (!blockedTimes.has(timeStr) && passesLeadTime) {
        slotsSet.add(timeStr);
      }

      current.setHours(current.getHours() + 1);
    }
  });

  return {
    availableSlots: Array.from(slotsSet).sort(),
    isRecordingWholeDayAvailable: false,
    recordingDaySlot: null,
  };
};
