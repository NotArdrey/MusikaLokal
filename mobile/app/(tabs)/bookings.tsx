import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ExpoLinking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Calendar } from "react-native-calendars";
import {
    ActivityIndicator,
    AppState,
    Dimensions,
    FlatList,
    InteractionManager,
    Linking,
    Modal as RNModal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import BookingDetailsSheet from "../../src/components/BookingDetailsSheet";
import CachedImage from "../../src/components/CachedImage";
import CustomAlert, { AlertType } from "../../src/components/CustomAlert";
import GuestSignInGate from "../../src/components/GuestSignInGate";
import Header from "../../src/components/header";
import InAppMediaViewer, { isInAppMediaUrl } from "../../src/components/InAppMediaViewer";
import BookingActionModal, { normalizeVisibleInput } from "../../src/components/modal";
import Navbar from "../../src/components/navbar";
import Skeleton from "../../src/components/Skeleton";
import SlidingTabBar from "../../src/components/SlidingTabBar";
import { useAuth } from "../../src/context/AuthContext";
import { useBottomOverlay, useBottomOverlayVisibility } from "../../src/context/BottomOverlayContext";
import { emitToast } from "../../src/events/toastBus";
import { useTheme } from "../../src/context/ThemeContext";
import { useBookingsSummaryQuery } from "../../src/data/hooks";
import { queryKeys } from "../../src/data/queryKeys";
import { createBookingCheckout } from "../../src/services/paymongo";
import { buildNotificationRouteMeta } from "../../src/utils/notificationNavigation";
import { formatFriendlyDateTime } from "../../src/utils/friendlyDateTime";
import { isE2EFixtureMode } from "../../src/utils/e2eFixtures";
import { usePageLoadLogger } from "../../src/utils/loadTimeLogger";
import { setSmoothTab } from "../../src/utils/smoothTabs";
import { resolveSupabaseMediaUrl } from "../../src/utils/supabaseMedia";
import {
  formatRecordingHours,
  getRecordingRequiredBlocks,
  getRecordingRequiredHours,
  resolveRecordingRule,
} from "../../src/utils/recordingRule";

const debugLog = (..._args: unknown[]) => { };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const EMPTY_ACTIVITY_ITEMS: any[] = [];

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scale = (size: number) => {
  const newSize = (SCREEN_WIDTH / 375) * size;
  return Math.max(newSize, size * 0.85); // Minimum 85% of original size
};
const verticalScale = (size: number) => {
  const baseHeight = 812;
  const ratio = SCREEN_HEIGHT / baseHeight;
  const clampedRatio = Math.max(0.8, Math.min(1.2, ratio));
  return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

const BOOKING_CARD_IMAGE_WIDTH = 640;
const BOOKING_CARD_IMAGE_HEIGHT = 240;
const BOOKING_AVATAR_IMAGE_SIZE = 64;

const REQUEST_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop";

const VISIBLE_CONNECTION_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "approved",
  "connected",
  "rejected",
  "declined",
  "cancelled",
];

const toStartCase = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatConnectionEntityType = (value: unknown) =>
  toStartCase(String(value || "connection").replace(/_/g, " "));

const buildConnectionRequestTypeLabel = (eventDetails: any) => {
  const senderType = String(eventDetails?.sender_entity_type || "").trim().toLowerCase();
  const receiverType = String(eventDetails?.receiver_entity_type || "").trim().toLowerCase();
  const requestKind = String(
    eventDetails?.request_kind || eventDetails?.request_details?.request_kind || "",
  ).trim().toLowerCase();

  if (senderType === "group" && receiverType === "musician" && requestKind === "invite") {
    return "Group Invite";
  }

  if (senderType === "production_team" && receiverType === "venue") {
    return "Production Team Application";
  }

  if (senderType === "venue" && receiverType === "production_team") {
    return "Gig Invite";
  }

  if (senderType === "production_team" && (receiverType === "musician" || receiverType === "group")) {
    return "Production Team Invite";
  }

  if ((senderType === "musician" || senderType === "group") && receiverType === "production_team") {
    return "Production Team Application";
  }

  if ((senderType === "musician" || senderType === "group") && receiverType === "group") {
    return "Group Application";
  }

  return `${formatConnectionEntityType(senderType || receiverType)} Request`;
};

const getConnectionRequestStatusLabel = (status: unknown) => {
  const normalized = String(status || "pending").trim().toLowerCase();

  if (!normalized || normalized === "pending") {
    return "Pending";
  }

  if (["accepted", "approved", "connected"].includes(normalized)) {
    return "Accepted";
  }

  if (["rejected", "declined", "cancelled"].includes(normalized)) {
    return "Declined";
  }

  return toStartCase(normalized.replace(/_/g, " "));
};

const getConnectionRequestStatusColors = (status: unknown) => {
  const normalized = String(status || "pending").trim().toLowerCase();

  if (["accepted", "approved", "connected"].includes(normalized)) {
    return { backgroundColor: "#10B98120", textColor: "#10B981" };
  }

  if (["rejected", "declined", "cancelled"].includes(normalized)) {
    return { backgroundColor: "#EF444420", textColor: "#EF4444" };
  }

  return { backgroundColor: "#F59E0B20", textColor: "#F59E0B" };
};

const toNonEmptyString = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
};

const formatBookingCardDateTime = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "TBA";
  return formatFriendlyDateTime(raw, { fallback: raw });
};

const formatBookingClockTime = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = raw.includes("T") ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!timeMatch) return raw;

  const hour = Number(timeMatch[1]);
  if (!Number.isFinite(hour)) return raw;

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${timeMatch[2]} ${period}`;
};

const formatBookingTimeRange = (startTime: unknown, endTime: unknown) => {
  const startLabel = formatBookingClockTime(startTime);
  if (!startLabel) return "";

  const endLabel = formatBookingClockTime(endTime);
  if (!endLabel || endLabel === startLabel) return startLabel;

  return `${startLabel} - ${endLabel}`;
};

const getLocalEventDayEndTimestamp = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw.toLowerCase() === "tba") return null;

  const datePart = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePart) {
    const [, year, month, day] = datePart;
    const endOfDay = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      23,
      59,
      59,
      999,
    );

    return Number.isNaN(endOfDay.getTime()) ? null : endOfDay.getTime();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(23, 59, 59, 999);
  return parsed.getTime();
};

const getGigApplicationEventEndTimestamp = (item: any) => {
  const candidates = [item?.raw_date, item?.date, item?.start_time];

  for (const candidate of candidates) {
    const timestamp = getLocalEventDayEndTimestamp(candidate);
    if (timestamp !== null) return timestamp;
  }

  return null;
};

const isGigApplicationEventFinished = (item: any, referenceDate = new Date()) => {
  if (item?.type_id !== "gig_application") return false;

  const eventEndTimestamp = getGigApplicationEventEndTimestamp(item);
  return eventEndTimestamp !== null && eventEndTimestamp < referenceDate.getTime();
};

const getStudioBookingStartTimestamp = (item: any) => {
  if (item?.type_id !== "studio_booking") return null;

  const dateMatch = String(item?.raw_date || item?.date || "").match(
    /^(\d{4})-(\d{2})-(\d{2})/,
  );
  if (!dateMatch) return null;

  const timeMatch = String(item?.start_time || "00:00:00").match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!timeMatch) return null;

  const [, year, month, day] = dateMatch;
  const [, hour, minute, second = "0"] = timeMatch;
  const startDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isNaN(startDate.getTime()) ? null : startDate.getTime();
};

const isStudioBookingSessionStarted = (item: any, referenceDate = new Date()) => {
  const startTimestamp = getStudioBookingStartTimestamp(item);
  return startTimestamp !== null && startTimestamp <= referenceDate.getTime();
};

const canCompleteBookingItem = (item: any, referenceDate = new Date()) =>
  item?.type_id === "studio_booking"
    ? isStudioBookingSessionStarted(item, referenceDate)
    : isGigApplicationEventFinished(item, referenceDate);

const formatApplicationReceivedDateTime = (item: any) => {
  const raw =
    toNonEmptyString(item?.submitted_at) ||
    toNonEmptyString(item?.received_at) ||
    toNonEmptyString(item?.created_at);

  if (!raw) return null;

  return formatFriendlyDateTime(raw, {
    fallback: raw,
    forceIncludeTime: true,
  });
};

const extractConnectionRequestDetails = (eventDetails: any, attachmentUrl: unknown) => {
  const requestDetails =
    eventDetails?.request_details && typeof eventDetails.request_details === "object"
      ? eventDetails.request_details
      : {};
  const requestKind =
    toNonEmptyString(requestDetails?.request_kind) ||
    toNonEmptyString(eventDetails?.request_kind) ||
    "application";
  const normalizedAttachmentUrl = toNonEmptyString(attachmentUrl);

  return {
    requestKind,
    pitchMessage:
      toNonEmptyString(requestDetails?.pitch_message) ||
      toNonEmptyString(eventDetails?.pitch_message),
    applicationContext:
      toNonEmptyString(requestDetails?.application_context) ||
      toNonEmptyString(eventDetails?.application_context),
    contextLabel:
      toNonEmptyString(requestDetails?.context_label) ||
      toNonEmptyString(eventDetails?.context_label) ||
      "Application Context",
    cvUrl:
      toNonEmptyString(requestDetails?.cv_url) ||
      (requestKind === "application" ? normalizedAttachmentUrl : null),
    videoUrl:
      toNonEmptyString(requestDetails?.video_url) ||
      toNonEmptyString(eventDetails?.video_url),
    contractUrl:
      toNonEmptyString(requestDetails?.contract_url) ||
      (requestKind === "invite" ? normalizedAttachmentUrl : null),
    slotType:
      toNonEmptyString(requestDetails?.slot_type) ||
      toNonEmptyString(eventDetails?.slot_type),
    rosterEntryName:
      toNonEmptyString(requestDetails?.roster_entry_name) ||
      toNonEmptyString(eventDetails?.roster_entry_name),
    rosterEntryKind:
      toNonEmptyString(requestDetails?.roster_entry_kind) ||
      toNonEmptyString(eventDetails?.roster_entry_kind),
  };
};

const buildConnectionRequestDetailLines = (item: any) =>
  [
    item?.request_context_label && item?.counterparty_name
      ? `${item.request_context_label}: ${item.counterparty_name}`
      : null,
    item?.message ? `Pitch: ${item.message}` : "Pitch: No pitch provided.",
    item?.request_application_context
      ? `${item.request_context_title || "Application Context"}: ${item.request_application_context}`
      : null,
    item?.request_slot_type
      ? `Slot / Role: ${formatConnectionEntityType(item.request_slot_type)}`
      : null,
    item?.request_roster_entry_name
      ? `Featured Performer: ${item.request_roster_entry_name}`
      : null,
    item?.request_contract_url
      ? "Contract: Attached"
      : null,
    item?.request_cv_url
      ? "CV / Resume: Attached"
      : null,
    item?.request_video_url
      ? "Video / Reel: Attached"
      : null,
    `Status: ${item?.status || "Pending"}`,
  ].filter(Boolean);

const toPaymentAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getBookingIdsForPaymentItem = (item: any): string[] => {
  const rawIds = Array.isArray(item?.booking_ids)
    ? item.booking_ids
    : Array.isArray(item?.bookingIds)
      ? item.bookingIds
      : [item?.id];

  const ids = rawIds.filter(Boolean).map((id: any) => String(id));
  return Array.from(new Set<string>(ids));
};

const getPaymentItemTotalAmount = (item: any) =>
  toPaymentAmount(item?.batch_total_cost ?? item?.total_cost ?? item?.payment_amount);

const getPaymentItemDueAmount = (item: any) => {
  const remainingBalance = toPaymentAmount(item?.remaining_balance);
  const status = String(item?.payment_status || "").toLowerCase();

  if (status === "paid") return 0;
  if (remainingBalance > 0) return remainingBalance;

  return getPaymentItemTotalAmount(item);
};

const getBookingPaymentStatus = (item: any) =>
  String(item?.payment_status || "").toLowerCase();

const getBookingRemainingBalance = (item: any) =>
  toPaymentAmount(item?.remaining_balance);

const isBookingPaymentSettled = (item: any) =>
  getBookingPaymentStatus(item) === "paid";

const getBookingPaidAmount = (item: any) => {
  const paymentStatus = getBookingPaymentStatus(item);
  const paymentAmount = toPaymentAmount(item?.payment_amount);
  const totalAmount = getPaymentItemTotalAmount(item);
  const remainingBalance = getBookingRemainingBalance(item);

  if (paymentStatus === "paid") {
    return paymentAmount > 0 ? paymentAmount : totalAmount;
  }

  if (paymentStatus === "partial") {
    if (paymentAmount > 0 && (!totalAmount || paymentAmount < totalAmount || remainingBalance <= 0)) {
      return paymentAmount;
    }

    return Math.max(0, totalAmount - remainingBalance);
  }

  return 0;
};

const formatPesoAmount = (value: unknown) =>
  `\u20B1${toPaymentAmount(value).toLocaleString()}`;

const getBookingDisplayPaidAmount = (item: any) => {
  const paidAmount = getBookingPaidAmount(item);
  const paymentAmount = toPaymentAmount(item?.payment_amount);
  const paymentStatus = getBookingPaymentStatus(item);

  if (paidAmount > 0) return paidAmount;

  if (["paid", "partial", "refunded", "refund_pending"].includes(paymentStatus)) {
    return paymentAmount > 0 ? paymentAmount : getPaymentItemTotalAmount(item);
  }

  return 0;
};

const getBookingPaidAmountLabel = (item: any) => {
  const paidAmount = getBookingDisplayPaidAmount(item);
  const totalAmount = getPaymentItemTotalAmount(item);

  if (totalAmount > 0 && paidAmount < totalAmount) {
    return `${formatPesoAmount(paidAmount)} of ${formatPesoAmount(totalAmount)}`;
  }

  return formatPesoAmount(paidAmount);
};

const isStudioOwnerCancellation = (
  item: any,
  currentUserId?: string | null,
  currentUserRole?: string | null,
) => {
  const viewerAccess = String(item?.viewer_access || "").trim().toLowerCase();
  const isDirectOwnerRole =
    String(currentUserRole || "").trim().toLowerCase() === "studio-owner" &&
    viewerAccess !== "staff";

  return (
    item?.type_id === "studio_booking" &&
    (
      isDirectOwnerRole ||
      viewerAccess === "studio_owner" ||
      (!!currentUserId && item?.studio_owner_id === currentUserId)
    )
  );
};

const isDownpaymentBalanceItem = (item: any) =>
  item?.payment_type === "downpayment" && getBookingRemainingBalance(item) > 0;

const isBalancePaymentProcessing = (item: any) =>
  isDownpaymentBalanceItem(item) &&
  getBookingPaymentStatus(item) === "pending" &&
  item?.raw_status === "confirmed" &&
  Boolean(item?.checkout_session_id);

const canPayRemainingBalance = (item: any) => {
  if (!isDownpaymentBalanceItem(item) || isBookingPaymentSettled(item)) {
    return false;
  }

  const status = getBookingPaymentStatus(item);
  return (
    status === "partial" ||
    (
      item?.raw_status === "confirmed" &&
      (status === "unpaid" || status === "failed")
    )
  );
};

const shouldShowBalanceDueBadge = (item: any) =>
  isDownpaymentBalanceItem(item) &&
  !isBookingPaymentSettled(item) &&
  !isBalancePaymentProcessing(item);

const shouldShowPaidBalanceBadge = (item: any) =>
  item?.payment_type === "downpayment" && isBookingPaymentSettled(item);

const getBookingRefundAmount = (item: any) =>
  toPaymentAmount(item?.refund_amount);

const isRefundedStudioBooking = (item: any) =>
  item?.type_id === "studio_booking" &&
  String(item?.raw_status || "").toLowerCase() === "cancelled" &&
  (
    getBookingPaymentStatus(item) === "refunded" ||
    getBookingRefundAmount(item) > 0
  );

const getStudioBookingStatusLabel = (item: any) =>
  isRefundedStudioBooking(item) ? "Refunded" : item?.status;

const getPendingStudioBatchKey = (item: any) => {
  if (item?.type_id !== "studio_booking") return null;
  if (item?.raw_status === "pending_relocation" || item?.status === "Relocation Request") return null;
  if (!item?.studio_id || !item?.user_id || !item?.raw_date) return null;

  const createdAt = Date.parse(String(item?.created_at || ""));
  if (Number.isNaN(createdAt)) {
    return item?.checkout_session_id
      ? `checkout:${item.checkout_session_id}`
      : `studio:${item.user_id}:${item.studio_id}:${item.raw_date}:no-created`;
  }

  const createdBucket = Math.floor(createdAt / (2 * 60 * 1000));
  return `studio:${item.user_id}:${item.studio_id}:${item.raw_date}:${createdBucket}`;
};

const mergePendingStudioBookingBatch = (items: any[]) => {
  const sorted = [...items].sort((a, b) =>
    String(a?.start_time || "").localeCompare(String(b?.start_time || "")),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const bookingIds = sorted.map((item) => item?.id).filter(Boolean);
  const totalCost = sorted.reduce(
    (sum, item) => sum + toPaymentAmount(item?.total_cost ?? item?.payment_amount),
    0,
  );
  const dueAmount = sorted.reduce((sum, item) => sum + getPaymentItemDueAmount(item), 0);
  const paidAmount = Math.max(0, totalCost - dueAmount);
  const hasBalanceDue = sorted.some(
    (item) => {
      const status = getBookingPaymentStatus(item);
      return (
        status !== "paid" &&
        (
          toPaymentAmount(item?.remaining_balance) > 0 ||
          status === "partial"
        )
      );
    },
  );

  return {
    ...first,
    id: first?.id,
    booking_ids: bookingIds,
    batch_items: sorted,
    batch_count: sorted.length,
    batch_total_cost: totalCost,
    checkout_session_id: first?.checkout_session_id || sorted.find((item) => item?.checkout_session_id)?.checkout_session_id,
    start_time: first?.start_time,
    end_time: last?.end_time || first?.end_time,
    duration_hours: sorted.reduce((sum, item) => sum + toPaymentAmount(item?.duration_hours), 0) || first?.duration_hours,
    total_cost: totalCost || first?.total_cost,
    payment_amount: hasBalanceDue ? paidAmount : totalCost || first?.payment_amount,
    remaining_balance: dueAmount,
    payment_status: hasBalanceDue ? "partial" : first?.payment_status,
    payment_type: hasBalanceDue ? "downpayment" : first?.payment_type,
    status: hasBalanceDue ? "Balance Due" : first?.status,
    date:
      sorted.length > 1 && first?.raw_date
        ? `${first.raw_date}  |  ${first?.start_time || "TBA"} - ${last?.end_time || "TBA"}`
        : first?.date,
  };
};

const groupPendingStudioBookingItems = (items: any[]) => {
  const grouped = new Map<string, any[]>();
  const passthrough: any[] = [];

  items.forEach((item) => {
    const key = getPendingStudioBatchKey(item);
    if (!key) {
      passthrough.push(item);
      return;
    }

    const existing = grouped.get(key) || [];
    existing.push(item);
    grouped.set(key, existing);
  });

  grouped.forEach((batchItems) => {
    passthrough.push(
      batchItems.length > 1 ? mergePendingStudioBookingBatch(batchItems) : batchItems[0],
    );
  });

  return passthrough;
};

const isProductionTeamInviteRequest = (item: any) =>
  item?.type_id === "booking_request" &&
  item?.sender_entity_type === "production_team" &&
  item?.request_kind === "invite" &&
  Boolean(item?.production_team_id);

const isGroupMemberApplicationRequest = (item: any) =>
  item?.type_id === "booking_request" &&
  item?.request_kind === "application" &&
  item?.application_scope === "group_member" &&
  item?.receiver_entity_type === "group";

const getConnectionEventValue = (eventDetails: any, key: string) =>
  toNonEmptyString(eventDetails?.[key]) ||
  toNonEmptyString(eventDetails?.request_details?.[key]);

const isGroupMemberInviteEvent = (eventDetails: any, requestKind?: unknown) =>
  String(eventDetails?.sender_entity_type || "").trim().toLowerCase() === "group" &&
  String(eventDetails?.receiver_entity_type || "").trim().toLowerCase() === "musician" &&
  String(
    requestKind ||
      getConnectionEventValue(eventDetails, "request_kind") ||
      "",
  ).trim().toLowerCase() === "invite" &&
  String(getConnectionEventValue(eventDetails, "application_scope") || "")
    .trim()
    .toLowerCase() === "group_member";

const isGroupMemberInviteRequest = (item: any) =>
  item?.type_id === "booking_request" &&
  isGroupMemberInviteEvent(item, item?.request_kind) &&
  Boolean(item?.group_id);

type Tab =
  | "Applicants"
  | "Active Musicians"
  | "Pending"
  | "Upcoming"
  | "Ongoing"
  | "Review"
  | "History";

// Application-specific tabs for musician's gig application flow
type ApplicationTab = "Applied" | "Accepted" | "Completed";

// View mode for musicians to switch between bookings and applications
type ViewMode = "bookings" | "applications";

type BookingsTabData = {
  Applicants: any[];
  ActiveMusicians: any[];
  Pending: any[];
  Upcoming: any[];
  Ongoing: any[];
  Review: any[];
  History: any[];
};

type ApplicationTabData = {
  Applied: any[];
  Accepted: any[];
  Completed: any[];
};

type BookingsScreenCachePayload = {
  data: BookingsTabData;
  applicationData: ApplicationTabData;
  pendingPermitStudios: any[];
  userRole: string;
  fetchedAt: number;
};

const BOOKINGS_FOCUS_REFRESH_COOLDOWN_MS = 30000;
const BOOKINGS_BACKGROUND_REFRESH_INTERVAL_MS = 60000;
const BOOKINGS_DYNAMIC_CLOCK_INTERVAL_MS = 30000;
const bookingsScreenCache = new Map<string, BookingsScreenCachePayload>();

const createEmptyBookingsData = (): BookingsTabData => ({
  Applicants: [],
  ActiveMusicians: [],
  Pending: [],
  Upcoming: [],
  Ongoing: [],
  Review: [],
  History: [],
});

const createEmptyApplicationData = (): ApplicationTabData => ({
  Applied: [],
  Accepted: [],
  Completed: [],
});

type DynamicBookingTab = "Pending" | "Upcoming" | "Ongoing" | "Review";

const DYNAMIC_BOOKING_TABS: DynamicBookingTab[] = ["Pending", "Upcoming", "Ongoing", "Review"];

const normalizeActivityStatus = (value: unknown) =>
  String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");

const parseActivityDateTime = (dateValue: unknown, timeValue?: unknown) => {
  const dateText = String(dateValue || "").trim();
  if (!dateText || dateText.toLowerCase() === "tba") return null;

  const timeText = String(timeValue || "").trim();
  const candidate = timeText
    ? `${dateText.split("T")[0]}T${timeText}`
    : dateText.includes("T")
      ? dateText
      : `${dateText}T00:00:00`;
  const parsed = new Date(candidate);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getActivityDayWindow = (dateValue: unknown) => {
  const start = parseActivityDateTime(dateValue);
  if (!start) return null;

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getStudioBookingWindow = (item: any) => {
  if (!item?.raw_date || !item?.start_time) return null;

  const start = parseActivityDateTime(item.raw_date, item.start_time);
  const end = parseActivityDateTime(item.raw_date, item.end_time || item.start_time);
  if (!start || !end) return null;

  if (end.getTime() < start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
};

const getDynamicActivityTarget = (item: any, now: Date): { tab: DynamicBookingTab; status?: string } | null => {
  if (!item || item.isCancelled) return null;

  if (item.type_id === "studio_booking") {
    const rawStatus = normalizeActivityStatus(item.raw_status || item.status);
    const displayStatus = normalizeActivityStatus(item.status);
    const hasBalanceDue =
      displayStatus === "balance-due" ||
      (rawStatus === "confirmed" &&
        normalizeActivityStatus(item.payment_status) === "partial" &&
        Number(item.remaining_balance || 0) > 0);

    if (hasBalanceDue || !["confirmed", "checked-in"].includes(rawStatus)) {
      return null;
    }

    const window = getStudioBookingWindow(item);
    if (!window) return null;

    if (now.getTime() > window.end.getTime()) {
      return { tab: "Review", status: "Completed" };
    }

    if (now.getTime() >= window.start.getTime()) {
      return { tab: "Ongoing", status: "In Progress" };
    }

    return { tab: "Upcoming", status: displayStatus === "in-progress" ? "Confirmed" : item.status };
  }

  if (item.type_id === "gig_application") {
    const rawStatus = normalizeActivityStatus(item.raw_status || item.status);
    const displayStatus = normalizeActivityStatus(item.status);
    const isAccepted =
      ["accepted", "approved", "confirmed"].includes(rawStatus) ||
      ["confirmed", "happening-now"].includes(displayStatus);

    if (!isAccepted) return null;

    const window = getActivityDayWindow(item.raw_date || item.start_time || item.date);
    if (!window) return null;

    if (now.getTime() > window.end.getTime()) {
      return { tab: "Review", status: "Completed" };
    }

    if (now.getTime() >= window.start.getTime()) {
      return { tab: "Ongoing", status: "Happening Now" };
    }

    return { tab: "Upcoming", status: displayStatus === "happening-now" ? "Confirmed" : item.status };
  }

  return null;
};

const isDynamicActivityCandidate = (item: any) => {
  if (!item || item.isCancelled) return false;

  if (item.type_id === "studio_booking") {
    const rawStatus = normalizeActivityStatus(item.raw_status || item.status);
    const displayStatus = normalizeActivityStatus(item.status);
    const hasBalanceDue =
      displayStatus === "balance-due" ||
      (rawStatus === "confirmed" &&
        normalizeActivityStatus(item.payment_status) === "partial" &&
        Number(item.remaining_balance || 0) > 0);

    return !hasBalanceDue && ["confirmed", "checked-in"].includes(rawStatus);
  }

  if (item.type_id === "gig_application") {
    const rawStatus = normalizeActivityStatus(item.raw_status || item.status);
    const displayStatus = normalizeActivityStatus(item.status);

    return (
      ["accepted", "approved", "confirmed"].includes(rawStatus) ||
      ["confirmed", "happening-now"].includes(displayStatus)
    );
  }

  return false;
};

const hasDynamicActivityCandidates = (source: BookingsTabData) =>
  DYNAMIC_BOOKING_TABS.some((tab) =>
    (source[tab] || []).some(isDynamicActivityCandidate),
  );

const dedupeActivityTabItems = (items: any[]) => {
  const seen = new Set<string>();
  return items.filter((item: any) => {
    const key = `${item?.type_id || "activity"}:${item?.id || ""}`;
    if (!item?.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildDynamicBookingsData = (source: BookingsTabData, now: Date): BookingsTabData => {
  if (!hasDynamicActivityCandidates(source)) {
    return source;
  }

  const next: BookingsTabData = {
    Applicants: source.Applicants,
    ActiveMusicians: source.ActiveMusicians,
    Pending: [],
    Upcoming: [],
    Ongoing: [],
    Review: [],
    History: source.History,
  };

  DYNAMIC_BOOKING_TABS.forEach((sourceTab) => {
    (source[sourceTab] || []).forEach((item: any) => {
      const target = getDynamicActivityTarget(item, now);
      const targetTab = target?.tab || sourceTab;
      next[targetTab].push(target?.status ? { ...item, status: target.status } : item);
    });
  });

  DYNAMIC_BOOKING_TABS.forEach((tab) => {
    next[tab] = dedupeActivityTabItems(next[tab]);
  });

  return next;
};

const getBookingsSummarySignature = (payload: any) => {
  if (!payload) return "";

  const source = payload?.categorized || payload;
  const counts = ["Pending", "Upcoming", "Ongoing", "Review"]
    .map((key) => (Array.isArray(source?.[key]) ? source[key].length : 0))
    .join("|");

  return [
    payload?.fetchedAt || "",
    payload?.role || "",
    counts,
    Array.isArray(payload?.pendingPermitListings) ? payload.pendingPermitListings.length : 0,
    Array.isArray(payload?.connectionRequests) ? payload.connectionRequests.length : 0,
    Array.isArray(payload?.lateAttendanceEvents) ? payload.lateAttendanceEvents.length : 0,
  ].join(":");
};

const mergeUniqueActivityItems = (...groups: any[][]) => {
  const seen = new Set<string>();
  const merged: any[] = [];

  groups.flat().forEach((item: any) => {
    const key = `${item?.type_id || "activity"}:${item?.id || ""}`;
    if (!item?.id || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
};

const attachManagerPendingRecommendations = async (bookings: any) => {
  const pendingApplications = (bookings?.Pending || []).filter(
    (item: any) => item?.type_id === "gig_application" && item?.gig_id,
  );
  const gigIds = Array.from(
    new Set(pendingApplications.map((item: any) => item.gig_id).filter(Boolean)),
  );

  if (gigIds.length === 0) return bookings;

  const { data, error } = await supabase.functions.invoke(
    "gig-applications",
    {
      body: {
        action: "fetch_manager_pending_recommendations",
        gigIds,
      },
    },
  );

  if (error) {
    return {
      ...bookings,
      Pending: (bookings?.Pending || []).map((item: any) =>
        item?.type_id === "gig_application"
          ? { ...item, ai_recommendation_error: true }
          : item,
      ),
    };
  }

  const rankedByApplicationId = new Map(
    (Array.isArray(data) ? data : [])
      .filter((application: any) => application?.id)
      .map((application: any) => [application.id, application]),
  );

  return {
    ...bookings,
    Pending: (bookings?.Pending || []).map((item: any) => {
      if (item?.type_id !== "gig_application") return item;
      const rankedApplication: any = rankedByApplicationId.get(item.id);
      if (!rankedApplication) return item;
      const performerProfile =
        rankedApplication?.production_roster?.roster_profile ||
        rankedApplication?.applicant ||
        null;
      const isVerified =
        rankedApplication?.ai_recommendation?.is_verified === true ||
        (performerProfile?.is_verified === true &&
          String(performerProfile?.verification_status || "").toUpperCase() === "APPROVED");

      return {
        ...item,
        ai_recommendation: rankedApplication.ai_recommendation || null,
        applicant_is_verified: isVerified,
        ai_recommendation_loaded: true,
        ai_recommendation_error: false,
      };
    }),
  };
};

const ManagerRecommendationSummary = React.memo(function ManagerRecommendationSummary({
  item,
  colors,
  isDark,
}: {
  item: any;
  colors: any;
  isDark: boolean;
}) {
  const recommendation = item?.ai_recommendation;

  if (!recommendation) {
    if (item?.ai_recommendation_error === true) {
      return (
        <View
          testID={`mobile-bookings-ai-recommendation-error-${item.id}`}
          style={{
            marginBottom: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 10,
            backgroundColor: isDark ? "rgba(245,158,11,0.08)" : "#FFFBEB",
          }}
        >
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium", fontSize: 11 }}>
            AI recommendation is temporarily unavailable. Open Review Applicant to refresh it.
          </Text>
        </View>
      );
    }

    if (item?.ai_recommendation_loaded === true) {
      return (
        <View
          testID={`mobile-bookings-ai-recommendation-disabled-${item.id}`}
          style={{
            marginBottom: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 10,
            backgroundColor: colors.card,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium", fontSize: 11 }}>
            AI recommendations are not enabled for this gig. Open Review Applicant to configure them.
          </Text>
        </View>
      );
    }

    if (item?.applicant_is_verified === true) {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Ionicons name="shield-checkmark" size={16} color="#10B981" />
          <Text style={{ color: "#10B981", fontFamily: "Poppins_600SemiBold", fontSize: 11 }}>
            Verified applicant
          </Text>
        </View>
      );
    }

    return null;
  }

  const isRecommended = recommendation.recommendation_status === "recommended";
  const matched = Array.isArray(recommendation.matched_criteria)
    ? recommendation.matched_criteria.slice(0, 3).join(", ")
    : "";
  const missing = Array.isArray(recommendation.missing_criteria)
    ? recommendation.missing_criteria.slice(0, 3).join(", ")
    : "";

  return (
    <View
      testID={`mobile-bookings-ai-recommendation-${item.id}`}
      style={{
        marginBottom: 10,
        borderWidth: 1,
        borderColor: isRecommended ? "#10B981" : colors.border,
        borderRadius: 12,
        padding: 11,
        gap: 6,
        backgroundColor: isRecommended
          ? isDark
            ? "rgba(16,185,129,0.10)"
            : "#F0FDF4"
          : colors.card,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <Ionicons name="sparkles" size={16} color={isRecommended ? "#10B981" : colors.primary} />
          <Text style={{ color: isRecommended ? "#10B981" : colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
            {isRecommended ? "AI recommended" : "AI fit review"}
          </Text>
          {recommendation.is_verified === true ? (
            <Ionicons name="shield-checkmark" size={15} color="#10B981" />
          ) : null}
        </View>
        <Text style={{ color: isRecommended ? "#10B981" : colors.primary, fontFamily: "Poppins_700Bold", fontSize: 14 }}>
          {Math.round(Number(recommendation.score) || 0)}%
        </Text>
      </View>
      {recommendation.explanation ? (
        <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 16 }}>
          {recommendation.explanation}
        </Text>
      ) : null}
      {matched ? (
        <Text style={{ color: "#10B981", fontFamily: "Poppins_500Medium", fontSize: 10 }} numberOfLines={2}>
          Matched: {matched}
        </Text>
      ) : null}
      {missing ? (
        <Text style={{ color: "#F59E0B", fontFamily: "Poppins_500Medium", fontSize: 10 }} numberOfLines={2}>
          Review: {missing}
        </Text>
      ) : null}
    </View>
  );
});

const normalizeActivityRole = (role: unknown) =>
  String(role || "").trim().toLowerCase().replace(/[_\s]+/g, "-");

const isProducerActivityRole = (role: unknown) => {
  const normalizedRole = normalizeActivityRole(role);
  return (
    normalizedRole === "producer" ||
    normalizedRole === "production" ||
    normalizedRole === "production-user"
  );
};

const getGigApplicationStatusLabel = (
  status: unknown,
  fallback: unknown = status,
) => {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === "pending") return "Applied";
  if (normalizedStatus === "accepted" || normalizedStatus === "approved") return "Accepted";
  if (normalizedStatus === "completed") return "Completed";
  if (normalizedStatus === "rejected") return "Declined";
  if (normalizedStatus === "cancelled") return "Cancelled";
  if (normalizedStatus === "resigned") return "Withdrawn";
  if (normalizedStatus === "fired") return "Fired";

  return fallback || status;
};

const normalizeGigApplicationStatusValue = (status: unknown) =>
  String(status || "").trim().toLowerCase();

const isAcceptedGigApplicationItem = (item: any) =>
  item?.type_id === "gig_application" &&
  ["accepted", "approved"].includes(
    normalizeGigApplicationStatusValue(item?.raw_status || item?.status),
  );

const isGigReconfirmationItem = (item: any) =>
  item?.type_id === "gig_application" &&
  normalizeGigApplicationStatusValue(item?.raw_status || item?.status) === "pending" &&
  (
    item?.requires_reconfirmation === true ||
    item?.system_status_reason === "system_reconfirm_required_terms_changed" ||
    Boolean(item?.reconfirmation_due_at)
  );

const isUpcomingAcceptedGigApplicationItem = (item: any) => {
  if (!isAcceptedGigApplicationItem(item)) return false;
  const eventStart = new Date(String(item?.raw_date || item?.date || ""));
  if (Number.isNaN(eventStart.getTime())) return false;
  eventStart.setHours(0, 0, 0, 0);
  return new Date() < eventStart;
};

const getGigApplicationCancelStatusForViewer = (item: any, role: unknown) => {
  if (item?.type_id !== "gig_application") return "cancelled";
  if (normalizeActivityRole(role) !== "musician") return "cancelled";
  return isUpcomingAcceptedGigApplicationItem(item) ? "cancelled" : "resigned";
};

const getActivityItemFilterLabel = (item: any) => {
  if (item?.type_id === "booking_request") return "Requests";
  if (item?.type_id === "gig_application") return "Applications";
  if (item?.type_id === "studio_booking") return "Bookings";
  return "Other";
};

const buildActivityItemSearchText = (item: any) =>
  [
    item?.name,
    item?.counterparty_name,
    item?.display_name,
    item?.title,
    item?.gig_title,
    item?.studio_name,
    item?.venue_name,
    item?.type,
    item?.status,
    item?.display_status,
    item?.message,
    item?.request_application_context,
    item?.request_context_title,
    item?.request_kind,
    item?.sender_entity_name,
    item?.sender_entity_type,
    item?.receiver_entity_name,
    item?.receiver_entity_type,
    item?.listing_type,
    item?.request_slot_type,
    item?.request_roster_entry_name,
    item?.raw_date,
    item?.date,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const normalizeBookingTestId = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";

const bookingActionTestId = (item: any, action: string) =>
  `mobile-bookings-${normalizeBookingTestId(item?.type_id || "item")}-${action}-${item?.id}`;

type BookingActionLoadingState = {
  itemId: string;
  message: string;
} | null;

type RelocationSlotOption = {
  date: string;
  start_time: string;
  end_time: string;
};

const getStatusActionLoadingMessage = (status: string, typeId: string = "studio_booking") => {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedType = String(typeId || "").trim().toLowerCase();

  if (normalizedStatus === "confirmed") return "Confirming booking";
  if (normalizedStatus === "accepted" || normalizedStatus === "approved") {
    return normalizedType === "gig_application" ? "Accepting application" : "Accepting request";
  }
  if (normalizedStatus === "rejected") return "Declining application";
  if (normalizedStatus === "resigned") return "Withdrawing application";
  if (normalizedStatus === "fired") return "Terminating agreement";
  if (normalizedStatus === "completed") return "Completing contract";
  if (normalizedStatus === "late") return "Sending late report";
  if (normalizedStatus === "cancelled") {
    return normalizedType === "gig_application" ? "Withdrawing from gig" : "Cancelling booking";
  }

  return "Updating booking";
};

type ConnectionRequestMediaMaps = {
  gigImages: Map<string, string>;
  groupImages: Map<string, string>;
  productionTeamLogos: Map<string, string>;
};

const createEmptyConnectionRequestMediaMaps = (): ConnectionRequestMediaMaps => ({
  gigImages: new Map<string, string>(),
  groupImages: new Map<string, string>(),
  productionTeamLogos: new Map<string, string>(),
});

const getEventObject = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const getEventString = (eventDetails: Record<string, any>, key: string) =>
  toNonEmptyString(eventDetails?.[key]) ||
  toNonEmptyString(getEventObject(eventDetails?.request_details)?.[key]);

const normalizeConnectionEntityType = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const firstResolvedImageUrl = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const resolved = resolveSupabaseMediaUrl(candidate);
    if (resolved) return resolved;
  }

  return null;
};

const getConnectionRequestProductionTeamId = (eventDetails: Record<string, any>) => {
  const senderType = normalizeConnectionEntityType(eventDetails.sender_entity_type);
  const receiverType = normalizeConnectionEntityType(eventDetails.receiver_entity_type);

  return (
    getEventString(eventDetails, "production_team_id") ||
    (senderType === "production_team" ? getEventString(eventDetails, "sender_entity_id") : null) ||
    (receiverType === "production_team" ? getEventString(eventDetails, "receiver_entity_id") : null)
  );
};

const getConnectionRequestGigId = (eventDetails: Record<string, any>) => {
  const senderType = normalizeConnectionEntityType(eventDetails.sender_entity_type);
  const listingType = normalizeConnectionEntityType(getEventString(eventDetails, "listing_type"));

  return (
    getEventString(eventDetails, "gig_id") ||
    (listingType === "gig" ? getEventString(eventDetails, "listing_id") : null) ||
    (senderType === "venue" ? getEventString(eventDetails, "sender_entity_id") : null)
  );
};

const collectConnectionRequestMediaIds = (requestRows: any[]) => {
  const gigIds = new Set<string>();
  const groupIds = new Set<string>();
  const productionTeamIds = new Set<string>();

  requestRows.forEach((request) => {
    const eventDetails = getEventObject(request?.event_details);
    const senderType = normalizeConnectionEntityType(eventDetails.sender_entity_type);
    const receiverType = normalizeConnectionEntityType(eventDetails.receiver_entity_type);
    const productionTeamId = getConnectionRequestProductionTeamId(eventDetails);
    const gigId = getConnectionRequestGigId(eventDetails);
    const senderEntityId = getEventString(eventDetails, "sender_entity_id");
    const receiverEntityId = getEventString(eventDetails, "receiver_entity_id");

    if (productionTeamId) productionTeamIds.add(productionTeamId);
    if (gigId) gigIds.add(gigId);
    if (request?.group_id) groupIds.add(String(request.group_id));
    if (senderType === "group" && senderEntityId) groupIds.add(senderEntityId);
    if (receiverType === "group" && receiverEntityId) groupIds.add(receiverEntityId);
  });

  return {
    gigIds: Array.from(gigIds),
    groupIds: Array.from(groupIds),
    productionTeamIds: Array.from(productionTeamIds),
  };
};

const setFirstMediaByOwner = (
  target: Map<string, string>,
  rows: any[] | null | undefined,
  ownerKey: string,
) => {
  (rows || [])
    .slice()
    .sort((a: any, b: any) => (a?.sort_order || 0) - (b?.sort_order || 0))
    .forEach((row: any) => {
      const ownerId = toNonEmptyString(row?.[ownerKey]);
      const mediaUrl = resolveSupabaseMediaUrl(row?.media_url);
      if (ownerId && mediaUrl && !target.has(ownerId)) {
        target.set(ownerId, mediaUrl);
      }
    });
};

const loadConnectionRequestMediaMaps = async (
  requestRows: any[],
): Promise<ConnectionRequestMediaMaps> => {
  const mediaMaps = createEmptyConnectionRequestMediaMaps();
  const { gigIds, groupIds, productionTeamIds } =
    collectConnectionRequestMediaIds(requestRows);

  const [teamResult, gigMediaResult, groupMediaResult] = await Promise.all([
    productionTeamIds.length > 0
      ? supabase
          .from("production_teams")
          .select("id, logo_url")
          .in("id", productionTeamIds)
      : Promise.resolve({ data: [], error: null } as any),
    gigIds.length > 0
      ? supabase
          .from("gig_media")
          .select("gig_id, media_url, sort_order")
          .in("gig_id", gigIds)
          .eq("media_type", "image")
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    groupIds.length > 0
      ? supabase
          .from("group_media")
          .select("group_id, media_url, sort_order")
          .in("group_id", groupIds)
          .eq("media_type", "image")
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (teamResult.error) {
    debugLog("Error fetching connection request production team images:", teamResult.error);
  } else {
    (teamResult.data || []).forEach((team: any) => {
      const teamId = toNonEmptyString(team?.id);
      const logoUrl = resolveSupabaseMediaUrl(team?.logo_url);
      if (teamId && logoUrl) {
        mediaMaps.productionTeamLogos.set(teamId, logoUrl);
      }
    });
  }

  if (gigMediaResult.error) {
    debugLog("Error fetching connection request gig images:", gigMediaResult.error);
  } else {
    setFirstMediaByOwner(mediaMaps.gigImages, gigMediaResult.data, "gig_id");
  }

  if (groupMediaResult.error) {
    debugLog("Error fetching connection request group images:", groupMediaResult.error);
  } else {
    setFirstMediaByOwner(mediaMaps.groupImages, groupMediaResult.data, "group_id");
  }

  return mediaMaps;
};

const getConnectionRequestCardImage = (
  request: any,
  eventDetails: Record<string, any>,
  counterpartyProfile: any,
  mediaMaps: ConnectionRequestMediaMaps,
) => {
  const senderType = normalizeConnectionEntityType(eventDetails.sender_entity_type);
  const receiverType = normalizeConnectionEntityType(eventDetails.receiver_entity_type);
  const senderEntityId = getEventString(eventDetails, "sender_entity_id");
  const receiverEntityId = getEventString(eventDetails, "receiver_entity_id");
  const gigId = getConnectionRequestGigId(eventDetails);
  const productionTeamId = getConnectionRequestProductionTeamId(eventDetails);
  const groupId =
    toNonEmptyString(request?.group_id) ||
    (senderType === "group" ? senderEntityId : null) ||
    (receiverType === "group" ? receiverEntityId : null);
  const gigImage = gigId ? mediaMaps.gigImages.get(gigId) : null;
  const productionLogo = productionTeamId
    ? mediaMaps.productionTeamLogos.get(productionTeamId)
    : null;
  const groupImage = groupId ? mediaMaps.groupImages.get(groupId) : null;

  if (senderType === "venue" || gigId) {
    return firstResolvedImageUrl(
      getEventString(eventDetails, "gig_image_url"),
      getEventString(eventDetails, "listing_image_url"),
      gigImage,
      getEventString(eventDetails, "team_logo_url"),
      productionLogo,
      groupImage,
      counterpartyProfile?.avatar_url,
      REQUEST_PLACEHOLDER_IMAGE,
    );
  }

  if (senderType === "production_team" || receiverType === "production_team") {
    return firstResolvedImageUrl(
      getEventString(eventDetails, "team_logo_url"),
      getEventString(eventDetails, "production_team_logo_url"),
      productionLogo,
      getEventString(eventDetails, "listing_image_url"),
      gigImage,
      groupImage,
      counterpartyProfile?.avatar_url,
      REQUEST_PLACEHOLDER_IMAGE,
    );
  }

  return firstResolvedImageUrl(
    getEventString(eventDetails, "image_url"),
    getEventString(eventDetails, "listing_image_url"),
    groupImage,
    gigImage,
    productionLogo,
    counterpartyProfile?.avatar_url,
    REQUEST_PLACEHOLDER_IMAGE,
  );
};

export default function BookingsScreen() {
  const { colors, isDark } = useTheme();
  const { session, loading: authLoading, userId, isGuest } = useAuth();
  const { isBottomOverlayActive } = useBottomOverlay();
  const queryClient = useQueryClient();
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
  const [modalMode, setModalMode] = useState<
    "confirm" | "cancel" | "decline" | "fire" | "complete" | "clear_balance" | "late" | "late_confirm"
  >("confirm");

  const handleBookingTabChange = useCallback((tab: Tab) => {
    React.startTransition(() => {
      setSmoothTab(setActiveTab, tab);
    });
  }, []);

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
  const initialBookingsCacheRef = useRef<BookingsScreenCachePayload | null>(
    userId ? bookingsScreenCache.get(userId) || null : null,
  );

  // State for fetched data
  const [data, setData] = useState<BookingsTabData>(
    () => initialBookingsCacheRef.current?.data || createEmptyBookingsData(),
  );
  const [pendingPermitStudios, setPendingPermitStudios] = useState<any[]>(
    () => initialBookingsCacheRef.current?.pendingPermitStudios || [],
  );
  const [permitDeleting, setPermitDeleting] = useState<string | null>(null);

  // Application data separated by status for musicians
  const [applicationData, setApplicationData] = useState<ApplicationTabData>(
    () => initialBookingsCacheRef.current?.applicationData || createEmptyApplicationData(),
  );

  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>(
    () => initialBookingsCacheRef.current?.userRole || "",
  );
  const [staffBookingContext, setStaffBookingContext] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [locallyReportedLateBookings, setLocallyReportedLateBookings] = useState<Record<string, boolean>>({});
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<BookingActionLoadingState>(null);
  const [preferredRelocationSlots, setPreferredRelocationSlots] = useState<Record<string, RelocationSlotOption>>({});
  const [relocationSlotPickerVisible, setRelocationSlotPickerVisible] = useState(false);
  const [relocationSlotPickerItem, setRelocationSlotPickerItem] = useState<any>(null);
  const [relocationSlotOptions, setRelocationSlotOptions] = useState<RelocationSlotOption[]>([]);
  const [relocationSlotLoading, setRelocationSlotLoading] = useState(false);
  const [relocationSlotError, setRelocationSlotError] = useState<string | null>(null);
  const [relocationSlotCalendarDate, setRelocationSlotCalendarDate] = useState("");
  useBottomOverlayVisibility(
    showPaymentOptionModal || showScanModal || relocationSlotPickerVisible,
    "BookingsPaymentOrScanModal",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [showActivityFilters, setShowActivityFilters] = useState(false);
  const deferredActiveTab = React.useDeferredValue(activeTab);
  const deferredActiveAppTab = React.useDeferredValue(activeAppTab);
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const deferredActiveFilter = React.useDeferredValue(activeFilter);
  const renderActiveTab = deferredActiveTab;
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
  const [mediaViewerUrl, setMediaViewerUrl] = useState<string | null>(null);
  const [mediaViewerTitle, setMediaViewerTitle] = useState("Media");
  const bookingsSummaryQuery = useBookingsSummaryQuery(userId, {
    enabled: isAuthenticated && Boolean(userId),
  });
  const dynamicBookingsData = React.useMemo(
    () => buildDynamicBookingsData(data, currentTime),
    [currentTime, data],
  );
  const shouldRunDynamicBookingsClock = React.useMemo(
    () => hasDynamicActivityCandidates(data),
    [data],
  );
  const startActionLoading = useCallback((itemId: unknown, message: string) => {
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) return;
    setActionLoading({ itemId: normalizedItemId, message });
  }, []);
  const clearActionLoading = useCallback((itemId?: unknown) => {
    const normalizedItemId = itemId === undefined || itemId === null ? "" : String(itemId).trim();
    setActionLoading((current) => {
      if (!current) return null;
      if (normalizedItemId && current.itemId !== normalizedItemId) return current;
      return null;
    });
  }, []);
  const isActionLoadingFor = useCallback(
    (itemOrId: any) => {
      const itemId = typeof itemOrId === "object" ? itemOrId?.id : itemOrId;
      return Boolean(actionLoading?.itemId && String(itemId || "") === actionLoading.itemId);
    },
    [actionLoading],
  );
  const bookingsQueryStateRef = useRef({
    isFetching: bookingsSummaryQuery.isFetching,
    isLoading: bookingsSummaryQuery.isLoading,
  });
  const lastProcessedBookingsSummaryRef = useRef<string | null>(null);
  const bookingsRefetchInFlightRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    bookingsQueryStateRef.current = {
      isFetching: bookingsSummaryQuery.isFetching,
      isLoading: bookingsSummaryQuery.isLoading,
    };
  }, [bookingsSummaryQuery.isFetching, bookingsSummaryQuery.isLoading]);

  const refetchBookingsSummary = useCallback((options: { force?: boolean } = {}) => {
    const queryState = bookingsQueryStateRef.current;

    if (!options.force && (queryState.isFetching || queryState.isLoading)) {
      return Promise.resolve(null);
    }

    if (bookingsRefetchInFlightRef.current) {
      return bookingsRefetchInFlightRef.current;
    }

    const task = bookingsSummaryQuery.refetch().finally(() => {
      bookingsRefetchInFlightRef.current = null;
    });
    bookingsRefetchInFlightRef.current = task;
    return task;
  }, [bookingsSummaryQuery.refetch]);

  usePageLoadLogger({
    counts: {
      activeMusicians: dynamicBookingsData.ActiveMusicians.length,
      applicants: dynamicBookingsData.Applicants.length,
      history: dynamicBookingsData.History.length,
      ongoing: dynamicBookingsData.Ongoing.length,
      pending: dynamicBookingsData.Pending.length,
      pendingPermits: pendingPermitStudios.length,
      review: dynamicBookingsData.Review.length,
      upcoming: dynamicBookingsData.Upcoming.length,
    },
    details: {
      activeTab,
      role: userRole || "unknown",
      viewMode,
    },
    loading: loading || authLoading || bookingsSummaryQuery.isLoading,
    page: "Bookings",
    queries: { bookingsSummary: bookingsSummaryQuery },
    ready: !authLoading && !loading,
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

  const isSimpleTopToastButtons = (buttons?: any[]) => {
    if (!buttons || buttons.length === 0) return true;
    if (buttons.length !== 1) return false;

    const onlyButton = buttons[0];
    const normalizedText = String(onlyButton?.text ?? "OK").trim().toLowerCase();
    const hasNoCallback = !onlyButton?.onPress;
    const isNeutralStyle =
      !onlyButton?.style || onlyButton.style === "default" || onlyButton.style === "cancel";

    return (
      hasNoCallback &&
      isNeutralStyle &&
      (normalizedText === "ok" || normalizedText === "close" || normalizedText === "got it")
    );
  };

  const resolveAlertType = (title: string): AlertType => {
    const lowerTitle = title.toLowerCase();
    if (
      lowerTitle.includes("error") ||
      lowerTitle.includes("failed") ||
      lowerTitle.includes("invalid") ||
      lowerTitle.includes("required")
    ) {
      return "error";
    }
    if (lowerTitle.includes("success")) {
      return "success";
    }
    if (lowerTitle.includes("warning") || lowerTitle.includes("info")) {
      return "warning";
    }
    return "info";
  };

  const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
    const normalizedTitle = title || "Notice";
    const normalizedMessage = message || "";
    const type = resolveAlertType(normalizedTitle);

    if ((type === "success" || type === "info") && isSimpleTopToastButtons(buttons)) {
      emitToast({
        type,
        title: normalizedTitle,
        message: normalizedMessage.trim() ? normalizedMessage : normalizedTitle,
      });
      return;
    }

    showAlert(type, normalizedTitle, normalizedMessage, buttons);
  };

  const Alert = { alert: showAlertNative };

  useEffect(() => {
    setLocallyReportedLateBookings({});
    lastProcessedBookingsSummaryRef.current = null;
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated || !userId || !bookingsSummaryQuery.data) return;
    const summarySignature = getBookingsSummarySignature(bookingsSummaryQuery.data);

    if (summarySignature && lastProcessedBookingsSummaryRef.current === summarySignature) {
      return;
    }

    lastProcessedBookingsSummaryRef.current = summarySignature;

    void fetchBookings(userId, {
      showLoading: false,
      summaryPayload: bookingsSummaryQuery.data,
    });
  }, [bookingsSummaryQuery.data, isAuthenticated, userId]);

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
          debugLog("?? App returned to foreground");

          // If we were in payment flow, check status and refresh
          if (paymentInProgressRef.current && userId) {
            debugLog("?? Checking payment status after return...");
            const bookingId = pendingPaymentBookingId.current;
            paymentInProgressRef.current = false;
            pendingPaymentBookingId.current = null;

            // Poll for payment status with retries (webhook might be processing)
            let paymentConfirmed = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
              debugLog(`?? Payment status check attempt ${attempt}/3...`);
              await new Promise((resolve) =>
                setTimeout(resolve, 1500 * attempt),
              ); // Increasing delay

              // Check the specific booking if we have an ID
              if (bookingId) {
                const { data: booking } = await supabase
                  .from("studio_bookings")
                  .select("id, status, payment_status, payment_type, remaining_balance")
                  .eq("id", bookingId)
                  .single();

                if (booking?.payment_status === "paid" || booking?.payment_status === "partial") {
                  paymentConfirmed = true;
                  const isPartial = booking.payment_status === "partial" && (booking.remaining_balance || 0) > 0;
                  debugLog("? Payment confirmed for booking:", bookingId, isPartial ? "(partial)" : "(full)");
                  break;
                }
              } else {
                // Check if any recent booking moved to paid or partial
                const { data: recentPaid } = await supabase
                  .from("studio_bookings")
                  .select("id, status, payment_status, remaining_balance")
                  .eq("user_id", userId)
                  .in("payment_status", ["paid", "partial"])
                  .order("paid_at", { ascending: false })
                  .limit(1);

                if (recentPaid && recentPaid.length > 0) {
                  paymentConfirmed = true;
                  const isPartial = recentPaid[0].payment_status === "partial" && (recentPaid[0].remaining_balance || 0) > 0;
                  debugLog("? Found recently paid booking", isPartial ? "(partial)" : "(full)");
                  break;
                }
              }
            }

            pendingPaymentBookingId.current = null;

            // Refresh bookings
            await refetchBookingsSummary({ force: true });

            if (paymentConfirmed) {
              setActiveTab("Upcoming");
            }
          } else if (userId) {
            // Even if not in payment flow, refresh when returning to app
            void refetchBookingsSummary();
          }
        }
        appState.current = nextAppState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [refetchBookingsSummary, userId]);

  // Bookings realtime is centralized in RootLayout and invalidates this query key.

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let focusRefreshTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
      let focusRefreshFallbackTimer: ReturnType<typeof setTimeout> | null = null;

      if (isAuthenticated && userId) {
        const cached = bookingsScreenCache.get(userId);
        const cacheIsFresh =
          cached &&
          Date.now() - cached.fetchedAt < BOOKINGS_FOCUS_REFRESH_COOLDOWN_MS;

        if (cached) {
          setData(cached.data);
          setApplicationData(cached.applicationData);
          setPendingPermitStudios(cached.pendingPermitStudios);
          setUserRole(cached.userRole);
          setLoading(false);
        }

        if (!cacheIsFresh && cached) {
          let refreshStarted = false;
          const startFocusRefresh = () => {
            if (!isActive || refreshStarted) return;
            refreshStarted = true;
            void refetchBookingsSummary();
          };

          focusRefreshTask = InteractionManager.runAfterInteractions(startFocusRefresh);
          focusRefreshFallbackTimer = setTimeout(startFocusRefresh, 800);
        } else if (!cached) {
          setLoading(true);
        }

        // Auto-refresh so bookings move between tabs based on real time/date
        intervalId = setInterval(async () => {
          const latestQueryState = bookingsQueryStateRef.current;
          if (
            !isActive ||
            autoRefreshInFlightRef.current ||
            latestQueryState.isFetching ||
            latestQueryState.isLoading
          ) {
            return;
          }

          autoRefreshInFlightRef.current = true;
          try {
            await refetchBookingsSummary();
          } finally {
            autoRefreshInFlightRef.current = false;
          }
        }, BOOKINGS_BACKGROUND_REFRESH_INTERVAL_MS);
      }

      return () => {
        isActive = false;
        focusRefreshTask?.cancel();
        if (focusRefreshFallbackTimer) clearTimeout(focusRefreshFallbackTimer);
        if (intervalId) clearInterval(intervalId);
      };
    }, [isAuthenticated, refetchBookingsSummary, userId]),
  );

  async function buildLocalStudioBookingsFallback(
    targetUserId: string,
    role: string,
  ) {
    if (role !== "musician" && role !== "studio-owner") {
      return {
        Pending: [] as any[],
        Upcoming: [] as any[],
        Ongoing: [] as any[],
        Review: [] as any[],
      };
    }

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
      const bookingDateLabel = formatFriendlyDateTime(b.booking_date, {
        forceDateOnly: true,
        fallback: b.booking_date || "Date TBA",
      });
      const startTimeLabel = Number.isNaN(startDate.getTime())
        ? b.start_time
        : startDate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
      const endTimeLabel = Number.isNaN(endDate.getTime())
        ? b.end_time
        : endDate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
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
        created_at: b.created_at || null,
        checkout_session_id: b.checkout_session_id || null,
        studio_id: b.studio_id,
        user_id: b.user_id,
        raw_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        name: b.studio?.name || "Unknown Studio",
        date: `${bookingDateLabel} at ${startTimeLabel} - ${endTimeLabel}`,
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
                    ? String(b.payment_status || "").toLowerCase() === "refunded" || toPaymentAmount(b.refund_amount) > 0
                      ? "Refunded"
                      : "Declined"
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
        studio_type: b.studio?.studio_type || null,
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
        payment_amount:
          b.payment_amount ?? (b.payment_status === "paid" ? b.final_price : 0),
        payment_type: b.payment_type || null,
        remaining_balance: b.remaining_balance || 0,
        refund_amount: toPaymentAmount(b.refund_amount),
        refunded_at: b.refunded_at || null,
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
        if (now > endDate) {
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

  async function buildLocalProducerGigApplicationsFallback(targetUserId: string) {
    const fallback = {
      Pending: [] as any[],
      Upcoming: [] as any[],
      Ongoing: [] as any[],
      Review: [] as any[],
    };

    const { data: productionApps, error: productionAppsError } = await supabase
      .from("gig_applications")
      .select(
        `
          *,
          gig:gig_id(name, event_date, location, organizer:organizer_id(avatar_url), gig_media(media_url, sort_order)),
          group:group_id(name, group_type),
          production_team:production_team_id(id, name, logo_url),
          production_roster:production_roster_id(
            entity_kind,
            roster_profile:profile_id(full_name, avatar_url),
            roster_group:group_id(name, group_type)
          )
        `,
      )
      .eq("applicant_id", targetUserId)
      .not("production_team_id", "is", null)
      .order("created_at", { ascending: false });

    if (productionAppsError) {
      debugLog("Error fetching local producer gig applications:", productionAppsError);
      return fallback;
    }

    const now = new Date();

    (productionApps || []).forEach((app: any) => {
      const normalizedStatus = String(app.status || "").toLowerCase();
      const requiresReconfirmation =
        normalizedStatus === "pending" &&
        app.system_status_reason === "system_reconfirm_required_terms_changed" &&
        !!app.reconfirmation_due_at;
      const gig = app.gig;
      const dateStr = gig?.event_date || app.created_at?.split("T")[0] || "TBA";
      const performerSnapshot =
        app.performer_snapshot && typeof app.performer_snapshot === "object"
          ? app.performer_snapshot
          : {};
      const performerName =
        app.group?.name ||
        app.production_roster?.roster_profile?.full_name ||
        app.production_roster?.roster_group?.name ||
        performerSnapshot.display_name ||
        "Performer";

      let eventDate: Date | null = null;
      if (gig?.event_date) {
        eventDate = new Date(gig.event_date);
        eventDate.setHours(23, 59, 59, 999);
      }

      const item = {
        id: app.id,
        type_id: "gig_application",
        created_at: app.created_at,
        gig_id: app.gig_id,
        group_id: app.group_id,
        applicant_id: app.applicant_id,
        submitted_by_user_id: app.submitted_by_user_id,
        production_team_id: app.production_team_id,
        production_team_name: app.production_team?.name || null,
        performer: performerName,
        customer_name: performerName,
        raw_date: dateStr,
        start_time: gig?.event_date,
        name: gig?.name || "Unknown Gig",
        date: dateStr,
        image:
          app.production_roster?.roster_profile?.avatar_url ||
          performerSnapshot.avatar_url ||
          app.production_team?.logo_url ||
          gig?.organizer?.avatar_url ||
          "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400&h=200&fit=crop",
        status: requiresReconfirmation
          ? "Reconfirmation Required"
          : getGigApplicationStatusLabel(normalizedStatus, app.status),
        raw_status: app.status,
        reconfirmation_required_at: app.reconfirmation_required_at || null,
        reconfirmation_due_at: app.reconfirmation_due_at || null,
        system_status_reason: app.system_status_reason || null,
        requires_reconfirmation: requiresReconfirmation,
        type:
          app.group?.group_type === "duo"
            ? "Production Duo Application"
            : app.group_id
              ? "Production Group Application"
              : "Production Musician Application",
        isCancelled: ["cancelled", "rejected", "fired"].includes(normalizedStatus),
        action:
          normalizedStatus === "accepted" || normalizedStatus === "approved"
            ? "View Details"
            : requiresReconfirmation
              ? "Reconfirm"
              : "Details",
        location: gig?.location,
        pitch_message: app.pitch_message,
        video_url: app.video_url,
        cv_url: app.cv_url,
        slot_type: app.slot_type,
        reviewed_by_applicant: app.reviewed_by_applicant || false,
        feature_consent_status: app.feature_consent_status || "not_requested",
        show_on_gig_page: app.show_on_gig_page === true,
        show_on_profile: app.show_on_profile === true,
      };

      if (normalizedStatus === "pending") {
        fallback.Pending.push(item);
      } else if (normalizedStatus === "accepted" || normalizedStatus === "approved") {
        if (eventDate) {
          const eventStart = new Date(gig.event_date);
          eventStart.setHours(0, 0, 0, 0);

          if (now >= eventStart && now <= eventDate) {
            fallback.Ongoing.push({ ...item, status: "Happening Now" });
        } else if (now > eventDate) {
          fallback.Review.push({ ...item, status: "Completed" });
          } else {
            fallback.Upcoming.push(item);
          }
        } else {
          fallback.Upcoming.push(item);
        }
      } else if (["rejected", "cancelled", "resigned", "fired"].includes(normalizedStatus)) {
        fallback.Review.push({
          ...item,
          status: getGigApplicationStatusLabel(normalizedStatus, app.status),
        });
      } else if (normalizedStatus === "completed") {
        fallback.Review.push({ ...item, status: "Completed" });
      }
    });

    return fallback;
  }

  async function buildLocalVenueOwnerGigApplicationsFallback(targetUserId: string) {
    const fallback = {
      Pending: [] as any[],
      Upcoming: [] as any[],
      Ongoing: [] as any[],
      Review: [] as any[],
    };

    const { data: gigs, error: gigsError } = await supabase
      .from("gigs")
      .select("id, name, event_date, location")
      .eq("organizer_id", targetUserId);

    if (gigsError) {
      debugLog("Error fetching local gigs:", gigsError);
      return fallback;
    }

    const gigRows = gigs || [];
    const gigIds = gigRows.map((gig: any) => gig?.id).filter(Boolean);

    if (gigIds.length === 0) return fallback;

    const gigById = new Map(gigRows.map((gig: any) => [gig.id, gig]));
    const { data: venueApps, error: venueAppsError } = await supabase
      .from("gig_applications")
      .select(
        `
          *,
          applicant:applicant_id(full_name, avatar_url),
          submitter:submitted_by_user_id(full_name, avatar_url),
          group:group_id(name, group_type),
          production_team:production_team_id(id, name, logo_url),
          production_roster:production_roster_id(
            entity_kind,
            roster_profile:profile_id(full_name, avatar_url),
            roster_group:group_id(name, group_type)
          )
        `,
      )
      .in("gig_id", gigIds)
      .in("status", ["accepted", "approved", "pending", "rejected", "cancelled", "resigned", "completed", "fired"])
      .or("leader_approval_status.is.null,leader_approval_status.eq.approved")
      .order("created_at", { ascending: false });

    if (venueAppsError) {
      debugLog("Error fetching local gig applications:", venueAppsError);
      return fallback;
    }

    const now = new Date();

    (venueApps || []).forEach((app: any) => {
      const gig = gigById.get(app.gig_id);
      const normalizedStatus = String(app.status || "").toLowerCase();
      const requiresReconfirmation =
        normalizedStatus === "pending" &&
        app.system_status_reason === "system_reconfirm_required_terms_changed" &&
        !!app.reconfirmation_due_at;
      const dateStr = gig?.event_date || "TBA";
      const performerSnapshot =
        app.performer_snapshot && typeof app.performer_snapshot === "object"
          ? app.performer_snapshot
          : {};
      const performerName =
        app.group?.name ||
        app.production_roster?.roster_profile?.full_name ||
        app.production_roster?.roster_group?.name ||
        performerSnapshot.display_name ||
        app.applicant?.full_name ||
        "Performer";

      let eventDate: Date | null = null;
      if (gig?.event_date) {
        eventDate = new Date(gig.event_date);
        eventDate.setHours(23, 59, 59, 999);
      }

      const item = {
        id: app.id,
        type_id: "gig_application",
        created_at: app.created_at,
        gig_id: app.gig_id,
        group_id: app.group_id,
        applicant_id: app.applicant_id,
        user_id: app.applicant_id,
        submitted_by_user_id: app.submitted_by_user_id,
        production_team_id: app.production_team_id,
        production_team_name: app.production_team?.name || null,
        submitted_by_name: app.submitter?.full_name || null,
        raw_date: dateStr,
        start_time: gig?.event_date,
        name: `${gig?.name || "Gig"} - ${performerName}`,
        date: dateStr,
        image:
          app.group?.images?.[0] ||
          app.production_roster?.roster_profile?.avatar_url ||
          performerSnapshot.avatar_url ||
          app.production_team?.logo_url ||
          app.applicant?.avatar_url ||
          "https://picsum.photos/400/300",
        status:
          requiresReconfirmation
            ? "Needs Reconfirmation"
            : normalizedStatus === "pending"
              ? "Action Required"
              : normalizedStatus === "accepted" || normalizedStatus === "approved"
              ? "Confirmed"
              : getGigApplicationStatusLabel(normalizedStatus, app.status),
        raw_status: app.status,
        reconfirmation_required_at: app.reconfirmation_required_at || null,
        reconfirmation_due_at: app.reconfirmation_due_at || null,
        system_status_reason: app.system_status_reason || null,
        requires_reconfirmation: requiresReconfirmation,
        type: app.production_team?.name
          ? app.group?.group_type === "duo"
            ? "Production Duo Application"
            : app.group_id
              ? "Production Group Application"
              : "Production Musician Application"
          : app.group_id
            ? "Group Application"
            : "Solo Application",
        isCancelled: normalizedStatus === "rejected" || normalizedStatus === "cancelled" || normalizedStatus === "fired",
        action: normalizedStatus === "pending" ? "Confirm Now" : "View Details",
        location: gig?.location,
        performer: performerName,
        customer_name: performerName,
        customer_avatar:
          app.group?.images?.[0] ||
          app.production_roster?.roster_profile?.avatar_url ||
          app.applicant?.avatar_url,
        video_url: app.video_url,
        cv_url: app.cv_url,
        note: app.note,
        pitch_message: app.pitch_message,
        slot_type: app.slot_type,
        group_members: [],
        reviewed_by_organizer: app.reviewed_by_organizer || false,
      };

      if (normalizedStatus === "pending") {
        fallback.Pending.push(item);
      } else if (normalizedStatus === "accepted" || normalizedStatus === "approved") {
        if (eventDate) {
          const eventStart = new Date(gig.event_date);
          eventStart.setHours(0, 0, 0, 0);

          if (now >= eventStart && now <= eventDate) {
            fallback.Ongoing.push({ ...item, status: "Happening Now" });
          } else if (now > eventDate) {
            fallback.Review.push({ ...item, status: "Completed" });
          } else {
            fallback.Upcoming.push(item);
          }
        } else {
          fallback.Upcoming.push(item);
        }
      } else if (["rejected", "cancelled", "resigned", "fired"].includes(normalizedStatus)) {
        fallback.Review.push({
          ...item,
          status: getGigApplicationStatusLabel(normalizedStatus, app.status),
        });
      } else if (normalizedStatus === "completed") {
        fallback.Review.push({ ...item, status: "Completed" });
      }
    });

    return fallback;
  }

  async function fetchBookings(
    targetUserId: string,
    options: { showLoading?: boolean; summaryPayload?: any } = {},
  ) {
    try {
      if (options.showLoading !== false) {
        setLoading(true);
      }
      let nextPendingPermitStudios: any[] = [];
      const screenPayload = options.summaryPayload || null;

      // Fetch user role first
      const { data: profile } = screenPayload?.role
        ? { data: { role: screenPayload.role } }
        : await supabase
            .from("profiles")
            .select("role")
            .eq("id", targetUserId)
            .single();

      let role = profile?.role || "";
      if (role) {
        setUserRole(role);
        // If gig owner, default to Applicants tab only once (avoid tab reset on auto-refresh)
        if (role === "venue-owner" && !venueTabInitializedRef.current) {
          setActiveTab("Applicants");
          venueTabInitializedRef.current = true;
        } else if (role !== "venue-owner") {
          venueTabInitializedRef.current = false;
        }
      }

      if (Array.isArray(screenPayload?.pendingPermitListings)) {
        nextPendingPermitStudios = screenPayload.pendingPermitListings;
        setPendingPermitStudios(nextPendingPermitStudios);
      } else if (role === "studio-owner" || role === "venue-owner") {
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
          nextPendingPermitStudios = (permitRows || []).map((row: any) => ({
              ...row,
              entity_type: role === "studio-owner" ? "studio" : "gig",
          }));
          setPendingPermitStudios(nextPendingPermitStudios);
        }
      } else {
        setPendingPermitStudios([]);
      }

      const functionResult = screenPayload
        ? { data: screenPayload, error: null }
        : await supabase.functions.invoke(
            "manage-bookings",
            {
              body: { action: "fetch", includeScreenPayload: true, userId: targetUserId },
            },
          );
      const { data: bookings, error } = functionResult;
      if (!screenPayload && bookings) {
        queryClient.setQueryData(queryKeys.bookings.summary(targetUserId), bookings);
      }

      const returnedStaffContext = bookings?.staff_context || null;
      setStaffBookingContext(returnedStaffContext);
      if (bookings?.role && bookings.role !== role) {
        role = bookings.role;
        setUserRole(role);
        if (role === "venue-owner" && !venueTabInitializedRef.current) {
          setActiveTab("Applicants");
          venueTabInitializedRef.current = true;
        } else if (role !== "venue-owner") {
          venueTabInitializedRef.current = false;
        }
      }

      const fallbackBookings =
        error && role !== "venue-owner"
          ? await buildLocalStudioBookingsFallback(targetUserId, role)
          : null;

      let effectiveBookings = fallbackBookings || bookings?.categorized || bookings;

      if (role === "venue-owner") {
        const venueFallbackBookings = await buildLocalVenueOwnerGigApplicationsFallback(targetUserId);
        effectiveBookings = {
          ...effectiveBookings,
          Pending: mergeUniqueActivityItems(
            venueFallbackBookings.Pending,
            effectiveBookings?.Pending || [],
          ),
          Upcoming: mergeUniqueActivityItems(
            venueFallbackBookings.Upcoming,
            effectiveBookings?.Upcoming || [],
          ),
          Ongoing: mergeUniqueActivityItems(
            venueFallbackBookings.Ongoing,
            effectiveBookings?.Ongoing || [],
          ),
          Review: mergeUniqueActivityItems(
            venueFallbackBookings.Review,
            effectiveBookings?.Review || [],
          ),
        };
        effectiveBookings = await attachManagerPendingRecommendations(effectiveBookings);
      }

      let connectionRequestItems: any[] = [];
      try {
        const connectionRequestSelect =
          "id, created_at, sender_id, receiver_id, group_id, studio_id, message, status, event_details, attachment_url";
        const payloadConnectionRequests = Array.isArray(screenPayload?.connectionRequests)
          ? screenPayload.connectionRequests
          : null;
        const payloadOwnedGroupIds = Array.isArray(screenPayload?.ownedGroupIds)
          ? screenPayload.ownedGroupIds.filter(Boolean)
          : null;
        let ownedGroupIds = payloadOwnedGroupIds || [];

        if (!payloadOwnedGroupIds) {
          const { data: ownedGroups, error: ownedGroupsError } = await supabase
            .from("groups")
            .select("id")
            .eq("owner_id", targetUserId);

          if (ownedGroupsError) {
            debugLog("Error fetching owned groups for connection requests:", ownedGroupsError);
          }

          ownedGroupIds = Array.from(
            new Set((ownedGroups || []).map((group: any) => group?.id).filter(Boolean)),
          );
        }
        const ownedGroupIdSet = new Set(ownedGroupIds);

        let requestRows: any[] = [];
        if (payloadConnectionRequests) {
          const requestRowsById = new Map<string, any>();
          payloadConnectionRequests.forEach((request: any) => {
            if (request?.id && !requestRowsById.has(request.id)) {
              requestRowsById.set(request.id, request);
            }
          });
          requestRows = Array.from(requestRowsById.values()).sort(
            (a: any, b: any) =>
              new Date(b?.created_at || 0).getTime() -
              new Date(a?.created_at || 0).getTime(),
          );
        } else {
          const requestResults = await Promise.all([
            supabase
              .from("booking_requests")
              .select(connectionRequestSelect)
              .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`)
              .in("status", VISIBLE_CONNECTION_REQUEST_STATUSES)
              .order("created_at", { ascending: false }),
            ...(ownedGroupIds.length > 0
              ? [
                  supabase
                    .from("booking_requests")
                    .select(connectionRequestSelect)
                    .in("group_id", ownedGroupIds)
                    .in("status", VISIBLE_CONNECTION_REQUEST_STATUSES)
                    .order("created_at", { ascending: false }),
                ]
              : []),
          ]);

          const requestRowsById = new Map<string, any>();
          requestResults.forEach((result, index) => {
            if (result.error) {
              debugLog(
                index === 0
                  ? "Error fetching connection requests:"
                  : "Error fetching group-owned connection requests:",
                result.error,
              );
              return;
            }

            (result.data || []).forEach((request: any) => {
              if (request?.id && !requestRowsById.has(request.id)) {
                requestRowsById.set(request.id, request);
              }
            });
          });

          requestRows = Array.from(requestRowsById.values()).sort(
            (a: any, b: any) =>
              new Date(b?.created_at || 0).getTime() -
              new Date(a?.created_at || 0).getTime(),
          );
        }

        if (requestRows.length > 0) {
          const profileIds = [...new Set(
            requestRows
              .flatMap((request: any) => [request.sender_id, request.receiver_id])
              .filter(Boolean),
          )];

          const profileMap = new Map<string, any>();

          const payloadProfiles = Array.isArray(screenPayload?.connectionRequestProfiles)
            ? screenPayload.connectionRequestProfiles
            : null;

          if (payloadProfiles) {
            payloadProfiles.forEach((profile: any) => {
              if (profile?.id) {
                profileMap.set(profile.id, profile);
              }
            });
          } else if (profileIds.length > 0) {
            const { data: profileRows, error: profileError } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", profileIds);

            if (profileError) {
              debugLog("Error fetching connection request profiles:", profileError);
            } else {
              (profileRows || []).forEach((profile: any) => {
                if (profile?.id) {
                  profileMap.set(profile.id, profile);
                }
              });
            }
          }

          const mediaMaps = await loadConnectionRequestMediaMaps(requestRows);

          connectionRequestItems = requestRows.map((request: any) => {
            const eventDetails = getEventObject(request.event_details);
            const requestDetails = extractConnectionRequestDetails(
              eventDetails,
              request.attachment_url,
            );
            const senderEntityName =
              eventDetails.sender_entity_name ||
              profileMap.get(request.sender_id)?.full_name ||
              "User";
            const receiverEntityName =
              eventDetails.receiver_entity_name ||
              profileMap.get(request.receiver_id)?.full_name ||
              "User";
            const isGroupMemberInvite = isGroupMemberInviteEvent(
              eventDetails,
              requestDetails.requestKind,
            );
            const isIncoming =
              request.receiver_id === targetUserId ||
              Boolean(
                request.group_id &&
                  ownedGroupIdSet.has(request.group_id) &&
                  request.sender_id !== targetUserId &&
                  !isGroupMemberInvite,
              );
            const counterpartyId = isIncoming ? request.sender_id : request.receiver_id;
            const counterpartyProfile = counterpartyId ? profileMap.get(counterpartyId) : null;
            const counterpartyName = isIncoming ? senderEntityName : receiverEntityName;
            const cardImage = getConnectionRequestCardImage(
              request,
              eventDetails,
              counterpartyProfile,
              mediaMaps,
            );

            return {
              id: request.id,
              type_id: "booking_request",
              created_at: request.created_at,
              raw_date: request.created_at,
              date: formatFriendlyDateTime(request.created_at),
              name: counterpartyName,
              image: cardImage || REQUEST_PLACEHOLDER_IMAGE,
              status: getConnectionRequestStatusLabel(request.status),
              raw_status: request.status,
              type: buildConnectionRequestTypeLabel(eventDetails),
              message: requestDetails.pitchMessage || request.message || "",
              action: "View Request",
              sender_id: request.sender_id,
              receiver_id: request.receiver_id,
              counterparty_id: counterpartyId || null,
              counterparty_name: counterpartyProfile?.full_name || counterpartyName,
              counterparty_avatar: counterpartyProfile?.avatar_url || null,
              request_direction: isIncoming ? "incoming" : "outgoing",
              request_context_label: isIncoming ? "From" : "To",
              sender_entity_name: senderEntityName,
              sender_entity_type: eventDetails.sender_entity_type || null,
              receiver_entity_name: receiverEntityName,
              receiver_entity_type: eventDetails.receiver_entity_type || null,
              group_id: request.group_id || null,
              studio_id: request.studio_id || null,
              production_team_id: eventDetails.production_team_id || null,
              listing_id: eventDetails.listing_id || null,
              listing_type: eventDetails.listing_type || null,
              request_kind: requestDetails.requestKind,
              application_scope: eventDetails.application_scope || null,
              request_application_context: requestDetails.applicationContext,
              request_context_title: requestDetails.contextLabel,
              request_contract_url: requestDetails.contractUrl,
              request_cv_url: requestDetails.cvUrl,
              request_video_url: requestDetails.videoUrl,
              request_slot_type: requestDetails.slotType,
              request_roster_entry_name: requestDetails.rosterEntryName,
              request_roster_entry_kind: requestDetails.rosterEntryKind,
              attachment_url: request.attachment_url || null,
              route_path: eventDetails.route || null,
              route_params: eventDetails.route_params || null,
              viewer_is_group_owner:
                Boolean(request.group_id && ownedGroupIdSet.has(request.group_id)),
            };
          });
        }
      } catch (requestFetchError) {
        debugLog("Error building connection requests:", requestFetchError);
      }

      if (!effectiveBookings) throw error || new Error("Failed to fetch bookings");

      if (role === "musician" || isProducerActivityRole(role)) {
        const producerFallbackBookings =
          await buildLocalProducerGigApplicationsFallback(targetUserId);

        effectiveBookings = {
          ...effectiveBookings,
          Pending: mergeUniqueActivityItems(
            effectiveBookings?.Pending || [],
            producerFallbackBookings.Pending,
          ),
          Upcoming: mergeUniqueActivityItems(
            effectiveBookings?.Upcoming || [],
            producerFallbackBookings.Upcoming,
          ),
          Ongoing: mergeUniqueActivityItems(
            effectiveBookings?.Ongoing || [],
            producerFallbackBookings.Ongoing,
          ),
          Review: mergeUniqueActivityItems(
            effectiveBookings?.Review || [],
            producerFallbackBookings.Review,
          ),
        };
      }

      const combinedBookingItems = [
        ...(effectiveBookings?.Pending || []),
        ...connectionRequestItems,
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
        const payloadLateEvents = Array.isArray(screenPayload?.lateAttendanceEvents)
          ? screenPayload.lateAttendanceEvents
          : null;
        const lateEventsResult = payloadLateEvents
          ? { data: payloadLateEvents, error: null }
          : await supabase
              .from("booking_attendance_events")
              .select("booking_id, reporter_user_id, notes, created_at")
              .in("booking_id", studioBookingIds)
              .eq("event_type", "late");
        const { data: lateEvents, error: lateEventsError } = lateEventsResult;

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

      const normalizeStatus = (status?: string | null) =>
        String(status || "").trim().toLowerCase();
      const getPendingSortTime = (item: any) => {
        const candidates = [
          item?.created_at,
              item?.raw_date && item?.start_time
                ? `${item.raw_date}T${item.start_time}`
                : null,
              item?.raw_date,
              item?.date,
              item?.updated_at,
        ];

        for (const candidate of candidates) {
          if (!candidate) continue;
          const timestamp = new Date(candidate).getTime();
          if (!Number.isNaN(timestamp)) return timestamp;
        }

        return 0;
      };

      const getHistorySortTime = (item: any) => {
        const candidates = [
          item?.raw_date && item?.start_time
                ? `${item.raw_date}T${item.start_time}`
                : null,
              item?.raw_date,
              item?.date,
              item?.updated_at,
              item?.created_at,
        ];

        for (const candidate of candidates) {
          if (!candidate) continue;
          const timestamp = new Date(candidate).getTime();
          if (!Number.isNaN(timestamp)) return timestamp;
        }

        return 0;
      };

      // Separate Items Logic

      // 1. Applicants (Pending Gig items)
      const pendingConnectionRequestItems = connectionRequestItems.filter(
        (item: any) => normalizeStatus(item.raw_status) === "pending",
      );
      const resolvedConnectionRequests = connectionRequestItems.filter(
        (item: any) => normalizeStatus(item.raw_status) !== "pending",
      );
      const rawPending = attachLateReportMeta([
        ...(effectiveBookings?.Pending || []),
        ...pendingConnectionRequestItems,
      ]);
      const pendingGigApplications = rawPending.filter(
        (item: any) => item.type_id === "gig_application",
      );
      const pendingConnectionRequests = rawPending.filter(
        (item: any) => item.type_id === "booking_request",
      );

      const applicants =
        role === "venue-owner"
          ? [...pendingGigApplications, ...pendingConnectionRequests]
          : [];

      const studioPending = rawPending.filter(
        (item: any) =>
          item.type_id !== "gig_application" && item.type_id !== "booking_request",
      );
      const groupedStudioPending =
        role === "musician"
          ? groupPendingStudioBookingItems(studioPending)
          : studioPending;

      const pendingItems =
        role === "venue-owner"
          ? []
          : role === "musician" || isProducerActivityRole(role)
            ? [...pendingGigApplications, ...pendingConnectionRequests, ...groupedStudioPending]
            : [...pendingConnectionRequests, ...groupedStudioPending];

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

      // 4. History - terminal items and completed/fired items already reviewed by the current viewer
      const rawReview = attachLateReportMeta(effectiveBookings?.Review || []);
      const cancelledFromUpcoming = rawUpcoming.filter(
        (item: any) => item.isCancelled || item.status === "Declined"
      );
      const getGigApplicationReviewStatus = (item: any) => {
        const rawStatus = normalizeStatus(item.raw_status);
        const displayStatus = normalizeStatus(item.status);
        if (
          (rawStatus === "accepted" || rawStatus === "approved") &&
          displayStatus === "completed"
        ) {
          return "completed";
        }
        return rawStatus || displayStatus;
      };
      const isReviewRequiredGigApplication = (item: any) =>
        item.type_id === "gig_application" &&
        ["completed", "fired"].includes(getGigApplicationReviewStatus(item));
      const isHistoryOnlyGigApplication = (item: any) =>
        item.type_id === "gig_application" &&
        ["declined", "rejected", "cancelled", "resigned"].includes(getGigApplicationReviewStatus(item));
      const hasCurrentViewerReviewedGigApplication = (item: any) => {
        if (role === "venue-owner") return item.reviewed_by_organizer === true;
        return item.reviewed_by_applicant === true;
      };
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
      const terminalGigApplications = rawReview.filter((item: any) => {
        if (item.type_id !== "gig_application") return false;
        if (isHistoryOnlyGigApplication(item)) return true;
        if (!isReviewRequiredGigApplication(item)) return false;
        return hasCurrentViewerReviewedGigApplication(item);
      });

      const historyItems = [
        ...cancelledFromUpcoming,
        ...alreadyReviewedCompleted,
        ...terminalGigApplications,
        ...expiredPendingStudioItems,
        ...resolvedConnectionRequests,
      ]
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
      const unreviewedItems = [
        ...rawReview.filter((item: any) => {
          if (role === "venue-owner") {
            return (
              isReviewRequiredGigApplication(item) &&
              item.reviewed_by_organizer !== true
            );
          }

          if (isProducerActivityRole(role)) {
            return isReviewRequiredGigApplication(item) &&
              item.viewer_can_act !== false &&
              item.reviewed_by_applicant !== true;
          }

          if (item.type_id === "gig_application") {
            return (
              isReviewRequiredGigApplication(item) &&
              item.reviewed_by_applicant !== true
            );
          }

          if (role === "studio-owner") {
            return item.reviewed_by_owner !== true;
          }

          // Default/musician flow
          return item.reviewed_by_customer !== true;
        }),
        ...(role === "venue-owner" ? resolvedConnectionRequests : []),
      ].filter(
        (item: any, index: number, arr: any[]) =>
          arr.findIndex((candidate: any) => candidate.id === item.id && candidate.type_id === item.type_id) === index,
      );

      // Sort lists
      applicants.sort(
        (a: any, b: any) => {
          const recommendationRank = (item: any) =>
            item?.ai_recommendation?.recommendation_status === "recommended"
              ? 2
              : item?.ai_recommendation
                ? 1
                : 0;
          const rankDifference = recommendationRank(b) - recommendationRank(a);
          if (rankDifference !== 0) return rankDifference;
          const scoreDifference =
            Number(b?.ai_recommendation?.score || 0) -
            Number(a?.ai_recommendation?.score || 0);
          if (scoreDifference !== 0) return scoreDifference;
          return (
            new Date(b.created_at || b.raw_date).getTime() -
            new Date(a.created_at || a.raw_date).getTime()
          );
        },
      );
      activeGigMusicians.sort(
        (a: any, b: any) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      ); // Closest gig first
      unreviewedItems.sort(
        (a: any, b: any) =>
          new Date(b.created_at || b.raw_date).getTime() -
          new Date(a.created_at || a.raw_date).getTime(),
      );
      const processedData = {
        Applicants: applicants,
        ActiveMusicians: activeGigMusicians,
        Pending: activePendingItems,
        Upcoming: allUpcoming,
        Ongoing: allOngoing,
        Review: unreviewedItems,
        History: historyItems,
      };

      let nextApplicationData = createEmptyApplicationData();
      let finalData = processedData;

      // For musicians: Separate gig applications by status for the Applications view
      if (role === "musician") {
        // Get all gig applications from all categories
        const allGigApps = [
          ...rawPending.filter((item: any) => item.type_id === "gig_application"),
          ...rawUpcoming.filter((item: any) => item.type_id === "gig_application"),
          ...rawOngoing.filter((item: any) => item.type_id === "gig_application"),
          ...(effectiveBookings?.Review || []).filter((item: any) => item.type_id === "gig_application"),
        ].filter((item: any) => !item.leader_approval_required);

        // Separate by status
        const appliedApps = allGigApps.filter(
          (app: any) => {
            const status = normalizeStatus(app.status);
            const rawStatus = normalizeGigApplicationStatusValue(app.raw_status);
            return status === "applied" || status === "pending" || rawStatus === "pending" || isGigReconfirmationItem(app);
          },
        );
        const acceptedApps = allGigApps.filter(
          (app: any) => {
            const status = normalizeStatus(app.status);
            return status === "accepted" || status === "approved" || status === "happening now" || status === "confirmed";
          },
        );
        const completedApps = allGigApps.filter(
          (app: any) => {
            const status = normalizeStatus(app.status);
            return ["completed", "declined", "rejected", "fired", "cancelled", "resigned"].includes(status);
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

        nextApplicationData = {
          Applied: appliedApps,
          Accepted: acceptedApps,
          Completed: completedApps,
        };
        setApplicationData(nextApplicationData);
      } else {
        setApplicationData(nextApplicationData);
      }

      setData(finalData);
      bookingsScreenCache.set(targetUserId, {
        data: finalData,
        applicationData: nextApplicationData,
        pendingPermitStudios: nextPendingPermitStudios,
        userRole: role,
        fetchedAt: Date.now(),
      });
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
      if (
        typeId === "gig_application" &&
        selectedItem?.id === bookingId &&
        isReadOnlyBookingItem(selectedItem)
      ) {
        showReadOnlyBookingAlert();
        return false;
      }

      debugLog("?? handleStatusUpdate called with:", {
        bookingId,
        newStatus,
        typeId,
        reason,
      });

      startActionLoading(bookingId, getStatusActionLoadingMessage(newStatus, typeId));

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
          debugLog("?? record_booking_attendance failed, falling back to manage-bookings:", error);

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

      debugLog("?? handleStatusUpdate response:", { data, error });

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
        Alert.alert("Already Reported", duplicateMessage);
        setModalVisible(false);
        return false;
      }

      // Refresh list immediately so terminal actions move cards between tabs without
      // waiting for realtime/query stale timers.
      if (userId) {
        bookingsScreenCache.delete(userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.bookings.summary(userId) });
        await fetchBookings(userId, { showLoading: false });
      }
      setModalVisible(false);
      return true;
    } catch (e) {
      debugLog("Error updating status:", e);
      const errorMessage =
        (e as any)?.message ||
        (typeof e === "string" ? e : "Failed to update booking status.");
      Alert.alert("Error", errorMessage);
      return false;
    } finally {
      clearActionLoading(bookingId);
    }
  }

  async function runGigReconfirmationDecision(item: any, accepted: boolean) {
    if (!userId || !item?.id) {
      showAlert("info", "Sign in required", "Please sign in to manage this gig.");
      return;
    }

    try {
      startActionLoading(item.id, accepted ? "Reconfirming gig" : "Declining update");
      setLoading(true);

      const { data, error } = await supabase.functions.invoke("manage-bookings", {
        body: {
          action: "reconfirm_gig_terms",
          application_id: item.id,
          decision: accepted ? "accepted" : "declined",
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
          (contextBody && typeof contextBody === "object" && (contextBody.error || contextBody.message)) ||
          null;

        if (contextMessage && typeof contextMessage === "string") {
          throw new Error(contextMessage);
        }

        throw error;
      }

      if (data?.error) throw new Error(data.error);

      bookingsScreenCache.delete(userId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookings.summary(userId) });
      await fetchBookings(userId, { showLoading: false });
      setViewMode("applications");
      setActiveAppTab(accepted ? "Accepted" : "Completed");
      setModalVisible(false);
      setCancellationReason("");

      showAlert(
        accepted ? "success" : "info",
        accepted ? "Gig Reconfirmed" : "Update Declined",
        accepted
          ? "You accepted the updated gig details."
          : "You declined the updated gig details.",
      );
    } catch (error: any) {
      showAlert(
        "error",
        "Action Failed",
        error?.message || "Could not process this gig update.",
      );
    } finally {
      clearActionLoading(item.id);
      setLoading(false);
    }
  }

  function handleGigReconfirmationDecision(item: any, accepted: boolean) {
    if (isReadOnlyBookingItem(item)) {
      showReadOnlyBookingAlert();
      return;
    }

    Alert.alert(
      accepted ? "Reconfirm Gig" : "Decline Updated Gig",
      accepted
        ? "This will accept the venue's updated gig date and time."
        : "This will decline the updated gig terms and remove you from this gig.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: accepted ? "Reconfirm" : "Decline Update",
          style: accepted ? "default" : "destructive",
          onPress: () => {
            void runGigReconfirmationDecision(item, accepted);
          },
        },
      ],
    );
  }

  const handleDetailsPress = (item: any) => {
    setSelectedItem(item);
    bookingDetailsRef.current?.present();
  };

  const isReadOnlyBookingItem = (item: any) => {
    if (staffBookingContext?.view_only === true) {
      return true;
    }

    const normalizedItemStatus = String(item?.raw_status || item?.status || "")
      .trim()
      .toLowerCase();

    if (
      isE2EFixtureMode() &&
      item?.type_id === "gig_application" &&
      ["applied", "pending"].includes(normalizedItemStatus)
    ) {
      return false;
    }

    return item?.type_id === "gig_application" &&
      item?.viewer_can_act === false &&
      item?.viewer_access !== "applicant" &&
      item?.applicant_id !== userId &&
      item?.submitted_by_user_id !== userId;
  };

  const showReadOnlyBookingAlert = () => {
    Alert.alert(
      "View Only",
      staffBookingContext?.view_only === true
        ? "This staff account has view-only access for this workspace."
        : "This application was submitted on your behalf. You can view the details, but actions are managed by the applicant or production team.",
    );
  };

  const canRespondToConnectionRequest = (item: any) => {
    if (item?.type_id !== "booking_request") return false;
    if (!userId) return false;
    if (item?.request_direction !== "incoming") return false;

    if (isGroupMemberInviteRequest(item)) {
      return item?.receiver_id === userId;
    }

    return item?.receiver_id === userId || item?.viewer_is_group_owner === true;
  };

  const handleConnectionRequestDecision = async (
    item: any,
    nextStatus: "accepted" | "declined",
  ) => {
    if (!userId) {
      showAlert("info", "Sign in required", "Please sign in to manage requests.");
      return;
    }

    if (!canRespondToConnectionRequest(item)) {
      showAlert(
        "warning",
        "Action unavailable",
        "Only the request recipient can respond to this connection request.",
      );
      return;
    }

    setRequestActionId(item.id);
    startActionLoading(
      item.id,
      nextStatus === "accepted" ? "Accepting request" : "Declining request",
    );

    try {
      const isProductionInvite = isProductionTeamInviteRequest(item);
      const counterpartyName = item.counterparty_name || item.name || "this user";

      if (isProductionInvite) {
        const { data, error } = await supabase.functions.invoke("manage-production", {
          body: {
            action: "respond_to_production_team_invite",
            request_id: item.id,
            decision: nextStatus,
          },
        });

        if (error) {
          console.error("respond_to_production_team_invite failed", {
            message: error.message,
            status: (error as any).status,
            code: (error as any).code,
            details: (error as any).details,
            hint: (error as any).hint,
            context: (error as any).context,
            body: {
              action: "respond_to_production_team_invite",
              request_id: item.id,
              decision: nextStatus,
            },
          });
          throw error;
        }

        if (!data?.success) {
          throw new Error(data?.error || "Failed to update the production team invite.");
        }

        await fetchBookings(userId);

        const rosterMessage =
          nextStatus === "accepted"
            ? data?.roster_added
              ? item?.group_id
                ? ` ${item.receiver_entity_name || "Your group"} is now on their production roster.`
                : " You are now on their production roster."
              : data?.already_on_roster
                ? item?.group_id
                  ? ` ${item.receiver_entity_name || "Your group"} was already on their production roster.`
                  : " You were already on their production roster."
                : ""
            : "";

        showAlert(
          "success",
          nextStatus === "accepted" ? "Request accepted" : "Request declined",
          nextStatus === "accepted"
            ? `You accepted the production team invite from ${counterpartyName}.${rosterMessage}`
            : `You declined the production team invite from ${counterpartyName}.`,
        );
        return;
      }

      if (isGroupMemberApplicationRequest(item)) {
        const { data, error } = await supabase.functions.invoke("group-members", {
          body: {
            action: "respond_group_application",
            userId,
            requestId: item.id,
            decision: nextStatus,
          },
        });

        if (error) {
          console.error("respond_group_application failed", {
            message: error.message,
            status: (error as any).status,
            code: (error as any).code,
            details: (error as any).details,
            hint: (error as any).hint,
            context: (error as any).context,
          });
          throw error;
        }

        if (!data?.success) {
          throw new Error(data?.error || "Failed to update the group application.");
        }

        await fetchBookings(userId);

        showAlert(
          "success",
          nextStatus === "accepted" ? "Application accepted" : "Application declined",
          nextStatus === "accepted"
            ? `${counterpartyName} has been added to ${item.receiver_entity_name || "your group"}.`
            : `You declined the group application from ${counterpartyName}.`,
        );
        return;
      }

      if (isGroupMemberInviteRequest(item)) {
        const { data, error } = await supabase.functions.invoke("group-members", {
          body: {
            action: "respond_group_invite",
            userId,
            requestId: item.id,
            decision: nextStatus,
          },
        });

        if (error) {
          console.error("respond_group_invite failed", {
            message: error.message,
            status: (error as any).status,
            code: (error as any).code,
            details: (error as any).details,
            hint: (error as any).hint,
            context: (error as any).context,
          });
          throw error;
        }

        if (!data?.success) {
          throw new Error(data?.error || "Failed to update the group invite.");
        }

        await fetchBookings(userId);

        showAlert(
          "success",
          nextStatus === "accepted" ? "Invite accepted" : "Invite declined",
          nextStatus === "accepted"
            ? `You joined ${item.sender_entity_name || "the group"}.`
            : `You declined the group invite from ${item.sender_entity_name || "the group"}.`,
        );
        return;
      }

      const responseBody = {
        action: "respond_to_listing_request",
        request_id: item.id,
        decision: nextStatus,
      };

      const { data, error } = await supabase.functions.invoke("manage-production", {
        body: responseBody,
      });

      if (error) {
        console.error("respond_to_listing_request failed", {
          message: error.message,
          status: (error as any).status,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
          context: (error as any).context,
          body: responseBody,
        });
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to update the connection request.");
      }

      if (!data?.request) {
        await fetchBookings(userId);
        showAlert(
          "warning",
          "Request already updated",
          "This connection request is no longer pending.",
        );
        return;
      }

      await fetchBookings(userId);

      showAlert(
        "success",
        nextStatus === "accepted" ? "Request accepted" : "Request declined",
        nextStatus === "accepted"
          ? `You accepted the connection request from ${counterpartyName}.`
          : `You declined the connection request from ${counterpartyName}.`,
      );
    } catch (decisionError) {
      debugLog("Error updating connection request:", decisionError);
      showAlert(
        "error",
        "Unable to update request",
        (decisionError as any)?.message || "Failed to update the connection request. Please try again.",
      );
    } finally {
      setRequestActionId(null);
      clearActionLoading(item.id);
    }
  };

  const promptConnectionRequestDecision = (
    item: any,
    nextStatus: "accepted" | "declined",
  ) => {
    const counterpartyName = item?.counterparty_name || item?.name || "this user";
    const requestTypeLabel = String(item?.type || "connection request").toLowerCase();
    const isAccept = nextStatus === "accepted";

    showAlert(
      isAccept ? "info" : "warning",
      isAccept ? "Accept Request" : "Decline Request",
      isAccept
        ? `Accept the ${requestTypeLabel} from ${counterpartyName}?`
        : `Decline the ${requestTypeLabel} from ${counterpartyName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isAccept ? "Accept" : "Decline",
          style: isAccept ? "default" : "destructive",
          onPress: () => {
            void handleConnectionRequestDecision(item, nextStatus);
          },
        },
      ],
    );
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
                      // Edge function caught an internal error  -  fall through to RPC
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
              showAlert("warning", "Couldn't Remove Listing", "Failed to remove listing. Please try again.");
            } finally {
              setPermitDeleting(null);
            }
          },
        },
      ],
    );
  };

  const handleConfirmBooking = async (bookingId: string) => {
    if (selectedItem?.id === bookingId && isReadOnlyBookingItem(selectedItem)) {
      showReadOnlyBookingAlert();
      return;
    }

    // Open modal instead of confirming immediately
    setModalMode("confirm");
    setModalVisible(true);
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (selectedItem?.id === bookingId && isReadOnlyBookingItem(selectedItem)) {
      showReadOnlyBookingAlert();
      return;
    }

    // If it's an active musician, we treat it as 'fire'
    const isFire =
      activeTab === "Active Musicians" && userRole === "venue-owner";
    setCancellationReason("");
    setModalMode(isFire ? "fire" : "cancel");
    setModalVisible(true);
  };

  const handleDeclineBooking = (item: any) => {
    if (isReadOnlyBookingItem(item)) {
      showReadOnlyBookingAlert();
      return;
    }

    setSelectedItem(item);
    setCancellationReason("");
    setModalMode("decline");
    setModalVisible(true);
  };

  const isReviewOrCompletedContext =
    renderActiveTab === "Review" ||
    (userRole === "musician" &&
      viewMode === "applications" &&
      activeAppTab === "Completed");

  const openConnectionRequestLink = useCallback(
    (url: string | null | undefined, label: string) => {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) return;

      if (isInAppMediaUrl(normalizedUrl)) {
        setMediaViewerTitle(label);
        setMediaViewerUrl(normalizedUrl);
        return;
      }

      void Linking.openURL(normalizedUrl).catch(() => {
        showAlert(
          "error",
          "Unable to open link",
          `We couldn't open the ${label.toLowerCase()} link.`,
        );
      });
    },
    [showAlert],
  );

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
    if (renderActiveTab !== "Upcoming") return false;
    if (item?.type_id !== "studio_booking") return false;
    if (userRole !== "musician") return false;
    if (item?.isCancelled) return false;
    if (hasLateReportAlready(item)) return false;
    if (isE2EFixtureMode() || String(item?.name || "").startsWith("E2E Studio")) return true;

    return isWithinLateReportWindow(item);
  };

  const shouldShowMessageForItem = (item: any) => {
    if (item.type_id === "booking_request") {
      return !!item.counterparty_id;
    }

    if (isReviewOrCompletedContext) return false;

    if (item.type_id === "studio_booking") {
      return userRole === "musician"
        ? !!item.studio_owner_id
        : !!item.user_id;
    }

    if (item.type_id === "gig_application") {
      if (isReadOnlyBookingItem(item)) {
        return false;
      }

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
      Alert.alert("Info", "Please sign in to use chat.");
      return;
    }

    if (isReadOnlyBookingItem(item)) {
      showReadOnlyBookingAlert();
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
            recipientName = item.organizer_name || "Gig Owner";
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
      } else if (item.type_id === "booking_request") {
        chatContext.bookingRequestId = item.id;
        if (item.production_team_id) chatContext.productionTeamId = item.production_team_id;
        if (item.listing_id) chatContext.listingId = item.listing_id;

        recipientId = item.counterparty_id || null;
        recipientName = item.counterparty_name || item.name || "User";
        recipientAvatar = item.counterparty_avatar || null;
      }

      if (!recipientId) {
        Alert.alert(
          "Warning",
          "No recipient found for this booking.",
        );
        return;
      }

      if (recipientId === userId) {
        Alert.alert(
          "Warning",
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
      Alert.alert(
        "Error",
        "Could not open chat right now. Please try again.",
      );
    }
  };

  const handleLeaderApprovalDecision = async (
    item: any,
    decision: "approved" | "rejected",
  ) => {
    try {
      startActionLoading(
        item?.id,
        decision === "approved" ? "Approving submission" : "Rejecting submission",
      );

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
      Alert.alert(
        "Error",
        err?.message || "Failed to process leader confirmation.",
      );
    } finally {
      clearActionLoading(item?.id);
    }
  };

  const normalizeRelocationTime = (value: unknown) =>
    String(value || "").trim().substring(0, 5);

  const formatRelocationClockTime = (value: unknown) =>
    formatBookingClockTime(normalizeRelocationTime(value)) || "TBA";

  const formatRelocationDateTime = (
    dateValue?: string | null,
    timeValue?: string | null,
  ) => {
    if (!dateValue || !timeValue) return "TBA";
    const timePart = normalizeRelocationTime(timeValue);
    const parsed = new Date(`${dateValue}T${timePart}`);
    if (isNaN(parsed.getTime())) {
      return `${dateValue} ${formatRelocationClockTime(timePart)}`;
    }
    return formatFriendlyDateTime(parsed.toISOString());
  };

  const relocationSlotKey = (slot: RelocationSlotOption) =>
    `${slot.date}|${normalizeRelocationTime(slot.start_time)}|${normalizeRelocationTime(slot.end_time)}`;

  const getRelocationSlotFromItem = (item: any): RelocationSlotOption | null => {
    if (
      !item?.relocation_proposed_date ||
      !item?.relocation_proposed_start_time ||
      !item?.relocation_proposed_end_time
    ) {
      return null;
    }

    return {
      date: item.relocation_proposed_date,
      start_time: normalizeRelocationTime(item.relocation_proposed_start_time),
      end_time: normalizeRelocationTime(item.relocation_proposed_end_time),
    };
  };

  const getSelectedRelocationSlot = (item: any): RelocationSlotOption | null =>
    preferredRelocationSlots[item?.id] || getRelocationSlotFromItem(item);

  const formatRelocationSlotLabel = (slot: RelocationSlotOption | null) => {
    if (!slot) return "Choose a time";
    return `${formatRelocationDateTime(slot.date, slot.start_time)} - ${formatRelocationClockTime(slot.end_time)}`;
  };

  const getRelocationLocalDateKey = (value: Date = new Date()) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  const addRelocationDays = (value: Date, days: number) => {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
  };

  const getRelocationDateRange = (startDate: string, endDate: string) => {
    const dates: string[] = [];
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return dates;
    }

    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      dates.push(getRelocationLocalDateKey(cursor));
    }

    return dates;
  };

  const getRelocationSlotDates = (slots: RelocationSlotOption[]) =>
    Array.from(new Set(slots.map((slot) => slot.date).filter(Boolean))).sort();

  const buildRelocationCalendarMarks = (
    slots: RelocationSlotOption[],
    activeDate: string,
    minDate: string,
    maxDate: string,
  ) => {
    const marks: Record<string, any> = {};
    const availableDates = new Set(getRelocationSlotDates(slots));

    getRelocationDateRange(minDate, maxDate).forEach((date) => {
      if (!availableDates.has(date)) {
        marks[date] = {
          disabled: true,
          disableTouchEvent: true,
        };
      }
    });

    availableDates.forEach((date) => {
      marks[date] = {
        ...(marks[date] || {}),
        disabled: false,
        disableTouchEvent: false,
        marked: true,
        dotColor: colors.primary,
      };
    });

    if (activeDate && availableDates.has(activeDate)) {
      marks[activeDate] = {
        ...(marks[activeDate] || {}),
        selected: true,
        selectedColor: colors.primary,
        selectedTextColor: "#FFFFFF",
        marked: true,
        dotColor: "#FFFFFF",
      };
    }

    return marks;
  };

  const toRelocationMinutes = (time: unknown) => {
    const [hours, minutes] = normalizeRelocationTime(time).split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const toRelocationTimeString = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  const getRelocationDurationMinutes = (item: any) => {
    const start = toRelocationMinutes(item?.start_time);
    const end = toRelocationMinutes(item?.end_time);
    if (start !== null && end !== null && end > start) return end - start;

    const hours = Number(item?.duration_hours || item?.hours);
    if (Number.isFinite(hours) && hours > 0) return Math.round(hours * 60);

    return 120;
  };

  const relocationScheduleAllowsSession = (row: any, item: any) => {
    const requested = String(item?.session_type || "").trim().toLowerCase();
    if (!requested) return true;

    const match = String(row?.reason || "").match(/session_type:(rehearsal|recording|both)/i);
    const scheduleSession = match ? match[1].toLowerCase() : "both";
    return scheduleSession === "both" || scheduleSession === requested;
  };

  const fetchRelocationSlotOptions = async (
    item: any,
    limit = 72,
  ): Promise<RelocationSlotOption[]> => {
    if (!item?.studio_id) return [];

    const durationMinutes = getRelocationDurationMinutes(item);
    if (durationMinutes <= 0) return [];

    const today = getRelocationLocalDateKey();
    const { data: settings, error: settingsError } = await supabase
      .from("studio_settings")
      .select("lead_time_hours, booking_horizon_days, slot_increment_minutes")
      .eq("studio_id", item.studio_id)
      .maybeSingle();

    if (settingsError) throw settingsError;

    const horizonDays = Math.min(
      Math.max(Number(settings?.booking_horizon_days) || 30, 1),
      90,
    );
    const incrementMinutes = Math.max(
      Number(settings?.slot_increment_minutes) || 30,
      15,
    );
    const minStartTime = new Date(
      Date.now() + (Number(settings?.lead_time_hours) || 0) * 60 * 60 * 1000,
    );
    const maxDate = getRelocationLocalDateKey(addRelocationDays(new Date(), horizonDays - 1));

    const [hoursResult, overridesResult] = await Promise.all([
      supabase
        .from("studio_operating_hours")
        .select("day_of_week, is_open, open_time, close_time, slot_order, reason")
        .eq("studio_id", item.studio_id)
        .order("day_of_week", { ascending: true })
        .order("slot_order", { ascending: true }),
      supabase
        .from("studio_date_overrides")
        .select("override_date, is_open, open_time, close_time, slot_order, reason")
        .eq("studio_id", item.studio_id)
        .gte("override_date", today)
        .lte("override_date", maxDate)
        .order("override_date", { ascending: true })
        .order("slot_order", { ascending: true }),
    ]);

    if (hoursResult.error) throw hoursResult.error;
    if (overridesResult.error) throw overridesResult.error;

    const operatingByDay = new Map<number, any[]>();
    (hoursResult.data || []).forEach((row: any) => {
      if (!row?.is_open || !row?.open_time || !row?.close_time) return;
      if (!relocationScheduleAllowsSession(row, item)) return;
      const day = Number(row.day_of_week);
      if (!operatingByDay.has(day)) operatingByDay.set(day, []);
      operatingByDay.get(day)?.push(row);
    });

    const overridesByDate = new Map<string, any[]>();
    (overridesResult.data || []).forEach((row: any) => {
      if (!overridesByDate.has(row.override_date)) overridesByDate.set(row.override_date, []);
      overridesByDate.get(row.override_date)?.push(row);
    });

    const candidateSlots: RelocationSlotOption[] = [];
    const seenCandidates = new Set<string>();
    const addCandidate = (slot: RelocationSlotOption) => {
      const key = relocationSlotKey(slot);
      if (seenCandidates.has(key)) return;
      seenCandidates.add(key);
      candidateSlots.push(slot);
    };

    const proposedSlot = getRelocationSlotFromItem(item);
    if (proposedSlot) addCandidate(proposedSlot);

    for (let offset = 0; offset < horizonDays; offset += 1) {
      const date = addRelocationDays(new Date(), offset);
      const dateStr = getRelocationLocalDateKey(date);
      const overridesForDate = overridesByDate.get(dateStr);
      const scheduleRows = overridesForDate
        ? overridesForDate
            .filter((row) => row?.is_open && row?.open_time && row?.close_time)
            .filter((row) => relocationScheduleAllowsSession(row, item))
        : operatingByDay.get(date.getDay()) || [];

      for (const row of scheduleRows) {
        const windowStart = toRelocationMinutes(row.open_time);
        const windowEnd = toRelocationMinutes(row.close_time);
        if (windowStart === null || windowEnd === null || windowEnd <= windowStart) {
          continue;
        }

        for (
          let start = windowStart;
          start + durationMinutes <= windowEnd;
          start += incrementMinutes
        ) {
          const startTime = toRelocationTimeString(start);
          const endTime = toRelocationTimeString(start + durationMinutes);
          const startDateTime = new Date(`${dateStr}T${startTime}`);

          if (startDateTime < minStartTime) continue;

          addCandidate({
            date: dateStr,
            start_time: startTime,
            end_time: endTime,
          });
        }
      }
    }

    const availableSlots: RelocationSlotOption[] = [];
    for (let index = 0; index < candidateSlots.length && availableSlots.length < limit; index += 8) {
      const chunk = candidateSlots.slice(index, index + 8);
      const checkedChunk = await Promise.all(
        chunk.map(async (slot) => {
          let { data: isAvailable, error } = await supabase.rpc("are_slots_available", {
            p_studio_id: item.studio_id,
            p_booking_date: slot.date,
            p_time_slots: [{ start: slot.start_time, end: slot.end_time }],
            p_user_id: userId,
            p_exclude_booking_id: item.id,
          });

          if (error?.code === "PGRST202") {
            const fallback = await supabase.rpc("is_slot_available", {
              p_studio_id: item.studio_id,
              p_booking_date: slot.date,
              p_start_time: slot.start_time,
              p_end_time: slot.end_time,
              p_user_id: userId,
            });
            isAvailable = fallback.data;
            error = fallback.error;
          }

          if (error) throw error;
          return isAvailable ? slot : null;
        }),
      );

      checkedChunk.forEach((slot) => {
        if (slot && availableSlots.length < limit) {
          availableSlots.push(slot);
        }
      });
    }

    return availableSlots;
  };

  const openRelocationSlotPicker = async (item: any) => {
    if (!item?.id) return;

    setRelocationSlotPickerItem(item);
    setRelocationSlotPickerVisible(true);
    setRelocationSlotOptions([]);
    setRelocationSlotError(null);
    setRelocationSlotCalendarDate(getSelectedRelocationSlot(item)?.date || "");
    setRelocationSlotLoading(true);

    try {
      const options = await fetchRelocationSlotOptions(item);
      setRelocationSlotOptions(options);
      const selectedSlot = getSelectedRelocationSlot(item);
      const availableDates = Array.from(new Set(options.map((slot) => slot.date))).sort();
      setRelocationSlotCalendarDate((prev) =>
        prev && availableDates.includes(prev)
          ? prev
          : selectedSlot?.date && availableDates.includes(selectedSlot.date)
            ? selectedSlot.date
            : availableDates[0] || "",
      );

      if (!preferredRelocationSlots[item.id] && options[0]) {
        setPreferredRelocationSlots((prev) => ({
          ...prev,
          [item.id]: options[0],
        }));
      }
    } catch (error: any) {
      setRelocationSlotError(
        error?.message || "Could not load available relocation slots.",
      );
    } finally {
      setRelocationSlotLoading(false);
    }
  };

  const isMissingRelocationRpcError = (error: any) => {
    const message = String(error?.message || error?.details || "").toLowerCase();
    return (
      error?.code === "PGRST202" ||
      (message.includes("respond_to_studio_booking_relocation") &&
        (message.includes("not found") || message.includes("could not find")))
    );
  };

  const applyRelocationDecisionClientFallback = async (
    item: any,
    accepted: boolean,
    latestBooking: any,
    targetSlot: RelocationSlotOption | null,
    isPaidRelocation: boolean,
  ) => {
    if (accepted) {
      if (!targetSlot) {
        throw new Error("Choose an available date and time first.");
      }

      let { data: isAvailable, error: availabilityError } = await supabase.rpc(
        "are_slots_available",
        {
          p_studio_id: item.studio_id,
          p_booking_date: targetSlot.date,
          p_time_slots: [{ start: targetSlot.start_time, end: targetSlot.end_time }],
          p_user_id: userId,
          p_exclude_booking_id: item.id,
        },
      );

      if (availabilityError?.code === "PGRST202") {
        const fallbackAvailability = await supabase.rpc("is_slot_available", {
          p_studio_id: item.studio_id,
          p_booking_date: targetSlot.date,
          p_start_time: targetSlot.start_time,
          p_end_time: targetSlot.end_time,
          p_user_id: userId,
        });
        isAvailable = fallbackAvailability.data;
        availabilityError = fallbackAvailability.error;
      }

      if (availabilityError) throw availabilityError;
      if (!isAvailable) {
        throw new Error("Selected relocation slot is no longer available.");
      }

      const { error: acceptError } = await supabase
        .from("studio_bookings")
        .update({
          status: "confirmed",
          booking_date: targetSlot.date,
          start_time: targetSlot.start_time,
          end_time: targetSlot.end_time,
          relocation_requested_at: null,
          relocation_expires_at: null,
          relocation_proposed_date: null,
          relocation_proposed_start_time: null,
          relocation_proposed_end_time: null,
          notes:
            (item.notes || "") +
            "\nRelocation confirmed by musician. Original booking price and payment details preserved.",
        })
        .eq("id", item.id)
        .eq("user_id", userId);

      if (acceptError) throw acceptError;

      const { error: clearSlotsError } = await supabase
        .from("studio_booking_slots")
        .delete()
        .eq("booking_id", item.id);

      if (!clearSlotsError) {
        const { error: insertSlotError } = await supabase
          .from("studio_booking_slots")
          .insert({
            booking_id: item.id,
            start_time: targetSlot.start_time,
            end_time: targetSlot.end_time,
            sort_order: 0,
          });

        if (insertSlotError) {
          console.warn("Relocation slot sync fallback insert failed", insertSlotError);
        }
      } else {
        console.warn("Relocation slot sync fallback delete failed", clearSlotsError);
      }

      await supabase
        .from("booking_holds")
        .delete()
        .eq("studio_id", item.studio_id)
        .eq("user_id", userId)
        .eq("booking_date", targetSlot.date)
        .eq("start_time", targetSlot.start_time)
        .eq("end_time", targetSlot.end_time);

      if (item.studio_owner_id) {
        await supabase.from("notifications").insert({
          user_id: item.studio_owner_id,
          type: "success",
          title: "Relocation Accepted",
          message: `The musician confirmed a new schedule for ${item.name}.`,
          meta: buildNotificationRouteMeta("/bookings", undefined, {
            bookingId: item.id,
            studioId: item.studio_id,
            event_type: "relocation_accepted",
            selected_date: targetSlot.date,
            selected_start_time: targetSlot.start_time,
            selected_end_time: targetSlot.end_time,
          }),
        });
      }

      return { success: true, status: "confirmed" };
    }

    if (isPaidRelocation) {
      const { data: cancelData, error: cancelError } =
        await supabase.functions.invoke("manage-bookings", {
          body: {
            action: "update_status",
            booking_id: item.id,
            new_status: "cancelled",
            type_id: "studio_booking",
            cancellation_reason:
              "Musician cancelled after an owner-requested schedule move. No musician completion-rate penalty.",
            userId,
          },
        });

      if (cancelError || cancelData?.error) {
        throw cancelError || new Error(cancelData?.error || "Could not cancel relocation request.");
      }

      if (
        latestBooking.relocation_proposed_date &&
        latestBooking.relocation_proposed_start_time &&
        latestBooking.relocation_proposed_end_time
      ) {
        await supabase
          .from("booking_holds")
          .delete()
          .eq("studio_id", item.studio_id)
          .eq("user_id", userId)
          .eq("booking_date", latestBooking.relocation_proposed_date)
          .eq("start_time", latestBooking.relocation_proposed_start_time)
          .eq("end_time", latestBooking.relocation_proposed_end_time);
      }

      return {
        success: true,
        status: "cancelled",
        payment_status: cancelData?.payment_status,
        refund_amount: Number(
          cancelData?.refund_amount || cancelData?.refund_result?.refund_amount || 0,
        ),
      };
    }

    const { error: declineError } = await supabase
      .from("studio_bookings")
      .update({
        status: "cancelled",
        payment_status: isPaidRelocation
          ? "refund_pending"
          : latestBooking.payment_status,
        cancellation_reason:
          "Musician cancelled after an owner-requested schedule move. No musician completion-rate penalty.",
        relocation_requested_at: null,
        relocation_expires_at: null,
        relocation_proposed_date: null,
        relocation_proposed_start_time: null,
        relocation_proposed_end_time: null,
      })
      .eq("id", item.id)
      .eq("user_id", userId);

    if (declineError) throw declineError;

    if (
      latestBooking.relocation_proposed_date &&
      latestBooking.relocation_proposed_start_time &&
      latestBooking.relocation_proposed_end_time
    ) {
      await supabase
        .from("booking_holds")
        .delete()
        .eq("studio_id", item.studio_id)
        .eq("user_id", userId)
        .eq("booking_date", latestBooking.relocation_proposed_date)
        .eq("start_time", latestBooking.relocation_proposed_start_time)
        .eq("end_time", latestBooking.relocation_proposed_end_time);
    }

    if (item.studio_owner_id) {
      await supabase.from("notifications").insert({
        user_id: item.studio_owner_id,
        type: "warning",
        title: "Relocation Declined",
        message: isPaidRelocation
          ? `The musician declined your relocation request for ${item.name}. Booking was cancelled and refund processing has started.`
          : `The musician declined your relocation request for ${item.name}. Booking was cancelled.`,
        meta: buildNotificationRouteMeta("/bookings", undefined, {
          bookingId: item.id,
          studioId: item.studio_id,
          event_type: "relocation_declined",
        }),
      });
    }

    return { success: true, status: "cancelled" };
  };

  const handleRelocationDecision = async (
    item: any,
    accepted: boolean,
    selectedSlot?: RelocationSlotOption | null,
  ) => {
    if (!userId || !item?.id) return;

    try {
      startActionLoading(item.id, accepted ? "Accepting move" : "Declining move");
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
        Alert.alert(
          "Warning",
          "This relocation request is no longer pending.",
        );
        await fetchBookings(userId);
        return;
      }

      if (
        latestBooking.relocation_expires_at &&
        new Date(latestBooking.relocation_expires_at) <= new Date()
      ) {
        Alert.alert(
          "Warning",
          "This relocation request has expired and will be auto-processed shortly.",
        );
        await fetchBookings(userId);
        return;
      }

      const isPaidRelocation =
        latestBooking.payment_status === "paid" ||
        latestBooking.payment_status === "partial";

      const latestProposedSlot =
        latestBooking.relocation_proposed_date &&
        latestBooking.relocation_proposed_start_time &&
        latestBooking.relocation_proposed_end_time
          ? {
              date: latestBooking.relocation_proposed_date,
              start_time: normalizeRelocationTime(latestBooking.relocation_proposed_start_time),
              end_time: normalizeRelocationTime(latestBooking.relocation_proposed_end_time),
            }
          : null;
      const targetSlot =
        accepted ? selectedSlot || getSelectedRelocationSlot(item) || latestProposedSlot : null;

      if (accepted && !targetSlot) {
        throw new Error("Choose an available date and time first.");
      }

      const { data: rpcRelocationResult, error: relocationError } = await supabase.rpc(
        "respond_to_studio_booking_relocation",
        {
          p_booking_id: item.id,
          p_accept: accepted,
          p_preferred_date: targetSlot?.date || null,
          p_preferred_start_time: targetSlot?.start_time || null,
          p_preferred_end_time: targetSlot?.end_time || null,
        },
      );

      const relocationResult =
        relocationError && isMissingRelocationRpcError(relocationError)
          ? await applyRelocationDecisionClientFallback(
              item,
              accepted,
              latestBooking,
              targetSlot,
              isPaidRelocation,
            )
          : rpcRelocationResult;

      if (relocationError && !isMissingRelocationRpcError(relocationError)) {
        throw relocationError;
      }

      if (!relocationResult?.success) {
        throw new Error(
          relocationResult?.error || "Could not process relocation response.",
        );
      }

      setPreferredRelocationSlots((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });

      const relocationRefundAmount = Number(
        relocationResult?.refund_amount || relocationResult?.refund_result?.refund_amount || 0,
      );
      const relocationWasRefunded =
        relocationRefundAmount > 0 ||
        String(relocationResult?.payment_status || "").toLowerCase() === "refunded";

      Alert.alert(
        accepted ? "Success" : "Info",
        accepted
          ? "Your preferred schedule has been confirmed. The original price and payment details stayed the same."
          : relocationWasRefunded
            ? relocationRefundAmount > 0
              ? `You cancelled the owner-requested move. ${formatPesoAmount(relocationRefundAmount)} was credited to your wallet and this will not affect your completion rate.`
              : "You cancelled the owner-requested move. Your paid amount was credited to your wallet and this will not affect your completion rate."
          : isPaidRelocation
            ? "You cancelled the owner-requested move. Refund processing has started and this will not affect your completion rate."
            : "You cancelled the owner-requested move. This will not affect your completion rate.",
      );

      await fetchBookings(userId);
    } catch (error: any) {
      Alert.alert(
        "Error",
        error?.message || "Could not process relocation response.",
      );
    } finally {
      setLoading(false);
      clearActionLoading(item.id);
    }
  };

  const promptConfirmRelocationSlot = (
    item: any,
    selectedSlot: RelocationSlotOption | null,
  ) => {
    if (!item || !selectedSlot) return;

    showAlert(
      "warning",
      "Confirm Time",
      `Confirm ${formatRelocationSlotLabel(selectedSlot)}? The original price and payment details will stay the same.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            setRelocationSlotPickerVisible(false);
            handleRelocationDecision(item, true, selectedSlot);
          },
        },
      ],
    );
  };

  // Leave Review handler with proper params
  const handleLeaveReview = (item: any) => {
    if (isReadOnlyBookingItem(item)) {
      showReadOnlyBookingAlert();
      return;
    }

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
    const gigBaseName = typeof item.name === "string" ? item.name.split(" - ")[0] : "Gig";

    const params: any = {
      bookingId: item.id,
      bookingType: item.type_id,
      reviewerRole,
      returnTab: activeTab === "Review" ? "History" : activeTab,
    };

    if (item.type_id === "studio_booking") {
      if (isOwner) {
        // Owner reviews the musician (user)
        params.targetUserId = item.user_id;
        params.entityName = item.customer_name || "Musician";
      } else {
        // Musician reviews the studio
        params.studioId = item.studio_id;
        params.entityName = item.name || "Studio";
      }
    } else if (item.type_id === "gig_application") {
      if (isOrganizer) {
        // Gig owner reviews the actual performer target:
        // group/duo applications -> review group, solo applications -> review user.
        if (item.group_id) {
          params.groupId = item.group_id;
          params.entityName = item.performer || item.customer_name || "Group";
        } else {
          params.targetUserId = item.applicant_id;
          params.entityName = item.customer_name || item.performer || "Musician";
        }
      } else {
        // Musician reviews the gig
        params.gigId = item.gig_id;
        params.entityName = gigBaseName;
      }
    }

    router.push({
      pathname: "/submit_review",
      params,
    } as any);
  };

  // Show payment option modal before paying
  const showPaymentOptions = (item: any) => {
    setPaymentItem(item);

    if (isBookingPaymentSettled(item)) {
      Alert.alert("Already Paid", "This booking is already fully paid.");
      return;
    }

    if (isBalancePaymentProcessing(item)) {
      Alert.alert(
        "Payment Processing",
        "We are still confirming your remaining balance payment. Please refresh in a moment.",
      );
      return;
    }

    // Check if user already paid a downpayment - if so, they should only pay remaining balance
    const hasDownpaymentPaid = canPayRemainingBalance(item);

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
      startActionLoading(item.id, "Preparing payment");
      setLoading(true);
      const bookingIds = getBookingIdsForPaymentItem(item);
      const primaryBookingId = bookingIds[0] || item.id;
      const bookingCount = bookingIds.length || 1;
      const totalAmount = getPaymentItemTotalAmount(item);
      const payAmount =
        paymentType === "downpayment"
          ? Math.round(totalAmount / 2)
          : totalAmount;
      const remainingBalance =
        paymentType === "downpayment" ? Math.round(totalAmount / 2) : 0;

      debugLog(
        "?? Initiating payment for booking:",
        item.id,
        "Type:",
        paymentType,
        "Amount:",
        payAmount,
      );

      // Generate environment-aware redirect URL
      const redirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "success", booking_id: primaryBookingId },
      });
      const cancelRedirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "cancelled", booking_id: primaryBookingId },
      });

      // Use local PayMongo service instead of edge function
      const result = await createBookingCheckout({
        bookingId: primaryBookingId,
        bookingIds,
        userId,
        amount: payAmount,
        totalAmount,
        paymentType,
        remainingBalance,
        studioName: item.name,
        bookingDate: item.raw_date,
        description:
          paymentType === "downpayment"
            ? `Downpayment (50%) for ${bookingCount > 1 ? `${bookingCount} studio bookings` : `studio booking at ${item.name}`}`
            : `${bookingCount > 1 ? `${bookingCount} studio bookings` : `Studio booking at ${item.name}`}`,
        redirectUrl,
        cancelRedirectUrl,
      });

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to create payment session.");
        return;
      }

      if (result.checkout_url) {
        debugLog("? Opening checkout URL:", result.checkout_url);
        const canOpen = await Linking.canOpenURL(result.checkout_url);
        if (canOpen) {
          paymentInProgressRef.current = true;
          pendingPaymentBookingId.current = primaryBookingId;
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
      clearActionLoading(item.id);
    }
  };

  // Pay Remaining Balance Handler
  const handlePayBalance = async (item: any) => {
    if (!item || !userId || !item.remaining_balance) return;

    if (!canPayRemainingBalance(item)) {
      if (isBalancePaymentProcessing(item)) {
        Alert.alert(
          "Payment Processing",
          "We are still confirming your remaining balance payment. Please refresh in a moment.",
        );
      }
      return;
    }

    try {
      startActionLoading(item.id, "Preparing payment");
      setLoading(true);
      const bookingIds = getBookingIdsForPaymentItem(item);
      const primaryBookingId = bookingIds[0] || item.id;
      const bookingCount = bookingIds.length || 1;
      const dueAmount = getPaymentItemDueAmount(item);
      debugLog(
        "?? Paying remaining balance for booking:",
        primaryBookingId,
        "Amount:",
        dueAmount,
      );

      // Generate environment-aware redirect URL
      const redirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "success", booking_id: primaryBookingId },
      });
      const cancelRedirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "cancelled", booking_id: primaryBookingId },
      });

      // Use local PayMongo service instead of edge function
      const result = await createBookingCheckout({
        bookingId: primaryBookingId,
        bookingIds,
        userId,
        amount: dueAmount,
        totalAmount: getPaymentItemTotalAmount(item),
        paymentType: "balance",
        remainingBalance: 0,
        studioName: item.name,
        bookingDate: item.raw_date,
        description: `Remaining balance payment for ${bookingCount > 1 ? `${bookingCount} studio bookings` : `studio booking at ${item.name}`}`,
        redirectUrl,
        cancelRedirectUrl,
      });

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to create payment session.");
        return;
      }

      if (result.checkout_url) {
        debugLog("? Opening checkout URL:", result.checkout_url);
        const canOpen = await Linking.canOpenURL(result.checkout_url);
        if (canOpen) {
          paymentInProgressRef.current = true;
          pendingPaymentBookingId.current = primaryBookingId;
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
      clearActionLoading(item.id);
    }
  };

  // Clear Remaining Balance Handler (F2F Payment)
  const handleClearBalance = (item: any) => {
    setSelectedItem(item);
    setModalMode("clear_balance");
    setModalVisible(true);
  };

  // Process Clear Balance (called from modal confirm)
  const processClearBalance = async () => {
    if (!selectedItem || !userId) return;

    try {
      startActionLoading(selectedItem.id, "Clearing balance");
      setLoading(true);
      const bookingId = selectedItem.id;
      const balanceAmount = selectedItem.remaining_balance;

      debugLog(
        "?? Clearing remaining balance for booking:",
        bookingId,
        "Amount:",
        balanceAmount,
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Please sign in again to clear this balance.");
      }

      const { data, error } = await supabase.functions.invoke("manage-bookings", {
        body: {
          action: "clear_balance",
          booking_id: bookingId,
          owner_id: userId,
          amount: balanceAmount,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        let message = error.message || "Failed to clear balance";
        const context = (error as any)?.context;
        if (context && typeof context.json === "function") {
          try {
            const body = await context.json();
            message = body?.error || body?.message || message;
          } catch {
            // Keep the client error message when the response body is unavailable.
          }
        }
        throw new Error(message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const clearedAmount = data?.amount || balanceAmount;
      debugLog(`Balance cleared: ${clearedAmount} for booking ${bookingId}`);
      Alert.alert(
        "Balance Cleared",
        `₱${clearedAmount?.toLocaleString()} has been marked as paid and credited to your wallet.`,
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
      clearActionLoading(selectedItem?.id);
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

      if (data?.payment_status === "paid" || data?.payment_status === "partial") {
        Alert.alert(
          "Success",
          data?.payment_status === "partial"
            ? "Downpayment confirmed. Your booking is now in Upcoming with a remaining balance due."
            : "Payment confirmed! Your booking is now in Upcoming.",
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
      debugLog("?? Scanning QR code:", {
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

      debugLog("?? Check-in response:", response);
      debugLog("?? Check-in error:", error);

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

  const getItemSortTimestamp = (item: any) => {
    const dateTimeCandidate =
      item?.raw_date && item?.start_time
        ? `${item.raw_date}T${item.start_time}`
        : null;

    const candidates = [
      item?.updated_at,
      item?.created_at,
      item?.paid_at,
      dateTimeCandidate,
      item?.raw_date,
      item?.date,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const timestamp = new Date(candidate).getTime();
      if (!Number.isNaN(timestamp)) return timestamp;
    }

    return 0;
  };

  // Determine items to show based on view mode without rebuilding the list during the tab press.
  const currentItems = React.useMemo(
    () =>
      userRole === "musician" && viewMode === "applications"
        ? applicationData[deferredActiveAppTab as keyof typeof applicationData] || []
        : deferredActiveTab === "Active Musicians"
          ? dynamicBookingsData.ActiveMusicians
          : dynamicBookingsData[deferredActiveTab as keyof typeof dynamicBookingsData] || [],
    [applicationData, deferredActiveAppTab, deferredActiveTab, dynamicBookingsData, userRole, viewMode],
  );

  useEffect(() => {
    if (!isAuthenticated || isGuest) return;
    if (!shouldRunDynamicBookingsClock) return;

    setCurrentTime(new Date());
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, BOOKINGS_DYNAMIC_CLOCK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAuthenticated, isGuest, shouldRunDynamicBookingsClock]);

  const activeListLabel =
    userRole === "musician" && viewMode === "applications"
      ? deferredActiveAppTab
      : deferredActiveTab;
  const isHistoryTabView = renderActiveTab === "History";
  const bookingTabs = React.useMemo(
    () =>
      userRole === "venue-owner"
        ? [
            { key: "Applicants" as Tab, label: "Pending", testID: "mobile-bookings-tab-pending-applicants" },
            { key: "Active Musicians" as Tab, label: "Active", testID: "mobile-bookings-tab-active-musicians" },
            { key: "Review" as Tab, label: "Review", testID: "mobile-bookings-tab-review" },
            { key: "History" as Tab, label: "History", testID: "mobile-bookings-tab-history" },
          ]
        : (["Pending", "Upcoming", "Ongoing", "Review", "History"] as Tab[]).map((tab) => ({
            key: tab,
            label: tab,
            testID: `mobile-bookings-tab-${normalizeBookingTestId(tab)}`,
          })),
    [userRole],
  );
  const sortedCurrentItems = React.useMemo(
    () =>
      [...currentItems].sort(
        (a: any, b: any) => getItemSortTimestamp(b) - getItemSortTimestamp(a),
      ),
    [currentItems],
  );

  const sortedCurrentItemMeta = React.useMemo(
    () =>
      sortedCurrentItems.map((item: any) => ({
        filterLabel: getActivityItemFilterLabel(item),
        item,
        searchText: buildActivityItemSearchText(item),
      })),
    [sortedCurrentItems],
  );

  const availableFilters = React.useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(
          sortedCurrentItemMeta
            .map((meta) => meta.filterLabel)
            .filter(Boolean),
        ),
      ),
    ],
    [sortedCurrentItemMeta],
  );

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const hasSearchOrFilter =
    normalizedSearchQuery.length > 0 || deferredActiveFilter !== "All";

  const filteredItems = React.useMemo(
    () =>
      sortedCurrentItemMeta
        .filter((meta) => {
          const matchesFilter =
            deferredActiveFilter === "All" || meta.filterLabel === deferredActiveFilter;

          if (!matchesFilter) return false;
          if (!normalizedSearchQuery) return true;

          return meta.searchText.includes(normalizedSearchQuery);
        })
        .map((meta) => meta.item),
    [sortedCurrentItemMeta, deferredActiveFilter, normalizedSearchQuery],
  );
  const hasLoadedActivitySnapshot = Boolean(userId && bookingsScreenCache.has(userId));
  const isInitialActivityLoading =
    (loading || bookingsSummaryQuery.isLoading || (bookingsSummaryQuery.isFetching && !hasLoadedActivitySnapshot)) &&
    currentItems.length === 0 &&
    !hasSearchOrFilter;
  const bookingListData = React.useMemo(
    () =>
      isInitialActivityLoading || filteredItems.length === 0
        ? EMPTY_ACTIVITY_ITEMS
        : filteredItems.map((booking, index) => ({
            kind: "booking" as const,
            booking,
            index,
          })),
    [filteredItems, isInitialActivityLoading],
  );
  const bookingKeyExtractor = useCallback((item: any, index: number) => {
    const booking = item?.booking ?? item;
    const id =
      booking?.id ??
      booking?.booking_id ??
      booking?.bookingId ??
      booking?.request_id ??
      booking?.application_id ??
      booking?.type_id ??
      index;

    return `booking:${renderActiveTab}:${booking?.status ?? booking?.raw_status ?? "unknown"}:${id}`;
  }, [renderActiveTab]);

  useEffect(() => {
    if (activeFilter !== "All" && !availableFilters.includes(activeFilter)) {
      setActiveFilter("All");
    }
  }, [activeFilter, availableFilters]);

  const shouldHideNavbar =
    isBottomOverlayActive ||
    modalVisible ||
    showPaymentOptionModal ||
    showScanModal;
  const isActivityFilterActive = activeFilter !== "All";
  const shouldShowActivityFilters = showActivityFilters;
  const renderActionLoadingIndicator = (item: any, fallbackMessage = "Updating") => {
    if (!isActionLoadingFor(item)) return null;

    return (
      <View style={styles.actionLoadingRow}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.actionLoadingText, { color: colors.textSecondary }]}>
          {actionLoading?.message || fallbackMessage}...
        </Text>
      </View>
    );
  };

  const inferApplicationKind = (item: any): "solo" | "duo" | "group" => {
    const candidates = [
      item?.performer,
      item?.type,
      item?.application_type,
      item?.slot_type,
      item?.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (candidates.includes("duo")) return "duo";
    if (candidates.includes("group") || candidates.includes("band")) return "group";
    if (candidates.includes("solo") || candidates.includes("individual")) return "solo";
    if (item?.group_id) return "group";
    return "solo";
  };

  const getApplicationDisplayLabel = (item: any): string => {
    const kind = inferApplicationKind(item);
    if (kind === "duo") return "Duo";
    if (kind === "group") return "Group";
    return "Solo Artist";
  };

  const bookingsControlsHeader = React.useMemo(() => (
    <View style={styles.activityListHeaderControls}>
      <View style={styles.tabContainer}>
        <SlidingTabBar
          activeColor={colors.primary}
          activeKey={activeTab}
          backgroundColor={colors.background}
          borderColor={colors.border}
          deferOnChange
          inactiveColor={colors.textSecondary}
          indicatorColor={colors.primary}
          indicatorWidthRatio={0.34}
          onChange={handleBookingTabChange}
          style={styles.animatedTabs}
          tabStyle={styles.animatedTab}
          tabs={bookingTabs}
          textStyle={styles.animatedTabText}
        />
      </View>

      <View style={styles.searchFilterContainer}>
        <View style={styles.searchFilterRow}>
          <View
            style={[
              styles.searchInputContainer,
              {
                backgroundColor: isDark ? "#374151" : "#F3F4F6",
              },
            ]}
          >
            <Ionicons
              name="search"
              size={moderateScale(20)}
              color={colors.textSecondary}
            />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={`Search ${String(activeListLabel).toLowerCase()}`}
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.text }]}
              testID="mobile-bookings-search-input"
              accessibilityLabel="mobile-bookings-search-input"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons
                  name="close-circle"
                  size={moderateScale(17)}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowActivityFilters((value) => !value)}
            style={[
              styles.activityFilterButton,
              {
                backgroundColor:
                  showActivityFilters || isActivityFilterActive
                    ? colors.primary
                    : isDark
                      ? "#374151"
                      : "#F3F4F6",
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show activity filters"
            testID="mobile-bookings-filter-toggle"
          >
            <Ionicons
              name="options-outline"
              size={moderateScale(20)}
              color={
                showActivityFilters || isActivityFilterActive
                  ? "#FFFFFF"
                  : colors.textSecondary
              }
            />
            {isActivityFilterActive ? (
              <View style={styles.activityFilterBadge}>
                <Text style={styles.activityFilterBadgeText}>1</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {shouldShowActivityFilters ? (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.filterScrollView}
            contentContainerStyle={styles.filterScrollContent}
          >
            {availableFilters.map((filterLabel) => {
              const isActiveFilter = activeFilter === filterLabel;

              return (
                <TouchableOpacity
                  activeOpacity={1}
                  key={filterLabel}
                  testID={`mobile-bookings-filter-${normalizeBookingTestId(filterLabel)}`}
                  accessibilityLabel={`mobile-bookings-filter-${normalizeBookingTestId(filterLabel)}`}
                  onPress={() => {
                    setActiveFilter(filterLabel);
                    if (filterLabel === "All") {
                      setShowActivityFilters(false);
                    }
                  }}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isActiveFilter
                        ? colors.primary
                        : isDark
                          ? "#374151"
                          : "#F3F4F6",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: isActiveFilter
                          ? "#FFFFFF"
                          : isDark
                            ? "#D1D5DB"
                            : "#4B5563",
                      },
                    ]}
                  >
                    {filterLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
    </View>
  ), [
    activeFilter,
    activeListLabel,
    activeTab,
    availableFilters,
    bookingTabs,
    colors.background,
    colors.border,
    colors.primary,
    colors.text,
    colors.textSecondary,
    handleBookingTabChange,
    isActivityFilterActive,
    isDark,
    searchQuery,
    shouldShowActivityFilters,
    showActivityFilters,
  ]);

  if (!authLoading && (isGuest || !isAuthenticated)) {
    return (
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="My Activity" />
        <GuestSignInGate message="Sign in to view your bookings and activity." />
        <Navbar />
      </View>
    );
  }

  return (
    <>
      <View
        style={[styles.flex1, { backgroundColor: colors.background }]}
        testID="mobile-bookings-page"
        accessibilityLabel="mobile-bookings-page"
      >
        <Header title="My Activity" />

        <FlatList
          data={bookingListData}
          style={styles.activityList}
          keyExtractor={bookingKeyExtractor}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {bookingsControlsHeader}
              {!loading &&
              ((userRole === "studio-owner" && renderActiveTab === "Pending") ||
                (userRole === "venue-owner" && renderActiveTab === "Applicants")) &&
              pendingPermitStudios.length > 0 ? (
                <View style={styles.permitReviewList}>
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
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
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
                                {listingType === "gig" ? "Gig Listing Permit" : "Studio Listing Permit"}
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
                              borderColor: colors.border, 
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
                                : "Pending review"}
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
                                {permitDeleting === listing.id ? (
                                  <ActivityIndicator size="small" color="#DC2626" />
                                ) : null}
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
              ) : null}
            </>
          }
          ListEmptyComponent={
            isInitialActivityLoading ? (
              <View style={styles.bookingsSkeletonContainer}>
                <Skeleton width="58%" height={18} style={{ marginBottom: 12 }} />
                {[0, 1, 2].map((index) => (
                  <View
                    key={`booking-skeleton-${index}`}
                    style={[
                      styles.bookingsSkeletonCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Skeleton width="100%" height={160} borderRadius={12} />
                    <Skeleton width="72%" height={20} style={{ marginTop: 12 }} />
                    <Skeleton width="52%" height={14} style={{ marginTop: 8 }} />
                    <Skeleton width="100%" height={14} style={{ marginTop: 12 }} />
                  </View>
                ))}
              </View>
            ) : filteredItems.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons
                  name={userRole === "venue-owner" ? "people-outline" : "calendar-outline"}
                  size={48}
                  color={colors.border}
                />
                <Text
                  style={[styles.emptyTitle, { color: colors.textSecondary }]}
                >
                  {hasSearchOrFilter
                    ? "No matches found for the selected search/filter."
                    : userRole === "venue-owner"
                    ? renderActiveTab === "Applicants"
                      ? "No pending applications"
                      : renderActiveTab === "Active Musicians"
                        ? "No active musicians"
                        : renderActiveTab === "Review"
                          ? "No reviews pending"
                          : "No items"
                      : userRole === "studio-owner" && renderActiveTab === "Pending" && pendingPermitStudios.length > 0
                        ? "No pending items below"
                        : renderActiveTab === "Pending"
                          ? "No pending items"
                          : renderActiveTab === "Review"
                            ? "No reviews pending"
                          : renderActiveTab === "History"
                            ? "No history yet"
                            : isProducerActivityRole(userRole)
                              ? `No ${renderActiveTab.toLowerCase()} activity`
                              : `No ${renderActiveTab.toLowerCase()} bookings`}
                </Text>
                  {userRole === "studio-owner" && renderActiveTab === "Pending" && pendingPermitStudios.length > 0 && (
                    <Text
                      style={[styles.emptySubtitle, { color: colors.textSecondary, marginTop: 8, textAlign: "center", paddingHorizontal: 24 }]}
                    >
                      Permit review items are listed above. New pending items will appear here.
                    </Text>
                  )}
                {userRole === "venue-owner" && renderActiveTab === "Applicants" && (
                  <Text
                    style={[styles.emptySubtitle, { color: colors.textSecondary, marginTop: 8, textAlign: "center", paddingHorizontal: 24 }]}
                  >
                    New gig applications and direct connection requests will appear in Pending.
                  </Text>
                )}
              </View>
            ) : null
          }
          renderItem={({ item: row }: { item: any }) => {
              const item = row?.booking ?? row;
              // ==========================================
              // 0.75. CONNECTION REQUEST CARD
              // ==========================================
              if (item.type_id === "booking_request") {
                const canRespond = canRespondToConnectionRequest(item);
                const isRequestActionPending = requestActionId === item.id;
                const requestStatusColors = getConnectionRequestStatusColors(
                  item.raw_status || item.status,
                );
                const connectionMetaLine = [
                  item.request_slot_type
                    ? `Slot: ${formatConnectionEntityType(item.request_slot_type)}`
                    : null,
                  item.request_roster_entry_name
                    ? `Performer: ${item.request_roster_entry_name}`
                    : null,
                ]
                  .filter(Boolean)
                  .join("  |  ");

                return (
                  <TouchableOpacity
                    activeOpacity={1}
                    key={item.id}
                    testID={`mobile-bookings-booking-request-card-${item.id}`}
                    accessibilityLabel={`mobile-bookings-booking-request-card-${item.id}`}
                    onPress={() => handleDetailsPress(item)}
                    style={[
                      styles.cardContainer,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View>
                      <CachedImage
                        uri={item.image}
                        fallbackUri={REQUEST_PLACEHOLDER_IMAGE}
                        style={styles.cardImage}
                        width={BOOKING_CARD_IMAGE_WIDTH}
                        height={BOOKING_CARD_IMAGE_HEIGHT}
                        quality={72}
                        cacheVersion={item.updated_at || item.created_at || item.id}
                      />
                      <View style={[styles.typeBadge, styles.topLeftImageBadge]}>
                        <Text style={styles.typeBadgeText} numberOfLines={1}>
                          {item.type}
                        </Text>
                      </View>
                      <View style={styles.topRightBadgeStack}>
                        <View
                          style={[
                            styles.typeBadge,
                            styles.stackedImageBadge,
                            {
                              backgroundColor:
                                item.status === "Accepted"
                                  ? "rgba(16, 185, 129, 0.85)"
                                  : item.status === "Declined" || item.status === "Cancelled" || item.status === "Fired" || item.status === "Withdrawn"
                                    ? "rgba(239, 68, 68, 0.85)"
                                    : "rgba(0,0,0,0.6)",
                            },
                          ]}
                        >
                          <Text style={styles.typeBadgeText} numberOfLines={1}>
                            {item.status}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardContent}>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardTitleContainer}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: scale(8) }}>
                            <Ionicons
                              name={item.request_direction === "incoming" ? "mail-unread-outline" : "paper-plane-outline"}
                              size={moderateScale(20)}
                              color={colors.primary}
                            />
                            <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                              {item.name || item.counterparty_name || "Connection Request"}
                            </Text>
                          </View>

                          <View style={{ marginTop: moderateScale(8), gap: moderateScale(4) }}>
                            <View style={styles.cardDetailRow}>
                              <Ionicons name="albums-outline" size={14} color={colors.textSecondary} />
                              <Text style={[styles.cardDetailText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {item.type}
                              </Text>
                            </View>
                            <View style={styles.cardDetailRow}>
                              <Ionicons name="swap-horizontal-outline" size={14} color={colors.textSecondary} />
                              <Text style={[styles.cardDetailText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {item.request_context_label} {item.counterparty_name || item.name}
                              </Text>
                            </View>
                            {connectionMetaLine ? (
                              <View style={styles.cardDetailRow}>
                                <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
                                <Text style={[styles.cardDetailText, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {connectionMetaLine}
                                </Text>
                              </View>
                            ) : null}
                            <View style={styles.cardDetailRow}>
                              <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                              <Text style={[styles.cardDetailText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {formatFriendlyDateTime(item.created_at || item.raw_date)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {item.message ? (
                        <View
                          style={[
                            styles.cardSnippet,
                            {
                              backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#F9FAFB",
                              borderLeftColor: colors.primary,
                            },
                          ]}
                        >
                          <Text
                            style={[styles.cardSnippetText, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {`"${item.message}"`}
                          </Text>
                        </View>
                      ) : null}
                      {item.request_application_context ? (
                        <Text
                          style={[styles.cardDetailText, { color: colors.textSecondary, marginBottom: moderateScale(6) }]}
                          numberOfLines={1}
                        >
                          {item.request_context_title || "Application Context"}: {item.request_application_context}
                        </Text>
                      ) : null}

                      {!isHistoryTabView && (item.request_contract_url || item.request_cv_url || item.request_video_url) && (
                        <View style={styles.attachmentChipRow}>
                          {item.request_contract_url ? (
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={(e) => {
                                e.stopPropagation();
                                openConnectionRequestLink(item.request_contract_url, "Contract");
                              }}
                              style={[styles.attachmentChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                            >
                              <Text style={[styles.attachmentChipText, { color: colors.textSecondary }]}>
                                Contract
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {item.request_cv_url ? (
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={(e) => {
                                e.stopPropagation();
                                openConnectionRequestLink(item.request_cv_url, "CV");
                              }}
                              style={[styles.attachmentChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                            >
                              <Text style={[styles.attachmentChipText, { color: colors.textSecondary }]}>
                                CV
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          {item.request_video_url ? (
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={(e) => {
                                e.stopPropagation();
                                openConnectionRequestLink(item.request_video_url, "Video");
                              }}
                              style={[styles.attachmentChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                            >
                              <Text style={[styles.attachmentChipText, { color: colors.textSecondary }]}>
                                Video
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      )}

                      <View
                        style={[
                          styles.cardFooter,
                          {
                            borderColor: isDark ? colors.border : "#F3F4F6",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: moderateScale(8),
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
                          <View style={[styles.statusContainer, { flex: 1 }]}>
                            <Ionicons
                              name={
                                item.status === "Accepted"
                                  ? "checkmark-circle"
                                  : item.status === "Declined"
                                    ? "close-circle"
                                    : "time-outline"
                              }
                              size={16}
                              color={requestStatusColors.textColor}
                            />
                            <Text style={[styles.statusText, { color: requestStatusColors.textColor }]} numberOfLines={1}>
                              {item.status}
                            </Text>
                          </View>

                          {!isHistoryTabView && shouldShowMessageForItem(item) && (
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleMessagePress(item);
                              }}
                              style={[
                                styles.messageIconButton,
                                {
                                  borderColor: colors.border,
                                  backgroundColor: colors.card,
                                },
                              ]}
                            >
                              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
                            </TouchableOpacity>
                          )}
                        </View>

                        {isRequestActionPending && (
                          <View style={styles.actionLoadingRow}>
                            <ActivityIndicator size="small" color={colors.primary} />
                            <Text style={[styles.actionLoadingText, { color: colors.textSecondary }]}>
                              Updating request...
                            </Text>
                          </View>
                        )}

                        {!isHistoryTabView && (
                          <View style={[styles.actionButtonsContainer, styles.compactActionRow]}>
                            <TouchableOpacity
                              activeOpacity={1}
                              testID={bookingActionTestId(item, "view")}
                              accessibilityLabel={bookingActionTestId(item, "view")}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDetailsPress(item);
                              }}
                              style={[
                                styles.outlineButton,
                                {
                                  flex: 1,
                                  borderColor: colors.border,
                                },
                              ]}
                            >
                              <View style={styles.detailsButtonLabelContainer}>
                                <Text style={[styles.outlineButtonText, { color: colors.textSecondary }]}>
                                  View
                                </Text>
                              </View>
                            </TouchableOpacity>

                            {item.viewer_is_group_owner && isGroupMemberApplicationRequest(item) ? (
                              <TouchableOpacity
                                activeOpacity={1}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  router.push({ pathname: "/manage_group", params: { id: item.group_id } });
                                }}
                                style={[
                                  styles.outlineButton,
                                  {
                                    flex: 1,
                                    borderColor: colors.primary,
                                    backgroundColor: isDark ? `${colors.primary}1A` : `${colors.primary}10`,
                                  },
                                ]}
                              >
                                <View style={styles.detailsButtonLabelContainer}>
                                  <Text style={[styles.outlineButtonText, { color: colors.primary }]}>
                                    Manage Group
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ) : null}

                            {canRespond ? (
                              <TouchableOpacity
                                activeOpacity={1}
                                disabled={isRequestActionPending}
                                testID={bookingActionTestId(item, "decline")}
                                accessibilityLabel={bookingActionTestId(item, "decline")}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  promptConnectionRequestDecision(item, "declined");
                                }}
                                style={[
                                  styles.outlineButton,
                                  {
                                    flex: 1,
                                    borderColor: "#EF4444",
                                    backgroundColor: colors.card,
                                    opacity: isRequestActionPending ? 0.6 : 1,
                                  },
                                ]}
                              >
                                <View style={styles.detailsButtonLabelContainer}>
                                  {isRequestActionPending ? (
                                    <ActivityIndicator size="small" color="#EF4444" />
                                  ) : (
                                    <Text style={[styles.outlineButtonText, { color: "#EF4444", fontFamily: "Poppins_600SemiBold" }]}>
                                      Decline
                                    </Text>
                                  )}
                                </View>
                              </TouchableOpacity>
                            ) : null}

                          {canRespond ? (
                            <TouchableOpacity
                              activeOpacity={1}
                              disabled={isRequestActionPending}
                              testID={bookingActionTestId(item, "accept")}
                              accessibilityLabel={bookingActionTestId(item, "accept")}
                              onPress={(e) => {
                                e.stopPropagation();
                                promptConnectionRequestDecision(item, "accepted");
                              }}
                              style={[
                                styles.actionButton,
                                {
                                  flex: 1,
                                  flexDirection: "row",
                                  gap: scale(6),
                                  backgroundColor: "#10B981",
                                  opacity: isRequestActionPending ? 0.6 : 1,
                                },
                              ]}
                            >
                              {isRequestActionPending ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={[styles.actionButtonText, { color: "#fff" }]}>
                                  Accept
                                </Text>
                              )}
                            </TouchableOpacity>
                          ) : null}
                          </View>
                        )}

                        {isHistoryTabView && (
                          <View style={[styles.actionButtonsContainer, styles.compactActionRow]}>
                            <TouchableOpacity
                              activeOpacity={1}
                              testID={bookingActionTestId(item, "view-details")}
                              accessibilityLabel={bookingActionTestId(item, "view-details")}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDetailsPress(item);
                              }}
                              style={[
                                styles.outlineButton,
                                {
                                  flex: 1,
                                  borderColor: colors.border,
                                },
                              ]}
                            >
                              <View style={styles.detailsButtonLabelContainer}>
                                <Text style={[styles.outlineButtonText, { color: colors.textSecondary }]}>
                                  View Details
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }

              // ==========================================
              // 1. GIG APPLICATION CARD (Recruitment View)
              // ==========================================
              if (item.type_id === "gig_application") {
                // Determine if this is the musician's own application view
                const isMusicianView = userRole === "musician";
                const isLeaderConfirmation = !!item.leader_approval_required;
                const isReadOnlyApplication = isReadOnlyBookingItem(item);
                const gigName = item.name ? item.name.split(" - ")[0] : "Gig";
                const applicationLabel = getApplicationDisplayLabel(item);
                const applicationIcon = applicationLabel === "Solo Artist" ? "person-outline" : "people-outline";
                const applicationTypeBadge = `${applicationLabel} Application`;
                const applicationReceivedAt = formatApplicationReceivedDateTime(item);
                const applicationReceivedLabel = isMusicianView ? "Submitted" : "Received";

                return (
                  <View
                    key={item.id}
                    testID={`mobile-bookings-gig-application-card-${item.id}`}
                    accessibilityLabel={`mobile-bookings-gig-application-card-${item.id}`}
                    style={[
                      styles.cardContainer,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Banner Image */}
                    <View>
                      <CachedImage
                        uri={item.image}
                        fallbackUri={
                          "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400&h=200&fit=crop"
                        }
                        style={[
                          styles.cardImage,
                          { opacity: item.isCancelled ? 0.6 : 1 },
                        ]}
                        width={BOOKING_CARD_IMAGE_WIDTH}
                        height={BOOKING_CARD_IMAGE_HEIGHT}
                        quality={72}
                        cacheVersion={item.updated_at || item.created_at || item.id}
                      />
                      <View style={[styles.typeBadge, styles.topLeftImageBadge]}>
                        <Text style={styles.typeBadgeText} numberOfLines={1}>
                          {applicationTypeBadge}
                        </Text>
                      </View>
                      <View style={styles.topRightBadgeStack}>
                        <View
                          style={[
                            styles.typeBadge,
                            styles.stackedImageBadge,
                            {
                              backgroundColor:
                                item.status === "Accepted" ||
                                  item.status === "Happening Now" ||
                                  item.status === "Confirmed"
                                  ? "rgba(16, 185, 129, 0.85)"
                                  : item.status === "Declined" || item.status === "Cancelled" || item.status === "Fired" || item.status === "Withdrawn"
                                    ? "rgba(239, 68, 68, 0.85)"
                                    : "rgba(0,0,0,0.6)",
                            },
                          ]}
                        >
                          <Text style={styles.typeBadgeText} numberOfLines={1}>{item.status}</Text>
                        </View>
                        {item.status === "Happening Now" && (
                          <View style={[styles.liveBadge, styles.stackedImageBadge]}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>Live</Text>
                          </View>
                        )}
                      </View>
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
                                name={isMusicianView ? (applicationIcon as any) : (applicationIcon as any)}
                                size={14}
                                color={colors.primary}
                              />
                              <Text style={[styles.cardDetailText, { color: colors.textSecondary }]}>
                                {isMusicianView
                                  ? isLeaderConfirmation
                                    ? `Member submission by ${item.customer_name || "Group Member"}`
                                    : `Applied as ${applicationLabel}`
                                  : applicationLabel !== "Solo Artist"
                                    ? `${applicationLabel} applied for ${gigName}`
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

                            {/* Received / Submitted Time */}
                            {applicationReceivedAt && (
                              <View style={styles.cardDetailRow}>
                                <Ionicons
                                  name="time-outline"
                                  size={14}
                                  color={colors.textSecondary}
                                />
                                <Text
                                  style={[styles.cardDetailText, { color: colors.textSecondary }]}
                                  numberOfLines={1}
                                >
                                  {`${applicationReceivedLabel} ${applicationReceivedAt}`}
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
                                  {formatBookingCardDateTime(item.date)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Content: Pitch & Audition (for gig owners) */}
                      {!isMusicianView && (
                        <View style={{ marginBottom: moderateScale(8) }}>
                          {item.note && (
                            <View
                              style={[
                                styles.cardSnippet,
                                {
                                  backgroundColor: isDark
                                    ? "rgba(255,255,255,0.05)"
                                    : "#F9FAFB",
                                  borderLeftColor: colors.primary,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.cardSnippetText, { color: colors.text }]}
                                numberOfLines={1}
                              >
                                {`"${item.note}"`}
                              </Text>
                            </View>
                          )}

                          {!isHistoryTabView && (item.video_url || item.cv_url) ? (
                            <View style={styles.attachmentChipRow}>
                            {/* Video Link */}
                            {item.video_url && (
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => openConnectionRequestLink(item.video_url, "Audition Video")}
                                style={[
                                  styles.attachmentChip,
                                  {
                                    borderColor: isDark ? "rgba(59, 130, 246, 0.35)" : "#BFDBFE",
                                    backgroundColor: isDark
                                      ? "rgba(59, 130, 246, 0.2)"
                                      : "#EFF6FF",
                                  },
                                ]}
                              >
                                <Text
                                  style={[styles.attachmentChipText, { color: "#3B82F6" }]}
                                >
                                  Audition
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* CV Link */}
                            {item.cv_url && (
                              <TouchableOpacity activeOpacity={1}
                                onPress={() => openConnectionRequestLink(item.cv_url, "CV / Resume")}
                                style={[
                                  styles.attachmentChip,
                                  {
                                    borderColor: isDark ? "rgba(139, 92, 246, 0.35)" : "#DDD6FE",
                                    backgroundColor: isDark
                                      ? "rgba(139, 92, 246, 0.2)"
                                      : "#F3E8FF",
                                  },
                                ]}
                              >
                                <Text
                                  style={[styles.attachmentChipText, { color: "#8B5CF6" }]}
                                >
                                  CV
                                </Text>
                              </TouchableOpacity>
                            )}
                            </View>
                          ) : null}
                        </View>
                      )}

                      {!isMusicianView && renderActiveTab === "Applicants" ? (
                        <ManagerRecommendationSummary item={item} colors={colors} isDark={isDark} />
                      ) : null}

                      {/* Footer: Actions */}
                      <View
                        style={[
                          styles.cardFooter,
                          {
                            borderColor: isDark ? colors.border : "#F3F4F6",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: moderateScale(8),
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
                            ) : item.status === "Declined" || item.status === "Cancelled" || item.status === "Fired" || item.status === "Withdrawn" ? (
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
                                      : item.status === "Declined" || item.status === "Cancelled" || item.status === "Fired" || item.status === "Withdrawn"
                                        ? "#EF4444"
                                        : "#F59E0B",
                                },
                              ]}
                            >
                              {item.status}
                            </Text>
                          </View>

                          {!isHistoryTabView && shouldShowMessageForItem(item) && (
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
                        {renderActionLoadingIndicator(item)}
                        {isMusicianView && isAcceptedGigApplicationItem(item) ? (
                          <TouchableOpacity
                            activeOpacity={1}
                            testID={bookingActionTestId(item, "feature-consent")}
                            accessibilityLabel={bookingActionTestId(item, "feature-consent")}
                            onPress={() => router.push({ pathname: "/gig_feature_consent", params: { applicationId: item.id } })}
                            style={{
                              width: "100%",
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 7,
                              borderWidth: 1,
                              borderColor: colors.primary,
                              backgroundColor: colors.primary + "12",
                              padding: 10,
                              borderRadius: 100,
                            }}
                          >
                            <Ionicons name="megaphone-outline" size={16} color={colors.primary} />
                            <Text style={{ color: colors.primary, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
                              {String(item.feature_consent_status || "").toLowerCase() === "pending"
                                ? "Respond to Featuring Request"
                                : "Manage Featuring Permission"}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {isHistoryTabView && item.type_id === "gig_application" && (
                          <View
                            style={[
                              styles.actionButtonsContainer,
                              { marginTop: 0, width: "100%", flexDirection: "row", gap: moderateScale(8) },
                            ]}
                          >
                            <TouchableOpacity activeOpacity={1}
                              testID={bookingActionTestId(item, "view-details")}
                              accessibilityLabel={bookingActionTestId(item, "view-details")}
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

                          </View>
                        )}
                        {!isHistoryTabView && (
                          <View
                            style={[
                              styles.actionButtonsContainer,
                              { marginTop: 0, width: "100%", flexDirection: "column", gap: moderateScale(8) },
                            ]}
                          >
                          {isReadOnlyApplication ? (
                            <TouchableOpacity activeOpacity={1}
                              testID={bookingActionTestId(item, "view-details")}
                              accessibilityLabel={bookingActionTestId(item, "view-details")}
                              onPress={() => handleDetailsPress(item)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                borderColor: colors.border,
                                borderWidth: 1,
                                padding: 10,
                                borderRadius: 100,
                                gap: 6,
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
                          ) : renderActiveTab === "Applicants" ? (
                            userRole === "venue-owner" ? (
                              <>
                                <View style={styles.compactActionRow}>
                                  <TouchableOpacity activeOpacity={1}
                                    testID={bookingActionTestId(item, "review-applicant")}
                                    accessibilityLabel={bookingActionTestId(item, "review-applicant")}
                                    onPress={() => router.push({
                                      pathname: "/manage_gig",
                                      params: { id: item.gig_id, tab: "Applicants" },
                                    })}
                                    style={[
                                      styles.outlineButton,
                                      {
                                        flex: 1,
                                        borderColor: colors.border,
                                      },
                                    ]}
                                  >
                                    <View style={styles.detailsButtonLabelContainer}>
                                      <Text style={[styles.outlineButtonText, { color: colors.textSecondary }]}>
                                        Review
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                  <TouchableOpacity activeOpacity={1}
                                    testID={bookingActionTestId(item, "decline")}
                                    accessibilityLabel={bookingActionTestId(item, "decline")}
                                    onPress={() => handleDeclineBooking(item)}
                                    style={[
                                      styles.outlineButton,
                                      {
                                        flex: 1,
                                        borderColor: "#EF4444",
                                        backgroundColor: isDark
                                          ? "rgba(239, 68, 68, 0.2)"
                                          : "#FEF2F2",
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[styles.outlineButtonText, { color: "#EF4444", fontFamily: "Poppins_600SemiBold" }]}
                                    >
                                      Decline
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity activeOpacity={1}
                                    testID={bookingActionTestId(item, "accept")}
                                    accessibilityLabel={bookingActionTestId(item, "accept")}
                                    onPress={() => {
                                      setSelectedItem(item);
                                      setModalMode("confirm");
                                      setModalVisible(true);
                                    }}
                                    style={[
                                      styles.actionButton,
                                      {
                                        flex: 1,
                                        backgroundColor: "#10B981",
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[styles.actionButtonText, { color: "white" }]}
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
                                  testID={bookingActionTestId(item, "view")}
                                  accessibilityLabel={bookingActionTestId(item, "view")}
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
                                  testID={bookingActionTestId(item, "withdraw")}
                                  accessibilityLabel={bookingActionTestId(item, "withdraw")}
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
                          ) : (renderActiveTab === "Pending" || (viewMode === "applications" && activeAppTab === "Applied")) && isMusicianView && item.type_id === "gig_application" && !isLeaderConfirmation ? (
                            <View
                              style={{ flexDirection: "row", gap: 8, flex: 1 }}
                            >
                              <TouchableOpacity activeOpacity={1}
                                testID={bookingActionTestId(
                                  item,
                                  isGigReconfirmationItem(item) ? "decline-update" : "view",
                                )}
                                accessibilityLabel={bookingActionTestId(
                                  item,
                                  isGigReconfirmationItem(item) ? "decline-update" : "view",
                                )}
                                onPress={() => {
                                  if (isGigReconfirmationItem(item)) {
                                    handleGigReconfirmationDecision(item, false);
                                  } else {
                                    handleDetailsPress(item);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  borderColor: isGigReconfirmationItem(item) ? "#EF4444" : colors.border,
                                  borderWidth: 1,
                                  backgroundColor: isGigReconfirmationItem(item)
                                    ? isDark
                                      ? "rgba(239, 68, 68, 0.2)"
                                      : "#FEF2F2"
                                    : "transparent",
                                  padding: 10,
                                  borderRadius: 100,
                                  alignItems: "center",
                                  flexDirection: "row",
                                  justifyContent: "center",
                                  gap: 6,
                                }}
                              >
                                <Text
                                  style={{
                                    color: isGigReconfirmationItem(item) ? "#EF4444" : colors.textSecondary,
                                    fontFamily: isGigReconfirmationItem(item)
                                      ? "Poppins_600SemiBold"
                                      : "Poppins_500Medium",
                                    fontSize: 12,
                                  }}
                                >
                                  {isGigReconfirmationItem(item) ? "Decline" : "View Details"}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity activeOpacity={1}
                                testID={bookingActionTestId(
                                  item,
                                  isGigReconfirmationItem(item) ? "reconfirm" : "withdraw",
                                )}
                                accessibilityLabel={bookingActionTestId(
                                  item,
                                  isGigReconfirmationItem(item) ? "reconfirm" : "withdraw",
                                )}
                                onPress={() => {
                                  if (isGigReconfirmationItem(item)) {
                                    handleGigReconfirmationDecision(item, true);
                                  } else {
                                    setSelectedItem(item);
                                    handleCancelBooking(item.id);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  backgroundColor: isGigReconfirmationItem(item)
                                    ? "#10B981"
                                    : isDark
                                      ? "rgba(239, 68, 68, 0.2)"
                                      : "#FEF2F2",
                                  padding: 10,
                                  borderRadius: 100,
                                  alignItems: "center",
                                }}
                              >
                                <Text
                                  style={{
                                    color: isGigReconfirmationItem(item) ? "white" : "#EF4444",
                                    fontFamily: "Poppins_600SemiBold",
                                    fontSize: 12,
                                  }}
                                >
                                  {isGigReconfirmationItem(item) ? "Reconfirm" : "Withdraw"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : renderActiveTab === "Pending" && isMusicianView && isLeaderConfirmation ? (
                            <>
                              <View style={styles.compactActionRow}>
                                <TouchableOpacity activeOpacity={1}
                                  testID={bookingActionTestId(item, "view-details")}
                                  accessibilityLabel={bookingActionTestId(item, "view-details")}
                                  onPress={() => handleDetailsPress(item)}
                                  style={[
                                    styles.outlineButton,
                                    {
                                      flex: 1,
                                      borderColor: colors.border,
                                    },
                                ]}
                              >
                                  <View style={styles.detailsButtonLabelContainer}>
                                    <Text style={[styles.outlineButtonText, { color: colors.textSecondary }]}>
                                      View
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                                <TouchableOpacity activeOpacity={1}
                                  testID={bookingActionTestId(item, "reject")}
                                  accessibilityLabel={bookingActionTestId(item, "reject")}
                                  onPress={() => handleDeclineBooking(item)}
                                  style={[
                                    styles.outlineButton,
                                    {
                                      flex: 1,
                                      borderColor: "#EF4444",
                                      backgroundColor: isDark
                                        ? "rgba(239, 68, 68, 0.2)"
                                        : "#FEF2F2",
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[styles.outlineButtonText, { color: "#EF4444", fontFamily: "Poppins_600SemiBold" }]}
                                  >
                                    Reject
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity activeOpacity={1}
                                  testID={bookingActionTestId(item, "approve")}
                                  accessibilityLabel={bookingActionTestId(item, "approve")}
                                  onPress={() => {
                                    setSelectedItem(item);
                                    setModalMode("confirm");
                                    setModalVisible(true);
                                  }}
                                  style={{
                                    flex: 1,
                                    backgroundColor: "#10B981",
                                    borderRadius: 100,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    paddingVertical: moderateScale(8),
                                  }}
                                >
                                  <Text
                                    style={[styles.actionButtonText, { color: "white" }]}
                                  >
                                    Approve
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </>
                          ) : renderActiveTab === "Active Musicians" ? (
                            (() => {
                              const canCompleteActiveGig = isGigApplicationEventFinished(item);

                              return (
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
                                    }}
                                  >
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

                                  {canCompleteActiveGig ? (
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
                                      }}
                                    >
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
                                  ) : null}
                                </View>
                              );
                            })()
                          ) : renderActiveTab === "Review" ? (
                            <TouchableOpacity activeOpacity={1}
                              testID={bookingActionTestId(item, "leave-review")}
                              accessibilityLabel={bookingActionTestId(item, "leave-review")}
                              onPress={() => handleLeaveReview(item)}
                              style={[
                                styles.outlineButton,
                                styles.reviewActionButton,
                                { borderColor: colors.primary },
                              ]}
                            >
                              <Ionicons
                                name="star-outline"
                                size={16}
                                color={colors.primary}
                              />
                              <Text
                                style={[styles.outlineButtonText, { color: colors.primary }]}
                              >
                                Leave Review
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            // Default / Details
                            <TouchableOpacity activeOpacity={1}
                              testID={bookingActionTestId(item, "view-details")}
                              accessibilityLabel={bookingActionTestId(item, "view-details")}
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
                        )}
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
                  testID={`mobile-bookings-studio-booking-card-${item.id}`}
                  accessibilityLabel={`mobile-bookings-studio-booking-card-${item.id}`}
                  style={[
                    styles.cardContainer,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View>
                    <CachedImage
                      uri={item.image}
                      fallbackUri={
                        "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop"
                      }
                      style={[
                        styles.cardImage,
                        { opacity: item.isCancelled ? 0.6 : 1 },
                      ]}
                      width={BOOKING_CARD_IMAGE_WIDTH}
                      height={BOOKING_CARD_IMAGE_HEIGHT}
                      quality={72}
                      cacheVersion={item.updated_at || item.created_at || item.id}
                    />
                    <View style={[styles.typeBadge, styles.topLeftImageBadge]}>
                      <Text style={styles.typeBadgeText} numberOfLines={1}>{item.type}</Text>
                    </View>

                    {/* Pax Badge for Studios */}
                    {item.pax && (
                      <View style={styles.topRightBadgeStack}>
                        <View
                          style={[
                            styles.typeBadge,
                            styles.stackedImageBadge,
                            {
                              backgroundColor: "#10B981",
                            },
                          ]}
                        >
                          <Text style={styles.typeBadgeText} numberOfLines={1}>{item.pax} pax</Text>
                        </View>

                        {/* Status Overlays */}
                        {renderActiveTab === "Ongoing" && (
                          <View style={[styles.liveBadge, styles.stackedImageBadge]}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>Live</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!item.pax && renderActiveTab === "Ongoing" && (
                      <View style={styles.topRightBadgeStack}>
                        <View style={[styles.liveBadge, styles.stackedImageBadge]}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveText}>Live</Text>
                        </View>
                      </View>
                    )}

                    {item.isCancelled && (
                      <View style={styles.cancelledOverlay}>
                        <View
                          style={[
                            styles.cancelledBadge,
                            isRefundedStudioBooking(item) && { backgroundColor: "#0EA5E9" },
                          ]}
                        >
                          <Text style={styles.cancelledText}>
                            {getStudioBookingStatusLabel(item) === "Refunded" ? "Refunded" : "Cancelled"}
                          </Text>
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

                        {/* Booker Info for Studio/Gig Owners */}
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
                                uri={item.customer_avatar}
                                fallbackUri={
                                  "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100&h=100&fit=crop"
                                }
                                style={styles.customerAvatar}
                                width={BOOKING_AVATAR_IMAGE_SIZE}
                                height={BOOKING_AVATAR_IMAGE_SIZE}
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

                        {/* Video & Note (Gig Owners / Gig Applications) */}
                        {userRole === "venue-owner" &&
                          item.type_id === "gig_application" && (
                            <View style={{ marginTop: 8, gap: 8 }}>
                              {item.video_url && (
                                <TouchableOpacity activeOpacity={1}
                                  onPress={() => openConnectionRequestLink(item.video_url, "Audition Video")}
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
                                    {`"${item.note}"`}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}

                        <View style={{ marginTop: 8, gap: 4 }}>
                          {(() => {
                            const dateStr = item.raw_date
                              ? formatFriendlyDateTime(item.raw_date, { forceDateOnly: true })
                              : formatFriendlyDateTime(item.start_time, { forceDateOnly: true });

                            const timeStr = formatBookingTimeRange(
                              item.start_time,
                              item.end_time,
                            );

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
                              Boolean(requiredTotalHours);
                            const recordingDurationColor =
                              selectedTotalHours &&
                              requiredTotalHours &&
                              selectedTotalHours + 1e-9 < requiredTotalHours
                                ? "#F59E0B"
                                : colors.textSecondary;
                            const paidAmountLabel =
                              item.type_id === "studio_booking"
                                ? getBookingPaidAmountLabel(item)
                                : null;

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
                                {item.batch_count > 1 ? (
                                  <View style={styles.cardDetailRow}>
                                    <Ionicons name="albums-outline" size={14} color={colors.textSecondary} />
                                    <Text style={[styles.cardDetailText, { color: colors.textSecondary }]}>
                                      {item.batch_count} sessions in this payment
                                    </Text>
                                  </View>
                                ) : null}
                                {paidAmountLabel ? (
                                  <View style={styles.cardDetailRow}>
                                    <Ionicons name="cash-outline" size={14} color={colors.textSecondary} />
                                    <Text style={[styles.cardDetailText, { color: colors.textSecondary }]}>
                                      Amount paid | {paidAmountLabel}
                                    </Text>
                                  </View>
                                ) : null}
                                {showRecordingMeta ? (
                                  <>
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
                                            ? `Need ${requiredBlocks} block${requiredBlocks > 1 ? "s" : ""} | `
                                            : ""}
                                          Min {formatRecordingHours(requiredTotalHours)}h
                                          {selectedTotalHours
                                            ? ` | Selected ${formatRecordingHours(selectedTotalHours)}h`
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
                          gap: moderateScale(8),
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
                          style={[
                            styles.statusContainer,
                            { marginBottom: 0, flex: 1, flexWrap: "wrap" },
                          ]}
                        >
                          {isRefundedStudioBooking(item) ? (
                            <Ionicons
                              name="cash-outline"
                              size={16}
                              color="#0EA5E9"
                            />
                          ) : item.isCancelled ? (
                            <Ionicons
                              name="close-circle"
                              size={16}
                              color="#EF4444"
                            />
                          ) : renderActiveTab === "Ongoing" ? (
                            <Ionicons
                              name="play-circle"
                              size={16}
                              color="#10B981"
                            />
                          ) : renderActiveTab === "Review" ? (
                            <Ionicons
                              name="checkmark-done-circle"
                              size={16}
                              color={colors.textSecondary}
                            />
                          ) : renderActiveTab === "Pending" ? (
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
                                color: isRefundedStudioBooking(item)
                                  ? "#0EA5E9"
                                  : item.isCancelled
                                  ? "#EF4444"
                                  : renderActiveTab === "Pending"
                                    ? "#F59E0B"
                                    : renderActiveTab === "Ongoing"
                                      ? "#10B981"
                                      : renderActiveTab === "Review"
                                        ? colors.textSecondary
                                        : "#10B981",
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {getStudioBookingStatusLabel(item)}
                          </Text>

                          {isHistoryTabView && isRefundedStudioBooking(item) && getBookingRefundAmount(item) > 0 && (
                            <View
                              style={[
                                styles.downpaymentBadge,
                                { backgroundColor: "#0EA5E920" },
                              ]}
                            >
                              <Ionicons
                                name="cash-outline"
                                size={12}
                                color="#0EA5E9"
                              />
                              <Text
                                style={[
                                  styles.downpaymentText,
                                  { color: "#0EA5E9" },
                                ]}
                              >
                                Refunded amount ₱{getBookingRefundAmount(item).toLocaleString()}
                              </Text>
                            </View>
                          )}

                          {shouldShowPaidBalanceBadge(item) && (
                            <View
                              style={[
                                styles.downpaymentBadge,
                                { backgroundColor: "#10B98120" },
                              ]}
                            >
                              <Ionicons
                                name="checkmark-circle"
                                size={12}
                                color="#10B981"
                              />
                              <Text
                                style={[
                                  styles.downpaymentText,
                                  { color: "#10B981" },
                                ]}
                              >
                                Fully paid
                              </Text>
                            </View>
                          )}

                          {isBalancePaymentProcessing(item) && (
                            <View
                              style={[
                                styles.downpaymentBadge,
                                { backgroundColor: "#10B98120" },
                              ]}
                            >
                              <Ionicons
                                name="time-outline"
                                size={12}
                                color="#10B981"
                              />
                              <Text
                                style={[
                                  styles.downpaymentText,
                                  { color: "#10B981" },
                                ]}
                              >
                                Payment submitted
                              </Text>
                            </View>
                          )}

                          {shouldShowBalanceDueBadge(item) && (
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
                                Downpayment paid · Balance ₱
                                {item.remaining_balance?.toLocaleString()}
                              </Text>
                            </View>
                          )}
                        </View>

                        {!isHistoryTabView && shouldShowMessageForItem(item) && (
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

                      {renderActionLoadingIndicator(item)}

                      {!isHistoryTabView && (
                        <View
                          style={[
                            styles.actionButtonsContainer,
                            { marginTop: 0, width: "100%" },
                          ]}
                        >
                        {/* PENDING TAB: Studio Bookings - Payment Button for Musicians */}
                        {renderActiveTab === "Pending" &&
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
                                Preferred slot: {formatRelocationSlotLabel(getSelectedRelocationSlot(item))}
                              </Text>
                              <Text
                                style={{
                                  color: colors.textSecondary,
                                  fontSize: 11,
                                  fontFamily: "Poppins_400Regular",
                                }}
                              >
                                Original price and booking details stay attached.
                              </Text>
                              {item.relocation_expires_at ? (
                                <Text
                                  style={{
                                    color: colors.textSecondary,
                                    fontSize: 11,
                                    fontFamily: "Poppins_400Regular",
                                  }}
                                >
                                  Respond before: {formatFriendlyDateTime(item.relocation_expires_at)}
                                </Text>
                              ) : null}
                            </View>

                            <TouchableOpacity
                              activeOpacity={0.78}
                              disabled={isActionLoadingFor(item)}
                              onPress={() => openRelocationSlotPicker(item)}
                              style={[
                                styles.outlineButton,
                                {
                                  borderColor: colors.primary,
                                  width: "100%",
                                  alignItems: "center",
                                  borderRadius: 100,
                                  flexDirection: "row",
                                  gap: scale(8),
                                  opacity: isActionLoadingFor(item) ? 0.65 : 1,
                                },
                              ]}
                            >
                              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                              <Text style={[styles.outlineButtonText, { color: colors.primary }]}>
                                Choose Date & Time
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.78}
                              disabled={isActionLoadingFor(item)}
                              onPress={() => {
                                showAlert(
                                  "warning",
                                  "Cancel Move Request",
                                  "Cancel this owner-requested move? Your booking will be cancelled, refund processing will start if needed, and your completion rate will not be affected.",
                                  [
                                    { text: "Keep Booking", style: "cancel" },
                                    {
                                      text: "Cancel Booking",
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
                                  width: "100%",
                                  alignItems: "center",
                                  borderRadius: 100,
                                  opacity: isActionLoadingFor(item) ? 0.65 : 1,
                                },
                              ]}
                            >
                              {isActionLoadingFor(item) ? (
                                <ActivityIndicator size="small" color={isDark ? "#F87171" : "#DC2626"} />
                              ) : (
                                <Text
                                  style={[
                                    styles.cancelButtonText,
                                    isDark
                                      ? { color: "#F87171" }
                                      : { color: "#DC2626" },
                                  ]}
                                >
                                  Cancel Request
                                </Text>
                              )}
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={1}
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
                        ) : renderActiveTab === "Pending" &&
                          item.type_id === "studio_booking" &&
                          userRole === "musician" ? (
                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <View style={styles.compactActionRow}>
                              {/* Details Button */}
                              <TouchableOpacity activeOpacity={1}
                                testID={bookingActionTestId(item, "details")}
                                accessibilityLabel={bookingActionTestId(item, "details")}
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

                              {/* Pay Now / Pay Balance  -  only when payment is not fully settled */}
                              {!isBookingPaymentSettled(item) &&
                                !isBalancePaymentProcessing(item) && (
                                <TouchableOpacity activeOpacity={1}
                                  disabled={isActionLoadingFor(item)}
                                  testID={bookingActionTestId(item, "pay")}
                                  accessibilityLabel={bookingActionTestId(item, "pay")}
                                  onPress={() => showPaymentOptions(item)}
                                  style={[
                                    styles.actionButton,
                                    {
                                      backgroundColor: "#16A34A",
                                      flex: 1,
                                      justifyContent: "center",
                                      alignItems: "center",
                                      flexDirection: "row",
                                      gap: 6,
                                      opacity: isActionLoadingFor(item) ? 0.65 : 1,
                                    },
                                  ]}
                                >
                                  {isActionLoadingFor(item) ? (
                                    <ActivityIndicator size="small" color="white" />
                                  ) : (
                                    <Text
                                      style={[
                                        styles.actionButtonText,
                                        { color: "white" },
                                      ]}
                                    >
                                      Pay
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              )}

                              <TouchableOpacity activeOpacity={1}
                                testID={bookingActionTestId(item, "cancel")}
                                accessibilityLabel={bookingActionTestId(item, "cancel")}
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
                            </View>
                          </View>
                        ) : userRole === "musician" &&
                          viewMode === "applications" &&
                          activeAppTab === "Accepted" &&
                          item.type_id === "gig_application" ? (
                          <View
                            style={{ flexDirection: "row", gap: 8, flex: 1 }}
                          >
                            <TouchableOpacity activeOpacity={1}
                              testID={bookingActionTestId(item, "details")}
                              accessibilityLabel={bookingActionTestId(item, "details")}
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
                              <Text
                                style={{
                                  color: colors.textSecondary,
                                  fontFamily: "Poppins_500Medium",
                                  fontSize: 12,
                                }}
                              >
                                Details
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity activeOpacity={1}
                              testID={bookingActionTestId(item, "withdraw")}
                              accessibilityLabel={bookingActionTestId(item, "withdraw")}
                              onPress={() => {
                                setSelectedItem(item);
                                setModalMode("cancel");
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
                        ) : renderActiveTab === "Pending" &&
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
                              testID={bookingActionTestId(item, "view-details")}
                              accessibilityLabel={bookingActionTestId(item, "view-details")}
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
                                testID={bookingActionTestId(item, "cancel")}
                                accessibilityLabel={bookingActionTestId(item, "cancel")}
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
                        ) : renderActiveTab === "Review" ? (
                          item.type_id === "studio_booking" &&
                          (userRole === "studio-owner" || userRole === "venue-owner") &&
                          item.raw_status !== "completed" &&
                          !isReadOnlyBookingItem(item) ? (
                            <TouchableOpacity activeOpacity={1}
                              disabled={isActionLoadingFor(item)}
                              testID={bookingActionTestId(item, "complete")}
                              accessibilityLabel={bookingActionTestId(item, "complete")}
                              onPress={() => {
                                setSelectedItem(item);
                                setModalMode("complete");
                                setModalVisible(true);
                              }}
                              style={[
                                styles.actionButton,
                                styles.reviewActionButton,
                                {
                                  backgroundColor: "#10B981",
                                  borderRadius: 100,
                                  opacity: isActionLoadingFor(item) ? 0.65 : 1,
                                },
                              ]}
                            >
                              {isActionLoadingFor(item) ? (
                                <ActivityIndicator size="small" color="white" />
                              ) : (
                                <>
                                  <Ionicons
                                    name="checkmark-circle-outline"
                                    size={18}
                                    color="white"
                                  />
                                  <Text
                                    style={[
                                      styles.actionButtonText,
                                      { color: "white" },
                                    ]}
                                  >
                                    {getBookingRemainingBalance(item) > 0 && !isBookingPaymentSettled(item)
                                      ? "Complete & Mark Paid"
                                      : "Complete"}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity activeOpacity={1}
                              testID={bookingActionTestId(item, "leave-review")}
                              accessibilityLabel={bookingActionTestId(item, "leave-review")}
                              onPress={() => handleLeaveReview(item)}
                              style={[
                                styles.outlineButton,
                                styles.reviewActionButton,
                                { borderColor: colors.primary },
                              ]}
                            >
                              <Ionicons
                                name="star-outline"
                                size={16}
                                color={colors.primary}
                              />
                              <Text
                                style={[
                                  styles.outlineButtonText,
                                  { color: colors.primary },
                                ]}
                              >
                                Leave Review
                              </Text>
                            </TouchableOpacity>
                          )
                        ) : (
                          // Default / Upcoming Buttons
                          <View
                            style={{ width: "100%", gap: moderateScale(8) }}
                          >
                            {shouldShowLateReportButton(item) && (
                                <TouchableOpacity activeOpacity={1}
                                  testID={bookingActionTestId(item, "report-late")}
                                  accessibilityLabel={bookingActionTestId(item, "report-late")}
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

                            {/* Pay Balance / Clear Balance (F2F) Buttons */}
                            {(renderActiveTab === "Upcoming" || renderActiveTab === "Ongoing") &&
                              item.type_id === "studio_booking" &&
                              canPayRemainingBalance(item) && (
                                <>
                                  {userRole === "musician" ? (
                                    <TouchableOpacity activeOpacity={1}
                                      disabled={isActionLoadingFor(item)}
                                      testID={bookingActionTestId(item, "pay-remaining")}
                                      accessibilityLabel={bookingActionTestId(item, "pay-remaining")}
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
                                          opacity: isActionLoadingFor(item) ? 0.65 : 1,
                                        },
                                      ]}
                                    >
                                      {isActionLoadingFor(item) ? (
                                        <ActivityIndicator size="small" color="white" />
                                      ) : (
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
                                      )}
                                    </TouchableOpacity>
                                  ) : null}

                                  {userRole === "studio-owner" || userRole === "venue-owner" ? (
                                    <TouchableOpacity activeOpacity={1}
                                      testID={bookingActionTestId(item, "clear-balance")}
                                      accessibilityLabel={bookingActionTestId(item, "clear-balance")}
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
                                testID={bookingActionTestId(item, "details")}
                                accessibilityLabel={bookingActionTestId(item, "details")}
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

                              {((renderActiveTab === "Upcoming" && !item.isCancelled) ||
                                (renderActiveTab === "Ongoing" &&
                                  userRole === "musician" &&
                                  item.type_id === "gig_application")) && (
                                  <TouchableOpacity activeOpacity={1}
                                    testID={bookingActionTestId(item, item.type_id === "gig_application" ? "withdraw" : "cancel")}
                                    accessibilityLabel={bookingActionTestId(item, item.type_id === "gig_application" ? "withdraw" : "cancel")}
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
                                      {item.type_id === "gig_application" ? "Withdraw" : "Cancel"}
                                    </Text>
                                  </TouchableOpacity>
                                )}
                            </View>
                          </View>
                        )}
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
          }}
        />

        {!shouldHideNavbar ? (
          <View style={styles.navbarPosition}>
            <Navbar />
          </View>
        ) : null}
      </View>

      <BookingActionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        loading={modalVisible && selectedItem ? isActionLoadingFor(selectedItem) : false}
        loadingMessage={actionLoading?.message ? `${actionLoading.message}...` : "Updating..."}
        title={
          modalMode === "confirm"
            ? selectedItem?.type_id === "gig_application"
              ? selectedItem?.leader_approval_required
                ? "Approve for Gig Review"
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
                  : modalMode === "clear_balance"
                    ? "Clear Remaining Balance"
                    : modalMode === "late_confirm"
                        ? "Confirm Late Report"
                      : modalMode === "late"
                        ? "Report Late"
                        : selectedItem?.type_id === "gig_application"
                          ? "Withdraw from Gig"
                          : "Cancel Booking"
        }
        message={
          modalMode === "confirm"
            ? selectedItem?.type_id === "gig_application"
              ? selectedItem?.leader_approval_required
                ? "Approve this member submission so it can be sent to the gig owner for review?"
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
                    ? selectedItem?.type_id === "studio_booking"
                      ? getBookingRemainingBalance(selectedItem) > 0 && !isBookingPaymentSettled(selectedItem)
                        ? `Complete this booking and mark ${formatPesoAmount(selectedItem?.remaining_balance)} as paid via face-to-face payment?`
                        : "Mark this studio booking as completed?"
                      : "Confirm efficient completion of this gig?"
                    : modalMode === "clear_balance"
                      ? `Mark ₱${selectedItem?.remaining_balance?.toLocaleString() || 0} as paid via face-to-face payment? This amount will be credited to your wallet.`
                      : modalMode === "late_confirm"
                        ? `Send this late-arrival reason to the studio owner?\n\n${normalizeVisibleInput(cancellationReason)}`
                      : modalMode === "late"
                        ? "Please provide your reason for being late."
                        : (() => {
                          // Cancel mode
                          if (selectedItem?.type_id === "gig_application") {
                            if (userRole === "venue-owner") {
                              return "Are you sure you want to revoke this accepted application? The musician will be notified.";
                            }

                            if (isUpcomingAcceptedGigApplicationItem(selectedItem)) {
                              return "Are you sure you want to withdraw from this accepted gig? The gig owner will be notified and this will affect your completion rate.";
                            }

                            return "Are you sure you want to withdraw this application? The gig owner will be notified.";
                          } else {
                            // For studio bookings, owner cancellations refund the musician.
                            const ownerCancellation = isStudioOwnerCancellation(selectedItem, userId, userRole);
                            const paidAmount = getBookingPaidAmount(selectedItem);

                            if (ownerCancellation) {
                              if (paidAmount > 0) {
                                return `Cancelling as the studio owner will refund ${formatPesoAmount(paidAmount)} to the musician's wallet. The musician will be notified.`;
                              }

                              return "Cancelling as the studio owner will notify the musician. No paid amount has been recorded for this booking yet.";
                            }

                            if (paidAmount > 0) {
                              const paidLabel =
                                selectedItem?.payment_type === "downpayment" &&
                                getBookingRemainingBalance(selectedItem) > 0
                                  ? "downpayment"
                                  : "paid amount";

                              return `Cancellation Policy: Booking cancellations are non-refundable. Your ${paidLabel} of ₱${paidAmount.toLocaleString()} is non-refundable.`;
                            }

                            return "Cancellation Policy: Booking cancellations are non-refundable. No paid amount has been recorded for this booking yet.";
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
                  ? selectedItem?.type_id === "studio_booking" &&
                    getBookingRemainingBalance(selectedItem) > 0 &&
                    !isBookingPaymentSettled(selectedItem)
                    ? "Complete & Mark Paid"
                    : "Complete"
                    : modalMode === "clear_balance"
                        ? `Mark ₱${selectedItem?.remaining_balance?.toLocaleString() || 0} as Paid`
                        : modalMode === "late_confirm"
                          ? "Send Report"
                        : modalMode === "late"
                          ? "Submit"
                          : selectedItem?.type_id === "gig_application"
                            ? "Yes, Withdraw"
                            : "Yes, Cancel Booking"
        }
        showInput={
          modalMode !== "confirm" &&
          modalMode !== "complete" &&
          modalMode !== "late_confirm" &&
          modalMode !== "clear_balance" &&
          !(modalMode === "decline" && selectedItem?.leader_approval_required)
        } // Show input for cancel AND decline AND fire
        danger={
          modalMode === "fire" ||
          modalMode === "decline" ||
          modalMode === "cancel"
        }
        inputValue={cancellationReason}
        onInputChange={setCancellationReason}
        onConfirm={async () => {
          // Validation for modes that require input
          if (
            (modalMode === "cancel" ||
              modalMode === "decline" ||
              modalMode === "fire" ||
              modalMode === "late") &&
            !(modalMode === "decline" && selectedItem?.leader_approval_required) &&
            !normalizeVisibleInput(cancellationReason)
          ) {
            Alert.alert("Warning", "Please provide a reason.");
            return;
          }

          if (modalMode === "late_confirm" && selectedItem && hasLateReportAlready(selectedItem)) {
            Alert.alert("Info", "You already sent a late report for this booking.");
            setModalVisible(false);
            return;
          }

          if (selectedItem) {
            if (isReadOnlyBookingItem(selectedItem)) {
              showReadOnlyBookingAlert();
              setModalVisible(false);
              return;
            }

            debugLog("?? Modal onConfirm - selectedItem:", selectedItem);
            debugLog("?? Modal onConfirm - modalMode:", modalMode);
            debugLog(
              "?? Modal onConfirm - selectedItem.type_id:",
              selectedItem.type_id,
            );

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

            if (modalMode === "complete" && !canCompleteBookingItem(selectedItem)) {
              showAlert(
                "warning",
                selectedItem?.type_id === "studio_booking" ? "Booking Not Started" : "Event Not Finished",
                selectedItem?.type_id === "studio_booking"
                  ? "You can complete this booking once the scheduled start time has arrived."
                  : "You can complete this contract after the event date has passed.",
              );
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
            } else if (modalMode === "cancel") {
              // Cancel mode (from Upcoming tab)
              status =
                selectedItem.type_id === "gig_application"
                  ? getGigApplicationCancelStatusForViewer(selectedItem, userRole)
                  : "cancelled";
            } else if (modalMode === "fire") {
              status =
                selectedItem.type_id === "gig_application"
                  ? "fired"
                  : "cancelled";
            } else if (modalMode === "complete") {
              status = "completed";
            } else if (modalMode === "late_confirm") {
              status = "late";
            }

            if (modalMode === "complete") {
            }

            debugLog("?? Modal onConfirm - Final status:", status);
            debugLog(
              "?? Modal onConfirm - Calling handleStatusUpdate with:",
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
              Alert.alert(
                "Success",
                "Studio owner has been notified.",
              );
            }

            // Keep completion/termination as status updates only.
            // Users can submit reviews manually from the Review tab.
            if (didUpdate && (modalMode === "fire" || modalMode === "complete")) {
              setActiveTab("Review");
            }
          }
        }}
      />

      {relocationSlotPickerVisible ? (
        <RNModal
          visible
          transparent
          statusBarTranslucent
          navigationBarTranslucent
          presentationStyle="overFullScreen"
          hardwareAccelerated
          animationType="fade"
          onRequestClose={() => setRelocationSlotPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.relocationPickerContainer,
                { backgroundColor: colors.card },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => setRelocationSlotPickerVisible(false)}
                style={styles.modalCloseIcon}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>

              <Text style={[styles.relocationPickerTitle, { color: colors.text }]}>
                Choose Date & Time
              </Text>
              <Text style={[styles.relocationPickerSubtitle, { color: colors.textSecondary }]}>
                Pick an available slot for this booking. The original price and payment details stay the same.
              </Text>

              {relocationSlotLoading ? (
                <View style={styles.relocationPickerState}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.relocationPickerStateText, { color: colors.textSecondary }]}>
                    Loading available times...
                  </Text>
                </View>
              ) : relocationSlotError ? (
                <View style={styles.relocationPickerState}>
                  <Text style={[styles.relocationPickerStateText, { color: "#EF4444" }]}>
                    {relocationSlotError}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => relocationSlotPickerItem && openRelocationSlotPicker(relocationSlotPickerItem)}
                    style={[
                      styles.outlineButton,
                      {
                        borderColor: colors.primary,
                        alignItems: "center",
                        marginTop: moderateScale(8),
                      },
                    ]}
                  >
                    <Text style={[styles.outlineButtonText, { color: colors.primary }]}>
                      Retry
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : relocationSlotOptions.length === 0 ? (
                <View style={styles.relocationPickerState}>
                  <Text style={[styles.relocationPickerStateText, { color: colors.textSecondary }]}>
                    No matching available slots were found. You can cancel this owner-requested move without affecting your completion rate.
                  </Text>
                </View>
              ) : (() => {
                const slotDates = getRelocationSlotDates(relocationSlotOptions);
                const activeDate =
                  relocationSlotCalendarDate ||
                  getSelectedRelocationSlot(relocationSlotPickerItem)?.date ||
                  slotDates[0] ||
                  "";
                const slotsForDate = relocationSlotOptions.filter(
                  (slot) => slot.date === activeDate,
                );
                const selectedSlot = getSelectedRelocationSlot(relocationSlotPickerItem);
                const selectedSlotForActiveDate =
                  selectedSlot?.date === activeDate ? selectedSlot : null;
                const availableDateSet = new Set(slotDates);
                const minRelocationDate = getRelocationLocalDateKey();
                const maxRelocationDate = slotDates[slotDates.length - 1] || minRelocationDate;
                const isConfirmingRelocationSlot = isActionLoadingFor(relocationSlotPickerItem);

                return (
                  <>
                    <View
                      style={[
                        styles.relocationCalendarContainer,
                        {
                          borderColor: colors.border,
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.04)"
                            : "#FFFFFF",
                        },
                      ]}
                    >
                      <Calendar
                        style={styles.relocationCalendar}
                        current={activeDate || slotDates[0]}
                        minDate={minRelocationDate}
                        maxDate={maxRelocationDate}
                        markedDates={buildRelocationCalendarMarks(
                          relocationSlotOptions,
                          activeDate,
                          minRelocationDate,
                          maxRelocationDate,
                        )}
                        onDayPress={(day) => {
                          if (!availableDateSet.has(day.dateString)) return;
                          setRelocationSlotCalendarDate(day.dateString);
                        }}
                        disableAllTouchEventsForDisabledDays
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
                          textDayFontSize: 12,
                          textMonthFontSize: 14,
                          textDayHeaderFontSize: 10,
                          weekVerticalMargin: 1,
                          arrowStyle: { padding: moderateScale(6) },
                          arrowHeight: moderateScale(14),
                          arrowWidth: moderateScale(14),
                          textDayStyle: { marginTop: moderateScale(4) },
                        }}
                        enableSwipeMonths
                      />
                    </View>

                    <Text style={[styles.relocationDateHint, { color: colors.textSecondary }]}>
                      Dates with available times are marked.
                    </Text>

                    {slotsForDate.length === 0 ? (
                      <View style={styles.relocationPickerState}>
                        <Text style={[styles.relocationPickerStateText, { color: colors.textSecondary }]}>
                          No available times were found for this date.
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={styles.relocationSlotList}
                        contentContainerStyle={styles.relocationSlotListContent}
                        showsVerticalScrollIndicator={false}
                      >
                        {slotsForDate.map((slot) => {
                          const isSelected =
                            selectedSlotForActiveDate &&
                            relocationSlotKey(selectedSlotForActiveDate) === relocationSlotKey(slot);

                          return (
                            <TouchableOpacity
                              key={relocationSlotKey(slot)}
                              activeOpacity={0.78}
                              onPress={() => {
                                if (!relocationSlotPickerItem?.id) return;
                                setPreferredRelocationSlots((prev) => ({
                                  ...prev,
                                  [relocationSlotPickerItem.id]: slot,
                                }));
                                setRelocationSlotCalendarDate(slot.date);
                              }}
                              style={[
                                styles.relocationSlotOption,
                                {
                                  borderColor: isSelected ? colors.primary : colors.border,
                                  backgroundColor: isSelected
                                    ? colors.primary + "18"
                                    : isDark
                                      ? "rgba(255,255,255,0.06)"
                                      : "#F8FAFC",
                                },
                              ]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.relocationSlotDate, { color: colors.text }]}>
                                  {formatRelocationDateTime(slot.date, slot.start_time)}
                                </Text>
                                <Text style={[styles.relocationSlotTime, { color: colors.textSecondary }]}>
                                  Until {formatRelocationClockTime(slot.end_time)}
                                </Text>
                              </View>
                              {isSelected ? (
                                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                              ) : (
                                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                    <View
                      style={[
                        styles.relocationModalActions,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <TouchableOpacity
                        activeOpacity={0.78}
                        disabled={!selectedSlotForActiveDate || isConfirmingRelocationSlot}
                        onPress={() => promptConfirmRelocationSlot(relocationSlotPickerItem, selectedSlotForActiveDate)}
                        style={[
                          styles.relocationConfirmButton,
                          {
                            backgroundColor: colors.primary,
                            opacity: !selectedSlotForActiveDate || isConfirmingRelocationSlot ? 0.55 : 1,
                          },
                        ]}
                      >
                        {isConfirmingRelocationSlot ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                            <Text style={styles.relocationConfirmButtonText}>Confirm Time</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </RNModal>
      ) : null}

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />

      {mediaViewerUrl ? (
        <InAppMediaViewer
          visible
          uri={mediaViewerUrl}
          title={mediaViewerTitle}
          onClose={() => setMediaViewerUrl(null)}
        />
      ) : null}

      <BookingDetailsSheet
        ref={bookingDetailsRef}
        booking={selectedItem}
        readOnly={isReadOnlyBookingItem(selectedItem)}
        onConfirm={
          isReadOnlyBookingItem(selectedItem) ? undefined : handleConfirmBooking
        }
        onCancel={
          isReadOnlyBookingItem(selectedItem) ? undefined : handleCancelBooking
        }
        onLeaveReview={
          isReadOnlyBookingItem(selectedItem) ? undefined : handleLeaveReview
        }
      />

      {/* Payment Option Modal */}
      {showPaymentOptionModal ? (
      <RNModal
        visible
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="overFullScreen"
        hardwareAccelerated
        animationType="fade"
        onRequestClose={() => setShowPaymentOptionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.paymentOptionContainer,
              { backgroundColor: colors.card },
            ]}
          >
            {/* Close button - absolutely positioned inside the card */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setShowPaymentOptionModal(false)}
              style={styles.modalCloseIcon}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            <Text style={[styles.paymentOptionTitle, { color: colors.text }]}>
              {getBookingIdsForPaymentItem(paymentItem).length > 1
                ? `Pay ${getBookingIdsForPaymentItem(paymentItem).length} bookings`
                : "Payment Option"}
            </Text>
            <Text
              style={[
                styles.paymentOptionSubtitle,
                { color: colors.textSecondary },
              ]}
            >
              Total booking amount: ₱
              {getPaymentItemTotalAmount(paymentItem).toLocaleString()}
            </Text>
            <Text style={[styles.paymentOptionHint, { color: colors.textSecondary }]}>
              Choose whether to settle everything now or leave the other half as a balance due.
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
                    Pay in full
                  </Text>
                  <Text
                    style={[
                      styles.paymentOptionAmount,
                      { color: colors.primary },
                    ]}
                  >
                    ₱
                    {(
                      getPaymentItemTotalAmount(paymentItem)
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
                Settles the booking amount in one payment.
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
                    Pay 50% now
                  </Text>
                  <Text
                    style={[
                      styles.paymentOptionAmount,
                      { color: colors.primary },
                    ]}
                  >
                    ₱
                    {Math.round(
                      getPaymentItemTotalAmount(paymentItem) / 2,
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
                Pay half today. Remaining balance: ₱
                {Math.round(
                  getPaymentItemTotalAmount(paymentItem) / 2,
                ).toLocaleString()}{" "}
                shown in Pending.
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
                  Pay ₱
                  {(selectedPaymentType === "downpayment"
                    ? Math.round(getPaymentItemTotalAmount(paymentItem) / 2)
                    : getPaymentItemTotalAmount(paymentItem)
                  ).toLocaleString()}
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
        </View>
      </RNModal>
      ) : null}

      {/* Scanner Modal (Studio Owner) */}
      {showScanModal ? (
      <RNModal
        visible
        animationType="slide"
        hardwareAccelerated
        statusBarTranslucent
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
            <Text style={styles.scanText}>{"Scan Musician's Entry Pass"}</Text>
            <TouchableOpacity activeOpacity={1}
              onPress={() => setShowScanModal(false)}
              style={styles.closeScannerButton}
            >
              <Ionicons name="close-circle" size={48} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  tabContainer: {
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(8),
    paddingHorizontal: scale(16),
  },
  animatedTabs: {
    borderBottomWidth: 0,
    borderRadius: moderateScale(14),
    overflow: "hidden",
  },
  animatedTab: {
    minHeight: moderateScale(44),
    paddingHorizontal: scale(6),
    paddingVertical: moderateScale(10),
  },
  animatedTabText: {
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
  },
  searchFilterContainer: {
    paddingHorizontal: scale(16),
    paddingBottom: moderateScale(6),
  },
  searchFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
  },
  searchInputContainer: {
    borderWidth: 0,
    borderRadius: moderateScale(16),
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: scale(10),
    paddingHorizontal: scale(16),
    height: moderateScale(48),
  },
  searchInput: {
    flex: 1,
    height: moderateScale(24),
    fontSize: moderateScale(15),
    fontFamily: "Poppins_500Medium",
    lineHeight: moderateScale(20),
    includeFontPadding: false,
    padding: 0,
    textAlignVertical: "center",
  },
  activityFilterButton: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(16),
    alignItems: "center",
    justifyContent: "center",
  },
  activityFilterBadge: {
    position: "absolute",
    top: moderateScale(6),
    right: moderateScale(6),
    width: moderateScale(16),
    height: moderateScale(16),
    borderRadius: moderateScale(8),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
  },
  activityFilterBadgeText: {
    color: "#FFFFFF",
    fontSize: moderateScale(10),
    fontFamily: "Poppins_600SemiBold",
    includeFontPadding: false,
  },
  filterScrollView: {
    marginTop: moderateScale(8),
  },
  filterScrollContent: {
    alignItems: "center",
    paddingRight: scale(16),
  },
  filterChip: {
    borderWidth: 0,
    borderRadius: moderateScale(100),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: moderateScale(36),
    paddingHorizontal: scale(14),
    paddingVertical: moderateScale(8),
    marginRight: scale(8),
  },
  filterChipText: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(17),
    fontFamily: "Poppins_500Medium",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  scrollContent: {
    paddingBottom:
      SCREEN_HEIGHT < 700 ? verticalScale(150) : verticalScale(180),
    paddingHorizontal: scale(24),
    paddingTop: moderateScale(16),
  },
  activityListHeaderControls: {
    marginHorizontal: -scale(24),
    marginTop: -moderateScale(16),
  },
  activityList: {
    flex: 1,
  },
  permitReviewList: {
    gap: moderateScale(8),
    marginBottom: moderateScale(12),
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(80),
  },
  bookingsSkeletonContainer: {
    gap: moderateScale(12),
    paddingTop: moderateScale(4),
    paddingBottom: moderateScale(8),
  },
  bookingsSkeletonCard: {
    borderRadius: moderateScale(16),
    borderWidth: 1,
    padding: moderateScale(12),
  },
  deferredBookingsFooter: {
    paddingTop: moderateScale(4),
    paddingBottom: moderateScale(12),
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
    marginBottom: SCREEN_HEIGHT < 700 ? moderateScale(8) : moderateScale(12),
    borderRadius: moderateScale(12),
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
  cardImage: {
    width: "100%",
    height: SCREEN_HEIGHT < 700 ? verticalScale(88) : verticalScale(104),
    borderTopLeftRadius: moderateScale(12),
    borderTopRightRadius: moderateScale(12),
  },
  typeBadge: {
    position: "absolute",
    top: moderateScale(10),
    left: scale(10),
    paddingHorizontal: scale(12),
    paddingVertical: moderateScale(5),
    borderRadius: moderateScale(9999),
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  topLeftImageBadge: {
    maxWidth: "56%",
  },
  topRightBadgeStack: {
    position: "absolute",
    top: moderateScale(10),
    right: scale(10),
    alignItems: "flex-end",
    gap: moderateScale(5),
    maxWidth: "44%",
  },
  stackedImageBadge: {
    position: "relative",
    top: undefined,
    left: undefined,
    right: undefined,
    maxWidth: "100%",
  },
  typeBadgeText: {
    color: "white",
    fontSize: moderateScale(10),
    lineHeight: moderateScale(13),
    fontFamily: "Poppins_600SemiBold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  liveBadge: {
    position: "absolute",
    top: moderateScale(10),
    right: scale(10),
    paddingHorizontal: scale(12),
    paddingVertical: moderateScale(5),
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
    padding: SCREEN_HEIGHT < 700 ? moderateScale(10) : moderateScale(12),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: moderateScale(6),
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: scale(8),
  },
  cardTitle: {
    fontSize: moderateScale(14),
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
    marginTop: moderateScale(4),
    paddingTop: moderateScale(8),
    borderTopWidth: 1,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  statusText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_500Medium",
    flexShrink: 1,
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
    marginTop: moderateScale(8),
    width: "100%",
    justifyContent: "flex-end",
  },
  compactActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    marginTop: 0,
    width: "100%",
  },
  reviewActionButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
  },
  actionLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    minHeight: moderateScale(24),
  },
  actionLoadingText: {
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
    fontFamily: "Poppins_500Medium",
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
    backgroundColor: "rgba(15,23,42,0.62)",
  },
  relocationPickerContainer: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "86%",
    borderRadius: moderateScale(18),
    padding: moderateScale(16),
    position: "relative",
  },
  relocationPickerTitle: {
    fontSize: moderateScale(20),
    lineHeight: moderateScale(26),
    fontFamily: "Poppins_700Bold",
    paddingRight: scale(36),
  },
  relocationPickerSubtitle: {
    marginTop: moderateScale(6),
    fontSize: moderateScale(12),
    lineHeight: moderateScale(18),
    fontFamily: "Poppins_400Regular",
    paddingRight: scale(10),
  },
  relocationPickerState: {
    minHeight: moderateScale(130),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(12),
    gap: moderateScale(8),
  },
  relocationPickerStateText: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(18),
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
  relocationCalendarContainer: {
    marginTop: moderateScale(12),
    borderWidth: 1,
    borderRadius: moderateScale(12),
    overflow: "hidden",
    paddingVertical: moderateScale(1),
  },
  relocationCalendar: {
    paddingBottom: moderateScale(1),
  },
  relocationDateHint: {
    marginTop: moderateScale(6),
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
    fontFamily: "Poppins_400Regular",
  },
  relocationSlotList: {
    marginTop: moderateScale(8),
    maxHeight: verticalScale(260),
  },
  relocationSlotListContent: {
    gap: moderateScale(8),
    paddingBottom: moderateScale(2),
  },
  relocationSlotOption: {
    minHeight: moderateScale(56),
    borderRadius: moderateScale(12),
    borderWidth: 1.5,
    paddingHorizontal: scale(12),
    paddingVertical: moderateScale(9),
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
  },
  relocationSlotDate: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
  },
  relocationSlotTime: {
    marginTop: moderateScale(2),
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
    fontFamily: "Poppins_400Regular",
  },
  relocationModalActions: {
    marginTop: moderateScale(10),
    paddingTop: moderateScale(10),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  relocationConfirmButton: {
    minHeight: moderateScale(46),
    borderRadius: moderateScale(999),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: scale(8),
  },
  relocationConfirmButtonText: {
    color: "#FFFFFF",
    fontSize: moderateScale(13),
    lineHeight: moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
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
    paddingHorizontal: scale(12),
    paddingVertical: 0,
    minHeight: moderateScale(44),
    borderRadius: moderateScale(100),
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(16),
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  outlineButton: {
    paddingHorizontal: scale(12),
    paddingVertical: 0,
    minHeight: moderateScale(44),
    borderRadius: moderateScale(100),
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(16),
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  detailsButtonLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(8),
    minHeight: moderateScale(16),
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
    paddingHorizontal: scale(12),
    paddingVertical: 0,
    minHeight: moderateScale(44),
    borderRadius: moderateScale(100),
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: moderateScale(12),
    lineHeight: moderateScale(16),
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
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
    marginTop: 4,
    maxWidth: "100%",
  },
  downpaymentText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    flexShrink: 1,
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
    marginBottom: 6,
  },
  paymentOptionHint: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
    marginBottom: 18,
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
    minHeight: 52,
    paddingVertical: 0,
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
    lineHeight: 20,
    fontFamily: "Poppins_600SemiBold",
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
  },
  // New detail styles for cards
  cardDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: moderateScale(15),
    marginTop: moderateScale(4),
    gap: scale(5),
  },
  cardDetailText: {
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    flex: 1,
  },
  cardSnippet: {
    paddingHorizontal: scale(10),
    paddingVertical: moderateScale(7),
    borderRadius: moderateScale(8),
    borderLeftWidth: 3,
    marginBottom: moderateScale(6),
  },
  cardSnippetText: {
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    fontStyle: "italic",
  },
  attachmentChipRow: {
    flexDirection: "row",
    gap: scale(6),
    flexWrap: "wrap",
    marginBottom: moderateScale(6),
  },
  attachmentChip: {
    minHeight: moderateScale(30),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(4),
    borderWidth: 1,
    paddingHorizontal: scale(10),
    paddingVertical: 0,
    borderRadius: moderateScale(100),
  },
  attachmentChipText: {
    fontSize: moderateScale(11),
    lineHeight: moderateScale(15),
    fontFamily: "Poppins_600SemiBold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});





