import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/src/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import GigPresetDropdown from "../src/components/GigPresetDropdown";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import LocationPicker from "../src/components/LocationPicker";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import {
  getDefaultStudioDateOverrideSlot,
  getStudioAvailabilityMinDateKey,
  getStudioDateOverrideLeadTimeError,
  isStudioDateOverrideDateSelectable,
} from "../src/utils/studioAvailabilityLeadTime";
import { uploadStorageObject } from "../src/utils/storageUpload";

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
const IS_WEB = Platform.OS === "web";

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

const buildPromotionDescription = (
  description: string,
): string => {
  return description.trim();
};

const getAllowedPromotionTargets = (
  type: "Rehearsal" | "Recording" | "Both",
): Array<"rehearsal" | "recording" | "both"> => {
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

export default function AddStudioScreen() {
  const { colors, isDark } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && viewportWidth >= 768;
  const pageBackground = isWebDesktop
    ? isDark
      ? "#0A1224"
      : "#E9EEF8"
    : colors.background;
  const { isSystemLocked, showLockAlert } = useAuth();
  const params = useLocalSearchParams<{ refresh?: string }>();
  const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
  const [step, setStep] = useState(1);
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

  const [modalVisible, setModalVisible] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newStudioId, setNewStudioId] = useState<string | null>(null);

  // Address Verification State
  const [addressVerificationModalVisible, setAddressVerificationModalVisible] = useState(false);
  const [addressVerificationUrl, setAddressVerificationUrl] = useState("");
  const [addressVerificationLoading, setAddressVerificationLoading] = useState(false);
  const [addressVerificationStatus, setAddressVerificationStatus] = useState<string | null>(null);
  const [addressVerified, setAddressVerified] = useState(false);
  const [verificationSessionId, setVerificationSessionId] = useState<string | null>(null);
  const [isIdentityVerified, setIsIdentityVerified] = useState(false);

  // Custom Alert State
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

  // Arrays
  const [amenities, setAmenities] = useState<string[]>([]);
  const [newAmenity, setNewAmenity] = useState("");

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
  const [currentMonth, setCurrentMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [activeWeeklyEndDatePickerDay, setActiveWeeklyEndDatePickerDay] =
    useState<string | null>(null);

  // Legacy instruments state for backward compatibility
  const [selectedInstruments, setSelectedInstruments] = useState<
    { name: string; image: string }[]
  >([]);

  // Predefined instruments with images (using Unsplash for demo, replace with your own CDN)
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

  // Images state
  const [images, setImages] = useState<string[]>([]);
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

  // Equipment image upload state
  const [uploadingEquipmentImage, setUploadingEquipmentImage] = useState(false);

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

  const steps = [
    { id: 1, title: "Details", icon: "business" },
    { id: 2, title: "Amenities", icon: "mic" },
    { id: 3, title: "Availability", icon: "time" },
    { id: 4, title: "Review", icon: "checkmark-circle" },
  ];

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
  // Role-based access control
  useEffect(() => {
    checkAuthorization();
  }, [refreshKey]);

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
        showAlert("warning", "Unauthorized", "Only studio owners can create studios.");
        router.replace("/feed");
        return;
      }

      // Check if user's identity is verified
      setIsIdentityVerified(profile?.is_verified === true);

      setAuthorized(true);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/feed");
    } finally {
      setCheckingAuth(false);
    }
  };

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

  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      if (!studioName.trim()) {
        showAlert("warning", "Required Field", "Please enter a studio name");
        return false;
      }
      if (!description.trim()) {
        showAlert("warning", "Required Field", "Please enter a description");
        return false;
      }
      if (!address.trim()) {
        showAlert(
          "warning",
          "Required Field",
          "Please enter a studio address",
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
      if (images.length === 0) {
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
    }

    if (currentStep === 3) {
      const leadTimeError = getStudioDateOverrideLeadTimeError(selectedDates);
      if (leadTimeError) {
        showAlert("warning", "Advance Notice Required", leadTimeError);
        return false;
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
  const isCurrentStepComplete =
    step !== 1 ||
    (studioName.trim().length > 0 &&
      description.trim().length > 0 &&
      address.trim().length > 0 &&
      hasValidStudioPricing &&
      hasValidRecordingRules &&
      images.length > 0 &&
      haveValidPromotions);

  const handleNext = async () => {
    if (!validateStep(step)) {
      return;
    }

    if (step < 4) {
      setStep(step + 1);
    } else {
      if (!isWeeklyScheduleScopeValid()) {
        return;
      }

      // System lock check
      if (isSystemLocked) {
        showLockAlert();
        return;
      }

      // Confirmation before creating
      showAlert(
        "warning",
        "Confirm Studio Listing",
        "Are you sure you want to create this studio listing? Please review all details before proceeding.",
        [
          { text: "Cancel", style: "cancel", onPress: () => { } },
          { text: "Create", style: "default", onPress: () => createStudio() },
        ],
      );
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else router.replace("/my_studio");
  };

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

  const createStudio = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Get current session (auto-refresh is handled by Supabase client)
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session || !session.user) {
        showAlert("warning", "Session Expired", "Please log in again.");
        router.replace("/");
        return;
      }

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

      const leadTimeError = getStudioDateOverrideLeadTimeError(selectedDates);
      if (leadTimeError) {
        showAlert("warning", "Advance Notice Required", leadTimeError);
        return;
      }

      // Convert calendar-based availability to the payload format
      const calendarAvailability = Object.entries(selectedDates)
        .filter(([_, data]) => data.selected && data.slots.length > 0)
        .map(([date, data]) => ({
          date,
          session_type:
            studioType === "Both"
              ? normalizeDateOverrideSessionType(
                data.sessionType,
                getDefaultDateOverrideSessionType(studioType),
              )
              : getDefaultDateOverrideSessionType(studioType),
          slots: data.slots.map((slot) => ({
            start: convertTo24Hour(slot.start),
            end: convertTo24Hour(slot.end),
          })),
        }));

      // Also include weekly availability for recurring schedule
      const weeklyAvailability = availability
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
        });

      if (!isWeeklyScheduleScopeValid()) {
        return;
      }

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
        images.length > 0 && images[thumbnailIndex]
          ? [
            images[thumbnailIndex],
            ...images.filter((_, i) => i !== thumbnailIndex),
          ]
          : images;

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
        images: orderedImages,
        contract_url: contractUrl || null,
        // Include both weekly and calendar availability
        availability: weeklyAvailability,
        calendar_availability: calendarAvailability,
        latitude,
        longitude,
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

      console.log("?? PAX being sent:", payload.pax);
      console.log(
        "?? EQUIPMENT payload:",
        JSON.stringify(instrumentsPayload, null, 2),
      );
      console.log(
        "?? BOOKING SETTINGS payload:",
        JSON.stringify(payload.booking_settings, null, 2),
      );
      console.log(
        "?? RAW availability state:",
        JSON.stringify(availability, null, 2),
      );
      console.log(
        "?? FILTERED availability (days with slots):",
        payload.availability,
      );
      console.log(
        "?? Number of days with availability:",
        payload.availability.length,
      );
      console.log(
        "?? Creating studio with payload:",
        JSON.stringify(
          {
            action: "create",
            type: "studio",
            userId: session.user.id,
            payload,
          },
          null,
          2,
        ),
      );

      // Insert base studio row (3NF-safe)
      const { data, error } = await supabase
        .from('studios')
        .insert({
          owner_id: session.user.id,
          name: payload.name,
          description: payload.description,
          address: payload.address,
          hourly_rate: payload.hourly_rate,
          rehearsal_rate: payload.rehearsal_rate,
          recording_rate: payload.recording_rate,
          pax: payload.pax,
          contract_url: payload.contract_url,
          business_permit_url: null,
          latitude: payload.latitude,
          longitude: payload.longitude,
          permit_status: 'approved',
        })
        .select()
        .single();

      console.log("?? Response data:", JSON.stringify(data, null, 2));
      console.log("?? Response error:", error);

      if (error) {
        console.error("? Error details:", JSON.stringify(error, null, 2));

        let alertMessage = `Failed to create studio: ${error.message}`;
        if (error.hint) alertMessage += `\n\nHint: ${error.hint}`;
        if (error.details) alertMessage += `\n\nDetails: ${error.details}`;

        showAlert("warning", "Couldn't Create Studio", alertMessage);
        return;
      }

      const studioId = data.id;

      const normalizedTypes = resolveStudioTypeRows(payload.type);

      if (normalizedTypes.length > 0) {
        const { error: typesError } = await supabase
          .from('studio_types')
          .insert(
            normalizedTypes.map((studio_type) => ({
              studio_id: studioId,
              studio_type,
            })),
          );
        if (typesError) {
          throw new Error(`Failed to save studio types: ${typesError.message}`);
        }
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
          throw new Error(`Failed to save studio amenities: ${amenitiesError.message}`);
        }
      }

      if ((payload.instruments || []).length > 0) {
        const instrumentsError = await insertStudioInstrumentRows(
          studioId,
          payload.instruments,
        );
        if (instrumentsError) {
          throw new Error(`Failed to save studio instruments: ${instrumentsError.message}`);
        }
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
          throw new Error(`Failed to save studio images: ${mediaError.message}`);
        }
      }

      // Insert studio settings
      const bookingSettings = payload.booking_settings || {};
      const settingsRow = {
        studio_id: studioId,
        buffer_minutes: 30,
        bulk_discount_threshold_hours: 10,
        bulk_discount_percentage: 0,
        min_booking_duration_hours:
          Number(bookingSettings.min_booking_duration_hours) || 2,
        recording_songs_per_block:
          parsePositiveInteger(bookingSettings.recording_songs_per_block) || 1,
        recording_hours_per_block:
          parsePositiveDecimal(bookingSettings.recording_hours_per_block) ||
          Number(bookingSettings.min_booking_duration_hours) ||
          3,
        lead_time_hours: Number(bookingSettings.lead_time_hours) || 24,
        weekend_multiplier: Number(bookingSettings.weekend_multiplier) || 1.0,
        peak_season_multiplier: Number(bookingSettings.peak_season_multiplier) || 1.0,
        peak_season_dates: bookingSettings.peak_season_dates || [],
        off_peak_multiplier: Number(bookingSettings.off_peak_multiplier) || 1.0,
        off_peak_dates: bookingSettings.off_peak_dates || [],
        recording_rate_negotiable: false,
        weekly_schedule_scope:
          normalizeWeeklyScheduleScope(bookingSettings.weekly_schedule_scope),
        weekly_schedule_end_date:
          bookingSettings.weekly_schedule_scope === "until"
            ? bookingSettings.weekly_schedule_end_date
            : null,
        weekly_schedule_dates: Array.isArray(
          bookingSettings.weekly_schedule_dates,
        )
          ? bookingSettings.weekly_schedule_dates
          : [],
      };
      let { error: settingsError } = await supabase
        .from('studio_settings')
        .insert(settingsRow);

      if (settingsError && isMissingWeeklyScheduleColumns(settingsError)) {
        console.warn(
          "studio_settings weekly schedule columns are not available yet; retrying without them.",
          settingsError,
        );
        ({ error: settingsError } = await supabase
          .from('studio_settings')
          .insert(stripWeeklyScheduleColumns(settingsRow)));
      }

      if (settingsError) {
        throw new Error(
          `Failed to save booking settings: ${settingsError.message}`,
        );
      }

      // Insert promotions
      if (promotions.length > 0) {
        const { error: promosError } = await supabase
          .from("studio_promotions")
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
          console.warn("Failed to save promotions:", promosError.message);
        }
      }

      // Insert operating hours
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

        if (
          operatingHoursError &&
          isMissingWeeklyScheduleColumns(operatingHoursError)
        ) {
          console.warn(
            "studio_operating_hours weekly schedule columns are not available yet; retrying without them.",
            operatingHoursError,
          );
          ({ error: operatingHoursError } = await supabase
            .from('studio_operating_hours')
            .insert(operatingHours.map(stripWeeklyScheduleColumns)));
        }

        if (operatingHoursError) {
          throw new Error(
            `Failed to save weekly schedule: ${operatingHoursError.message}`,
          );
        }
      }

      // Insert calendar date overrides if any
      if (payload.calendar_availability && Array.isArray(payload.calendar_availability) && payload.calendar_availability.length > 0) {
        const dateOverrides = payload.calendar_availability
          .filter((entry: any) => entry.date && entry.slots && entry.slots.length > 0)
          .flatMap((entry: any) => entry.slots.map((slot: any, slotIndex: number) => ({
            studio_id: studioId,
            override_date: entry.date,
            is_open: true,
            open_time: slot.start,
            close_time: slot.end,
            slot_order: slotIndex,
            reason: buildDateOverrideReason(
              parseDateOverrideSessionType(
                entry.session_type,
                getDefaultDateOverrideSessionType(studioType),
              ),
              true,
            ),
          })));

        if (dateOverrides.length > 0) {
          const { error: dateOverridesError } = await supabase
            .from('studio_date_overrides')
            .insert(dateOverrides);
          if (dateOverridesError) {
            throw new Error(
              `Failed to save calendar availability: ${dateOverridesError.message}`,
            );
          }
        }
      }

      console.log("? Studio Created successfully:", data);
      setNewStudioId(data.id);
      setModalVisible(true);
    } catch (e: any) {
      console.error("? Error creating studio:", e);
      console.error("? Error message:", e?.message);
      console.error("? Error stack:", e?.stack);
      console.error(
        "? Full error object:",
        JSON.stringify(e, Object.getOwnPropertyNames(e), 2),
      );
      showAlert(
        "warning",
        "Couldn't Create Studio",
        `Failed to create studio: ${e?.message || "Unknown error"}`,
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSuccessRedirect = () => {
    setModalVisible(false);
    router.replace({ pathname: "/my_studio", params: { refresh: String(Date.now()) } });
  };

  // Start address verification (before studio creation)
  const startAddressVerification = async () => {
    // Check if identity is verified first
    if (!isIdentityVerified) {
      showAlert(
        "warning",
        "Identity Verification Required",
        "Please complete your identity verification before verifying your address. Go to Settings > Account Details to verify your identity.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Go to Settings",
            onPress: () => router.push("/account_details")
          }
        ]
      );
      return;
    }

    setAddressVerificationLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        return;
      }

      // Create the redirect URL for after verification
      const redirectUrl = Linking.createURL('address-verified', {
        queryParams: {
          entity_type: 'studio',
          mode: 'pre_creation'
        }
      });

      // Create address verification session (pre-creation mode)
      const { data, error } = await supabase.functions.invoke('create-address-verification', {
        body: {
          action: 'create',
          userId: session.user.id,
          entityType: 'studio',
          mode: 'pre_creation', // No entity ID yet - just verifying address
          redirect_url: redirectUrl
        }
      });

      console.log('Address verification response:', { data, error });

      // Handle errors from Supabase functions
      if (error || (data && data.error)) {
        let errorMessage = "Could not start address verification. Please try again.";

        // First check if data contains the error response (Supabase returns error body in data for non-2xx)
        if (data && data.error) {
          errorMessage = data.error;
          if (data.message) {
            errorMessage = data.message; // Use message as it's more user-friendly
          }
          console.log('Error from data:', errorMessage);
        } else if (error) {
          console.log('Error object:', JSON.stringify(error, null, 2));
          console.log('Error name:', error.name);
          console.log('Error message:', error.message);

          // For FunctionsHttpError, try multiple ways to get the error body
          try {
            // Method 1: Check if error has a body property directly
            if (error.body) {
              const body = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
              if (body?.error) {
                errorMessage = body.message || body.error;
              }
            }
            // Method 2: Check context.body
            else if (error.context?.body) {
              const body = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
              if (body?.error) {
                errorMessage = body.message || body.error;
              }
            }
            // Method 3: Try to read from context.json()
            else if (error.context && typeof error.context.json === 'function') {
              const errorBody = await error.context.json();
              console.log('Error body from context.json():', errorBody);
              if (errorBody?.error) {
                errorMessage = errorBody.message || errorBody.error;
              }
            }
          } catch (parseErr) {
            console.error('Error parsing error response:', parseErr);
            // If parsing fails, try to use the error message directly
            if (error.message && !error.message.includes('FunctionsHttpError')) {
              errorMessage = error.message;
            }
          }
        }

        throw new Error(errorMessage);
      }

      if (data?.verificationUrl) {
        setVerificationSessionId(data.sessionId);
        setAddressVerificationUrl(data.verificationUrl);
        setAddressVerificationModalVisible(true);
      } else {
        throw new Error('No verification URL returned');
      }
    } catch (e: any) {
      console.error('Address verification error:', e);
      showAlert(
        "warning",
        "Verification Error",
        e.message || "Could not start address verification. Please try again."
      );
    } finally {
      setAddressVerificationLoading(false);
    }
  };

  // Called after user completes address verification (before studio creation)
  const handleAddressVerificationComplete = async () => {
    setAddressVerificationModalVisible(false);
    setAddressVerificationUrl("");

    // Fetch the verified address from the session
    if (verificationSessionId) {
      try {
        const { data, error } = await supabase.functions.invoke('create-address-verification', {
          body: {
            action: 'get_session',
            session_id: verificationSessionId
          }
        });

        if (data?.extracted_address) {
          setAddress(data.extracted_address);
          setAddressVerified(true);
          setAddressVerificationStatus('verified');
          showAlert(
            "success",
            "Address Verified!",
            `Your studio address has been verified:\n\n${data.extracted_address}`
          );
        } else {
          // Verification may still be processing
          showAlert(
            "info",
            "Processing",
            "Your verification is being processed. The address will be updated once approved."
          );
          setAddressVerificationStatus('pending');
        }
      } catch (e) {
        console.error('Error fetching verification result:', e);
        showAlert(
          "info",
          "Verification Submitted",
          "Your verification has been submitted. You may need to refresh to see the verified address."
        );
      }
    }
  };

  // Skip address verification - just close modal
  const skipAddressVerification = () => {
    setAddressVerificationModalVisible(false);
    setAddressVerificationUrl("");
    // Just close - user can try again
  };

  // Legacy function for post-creation verification (keeping for backward compatibility)
  const initiateAddressVerification = async () => {
    if (!newStudioId) return;

    setAddressVerificationLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        return;
      }

      // Create the redirect URL for after verification
      const redirectUrl = Linking.createURL('address-verified', {
        queryParams: {
          entity_type: 'studio',
          entity_id: newStudioId
        }
      });

      // Create address verification session
      const { data, error } = await supabase.functions.invoke('create-address-verification', {
        body: {
          action: 'create',
          userId: session.user.id,
          entityId: newStudioId,
          entityType: 'studio',
          entityAddress: address,
          redirect_url: redirectUrl
        }
      });

      if (error) throw error;

      if (data?.verificationUrl) {
        setAddressVerificationUrl(data.verificationUrl);
        setAddressVerificationModalVisible(true);
      } else {
        throw new Error('No verification URL returned');
      }
    } catch (e: any) {
      console.error('Address verification error:', e);
      showAlert(
        "info",
        "Address Verification",
        "Studio created! You can verify your address later from My Studio.",
        [
          {
            text: "OK",
            onPress: () => router.replace({ pathname: "/my_studio", params: { refresh: String(Date.now()) } })
          }
        ]
      );
    } finally {
      setAddressVerificationLoading(false);
    }
  };

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
        // Web: Use HTML input element
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

      // Get current user session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showAlert("warning", "Session Expired", "Your session has expired. Please log in again.");
        setUploadingContract(false);
        return;
      }

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToUint8Array(base64);

      // Upload to Supabase Storage
      const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
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

      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToUint8Array(base64);

      const contentType = fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : `image/${fileName.split('.').pop()?.toLowerCase() || 'jpeg'}`;

      const filePath = `business-permits/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, bytes, {
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

      const filePath = `business-permits/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
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
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0)
        return;

      setUploadingEquipmentImage(true);
      const asset = result.assets[0];
      const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${session.user.id}/equipment/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const contentType = `image/${fileExt}`;

      const { data, error } = await uploadStorageObject({
        bucket: "listings",
        path: fileName,
        contentType,
        upsert: false,
        uri: asset.uri,
        body: typeof Blob !== "undefined" && (asset as any)?.file instanceof Blob
          ? (asset as any).file
          : undefined,
      });

      if (error) throw error;
      if (!data?.path) {
        throw new Error("File uploaded but no path was returned.");
      }

      const { data: urlData } = supabase.storage
        .from("listings")
        .getPublicUrl(data.path);

      setEquipmentForm({ ...equipmentForm, image: urlData.publicUrl });
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
const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
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

  const renderInput = (
    label: string,
    value: string,
    setValue: (text: string) => void,
    placeholder: string,
    multiline = false,
    keyboardType: any = "default",
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
            backgroundColor: colors.inputBackground,
            borderColor: isDark ? "#374151" : "#E5E7EB",
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={setValue}
          maxLength={inputMaxLength}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={keyboardType}
          style={[
            styles.textInput,
            {
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
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        <Header title="Add Studio" onBackPress={handleBack} />

        {/* Enhanced Step Indicator (Fixed at top) */}
        <View style={styles.stepIndicatorContainer}>
          <View style={styles.stepIndicatorContent}>
            {/* Progress Line Background */}
            <View
              style={[
                styles.progressLineBg,
                { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
              ]}
            />

            {/* Active Progress Line */}
            <View
              style={[
                styles.activeProgressLine,
                {
                  width: `${((step - 1) / (steps.length - 1)) * 100}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />

            {steps.map((s) => {
              const isActive = step >= s.id;
              const isCurrent = step === s.id;
              return (
                <View key={s.id} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      {
                        backgroundColor: isActive
                          ? colors.primary
                          : isDark
                            ? "#334155"
                            : "#E5E7EB",
                        borderColor: isActive
                          ? "#818cf8"
                          : isDark
                            ? "#1E293B"
                            : "#F3F4F6",
                      },
                    ]}
                  >
                    <Ionicons
                      name={isActive ? "checkmark" : (s.icon as any)}
                      size={18}
                      color={isActive ? "#fff" : colors.textSecondary}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                    style={[
                      styles.stepText,
                      {
                        fontFamily: isCurrent
                          ? "Poppins_600SemiBold"
                          : "Poppins_400Regular",
                        color: isActive ? colors.text : colors.textSecondary,
                        fontWeight: isCurrent ? "bold" : "normal",
                      },
                    ]}
                  >
                    {s.title}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <ScrollView
          style={styles.formContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Studio Details
              </Text>
              {renderInput(
                "Studio Name",
                studioName,
                setStudioName,
                "e.g. SoundWave Studios",
              )}

              {/* Studio Type Selection */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
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

              {renderInput(
                "Description",
                description,
                setDescription,
                "Brief description of your studio",
                true,
              )}

              {/* Image Upload */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Studio Photos
                </Text>
                <ImageUploader
                  images={images}
                  onImagesChange={setImages}
                  thumbnailIndex={thumbnailIndex}
                  onThumbnailChange={setThumbnailIndex}
                  maxImages={10}
                  bucketName="listings"
                  userId={newStudioId || "temp"}
                  folder="studios"
                />
              </View>

              {/* Studio Location - Pin on Map */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Studio Address
                </Text>
                <TouchableOpacity activeOpacity={1}
                  onPress={() => setLocationPickerVisible(true)}
                  style={[
                    styles.inputWrapper,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                      height: 56,
                      justifyContent: "center",
                      paddingHorizontal: 16,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
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
                        textAlignVertical: "center",
                      }}
                    >
                      {address || "Tap to select location on map"}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* OLD Address Verification Section - Commented Out
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Studio Address
                </Text>
                <Text
                  style={[styles.inputSubLabel, { color: colors.textSecondary, marginBottom: 12 }]}
                >
                  Verify your address using a utility bill (Meralco, Maynilad, etc.)
                </Text>
                
                {addressVerified && address ? (
                  <View
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.primary + '10',
                        borderColor: colors.primary,
                        padding: 16,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      <View style={{
                        backgroundColor: colors.primary,
                        borderRadius: 20,
                        padding: 6,
                      }}>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
                          Verified Address
                        </Text>
                        <Text style={{ color: colors.text, fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 2 }}>
                          {address}
                        </Text>
                      </View>
                      <Ionicons name="lock-closed" size={18} color={colors.primary} />
                    </View>
                  </View>
                ) : !isIdentityVerified ? (
                  <TouchableOpacity activeOpacity={1}
                    onPress={() => {
                      showAlert(
                        "warning",
                        "Identity Verification Required",
                        "Please complete your identity verification before verifying your address. Go to Settings > Account Details to verify your identity.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { 
                            text: "Go to Settings", 
                            onPress: () => router.push("/account_details")
                          }
                        ]
                      );
                    }}
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: '#F59E0B',
                        borderStyle: 'dashed',
                        padding: 20,
                      },
                    ]}
                  >
                    <View style={{ alignItems: "center", gap: 12 }}>
                      <View style={{
                        backgroundColor: '#F59E0B' + '15',
                        borderRadius: 30,
                        padding: 12,
                      }}>
                        <Ionicons name="shield-checkmark-outline" size={28} color="#F59E0B" />
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                          Identity Verification Required
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                          Please verify your identity first before you can verify your address
                        </Text>
                        <Text style={{ color: '#F59E0B', fontFamily: "Poppins_500Medium", fontSize: 12, marginTop: 8 }}>
                          Tap here to verify ?
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity activeOpacity={addressVerificationLoading ? 1 : 0.78}
                    onPress={startAddressVerification}
                    disabled={addressVerificationLoading}
                    style={[
                      styles.inputWrapper,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: isDark ? "#374151" : "#E5E7EB",
                        borderStyle: 'dashed',
                        padding: 20,
                      },
                    ]}
                  >
                    <View style={{ alignItems: "center", gap: 12 }}>
                      {addressVerificationLoading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <View style={{
                            backgroundColor: colors.primary + '15',
                            borderRadius: 30,
                            padding: 12,
                          }}>
                            <Ionicons name="document-text-outline" size={28} color={colors.primary} />
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                              Verify Your Address
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                              Upload a recent utility bill to verify and auto-fill your studio address
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              </View>
              */}



              {/* Dynamic Pricing Section */}
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Pricing
                </Text>
                <Text
                  style={[
                    styles.inputSubLabel,
                    { color: colors.textSecondary },
                  ]}
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
                          textAlign: "right",
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
                          textAlign: "right",
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
                            setRecordingSongsPerBlock(
                              text.replace(/[^0-9]/g, ""),
                            )
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
                        {(promo.criteria || promo.minimum_booking_hours || promo.minimum_spend) ? (
                          <Text style={{ fontFamily: "Poppins_400Regular", color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                            {promo.criteria ? `${promo.criteria}. ` : ""}
                            {promo.minimum_booking_hours ? `Min ${promo.minimum_booking_hours} hr. ` : ""}
                            {promo.minimum_spend ? `Min ₱${promo.minimum_spend}.` : ""}
                          </Text>
                        ) : null}
                        <Text style={{ fontFamily: "Poppins_400Regular", color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                          {promo.is_permanent
                            ? "Always available"
                            : `${new Date(promo.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} � ${new Date(promo.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
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

                    {/* Criteria */}
                    <Text style={{ fontFamily: "Poppins_500Medium", color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
                      How to Get This Promo (Optional)
                    </Text>
                    <TextInput
                      value={promotionForm.criteria}
                      onChangeText={(t) => setPromotionForm((p) => ({ ...p, criteria: t }))}
                      placeholder="e.g. Book 2+ hours on weekdays"
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
                          onChangeText={(t) => setPromotionForm((p) => ({ ...p, minimum_booking_hours: t }))}
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
                          onChangeText={(t) => setPromotionForm((p) => ({ ...p, minimum_spend: t }))}
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
                              minDate={new Date().toISOString().split("T")[0]}
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
                              minDate={promotionForm.start_date || new Date().toISOString().split("T")[0]}
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
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Studio Capacity (Pax)
                </Text>
                <Text
                  style={[
                    styles.inputSubLabel,
                    { color: colors.textSecondary },
                  ]}
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
              <View style={styles.inputContainer}>
                <Text
                  style={[styles.inputLabel, { color: colors.textSecondary }]}
                >
                  Custom Contract
                </Text>
                <Text
                  style={[
                    styles.inputSubLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  Upload a PDF contract that musicians will see before applying
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
                          style={[
                            styles.contractFileName,
                            { color: colors.text },
                          ]}
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
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#EF4444"
                      />
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
                        <Text
                          style={[styles.uploadText, { color: colors.text }]}
                        >
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
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Amenities
              </Text>

              <View
                style={[
                  styles.addAmenityContainer,
                  { borderColor: isDark ? "#374151" : "#E5E7EB" },
                ]}
              >
                <View
                  style={[
                    styles.addAmenityInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: isDark ? "#374151" : "#E5E7EB",
                    },
                  ]}
                >
                  <TextInput
                    value={newAmenity}
                    onChangeText={setNewAmenity}
                    placeholder="Add amenity (e.g. WiFi, AC)..."
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.textInput,
                      {
                        color: colors.text,
                        textAlignVertical: "center",
                        paddingVertical: 12,
                      },
                    ]}
                    onSubmitEditing={addAmenity}
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

              {amenities.length === 0 ? (
                <View
                  style={[
                    styles.emptyStateContainer,
                    { borderColor: isDark ? "#374151" : "#D1D5DB" },
                  ]}
                >
                  <Ionicons
                    name="mic-outline"
                    size={32}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.emptyStateText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    No amenities added yet
                  </Text>
                </View>
              ) : (
                <View style={styles.amenitiesList}>
                  {amenities.map((item, index) => (
                    <View
                      key={index}
                      style={[
                        styles.amenityItem,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.amenityText, { color: colors.text }]}
                      >
                        {item}
                      </Text>
                      <TouchableOpacity activeOpacity={1} onPress={() => removeAmenity(index)}>
                        <Ionicons
                          name="close-circle"
                          size={18}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Studio Equipment Section */}
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Studio Equipment
                </Text>
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
                  <Ionicons
                    name="add-circle"
                    size={24}
                    color={colors.primary}
                  />
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
                                  backgroundColor: isDark
                                    ? "#374151"
                                    : "#E5E7EB",
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
                              style={[
                                styles.equipmentName,
                                { color: colors.text },
                              ]}
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
                    style={[
                      styles.selectedCount,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {equipment.length} equipment item
                    {equipment.length !== 1 ? "s" : ""} added
                  </Text>
                )}

                {/* Quick Add from Presets */}
                <Text
                  style={[
                    styles.subtitle,
                    {
                      color: colors.textSecondary,
                      marginTop: 24,
                      marginBottom: 12,
                    },
                  ]}
                >
                  Or quickly select from common equipment
                </Text>

                <GigPresetDropdown
                  options={INSTRUMENT_OPTIONS.map((instrument) => instrument.name)}
                  selectedValues={selectedInstruments.map((instrument) => instrument.name)}
                  onSelect={(value) => {
                    const instrument = INSTRUMENT_OPTIONS.find((option) => option.name === value);
                    if (instrument) toggleInstrument(instrument);
                  }}
                  placeholder="Choose common equipment"
                />

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
                          style={[
                            styles.instrumentName,
                            { color: colors.text },
                          ]}
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
                    style={[
                      styles.selectedCount,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {selectedInstruments.length} preset
                    {selectedInstruments.length !== 1 ? "s" : ""} selected
                  </Text>
                )}
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Set Your Availability
              </Text>
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
                  <Text
                    style={[styles.sectionSubtitle, { color: colors.text }]}
                  >
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
                      return maxDate.toISOString().split("T")[0];
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
                {Object.entries(selectedDates).filter(
                  ([_, data]) => data.selected,
                ).length > 0 && (
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
                                  <View
                                    style={styles.sessionTypeOptions}
                                  >
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
                                    <View
                                      style={styles.timeInputRow}
                                    >
                                      <TextInput
                                        value={slot.start.split(" ")[0]}
                                        onChangeText={(text) => {
                                          const formatted = formatTimeInput(text);
                                          const newDates = { ...selectedDates };
                                          const period =
                                            slot.start.split(" ")[1] || "AM";
                                          newDates[dateStr].slots[
                                            slotIndex
                                          ].start = `${formatted} ${period}`;
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
                                          newDates[dateStr].slots[
                                            slotIndex
                                          ].start = toggleAmPm(slot.start);
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
                                        <Text
                                          style={[
                                            styles.ampmBtnText,
                                            { color: colors.text },
                                          ]}
                                        >
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
                                    <View
                                      style={styles.timeInputRow}
                                    >
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
                                        <Text
                                          style={[
                                            styles.ampmBtnText,
                                            { color: colors.text },
                                          ]}
                                        >
                                          {slot.end.split(" ")[1] || "PM"}
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                  {data.slots.length > 1 && (
                                    <TouchableOpacity activeOpacity={1}
                                      onPress={() => {
                                        const newDates = { ...selectedDates };
                                        newDates[dateStr].slots.splice(
                                          slotIndex,
                                          1,
                                        );
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
                                  ?? This overrides weekly {dayName} schedule (
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
                      <View
                        style={styles.sessionTypeOptions}
                      >
                        {([
                          { value: "both", label: "Both" },
                          { value: "rehearsal", label: "Rehearsal" },
                          { value: "recording", label: "Recording" },
                        ] as const).map((option) => {
                          const selectedWeeklySessionType =
                            normalizeWeeklySessionType(
                              daySchedule.sessionType,
                              "both",
                            );
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
                          <View
                            style={styles.timeInputRow}
                          >
                            <TextInput
                              value={slot.start.split(" ")[0]}
                              onChangeText={(text) => {
                                const formatted = formatTimeInput(text);
                                const newAvailability = [...availability];
                                const period = slot.start.split(" ")[1];
                                newAvailability[dayIndex].slots[
                                  slotIndex
                                ].start = `${formatted} ${period}`;
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
                                newAvailability[dayIndex].slots[
                                  slotIndex
                                ].start = toggleAmPm(slot.start);
                                setAvailability(newAvailability);
                              }}
                              style={[
                                styles.ampmBtn,
                                {
                                  backgroundColor: isDark
                                    ? "#374151"
                                    : "#E5E7EB",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.ampmBtnText,
                                  { color: colors.text },
                                ]}
                              >
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
                          <View
                            style={styles.timeInputRow}
                          >
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
                                {
                                  backgroundColor: isDark
                                    ? "#374151"
                                    : "#E5E7EB",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.ampmBtnText,
                                  { color: colors.text },
                                ]}
                              >
                                {slot.end.split(" ")[1]}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {daySchedule.slots.length > 1 && (
                          <TouchableOpacity activeOpacity={1}
                            onPress={() => {
                              const newAvailability = [...availability];
                              newAvailability[dayIndex].slots.splice(
                                slotIndex,
                                1,
                              );
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

                  {daySchedule.slots.length > 0 &&
                    daySchedule.slots.length < 3 && (
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => {
                          const newAvailability = [...availability];
                          // Default next slot
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

                  {daySchedule.slots.length > 0 && (
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
                          const isSelected =
                            daySchedule.weeklyScheduleScope === option.value;
                          return (
                            <TouchableOpacity
                              key={option.value}
                              activeOpacity={1}
                              onPress={() => {
                                const nextScope =
                                  normalizeWeeklyScheduleScope(option.value);
                                updateWeeklyScheduleForDay(dayIndex, {
                                  weeklyScheduleScope: nextScope,
                                });
                                setActiveWeeklyEndDatePickerDay(
                                  nextScope === "until"
                                    ? daySchedule.day
                                    : null,
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

                      {daySchedule.weeklyScheduleScope === "until" && (
                        <View style={{ marginTop: 12 }}>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() =>
                              setActiveWeeklyEndDatePickerDay(
                                activeWeeklyEndDatePickerDay ===
                                  daySchedule.day
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
                                    color:
                                      daySchedule.weeklyScheduleEndDate
                                        ? colors.text
                                        : colors.textSecondary,
                                    fontSize: 14,
                                    marginTop: 2,
                                    fontFamily: "Poppins_600SemiBold",
                                  }}
                                >
                                  {daySchedule.weeklyScheduleEndDate
                                    ? formatReadableDate(
                                        daySchedule.weeklyScheduleEndDate,
                                      )
                                    : "Pick from calendar"}
                                </Text>
                              </View>
                            </View>
                            <Ionicons
                              name={
                                activeWeeklyEndDatePickerDay ===
                                daySchedule.day
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
                                setActiveWeeklyEndDatePickerDay(
                                  daySchedule.day,
                                );
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

                          {activeWeeklyEndDatePickerDay ===
                            daySchedule.day && (
                            <View
                              style={{
                                marginTop: 10,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: colors.border,
                                overflow: "hidden",
                                backgroundColor: isDark
                                  ? "#111827"
                                  : "#FFFFFF",
                              }}
                            >
                              <Calendar
                                current={
                                  daySchedule.weeklyScheduleEndDate ||
                                  getLocalDateKey()
                                }
                                minDate={getLocalDateKey()}
                                onDayPress={(day) => {
                                  updateWeeklyScheduleForDay(dayIndex, {
                                    weeklyScheduleEndDate: day.dateString,
                                  });
                                  setActiveWeeklyEndDatePickerDay(null);
                                }}
                                markedDates={
                                  ISO_DATE_PATTERN.test(
                                    daySchedule.weeklyScheduleEndDate,
                                  )
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
                                  textDisabledColor: isDark
                                    ? "#4B5563"
                                    : "#D1D5DB",
                                  monthTextColor: colors.text,
                                  arrowColor: colors.primary,
                                }}
                              />
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {step === 4 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Review Details
              </Text>

              <View
                style={[
                  styles.reviewContainer,
                  { backgroundColor: isDark ? "#1F2937" : "#F9FAFB" },
                ]}
              >
                <View>
                  <Text style={styles.reviewLabel}>Studio Info</Text>
                  <Text style={[styles.reviewValue, { color: colors.text }]}>
                    {studioName || "No Name"}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    {address || "No Address"}
                  </Text>
                  <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
                    Type: {studioType}
                  </Text>
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                  ]}
                />

                {/* Pricing Review */}
                <View>
                  <Text style={styles.reviewLabel}>Pricing</Text>
                  {(studioType === "Rehearsal" || studioType === "Both") && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons
                        name="musical-notes"
                        size={14}
                        color={colors.primary}
                      />
                      <Text
                        style={{
                          color: colors.text,
                          fontFamily: "Poppins_500Medium",
                        }}
                      >
                        Rehearsal: ₱{rehearsalRate || "0"}/hr
                      </Text>
                    </View>
                  )}
                  {(studioType === "Recording" || studioType === "Both") && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      <Ionicons name="mic" size={14} color="#EF4444" />
                      <Text
                        style={{
                          color: colors.text,
                          fontFamily: "Poppins_500Medium",
                        }}
                      >
                        Recording: ₱{recordingRate || "0"}/song
                      </Text>
                    </View>
                  )}
                </View>

                {/* Promotions review */}
                {promotions.length > 0 && (
                  <>
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                      ]}
                    />
                    <View>
                      <Text style={styles.reviewLabel}>
                        Promotions ({promotions.length})
                      </Text>
                      {promotions.map((promo) => (
                        <View key={promo.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
                          <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium", fontSize: 12 }}>
                            {promo.name}: {promo.discount_type === "percentage" ? `${promo.discount_value}% off` : `₱${promo.discount_value}/hr off`}
                            {" "}({promo.applies_to === "both" ? "All" : promo.applies_to})
                            {promo.criteria ? ` � ${promo.criteria}` : ""}
                            {promo.minimum_booking_hours ? ` � Min ${promo.minimum_booking_hours} hr` : ""}
                            {promo.minimum_spend ? ` � Min ₱${promo.minimum_spend}` : ""}
                            {" "}� {promo.is_permanent ? "Regular" : `${promo.start_date} � ${promo.end_date}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                  ]}
                />

                <View>
                  <Text style={styles.reviewLabel}>
                    Images ({images.length})
                  </Text>
                  {images.length > 0 ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {images.length} photo{images.length !== 1 ? "s" : ""}{" "}
                      uploaded
                    </Text>
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      No images added
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                  ]}
                />

                <View>
                  <Text style={styles.reviewLabel}>
                    Amenities ({amenities.length})
                  </Text>
                  <View style={styles.amenitiesList}>
                    {amenities.map((a, i) => (
                      <View
                        key={i}
                        style={[
                          styles.tag,
                          {
                            backgroundColor: isDark ? "#374151" : "white",
                            borderColor: isDark ? "#4B5563" : "#E5E7EB",
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 12, color: colors.text }}>
                          {a}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                  ]}
                />

                <View>
                  <Text style={styles.reviewLabel}>
                    Studio Equipment (
                    {equipment.length + selectedInstruments.length})
                  </Text>
                  {equipment.length > 0 && (
                    <View style={{ marginBottom: 8 }}>
                      {equipment.map((eq, i) => (
                        <View
                          key={i}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          {eq.image ? (
                            <Image
                              source={{ uri: eq.image }}
                              style={{ width: 24, height: 24, borderRadius: 4 }}
                            />
                          ) : (
                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 4,
                                backgroundColor: colors.border,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name="cube"
                                size={12}
                                color={colors.textSecondary}
                              />
                            </View>
                          )}
                          <Text style={{ fontSize: 12, color: colors.text }}>
                            {eq.name} (x{eq.quantity})
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {selectedInstruments.length > 0 ? (
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                      {selectedInstruments.map((inst, i) => (
                        <View
                          key={i}
                          style={{ alignItems: "center", width: 60 }}
                        >
                          <Image
                            source={{ uri: inst.image }}
                            style={{ width: 40, height: 40, borderRadius: 8 }}
                          />
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.textSecondary,
                              textAlign: "center",
                            }}
                            numberOfLines={1}
                          >
                            {inst.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    equipment.length === 0 && (
                      <Text
                        style={{ color: colors.textSecondary, fontSize: 12 }}
                      >
                        No equipment added
                      </Text>
                    )
                  )}
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                  ]}
                />

                <View>
                  <Text style={styles.reviewLabel}>Contract</Text>
                  {contractUrl ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons
                        name="document-text"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={{ color: colors.text, fontSize: 12 }}>
                        {contractFileName}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      No contract uploaded
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                  ]}
                />

                <View>
                  <Text style={styles.reviewLabel}>Availability</Text>
                  {availability
                    .filter((d) => d.slots.length > 0)
                    .map((daySchedule) => (
                      <View key={daySchedule.day} style={{ marginBottom: 4 }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontFamily: "Poppins_500Medium",
                          }}
                        >
                          {daySchedule.day}
                        </Text>
                        {daySchedule.slots.map((slot, i) => (
                          <Text
                            key={i}
                            style={{
                              color: colors.textSecondary,
                              fontSize: 12,
                              marginLeft: 8,
                            }}
                          >
                            {slot.start} - {slot.end}
                          </Text>
                        ))}
                      </View>
                    ))}
                </View>
              </View>

              <Text style={styles.termsText}>
                By tapping Add Studio, you agree to our Terms and Conditions.
              </Text>
            </View>
          )}

          {/* Navigation Buttons */}
          <View style={styles.navigationButtons}>
            <TouchableOpacity
              onPress={handleBack}
              disabled={creating}
              activeOpacity={creating ? 1 : 0.78}
              style={[
                styles.backBtn,
                {
                  flex: 1,
                  borderColor: isDark ? "#374151" : "#E5E7EB",
                  opacity: creating ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.backBtnText, { color: colors.text }]}>
                {step === 1 ? "Cancel" : "Back"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              disabled={creating || !isCurrentStepComplete}
              activeOpacity={creating || !isCurrentStepComplete ? 1 : 0.78}
              style={[
                styles.nextBtn,
                {
                  flex: 1,
                  backgroundColor: isCurrentStepComplete ? colors.primary : colors.border,
                  shadowColor: colors.primary,
                  opacity: creating || !isCurrentStepComplete ? 0.6 : 1,
                },
              ]}
            >
              {creating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.nextBtnText, { color: isCurrentStepComplete ? "#FFFFFF" : colors.textSecondary }]}>
                  {step === 4 ? "Add Studio" : "Next"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        </View>
        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        title="Success!"
        message={`Studio "${studioName}" has been successfully listed!`}
        buttonText="Go to Studio"
        onClose={handleSuccessRedirect}
        showCancelButton={false}
      />

      <Modal
        visible={creating}
        loading
        loadingMessage="Creating studio..."
        onClose={() => { }}
      />

      {/* Address Verification Modal - Commented Out
      {addressVerificationModalVisible && (
        <View style={styles.verificationModalOverlay}>
          <View style={[styles.verificationModalContainer, { backgroundColor: colors.background }]}>
            <View style={styles.verificationModalHeader}>
              <Text style={[styles.verificationModalTitle, { color: colors.text }]}>
                Verify Studio Address
              </Text>
              <TouchableOpacity activeOpacity={1} onPress={skipAddressVerification} style={styles.skipButton}>
                <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>Skip for now</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.verificationInfoBanner, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="information-circle" size={20} color={colors.primary} />
              <Text style={[styles.verificationInfoText, { color: colors.text }]}>
                Upload a recent utility bill (Meralco, Maynilad, etc.) to verify your studio address. The name on the bill should match your verified identity.
              </Text>
            </View>
            {addressVerificationUrl ? (
              <View style={styles.webviewContainer}>
                {Platform.OS === 'web' ? (
                  <iframe
                    src={addressVerificationUrl}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                    allow="camera; microphone; fullscreen"
                  />
                ) : (
                  <WebView
                    source={{ uri: addressVerificationUrl }}
                    style={styles.webview}
                    onNavigationStateChange={(navState) => {
                      if (navState.url.includes('address-verified') || 
                          navState.url.includes('verification-complete') ||
                          navState.url.includes('status=approved') ||
                          navState.url.includes('smile-webhook') ||
                          navState.url.includes('callback=') ||
                          navState.url.includes('/link/success')) {
                        handleAddressVerificationComplete();
                      }
                    }}
                    onMessage={(event) => {
                      try {
                        const data = JSON.parse(event.nativeEvent.data);
                        console.log('Smile Wink Widget message:', data);
                        if (data.eventName === 'UPLOADS_CREATED' || 
                            data.eventName === 'LINK_CLOSED' ||
                            data.type === 'close' ||
                            data.type === 'success') {
                          handleAddressVerificationComplete();
                        }
                      } catch (e) {}
                    }}
                    javaScriptEnabled
                    domStorageEnabled
                    startInLoadingState
                    renderLoading={() => (
                      <View style={styles.webviewLoading}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
                          Loading verification...
                        </Text>
                      </View>
                    )}
                  />
                )}
              </View>
            ) : (
              <View style={styles.webviewLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
                  Preparing verification...
                </Text>
              </View>
            )}
            <View style={styles.verificationModalFooter}>
              <TouchableOpacity activeOpacity={1}
                onPress={handleAddressVerificationComplete}
                style={[styles.verificationCompleteBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.verificationCompleteBtnText}>I've Completed Verification</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      */}

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
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
  pageFrame: {
    flex: 1,
    width: "100%",
  },
  pageFrameWeb: {
    maxWidth: 1240,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndicatorContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  stepIndicatorContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  progressLineBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  activeProgressLine: {
    position: "absolute",
    left: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  stepItem: {
    alignItems: "center",
    zIndex: 10,
    flex: 1,
    minWidth: 0,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
  },
  stepText: {
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 15,
    includeFontPadding: false,
    width: "100%",
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  scrollContent: {
    paddingBottom: 150,
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 24,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
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
  textInput: {
    padding: 16,
    fontFamily: "Poppins_400Regular",
    textAlign: "left",
    textAlignVertical: "center",
  },

  // Improved Amenities Styles
  addAmenityContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  addAmenityInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  addAmenityButton: {
    width: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
    marginBottom: 24,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  amenitiesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  amenityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  amenityText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },

  reviewContainer: {
    padding: 16,
    borderRadius: 16,
    gap: 16,
    marginBottom: 16,
  },
  reviewLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    color: "#9CA3AF",
    fontWeight: "bold",
    marginBottom: 4,
  },
  reviewValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  divider: {
    height: 1,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  termsText: {
    textAlign: "center",
    fontSize: 12,
    color: "#9CA3AF",
    paddingHorizontal: 16,
  },
  navigationButtons: {
    marginTop: 32,
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  backBtnText: {
    fontFamily: "Poppins_600SemiBold",
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextBtnText: {
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
  },
  dayCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayLabel: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: 8,
    height: 44,
    minWidth: 74,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontFamily: "Poppins_400Regular",
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
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  inputSubLabel: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: -8,
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
  // Instruments styles
  instrumentsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  instrumentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "relative",
    minWidth: IS_WEB ? 140 : 120,
    maxWidth: IS_WEB ? 220 : undefined,
  },
  instrumentImage: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  instrumentName: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    flex: 1,
  },
  instrumentCheckmark: {
    width: 18,
    height: 18,
    borderRadius: 9,
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
  // Address Verification Modal Styles
  verificationModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  verificationModalContainer: {
    width: '95%',
    height: '90%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  verificationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  verificationModalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  skipButton: {
    padding: 8,
  },
  skipButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  verificationInfoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    gap: 10,
  },
  verificationInfoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 18,
  },
  webviewContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  verificationCompleteBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  verificationCompleteBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
});

