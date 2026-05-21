import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/src/legacy";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    BackHandler,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import ConflictResolutionModal, {
    ConflictingBooking,
    ConflictResolution,
} from "../src/components/ConflictResolutionModal";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { useTheme } from "../src/context/ThemeContext";
import { buildNotificationRouteMeta } from "../src/utils/notificationNavigation";
import { formatDashedNumericDate } from "../src/utils/friendlyDateTime";
import { invalidateListingCaches } from "../src/utils/listingCacheInvalidation";
import { clearListingDetailsCache } from "../src/utils/listingDetailsCache";
import {
    getDefaultStudioDateOverrideSlot,
    getStudioAvailabilityMinDateKey,
    getStudioDateOverrideLeadTimeError,
    isStudioDateOverrideDateSelectable,
} from "../src/utils/studioAvailabilityLeadTime";
import { sanitizeStorageFileName, uploadStorageObject } from "../src/utils/storageUpload";

// Decode base64 to Uint8Array without using fetch().arrayBuffer() which crashes on Android New Architecture
const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const b64 = base64.replace(/=/g, "");
  const bufLen = Math.floor(b64.length * 0.75);
  const bytes = new Uint8Array(bufLen);
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const e1 = lookup[b64.charCodeAt(i)];
    const e2 = lookup[b64.charCodeAt(i + 1)];
    const e3 = lookup[b64.charCodeAt(i + 2)];
    const e4 = lookup[b64.charCodeAt(i + 3)];
    if (p < bufLen) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufLen) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
};

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

const formatSupabaseError = (error: any): string => {
  const parts = [
    error?.message,
    error?.details ? `Details: ${error.details}` : null,
    error?.hint ? `Hint: ${error.hint}` : null,
    error?.code ? `Code: ${error.code}` : null,
  ].filter(Boolean);

  return parts.join("\n") || "Unknown error";
};

const logActionError = (
  context: string,
  error: any,
  extra?: Record<string, unknown>,
) => {
  console.error(`[${context}]`, {
    message: error?.message || String(error),
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    extra,
  });
};

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

const resolveStudioTypeRows = (value: unknown): ("Rehearsal" | "Recording")[] => {
  if (typeof value === "string" && value.trim().toLowerCase() === "both") {
    return ["Rehearsal", "Recording"];
  }

  const singleType = canonicalizeStudioType(value);
  return singleType ? [singleType] : [];
};

const normalizeStudioTypeColumnValue = (
  value: unknown,
): "Rehearsal" | "Recording" | "Both" | null => {
  if (typeof value === "string" && value.trim().toLowerCase() === "both") {
    return "Both";
  }

  return canonicalizeStudioType(value);
};

const parsePositiveInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parsePositiveDecimal = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const isMissingStudioInstrumentDetailColumns = (error: any): boolean => {
  const haystack = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("pgrst204") ||
    (haystack.includes("studio_instruments") &&
      (haystack.includes("quantity") || haystack.includes("description")) &&
      (haystack.includes("schema cache") ||
        haystack.includes("could not find") ||
        haystack.includes("column")))
  );
};

const isMissingWeeklyScheduleColumns = (error: any): boolean => {
  const haystack = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("weekly_schedule_") &&
    (haystack.includes("pgrst204") ||
      haystack.includes("schema cache") ||
      haystack.includes("could not find") ||
      haystack.includes("column"))
  );
};

const stripWeeklyScheduleColumns = (row: any) => {
  const {
    weekly_schedule_scope,
    weekly_schedule_end_date,
    weekly_schedule_dates,
    ...rest
  } = row;
  return rest;
};

const buildStudioInstrumentRows = (
  studioId: string,
  instruments: any[] = [],
  includeDetailColumns = true,
) =>
  instruments.map((item: any) => {
    const baseRow: any = {
      studio_id: studioId,
      instrument_name: item.name,
      image_url: item.image || null,
    };

    if (includeDetailColumns) {
      baseRow.quantity = item.quantity || null;
      baseRow.description = item.description || null;
    }

    return baseRow;
  });

const insertStudioInstrumentRows = async (
  studioId: string,
  instruments: any[] = [],
) => {
  if (instruments.length === 0) return null;

  const { error } = await supabase
    .from("studio_instruments")
    .insert(buildStudioInstrumentRows(studioId, instruments, true));

  if (!error || !isMissingStudioInstrumentDetailColumns(error)) {
    return error;
  }

  const { error: fallbackError } = await supabase
    .from("studio_instruments")
    .insert(buildStudioInstrumentRows(studioId, instruments, false));

  return fallbackError;
};

const PROMOTION_CRITERIA_PREFIX = "How to get promo:";
const PROMOTION_MIN_HOURS_PREFIX = "Minimum booking hours:";
const PROMOTION_MIN_SPEND_PREFIX = "Minimum spend:";

const parsePromotionDescription = (value: unknown) => {
  const raw = typeof value === "string" ? value : "";
  if (!raw.trim()) {
    return {
      description: "",
      criteria: "",
      minimum_booking_hours: "",
      minimum_spend: "",
    };
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const remaining: string[] = [];
  let criteria = "";
  let minimum_booking_hours = "";
  let minimum_spend = "";

  lines.forEach((line) => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.startsWith(PROMOTION_CRITERIA_PREFIX.toLowerCase())) {
      criteria = line.slice(PROMOTION_CRITERIA_PREFIX.length).trim();
      return;
    }
    if (lowerLine.startsWith(PROMOTION_MIN_HOURS_PREFIX.toLowerCase())) {
      minimum_booking_hours = line.slice(PROMOTION_MIN_HOURS_PREFIX.length).trim();
      return;
    }
    if (lowerLine.startsWith(PROMOTION_MIN_SPEND_PREFIX.toLowerCase())) {
      minimum_spend = line.slice(PROMOTION_MIN_SPEND_PREFIX.length).trim();
      return;
    }
    remaining.push(line);
  });

  return {
    description: remaining.join("\n"),
    criteria,
    minimum_booking_hours,
    minimum_spend,
  };
};

const buildPromotionDescription = (
  description: string,
): string => {
  return description.trim();
};

const getAllowedPromotionTargets = (
  type: "Rehearsal" | "Recording" | "Both",
): ("rehearsal" | "recording" | "both")[] => {
  if (type === "Rehearsal") return ["rehearsal"];
  if (type === "Recording") return ["recording"];
  return ["both", "rehearsal", "recording"];
};

const normalizePromotionTarget = (
  target: "rehearsal" | "recording" | "both",
  type: "Rehearsal" | "Recording" | "Both",
): "rehearsal" | "recording" | "both" => {
  const allowedTargets = getAllowedPromotionTargets(type);
  if (allowedTargets.includes(target)) return target;
  return type === "Rehearsal"
    ? "rehearsal"
    : type === "Recording"
      ? "recording"
      : "both";
};

type DateOverrideSessionType = "rehearsal" | "recording" | "both";
type WeeklySessionType = DateOverrideSessionType;
type WeeklyScheduleScope = "indefinite" | "until" | "specific_dates";
type WeeklyScheduleFields = {
  weeklyScheduleScope: WeeklyScheduleScope;
  weeklyScheduleEndDate: string;
  weeklyScheduleDates: Record<string, boolean>;
};
type WeeklyAvailabilityDay = {
  day: string;
  slots: { start: string; end: string }[];
  sessionType?: WeeklySessionType;
} & WeeklyScheduleFields;
type ScheduleSlot = { start: string; end: string };
type ProtectedDateOverrideMap = Record<
  string,
  {
    slots: ScheduleSlot[];
    sessionType?: DateOverrideSessionType;
  }
>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDateKey = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatReadableDate = (dateStr: string): string => {
  if (!ISO_DATE_PATTERN.test(dateStr)) return "";
  return parseLocalDateKey(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const normalizeWeeklyScheduleScope = (
  value: unknown,
): WeeklyScheduleScope => {
  if (value === "until" || value === "indefinite") {
    return value;
  }
  return "indefinite";
};

const weeklyScheduleDatesToMap = (
  value: unknown,
): Record<string, boolean> => {
  if (!Array.isArray(value)) return {};
  return value.reduce((acc: Record<string, boolean>, date) => {
    if (typeof date === "string" && ISO_DATE_PATTERN.test(date)) {
      acc[date] = true;
    }
    return acc;
  }, {});
};

const toWeeklyScheduleDateList = (dates: Record<string, boolean>): string[] =>
  Object.keys(dates)
    .filter((date) => dates[date])
    .sort((a, b) => a.localeCompare(b));

const getDefaultWeeklyScheduleFields = (
  fallback?: Partial<WeeklyScheduleFields>,
): WeeklyScheduleFields => ({
  weeklyScheduleScope: normalizeWeeklyScheduleScope(
    fallback?.weeklyScheduleScope,
  ),
  weeklyScheduleEndDate:
    typeof fallback?.weeklyScheduleEndDate === "string"
      ? fallback.weeklyScheduleEndDate
      : "",
  weeklyScheduleDates: { ...(fallback?.weeklyScheduleDates || {}) },
});

const normalizeWeeklyAvailabilityDay = (
  day: {
    day: string;
    slots: { start: string; end: string }[];
    sessionType?: WeeklySessionType;
  } & Partial<WeeklyScheduleFields>,
  fallback?: Partial<WeeklyScheduleFields>,
): WeeklyAvailabilityDay => ({
  ...day,
  ...getDefaultWeeklyScheduleFields({
    weeklyScheduleScope:
      day.weeklyScheduleScope ?? fallback?.weeklyScheduleScope,
    weeklyScheduleEndDate:
      day.weeklyScheduleEndDate ?? fallback?.weeklyScheduleEndDate,
    weeklyScheduleDates:
      day.weeklyScheduleDates ?? fallback?.weeklyScheduleDates,
  }),
});

const getLocalDateTime = (dateStr: string, time24: string): Date => {
  const date = parseLocalDateKey(dateStr);
  const [hours, minutes] = time24.substring(0, 5).split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
};

const getDefaultDateOverrideSessionType = (
  type: "Rehearsal" | "Recording" | "Both",
): DateOverrideSessionType => {
  if (type === "Rehearsal") return "rehearsal";
  if (type === "Recording") return "recording";
  return "both";
};

const normalizeDateOverrideSessionType = (
  value: unknown,
  fallback: DateOverrideSessionType = "both",
): DateOverrideSessionType => {
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

const parseDateOverrideSessionType = (
  reason: unknown,
  fallback: DateOverrideSessionType = "both",
): DateOverrideSessionType => {
  const text = String(reason || "");
  const match = text.match(/session_type:(rehearsal|recording|both)/i);
  if (!match) return fallback;
  return normalizeDateOverrideSessionType(match[1], fallback);
};

const buildDateOverrideReason = (
  sessionType: DateOverrideSessionType,
  isOpen: boolean,
): string => {
  const baseReason = isOpen ? "Custom schedule" : "Closed override";
  return `${baseReason} [session_type:${sessionType}]`;
};

const buildWeeklyScheduleReason = (sessionType: WeeklySessionType): string =>
  `Weekly schedule [session_type:${sessionType}]`;

const getDefaultWeeklySessionType = (
  type: "Rehearsal" | "Recording" | "Both",
): WeeklySessionType => getDefaultDateOverrideSessionType(type);

const normalizeWeeklySessionType = (
  value: unknown,
  fallback: WeeklySessionType = "both",
): WeeklySessionType => normalizeDateOverrideSessionType(value, fallback);

const parseWeeklySessionType = (
  reason: unknown,
  fallback: WeeklySessionType = "both",
): WeeklySessionType => parseDateOverrideSessionType(reason, fallback);

const inferStudioTypeFromRows = (
  rows: unknown[],
): "Rehearsal" | "Recording" | "Both" => {
  const canonicalSet = new Set<"Rehearsal" | "Recording">();

  rows.forEach((row) => {
    const canonical = canonicalizeStudioType(row);
    if (canonical) canonicalSet.add(canonical);
  });

  const hasRehearsal = canonicalSet.has("Rehearsal");
  const hasRecording = canonicalSet.has("Recording");

  if (hasRehearsal && hasRecording) return "Both";
  if (hasRecording) return "Recording";
  if (hasRehearsal) return "Rehearsal";
  return "Both";
};

export default function EditStudioScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams<{
    id?: string | string[];
  }>();
  const returnTab = useLocalSearchParams<{
    returnTab?: string | string[];
  }>().returnTab;
  const returnTabParam = Array.isArray(returnTab) ? returnTab[0] : returnTab;
  const normalizedReturnTab = ["About", "Setup", "Bookings", "Review"].includes(returnTabParam || "")
    ? returnTabParam || "About"
    : "About";
  const [studioName, setStudioName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  // Dynamic pricing per studio type
  const [rehearsalRate, setRehearsalRate] = useState("");
  const [recordingRate, setRecordingRate] = useState("");
  const [studioType, setStudioType] = useState<
    "Rehearsal" | "Recording" | "Both"
  >("Both");
  const [recordingSongsPerBlock, setRecordingSongsPerBlock] = useState("");
  const [recordingHoursPerBlock, setRecordingHoursPerBlock] = useState("");
  const [pax, setPax] = useState("");

  // Promotions state
  interface PromotionItem {
    id: string;
    name: string;
    description: string;
    criteria: string;
    minimum_booking_hours: string;
    minimum_spend: string;
    discount_type: "percentage" | "fixed_amount";
    discount_value: string;
    is_permanent: boolean;
    start_date: string;
    end_date: string;
    applies_to: "rehearsal" | "recording" | "both";
  }
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
  const [showPromotionForm, setShowPromotionForm] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<PromotionItem | null>(null);
  const [promotionForm, setPromotionForm] = useState({
    name: "",
    description: "",
    criteria: "",
    minimum_booking_hours: "",
    minimum_spend: "",
    discount_type: "percentage" as "percentage" | "fixed_amount",
    discount_value: "",
    is_permanent: true,
    start_date: "",
    end_date: "",
    applies_to: "both" as "rehearsal" | "recording" | "both",
  });
  const [showPromoStartCalendar, setShowPromoStartCalendar] = useState(false);
  const [showPromoEndCalendar, setShowPromoEndCalendar] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

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
    const studioId = Array.isArray(id) ? id[0] : id;
    if (studioId) {
      router.replace({
        pathname: "/manage_studio",
        params: { id: studioId, tab: normalizedReturnTab },
      });
      return;
    }

    router.replace("/my_studio");
  }, [id, normalizedReturnTab]);

  const handleAttemptLeave = useCallback(() => {
    if (saving) return;

    showAlert(
      "warning",
      "Leave edit studio?",
      "Your current edits won't be saved unless you tap Save Changes.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: handleReturnToTabs },
      ],
    );
  }, [handleReturnToTabs, saving]);

  const toggleCalendarDate = (dateStr: string) => {
    if (!isStudioDateOverrideDateSelectable(dateStr)) {
      return;
    }

    setSelectedDates((prev) => {
      const next = { ...prev };
      if (next[dateStr]?.selected) {
        delete next[dateStr];
      } else {
        next[dateStr] = {
          selected: true,
          slots: [getDefaultStudioDateOverrideSlot(dateStr)],
          sessionType: getDefaultDateOverrideSessionType(studioType),
        };
      }
      return next;
    });
  };

  const [amenities, setAmenities] = useState<string[]>([]);
  const [newAmenity, setNewAmenity] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);

  // Contract state
  const [contractUrl, setContractUrl] = useState<string>("");
  const [contractFileName, setContractFileName] = useState<string>("");
  const [uploadingContract, setUploadingContract] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Business Permit state
  const [businessPermitUrl, setBusinessPermitUrl] = useState<string>("");
  const [businessPermitFileName, setBusinessPermitFileName] = useState<string>("");
  const [uploadingBusinessPermit, setUploadingBusinessPermit] = useState(false);
  const businessPermitInputRef = useRef<HTMLInputElement>(null);
  const [permitStatus, setPermitStatus] = useState<string>("approved");
  const [permitRejectionReason, setPermitRejectionReason] = useState<string>("");

  // Availability state
  const daysOfWeek = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const [availability, setAvailability] = useState<WeeklyAvailabilityDay[]>(
    daysOfWeek.map((day) => normalizeWeeklyAvailabilityDay({
      day,
      slots: [],
      sessionType: getDefaultWeeklySessionType("Both"),
    })),
  );

  // Instruments state
  const [selectedInstruments, setSelectedInstruments] = useState<
    { name: string; image: string }[]
  >([]);

  // Studio Equipment state (full details with name, quantity, description, image)
  interface EquipmentItem {
    id: string;
    name: string;
    quantity: number;
    description: string;
    image: string;
  }
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [editingEquipment, setEditingEquipment] =
    useState<EquipmentItem | null>(null);
  const [equipmentForm, setEquipmentForm] = useState({
    name: "",
    quantity: "1",
    description: "",
    image: "",
  });

  // Calendar-based availability state
  const [selectedDates, setSelectedDates] = useState<{
    [date: string]: {
      selected: boolean;
      slots: { start: string; end: string }[];
      sessionType?: DateOverrideSessionType;
    };
  }>({});
  const [activeWeeklyEndDatePickerDay, setActiveWeeklyEndDatePickerDay] =
    useState<string | null>(null);
  // Conflict Resolution State
  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictingBookings, setConflictingBookings] = useState<
    ConflictingBooking[]
  >([]);
  const [pendingSavePayload, setPendingSavePayload] = useState<any>(null);
  const originalAvailabilityRef = useRef<WeeklyAvailabilityDay[]>(
    daysOfWeek.map((day) => normalizeWeeklyAvailabilityDay({
      day,
      slots: [],
      sessionType: getDefaultWeeklySessionType("Both"),
    })),
  );
  const originalSelectedDatesRef = useRef<{
    [date: string]: {
      selected: boolean;
      slots: { start: string; end: string }[];
      sessionType?: DateOverrideSessionType;
    };
  }>({});
  const nearTermProtectedDateOverridesRef =
    useRef<ProtectedDateOverrideMap>({});

  const getWeeklyScheduleForDate = (
    dateStr: string,
    weeklySchedule: WeeklyAvailabilityDay[] = availability,
  ) => {
    const dayName = getDayOfWeekName(dateStr);
    return weeklySchedule.find((daySchedule) => daySchedule.day === dayName);
  };

  const weeklyScheduleAllowsDate = (
    dateStr: string,
    daySchedule: WeeklyAvailabilityDay,
  ): boolean => {
    if (
      daySchedule.weeklyScheduleScope === "until" &&
      daySchedule.weeklyScheduleEndDate
    ) {
      return dateStr <= daySchedule.weeklyScheduleEndDate;
    }
    if (daySchedule.weeklyScheduleScope === "specific_dates") {
      return Boolean(daySchedule.weeklyScheduleDates[dateStr]);
    }
    return true;
  };

  const isWeeklyScheduleDateAllowed = (
    dateStr: string,
    weeklySchedule: WeeklyAvailabilityDay[] = availability,
  ): boolean => {
    const daySchedule = getWeeklyScheduleForDate(dateStr, weeklySchedule);
    return Boolean(
      daySchedule &&
        daySchedule.slots.length > 0 &&
        weeklyScheduleAllowsDate(dateStr, daySchedule),
    );
  };

  const updateWeeklyScheduleForDay = (
    dayIndex: number,
    patch: Partial<WeeklyScheduleFields>,
  ) => {
    setAvailability((prev) =>
      prev.map((day, index) =>
        index === dayIndex ? normalizeWeeklyAvailabilityDay({ ...day, ...patch }) : day,
      ),
    );
  };

  const isWeeklyScheduleScopeValid = (): boolean => {
    const todayKey = getLocalDateKey();
    const openDays = availability.filter((day) => day.slots.length > 0);

    for (const daySchedule of openDays) {
      if (daySchedule.weeklyScheduleScope === "until") {
        if (!ISO_DATE_PATTERN.test(daySchedule.weeklyScheduleEndDate)) {
          showAlert(
            "warning",
            `${daySchedule.day} Schedule End Date`,
            `Choose a ${daySchedule.day} weekly schedule end date from the calendar.`,
          );
          return false;
        }
        if (daySchedule.weeklyScheduleEndDate < todayKey) {
          showAlert(
            "warning",
            `${daySchedule.day} Schedule End Date`,
            `The ${daySchedule.day} weekly schedule end date must be today or a future date.`,
          );
          return false;
        }
      }

      if (daySchedule.weeklyScheduleScope === "specific_dates") {
        const selectedWeeklyDates = toWeeklyScheduleDateList(
          daySchedule.weeklyScheduleDates,
        );
        if (selectedWeeklyDates.length === 0) {
          showAlert(
            "warning",
            `${daySchedule.day} Schedule Dates`,
            `Select at least one ${daySchedule.day} date for this weekly schedule.`,
          );
          return false;
        }

        const unsupportedDate = selectedWeeklyDates.find(
          (dateStr) =>
            dateStr < todayKey || getDayOfWeekName(dateStr) !== daySchedule.day,
        );
        if (unsupportedDate) {
          showAlert(
            "warning",
            `${daySchedule.day} Schedule Dates`,
            `${unsupportedDate} is not a future ${daySchedule.day}. Remove it or choose the matching weekday.`,
          );
          return false;
        }
      }
    }

    return true;
  };

  const defaultPromotionAppliesTo =
    studioType === "Rehearsal"
      ? "rehearsal"
      : studioType === "Recording"
        ? "recording"
        : "both";
  const allowedPromotionTargets = getAllowedPromotionTargets(studioType);
  const effectiveAppliesTo = allowedPromotionTargets.includes(promotionForm.applies_to)
    ? promotionForm.applies_to
    : allowedPromotionTargets[0];
  // Predefined instruments with images
  const INSTRUMENT_OPTIONS = [
    {
      name: "Drum Kit",
      image:
        "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=200&h=200&fit=crop",
    },
    {
      name: "Piano",
      image:
        "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=200&h=200&fit=crop",
    },
    {
      name: "Guitar Amp",
      image:
        "https://images.unsplash.com/photo-1535587566541-97121a128dc5?w=200&h=200&fit=crop",
    },
    {
      name: "Bass Amp",
      image:
        "https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=200&h=200&fit=crop",
    },
    {
      name: "Microphones",
      image:
        "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=200&h=200&fit=crop",
    },
    {
      name: "Keyboard",
      image:
        "https://images.unsplash.com/photo-1552422535-c45813c61732?w=200&h=200&fit=crop",
    },
    {
      name: "Electric Guitar",
      image:
        "https://images.unsplash.com/photo-1550985616-10810253b84d?w=200&h=200&fit=crop",
    },
    {
      name: "Bass Guitar",
      image:
        "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200&h=200&fit=crop",
    },
    {
      name: "DJ Equipment",
      image:
        "https://images.unsplash.com/photo-1571327073757-71d13c24de30?w=200&h=200&fit=crop",
    },
    {
      name: "Synthesizer",
      image:
        "https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=200&h=200&fit=crop",
    },
    {
      name: "PA System",
      image:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop",
    },
    {
      name: "Mixing Console",
      image:
        "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=200&h=200&fit=crop",
    },
  ];

  // Toggle instrument selection
  const toggleInstrument = (instrument: { name: string; image: string }) => {
    const isSelected = selectedInstruments.some(
      (i) => i.name === instrument.name,
    );
    if (isSelected) {
      setSelectedInstruments(
        selectedInstruments.filter((i) => i.name !== instrument.name),
      );
    } else {
      setSelectedInstruments([...selectedInstruments, instrument]);
    }
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

      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        showAlert("warning", "Invalid Studio", "Invalid studio ID. Please try again.");
        router.replace("/home");
        return;
      }

      const isStudioOwner = profile?.role === "studio-owner";
      let canEditStudio = false;

      if (isStudioOwner) {
        const { data: ownedStudio, error: ownedStudioError } = await supabase
          .from("studios")
          .select("id")
          .eq("id", studioId)
          .eq("owner_id", user.id)
          .maybeSingle();

        if (ownedStudioError) throw ownedStudioError;
        canEditStudio = !!ownedStudio?.id;
      }

      if (!canEditStudio && profile?.role === "staff") {
        const assignment = await fetchActiveStaffAssignment(supabase, user.id);
        const permissions = getStaffPermissions(assignment?.access_level);
        canEditStudio =
          assignment?.entity_type === "studio" &&
          assignment.studio_id === studioId &&
          permissions.canEditListing;
      }

      if (!canEditStudio) {
        showAlert(
          "warning",
          "Unauthorized",
          "Only the studio owner or assigned Level 1 staff can edit this studio.",
        );
        router.replace("/home");
        return;
      }

      setAuthorized(true);
      // Now fetch the studio details
      // fetchStudioDetails(); // This will be called by the other useEffect now
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/home");
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    // Only refetch if id changes and we're already authorized
    if (authorized && id) {
      fetchStudioDetails();
    }
  }, [id, authorized]);

  useEffect(() => {
    setAvailability((prev) => {
      if (prev.length === 0) return prev;

      const fallbackSessionType = getDefaultWeeklySessionType(studioType);
      let changed = false;

      const next = prev.map((day) => {
        const normalizedCurrent = normalizeWeeklySessionType(
          day.sessionType,
          fallbackSessionType,
        );
        const nextSessionType =
          studioType === "Both" ? normalizedCurrent : fallbackSessionType;

        if (day.sessionType !== nextSessionType) changed = true;

        return {
          ...day,
          sessionType: nextSessionType,
        };
      });

      return changed ? next : prev;
    });

    setSelectedDates((prev) => {
      if (Object.keys(prev).length === 0) return prev;

      const fallbackSessionType = getDefaultDateOverrideSessionType(studioType);
      let changed = false;
      const next: typeof prev = {};

      Object.entries(prev).forEach(([dateKey, dateValue]) => {
        const normalizedCurrent = normalizeDateOverrideSessionType(
          dateValue?.sessionType,
          fallbackSessionType,
        );
        const nextSessionType =
          studioType === "Both" ? normalizedCurrent : fallbackSessionType;

        if (dateValue.sessionType !== nextSessionType) changed = true;

        next[dateKey] = {
          ...dateValue,
          sessionType: nextSessionType,
        };
      });

      return changed ? next : prev;
    });

    setPromotionForm((prev) => {
      const nextAppliesTo = normalizePromotionTarget(prev.applies_to, studioType);
      if (prev.applies_to === nextAppliesTo) return prev;
      return { ...prev, applies_to: nextAppliesTo };
    });

    setPromotions((prev) => {
      let changed = false;
      const next = prev.map((promo) => {
        const nextAppliesTo = normalizePromotionTarget(promo.applies_to, studioType);
        if (nextAppliesTo === promo.applies_to) return promo;
        changed = true;
        return { ...promo, applies_to: nextAppliesTo };
      });
      return changed ? next : prev;
    });
  }, [studioType]);

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

  // Promotion helpers
  const resetPromotionForm = () => {
    setPromotionForm({
      name: "",
      description: "",
      criteria: "",
      minimum_booking_hours: "",
      minimum_spend: "",
      discount_type: "percentage",
      discount_value: "",
      is_permanent: true,
      start_date: "",
      end_date: "",
      applies_to: defaultPromotionAppliesTo,
    });
    setEditingPromotion(null);
  };

  const handleSavePromotion = () => {
    const {
      name,
      discount_type,
      discount_value,
      is_permanent,
      start_date,
      end_date,
      applies_to,
      description,
      criteria,
      minimum_booking_hours,
      minimum_spend,
    } = promotionForm;
    if (!name.trim()) {
      showAlert("warning", "Required", "Please enter a promotion name.");
      return;
    }
    const val = parseFloat(discount_value);
    if (!val || val <= 0) {
      showAlert("warning", "Required", "Please enter a valid discount value.");
      return;
    }
    if (discount_type === "percentage" && val > 100) {
      showAlert("warning", "Invalid Value", "Percentage discount cannot exceed 100%.");
      return;
    }
    if (!is_permanent && (!start_date || !end_date)) {
      showAlert("warning", "Required", "Please select both start and end dates for time-limited promotions.");
      return;
    }
    if (!is_permanent && end_date < start_date) {
      showAlert("warning", "Invalid Dates", "End date must be on or after start date.");
      return;
    }

    const minimumHoursValue = minimum_booking_hours.trim();
    if (minimumHoursValue) {
      const parsedHours = Number.parseFloat(minimumHoursValue);
      if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
        showAlert(
          "warning",
          "Invalid Criteria",
          "Minimum booking hours must be greater than 0.",
        );
        return;
      }
    }

    const minimumSpendValue = minimum_spend.trim();
    if (minimumSpendValue) {
      const parsedSpend = Number.parseFloat(minimumSpendValue);
      if (!Number.isFinite(parsedSpend) || parsedSpend <= 0) {
        showAlert(
          "warning",
          "Invalid Criteria",
          "Minimum spend must be greater than 0.",
        );
        return;
      }
    }

    const normalizedAppliesTo = normalizePromotionTarget(applies_to, studioType);

    const promoItem: PromotionItem = {
      id: editingPromotion?.id || Date.now().toString(),
      name: name.trim(),
      description: description.trim(),
      criteria: criteria.trim(),
      minimum_booking_hours: minimumHoursValue,
      minimum_spend: minimumSpendValue,
      discount_type,
      discount_value,
      is_permanent,
      start_date: is_permanent ? "" : start_date,
      end_date: is_permanent ? "" : end_date,
      applies_to: normalizedAppliesTo,
    };

    if (editingPromotion) {
      setPromotions((prev) => prev.map((p) => (p.id === editingPromotion.id ? promoItem : p)));
    } else {
      setPromotions((prev) => [...prev, promoItem]);
    }
    resetPromotionForm();
    setShowPromotionForm(false);
  };

  const handleEditPromotion = (promo: PromotionItem) => {
    setEditingPromotion(promo);
    setPromotionForm({
      name: promo.name,
      description: promo.description,
      criteria: promo.criteria,
      minimum_booking_hours: promo.minimum_booking_hours,
      minimum_spend: promo.minimum_spend,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value,
      is_permanent: promo.is_permanent,
      start_date: promo.start_date,
      end_date: promo.end_date,
      applies_to: normalizePromotionTarget(promo.applies_to, studioType),
    });
    setShowPromotionForm(true);
  };

  const handleRemovePromotion = (id: string) => {
    setPromotions((prev) => prev.filter((p) => p.id !== id));
  };

  const fetchStudioDetails = async () => {

    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error("❌ No user found, redirecting to login");
        router.replace("/");
        return;
      }

      // Ensure id is a string, not an array
      const studioId = Array.isArray(id) ? id[0] : id;

      if (!studioId) {
        console.error("❌ Invalid studio ID after processing");
        showAlert("warning", "Invalid Studio", "Invalid studio ID. Please try again.");
        router.replace("/home");
        return;
      }


      // Base query + normalized child tables merge
      const { data: baseData, error: baseError } = await supabase
        .from('studios')
        .select('*')
        .eq('id', studioId)
        .single();

      const [
        { data: studioTypesData, error: studioTypesError },
        { data: studioAmenitiesData, error: studioAmenitiesError },
        { data: studioInstrumentsData, error: studioInstrumentsError },
        { data: studioMediaData, error: studioMediaError },
        { data: studioSettingsData, error: studioSettingsError },
        { data: operatingHoursData, error: operatingHoursError },
        { data: studioPromotionsData, error: studioPromotionsError },
      ] = await Promise.all([
        supabase
          .from('studio_types')
          .select('studio_type')
          .eq('studio_id', studioId),
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
          .from('studio_operating_hours')
          .select('*')
          .eq('studio_id', studioId)
          .eq('is_open', true)
          .order('day_of_week', { ascending: true })
          .order('slot_order', { ascending: true }),
        supabase
          .from('studio_promotions')
          .select('*')
          .eq('studio_id', studioId)
          .order('created_at', { ascending: true }),
      ]);


      if (baseError) {
        console.error("❌ Base studio query returned error:", baseError);
        throw baseError;
      }

      if (studioTypesError) throw studioTypesError;
      if (studioAmenitiesError) throw studioAmenitiesError;
      if (studioInstrumentsError) throw studioInstrumentsError;
      if (studioMediaError) throw studioMediaError;
      if (studioSettingsError) throw studioSettingsError;
      if (operatingHoursError) throw operatingHoursError;
      if (studioPromotionsError) throw studioPromotionsError;

      const dayIndexToName = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];

      const normalizedTypes = Array.from(
        new Set(
          (studioTypesData || [])
            .map((row: any) => canonicalizeStudioType(row.studio_type))
            .filter((type): type is "Rehearsal" | "Recording" => Boolean(type)),
        ),
      );

      const inferredStudioType = inferStudioTypeFromRows(normalizedTypes);
      const fallbackWeeklySessionType = getDefaultWeeklySessionType(
        inferredStudioType,
      );
      const loadedGlobalWeeklySchedule = getDefaultWeeklyScheduleFields({
        weeklyScheduleScope: normalizeWeeklyScheduleScope(
          studioSettingsData?.weekly_schedule_scope,
        ),
        weeklyScheduleEndDate:
          typeof studioSettingsData?.weekly_schedule_end_date === "string"
            ? studioSettingsData.weekly_schedule_end_date
            : "",
        weeklyScheduleDates: weeklyScheduleDatesToMap(
          studioSettingsData?.weekly_schedule_dates,
        ),
      });
      const getWeeklyScheduleDatesForDay = (
        dates: Record<string, boolean>,
        dayName: string,
      ) =>
        Object.fromEntries(
          Object.entries(dates).filter(
            ([dateStr]) => getDayOfWeekName(dateStr) === dayName,
          ),
        );

      const availabilityByDay: Record<string, WeeklyAvailabilityDay> =
        dayIndexToName.reduce((acc, day) => {
          acc[day] = normalizeWeeklyAvailabilityDay({
            slots: [],
            sessionType: fallbackWeeklySessionType,
            ...loadedGlobalWeeklySchedule,
            weeklyScheduleDates: getWeeklyScheduleDatesForDay(
              loadedGlobalWeeklySchedule.weeklyScheduleDates,
              day,
            ),
            day,
          });
          return acc;
        }, {} as Record<string, WeeklyAvailabilityDay>);

      (operatingHoursData || []).forEach((row: any) => {
        const dayName = dayIndexToName[row.day_of_week];
        if (!dayName || !row.open_time || !row.close_time) return;
        availabilityByDay[dayName].slots.push({
          start: row.open_time,
          end: row.close_time,
        });
        availabilityByDay[dayName].sessionType = parseWeeklySessionType(
          row.reason,
          fallbackWeeklySessionType,
        );
        availabilityByDay[dayName] = normalizeWeeklyAvailabilityDay(
          {
            ...availabilityByDay[dayName],
            weeklyScheduleScope: normalizeWeeklyScheduleScope(
              row.weekly_schedule_scope ??
                loadedGlobalWeeklySchedule.weeklyScheduleScope,
            ),
            weeklyScheduleEndDate:
              typeof row.weekly_schedule_end_date === "string"
                ? row.weekly_schedule_end_date
                : loadedGlobalWeeklySchedule.weeklyScheduleEndDate,
            weeklyScheduleDates: getWeeklyScheduleDatesForDay(
              Array.isArray(row.weekly_schedule_dates)
                ? weeklyScheduleDatesToMap(row.weekly_schedule_dates)
                : loadedGlobalWeeklySchedule.weeklyScheduleDates,
              dayName,
            ),
          },
          loadedGlobalWeeklySchedule,
        );
      });

      const normalizedInstruments = (studioInstrumentsData || []).map(
        (row: any) => ({
          id: row.id,
          name: row.instrument_name,
          image: row.image_url || '',
          quantity: row.quantity,
          description: row.description,
        }),
      );

      const normalizedAmenities = (studioAmenitiesData || [])
        .map((row: any) => row.amenity)
        .filter(Boolean);

      const normalizedImages = (studioMediaData || [])
        .map((row: any) => row.media_url)
        .filter(Boolean);

      const normalizedAvailability = dayIndexToName.map((day) => ({
        day,
        slots: availabilityByDay[day]?.slots || [],
        sessionType:
          availabilityByDay[day]?.sessionType || fallbackWeeklySessionType,
        weeklyScheduleScope: availabilityByDay[day]?.weeklyScheduleScope,
        weeklyScheduleEndDate: availabilityByDay[day]?.weeklyScheduleEndDate,
        weeklyScheduleDates: availabilityByDay[day]?.weeklyScheduleDates || {},
      }));

      // If no data returned, user doesn't own this studio
      if (!baseData) {
        console.error("❌ No data returned from edge function");
        showAlert(
          "warning",
          "Not Found",
          "Studio not found or you do not have permission to edit it.",
        );
        router.replace("/home");
        return;
      }

      const data = {
        ...baseData,
        amenities: normalizedAmenities,
        images: normalizedImages,
        instruments: normalizedInstruments,
        availability: normalizedAvailability,
        calendar_availability: [],
        types: normalizedTypes,
        type: inferredStudioType,
        lead_time_hours: studioSettingsData?.lead_time_hours ?? 24,
        weekend_multiplier: studioSettingsData?.weekend_multiplier ?? 1.0,
        peak_season_multiplier:
          studioSettingsData?.peak_season_multiplier ?? 1.0,
        peak_season_dates: studioSettingsData?.peak_season_dates ?? [],
        off_peak_multiplier: studioSettingsData?.off_peak_multiplier ?? 1.0,
        off_peak_dates: studioSettingsData?.off_peak_dates ?? [],
        min_booking_duration_hours:
          studioSettingsData?.min_booking_duration_hours ?? 2,
        recording_songs_per_block:
          studioSettingsData?.recording_songs_per_block ?? 1,
        recording_hours_per_block:
          studioSettingsData?.recording_hours_per_block ??
          studioSettingsData?.min_booking_duration_hours ??
          3,
        recording_rate_negotiable: false,
        weekly_schedule_scope:
          studioSettingsData?.weekly_schedule_scope ?? "indefinite",
        weekly_schedule_end_date:
          studioSettingsData?.weekly_schedule_end_date ?? "",
        weekly_schedule_dates:
          studioSettingsData?.weekly_schedule_dates ?? [],
      } as any;


      // Log each critical field


      setStudioName(data.name);

      setDescription(data.description);

      setAddress(data.address);

      setLatitude(data.latitude || null);

      setLongitude(data.longitude || null);

      // Load dynamic pricing
      const rehearsalValue =
        data.rehearsal_rate?.toString() || data.hourly_rate?.toString() || "";
      setRehearsalRate(rehearsalValue);

      const recordingValue = data.recording_rate?.toString() || "";
      setRecordingRate(recordingValue);

      const typeValue = data.type || "Both";
      setStudioType(typeValue);

      const loadedSongsPerBlock = parsePositiveInteger(
        data.recording_songs_per_block,
      );
      setRecordingSongsPerBlock(
        loadedSongsPerBlock ? String(loadedSongsPerBlock) : "",
      );

      const loadedHoursPerBlock = parsePositiveDecimal(
        data.recording_hours_per_block ?? data.min_booking_duration_hours,
      );
      setRecordingHoursPerBlock(
        loadedHoursPerBlock ? String(loadedHoursPerBlock) : "",
      );

      const paxValue = data.pax?.toString() || "";
      setPax(paxValue);

      setAmenities(data.amenities || []);

      setContractUrl(data.contract_url || "");
      if (data.contract_url) {
        const fileName = data.contract_url.split("/").pop() || "Contract.pdf";
        setContractFileName(decodeURIComponent(fileName));
      }

      setBusinessPermitUrl(data.business_permit_url || "");
      setPermitStatus(String(data.permit_status || "approved").toLowerCase());
      setPermitRejectionReason(data.permit_rejection_reason || "");
      if (data.business_permit_url) {
        const fileName = data.business_permit_url.split("/").pop() || "BusinessPermit.pdf";
        setBusinessPermitFileName(decodeURIComponent(fileName));
      }

      // Load equipment/instruments from instruments JSONB

      const instrumentsData = Array.isArray(data.instruments)
        ? data.instruments
        : [];
      instrumentsData.forEach((item: any, index: number) => {
      });

      const presetLookup = new Map(
        INSTRUMENT_OPTIONS.map((item) => [item.name, item.image]),
      );

      const equipmentItems = instrumentsData
        .filter((item: any) => {
          if (!item || typeof item !== "object") {
            return false;
          }

          const name = typeof item.name === "string" ? item.name.trim() : "";
          if (!name) return false;

          const hasQuantity =
            typeof item.quantity === "number" ||
            (typeof item.quantity === "string" && item.quantity.trim() !== "");
          const hasDescription =
            typeof item.description === "string" &&
            item.description.trim().length > 0;

          if (hasQuantity || hasDescription) {
            return true;
          }

          const presetImage = presetLookup.get(name);
          if (!presetImage) {
            return true;
          }

          const image = typeof item.image === "string" ? item.image.trim() : "";
          const isCustomImage = image.length > 0 && image !== presetImage;
          if (isCustomImage) {
          }
          return isCustomImage;
        })
        .map((eq: any, index: number) => {
          const mapped = {
            id: eq.id || `eq-${index}`,
            name: eq.name || "",
            quantity:
              typeof eq.quantity === "number"
                ? eq.quantity
                : parseInt(eq.quantity, 10) || 1,
            description: eq.description || "",
            image: eq.image || "",
          };
          return mapped;
        });

      const presetItems = instrumentsData
        .filter((item: any) => {
          if (!item || typeof item !== "object") {
            return false;
          }
          const name = typeof item.name === "string" ? item.name.trim() : "";
          if (!name) {
            return false;
          }

          const image = typeof item.image === "string" ? item.image.trim() : "";
          const presetImage = presetLookup.get(name);
          const willInclude = !!presetImage && image === presetImage;
          return willInclude;
        })
        .map((item: any) => {
          const mapped = {
            name: item.name,
            image: item.image,
          };
          return mapped;
        });

      // Always set equipment even if length is 0 to clear old data
      setEquipment(equipmentItems);

      // Load promotions
      if (!studioPromotionsError && studioPromotionsData && studioPromotionsData.length > 0) {
        const loadedPromos: PromotionItem[] = studioPromotionsData.map((p: any) => ({
          ...(() => {
            const parsedLegacyDescription = parsePromotionDescription(p.description);
            const criteriaFromColumn =
              typeof p.criteria === "string" ? p.criteria.trim() : "";
            const minimumHoursFromColumn =
              p.minimum_booking_hours !== null && p.minimum_booking_hours !== undefined
                ? String(p.minimum_booking_hours)
                : "";
            const minimumSpendFromColumn =
              p.minimum_spend !== null && p.minimum_spend !== undefined
                ? String(p.minimum_spend)
                : "";

            return {
              description: parsedLegacyDescription.description,
              criteria: criteriaFromColumn || parsedLegacyDescription.criteria,
              minimum_booking_hours:
                minimumHoursFromColumn || parsedLegacyDescription.minimum_booking_hours,
              minimum_spend:
                minimumSpendFromColumn || parsedLegacyDescription.minimum_spend,
            };
          })(),
          id: p.id,
          name: p.name || "",
          discount_type: p.discount_type || "percentage",
          discount_value: String(p.discount_value || ""),
          is_permanent: p.is_permanent ?? true,
          start_date: p.start_date || "",
          end_date: p.end_date || "",
          applies_to: p.applies_to || "both",
        }));
        setPromotions(loadedPromos);
      }

      const todayKey = getLocalDateKey();

      // Load calendar availability from date overrides table
      const { data: dateOverrides, error: overridesError } = await supabase
        .from("studio_date_overrides")
        .select("*")
        .eq("studio_id", studioId)
        .order("override_date", { ascending: true })
        .order("slot_order", { ascending: true })
        .gte("override_date", todayKey); // Only today/future dates

      if (overridesError) {
        throw overridesError;
      }

      if (dateOverrides && dateOverrides.length > 0) {
        // Helper function to convert 24-hour to 12-hour format
        const convertTo12Hour = (time24: string) => {
          if (!time24 || !time24.includes(":")) return "09:00 AM";
          const [hours, minutes] = time24.split(":");
          const hour = parseInt(hours, 10);
          const period = hour >= 12 ? "PM" : "AM";
          const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          return `${String(hour12).padStart(2, "0")}:${minutes} ${period}`;
        };

        const calendarDates: {
          [date: string]: {
            selected: boolean;
            slots: { start: string; end: string }[];
            sessionType?: DateOverrideSessionType;
          };
        } = {};
        const fallbackSessionType = getDefaultDateOverrideSessionType(
          inferStudioTypeFromRows(normalizedTypes),
        );
        dateOverrides.forEach((override: any) => {
          if (override.override_date) {
            if (!calendarDates[override.override_date]) {
              calendarDates[override.override_date] = {
                selected: true,
                slots: [],
                sessionType: parseDateOverrideSessionType(
                  override.reason,
                  fallbackSessionType,
                ),
              };
            }

            if (override.is_open && override.open_time && override.close_time) {
              calendarDates[override.override_date].slots.push({
                start: convertTo12Hour(override.open_time),
                end: convertTo12Hour(override.close_time),
              });
            }
          }
        });
        setSelectedDates(calendarDates);
        originalSelectedDatesRef.current = JSON.parse(
          JSON.stringify(calendarDates),
        );
      } else if (
        data.calendar_availability &&
        Array.isArray(data.calendar_availability)
      ) {
        // Fallback: Load from legacy calendar_availability field
        const calendarDates: {
          [date: string]: {
            selected: boolean;
            slots: { start: string; end: string }[];
            sessionType?: DateOverrideSessionType;
          };
        } = {};
        const fallbackSessionType = getDefaultDateOverrideSessionType(
          inferStudioTypeFromRows(normalizedTypes),
        );
        data.calendar_availability.forEach((item: any) => {
          if (item.date && item.date >= todayKey) {
            calendarDates[item.date] = {
              selected: true,
              slots:
                item.is_open === false
                  ? []
                  : item.slots || [{ start: "09:00 AM", end: "05:00 PM" }],
              sessionType: normalizeDateOverrideSessionType(
                item.session_type,
                fallbackSessionType,
              ),
            };
          }
        });
        setSelectedDates(calendarDates);
        originalSelectedDatesRef.current = JSON.parse(
          JSON.stringify(calendarDates),
        );
      } else {
        setSelectedDates({});
        originalSelectedDatesRef.current = {};
      }

      // Load availability
      if (data.availability && Array.isArray(data.availability)) {
        // Helper function to convert 24-hour to 12-hour format
        const convertTo12Hour = (time24: string) => {
          if (!time24 || !time24.includes(":")) return "09:00 AM";
          const [hours, minutes] = time24.split(":");
          const hour = parseInt(hours, 10);
          const period = hour >= 12 ? "PM" : "AM";
          const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          return `${String(hour12).padStart(2, "0")}:${minutes} ${period}`;
        };

        const loadedAvailability = daysOfWeek.map((day) => {
          const dayData = data.availability.find((a: any) => a.day === day);
          return normalizeWeeklyAvailabilityDay({
            day,
            slots: dayData?.slots
              ? dayData.slots.map((slot: any) => ({
                start: convertTo12Hour(slot.start),
                end: convertTo12Hour(slot.end),
              }))
              : [],
            sessionType: normalizeWeeklySessionType(
              dayData?.sessionType,
              getDefaultWeeklySessionType(data.type || "Both"),
            ),
            weeklyScheduleScope: normalizeWeeklyScheduleScope(
              dayData?.weeklyScheduleScope ?? dayData?.weekly_schedule_scope,
            ),
            weeklyScheduleEndDate:
              typeof (dayData?.weeklyScheduleEndDate ?? dayData?.weekly_schedule_end_date) === "string"
                ? dayData.weeklyScheduleEndDate
                  ?? dayData.weekly_schedule_end_date
                : "",
            weeklyScheduleDates:
              dayData?.weeklyScheduleDates ??
              weeklyScheduleDatesToMap(dayData?.weekly_schedule_dates),
          });
        });
        setAvailability(loadedAvailability);
        originalAvailabilityRef.current = JSON.parse(
          JSON.stringify(loadedAvailability),
        );
      } else {
        // Initialize with empty schedule if no availability data
        const defaultAvailability = daysOfWeek.map((day) => ({
          day,
          slots: [],
          sessionType: getDefaultWeeklySessionType(data.type || "Both"),
        })).map((day) => normalizeWeeklyAvailabilityDay(day));
        setAvailability(defaultAvailability);
        originalAvailabilityRef.current = JSON.parse(
          JSON.stringify(defaultAvailability),
        );
      }

      // Load preset instruments
      if (presetItems.length > 0) {
        setSelectedInstruments(presetItems);
      } else {
      }

      setSelectedImages(data.images || []);

      if (data.images && data.images.length > 0) {
        setThumbnailIndex(0);
      } else {
      }
    } catch (e) {
      logActionError("edit_studio.fetch_details_failed", e, {
        studioId: Array.isArray(id) ? id[0] : id,
      });
      showAlert(
        "warning",
        "Couldn't Load Details",
        `Failed to load studio details: ${formatSupabaseError(e)}`,
      );
      router.replace("/home");
    } finally {
      setLoading(false);
    }
  };

  const parseTimeToMinutes = (timeValue: string): number | null => {
    const normalized = timeValue.trim().toUpperCase();
    const match = normalized.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/);
    if (!match) return null;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = match[3];

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

    if (hour === 12) hour = 0;
    if (period === "PM") hour += 12;

    return hour * 60 + minute;
  };

  const validateSlots = (
    label: string,
    slots: { start: string; end: string }[],
  ): string | null => {
    const normalizedSlots: { slotNumber: number; start: number; end: number }[] =
      [];

    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      const slotNumber = index + 1;
      const start = parseTimeToMinutes(slot.start);
      const end = parseTimeToMinutes(slot.end);

      if (start === null || end === null) {
        return `${label} has an invalid time format on slot ${slotNumber}. Use HH:MM AM/PM.`;
      }

      if (end <= start) {
        return `${label} has an invalid time range on slot ${slotNumber}. End time must be after start time.`;
      }

      normalizedSlots.push({ slotNumber, start, end });
    }

    const sortedSlots = [...normalizedSlots].sort((a, b) => a.start - b.start);
    for (let index = 1; index < sortedSlots.length; index++) {
      const previousSlot = sortedSlots[index - 1];
      const currentSlot = sortedSlots[index];
      if (currentSlot.start < previousSlot.end) {
        return `${label} has overlapping time slots (${previousSlot.slotNumber} and ${currentSlot.slotNumber}).`;
      }
    }

    return null;
  };

  const validateScheduleConflicts = (): boolean => {
    for (const daySchedule of availability) {
      if (!daySchedule.slots.length) continue;
      const dayError = validateSlots(daySchedule.day, daySchedule.slots);
      if (dayError) {
        showAlert("warning", "Schedule Conflict", dayError);
        return false;
      }
    }

    for (const [dateStr, dateData] of Object.entries(selectedDates)) {
      if (!dateData.selected) continue;

      // Empty slots means this specific date is explicitly closed.
      if (!dateData.slots.length) {
        continue;
      }

      const displayDate = new Date(`${dateStr}T00:00:00`).toLocaleDateString(
        "en-US",
        {
          weekday: "short",
          month: "short",
          day: "numeric",
        },
      );
      const dateError = validateSlots(displayDate, dateData.slots);
      if (dateError) {
        showAlert("warning", "Schedule Conflict", dateError);
        return false;
      }
    }

    return true;
  };

  const validateForm = (): boolean => {
    if (!studioName.trim()) {
      showAlert("warning", "Required Field", "Please enter a studio name");
      return false;
    }
    if (!description.trim()) {
      showAlert("warning", "Required Field", "Please enter a description");
      return false;
    }
    if (!address || !latitude || !longitude) {
      showAlert(
        "warning",
        "Required Field",
        "Please select a location on the map",
      );
      return false;
    }
    // Validate pricing based on studio type
    if (studioType === "Both") {
      if (!rehearsalRate.trim() || parseFloat(rehearsalRate) <= 0) {
        showAlert(
          "warning",
          "Required Field",
          "Please enter a valid rehearsal rate",
        );
        return false;
      }
      if (!recordingRate.trim() || parseFloat(recordingRate) <= 0) {
        showAlert(
          "warning",
          "Required Field",
          "Please enter a valid recording rate",
        );
        return false;
      }
    } else if (studioType === "Rehearsal") {
      if (!rehearsalRate.trim() || parseFloat(rehearsalRate) <= 0) {
        showAlert(
          "warning",
          "Required Field",
          "Please enter a valid rehearsal rate",
        );
        return false;
      }
    } else {
      if (!recordingRate.trim() || parseFloat(recordingRate) <= 0) {
        showAlert(
          "warning",
          "Required Field",
          "Please enter a valid recording rate",
        );
        return false;
      }
    }
    if (
      (studioType === "Recording" || studioType === "Both") &&
      !parsePositiveInteger(recordingSongsPerBlock)
    ) {
      showAlert(
        "warning",
        "Invalid Recording Rule",
        "Please enter how many songs are included in each recording time block.",
      );
      return false;
    }
    if (
      (studioType === "Recording" || studioType === "Both") &&
      !parsePositiveDecimal(recordingHoursPerBlock)
    ) {
      showAlert(
        "warning",
        "Invalid Recording Rule",
        "Please enter how many hours each recording time block takes.",
      );
      return false;
    }
    if (!validateScheduleConflicts()) {
      return false;
    }
    const leadTimeError = getStudioDateOverrideLeadTimeError(
      selectedDates,
      originalSelectedDatesRef.current,
    );
    if (leadTimeError) {
      showAlert("warning", "Advance Notice Required", leadTimeError);
      return false;
    }
    if (!isWeeklyScheduleScopeValid()) {
      return false;
    }
    if (selectedImages.length === 0) {
      showAlert(
        "warning",
        "Required Field",
        "Please upload at least one studio photo",
      );
      return false;
    }
    // Validate promotions if any
    for (const promo of promotions) {
      if (!promo.name.trim()) {
        showAlert("warning", "Invalid Promotion", "Each promotion must have a name.");
        return false;
      }
      const val = parseFloat(promo.discount_value);
      if (!val || val <= 0) {
        showAlert("warning", "Invalid Promotion", `Promotion "${promo.name}" must have a positive discount value.`);
        return false;
      }
      if (promo.discount_type === "percentage" && val > 100) {
        showAlert("warning", "Invalid Promotion", `Promotion "${promo.name}" percentage cannot exceed 100%.`);
        return false;
      }
      if (!promo.is_permanent) {
        if (!promo.start_date || !promo.end_date) {
          showAlert("warning", "Invalid Promotion", `Time-limited promotion "${promo.name}" must have start and end dates.`);
          return false;
        }
        if (promo.end_date < promo.start_date) {
          showAlert("warning", "Invalid Promotion", `Promotion "${promo.name}" end date must be on or after start date.`);
          return false;
        }
      }

      const minimumHoursValue = promo.minimum_booking_hours?.trim();
      if (minimumHoursValue) {
        const parsedHours = Number.parseFloat(minimumHoursValue);
        if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
          showAlert(
            "warning",
            "Invalid Promotion",
            `Promotion "${promo.name}" minimum booking hours must be greater than 0.`,
          );
          return false;
        }
      }

      const minimumSpendValue = promo.minimum_spend?.trim();
      if (minimumSpendValue) {
        const parsedSpend = Number.parseFloat(minimumSpendValue);
        if (!Number.isFinite(parsedSpend) || parsedSpend <= 0) {
          showAlert(
            "warning",
            "Invalid Promotion",
            `Promotion "${promo.name}" minimum spend must be greater than 0.`,
          );
          return false;
        }
      }
    }
    return true;
  };

  const hasValidStudioPricing =
    studioType === "Both"
      ? Number.parseFloat(rehearsalRate) > 0 && Number.parseFloat(recordingRate) > 0
      : studioType === "Rehearsal"
        ? Number.parseFloat(rehearsalRate) > 0
        : Number.parseFloat(recordingRate) > 0;
  const hasValidRecordingRules =
    studioType !== "Recording" && studioType !== "Both"
      ? true
      : Boolean(parsePositiveInteger(recordingSongsPerBlock)) &&
        Boolean(parsePositiveDecimal(recordingHoursPerBlock));
  const haveValidPromotions = promotions.every((promo) => {
    const discountValue = Number.parseFloat(promo.discount_value);
    const minimumHoursValue = promo.minimum_booking_hours?.trim();
    const minimumSpendValue = promo.minimum_spend?.trim();

    return (
      promo.name.trim().length > 0 &&
      discountValue > 0 &&
      (promo.discount_type !== "percentage" || discountValue <= 100) &&
      (promo.is_permanent ||
        (Boolean(promo.start_date) &&
          Boolean(promo.end_date) &&
          promo.end_date >= promo.start_date)) &&
      (!minimumHoursValue || Number.parseFloat(minimumHoursValue) > 0) &&
      (!minimumSpendValue || Number.parseFloat(minimumSpendValue) > 0)
    );
  });
  const isFormComplete =
    studioName.trim().length > 0 &&
    description.trim().length > 0 &&
    Boolean(address && latitude && longitude) &&
    hasValidStudioPricing &&
    hasValidRecordingRules &&
    selectedImages.length > 0 &&
    haveValidPromotions;

  const convertTo24HourForSchedule = (time12: string): string => {
    const [time, modifier] = time12.split(" ");
    if (!modifier) return time;
    let [hours, minutes] = time.split(":");
    if (hours === "12") {
      hours = "00";
    }
    if (modifier === "PM") {
      hours = String(parseInt(hours, 10) + 12);
    }
    return `${hours.padStart(2, "0")}:${minutes}`;
  };

  const getDayOfWeekName = (dateStr: string): string => {
    const date = parseLocalDateKey(dateStr);
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return days[date.getDay()];
  };

  const getEditedAvailableSlotsForDate = (
    dateStr: string,
    protectedDateOverrides: ProtectedDateOverrideMap =
      nearTermProtectedDateOverridesRef.current,
  ): { start: string; end: string }[] => {
    const protectedOverride = protectedDateOverrides[dateStr];
    if (protectedOverride) {
      return protectedOverride.slots;
    }

    if (selectedDates[dateStr]?.selected) {
      if (!selectedDates[dateStr].slots.length) {
        return [];
      }
      return selectedDates[dateStr].slots.map((slot) => ({
        start: convertTo24HourForSchedule(slot.start),
        end: convertTo24HourForSchedule(slot.end),
      }));
    }

    if (!isWeeklyScheduleDateAllowed(dateStr)) {
      return [];
    }

    const dayName = getDayOfWeekName(dateStr);
    const daySchedule = availability.find((a) => a.day === dayName);
    if (!daySchedule || !daySchedule.slots.length) {
      return [];
    }

    return daySchedule.slots.map((slot) => ({
      start: convertTo24HourForSchedule(slot.start),
      end: convertTo24HourForSchedule(slot.end),
    }));
  };

  const bookingFitsInSlots = (
    bookingStart: string,
    bookingEnd: string,
    slots: { start: string; end: string }[],
  ): boolean => {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const bStart = toMinutes(bookingStart);
    const bEnd = toMinutes(bookingEnd);

    return slots.some((slot) => {
      const sStart = toMinutes(slot.start);
      const sEnd = toMinutes(slot.end);
      return bStart >= sStart && bEnd <= sEnd;
    });
  };

  const findScheduleConflictsForEditedState = async (
    studioId: string,
    protectedDateOverrides: ProtectedDateOverrideMap =
      nearTermProtectedDateOverridesRef.current,
  ) => {
    const today = getLocalDateKey();

    const { data: existingBookings, error: bookingsError } = await supabase
      .from("studio_bookings")
      .select(
        `
          id,
          booking_date,
          start_time,
          end_time,
          status,
          user_id,
          profiles:user_id (
            full_name,
            email
          )
        `,
      )
      .eq("studio_id", studioId)
      .in("status", ["pending", "confirmed", "pending_relocation"])
      .gte("booking_date", today);

    if (bookingsError) {
      throw new Error(
        `Failed to check booking conflicts: ${bookingsError.message}`,
      );
    }

    const conflicts: ConflictingBooking[] = [];

    if (existingBookings && existingBookings.length > 0) {
      for (const booking of existingBookings) {
        const bookingDate = booking.booking_date;
        const bookingStart = booking.start_time.substring(0, 5);
        const bookingEnd = booking.end_time.substring(0, 5);
        const availableSlots = getEditedAvailableSlotsForDate(
          bookingDate,
          protectedDateOverrides,
        );

        const bookingFits = bookingFitsInSlots(
          bookingStart,
          bookingEnd,
          availableSlots,
        );

        if (!bookingFits) {
          const profile = booking.profiles as any;
          const conflict: ConflictingBooking = {
            id: booking.id,
            booking_date: bookingDate,
            start_time: booking.start_time,
            end_time: booking.end_time,
            status: booking.status,
            user_id: booking.user_id,
            user_name: profile?.full_name || "Unknown",
            user_email: profile?.email || "",
            conflictType:
              availableSlots.length === 0 ? "date_removed" : "time_overlap",
            newAvailableSlot: null,
          };

          const nextSlot = await findNextAvailableSlot(
            studioId,
            bookingDate,
            bookingStart,
            bookingEnd,
            protectedDateOverrides,
          );
          conflict.newAvailableSlot = nextSlot;
          conflicts.push(conflict);
        }
      }
    }

    const { data: activeHolds, error: holdsError } = await supabase
      .from("booking_holds")
      .select("id, user_id, booking_date, start_time, end_time, expires_at")
      .eq("studio_id", studioId)
      .gte("booking_date", today)
      .gt("expires_at", new Date().toISOString());

    if (holdsError) {
      throw new Error(
        `Failed to check active booking holds: ${holdsError.message}`,
      );
    }

    const conflictingHoldCount = (activeHolds || []).filter((hold: any) => {
      const holdStart = hold.start_time.substring(0, 5);
      const holdEnd = hold.end_time.substring(0, 5);
      const availableSlots = getEditedAvailableSlotsForDate(
        hold.booking_date,
        protectedDateOverrides,
      );
      return !bookingFitsInSlots(holdStart, holdEnd, availableSlots);
    }).length;

    return { conflicts, conflictingHoldCount };
  };

  const getScheduleSlotsForDate = (
    dateStr: string,
    weeklySchedule: WeeklyAvailabilityDay[],
    dateOverrides: {
      [date: string]: {
        selected: boolean;
        slots: { start: string; end: string }[];
        sessionType?: DateOverrideSessionType;
      };
    },
  ): { start: string; end: string }[] => {
    if (dateOverrides[dateStr]?.selected) {
      return (dateOverrides[dateStr].slots || []).map((slot) => ({
        start: convertTo24HourForSchedule(slot.start),
        end: convertTo24HourForSchedule(slot.end),
      }));
    }

    const dayName = getDayOfWeekName(dateStr);
    const daySchedule = weeklySchedule.find((a) => a.day === dayName);
    if (
      !daySchedule ||
      !daySchedule.slots.length ||
      !weeklyScheduleAllowsDate(dateStr, daySchedule)
    ) {
      return [];
    }

    return daySchedule.slots.map((slot) => ({
      start: convertTo24HourForSchedule(slot.start),
      end: convertTo24HourForSchedule(slot.end),
    }));
  };

  const oldSlotCoveredByNewSlots = (
    oldSlot: { start: string; end: string },
    newSlots: { start: string; end: string }[],
  ): boolean => {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const oldStart = toMinutes(oldSlot.start);
    const oldEnd = toMinutes(oldSlot.end);
    return newSlots.some((newSlot) => {
      const newStart = toMinutes(newSlot.start);
      const newEnd = toMinutes(newSlot.end);
      return newStart <= oldStart && newEnd >= oldEnd;
    });
  };

  const slotOverlapsLockWindow = (
    dateStr: string,
    slot: { start: string; end: string },
    windowStart: Date,
    windowEnd: Date,
  ): boolean => {
    const slotStart = getLocalDateTime(dateStr, slot.start);
    const slotEnd = getLocalDateTime(dateStr, slot.end);
    return slotEnd > windowStart && slotStart < windowEnd;
  };

  const detectNearTermScheduleReduction = (
    lockHours: number,
  ): {
    blocked: boolean;
    affectedDate?: string;
    protectedDateOverrides: ProtectedDateOverrideMap;
  } => {
    const now = new Date();
    const horizon = new Date(now.getTime() + lockHours * 60 * 60 * 1000);
    const horizonKey = getLocalDateKey(horizon);
    const iterDate = parseLocalDateKey(getLocalDateKey(now));
    const datesToCheck = new Set<string>();
    const protectedDateOverrides: ProtectedDateOverrideMap = {};

    while (getLocalDateKey(iterDate) <= horizonKey) {
      datesToCheck.add(getLocalDateKey(iterDate));
      iterDate.setDate(iterDate.getDate() + 1);
    }

    for (const dateStr of datesToCheck) {
      const oldSlots = getScheduleSlotsForDate(
        dateStr,
        originalAvailabilityRef.current,
        originalSelectedDatesRef.current,
      );
      const newSlots = getScheduleSlotsForDate(dateStr, availability, selectedDates);

      if (!oldSlots.length) {
        continue;
      }

      const reducedLockedSlot = oldSlots.some(
        (oldSlot) =>
          slotOverlapsLockWindow(dateStr, oldSlot, now, horizon) &&
          !oldSlotCoveredByNewSlots(oldSlot, newSlots),
      );
      if (!reducedLockedSlot) {
        continue;
      }

      const oldHadDateOverride =
        originalSelectedDatesRef.current[dateStr]?.selected;
      const newHasDateOverride = selectedDates[dateStr]?.selected;

      if (oldHadDateOverride || newHasDateOverride) {
        return {
          blocked: true,
          affectedDate: dateStr,
          protectedDateOverrides: {},
        };
      }

      const dayName = getDayOfWeekName(dateStr);
      const originalDaySchedule = originalAvailabilityRef.current.find(
        (a) => a.day === dayName,
      );
      protectedDateOverrides[dateStr] = {
        slots: oldSlots,
        sessionType: normalizeDateOverrideSessionType(
          originalDaySchedule?.sessionType,
          getDefaultDateOverrideSessionType(studioType),
        ),
      };
    }

    return { blocked: false, protectedDateOverrides };
  };

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
      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        showAlert("warning", "Invalid Studio", "Invalid studio ID. Please try again.");
        setSaving(false);
        return;
      }

      const reductionCheck = detectNearTermScheduleReduction(48);
      if (reductionCheck.blocked) {
        showAlert(
          "warning",
          "Schedule Change Locked",
          `You can't reduce or close availability within the next 48 hours. First affected date: ${reductionCheck.affectedDate}.`,
        );
        setSaving(false);
        return;
      }
      nearTermProtectedDateOverridesRef.current =
        reductionCheck.protectedDateOverrides;

      // Check for booking conflicts before saving

      const { conflicts, conflictingHoldCount } =
        await findScheduleConflictsForEditedState(
          studioId,
          reductionCheck.protectedDateOverrides,
        );

      if (conflicts.length > 0) {
        setConflictingBookings(conflicts);
        setConflictModalVisible(true);
        setSaving(false);
        return;
      }

      if (conflictingHoldCount > 0) {
        showAlert(
          "warning",
          "Active Checkout Holds",
          `${conflictingHoldCount} active checkout hold(s) conflict with your edited schedule. Please try again in a moment after those holds expire.`,
        );
        setSaving(false);
        return;
      }

      await executeSave(reductionCheck.protectedDateOverrides);
    } catch (e: any) {
      logActionError("edit_studio.preflight_failed", e, {
        studioId: Array.isArray(id) ? id[0] : id,
      });
      showAlert(
        "warning",
        "Couldn't Save Studio",
        `Failed to save: ${formatSupabaseError(e)}`,
      );
      setSaving(false);
    }
  };

  // Find next available slot for a booking
  const findNextAvailableSlot = async (
    studioId: string,
    currentDate: string,
    bookingStart: string,
    bookingEnd: string,
    protectedDateOverrides: ProtectedDateOverrideMap =
      nearTermProtectedDateOverridesRef.current,
  ): Promise<{ date: string; start_time: string; end_time: string } | null> => {
    const bookingDuration = (() => {
      const [sH, sM] = bookingStart.split(":").map(Number);
      const [eH, eM] = bookingEnd.split(":").map(Number);
      return eH * 60 + eM - (sH * 60 + sM);
    })();

    // Helper function to convert 12-hour to 24-hour format
    const convertTo24Hour = (time12: string): string => {
      const [time, modifier] = time12.split(" ");
      if (!modifier) return time;
      let [hours, minutes] = time.split(":");
      if (hours === "12") hours = "00";
      if (modifier === "PM") hours = String(parseInt(hours, 10) + 12);
      return `${hours.padStart(2, "0")}:${minutes}`;
    };

    const getDayOfWeek = (dateStr: string): string => {
      const date = parseLocalDateKey(dateStr);
      const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      return days[date.getDay()];
    };

    // Search for next 30 days
    const startDate = parseLocalDateKey(currentDate);
    startDate.setDate(startDate.getDate() + 1); // Start from next day

    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dateStr = getLocalDateKey(checkDate);

      // Get available slots for this date
      let availableSlots: { start: string; end: string }[] = [];

      // Check date overrides first
      if (protectedDateOverrides[dateStr]) {
        availableSlots = protectedDateOverrides[dateStr].slots;
      } else if (
        selectedDates[dateStr]?.selected &&
        selectedDates[dateStr]?.slots.length > 0
      ) {
        availableSlots = selectedDates[dateStr].slots.map((slot) => ({
          start: convertTo24Hour(slot.start),
          end: convertTo24Hour(slot.end),
        }));
      } else {
        // Check weekly schedule
        if (isWeeklyScheduleDateAllowed(dateStr)) {
          const dayName = getDayOfWeek(dateStr);
          const daySchedule = availability.find((a) => a.day === dayName);
          if (daySchedule && daySchedule.slots.length > 0) {
            availableSlots = daySchedule.slots.map((slot) => ({
              start: convertTo24Hour(slot.start),
              end: convertTo24Hour(slot.end),
            }));
          }
        }
      }

      if (availableSlots.length === 0) continue;

      // Check existing bookings on this date
      const { data: existingOnDate } = await supabase
        .from("studio_bookings")
        .select("start_time, end_time")
        .eq("studio_id", studioId)
        .eq("booking_date", dateStr)
        .in("status", ["pending", "confirmed", "pending_relocation"]);

      // Find a slot that can fit the booking
      for (const slot of availableSlots) {
        const slotStart = slot.start;
        const slotEnd = slot.end;

        // Calculate slot duration in minutes
        const [ssH, ssM] = slotStart.split(":").map(Number);
        const [seH, seM] = slotEnd.split(":").map(Number);
        const slotDuration = seH * 60 + seM - (ssH * 60 + ssM);

        if (slotDuration < bookingDuration) continue;

        // Check if there's room considering existing bookings
        const bookedTimes = (existingOnDate || []).map((b: any) => ({
          start: b.start_time.substring(0, 5),
          end: b.end_time.substring(0, 5),
        }));

        // Try to find a free window within the slot
        let currentTime = ssH * 60 + ssM;
        const slotEndMinutes = seH * 60 + seM;

        while (currentTime + bookingDuration <= slotEndMinutes) {
          const proposedStart = `${String(Math.floor(currentTime / 60)).padStart(2, "0")}:${String(currentTime % 60).padStart(2, "0")}`;
          const proposedEnd = `${String(Math.floor((currentTime + bookingDuration) / 60)).padStart(2, "0")}:${String((currentTime + bookingDuration) % 60).padStart(2, "0")}`;

          // Check if this time conflicts with existing bookings
          const hasConflict = bookedTimes.some((bt: any) => {
            const btStart = bt.start.split(":").map(Number);
            const btEnd = bt.end.split(":").map(Number);
            const btStartMin = btStart[0] * 60 + btStart[1];
            const btEndMin = btEnd[0] * 60 + btEnd[1];
            // Check overlap
            return !(
              currentTime + bookingDuration <= btStartMin ||
              currentTime >= btEndMin
            );
          });

          if (!hasConflict) {
            return {
              date: dateStr,
              start_time: proposedStart,
              end_time: proposedEnd,
            };
          }

          // Move to next slot increment (30 minutes)
          currentTime += 30;
        }
      }
    }

    return null; // No available slot found
  };

  // Handle conflict resolution
  const handleConflictResolution = async (
    resolutions: ConflictResolution[],
  ) => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaving(false);
        return;
      }

      const studioId = Array.isArray(id) ? id[0] : id;

      for (const resolution of resolutions) {
        if (resolution.action === "cancel") {
          // Cancel the booking
          const { error } = await supabase
            .from("studio_bookings")
            .update({
              status: "cancelled",
              cancellation_reason:
                "Studio schedule was updated by owner. Booking no longer fits available times.",
            })
            .eq("id", resolution.bookingId);

          if (error) {
            console.error("Error cancelling booking:", error);
            throw error;
          }

          // Create notification for the user
          const conflict = conflictingBookings.find(
            (c) => c.id === resolution.bookingId,
          );
          if (conflict) {
            const { error: notificationError } = await supabase.from("notifications").insert({
              user_id: conflict.user_id,
              type: "warning",
              title: "Booking Cancelled",
              message: `Your booking at ${studioName} on ${formatDashedNumericDate(conflict.booking_date)} has been cancelled due to schedule changes. You will receive a refund.`,
              meta: buildNotificationRouteMeta("/bookings", undefined, {
                bookingId: resolution.bookingId,
                studioId,
              }),
            });
            if (notificationError) {
              logActionError("edit_studio.cancel_booking_notification_failed", notificationError, {
                bookingId: resolution.bookingId,
                studioId,
                userId: conflict.user_id,
              });
              throw new Error(`Failed to notify booking customer: ${formatSupabaseError(notificationError)}`);
            }
          }
        } else if (resolution.action === "move" && resolution.newSlot) {
          const targetSlots = getEditedAvailableSlotsForDate(
            resolution.newSlot.date,
          );
          const moveFitsEditedSchedule = bookingFitsInSlots(
            resolution.newSlot.start_time,
            resolution.newSlot.end_time,
            targetSlots,
          );

          if (!moveFitsEditedSchedule) {
            throw new Error(
              "Selected move slot no longer fits the edited schedule. Please pick a different slot.",
            );
          }

          const { data: overlappingBookings, error: overlapBookingsError } =
            await supabase
              .from("studio_bookings")
              .select("id, start_time, end_time")
              .eq("studio_id", studioId)
              .eq("booking_date", resolution.newSlot.date)
              .in("status", ["pending", "confirmed", "pending_relocation"])
              .neq("id", resolution.bookingId);

          if (overlapBookingsError) {
            throw new Error(
              `Failed to validate move target: ${overlapBookingsError.message}`,
            );
          }

          const toMinutes = (time: string) => {
            const [h, m] = time.substring(0, 5).split(":").map(Number);
            return h * 60 + m;
          };

          const moveStartMinutes = toMinutes(resolution.newSlot.start_time);
          const moveEndMinutes = toMinutes(resolution.newSlot.end_time);

          const hasBookingOverlap = (overlappingBookings || []).some(
            (booking: any) => {
              const existingStart = toMinutes(booking.start_time);
              const existingEnd = toMinutes(booking.end_time);
              return !(
                moveEndMinutes <= existingStart ||
                moveStartMinutes >= existingEnd
              );
            },
          );

          if (hasBookingOverlap) {
            throw new Error(
              "Selected move slot is no longer available because of another booking.",
            );
          }

          const { data: overlappingHolds, error: overlapHoldsError } =
            await supabase
              .from("booking_holds")
              .select("id, user_id, start_time, end_time")
              .eq("studio_id", studioId)
              .eq("booking_date", resolution.newSlot.date)
              .gt("expires_at", new Date().toISOString());

          if (overlapHoldsError) {
            throw new Error(
              `Failed to validate temporary holds for move: ${overlapHoldsError.message}`,
            );
          }

          const movedBooking = conflictingBookings.find(
            (c) => c.id === resolution.bookingId,
          );
          const movedBookingUserId = movedBooking?.user_id;

          const hasHoldOverlap = (overlappingHolds || []).some((hold: any) => {
            if (movedBookingUserId && hold.user_id === movedBookingUserId) {
              return false;
            }
            const holdStart = toMinutes(hold.start_time);
            const holdEnd = toMinutes(hold.end_time);
            return !(moveEndMinutes <= holdStart || moveStartMinutes >= holdEnd);
          });

          if (hasHoldOverlap) {
            throw new Error(
              "Selected move slot is currently held in another user's checkout.",
            );
          }

          const relocationExpiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString();

          // Convert move into musician approval flow (pending relocation).
          const { error } = await supabase
            .from("studio_bookings")
            .update({
              status: "pending_relocation",
              relocation_requested_at: new Date().toISOString(),
              relocation_proposed_date: resolution.newSlot.date,
              relocation_proposed_start_time: resolution.newSlot.start_time,
              relocation_proposed_end_time: resolution.newSlot.end_time,
              relocation_expires_at: relocationExpiresAt,
              notes: `Pending relocation requested by studio owner. Proposed slot: ${resolution.newSlot.date} ${resolution.newSlot.start_time}-${resolution.newSlot.end_time}. Expires: ${relocationExpiresAt}`,
            })
            .eq("id", resolution.bookingId);

          if (error) {
            console.error("Error moving booking:", error);
            throw error;
          }

          // Create notification for the user
          const conflict = conflictingBookings.find(
            (c) => c.id === resolution.bookingId,
          );
          if (conflict) {
            const { error: notificationError } = await supabase.from("notifications").insert({
              user_id: conflict.user_id,
              type: "warning",
              title: "Booking Relocation Request",
              message: `Your booking at ${studioName} needs relocation to ${formatDashedNumericDate(resolution.newSlot.date)} at ${resolution.newSlot.start_time}. Please accept within 24 hours or your booking will be cancelled and refunded.`,
              meta: buildNotificationRouteMeta("/bookings", undefined, {
                bookingId: resolution.bookingId,
                studioId,
                relocation: {
                  status: "pending_relocation",
                  proposed_date: resolution.newSlot.date,
                  proposed_start_time: resolution.newSlot.start_time,
                  proposed_end_time: resolution.newSlot.end_time,
                  expires_at: relocationExpiresAt,
                },
              }),
            });
            if (notificationError) {
              logActionError("edit_studio.relocation_notification_failed", notificationError, {
                bookingId: resolution.bookingId,
                studioId,
                userId: conflict.user_id,
              });
              throw new Error(`Failed to notify booking customer: ${formatSupabaseError(notificationError)}`);
            }
          }
        }
      }

      // Close the modal and proceed with save
      setConflictModalVisible(false);
      setConflictingBookings([]);

      // Now save the studio changes
      await executeSave();
    } catch (e: any) {
      logActionError("edit_studio.resolve_conflicts_failed", e, {
        studioId: Array.isArray(id) ? id[0] : id,
      });
      showAlert(
        "warning",
        "Couldn't Save Studio",
        `Failed to resolve conflicts: ${formatSupabaseError(e)}`,
      );
      setSaving(false);
    }
  };

  const executeSave = async (
    protectedDateOverrides: ProtectedDateOverrideMap =
      nearTermProtectedDateOverridesRef.current,
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaving(false);
        return;
      }

      // Ensure id is a string, not an array
      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        showAlert("warning", "Invalid Studio", "Invalid studio ID. Please try again.");
        setSaving(false);
        return;
      }

      // Final preflight: re-check right before writing to reduce stale-state races.
      const { conflicts: latestConflicts, conflictingHoldCount } =
        await findScheduleConflictsForEditedState(
          studioId,
          protectedDateOverrides,
        );

      if (latestConflicts.length > 0) {
        setConflictingBookings(latestConflicts);
        setConflictModalVisible(true);
        showAlert(
          "warning",
          "New Booking Detected",
          "A booking changed while you were editing. Please resolve the new conflicts before saving.",
        );
        return;
      }

      if (conflictingHoldCount > 0) {
        showAlert(
          "warning",
          "Active Checkout Holds",
          `${conflictingHoldCount} active checkout hold(s) conflict with your edited schedule. Please try again shortly.`,
        );
        return;
      }

      // Helper function to convert 12-hour to 24-hour format
      const convertTo24Hour = (time12: string): string => {
        const [time, modifier] = time12.split(" ");
        if (!modifier) return time; // Already 24h or invalid
        let [hours, minutes] = time.split(":");
        if (hours === "12") {
          hours = "00";
        }
        if (modifier === "PM") {
          hours = String(parseInt(hours, 10) + 12);
        }
        return `${hours}:${minutes}`;
      };

      const todayKey = getLocalDateKey();

      // Convert calendar-based availability to the payload format.
      // Past overrides are intentionally omitted from the edit payload and left
      // untouched in the database for history/audit context.
      const selectedDateAvailability = Object.entries(selectedDates)
        .filter(([date, data]) => data.selected && date >= todayKey)
        .map(([date, data]) => ({
          date,
          session_type:
            studioType === "Both"
              ? normalizeDateOverrideSessionType(
                data.sessionType,
                getDefaultDateOverrideSessionType(studioType),
              )
              : getDefaultDateOverrideSessionType(studioType),
          is_open: data.slots.length > 0,
          slots: data.slots.map((slot) => ({
            start: convertTo24Hour(slot.start),
            end: convertTo24Hour(slot.end),
          })),
        }));

      const protectedDateAvailability = Object.entries(protectedDateOverrides)
        .filter(([date]) => date >= todayKey && !selectedDates[date]?.selected)
        .map(([date, data]) => ({
          date,
          session_type: normalizeDateOverrideSessionType(
            data.sessionType,
            getDefaultDateOverrideSessionType(studioType),
          ),
          is_open: data.slots.length > 0,
          slots: data.slots,
        }));

      const calendarAvailability = [
        ...selectedDateAvailability,
        ...protectedDateAvailability,
      ].sort((a, b) => a.date.localeCompare(b.date));

      const equipmentPayload = equipment.map((e) => ({
        name: e.name,
        quantity: e.quantity,
        description: e.description,
        image: e.image,
      }));
      const presetPayload = selectedInstruments
        .filter((preset) => !equipment.some((e) => e.name === preset.name))
        .map((preset) => ({ name: preset.name, image: preset.image }));
      const instrumentsPayload = [...equipmentPayload, ...presetPayload];

      const orderedImages =
        selectedImages.length > 0 && selectedImages[thumbnailIndex]
          ? [
            selectedImages[thumbnailIndex],
            ...selectedImages.filter((_, i) => i !== thumbnailIndex),
          ]
          : selectedImages;

      const parsedRehearsalRate = parseFloat(rehearsalRate) || 0;
      const parsedRecordingRate = parseFloat(recordingRate) || 0;
      const effectiveRehearsalRate =
        studioType === "Recording" ? 0 : parsedRehearsalRate;
      const effectiveRecordingRate =
        studioType === "Rehearsal" ? 0 : parsedRecordingRate;

      const payload = {
        name: studioName,
        type: studioType,
        description,
        address,
        // Dynamic pricing based on studio type
        hourly_rate:
          studioType === "Recording"
            ? effectiveRecordingRate
            : effectiveRehearsalRate,
        rehearsal_rate: effectiveRehearsalRate,
        recording_rate: effectiveRecordingRate,
        pax: pax ? parseInt(pax) : null,
        amenities,
        instruments: instrumentsPayload,
        latitude,
        longitude,
        images: orderedImages,
        contract_url: contractUrl || null,
        business_permit_url: businessPermitUrl || null,
        availability: availability
          .filter((day) => day.slots.length > 0)
          .map((day) => {
            const dayWeeklyScope = normalizeWeeklyScheduleScope(
              day.weeklyScheduleScope,
            );
            return {
              day: day.day,
              session_type:
                studioType === "Both"
                  ? normalizeWeeklySessionType(
                      day.sessionType,
                      getDefaultWeeklySessionType(studioType),
                    )
                  : getDefaultWeeklySessionType(studioType),
              weekly_schedule_scope: dayWeeklyScope,
              weekly_schedule_end_date:
                dayWeeklyScope === "until" ? day.weeklyScheduleEndDate : null,
              weekly_schedule_dates:
                dayWeeklyScope === "specific_dates"
                  ? toWeeklyScheduleDateList(day.weeklyScheduleDates)
                  : [],
              slots: day.slots.map((slot) => ({
                start: convertTo24Hour(slot.start),
                end: convertTo24Hour(slot.end),
              })),
            };
          }),
        calendar_availability: calendarAvailability,
        // Booking settings - default 24hr advance booking
        booking_settings: {
          lead_time_hours: 24,
          weekend_multiplier: 1.0,
          peak_season_multiplier: 1.0,
          peak_season_dates: [],
          off_peak_multiplier: 1.0,
          off_peak_dates: [],
          min_booking_duration_hours:
            studioType === "Recording" || studioType === "Both"
              ? parsePositiveDecimal(recordingHoursPerBlock) || 3
              : 2,
          recording_songs_per_block:
            parsePositiveInteger(recordingSongsPerBlock) || 1,
          recording_hours_per_block:
            parsePositiveDecimal(recordingHoursPerBlock) || 3,
          recording_rate_negotiable: false,
          weekly_schedule_scope: "indefinite",
          weekly_schedule_end_date: null,
          weekly_schedule_dates: [],
        },
      };


      // Direct update to studios table
      const { data: studioData, error: updateError } = await supabase
        .from('studios')
        .update({
          name: payload.name,
          description: payload.description,
          address: payload.address,
          hourly_rate: payload.hourly_rate,
          rehearsal_rate: payload.rehearsal_rate,
          recording_rate: payload.recording_rate,
          pax: payload.pax,
          latitude: payload.latitude,
          longitude: payload.longitude,
          contract_url: payload.contract_url,
          business_permit_url: payload.business_permit_url,
          permit_status: 'approved',
          permit_rejection_reason: null,
          permit_admin_notes: null,
          permit_reviewed_by: null,
          permit_reviewed_at: null,
          studio_type: normalizeStudioTypeColumnValue(payload.type),
        })
        .eq('id', studioId)
        .select()
        .single();


      if (updateError) {
        logActionError("edit_studio.update_base_failed", updateError, {
          studioId,
          userId: user.id,
          studioType: payload.type,
        });
        let alertMessage = `Failed to update studio: ${updateError.message}`;
        if (updateError.hint) alertMessage += `\n\nHint: ${updateError.hint}`;
        if (updateError.details) alertMessage += `\n\nDetails: ${updateError.details}`;
        throw new Error(alertMessage);
      }

      setPermitStatus("approved");
      setPermitRejectionReason("");

      const { error: deleteTypesError } = await supabase
        .from('studio_types')
        .delete()
        .eq('studio_id', studioId);
      if (deleteTypesError) {
        logActionError("edit_studio.clear_types_failed", deleteTypesError, { studioId });
        throw new Error(`Failed to clear studio types: ${formatSupabaseError(deleteTypesError)}`);
      }
      const normalizedTypes = resolveStudioTypeRows(payload.type);
      if (normalizedTypes.length > 0) {
        const { error: typeError } = await supabase
          .from('studio_types')
          .insert(
            normalizedTypes.map((studio_type: string) => ({
              studio_id: studioId,
              studio_type,
            })),
          );
        if (typeError) {
          logActionError("edit_studio.save_types_failed", typeError, {
            studioId,
            types: normalizedTypes,
          });
          throw new Error(`Failed to sync studio types: ${formatSupabaseError(typeError)}`);
        }
      }

      const { error: deleteAmenitiesError } = await supabase
        .from('studio_amenities')
        .delete()
        .eq('studio_id', studioId);
      if (deleteAmenitiesError) {
        logActionError("edit_studio.clear_amenities_failed", deleteAmenitiesError, { studioId });
        throw new Error(`Failed to clear studio amenities: ${formatSupabaseError(deleteAmenitiesError)}`);
      }
      if ((payload.amenities || []).length > 0) {
        const { error: amenitiesError } = await supabase
          .from('studio_amenities')
          .insert(
            payload.amenities.map((amenity: string) => ({
              studio_id: studioId,
              amenity,
            })),
          );
        if (amenitiesError) {
          logActionError("edit_studio.save_amenities_failed", amenitiesError, {
            studioId,
            amenities: payload.amenities,
          });
          throw new Error(`Failed to sync studio amenities: ${formatSupabaseError(amenitiesError)}`);
        }
      }

      const { error: deleteInstrumentsError } = await supabase
        .from('studio_instruments')
        .delete()
        .eq('studio_id', studioId);
      if (deleteInstrumentsError) {
        logActionError("edit_studio.clear_instruments_failed", deleteInstrumentsError, { studioId });
        throw new Error(`Failed to clear studio instruments: ${formatSupabaseError(deleteInstrumentsError)}`);
      }
      if ((payload.instruments || []).length > 0) {
        const instrumentsError = await insertStudioInstrumentRows(
          studioId,
          payload.instruments,
        );
        if (instrumentsError) {
          logActionError("edit_studio.save_instruments_failed", instrumentsError, {
            studioId,
            count: payload.instruments.length,
          });
          throw new Error(`Failed to sync studio instruments: ${formatSupabaseError(instrumentsError)}`);
        }
      }

      const { error: deleteMediaError } = await supabase
        .from('studio_media')
        .delete()
        .eq('studio_id', studioId)
        .eq('media_type', 'image');
      if (deleteMediaError) {
        logActionError("edit_studio.clear_images_failed", deleteMediaError, { studioId });
        throw new Error(`Failed to clear studio images: ${formatSupabaseError(deleteMediaError)}`);
      }
      if ((payload.images || []).length > 0) {
        const { error: mediaError } = await supabase
          .from('studio_media')
          .insert(
            payload.images.map((media_url: string, index: number) => ({
              studio_id: studioId,
              media_type: 'image',
              media_url,
              sort_order: index,
            })),
          );
        if (mediaError) {
          logActionError("edit_studio.save_images_failed", mediaError, {
            studioId,
            imageCount: payload.images.length,
          });
          throw new Error(`Failed to sync studio images: ${formatSupabaseError(mediaError)}`);
        }
      }

      // Update studio settings
      const settingsRow = {
        studio_id: studioId,
        lead_time_hours: payload.booking_settings.lead_time_hours || 24,
        weekend_multiplier: payload.booking_settings.weekend_multiplier || 1.0,
        peak_season_multiplier: payload.booking_settings.peak_season_multiplier || 1.0,
        peak_season_dates: payload.booking_settings.peak_season_dates || [],
        off_peak_multiplier: payload.booking_settings.off_peak_multiplier || 1.0,
        off_peak_dates: payload.booking_settings.off_peak_dates || [],
        min_booking_duration_hours:
          parsePositiveDecimal(
            payload.booking_settings.min_booking_duration_hours,
          ) ||
          (studioType === 'Recording' || studioType === 'Both' ? 3 : 2),
        recording_songs_per_block:
          parsePositiveInteger(payload.booking_settings.recording_songs_per_block) || 1,
        recording_hours_per_block:
          parsePositiveDecimal(payload.booking_settings.recording_hours_per_block) ||
          parsePositiveDecimal(payload.booking_settings.min_booking_duration_hours) ||
          3,
        recording_rate_negotiable: false,
        weekly_schedule_scope: normalizeWeeklyScheduleScope(
          payload.booking_settings.weekly_schedule_scope,
        ),
        weekly_schedule_end_date:
          payload.booking_settings.weekly_schedule_scope === "until"
            ? payload.booking_settings.weekly_schedule_end_date
            : null,
        weekly_schedule_dates: Array.isArray(
          payload.booking_settings.weekly_schedule_dates,
        )
          ? payload.booking_settings.weekly_schedule_dates
          : [],
      };
      let { error: settingsError } = await supabase
        .from('studio_settings')
        .upsert(settingsRow, { onConflict: 'studio_id' });

      if (settingsError && isMissingWeeklyScheduleColumns(settingsError)) {
        logActionError("edit_studio.save_settings_weekly_columns_missing", settingsError, { studioId });
        ({ error: settingsError } = await supabase
          .from('studio_settings')
          .upsert(stripWeeklyScheduleColumns(settingsRow), {
            onConflict: 'studio_id',
          }));
      }

      if (settingsError) {
        logActionError("edit_studio.save_settings_failed", settingsError, { studioId });
        throw new Error(`Failed to save booking settings: ${formatSupabaseError(settingsError)}`);
      }

      // Update promotions (delete-and-re-insert)
      const { error: deletePromotionsError } = await supabase
        .from('studio_promotions')
        .delete()
        .eq('studio_id', studioId);
      if (deletePromotionsError) {
        logActionError("edit_studio.clear_promotions_failed", deletePromotionsError, { studioId });
        throw new Error(`Failed to clear promotions: ${formatSupabaseError(deletePromotionsError)}`);
      }
      if (promotions.length > 0) {
        const { error: promosError } = await supabase
          .from('studio_promotions')
          .insert(
            promotions.map((promo) => ({
              studio_id: studioId,
              name: promo.name,
              description: buildPromotionDescription(promo.description) || null,
              criteria: promo.criteria.trim() || null,
              minimum_booking_hours: parsePositiveDecimal(
                promo.minimum_booking_hours,
              ),
              minimum_spend: parsePositiveDecimal(promo.minimum_spend),
              discount_type: promo.discount_type,
              discount_value: parseFloat(promo.discount_value),
              is_permanent: promo.is_permanent,
              start_date: promo.is_permanent ? null : promo.start_date,
              end_date: promo.is_permanent ? null : promo.end_date,
              applies_to: promo.applies_to,
              is_active: true,
            })),
          );
        if (promosError) {
          logActionError("edit_studio.save_promotions_failed", promosError, {
            studioId,
            count: promotions.length,
          });
          throw new Error(`Failed to save promotions: ${formatSupabaseError(promosError)}`);
        }
      }

      // Update operating hours
      const { error: deleteOperatingHoursError } = await supabase
        .from('studio_operating_hours')
        .delete()
        .eq('studio_id', studioId);
      if (deleteOperatingHoursError) {
        logActionError("edit_studio.clear_operating_hours_failed", deleteOperatingHoursError, { studioId });
        throw new Error(
          `Failed to clear weekly schedule: ${formatSupabaseError(deleteOperatingHoursError)}`,
        );
      }

      const dayMap: { [key: string]: number } = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
      };
      let operatingHours: any[] = [];

      if (payload.availability && Array.isArray(payload.availability) && payload.availability.length > 0) {
        for (const daySchedule of payload.availability) {
          const dayIndex = dayMap[daySchedule.day];
          if (dayIndex !== undefined && daySchedule.slots && daySchedule.slots.length > 0) {
            daySchedule.slots.forEach((slot: any, slotIndex: number) => {
              operatingHours.push({
                studio_id: studioId,
                day_of_week: dayIndex,
                is_open: true,
                open_time: slot.start,
                close_time: slot.end,
                slot_order: slotIndex,
                weekly_schedule_scope: normalizeWeeklyScheduleScope(
                  daySchedule.weekly_schedule_scope,
                ),
                weekly_schedule_end_date:
                  daySchedule.weekly_schedule_scope === "until"
                    ? daySchedule.weekly_schedule_end_date
                    : null,
                weekly_schedule_dates: Array.isArray(
                  daySchedule.weekly_schedule_dates,
                )
                  ? daySchedule.weekly_schedule_dates
                  : [],
                reason: buildWeeklyScheduleReason(
                  normalizeWeeklySessionType(
                    daySchedule.session_type,
                    getDefaultWeeklySessionType(studioType),
                  ),
                ),
              });
            });
          }
        }
      }

      if (operatingHours.length > 0) {
        let { error: operatingHoursError } = await supabase
          .from('studio_operating_hours')
          .insert(operatingHours);

        if (operatingHoursError && isMissingWeeklyScheduleColumns(operatingHoursError)) {
          logActionError("edit_studio.save_operating_hours_weekly_columns_missing", operatingHoursError, {
            studioId,
            rowCount: operatingHours.length,
          });
          ({ error: operatingHoursError } = await supabase
            .from('studio_operating_hours')
            .insert(operatingHours.map(stripWeeklyScheduleColumns)));
        }

        if (operatingHoursError) {
          logActionError("edit_studio.save_operating_hours_failed", operatingHoursError, {
            studioId,
            rowCount: operatingHours.length,
          });
          throw new Error(
            `Failed to save weekly schedule: ${formatSupabaseError(operatingHoursError)}`,
          );
        }
      }

      // Update calendar date overrides
      const { error: deleteDateOverridesError } = await supabase
        .from('studio_date_overrides')
        .delete()
        .eq('studio_id', studioId)
        .gte('override_date', todayKey);
      if (deleteDateOverridesError) {
        logActionError("edit_studio.clear_date_overrides_failed", deleteDateOverridesError, { studioId });
        throw new Error(
          `Failed to clear future calendar availability: ${formatSupabaseError(deleteDateOverridesError)}`,
        );
      }

      if (payload.calendar_availability && Array.isArray(payload.calendar_availability) && payload.calendar_availability.length > 0) {
        const dateOverrides = payload.calendar_availability
          .filter((entry: any) => entry.date && entry.date >= todayKey)
          .flatMap((entry: any) => {
            const hasSlots = Array.isArray(entry.slots) && entry.slots.length > 0;
            const slots = hasSlots ? entry.slots : [null];
            return slots.map((slot: any, slotIndex: number) => ({
              studio_id: studioId,
              override_date: entry.date,
              is_open: Boolean(slot),
              open_time: slot ? slot.start : null,
              close_time: slot ? slot.end : null,
              slot_order: slotIndex,
              reason: buildDateOverrideReason(
                parseDateOverrideSessionType(
                  entry.session_type,
                  getDefaultDateOverrideSessionType(studioType),
                ),
                Boolean(slot),
              ),
            }));
          });

        if (dateOverrides.length > 0) {
          const { error: dateOverridesError } = await supabase
            .from('studio_date_overrides')
            .insert(dateOverrides);
          if (dateOverridesError) {
            logActionError("edit_studio.save_date_overrides_failed", dateOverridesError, {
              studioId,
              rowCount: dateOverrides.length,
            });
            throw new Error(
              `Failed to save calendar availability: ${formatSupabaseError(dateOverridesError)}`,
            );
          }
        }
      }

      const response = { data: studioData, error: null };

      // Check if data indicates an error
      if (!response.data) {
        throw new Error("No data returned from server");
      }

      clearListingDetailsCache(studioId);
      invalidateListingCaches(user.id, ["details", "home", "search", "bookings"]);

      const successMessage = "Studio updated successfully!";

      showAlert("success", "Success", successMessage, [
        {
          text: "OK",
          onPress: () => {
            handleReturnToTabs();
          },
        },
      ]);
    } catch (e: any) {
      logActionError("edit_studio.save_failed", e, {
        studioId: Array.isArray(id) ? id[0] : id,
      });
      showAlert(
        "warning",
        "Couldn't Save Studio",
        `Failed to update studio: ${formatSupabaseError(e)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    showAlert(
      "warning",
      "Save Changes",
      "Are you sure you want to update this studio profile?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save & Update",
          style: "default",
          onPress: () => performSave(),
        },
      ],
    );
  };

  const addAmenity = () => {
    if (newAmenity.trim()) {
      setAmenities([...amenities, newAmenity.trim()]);
      setNewAmenity("");
    }
  };

  const removeAmenity = (index: number) => {
    setAmenities(amenities.filter((_, i) => i !== index));
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

  // Equipment image upload state
  const [uploadingEquipmentImage, setUploadingEquipmentImage] = useState(false);

  // Pick and upload equipment image
  const pickEquipmentImage = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        return;
      }

      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert(
          "warning",
          "Permission Needed",
          "Please allow access to your photos.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: Platform.OS !== 'web',
      });

      if (result.canceled || !result.assets || result.assets.length === 0)
        return;

      setUploadingEquipmentImage(true);
      const asset = result.assets[0];
      const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${session.user.id}/equipment/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const contentType = `image/${fileExt}`;

      if (Platform.OS === 'web') {
        // On web, asset.uri is a blob URI, which can be fetched and converted to a blob
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const { data, error } = await supabase.storage
          .from("listings")
          .upload(fileName, blob, { contentType, upsert: false });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from("listings")
          .getPublicUrl(data.path);
        setEquipmentForm({ ...equipmentForm, image: urlData.publicUrl });

      } else {
        // On native, use the base64 string
        if (!asset.base64) {
          throw new Error("Image base64 data is missing on native platform.");
        }
        const bytes = base64ToUint8Array(asset.base64);
        const { data, error } = await supabase.storage
          .from("listings")
          .upload(fileName, bytes, { contentType, upsert: false });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from("listings")
          .getPublicUrl(data.path);
        setEquipmentForm({ ...equipmentForm, image: urlData.publicUrl });
      }
    } catch (error) {
      console.error("Error uploading equipment image:", error);
      showAlert("warning", "Upload Failed", "Failed to upload image. Please try again.");
    } finally {
      setUploadingEquipmentImage(false);
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
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={numeric ? "numeric" : "default"}
          style={[
            styles.input,
            {
              fontFamily: "Poppins_400Regular",
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

  const renderWeeklyScheduleDurationCard = (
    daySchedule: WeeklyAvailabilityDay,
    dayIndex: number,
  ) => (
    <View
      style={[
        styles.weeklyScopeInline,
        { borderTopColor: colors.border },
      ]}
    >
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 11,
          marginBottom: 8,
          fontFamily: "Poppins_600SemiBold",
        }}
      >
        {daySchedule.day.toUpperCase()} WEEKLY HOURS APPLY
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 12,
          marginBottom: 10,
          fontFamily: "Poppins_400Regular",
        }}
      >
        Choose how long {daySchedule.day} weekly hours should stay active. Date overrides still take priority.
      </Text>
      <View style={styles.sessionTypeOptions}>
        {([
          { value: "indefinite", label: "Every week" },
          { value: "until", label: "Until a date" },
        ] as const).map((option) => {
          const isSelected = daySchedule.weeklyScheduleScope === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              activeOpacity={1}
              onPress={() => {
                const nextScope = normalizeWeeklyScheduleScope(option.value);
                updateWeeklyScheduleForDay(dayIndex, {
                  weeklyScheduleScope: nextScope,
                });
                setActiveWeeklyEndDatePickerDay(
                  nextScope === "until" ? daySchedule.day : null,
                );
              }}
              style={[
                styles.sessionTypeChip,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected
                    ? `${colors.primary}20`
                    : "transparent",
                },
              ]}
            >
              <Text
                style={{
                  color: isSelected ? colors.primary : colors.textSecondary,
                  fontSize: 11,
                  lineHeight: 16,
                  includeFontPadding: false,
                  fontFamily: "Poppins_500Medium",
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {daySchedule.weeklyScheduleScope === "until" && (
        <View style={{ marginTop: 12 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              setActiveWeeklyEndDatePickerDay(
                activeWeeklyEndDatePickerDay === daySchedule.day
                  ? null
                  : daySchedule.day,
              )
            }
            style={{
              borderWidth: 1,
              borderColor: daySchedule.weeklyScheduleEndDate
                ? `${colors.primary}80`
                : colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: isDark ? "#111827" : "#FFFFFF",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                flex: 1,
                minWidth: 0,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${colors.primary}18`,
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 10,
                    fontFamily: "Poppins_600SemiBold",
                    textTransform: "uppercase",
                  }}
                >
                  {daySchedule.day} hours end on
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: daySchedule.weeklyScheduleEndDate
                      ? colors.text
                      : colors.textSecondary,
                    fontSize: 14,
                    marginTop: 2,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  {daySchedule.weeklyScheduleEndDate
                    ? formatReadableDate(daySchedule.weeklyScheduleEndDate)
                    : "Pick from calendar"}
                </Text>
              </View>
            </View>
            <Ionicons
              name={
                activeWeeklyEndDatePickerDay === daySchedule.day
                  ? "chevron-up"
                  : "chevron-down"
              }
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {daySchedule.weeklyScheduleEndDate ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                updateWeeklyScheduleForDay(dayIndex, {
                  weeklyScheduleEndDate: "",
                });
                setActiveWeeklyEndDatePickerDay(daySchedule.day);
              }}
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 8,
                paddingVertical: 6,
                paddingHorizontal: 2,
              }}
            >
              <Ionicons
                name="close-circle-outline"
                size={15}
                color={colors.textSecondary}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  fontFamily: "Poppins_500Medium",
                }}
              >
                Clear date
              </Text>
            </TouchableOpacity>
          ) : null}

          {activeWeeklyEndDatePickerDay === daySchedule.day && (
            <View
              style={{
                marginTop: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
                backgroundColor: isDark ? "#111827" : "#FFFFFF",
              }}
            >
              <Calendar
                current={daySchedule.weeklyScheduleEndDate || getLocalDateKey()}
                minDate={getLocalDateKey()}
                onDayPress={(day) => {
                  updateWeeklyScheduleForDay(dayIndex, {
                    weeklyScheduleEndDate: day.dateString,
                  });
                  setActiveWeeklyEndDatePickerDay(null);
                }}
                markedDates={
                  ISO_DATE_PATTERN.test(daySchedule.weeklyScheduleEndDate)
                    ? {
                        [daySchedule.weeklyScheduleEndDate]: {
                          selected: true,
                          selectedColor: colors.primary,
                          selectedTextColor: "#FFFFFF",
                        },
                      }
                    : {}
                }
                theme={{
                  backgroundColor: "transparent",
                  calendarBackground: "transparent",
                  textSectionTitleColor: colors.textSecondary,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: "#FFFFFF",
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: isDark ? "#4B5563" : "#D1D5DB",
                  monthTextColor: colors.text,
                  arrowColor: colors.primary,
                }}
              />
            </View>
          )}
        </View>
      )}
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
          Loading studio details...
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
        <Header title="Edit Studio" onBackPress={handleAttemptLeave} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.flex1}
        >
          {renderSectionHeader("Studio Details", "business", true)}
          {renderInput("Studio Name", studioName, setStudioName)}

          {/* Studio Type Selection */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Studio Type
            </Text>
            <View style={{ flexDirection: "row", gap: 12 , flexWrap: "wrap", minWidth: "100%" }}>
              {(["Rehearsal", "Recording", "Both"] as const).map((type) => (
                <TouchableOpacity activeOpacity={1}
                  key={type}
                  onPress={() => setStudioType(type)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor:
                      studioType === type
                        ? colors.primary
                        : isDark
                          ? "#374151"
                          : "#F3F4F6",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor:
                      studioType === type ? colors.primary : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color:
                        studioType === type ? "#FFF" : colors.textSecondary,
                      fontFamily: "Poppins_600SemiBold",
                      fontSize: type === "Both" ? 14 : 12,
                    }}
                  >
                    {type === "Both" ? "Both" : type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {renderInput("Description", description, setDescription, true)}

          {renderSectionHeader("Visuals", "image")}
          <ImageUploader
            images={selectedImages}
            onImagesChange={setSelectedImages}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
            maxImages={10}
            bucketName="listings"
            userId={id as string}
            folder="studios"
          />

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

          {/* Dynamic Pricing Section */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Pricing
            </Text>
            <Text
              style={[styles.inputSubLabel, { color: colors.textSecondary }]}
            >
              Set rates for each studio type
            </Text>

            {/* Rehearsal Rate */}
            {(studioType === "Rehearsal" || studioType === "Both") && (
              <View style={{ marginBottom: 12 }}>
                <View
                  style={[
                    styles.inputWrapper,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                    minWidth: 150 }}
                  >
                    <Ionicons
                      name="musical-notes"
                      size={20}
                      color={colors.primary}
                    />
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontFamily: "Poppins_500Medium",
                        minWidth: 80,
                      }}
                    >
                      Rehearsal
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: colors.text,
                      fontFamily: "Poppins_600SemiBold",
                      marginRight: 4,
                    }}
                  >
                    ₱
                  </Text>
                  <TextInput
                    value={rehearsalRate}
                    onChangeText={setRehearsalRate}
                    placeholder="500"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    style={{
                      color: colors.text,
                      fontFamily: "Poppins_600SemiBold",
                      fontSize: 16,
                      minWidth: 80,
                      textAlign: "center",
                      paddingVertical: 16,
                      textAlignVertical: "center",
                    }}
                  />
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_400Regular",
                      marginLeft: 4,
                    }}
                  >
                    /hr
                  </Text>
                </View>
              </View>
            )}

            {/* Recording Rate */}
            {(studioType === "Recording" || studioType === "Both") && (
              <View>
                <View
                  style={[
                    styles.inputWrapper,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                    minWidth: 150 }}
                  >
                    <Ionicons name="mic" size={20} color="#EF4444" />
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontFamily: "Poppins_500Medium",
                        minWidth: 80,
                      }}
                    >
                      Recording
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: colors.text,
                      fontFamily: "Poppins_600SemiBold",
                      marginRight: 4,
                    }}
                  >
                    ₱
                  </Text>
                  <TextInput
                    value={recordingRate}
                    onChangeText={setRecordingRate}
                    placeholder="1000"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    style={{
                      color: colors.text,
                      fontFamily: "Poppins_600SemiBold",
                      fontSize: 16,
                      minWidth: 80,
                      textAlign: "center",
                      paddingVertical: 16,
                      textAlignVertical: "center",
                    }}
                  />
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_400Regular",
                      marginLeft: 4,
                    }}
                  >
                    /song
                  </Text>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_500Medium",
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    Songs Per Time Block
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 16,
                      },
                    ]}
                  >
                    <Ionicons
                      name="musical-notes-outline"
                      size={20}
                      color="#EF4444"
                      style={{ marginRight: 10 }}
                    />
                    <TextInput
                      value={recordingSongsPerBlock}
                      onChangeText={(text) =>
                        setRecordingSongsPerBlock(text.replace(/[^0-9]/g, ""))
                      }
                      placeholder="e.g. 5"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="numeric"
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 15,
                        paddingVertical: 14,
                        textAlignVertical: "center",
                      }}
                    />
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontFamily: "Poppins_400Regular",
                      }}
                    >
                      songs
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_500Medium",
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    Hours Per Time Block
                  </Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 16,
                      },
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color="#EF4444"
                      style={{ marginRight: 10 }}
                    />
                    <TextInput
                      value={recordingHoursPerBlock}
                      onChangeText={(text) => {
                        const sanitized = text.replace(/[^0-9.]/g, "");
                        const firstDot = sanitized.indexOf(".");
                        const normalized =
                          firstDot === -1
                            ? sanitized
                            : `${sanitized.slice(0, firstDot + 1)}${sanitized
                                .slice(firstDot + 1)
                                .replace(/\./g, "")}`;
                        setRecordingHoursPerBlock(normalized);
                      }}
                      placeholder="e.g. 2"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 15,
                        paddingVertical: 14,
                        textAlignVertical: "center",
                      }}
                    />
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontFamily: "Poppins_400Regular",
                      }}
                    >
                      hrs
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_400Regular",
                      fontSize: 11,
                      marginTop: 6,
                    }}
                  >
                    Set songs and hours per time block to define your recording minimum. Musicians can still split the required hours across available dates and time slots.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Promotions (Optional) */}
          <View style={styles.inputContainer}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  Promotions (Optional)
                </Text>
                <Text style={[styles.inputSubLabel, { color: colors.textSecondary }]}>
                  Offer discounts to attract more bookings
                </Text>
              </View>
              {!showPromotionForm && promotions.length < 5 && (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => {
                    resetPromotionForm();
                    setShowPromotionForm(true);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: colors.primary + "15",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
                    Add
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Existing promotions list */}
            {promotions.map((promo) => (
              <View
                key={promo.id}
                style={{
                  backgroundColor: isDark ? "#1e1b4b" : "#EEF2FF",
                  borderWidth: 1,
                  borderColor: colors.primary + "40",
                  borderRadius: 12,
                  padding: 14,
                  marginTop: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, minWidth: 150, marginRight: 8 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
                      <Text style={{ fontFamily: "Poppins_600SemiBold", color: colors.text, fontSize: 14 }}>
                        {promo.name}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: "Poppins_400Regular", color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {promo.discount_type === "percentage" ? `${promo.discount_value}% off` : `₱${promo.discount_value}/hr off`}
                      {" "}on {promo.applies_to === "both" ? "all" : promo.applies_to} bookings
                    </Text>
                    {(promo.criteria || promo.minimum_booking_hours || promo.minimum_spend) && (
                      <Text style={{ fontFamily: "Poppins_400Regular", color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                        {[
                          promo.criteria ? `How to get promo: ${promo.criteria}` : null,
                          promo.minimum_booking_hours ? `Min ${promo.minimum_booking_hours} hr(s)` : null,
                          promo.minimum_spend ? `Min spend ₱${promo.minimum_spend}` : null,
                        ]
                          .filter(Boolean)
                          .join(" | ")}
                      </Text>
                    )}
                    <Text style={{ fontFamily: "Poppins_400Regular", color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                      {promo.is_permanent
                        ? "Always available"
                        : `${new Date(promo.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${new Date(promo.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 , flexWrap: "wrap", minWidth: "100%" }}>
                    <TouchableOpacity activeOpacity={1} onPress={() => handleEditPromotion(promo)}>
                      <Ionicons name="create-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={1} onPress={() => handleRemovePromotion(promo.id)}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}

            {promotions.length >= 5 && !showPromotionForm && (
              <Text style={{ fontFamily: "Poppins_400Regular", color: colors.textSecondary, fontSize: 11, marginTop: 8 }}>
                Maximum of 5 promotions reached.
              </Text>
            )}

            {/* Add/Edit promotion form */}
            {showPromotionForm && (
              <View
                style={{
                  backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                  borderRadius: 12,
                  padding: 16,
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                }}
              >
                <Text style={{ fontFamily: "Poppins_600SemiBold", color: colors.text, fontSize: 14, marginBottom: 12 }}>
                  {editingPromotion ? "Edit Promotion" : "New Promotion"}
                </Text>

                {/* Name */}
                <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                  Promotion Name *
                </Text>
                <TextInput
                  value={promotionForm.name}
                  onChangeText={(t) => setPromotionForm((p) => ({ ...p, name: t }))}
                  placeholder='e.g. "Summer Sale"'
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    backgroundColor: isDark ? "#111827" : "#FFF",
                    borderWidth: 1,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    borderRadius: 10,
                    padding: 12,
                    color: colors.text,
                    fontFamily: "Poppins_500Medium",
                    fontSize: 14,
                    marginBottom: 12,
                    textAlignVertical: "center",
                  }}
                />

                {/* Description */}
                <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                  Description (Optional)
                </Text>
                <TextInput
                  value={promotionForm.description}
                  onChangeText={(t) => setPromotionForm((p) => ({ ...p, description: t }))}
                  placeholder="Brief description of this promo"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  style={{
                    backgroundColor: isDark ? "#111827" : "#FFF",
                    borderWidth: 1,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    borderRadius: 10,
                    padding: 12,
                    color: colors.text,
                    fontFamily: "Poppins_500Medium",
                    fontSize: 14,
                    marginBottom: 12,
                    minHeight: 60,
                    textAlignVertical: "top",
                  }}
                />

                <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                  How to Get This Promo (Optional)
                </Text>
                <TextInput
                  value={promotionForm.criteria}
                  onChangeText={(t) => setPromotionForm((p) => ({ ...p, criteria: t }))}
                  placeholder="e.g. Minimum 2-hour booking and full payment"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    backgroundColor: isDark ? "#111827" : "#FFF",
                    borderWidth: 1,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    borderRadius: 10,
                    padding: 12,
                    color: colors.text,
                    fontFamily: "Poppins_500Medium",
                    fontSize: 14,
                    marginBottom: 12,
                    textAlignVertical: "center",
                  }}
                />

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                      Min Hours (Optional)
                    </Text>
                    <TextInput
                      value={promotionForm.minimum_booking_hours}
                      onChangeText={(t) =>
                        setPromotionForm((p) => ({
                          ...p,
                          minimum_booking_hours: t.replace(/[^0-9.]/g, ""),
                        }))
                      }
                      placeholder="e.g. 2"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="numeric"
                      style={{
                        backgroundColor: isDark ? "#111827" : "#FFF",
                        borderWidth: 1,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        borderRadius: 10,
                        padding: 12,
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 14,
                        textAlignVertical: "center",
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                      Min Spend (Optional)
                    </Text>
                    <TextInput
                      value={promotionForm.minimum_spend}
                      onChangeText={(t) =>
                        setPromotionForm((p) => ({
                          ...p,
                          minimum_spend: t.replace(/[^0-9.]/g, ""),
                        }))
                      }
                      placeholder="e.g. 3000"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="numeric"
                      style={{
                        backgroundColor: isDark ? "#111827" : "#FFF",
                        borderWidth: 1,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        borderRadius: 10,
                        padding: 12,
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 14,
                        textAlignVertical: "center",
                      }}
                    />
                  </View>
                </View>

                {/* Discount Type Toggle */}
                <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                  Discount Type
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {(["percentage", "fixed_amount"] as const).map((dt) => (
                    <TouchableOpacity
                      key={dt}
                      activeOpacity={1}
                      onPress={() => setPromotionForm((p) => ({ ...p, discount_type: dt }))}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: promotionForm.discount_type === dt ? colors.primary : (isDark ? "#374151" : "#E5E7EB"),
                        backgroundColor: promotionForm.discount_type === dt ? colors.primary + "15" : "transparent",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          fontSize: 12,
                          color: promotionForm.discount_type === dt ? colors.primary : colors.textSecondary,
                        }}
                      >
                        {dt === "percentage" ? "Percentage (%)" : "Fixed Amount (₱)"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Value */}
                <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                  Discount Value *
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isDark ? "#111827" : "#FFF",
                    borderWidth: 1,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    marginBottom: 12,
                  }}
                >
                  {promotionForm.discount_type === "fixed_amount" && (
                    <Text style={{ fontFamily: "Poppins_600SemiBold", color: colors.text, marginRight: 4 }}>₱</Text>
                  )}
                  <TextInput
                    value={promotionForm.discount_value}
                    onChangeText={(t) => setPromotionForm((p) => ({ ...p, discount_value: t }))}
                    placeholder={promotionForm.discount_type === "percentage" ? "e.g. 20" : "e.g. 50"}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    style={{
                      flex: 1,
                      padding: 12,
                      color: colors.text,
                      fontFamily: "Poppins_500Medium",
                      fontSize: 14,
                      textAlignVertical: "center",
                    }}
                  />
                  {promotionForm.discount_type === "percentage" && (
                    <Text style={{ fontFamily: "Poppins_600SemiBold", color: colors.text, marginLeft: 4 }}>%</Text>
                  )}
                  {promotionForm.discount_type === "fixed_amount" && (
                    <Text style={{ fontFamily: "Poppins_400Regular", color: colors.textSecondary, fontSize: 12, marginLeft: 4 }}>/hr</Text>
                  )}
                </View>

                {/* Duration Toggle */}
                <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                  Duration
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {([
                    { key: true, label: "Regular (Always)" },
                    { key: false, label: "Time-Limited" },
                  ] as const).map((opt) => (
                    <TouchableOpacity
                      key={String(opt.key)}
                      activeOpacity={1}
                      onPress={() => setPromotionForm((p) => ({ ...p, is_permanent: opt.key as boolean }))}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: promotionForm.is_permanent === opt.key ? colors.primary : (isDark ? "#374151" : "#E5E7EB"),
                        backgroundColor: promotionForm.is_permanent === opt.key ? colors.primary + "15" : "transparent",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          fontSize: 12,
                          color: promotionForm.is_permanent === opt.key ? colors.primary : colors.textSecondary,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Date pickers for time-limited */}
                {!promotionForm.is_permanent && (
                  <View style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", gap: 8 , flexWrap: "wrap", minWidth: "100%" }}>
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => { setShowPromoStartCalendar(!showPromoStartCalendar); setShowPromoEndCalendar(false); }}
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          backgroundColor: isDark ? "#111827" : "#FFF",
                          borderWidth: 1,
                          borderColor: isDark ? "#374151" : "#E5E7EB",
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: promotionForm.start_date ? colors.text : colors.textSecondary }}>
                          {promotionForm.start_date
                            ? new Date(promotionForm.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "Start Date"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => { setShowPromoEndCalendar(!showPromoEndCalendar); setShowPromoStartCalendar(false); }}
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          backgroundColor: isDark ? "#111827" : "#FFF",
                          borderWidth: 1,
                          borderColor: isDark ? "#374151" : "#E5E7EB",
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: promotionForm.end_date ? colors.text : colors.textSecondary }}>
                          {promotionForm.end_date
                            ? new Date(promotionForm.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "End Date"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {showPromoStartCalendar && (
                      <View style={{ marginTop: 8 }}>
                        <Calendar
                          onDayPress={(day: any) => {
                            setPromotionForm((p) => ({ ...p, start_date: day.dateString }));
                            setShowPromoStartCalendar(false);
                          }}
                          markedDates={promotionForm.start_date ? { [promotionForm.start_date]: { selected: true, selectedColor: colors.primary } } : {}}
                          minDate={getLocalDateKey()}
                          theme={{
                            backgroundColor: "transparent",
                            calendarBackground: "transparent",
                            textSectionTitleColor: colors.textSecondary,
                            selectedDayBackgroundColor: colors.primary,
                            todayTextColor: colors.primary,
                            dayTextColor: colors.text,
                            monthTextColor: colors.text,
                            arrowColor: colors.primary,
                          }}
                        />
                      </View>
                    )}
                    {showPromoEndCalendar && (
                      <View style={{ marginTop: 8 }}>
                        <Calendar
                          onDayPress={(day: any) => {
                            setPromotionForm((p) => ({ ...p, end_date: day.dateString }));
                            setShowPromoEndCalendar(false);
                          }}
                          markedDates={promotionForm.end_date ? { [promotionForm.end_date]: { selected: true, selectedColor: colors.primary } } : {}}
                          minDate={promotionForm.start_date || getLocalDateKey()}
                          theme={{
                            backgroundColor: "transparent",
                            calendarBackground: "transparent",
                            textSectionTitleColor: colors.textSecondary,
                            selectedDayBackgroundColor: colors.primary,
                            todayTextColor: colors.primary,
                            dayTextColor: colors.text,
                            monthTextColor: colors.text,
                            arrowColor: colors.primary,
                          }}
                        />
                      </View>
                    )}
                  </View>
                )}

                {/* Applies to Toggle */}
                <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                  Applies To
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {allowedPromotionTargets.map((at) => (
                    <TouchableOpacity
                      key={at}
                      activeOpacity={1}
                      onPress={() => setPromotionForm((p) => ({ ...p, applies_to: at }))}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: effectiveAppliesTo === at ? colors.primary : (isDark ? "#374151" : "#E5E7EB"),
                        backgroundColor: effectiveAppliesTo === at ? colors.primary + "15" : "transparent",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          fontSize: 11,
                          color: effectiveAppliesTo === at ? colors.primary : colors.textSecondary,
                        }}
                      >
                        {at === "both" ? "Both" : at === "rehearsal" ? "Rehearsal" : "Recording"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Save / Cancel */}
                <View style={{ flexDirection: "row", gap: 10 , flexWrap: "wrap", minWidth: "100%" }}>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => { resetPromotionForm(); setShowPromotionForm(false); }}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={handleSavePromotion}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" }}>
                      {editingPromotion ? "Update" : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Pax / Capacity */}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Studio Capacity (Pax)
            </Text>
            <Text
              style={[styles.inputSubLabel, { color: colors.textSecondary }]}
            >
              Maximum number of people the studio can accommodate
            </Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                },
              ]}
            >
              <Ionicons
                name="people"
                size={20}
                color={colors.primary}
                style={{ marginRight: 12 }}
              />
              <TextInput
                value={pax}
                onChangeText={setPax}
                placeholder="e.g. 10"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={{
                  flex: 1,
                  color: colors.text,
                  fontFamily: "Poppins_500Medium",
                  fontSize: 16,
                  textAlign: "left",
                  paddingVertical: 16,
                  textAlignVertical: "center",
                }}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: "Poppins_400Regular",
                }}
              >
                persons
              </Text>
            </View>
          </View>

          {/* Contract Upload */}
          {renderSectionHeader("Contract", "document-text")}
          <View style={styles.inputContainer}>
            <Text
              style={[styles.inputSubLabel, { color: colors.textSecondary }]}
            >
              Upload a PDF contract that musicians will see before booking
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
          {renderSectionHeader("Facilities & Equipment", "mic")}
          <View style={styles.addAmenityContainer}>
            <View
              style={[
                styles.addAmenityInput,
                {
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  backgroundColor: colors.inputBackground,
                },
              ]}
            >
              <TextInput
                value={newAmenity}
                onChangeText={setNewAmenity}
                placeholder="e.g. Drum Kit"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  { fontFamily: "Poppins_400Regular", color: colors.text },
                ]}
              />
            </View>
            <TouchableOpacity activeOpacity={1}
              onPress={addAmenity}
              style={[
                styles.addAmenityButton,
                { backgroundColor: colors.primary },
              ]}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.amenitiesList}>
            {amenities.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.amenityItem,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.amenityText, { color: colors.text }]}>
                  {item}
                </Text>
                <TouchableOpacity activeOpacity={1} onPress={() => removeAmenity(index)}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Studio Equipment Section */}
          {renderSectionHeader("Studio Equipment", "cube-outline")}
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary, marginBottom: 12 },
            ]}
          >
            Add equipment available at your studio with details
          </Text>

          {/* Add Equipment Button */}
          <TouchableOpacity activeOpacity={1}
            onPress={() => {
              setEditingEquipment(null);
              setEquipmentForm({
                name: "",
                quantity: "1",
                description: "",
                image: "",
              });
              setShowEquipmentModal(true);
            }}
            style={[
              styles.addEquipmentBtn,
              {
                backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                borderColor: colors.primary,
              },
            ]}
          >
            <Ionicons name="add-circle" size={24} color={colors.primary} />
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Poppins_600SemiBold",
                marginLeft: 8,
              }}
            >
              Add Equipment
            </Text>
          </TouchableOpacity>

          {/* Equipment List */}
          {equipment.length > 0 && (
            <View style={{ marginTop: 16 }}>
              {equipment.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.equipmentCard,
                    {
                      backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", gap: 12 , flexWrap: "wrap", minWidth: "100%" }}>
                    {item.image ? (
                      <Image
                        source={{ uri: item.image }}
                        style={styles.equipmentImage}
                      />
                    ) : (
                      <View
                        style={[
                          styles.equipmentImage,
                          {
                            backgroundColor: isDark ? "#374151" : "#E5E7EB",
                            alignItems: "center",
                            justifyContent: "center",
                          },
                        ]}
                      >
                        <Ionicons
                          name="cube-outline"
                          size={24}
                          color={colors.textSecondary}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.equipmentName, { color: colors.text }]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 12,
                          fontFamily: "Poppins_400Regular",
                        }}
                      >
                        Qty: {item.quantity}
                      </Text>
                      {item.description && (
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 11,
                            fontFamily: "Poppins_400Regular",
                            marginTop: 4,
                          }}
                          numberOfLines={2}
                        >
                          {item.description}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 , flexWrap: "wrap", minWidth: "100%" }}>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => {
                          setEditingEquipment(item);
                          setEquipmentForm({
                            name: item.name,
                            quantity: item.quantity.toString(),
                            description: item.description,
                            image: item.image,
                          });
                          setShowEquipmentModal(true);
                        }}
                      >
                        <Ionicons
                          name="pencil"
                          size={18}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() =>
                          setEquipment(
                            equipment.filter((e) => e.id !== item.id),
                          )
                        }
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#EF4444"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {equipment.length > 0 && (
            <Text
              style={[styles.selectedCount, { color: colors.textSecondary }]}
            >
              {equipment.length} equipment item
              {equipment.length !== 1 ? "s" : ""} added
            </Text>
          )}

          {/* Quick Add from Presets */}
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary, marginTop: 24, marginBottom: 12 },
            ]}
          >
            Or quickly select from common equipment
          </Text>

          <View style={styles.instrumentsGrid}>
            {INSTRUMENT_OPTIONS.map((instrument) => {
              const isSelected = selectedInstruments.some(
                (i) => i.name === instrument.name,
              );
              return (
                <TouchableOpacity activeOpacity={1}
                  key={instrument.name}
                  onPress={() => toggleInstrument(instrument)}
                  style={[
                    styles.instrumentCard,
                    {
                      backgroundColor: isSelected
                        ? colors.primary + "20"
                        : isDark
                          ? "#1F2937"
                          : "#F9FAFB",
                      borderColor: isSelected
                        ? colors.primary
                        : isDark
                          ? "#374151"
                          : "#E5E7EB",
                    },
                  ]}
                >
                  <Image
                    source={{ uri: instrument.image }}
                    style={styles.instrumentImage}
                  />
                  <Text
                    style={[styles.instrumentName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {instrument.name}
                  </Text>
                  {isSelected && (
                    <View
                      style={[
                        styles.instrumentCheckmark,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedInstruments.length > 0 && (
            <Text
              style={[styles.selectedCount, { color: colors.textSecondary }]}
            >
              {selectedInstruments.length} preset
              {selectedInstruments.length !== 1 ? "s" : ""} selected
            </Text>
          )}

          {renderSectionHeader("Availability", "time")}
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary, marginBottom: 16 },
            ]}
          >
            Set your regular weekly schedule and optional date overrides
          </Text>

          {/* Calendar Date Selection */}
          <View style={{ marginBottom: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Ionicons name="calendar" size={16} color={colors.primary} />
              <Text style={[styles.sectionSubtitle, { color: colors.text }]}>
                Date Overrides
              </Text>
            </View>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                fontFamily: "Poppins_400Regular",
                marginBottom: 12,
              }}
            >
              Use these for one-off changes like closures, holidays, or special hours. These override the regular weekly schedule.
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
                current={getStudioAvailabilityMinDateKey()}
                minDate={getStudioAvailabilityMinDateKey()}
                maxDate={(() => {
                  const maxDate = new Date();
                  maxDate.setDate(maxDate.getDate() + 90);
                  return getLocalDateKey(maxDate);
                })()}
                markedDates={Object.entries(selectedDates).reduce(
                  (acc, [dateStr, data]) => {
                    if (data.selected) {
                      acc[dateStr] = {
                        selected: true,
                        selectedColor: colors.primary,
                        selectedTextColor: "#FFFFFF",
                      };
                    }
                    return acc;
                  },
                  {} as Record<string, any>,
                )}
                onDayPress={(day) => toggleCalendarDate(day.dateString)}
                dayComponent={({ date, state, marking }) => {
                  if (!date) return null;
                  const isSelected = !!marking?.selected;
                  const isDisabled =
                    state === "disabled" ||
                    !isStudioDateOverrideDateSelectable(date.dateString);

                  return (
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => {
                        if (!isDisabled) {
                          toggleCalendarDate(date.dateString);
                        }
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isSelected
                          ? colors.primary
                          : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected
                            ? "#FFFFFF"
                            : isDisabled
                              ? isDark
                                ? "#4B5563"
                                : "#D1D5DB"
                              : colors.text,
                          fontFamily: "Poppins_500Medium",
                          fontSize: 14,
                          lineHeight: 32,
                          textAlign: "center",
                          textAlignVertical: "center",
                          includeFontPadding: false,
                        }}
                      >
                        {date.day}
                      </Text>
                    </TouchableOpacity>
                  );
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
              {Object.keys(selectedDates).filter(
                (d) => selectedDates[d]?.selected,
              ).length > 0 && (
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingBottom: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.primary}
                    />
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 13,
                      }}
                    >
                      {
                        Object.keys(selectedDates).filter(
                          (d) => selectedDates[d]?.selected,
                        ).length
                      }{" "}
                      date(s) selected
                    </Text>
                  </View>
                )}
            </View>

            {/* Selected Dates with Time Slots */}
            {Object.entries(selectedDates).filter(([_, data]) => data.selected)
              .length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      fontFamily: "Poppins_600SemiBold",
                      marginBottom: 8,
                    }}
                  >
                    SELECTED DATE OVERRIDES
                  </Text>
                  <ScrollView
                    style={styles.selectedDateOverridesList}
                    contentContainerStyle={styles.selectedDateOverridesContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {Object.entries(selectedDates)
                      .filter(([_, data]) => data.selected)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([dateStr, data]) => {
                      const date = new Date(dateStr + "T00:00:00");
                      const dayName = date.toLocaleDateString("en-US", {
                        weekday: "long",
                      });
                      const weeklySchedule = availability.find(
                        (a) => a.day === dayName,
                      );
                      const hasConflict =
                        weeklySchedule && weeklySchedule.slots.length > 0;

                      const toggleAmPm = (timeStr: string) => {
                        const [time, period] = timeStr.split(" ");
                        return `${time} ${period === "AM" ? "PM" : "AM"}`;
                      };

                      return (
                        <View
                          key={dateStr}
                          style={[
                            styles.selectedDateCard,
                            {
                              backgroundColor: isDark ? "#374151" : "#FFF",
                              borderColor: hasConflict
                                ? "#F59E0B"
                                : colors.border,
                            },
                          ]}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.text,
                                  fontFamily: "Poppins_600SemiBold",
                                }}
                              >
                                {date.toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </Text>
                              {hasConflict && (
                                <View
                                  style={{
                                    backgroundColor: "#F59E0B20",
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: "#F59E0B",
                                      fontSize: 10,
                                      fontFamily: "Poppins_500Medium",
                                    }}
                                  >
                                    Override
                                  </Text>
                                </View>
                              )}
                            </View>
                            <TouchableOpacity activeOpacity={1}
                              onPress={() => {
                                const newDates = { ...selectedDates };
                                delete newDates[dateStr];
                                setSelectedDates(newDates);
                              }}
                            >
                              <Ionicons
                                name="close-circle"
                                size={20}
                                color="#EF4444"
                              />
                            </TouchableOpacity>
                          </View>

                          {studioType === "Both" && (
                            <View style={{ marginTop: 10 }}>
                              <Text
                                style={{
                                  color: colors.textSecondary,
                                  fontSize: 11,
                                  marginBottom: 6,
                                  fontFamily: "Poppins_600SemiBold",
                                }}
                              >
                                SESSION TYPE FOR THIS DATE
                              </Text>
                              <View style={styles.sessionTypeOptions}>
                                {([
                                  { value: "both", label: "Both" },
                                  { value: "rehearsal", label: "Rehearsal" },
                                  { value: "recording", label: "Recording" },
                                ] as const).map((option) => {
                                  const selectedSessionType =
                                    normalizeDateOverrideSessionType(
                                      data.sessionType,
                                      "both",
                                    );
                                  const isSelected =
                                    selectedSessionType === option.value;

                                  return (
                                    <TouchableOpacity
                                      key={option.value}
                                      activeOpacity={1}
                                      onPress={() => {
                                        setSelectedDates((prev) => ({
                                          ...prev,
                                          [dateStr]: {
                                            ...prev[dateStr],
                                            sessionType: option.value,
                                          },
                                        }));
                                      }}
                                      style={[
                                        styles.sessionTypeChip,
                                        {
                                          borderColor: isSelected
                                            ? colors.primary
                                            : colors.border,
                                          backgroundColor: isSelected
                                            ? `${colors.primary}20`
                                            : "transparent",
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          color: isSelected
                                            ? colors.primary
                                            : colors.textSecondary,
                                          fontSize: 11,
                                          lineHeight: 16,
                                          includeFontPadding: false,
                                          fontFamily: "Poppins_500Medium",
                                        }}
                                      >
                                        {option.label}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          )}

                          {/* Editable Time Slots for Specific Date */}
                          {data.slots.map((slot, slotIndex) => (
                            <View
                              key={slotIndex}
                              style={styles.timeSlotRow}
                            >
                              <View style={styles.timeSlotGroup}>
                                <Text
                                  style={{
                                    color: colors.textSecondary,
                                    fontSize: 11,
                                    marginBottom: 4,
                                    fontFamily: "Poppins_600SemiBold",
                                  }}
                                >
                                  START
                                </Text>
                                <View style={styles.timeInputRow}>
                                  <TextInput
                                    value={slot.start.split(" ")[0]}
                                    onChangeText={(text) => {
                                      const formatted = formatTimeInput(text);
                                      const newDates = { ...selectedDates };
                                      const period =
                                        slot.start.split(" ")[1] || "AM";
                                      newDates[dateStr].slots[slotIndex].start =
                                        `${formatted} ${period}`;
                                      setSelectedDates(newDates);
                                    }}
                                    placeholder="09:00"
                                    keyboardType="numeric"
                                    maxLength={5}
                                    style={[
                                      styles.timeInput,
                                      {
                                        backgroundColor: isDark
                                          ? "#1F2937"
                                          : "white",
                                        borderColor: colors.border,
                                        color: colors.text,
                                        flex: 1,
                                      },
                                    ]}
                                  />
                                  <TouchableOpacity activeOpacity={1}
                                    onPress={() => {
                                      const newDates = { ...selectedDates };
                                      newDates[dateStr].slots[slotIndex].start =
                                        toggleAmPm(slot.start);
                                      setSelectedDates(newDates);
                                    }}
                                    style={[
                                      styles.ampmBtn,
                                      {
                                        backgroundColor: isDark
                                          ? "#1F2937"
                                          : "#E5E7EB",
                                      },
                                    ]}
                                  >
                                    <Text style={[styles.ampmBtnText, { color: colors.text }]}>
                                      {slot.start.split(" ")[1] || "AM"}
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
                                  END
                                </Text>
                                <View style={styles.timeInputRow}>
                                  <TextInput
                                    value={slot.end.split(" ")[0]}
                                    onChangeText={(text) => {
                                      const formatted = formatTimeInput(text);
                                      const newDates = { ...selectedDates };
                                      const period =
                                        slot.end.split(" ")[1] || "PM";
                                      newDates[dateStr].slots[slotIndex].end =
                                        `${formatted} ${period}`;
                                      setSelectedDates(newDates);
                                    }}
                                    placeholder="05:00"
                                    keyboardType="numeric"
                                    maxLength={5}
                                    style={[
                                      styles.timeInput,
                                      {
                                        backgroundColor: isDark
                                          ? "#1F2937"
                                          : "white",
                                        borderColor: colors.border,
                                        color: colors.text,
                                        flex: 1,
                                      },
                                    ]}
                                  />
                                  <TouchableOpacity activeOpacity={1}
                                    onPress={() => {
                                      const newDates = { ...selectedDates };
                                      newDates[dateStr].slots[slotIndex].end =
                                        toggleAmPm(slot.end);
                                      setSelectedDates(newDates);
                                    }}
                                    style={[
                                      styles.ampmBtn,
                                      {
                                        backgroundColor: isDark
                                          ? "#1F2937"
                                          : "#E5E7EB",
                                      },
                                    ]}
                                  >
                                    <Text style={[styles.ampmBtnText, { color: colors.text }]}>
                                      {slot.end.split(" ")[1] || "PM"}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                              {data.slots.length > 1 && (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => {
                                    const newDates = { ...selectedDates };
                                    newDates[dateStr].slots.splice(slotIndex, 1);
                                    setSelectedDates(newDates);
                                  }}
                                  style={styles.timeSlotDeleteButton}
                                >
                                  <Ionicons
                                    name="trash-outline"
                                    size={20}
                                    color="#EF4444"
                                  />
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}

                          {/* Add Slot Button for Specific Date */}
                          {data.slots.length < 3 && (
                            <TouchableOpacity activeOpacity={1}
                              onPress={() => {
                                const newDates = { ...selectedDates };
                                newDates[dateStr].slots.push(
                                  getDefaultStudioDateOverrideSlot(dateStr, {
                                    start: "06:00 PM",
                                    end: "09:00 PM",
                                  }),
                                );
                                setSelectedDates(newDates);
                              }}
                              style={{
                                marginTop: 12,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Ionicons
                                name="add-circle-outline"
                                size={16}
                                color={colors.primary}
                              />
                              <Text
                                style={{
                                  color: colors.primary,
                                  fontSize: 12,
                                  fontFamily: "Poppins_500Medium",
                                }}
                              >
                                Add Time Slot
                              </Text>
                            </TouchableOpacity>
                          )}

                          {hasConflict && (
                            <Text
                              style={{
                                color: "#F59E0B",
                                fontSize: 11,
                                fontFamily: "Poppins_400Regular",
                                marginTop: 8,
                              }}
                            >
                              Warning: This overrides weekly {dayName} schedule (
                              {weeklySchedule.slots[0]?.start} -{" "}
                              {weeklySchedule.slots[0]?.end})
                            </Text>
                          )}
                        </View>
                      );
                      })}
                  </ScrollView>
                </View>
              )}
          </View>

          {/* Weekly Schedule Section */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Ionicons name="repeat" size={16} color={colors.primary} />
            <Text style={[styles.sectionSubtitle, { color: colors.text }]}>
              Weekly Schedule
            </Text>
          </View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              fontFamily: "Poppins_400Regular",
              marginBottom: 16,
            }}
          >
            Set recurring availability for each day of the week
          </Text>

          {availability.map((daySchedule, dayIndex) => (
            <View
              key={daySchedule.day}
              style={[
                styles.dayCard,
                {
                  backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                  borderColor: colors.border,
                  marginBottom: 12,
                },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text style={[styles.dayLabel, { color: colors.text }]}>
                  {daySchedule.day}
                </Text>
                <TouchableOpacity activeOpacity={1}
                  onPress={() => {
                    const newAvailability = [...availability];
                    if (newAvailability[dayIndex].slots.length === 0) {
                      newAvailability[dayIndex].slots.push({
                        start: "09:00 AM",
                        end: "05:00 PM",
                      });
                      newAvailability[dayIndex].sessionType =
                        normalizeWeeklySessionType(
                          newAvailability[dayIndex].sessionType,
                          getDefaultWeeklySessionType(studioType),
                        );
                    } else {
                      newAvailability[dayIndex].slots = [];
                    }
                    setAvailability(newAvailability);
                  }}
                  style={[
                    styles.toggleBtn,
                    {
                      backgroundColor:
                        daySchedule.slots.length > 0
                          ? colors.primary
                          : isDark
                            ? "#374151"
                            : "#E5E7EB",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        daySchedule.slots.length > 0
                          ? "#FFFFFF"
                          : colors.textSecondary,
                      fontSize: 12,
                      fontFamily: "Poppins_600SemiBold",
                    }}
                  >
                    {daySchedule.slots.length > 0 ? "Available" : "Closed"}
                  </Text>
                </TouchableOpacity>
              </View>

              {studioType === "Both" && daySchedule.slots.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      marginBottom: 6,
                      fontFamily: "Poppins_600SemiBold",
                    }}
                  >
                    SESSION TYPE FOR THIS DAY
                  </Text>
                  <View style={styles.sessionTypeOptions}>
                    {([
                      { value: "both", label: "Both" },
                      { value: "rehearsal", label: "Rehearsal" },
                      { value: "recording", label: "Recording" },
                    ] as const).map((option) => {
                      const selectedWeeklySessionType =
                        normalizeWeeklySessionType(daySchedule.sessionType, "both");
                      const isSelected =
                        selectedWeeklySessionType === option.value;

                      return (
                        <TouchableOpacity
                          key={option.value}
                          activeOpacity={1}
                          onPress={() => {
                            setAvailability((prev) =>
                              prev.map((day, index) =>
                                index === dayIndex
                                  ? { ...day, sessionType: option.value }
                                  : day,
                              ),
                            );
                          }}
                          style={[
                            styles.sessionTypeChip,
                            {
                              borderColor: isSelected
                                ? colors.primary
                                : colors.border,
                              backgroundColor: isSelected
                                ? `${colors.primary}20`
                                : "transparent",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: isSelected
                                ? colors.primary
                                : colors.textSecondary,
                              fontSize: 11,
                              lineHeight: 16,
                              includeFontPadding: false,
                              fontFamily: "Poppins_500Medium",
                            }}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {daySchedule.slots.map((slot, slotIndex) => {
                const toggleAmPm = (timeStr: string) => {
                  const [time, period] = timeStr.split(" ");
                  return `${time} ${period === "AM" ? "PM" : "AM"}`;
                };

                return (
                  <View
                    key={slotIndex}
                    style={styles.weeklyTimeSlotRow}
                  >
                    <View style={styles.timeSlotGroup}>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 11,
                          marginBottom: 4,
                          fontFamily: "Poppins_600SemiBold",
                        }}
                      >
                        START
                      </Text>
                      <View style={styles.timeInputRow}>
                        <TextInput
                          value={slot.start.split(" ")[0]}
                          onChangeText={(text) => {
                            const formatted = formatTimeInput(text);
                            const newAvailability = [...availability];
                            const period = slot.start.split(" ")[1];
                            newAvailability[dayIndex].slots[slotIndex].start =
                              `${formatted} ${period}`;
                            setAvailability(newAvailability);
                          }}
                          placeholder="09:00"
                          keyboardType="numeric"
                          maxLength={5}
                          style={[
                            styles.timeInput,
                            {
                              backgroundColor: isDark ? "#374151" : "white",
                              borderColor: colors.border,
                              color: colors.text,
                              flex: 1,
                            },
                          ]}
                        />
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => {
                            const newAvailability = [...availability];
                            newAvailability[dayIndex].slots[slotIndex].start =
                              toggleAmPm(slot.start);
                            setAvailability(newAvailability);
                          }}
                          style={[
                            styles.ampmBtn,
                            { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                          ]}
                        >
                          <Text style={[styles.ampmBtnText, { color: colors.text }]}>
                            {slot.start.split(" ")[1]}
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
                        END
                      </Text>
                      <View style={styles.timeInputRow}>
                        <TextInput
                          value={slot.end.split(" ")[0]}
                          onChangeText={(text) => {
                            const formatted = formatTimeInput(text);
                            const newAvailability = [...availability];
                            const period = slot.end.split(" ")[1];
                            newAvailability[dayIndex].slots[slotIndex].end =
                              `${formatted} ${period}`;
                            setAvailability(newAvailability);
                          }}
                          placeholder="05:00"
                          keyboardType="numeric"
                          maxLength={5}
                          style={[
                            styles.timeInput,
                            {
                              backgroundColor: isDark ? "#374151" : "white",
                              borderColor: colors.border,
                              color: colors.text,
                              flex: 1,
                            },
                          ]}
                        />
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => {
                            const newAvailability = [...availability];
                            newAvailability[dayIndex].slots[slotIndex].end =
                              toggleAmPm(slot.end);
                            setAvailability(newAvailability);
                          }}
                          style={[
                            styles.ampmBtn,
                            { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                          ]}
                        >
                          <Text style={[styles.ampmBtnText, { color: colors.text }]}>
                            {slot.end.split(" ")[1]}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {daySchedule.slots.length > 1 && (
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => {
                          const newAvailability = [...availability];
                          newAvailability[dayIndex].slots.splice(slotIndex, 1);
                          setAvailability(newAvailability);
                        }}
                        style={styles.timeSlotDeleteButton}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color="#EF4444"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {daySchedule.slots.length > 0 && daySchedule.slots.length < 3 && (
                <TouchableOpacity activeOpacity={1}
                  onPress={() => {
                    const newAvailability = [...availability];
                    newAvailability[dayIndex].slots.push({
                      start: "06:00 PM",
                      end: "09:00 PM",
                    });
                    setAvailability(newAvailability);
                  }}
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: 12,
                      fontFamily: "Poppins_500Medium",
                    }}
                  >
                  Add Time Slot
                </Text>
              </TouchableOpacity>
              )}
              {daySchedule.slots.length > 0 &&
                renderWeeklyScheduleDurationCard(daySchedule, dayIndex)}
            </View>
          ))}

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
                <Text style={[styles.saveButtonText, { color: isFormComplete ? "#FFFFFF" : colors.textSecondary }]}>Save Changes</Text>
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

      <ConflictResolutionModal
        visible={conflictModalVisible}
        conflicts={conflictingBookings}
        studioName={studioName}
        onClose={() => {
          setConflictModalVisible(false);
          setConflictingBookings([]);
          setSaving(false);
        }}
        onResolve={handleConflictResolution}
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
          latitude && longitude ? { lat: latitude, lng: longitude } : undefined
        }
      />

      {/* Equipment Modal */}
      {showEquipmentModal && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            zIndex: 1000,
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 400,
              maxHeight: "80%",
            }}
          >
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
                  fontSize: 18,
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                }}
              >
                {editingEquipment ? "Edit Equipment" : "Add Equipment"}
              </Text>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowEquipmentModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Name */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontFamily: "Poppins_600SemiBold",
                    marginBottom: 8,
                  }}
                >
                  NAME *
                </Text>
                <TextInput
                  value={equipmentForm.name}
                  onChangeText={(text) =>
                    setEquipmentForm({ ...equipmentForm, name: text })
                  }
                  placeholder="e.g. Yamaha DTX Drums"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    color: colors.text,
                    fontFamily: "Poppins_400Regular",
                    borderWidth: 1,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    textAlignVertical: "center",
                  }}
                />
              </View>

              {/* Quantity */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontFamily: "Poppins_600SemiBold",
                    marginBottom: 8,
                  }}
                >
                  QUANTITY *
                </Text>
                <TextInput
                  value={equipmentForm.quantity}
                  onChangeText={(text) =>
                    setEquipmentForm({
                      ...equipmentForm,
                      quantity: text.replace(/[^0-9]/g, ""),
                    })
                  }
                  placeholder="1"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    color: colors.text,
                    fontFamily: "Poppins_400Regular",
                    borderWidth: 1,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    textAlignVertical: "center",
                  }}
                />
              </View>

              {/* Description */}
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontFamily: "Poppins_600SemiBold",
                    marginBottom: 8,
                  }}
                >
                  DESCRIPTION
                </Text>
                <TextInput
                  value={equipmentForm.description}
                  onChangeText={(text) =>
                    setEquipmentForm({ ...equipmentForm, description: text })
                  }
                  placeholder="Brief description of the equipment"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    color: colors.text,
                    fontFamily: "Poppins_400Regular",
                    borderWidth: 1,
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    height: 80,
                    textAlignVertical: "top",
                  }}
                />
              </View>

              {/* Image Upload */}
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                    fontFamily: "Poppins_600SemiBold",
                    marginBottom: 8,
                  }}
                >
                  IMAGE
                </Text>
                {equipmentForm.image ? (
                  <View style={{ position: "relative" }}>
                    <Image
                      source={{ uri: equipmentForm.image }}
                      style={{ width: "100%", height: 150, borderRadius: 12 }}
                    />
                    <TouchableOpacity activeOpacity={1}
                      onPress={() =>
                        setEquipmentForm({ ...equipmentForm, image: "" })
                      }
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        borderRadius: 12,
                        padding: 4,
                      }}
                    >
                      <Ionicons name="close" size={16} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={pickEquipmentImage}
                    disabled={uploadingEquipmentImage}
                    activeOpacity={uploadingEquipmentImage ? 1 : 0.78}
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: 12,
                      padding: 24,
                      alignItems: "center",
                      borderWidth: 2,
                      borderStyle: "dashed",
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                    }}
                  >
                    {uploadingEquipmentImage ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name="camera-outline"
                          size={32}
                          color={colors.textSecondary}
                        />
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontFamily: "Poppins_400Regular",
                            marginTop: 8,
                          }}
                        >
                          Tap to add image
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity activeOpacity={1}
                onPress={() => {
                  if (!equipmentForm.name.trim()) {
                    showAlert(
                      "warning",
                      "Required",
                      "Please enter equipment name",
                    );
                    return;
                  }
                  if (editingEquipment) {
                    setEquipment(
                      equipment.map((e) =>
                        e.id === editingEquipment.id
                          ? {
                            ...e,
                            ...equipmentForm,
                            quantity: parseInt(equipmentForm.quantity) || 1,
                          }
                          : e,
                      ),
                    );
                  } else {
                    setEquipment([
                      ...equipment,
                      {
                        id: Date.now().toString(),
                        name: equipmentForm.name,
                        quantity: parseInt(equipmentForm.quantity) || 1,
                        description: equipmentForm.description,
                        image: equipmentForm.image,
                      },
                    ]);
                  }
                  setShowEquipmentModal(false);
                  setEquipmentForm({
                    name: "",
                    quantity: "1",
                    description: "",
                    image: "",
                  });
                  setEditingEquipment(null);
                }}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  padding: 16,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ color: "#FFF", fontFamily: "Poppins_600SemiBold" }}
                >
                  {editingEquipment ? "Update Equipment" : "Add Equipment"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}
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
  textInput: {
    padding: 16,
    fontFamily: "Poppins_400Regular",
    textAlign: "left",
    textAlignVertical: "center",
  },
  addAmenityContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  addAmenityInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  addAmenityButton: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  amenitiesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  amenityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  amenityText: {
    marginRight: 8,
    fontFamily: "Poppins_500Medium",
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
  permitWarningBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 6,
  },
  permitWarningTitle: {
    color: "#B91C1C",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  permitWarningText: {
    color: "#991B1B",
    fontSize: 12,
    lineHeight: 18,
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
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayLabel: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeInput: {
    height: 44,
    minWidth: 74,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  ampmBtn: {
    width: 52,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
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
  subtitle: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  // Instruments styles
  instrumentsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  instrumentCard: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  instrumentImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginBottom: 6,
  },
  instrumentName: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
  instrumentCheckmark: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCount: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 12,
    textAlign: "center",
  },
  // Equipment styles
  addEquipmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  equipmentCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  equipmentImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  equipmentName: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  // Calendar styles
  calendarContainer: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dateCard: {
    width: 60,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  selectedDateCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  selectedDateOverridesList: {
    maxHeight: 420,
  },
  selectedDateOverridesContent: {
    paddingBottom: 4,
  },
  sessionTypeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sessionTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  weeklyScopeInline: {
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 14,
  },
  weeklyScopeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  timeSlotRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  weeklyTimeSlotRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
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
  timeSlotDeleteButton: {
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
});

