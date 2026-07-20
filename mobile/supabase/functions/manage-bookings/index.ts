// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildNotificationRouteMeta,
  withNotificationRouteMeta,
  withNotificationSeverityType,
} from "../_shared/notificationRoutes.ts";
import { scheduleCoreActionEmailForNotification } from "../_shared/coreActionEmail.ts";
import {
  buildGigApplicationAudienceMeta,
  resolveGigApplicationAudience,
  type GigApplicationAudienceMember,
} from "../_shared/gigApplicationAudience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );
}

async function loadStudioLegacyById(supabaseAdmin: any, studioIds: string[]) {
  const ids = uniqueStrings(studioIds);
  const legacyById = new Map<string, any>();
  if (ids.length === 0) return legacyById;

  const { data, error } = await supabaseAdmin
    .from("studios_with_stats")
    .select("id, images, location, hourly_rate, rate")
    .in("id", ids);

  if (error) throw error;

  (data || []).forEach((row: any) => legacyById.set(row.id, row));
  return legacyById;
}

async function hydrateStudioBookingLegacy(supabaseAdmin: any, rows: any[]) {
  const legacyById = await loadStudioLegacyById(
    supabaseAdmin,
    rows.map((row: any) => row?.studio?.id || row?.studio_id),
  );

  return rows.map((row: any) => {
    const studioId = row?.studio?.id || row?.studio_id || null;
    const legacy = studioId ? legacyById.get(studioId) : null;

    return {
      ...row,
      studio: row?.studio
        ? {
            ...row.studio,
            id: studioId,
            images: Array.isArray(legacy?.images) ? legacy.images : [],
            location: legacy?.location || row.studio.location || row.studio.address || null,
            rate_per_hour:
              row.studio.rate_per_hour ??
              legacy?.hourly_rate ??
              row.studio.hourly_rate ??
              legacy?.rate ??
              row.studio.rate ??
              null,
          }
        : row?.studio,
    };
  });
}

function getManilaNowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function normalizeTime(value?: string | null) {
  if (!value) return "00:00:00";
  const cleaned = value.toString().trim().split(/[.+-]/)[0] || "00:00:00";
  const segments = cleaned.split(":");

  if (segments.length < 2) return "00:00:00";

  const hours = (segments[0] || "00").padStart(2, "0").slice(0, 2);
  const minutes = (segments[1] || "00").padStart(2, "0").slice(0, 2);
  const seconds = (segments[2] || "00").padStart(2, "0").slice(0, 2);

  return `${hours}:${minutes}:${seconds}`;
}

function toHours(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return (endMinutes - startMinutes) / 60;
}

function toManilaDateTime(dateValue: string, timeValue: string): Date | null {
  if (!dateValue || !timeValue) return null;

  const normalizedDate = String(dateValue).trim();
  const normalizedTime = normalizeTime(timeValue);
  const parsed = new Date(`${normalizedDate}T${normalizedTime}+08:00`);

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toGigEventStart(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function shouldPenalizeAcceptedGigWithdrawal({
  newStatus,
  previousStatus,
  eventDate,
  isApplicant,
  isOrganizer,
}: {
  newStatus: string;
  previousStatus: unknown;
  eventDate: unknown;
  isApplicant: boolean;
  isOrganizer: boolean;
}) {
  const normalizedPreviousStatus = String(previousStatus || "").trim().toLowerCase();
  if (newStatus !== "cancelled") return false;
  if (!isApplicant || isOrganizer) return false;
  if (!["accepted", "approved"].includes(normalizedPreviousStatus)) return false;

  const eventStart = toGigEventStart(eventDate);
  return Boolean(eventStart && new Date() < eventStart);
}

function toPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function toPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatHoursValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

function getRecordingRule(source: any) {
  const songsPerBlock = toPositiveInteger(source?.recording_songs_per_block) ?? 1;
  const hoursPerBlock =
    toPositiveNumber(source?.recording_hours_per_block) ??
    toPositiveNumber(source?.min_booking_duration_hours) ??
    3;

  return {
    songsPerBlock,
    hoursPerBlock,
  };
}

function weeklyScheduleAllowsDate(
  source: any,
  bookingDate: string,
  fallback?: any,
): boolean {
  const scope =
    source?.weekly_schedule_scope ??
    fallback?.weekly_schedule_scope ??
    "indefinite";

  if (scope === "until") {
    const endDate =
      source?.weekly_schedule_end_date ?? fallback?.weekly_schedule_end_date;
    return typeof endDate === "string" && endDate.length > 0
      ? bookingDate <= endDate
      : true;
  }

  if (scope === "specific_dates") {
    const dates =
      source?.weekly_schedule_dates ?? fallback?.weekly_schedule_dates;
    if (Array.isArray(dates)) {
      return dates.includes(bookingDate);
    }
    if (dates && typeof dates === "object") {
      return Boolean(dates[bookingDate]);
    }
    return false;
  }

  return true;
}

function getRequiredRecordingBlocks(
  songCount: number,
  rule: { songsPerBlock: number },
): number {
  if (!Number.isFinite(songCount) || songCount <= 0) return 0;
  return Math.ceil(songCount / Math.max(1, rule.songsPerBlock));
}

function getRequiredRecordingHours(
  songCount: number,
  rule: { songsPerBlock: number; hoursPerBlock: number },
): number {
  const requiredBlocks = getRequiredRecordingBlocks(songCount, rule);
  return requiredBlocks * Math.max(rule.hoursPerBlock, 0);
}

function buildRecordingPricingModifiers(
  songCount: number,
  selectedTotalHours: number,
  rule: { songsPerBlock: number; hoursPerBlock: number },
) {
  const requiredBlocks = getRequiredRecordingBlocks(songCount, rule);
  const requiredTotalHours = getRequiredRecordingHours(songCount, rule);

  return {
    rate_model: "per_song",
    song_count: songCount,
    songs_per_block: rule.songsPerBlock,
    hours_per_block: rule.hoursPerBlock,
    required_blocks: requiredBlocks,
    required_total_hours: requiredTotalHours,
    selected_total_hours: selectedTotalHours,
    recording_session: {
      rate_model: "per_song",
      song_count: songCount,
      songs_per_block: rule.songsPerBlock,
      hours_per_block: rule.hoursPerBlock,
      required_blocks: requiredBlocks,
      required_total_hours: requiredTotalHours,
      selected_total_hours: selectedTotalHours,
    },
  };
}

type DateOverrideSessionType = "rehearsal" | "recording" | "both";

function parseDateOverrideSessionType(
  reason: unknown,
): DateOverrideSessionType {
  const text = String(reason || "");
  const match = text.match(/session_type:(rehearsal|recording|both)/i);
  if (!match) return "both";

  const normalized = match[1].toLowerCase();
  if (
    normalized === "rehearsal" ||
    normalized === "recording" ||
    normalized === "both"
  ) {
    return normalized;
  }

  return "both";
}

function isSessionAllowedByDateOverride(
  overrideReason: unknown,
  requestedSessionType: "rehearsal" | "recording",
): boolean {
  const overrideSessionType = parseDateOverrideSessionType(overrideReason);
  return (
    overrideSessionType === "both" ||
    overrideSessionType === requestedSessionType
  );
}

async function insertNotificationIfMissing(
  supabaseAdmin: any,
  payload: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    image?: string | null;
    meta?: Record<string, any>;
  },
) {
  const eventType = payload.meta?.event_type;
  const bookingId = payload.meta?.booking_id;

  if (eventType && bookingId) {
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", payload.user_id)
      .contains("meta", { event_type: eventType, booking_id: bookingId })
      .limit(1);

    if (existing && existing.length > 0) return;
  }

  const notificationPayload = {
    ...payload,
    meta: withNotificationRouteMeta(payload.meta),
    read: false,
  };
  const safeNotificationPayload = withNotificationSeverityType(notificationPayload);

  const { error } = await supabaseAdmin.from("notifications").insert(safeNotificationPayload);
  if (error) {
    console.error("manage_bookings_notification_failed", { message: error.message });
    return;
  }
  scheduleCoreActionEmailForNotification(supabaseAdmin, safeNotificationPayload, { source: "manage-bookings" });
}

const toMoneyNumber = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

function getStudioBookingBalanceSettlementFields(booking: any) {
  const remainingBalance = toMoneyNumber(booking?.remaining_balance);
  if (remainingBalance <= 0) return null;

  const paymentStatus = String(booking?.payment_status || "").toLowerCase();
  if (!["partial", "paid"].includes(paymentStatus)) return null;

  const finalPrice = toMoneyNumber(booking?.final_price);

  return {
    remainingBalance,
    fields: {
      remaining_balance: 0,
      payment_status: "paid",
      payment_amount: finalPrice > 0 ? finalPrice : toMoneyNumber(booking?.payment_amount),
      paid_at: booking?.paid_at || new Date().toISOString(),
    },
  };
}

async function creditStudioBookingBalanceToOwner(
  supabaseAdmin: any,
  booking: any,
  balanceAmount: number,
) {
  const amount = toMoneyNumber(balanceAmount);
  const ownerId = booking?.studio?.owner_id;
  if (!booking?.id || !ownerId || amount <= 0) {
    return { credited: false, amount: 0, skipped: "invalid_balance_credit" };
  }

  const { data: existingTx, error: existingTxError } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id")
    .eq("reference_id", booking.id)
    .eq("reference_type", "booking_balance")
    .eq("type", "earning")
    .limit(1);

  if (existingTxError) throw existingTxError;

  if (existingTx && existingTx.length > 0) {
    return { credited: false, amount, already_credited: true };
  }

  let { data: wallet, error: walletError } = await supabaseAdmin
    .from("wallets")
    .select("id, balance")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (walletError) throw walletError;

  if (!wallet) {
    const { data: createdWallet, error: createWalletError } = await supabaseAdmin
      .from("wallets")
      .insert({ user_id: ownerId, balance: 0 })
      .select("id, balance")
      .single();

    if (createWalletError) throw createWalletError;
    wallet = createdWallet;
  }

  const { error: walletUpdateError } = await supabaseAdmin
    .from("wallets")
    .update({
      balance: toMoneyNumber(wallet.balance) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", wallet.id);

  if (walletUpdateError) throw walletUpdateError;

  const { error: transactionError } = await supabaseAdmin
    .from("wallet_transactions")
    .insert({
      wallet_id: wallet.id,
      amount,
      type: "earning",
      description: `Remaining balance payment received for booking at ${booking?.studio?.name || "Studio"}`,
      reference_id: booking.id,
      reference_type: "booking_balance",
      is_credit: true,
      status: "completed",
    });

  if (transactionError) throw transactionError;

  return { credited: true, amount };
}

async function refundStudioOwnerCancelledBookingToWallet(
  supabaseAdmin: any,
  bookingId: string,
  cancelledByUserId: string,
  options: {
    allowCustomerRelocationRefund?: boolean;
    description?: string;
  } = {},
) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("studio_bookings")
    .select("id, user_id, status, payment_status, payment_amount, final_price, remaining_balance, refund_amount, studio:studios(id, name, owner_id)")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) throw bookingError;
  if (!booking) {
    return null;
  }

  const ownerCancelled = booking.studio?.owner_id === cancelledByUserId;
  const customerRelocationCancelled = Boolean(
    options.allowCustomerRelocationRefund && booking.user_id === cancelledByUserId,
  );

  if (!ownerCancelled && !customerRelocationCancelled) {
    return null;
  }

  const paymentStatus = String(booking.payment_status || "").toLowerCase();
  if (!["paid", "partial", "refund_pending"].includes(paymentStatus)) {
    return {
      owner_cancelled: ownerCancelled,
      owner_requested_relocation: customerRelocationCancelled,
      refund_amount: 0,
      skipped: "not_paid",
    };
  }

  const paidAmount = toMoneyNumber(booking.payment_amount) ||
    Math.max(toMoneyNumber(booking.final_price) - toMoneyNumber(booking.remaining_balance), 0);

  if (paidAmount <= 0) {
    return {
      owner_cancelled: ownerCancelled,
      owner_requested_relocation: customerRelocationCancelled,
      refund_amount: 0,
      skipped: "no_paid_amount",
    };
  }

  let { data: wallet, error: walletError } = await supabaseAdmin
    .from("wallets")
    .select("id, balance")
    .eq("user_id", booking.user_id)
    .maybeSingle();

  if (walletError) throw walletError;

  if (!wallet) {
    const { data: createdWallet, error: createWalletError } = await supabaseAdmin
      .from("wallets")
      .insert({ user_id: booking.user_id, balance: 0 })
      .select("id, balance")
      .single();

    if (createWalletError) throw createWalletError;
    wallet = createdWallet;
  }

  const { data: existingRefund, error: existingRefundError } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id, amount")
    .eq("wallet_id", wallet.id)
    .eq("reference_id", booking.id)
    .eq("reference_type", "refund")
    .eq("type", "refund")
    .limit(1);

  if (existingRefundError) throw existingRefundError;

  if (existingRefund && existingRefund.length > 0) {
    await supabaseAdmin
      .from("studio_bookings")
      .update({
        payment_status: "refunded",
        refund_amount: toMoneyNumber(existingRefund[0].amount) || paidAmount,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    return {
      owner_cancelled: ownerCancelled,
      owner_requested_relocation: customerRelocationCancelled,
      already_refunded: true,
      refund_amount: toMoneyNumber(existingRefund[0].amount) || paidAmount,
    };
  }

  const newBalance = toMoneyNumber(wallet.balance) + paidAmount;
  const { error: walletUpdateError } = await supabaseAdmin
    .from("wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", wallet.id);

  if (walletUpdateError) throw walletUpdateError;

  const { error: transactionError } = await supabaseAdmin
    .from("wallet_transactions")
    .insert({
      wallet_id: wallet.id,
      amount: paidAmount,
      type: "refund",
      description: options.description ||
        `Studio owner cancelled booking at ${booking.studio?.name || "Studio"}`,
      reference_id: booking.id,
      reference_type: "refund",
      is_credit: true,
      status: "completed",
    });

  if (transactionError) throw transactionError;

  const { error: bookingUpdateError } = await supabaseAdmin
    .from("studio_bookings")
    .update({
      payment_status: "refunded",
      refund_amount: paidAmount,
      refunded_at: new Date().toISOString(),
    })
    .eq("id", booking.id);

  if (bookingUpdateError) throw bookingUpdateError;

  return {
    owner_cancelled: ownerCancelled,
    owner_requested_relocation: customerRelocationCancelled,
    already_refunded: false,
    refund_amount: paidAmount,
  };
}

function isMissingTableError(error: any, tableName: string) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const normalizedTable = tableName.toLowerCase();

  return (
    (code === "42P01" && message.includes(normalizedTable)) ||
    (code === "PGRST205" && message.includes(normalizedTable))
  );
}

async function getRequesterRole(supabaseClient: any, userId: string) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role || null;
}

type StaffAssignment = {
  id: string;
  staff_user_id: string;
  entity_type: "studio" | "venue" | "production";
  studio_id: string | null;
  gig_id: string | null;
  production_team_id: string | null;
  access_level: number;
};

function buildStaffContext(assignment: StaffAssignment | null) {
  if (!assignment) return null;
  const effectiveRole =
    assignment.entity_type === "studio"
      ? "studio-owner"
      : assignment.entity_type === "venue"
        ? "venue-owner"
        : "producer";
  const targetId =
    assignment.entity_type === "studio"
      ? assignment.studio_id
      : assignment.entity_type === "venue"
        ? assignment.gig_id
        : assignment.production_team_id;

  return {
    id: assignment.id,
    entity_type: assignment.entity_type,
    access_level: assignment.access_level,
    effective_role: effectiveRole,
    target_id: targetId,
    studio_id: assignment.studio_id,
    gig_id: assignment.gig_id,
    production_team_id: assignment.production_team_id,
    can_edit_listing: assignment.access_level === 1,
    can_manage_bookings: assignment.access_level === 1 || assignment.access_level === 2,
    view_only: assignment.access_level === 3,
  };
}

async function getActiveStaffAssignment(supabaseAdmin: any, userId: string): Promise<StaffAssignment | null> {
  const { data, error } = await supabaseAdmin
    .from("staff_listing_access")
    .select("id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level")
    .eq("staff_user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "staff_listing_access")) return null;
    throw error;
  }

  if (!data) return null;
  const entityType = String(data.entity_type || "").trim();
  const level = Number(data.access_level);

  if (
    !["studio", "venue", "production"].includes(entityType) ||
    ![1, 2, 3].includes(level)
  ) {
    return null;
  }

  return {
    id: data.id,
    staff_user_id: data.staff_user_id,
    entity_type: entityType as StaffAssignment["entity_type"],
    studio_id: data.studio_id || null,
    gig_id: data.gig_id || null,
    production_team_id: data.production_team_id || null,
    access_level: level,
  };
}

async function getStaffAccessForStudio(supabaseAdmin: any, userId: string, studioId: string) {
  const { data, error } = await supabaseAdmin
    .from("staff_listing_access")
    .select("access_level")
    .eq("staff_user_id", userId)
    .eq("entity_type", "studio")
    .eq("studio_id", studioId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "staff_listing_access")) return null;
    throw error;
  }

  return data?.access_level ? Number(data.access_level) : null;
}

async function getStaffAccessForGig(supabaseAdmin: any, userId: string, gigId: string) {
  const { data, error } = await supabaseAdmin
    .from("staff_listing_access")
    .select("access_level")
    .eq("staff_user_id", userId)
    .eq("entity_type", "venue")
    .eq("gig_id", gigId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "staff_listing_access")) return null;
    throw error;
  }

  return data?.access_level ? Number(data.access_level) : null;
}

async function getStaffAccessForProduction(supabaseAdmin: any, userId: string, teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("staff_listing_access")
    .select("access_level")
    .eq("staff_user_id", userId)
    .eq("entity_type", "production")
    .eq("production_team_id", teamId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "staff_listing_access")) return null;
    throw error;
  }

  return data?.access_level ? Number(data.access_level) : null;
}

const GIG_APPLICATION_BOOKING_SELECT = `
  *,
  gig:gig_id(name, event_date, location, organizer_id, organizer:organizer_id(avatar_url), gig_media(media_url, sort_order)),
  group:group_id(id, name, group_type, owner_id),
  production_team:production_team_id(id, name, logo_url),
  production_roster:production_roster_id(
    id,
    entity_kind,
    profile_id,
    group_id,
    roster_profile:profile_id(id, full_name, avatar_url),
    roster_group:group_id(id, name, group_type, owner_id)
  )
`;

function toStringId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getReadOnlyApplicationViewer(
  viewer_access: "selected_performer" | "group_member",
): GigApplicationAudienceMember {
  return {
    user_id: "",
    viewer_access,
    viewer_can_act: false,
    viewer_read_only_reason:
      viewer_access === "selected_performer"
        ? "This application was submitted by a production team on your behalf."
        : "You can view this application because you are a member of the selected group or duo.",
  };
}

async function loadGroupIdsForUser(supabaseAdmin: any, userId: string) {
  const groupIds = new Set<string>();

  const { data: ownedGroups, error: ownedError } = await supabaseAdmin
    .from("groups")
    .select("id")
    .eq("owner_id", userId);

  if (ownedError) throw ownedError;
  (ownedGroups || []).forEach((group: any) => {
    if (group?.id) groupIds.add(group.id);
  });

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (membershipError) throw membershipError;
  (memberships || []).forEach((membership: any) => {
    if (membership?.group_id) groupIds.add(membership.group_id);
  });

  return Array.from(groupIds);
}

async function loadProductionRosterIdsForMusician(
  supabaseAdmin: any,
  userId: string,
  groupIds: string[],
) {
  const rosterIds = new Set<string>();
  const soloRosterIds = new Set<string>();
  const groupRosterIds = new Set<string>();

  const { data: soloRows, error: soloError } = await supabaseAdmin
    .from("production_team_roster")
    .select("id")
    .eq("profile_id", userId);

  if (soloError) throw soloError;
  (soloRows || []).forEach((row: any) => {
    if (row?.id) {
      rosterIds.add(row.id);
      soloRosterIds.add(row.id);
    }
  });

  if (groupIds.length > 0) {
    const { data: groupRows, error: groupError } = await supabaseAdmin
      .from("production_team_roster")
      .select("id")
      .in("group_id", groupIds);

    if (groupError) throw groupError;
    (groupRows || []).forEach((row: any) => {
      if (row?.id) {
        rosterIds.add(row.id);
        groupRosterIds.add(row.id);
      }
    });
  }

  return { rosterIds, soloRosterIds, groupRosterIds };
}

function mergeApplicationRows(rowGroups: any[][]) {
  const byId = new Map<string, any>();

  rowGroups.flat().forEach((row) => {
    if (row?.id && !byId.has(row.id)) {
      byId.set(row.id, row);
    }
  });

  return Array.from(byId.values()).sort(
    (a: any, b: any) =>
      new Date(b?.created_at || 0).getTime() -
      new Date(a?.created_at || 0).getTime(),
  );
}

function resolveMusicianViewerForApplication(
  app: any,
  userId: string,
  groupIds: Set<string>,
  soloRosterIds: Set<string>,
  groupRosterIds: Set<string>,
): GigApplicationAudienceMember {
  if (app?.applicant_id === userId || app?.submitted_by_user_id === userId) {
    return {
      user_id: userId,
      viewer_access: "applicant",
      viewer_can_act: true,
      viewer_read_only_reason: null,
    };
  }

  const rosterId = toStringId(app?.production_roster_id);
  if (rosterId && soloRosterIds.has(rosterId)) {
    return { ...getReadOnlyApplicationViewer("selected_performer"), user_id: userId };
  }

  if (
    (rosterId && groupRosterIds.has(rosterId)) ||
    (app?.group_id && groupIds.has(app.group_id))
  ) {
    return { ...getReadOnlyApplicationViewer("group_member"), user_id: userId };
  }

  return {
    user_id: userId,
    viewer_access: "applicant",
    viewer_can_act: true,
    viewer_read_only_reason: null,
  };
}

async function fetchGigApplicationsVisibleToMusician(
  supabaseAdmin: any,
  userId: string,
) {
  const groupIds = await loadGroupIdsForUser(supabaseAdmin, userId);
  const groupIdSet = new Set(groupIds);
  const { rosterIds, soloRosterIds, groupRosterIds } =
    await loadProductionRosterIdsForMusician(supabaseAdmin, userId, groupIds);

  const directResult = await supabaseAdmin
    .from("gig_applications")
    .select(GIG_APPLICATION_BOOKING_SELECT)
    .eq("applicant_id", userId)
    .order("created_at", { ascending: false });

  if (directResult.error) throw directResult.error;

  const rowGroups = [directResult.data || []];

  if (rosterIds.size > 0) {
    const productionResult = await supabaseAdmin
      .from("gig_applications")
      .select(GIG_APPLICATION_BOOKING_SELECT)
      .in("production_roster_id", Array.from(rosterIds))
      .order("created_at", { ascending: false });

    if (productionResult.error) throw productionResult.error;
    rowGroups.push(productionResult.data || []);
  }

  if (groupIds.length > 0) {
    const groupResult = await supabaseAdmin
      .from("gig_applications")
      .select(GIG_APPLICATION_BOOKING_SELECT)
      .in("group_id", groupIds)
      .is("production_team_id", null)
      .order("created_at", { ascending: false });

    if (groupResult.error) throw groupResult.error;
    rowGroups.push(groupResult.data || []);
  }

  const visibleRows = mergeApplicationRows(rowGroups).filter((app: any) => {
    const waitingForOwnerApproval =
      app?.leader_approval_status === "pending" &&
      app?.group?.owner_id === userId &&
      app?.applicant_id !== userId &&
      app?.submitted_by_user_id !== userId;

    return !waitingForOwnerApproval;
  });

  const visibleApplications = [];

  for (const app of visibleRows) {
    let viewer: GigApplicationAudienceMember | null = null;

    try {
      const { audience } = await resolveGigApplicationAudience(supabaseAdmin, app);
      viewer = audience.find((member) => member.user_id === userId) || null;
    } catch (audienceError) {
      console.error("Failed to resolve gig application audience:", audienceError);
    }

    visibleApplications.push({
      ...app,
      __viewer:
        viewer ||
        resolveMusicianViewerForApplication(
          app,
          userId,
          groupIdSet,
          soloRosterIds,
          groupRosterIds,
        ),
    });
  }

  return visibleApplications;
}

function getProductionApplicationType(app: any) {
  const groupType =
    app?.group?.group_type ||
    app?.production_roster?.roster_group?.group_type;
  const hasGroup =
    app?.group_id ||
    app?.production_roster?.group_id ||
    app?.production_roster?.roster_group?.id ||
    app?.production_roster?.roster_group?.name;

  if (app?.production_team?.name) {
    if (groupType === "duo") return "Production Duo Application";
    if (hasGroup) return "Production Group Application";
    return "Production Musician Application";
  }

  if (groupType === "duo") return "Duo Application";
  if (hasGroup) return "Group Application";
  return "Solo Application";
}

function getGigApplicationStatusLabel(
  status: unknown,
  fallback: unknown = status,
  completionRatePenalty = false,
) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === "pending") return "Applied";
  if (normalizedStatus === "accepted" || normalizedStatus === "approved") return "Accepted";
  if (normalizedStatus === "completed") return "Completed";
  if (normalizedStatus === "rejected") return "Declined";
  if (normalizedStatus === "cancelled" && completionRatePenalty) return "Withdrawn";
  if (normalizedStatus === "cancelled") return "Cancelled";
  if (normalizedStatus === "resigned") return "Withdrawn";
  if (normalizedStatus === "fired") return "Fired";

  return fallback || status;
}

function toNonEmptyString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

const reportTargetTableMap: Record<string, string> = {
  group: "groups",
  studio: "studios",
  venue: "studios",
  gig: "gigs",
  user: "profiles",
  profile: "profiles",
  product: "products",
  playlist: "playlists",
};

async function fetchReportTargetDetails(
  supabaseAdmin: any,
  rawTargetType: unknown,
  rawTargetId: unknown,
) {
  const targetType = String(rawTargetType || "").trim().toLowerCase();
  const targetId = String(rawTargetId || "").trim();
  const table = reportTargetTableMap[targetType] || null;

  if (!targetId) {
    return {
      type: targetType,
      id: targetId,
      table,
      record: null,
      owner_profile: null,
    };
  }

  if (!table) {
    return {
      type: targetType,
      id: targetId,
      table: null,
      record: null,
      owner_profile: null,
    };
  }

  const { data: record, error: recordError } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("id", targetId)
    .maybeSingle();

  if (recordError) throw recordError;

  if (targetType === "profile" || targetType === "user") {
    return {
      type: targetType,
      id: targetId,
      table,
      record: record || null,
      owner_profile: record || null,
    };
  }

  const ownerId = String(
    record?.owner_id ||
      record?.organizer_id ||
      record?.seller_id ||
      record?.creator_id ||
      record?.user_id ||
      "",
  ).trim();

  let ownerProfile = null;
  if (ownerId) {
    const { data: ownerRow, error: ownerError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle();

    if (ownerError) throw ownerError;
    ownerProfile = ownerRow || null;
  }

  return {
    type: targetType,
    id: targetId,
    table,
    record: record || null,
    owner_profile: ownerProfile,
  };
}

async function autoStartBookingsAndNotify(
  supabaseAdmin: any,
  userId: string,
  userRole: string,
) {
  const { date: todayManila, time: nowManilaTime } = getManilaNowParts();

  let studioIds: string[] = [];
  if (userRole === "studio-owner") {
    const { data: ownerStudios } = await supabaseAdmin
      .from("studios")
      .select("id")
      .eq("owner_id", userId);

    studioIds = (ownerStudios || []).map((studio: any) => studio.id);
    if (studioIds.length === 0) return;
  }

  let bookingQuery = supabaseAdmin
    .from("studio_bookings")
    .select(
      "id, user_id, studio_id, booking_date, start_time, end_time, status, studio:studios(name, owner_id)",
    )
    .eq("status", "confirmed")
    .eq("booking_date", todayManila);

  if (userRole === "musician") {
    bookingQuery = bookingQuery.eq("user_id", userId);
  } else if (userRole === "studio-owner") {
    bookingQuery = bookingQuery.in("studio_id", studioIds);
  } else {
    return;
  }

  const { data: bookings, error: bookingError } = await bookingQuery;
  if (bookingError || !bookings || bookings.length === 0) return;

  for (const booking of bookings) {
    const startTime = normalizeTime(booking.start_time);
    const endTime = normalizeTime(booking.end_time);

    if (nowManilaTime < startTime || nowManilaTime >= endTime) {
      continue;
    }

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("studio_bookings")
      .update({
        status: "checked_in",
        check_in_time: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle();

    if (updateError || !updatedBooking) {
      continue;
    }

    const studioName = booking.studio?.name || "the studio";
    const image = null;
    const recipients = [booking.user_id, booking.studio?.owner_id].filter(
      Boolean,
    ) as string[];

    for (const recipientId of [...new Set(recipients)]) {
      const isCustomer = recipientId === booking.user_id;
      await insertNotificationIfMissing(supabaseAdmin, {
        user_id: recipientId,
        type: "info",
        title: "Booking Started",
        message: isCustomer
          ? `Your booking at ${studioName} has started.`
          : `A booking at ${studioName} has started.`,
        image,
        meta: {
          booking_id: booking.id,
          studio_id: booking.studio_id,
          booking_date: booking.booking_date,
          event_type: "booking_auto_started",
        },
      });
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader) {
      return new Response(JSON.stringify({ code: 401, message: "Missing Authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Service role client for cross-user notifications
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user: authUser },
      error: authUserError,
    } = await supabaseClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));

    if (authUserError || !authUser) {
      return new Response(JSON.stringify({ code: 401, message: "Invalid JWT" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { action, ...params } = await req.json();

    // 1. FETCH BOOKINGS & APPLICATIONS
    if (action === "fetch") {
      const { userId } = params;

      if (userId && userId !== authUser.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      // First, get user role to determine what to fetch
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", userId || authUser.id)
        .single();

      if (profileError) throw profileError;

      const userRole = profile?.role;
      const requesterId = userId || authUser.id;
      let activityRole = userRole;
      let staffAssignment: StaffAssignment | null = null;
      let staffContext: ReturnType<typeof buildStaffContext> = null;

      if (userRole === "staff") {
        staffAssignment = await getActiveStaffAssignment(supabaseAdmin, requesterId);
        staffContext = buildStaffContext(staffAssignment);
        activityRole = staffContext?.effective_role || "staff";
      }

      if (userRole === "musician" || userRole === "studio-owner") {
        await autoStartBookingsAndNotify(supabaseAdmin, userId, userRole);
      }

      const categorized = {
        Pending: [],
        Upcoming: [],
        Ongoing: [],
        Review: [],
      };

      const now = new Date();

      // A. For Musicians: Fetch their Studio Bookings as customers
      if (activityRole === "musician") {
        const { data: bookings, error: bookingError } = await supabaseClient
          .from("studio_bookings")
          .select("*, studio:studios(name, owner_id, studio_media(media_url, sort_order))")
          .eq("user_id", userId)
          .order("booking_date", { ascending: false });

        if (bookingError) throw bookingError;

        const openIncidentBookingIds = new Set<string>();
        const musicianBookingIds = (bookings || [])
          .map((booking: any) => booking.id)
          .filter(Boolean);

        if (musicianBookingIds.length > 0) {
          const { data: openIncidents, error: incidentError } = await supabaseClient
            .from("booking_incidents")
            .select("booking_id")
            .in("booking_id", musicianBookingIds)
            .in("status", ["open", "responded", "manual_review"]);

          if (incidentError) {
            if (!isMissingTableError(incidentError, "booking_incidents")) {
            }
          } else {
            (openIncidents || []).forEach((incident: any) => {
              if (incident?.booking_id) {
                openIncidentBookingIds.add(incident.booking_id);
              }
            });
          }
        }

        // Process Studio Bookings
        // @ts-ignore
        bookings?.forEach((b: any) => {
          const bookingDate = new Date(`${b.booking_date}T${b.start_time}`);
          const endDate = new Date(`${b.booking_date}T${b.end_time}`);
          const isVenue = false;

          // DEBUG: Log date parsing for first few items
          // undefined

          // Determine status text - for pending bookings, check if payment is needed
          const isUnpaid = b.status === "pending" && (!b.payment_status || b.payment_status === "unpaid" || b.payment_status === "pending" || b.payment_status === "failed");

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
                        ? String(b.payment_status || "").toLowerCase() === "refunded" || toMoneyNumber(b.refund_amount) > 0
                          ? "Refunded"
                          : "Declined"
                        : b.status,
            type: isVenue ? "Gig Booking" : "Studio Booking",
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
            has_open_incident: openIncidentBookingIds.has(b.id),
            // Payment-related fields for musician to see payment status
            payment_status: b.payment_status || "unpaid",
            payment_amount: b.payment_amount || b.final_price,
            payment_type: b.payment_type || null,
            remaining_balance: b.remaining_balance || 0,
            refund_amount: toMoneyNumber(b.refund_amount),
            refunded_at: b.refunded_at || null,
            studio_owner_id: b.studio?.owner_id || null,
            relocation_requested_at: b.relocation_requested_at,
            relocation_expires_at: b.relocation_expires_at,
            relocation_proposed_date: b.relocation_proposed_date,
            relocation_proposed_start_time: b.relocation_proposed_start_time,
            relocation_proposed_end_time: b.relocation_proposed_end_time,
          };

          if (b.status === "pending" || b.status === "pending_relocation") {
            // @ts-ignore
            categorized.Pending.push(item);
          } else if (b.status === "confirmed") {
            if (now > endDate) {
              // AUTO-COMPLETE: If confirmed and time passed, treat as Completed (Review)
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            } else if (now >= bookingDate && now <= endDate) {
              // AUTO-ONGOING: If current time is within the booking window, treat as In Progress
              // @ts-ignore
              categorized.Ongoing.push({ ...item, status: "In Progress" });
            } else {
              // @ts-ignore
              categorized.Upcoming.push(item);
            }
          } else if (b.status === "checked_in") {
            if (now > endDate) {
              // AUTO-COMPLETE: If checked_in and time passed, it's done. Move to Review.
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            } else {
              // STRICT Ongoing Check
              // @ts-ignore
              categorized.Ongoing.push({ ...item, status: "In Progress" });
            }
          } else if (b.status === "completed") {
            // Completed bookings that need review
            if (!b.reviewed_by_customer) {
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            }
          } else if (b.status === "cancelled") {
            // @ts-ignore
            categorized.Upcoming.push(item);
          }
        });
      }

      // B. For Studio Owners: Fetch bookings for THEIR studios
      if (activityRole === "studio-owner") {
        // First get their studios
        const studioIds = staffAssignment?.entity_type === "studio" && staffAssignment.studio_id
          ? [staffAssignment.studio_id]
          : ((await supabaseClient
            .from("studios")
            .select("id")
            .eq("owner_id", requesterId)).data || []).map((s: any) => s.id);
        const staffCanAct = !staffContext || staffContext.can_manage_bookings;

        if (studioIds.length > 0) {
          const { data: bookings, error: bookingError } = await supabaseClient
            .from("studio_bookings")
            .select(
              "*, studio:studios(name, owner_id, studio_media(media_url, sort_order)), profile:user_id(full_name, avatar_url, email, contact_number, address)",
            )
            .in("studio_id", studioIds)
            .order("booking_date", { ascending: false });

          if (bookingError) throw bookingError;

          const lateReportByBooking = new Map<string, { count: number; latestAt: string | null }>();
          const openIncidentBookingIds = new Set<string>();
          const bookingIds = (bookings || []).map((booking: any) => booking.id).filter(Boolean);

          if (bookingIds.length > 0) {
            const { data: lateEvents, error: lateEventsError } = await supabaseClient
              .from("booking_attendance_events")
              .select("booking_id, created_at")
              .in("booking_id", bookingIds)
              .eq("event_type", "late")
              .order("created_at", { ascending: false });

            if (lateEventsError) {
            } else {
              (lateEvents || []).forEach((event: any) => {
                const existing = lateReportByBooking.get(event.booking_id);
                if (existing) {
                  existing.count += 1;
                  if (event.created_at && (!existing.latestAt || event.created_at > existing.latestAt)) {
                    existing.latestAt = event.created_at;
                  }
                } else {
                  lateReportByBooking.set(event.booking_id, {
                    count: 1,
                    latestAt: event.created_at || null,
                  });
                }
              });
            }

            const { data: openIncidents, error: incidentError } = await supabaseClient
              .from("booking_incidents")
              .select("booking_id")
              .in("booking_id", bookingIds)
              .in("status", ["open", "responded", "manual_review"]);

            if (incidentError) {
              if (!isMissingTableError(incidentError, "booking_incidents")) {
              }
            } else {
              (openIncidents || []).forEach((incident: any) => {
                if (incident?.booking_id) {
                  openIncidentBookingIds.add(incident.booking_id);
                }
              });
            }
          }

          // Process Studio Bookings
          // @ts-ignore
          bookings?.forEach((b: any) => {
            const bookingDate = new Date(`${b.booking_date}T${b.start_time}`);
            const endDate = new Date(`${b.booking_date}T${b.end_time}`);
            const lateReportMeta = lateReportByBooking.get(b.id);

            const customerName =
              b.profile?.full_name || b.profile?.email || "Guest";
            const customerAvatar =
              b.profile?.avatar_url ||
              "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop";

            const isVenue = false;

            // For studio owner: show payment status for pending bookings
            const isUnpaid = b.status === "pending" && (!b.payment_status || b.payment_status === "unpaid" || b.payment_status === "pending" || b.payment_status === "failed");

            const item = {
              id: b.id,
              type_id: "studio_booking",
              created_at: b.created_at || null,
              checkout_session_id: b.checkout_session_id || null,
              studio_id: b.studio_id,
              user_id: b.user_id, // The musician who booked
              raw_date: b.booking_date,
              start_time: b.start_time,
              end_time: b.end_time,
              name: `${b.studio?.name} - ${customerName}`,
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
                          ? String(b.payment_status || "").toLowerCase() === "refunded" || toMoneyNumber(b.refund_amount) > 0
                            ? "Refunded"
                            : "Declined"
                          : b.status,
              type: isVenue ? "Gig Booking" : "Studio Booking",
              isCancelled: b.status === "cancelled",
              action: b.status === "pending_relocation" ? "Awaiting musician response" : "Details", // No confirmation needed - payment auto-confirms
              raw_status: b.status,
              duration_hours: b.hours, // Use stored column
              base_rate: b.base_rate,
              total_cost: b.final_price, // Use stored column
              modifiers_applied: b.modifiers_applied || {},
              studio_type: b.studio?.studio_type || null,
              session_type: b.session_type || null,
              song_count:
                b.song_count ||
                b.modifiers_applied?.recording_session?.song_count ||
                b.modifiers_applied?.song_count ||
                null,
              studio_name: b.studio?.name,
              notes: b.notes,
              customer_name: customerName,
              customer_avatar: customerAvatar,
              customer_contact: b.profile?.contact_number,
              customer_address: b.profile?.address,
              reviewed_by_customer: b.reviewed_by_customer || false,
              reviewed_by_owner: b.reviewed_by_owner || false,
              proof_url: b.proof_url,
              // Payment-related fields
              payment_status: b.payment_status || "unpaid",
              payment_amount: b.payment_amount || b.final_price,
              payment_type: b.payment_type || null,
              remaining_balance: b.remaining_balance || 0,
              refund_amount: toMoneyNumber(b.refund_amount),
              refunded_at: b.refunded_at || null,
              studio_owner_id: b.studio?.owner_id || null,
              relocation_requested_at: b.relocation_requested_at,
              relocation_expires_at: b.relocation_expires_at,
              relocation_proposed_date: b.relocation_proposed_date,
              relocation_proposed_start_time: b.relocation_proposed_start_time,
              relocation_proposed_end_time: b.relocation_proposed_end_time,
              has_open_incident: openIncidentBookingIds.has(b.id),
              has_late_report: Boolean(lateReportMeta),
              late_report_count: lateReportMeta?.count || 0,
              late_reported_at: lateReportMeta?.latestAt || null,
              viewer_access: staffContext ? "staff" : "studio_owner",
              viewer_can_act: staffCanAct,
              viewer_read_only_reason: staffCanAct ? null : "This staff account has view-only access.",
              staff_access_level: staffContext?.access_level || null,
            };

            if (b.status === "pending" || b.status === "pending_relocation") {
              // @ts-ignore
              categorized.Pending.push(item);
            } else if (b.status === "confirmed") {
              if (now > endDate) {
                // AUTO-COMPLETE: If confirmed and time passed, treat as Completed (Review)
                // @ts-ignore
                categorized.Review.push({ ...item, status: "Completed" });
              } else if (now >= bookingDate && now <= endDate) {
                // AUTO-ONGOING: If current time is within the booking window, treat as In Progress
                // @ts-ignore
                categorized.Ongoing.push({ ...item, status: "In Progress" });
              } else {
                // @ts-ignore
                categorized.Upcoming.push(item);
              }
            } else if (b.status === "checked_in") {
              if (now > endDate) {
                // AUTO-COMPLETE: If checked_in and time passed, it's done. Move to Review.
                // @ts-ignore
                categorized.Review.push({ ...item, status: "Completed" });
              } else {
                // STRICT Ongoing Check
                // @ts-ignore
                categorized.Ongoing.push({ ...item, status: "In Progress" });
              }
            } else if (b.status === "completed") {
              if (!b.reviewed_by_owner) {
                // @ts-ignore
                categorized.Review.push({ ...item, status: "Completed" });
              }
            } else if (b.status === "cancelled") {
              // @ts-ignore
              categorized.Upcoming.push(item);
            }
          });
        }
      }

      // C. For Musicians: Fetch Gig Applications
      if (activityRole === "musician") {
        let gigApps: any[] = [];

        try {
          gigApps = await fetchGigApplicationsVisibleToMusician(
            supabaseAdmin,
            userId,
          );
        } catch (gigError) {
          console.error("Failed to fetch visible gig applications:", gigError);
        }

        // Process Gig Applications
        // @ts-ignore
        gigApps.forEach((g: any) => {
          const normalizedStatus = (g.status || "").toLowerCase();
          const requiresReconfirmation =
            normalizedStatus === "pending" &&
            g.system_status_reason === "system_reconfirm_required_terms_changed" &&
            !!g.reconfirmation_due_at;
          const gig = g.gig;
          const viewer: GigApplicationAudienceMember = g.__viewer || {
            user_id: userId,
            viewer_access: "applicant",
            viewer_can_act: true,
            viewer_read_only_reason: null,
          };
          const dateStr =
            gig?.event_date || g.created_at?.split("T")[0] || "TBA";

          // Parse event date for time-based categorization
          let eventDate: Date | null = null;
          if (gig?.event_date) {
            eventDate = new Date(gig.event_date);
            // Assume gig ends at midnight of the same day if no end time
            eventDate.setHours(23, 59, 59, 999);
          }

          const item = {
            id: g.id,
            type_id: "gig_application",
            gig_id: g.gig_id,
            group_id: g.group_id, // Include group_id for musicians
            applicant_id: g.applicant_id,
            submitted_by_user_id: g.submitted_by_user_id,
            production_team_id: g.production_team_id,
            production_roster_id: g.production_roster_id,
            production_team_name: g.production_team?.name || null,
            raw_status: g.status,
            reconfirmation_required_at: g.reconfirmation_required_at || null,
            reconfirmation_due_at: g.reconfirmation_due_at || null,
            system_status_reason: g.system_status_reason || null,
            requires_reconfirmation: requiresReconfirmation,
            viewer_access: viewer.viewer_access,
            viewer_can_act: viewer.viewer_can_act,
            viewer_read_only_reason: viewer.viewer_read_only_reason || null,
            performer:
              g.group?.name ||
              g.production_roster?.roster_profile?.full_name ||
              g.production_roster?.roster_group?.name ||
              null,
            raw_date: dateStr,
            start_time: gig?.event_date, // Add for consistency
            name: gig?.name || "Unknown Gig",
            date: dateStr,
            image:
              gig?.gig_media
                ?.sort((a: any, b: any) => a.sort_order - b.sort_order)[0]
                ?.media_url ||
              gig?.organizer?.avatar_url ||
              "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400&h=200&fit=crop",
            status: requiresReconfirmation
              ? "Reconfirmation Required"
              : getGigApplicationStatusLabel(normalizedStatus, g.status, g.completion_rate_penalty === true),
            type: getProductionApplicationType(g),
            isCancelled:
              normalizedStatus === "cancelled" ||
              normalizedStatus === "rejected" ||
              normalizedStatus === "fired",
            action:
              viewer.viewer_can_act === false || normalizedStatus === "accepted" || normalizedStatus === "approved"
                ? "View Details"
                : requiresReconfirmation
                  ? "Reconfirm"
                  : "Details",
            location: gig?.location,
            pitch_message: g.pitch_message,
            video_url: g.video_url,
            cv_url: g.cv_url,
            slot_type: g.slot_type,
            reviewed_by_applicant: g.reviewed_by_applicant || false,
            feature_consent_status: g.feature_consent_status || "not_requested",
            show_on_gig_page: g.show_on_gig_page === true,
            show_on_profile: g.show_on_profile === true,
          };

          if (normalizedStatus === "pending") {
            // @ts-ignore
            categorized.Pending.push(item);
          } else if (normalizedStatus === "accepted" || normalizedStatus === "approved") {
            // Time-based categorization for accepted gigs
            if (eventDate) {
              const eventStart = new Date(gig.event_date);
              eventStart.setHours(0, 0, 0, 0); // Start of event day

              if (now >= eventStart && now <= eventDate) {
                // Gig is happening today
                // @ts-ignore
                categorized.Ongoing.push({ ...item, status: "Happening Now" });
              } else if (now > eventDate) {
                // Keep completed accepted gigs visible for My Gig and history.
                // @ts-ignore
                categorized.Review.push({ ...item, status: "Completed" });
              } else {
                // Gig is in the future
                // @ts-ignore
                categorized.Upcoming.push(item);
              }
            } else {
              // No event date, put in Upcoming by default
              // @ts-ignore
              categorized.Upcoming.push(item);
            }
          } else if (
            normalizedStatus === "rejected" ||
            normalizedStatus === "cancelled" ||
            normalizedStatus === "resigned" ||
            normalizedStatus === "fired"
          ) {
            // @ts-ignore
            categorized.Review.push({
              ...item,
              status: getGigApplicationStatusLabel(
                normalizedStatus,
                g.status,
                g.completion_rate_penalty === true,
              ),
            });
          } else if (normalizedStatus === "completed") {
            // @ts-ignore
            categorized.Review.push({ ...item, status: "Completed" });
          }
        });

        // Leader confirmation queue: applications submitted by members to leader-owned groups
        const { data: leaderPendingApps, error: leaderPendingError } = await supabaseClient
          .from("gig_applications")
          .select(
            "*, gig:gig_id(name, event_date, location), group:group_id(id, name, group_type, owner_id), submitter:submitted_by_user_id(full_name, avatar_url)",
          )
          .eq("status", "pending")
          .eq("leader_approval_status", "pending")
          .neq("submitted_by_user_id", userId)
          .order("created_at", { ascending: false });

        if (leaderPendingError) {
        }

        // @ts-ignore
        leaderPendingApps?.forEach((app: any) => {
          if (app.group?.owner_id !== userId) return;

          const gig = app.gig;
          const dateStr = gig?.event_date || app.created_at?.split("T")[0] || "TBA";
          const performerName = app.group?.name || "Group";
          const submitterName = app.submitter?.full_name || "Group Member";

          const item = {
            id: app.id,
            type_id: "gig_application",
            leader_approval_required: true,
            gig_id: app.gig_id,
            group_id: app.group_id,
            applicant_id: app.applicant_id,
            submitted_by_user_id: app.submitted_by_user_id,
            performer: performerName,
            customer_name: submitterName,
            raw_date: dateStr,
            start_time: gig?.event_date,
            name: gig?.name || "Unknown Gig",
            date: dateStr,
            image:
              app.submitter?.avatar_url ||
              "https://picsum.photos/400/300",
            status: "Awaiting Your Approval",
            type: app.group?.group_type === "duo" ? "Duo Application" : "Group Application",
            isCancelled: false,
            action: "Review",
            location: gig?.location,
            pitch_message: app.pitch_message,
            video_url: app.video_url,
            cv_url: app.cv_url,
            created_at: app.created_at,
          };

          // @ts-ignore
          categorized.Pending.push(item);
        });
      }

      // C2. For Producers: Fetch production-routed gig applications
      if (activityRole === "producer") {
        const teamMembershipsResult = staffAssignment?.entity_type === "production" && staffAssignment.production_team_id
          ? { data: [{ team_id: staffAssignment.production_team_id, role: `staff_level_${staffAssignment.access_level}` }], error: null }
          : await supabaseClient
            .from("production_team_members")
            .select("team_id, role")
            .eq("user_id", requesterId);
        const { data: teamMemberships, error: teamMembershipError } = teamMembershipsResult;

        if (teamMembershipError) {
        }

        const teamIds = Array.from(
          new Set((teamMemberships || []).map((row: any) => row.team_id).filter(Boolean)),
        );
        const teamRoleById = new Map(
          (teamMemberships || [])
            .filter((row: any) => row?.team_id)
            .map((row: any) => [row.team_id, row.role || "member"]),
        );

        if (teamIds.length > 0) {
          const { data: productionApps, error: productionAppsError } = await supabaseClient
            .from("gig_applications")
            .select(
              `
                *,
                gig:gig_id(name, event_date, location, organizer:organizer_id(avatar_url), gig_media(media_url, sort_order)),
                group:group_id(name, group_type),
                production_team:production_team_id(id, name, logo_url),
                production_roster:production_roster_id(
                  id,
                  entity_kind,
                  roster_profile:profile_id(full_name, avatar_url),
                  roster_group:group_id(name, group_type)
                )
              `,
            )
            .in("production_team_id", teamIds)
            .order("created_at", { ascending: false });

          if (productionAppsError) {
          }

          productionApps?.forEach((app: any) => {
            const normalizedStatus = (app.status || "").toLowerCase();
            const requiresReconfirmation =
              normalizedStatus === "pending" &&
              app.system_status_reason === "system_reconfirm_required_terms_changed" &&
              !!app.reconfirmation_due_at;
            const gig = app.gig;
            const teamRole = teamRoleById.get(app.production_team_id) || "member";
            const canManageApplication =
              staffContext
                ? staffContext.can_manage_bookings
                : ["owner", "manager"].includes(String(teamRole)) ||
                  app.applicant_id === requesterId ||
                  app.submitted_by_user_id === requesterId;
            const dateStr = gig?.event_date || app.created_at?.split("T")[0] || "TBA";
            const performerName =
              app.group?.name ||
              app.production_roster?.roster_profile?.full_name ||
              app.production_roster?.roster_group?.name ||
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
              production_roster_id: app.production_roster_id,
              production_team_name: app.production_team?.name || null,
              raw_status: app.status,
              reconfirmation_required_at: app.reconfirmation_required_at || null,
              reconfirmation_due_at: app.reconfirmation_due_at || null,
              system_status_reason: app.system_status_reason || null,
              requires_reconfirmation: requiresReconfirmation,
              viewer_access: canManageApplication ? "production_manager" : "group_member",
              viewer_can_act: canManageApplication,
              viewer_read_only_reason: canManageApplication
                ? null
                : "Only production owners or managers can act on this application.",
              performer: performerName,
              customer_name: performerName,
              raw_date: dateStr,
              start_time: gig?.event_date,
              name: gig?.name || "Unknown Gig",
              date: dateStr,
              image:
                app.production_roster?.roster_profile?.avatar_url ||
                app.production_team?.logo_url ||
                gig?.organizer?.avatar_url ||
                "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400&h=200&fit=crop",
              status: requiresReconfirmation
                ? "Reconfirmation Required"
                : getGigApplicationStatusLabel(normalizedStatus, app.status),
              type: getProductionApplicationType(app),
              isCancelled:
                normalizedStatus === "cancelled" ||
                normalizedStatus === "rejected" ||
                normalizedStatus === "fired",
            action:
              !canManageApplication || normalizedStatus === "accepted" || normalizedStatus === "approved"
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
              staff_access_level: staffContext?.access_level || null,
            };

            if (normalizedStatus === "pending") {
              // @ts-ignore
              categorized.Pending.push(item);
            } else if (normalizedStatus === "accepted" || normalizedStatus === "approved") {
              if (eventDate) {
                const eventStart = new Date(gig.event_date);
                eventStart.setHours(0, 0, 0, 0);

                if (now >= eventStart && now <= eventDate) {
                  // @ts-ignore
                  categorized.Ongoing.push({ ...item, status: "Happening Now" });
                } else if (now > eventDate) {
                  // Keep completed accepted gigs visible for My Gig and history.
                  // @ts-ignore
                  categorized.Review.push({ ...item, status: "Completed" });
                } else {
                  // @ts-ignore
                  categorized.Upcoming.push(item);
                }
              } else {
                // @ts-ignore
                categorized.Upcoming.push(item);
              }
            } else if (
              normalizedStatus === "rejected" ||
              normalizedStatus === "cancelled" ||
              normalizedStatus === "resigned" ||
              normalizedStatus === "fired"
            ) {
              // @ts-ignore
              categorized.Review.push({
                ...item,
                status: getGigApplicationStatusLabel(normalizedStatus, app.status),
              });
            } else if (normalizedStatus === "completed") {
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            }
          });
        }
      }

      // D. For Gig Owners: Fetch pending and resolved applications for their gigs
      if (activityRole === "venue-owner") {
        // First get their gigs
        const { data: gigs } = staffAssignment?.entity_type === "venue" && staffAssignment.gig_id
          ? await supabaseClient
            .from("gigs")
            .select("id, name, event_date, location")
            .eq("id", staffAssignment.gig_id)
          : await supabaseClient
            .from("gigs")
            .select("id, name, event_date, location")
            .eq("organizer_id", requesterId);

        const gigIds = gigs?.map((g: any) => g.id) || [];
        const staffCanAct = !staffContext || staffContext.can_manage_bookings;

        if (gigIds.length > 0) {
          const { data: acceptedApps, error: appError } = await supabaseClient
            .from("gig_applications")
            .select(
              `
                            *,
                            applicant:applicant_id(full_name, avatar_url),
                            submitter:submitted_by_user_id(full_name, avatar_url),
                            group:group_id(name, group_type),
                            production_team:production_team_id(id, name, logo_url),
                            production_roster:production_roster_id(
                              id,
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

          if (appError) {
          }

          // Process accepted applications
          acceptedApps?.forEach((app: any) => {
            const normalizedStatus = String(app.status || "").toLowerCase();
            const requiresReconfirmation =
              normalizedStatus === "pending" &&
              app.system_status_reason === "system_reconfirm_required_terms_changed" &&
              !!app.reconfirmation_due_at;
            const gig = gigs?.find((g: any) => g.id === app.gig_id);
            const dateStr = gig?.event_date || "TBA";
            const performerName =
              app.group?.name ||
              app.production_roster?.roster_profile?.full_name ||
              app.production_roster?.roster_group?.name ||
              app.applicant?.full_name ||
              "Performer";

            // Parse event date for time-based categorization
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
              group_id: app.group_id, // Include group_id
              applicant_id: app.applicant_id, // For renew contract
              user_id: app.applicant_id, // For profile link
              submitted_by_user_id: app.submitted_by_user_id,
              production_team_id: app.production_team_id,
              production_roster_id: app.production_roster_id,
              production_team_name: app.production_team?.name || null,
              raw_status: app.status,
              reconfirmation_required_at: app.reconfirmation_required_at || null,
              reconfirmation_due_at: app.reconfirmation_due_at || null,
              system_status_reason: app.system_status_reason || null,
              requires_reconfirmation: requiresReconfirmation,
              viewer_access: staffContext ? "staff" : "organizer",
              viewer_can_act: staffCanAct,
              viewer_read_only_reason: staffCanAct ? null : "This staff account has view-only access.",
              submitted_by_name: app.submitter?.full_name || null,
              raw_date: dateStr,
              name: `${gig?.name || "Gig"} - ${performerName}`,
              date: dateStr,
              image:
                app.group?.images?.[0] ||
                app.production_roster?.roster_profile?.avatar_url ||
                app.production_team?.logo_url ||
                app.applicant?.avatar_url ||
                "https://picsum.photos/400/300",
              status:
                requiresReconfirmation
                  ? "Needs Reconfirmation"
                  : app.status === "pending"
                    ? "Action Required"
                    : app.status === "accepted" || app.status === "approved"
                    ? "Confirmed"
                    : getGigApplicationStatusLabel(app.status, app.status, app.completion_rate_penalty === true),
              type: getProductionApplicationType(app),
              isCancelled: app.status === "rejected" || app.status === "cancelled" || app.status === "fired",
              action: app.status === "pending" ? "Confirm Now" : "View Details",
              location: gig?.location,
              performer: performerName,
              customer_name: performerName,
              customer_avatar:
                app.group?.images?.[0] ||
                app.production_roster?.roster_profile?.avatar_url ||
                app.applicant?.avatar_url,
              video_url: app.video_url,
              cv_url: app.cv_url, // Added CV URL
              note: app.note,
              pitch_message: app.pitch_message, // Added pitch message
              group_members: [], // Include group members for display
              reviewed_by_organizer: app.reviewed_by_organizer || false,
              staff_access_level: staffContext?.access_level || null,
            };

            if (app.status === "pending") {
              // @ts-ignore
              categorized.Pending.push(item);
            } else if (app.status === "accepted" || app.status === "approved") {
              if (eventDate) {
                const eventStart = new Date(gig.event_date);
                eventStart.setHours(0, 0, 0, 0);

                if (now >= eventStart && now <= eventDate) {
                  // Gig is happening today - Ongoing
                  // @ts-ignore
                  categorized.Ongoing.push({
                    ...item,
                    status: "Happening Now",
                  });
                } else if (now > eventDate) {
                  // Past accepted contracts pause in Review before moving to History.
                  // @ts-ignore
                  categorized.Review.push({ ...item, status: "Completed" });
                } else {
                  // Future accepted musicians stay active.
                  // @ts-ignore
                  categorized.Upcoming.push(item);
                }
              } else {
                // No event date, put in Upcoming by default
                // @ts-ignore
                categorized.Upcoming.push(item);
              }
            } else if (app.status === "rejected" || app.status === "cancelled" || app.status === "resigned" || app.status === "fired") {
              // Terminal applications go to the gig owner's history bucket.
              // @ts-ignore
              categorized.Review.push({
                ...item,
                status: getGigApplicationStatusLabel(app.status, app.status, app.completion_rate_penalty === true),
              });
            } else if (app.status === "completed") {
              // Completed contracts go to the gig owner's history bucket - can be renewed.
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            }
          });
        }
      }

      if (params.includeScreenPayload === true) {
        const loadPendingPermitListings = async () => {
          if (activityRole !== "studio-owner" && activityRole !== "venue-owner") {
            return [];
          }

          const permitTable = activityRole === "studio-owner" ? "studios" : "gigs";
          const permitOwnerField = activityRole === "studio-owner" ? "owner_id" : "organizer_id";
          let permitQuery = supabaseClient
            .from(permitTable)
            .select("id, name, permit_status, permit_rejection_reason, permit_resubmissions_used, permit_reviewed_at, created_at")
            .in("permit_status", ["pending", "pending_review", "resubmitted", "rejected"])
            .order("created_at", { ascending: false });

          if (staffContext?.target_id) {
            permitQuery = permitQuery.eq("id", staffContext.target_id);
          } else {
            permitQuery = permitQuery.eq(permitOwnerField, requesterId);
          }

          const { data: permitRows, error: permitError } = await permitQuery;

          if (permitError) throw permitError;

          return (permitRows || []).map((row: any) => ({
            ...row,
            entity_type: activityRole === "studio-owner" ? "studio" : "gig",
          }));
        };

        const connectionRequestSelect =
          "id, created_at, sender_id, receiver_id, group_id, studio_id, message, status, event_details, attachment_url";
        const loadOwnedGroupIds = async () => {
          if (staffContext) return [];

          const { data: ownedGroups, error: ownedGroupsError } = await supabaseClient
            .from("groups")
            .select("id")
            .eq("owner_id", requesterId);

          if (ownedGroupsError) throw ownedGroupsError;

          return Array.from(
            new Set((ownedGroups || []).map((group: any) => group?.id).filter(Boolean)),
          );
        };

        const [pendingPermitListings, ownedGroupIds] = await Promise.all([
          loadPendingPermitListings(),
          loadOwnedGroupIds(),
        ]);

        const requestResults = await Promise.all(
          staffContext?.entity_type === "studio" && staffContext.studio_id
            ? [
                supabaseClient
                  .from("booking_requests")
                  .select(connectionRequestSelect)
                  .eq("studio_id", staffContext.studio_id)
                  .in("status", ["pending", "accepted", "approved", "connected", "rejected", "declined", "cancelled"])
                  .order("created_at", { ascending: false })
                  .limit(40),
              ]
            : [
                supabaseClient
                  .from("booking_requests")
                  .select(connectionRequestSelect)
                  .or(`sender_id.eq.${requesterId},receiver_id.eq.${requesterId}`)
                  .in("status", ["pending", "accepted", "approved", "connected", "rejected", "declined", "cancelled"])
                  .order("created_at", { ascending: false })
                  .limit(40),
                ...(ownedGroupIds.length > 0
                  ? [
                      supabaseClient
                        .from("booking_requests")
                        .select(connectionRequestSelect)
                        .in("group_id", ownedGroupIds)
                        .in("status", ["pending", "accepted", "approved", "connected", "rejected", "declined", "cancelled"])
                        .order("created_at", { ascending: false })
                        .limit(40),
                    ]
                  : []),
              ],
        );

        const connectionRequestsById = new Map<string, any>();
        requestResults.forEach((result) => {
          if (result.error) throw result.error;
          (result.data || []).forEach((request: any) => {
            if (request?.id && !connectionRequestsById.has(request.id)) {
              connectionRequestsById.set(request.id, request);
            }
          });
        });

        const connectionRequests = Array.from(connectionRequestsById.values()).sort(
          (a: any, b: any) =>
            new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime(),
        );

        const connectionProfileIds = Array.from(
          new Set(
            connectionRequests
              .flatMap((request: any) => [request.sender_id, request.receiver_id])
              .filter(Boolean),
          ),
        );
        const studioBookingIds = Array.from(
          new Set(
            [
              ...categorized.Pending,
              ...categorized.Upcoming,
              ...categorized.Ongoing,
              ...categorized.Review,
            ]
              .filter((item: any) => item?.type_id === "studio_booking")
              .map((item: any) => item?.id)
              .filter(Boolean),
          ),
        );

        const [connectionRequestProfilesResult, lateAttendanceEventsResult] = await Promise.all([
          connectionProfileIds.length > 0
            ? supabaseClient
                .from("profiles")
                .select("id, full_name, avatar_url")
                .in("id", connectionProfileIds)
            : Promise.resolve({ data: [], error: null }),
          studioBookingIds.length > 0
            ? supabaseClient
                .from("booking_attendance_events")
                .select("booking_id, reporter_user_id, notes, created_at")
                .in("booking_id", studioBookingIds)
                .eq("event_type", "late")
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (connectionRequestProfilesResult.error) throw connectionRequestProfilesResult.error;
        if (lateAttendanceEventsResult.error) throw lateAttendanceEventsResult.error;

        return new Response(JSON.stringify({
          ...categorized,
          categorized,
          role: activityRole,
          profile_role: userRole,
          staff_context: staffContext,
          ownedGroupIds,
          pendingPermitListings,
          connectionRequests,
          connectionRequestProfiles: connectionRequestProfilesResult.data || [],
          lateAttendanceEvents: lateAttendanceEventsResult.data || [],
          fetchedAt: Date.now(),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      return new Response(JSON.stringify({
        ...categorized,
        categorized,
        role: activityRole,
        profile_role: userRole,
        staff_context: staffContext,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. CREATE BOOKING (Studio) - Supports multiple time slots
    if (action === "create") {
      const {
        studio_id,
        user_id,
        date,
        start_time,
        end_time,
        time_slots,
        notes,
        session_type, // "rehearsal" or "recording"
        song_count,
      } = params;

      if (!user_id || user_id !== authUser.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const normalizedSessionType =
        String(session_type || "rehearsal").toLowerCase() === "recording"
          ? "recording"
          : "rehearsal";
      const isRecordingSession = normalizedSessionType === "recording";
      const requestedSongCount = Number.isFinite(Number(song_count))
        ? Math.max(0, Math.floor(Number(song_count)))
        : 0;

      if (isRecordingSession && requestedSongCount <= 0) {
        return new Response(
          JSON.stringify({
            error: "Recording sessions require a valid song count.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      // Support both old single-slot format and new multi-slot format
      let slots: Array<{ start: string; end: string }> = [];

      if (time_slots && Array.isArray(time_slots) && time_slots.length > 0) {
        // New multi-slot format
        slots = time_slots;
      } else if (start_time && end_time) {
        // Backwards compatibility: single slot format
        slots = [{ start: start_time, end: end_time }];
      } else {
        return new Response(
          JSON.stringify({
            error:
              "Invalid booking request. Provide either time_slots array or start_time/end_time.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Validate slots are not empty
      if (slots.length === 0) {
        return new Response(
          JSON.stringify({
            error: "At least one time slot is required.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      slots = slots
        .map((slot) => ({
          start: normalizeTime(slot?.start).slice(0, 5),
          end: normalizeTime(slot?.end).slice(0, 5),
        }))
        .filter((slot) => slot.start && slot.end);

      if (slots.length === 0) {
        return new Response(
          JSON.stringify({
            error: "At least one valid time slot is required.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { data: dateOverrides, error: dateOverrideError } =
        await supabaseClient
          .from("studio_date_overrides")
          .select("is_open, reason")
          .eq("studio_id", studio_id)
          .eq("override_date", date);

      if (dateOverrideError) {
        console.error("❌ Failed to load studio date override:", dateOverrideError);
        return new Response(
          JSON.stringify({
            error: "Failed to validate date availability. Please try again.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      if (
        Array.isArray(dateOverrides) &&
        dateOverrides.some((dateOverride: any) => dateOverride?.is_open) &&
        !dateOverrides.some((dateOverride: any) =>
          dateOverride?.is_open &&
          isSessionAllowedByDateOverride(
            dateOverride.reason,
            normalizedSessionType,
          ),
        )
      ) {
        const restrictedType = parseDateOverrideSessionType(dateOverrides[0]?.reason);
        const restrictedLabel =
          restrictedType === "recording"
            ? "recording only"
            : restrictedType === "rehearsal"
              ? "rehearsal only"
              : "the selected session type";

        return new Response(
          JSON.stringify({
            error: `This date is configured for ${restrictedLabel}. Please choose a different date or switch session type.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      let weeklyOperatingHoursForDate: any[] = [];

      if (!dateOverrides || dateOverrides.length === 0) {
        const bookingWeekDate = new Date(`${date}T00:00:00Z`);
        if (Number.isNaN(bookingWeekDate.getTime())) {
          return new Response(
            JSON.stringify({
              error: "Invalid booking date.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }

        const bookingDayOfWeek = bookingWeekDate.getUTCDay();
        const { data: weeklyOperatingHours, error: weeklyHoursError } =
          await supabaseAdmin
            .from("studio_operating_hours")
            .select("*")
            .eq("studio_id", studio_id)
            .eq("day_of_week", bookingDayOfWeek)
            .eq("is_open", true)
            .order("slot_order", { ascending: true });

        if (weeklyHoursError) {
          console.error(
            "❌ Failed to load weekly studio operating hours:",
            weeklyHoursError,
          );
          return new Response(
            JSON.stringify({
              error: "Failed to validate weekly availability. Please try again.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }

        weeklyOperatingHoursForDate = weeklyOperatingHours || [];

        if (weeklyOperatingHours && weeklyOperatingHours.length > 0) {
          const weeklyAllowsSession = weeklyOperatingHours.some((row: any) =>
            isSessionAllowedByDateOverride(row.reason, normalizedSessionType),
          );

          if (!weeklyAllowsSession) {
            const restrictedType = parseDateOverrideSessionType(
              weeklyOperatingHours[0]?.reason,
            );
            const restrictedLabel =
              restrictedType === "recording"
                ? "recording only"
                : restrictedType === "rehearsal"
                  ? "rehearsal only"
                  : "the selected session type";

            return new Response(
              JSON.stringify({
                error: `This day's weekly schedule is configured for ${restrictedLabel}. Please choose a different date or switch session type.`,
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 409,
              },
            );
          }
        }
      }

      const bookingDateStartUtc = toManilaDateTime(date, "00:00:00");
      const nowUtc = new Date();

      if (!bookingDateStartUtc) {
        return new Response(
          JSON.stringify({
            error: "Invalid booking date.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { date: todayManilaDate } = getManilaNowParts();
      const todayManilaStartUtc = toManilaDateTime(todayManilaDate, "00:00:00");

      if (!todayManilaStartUtc) {
        return new Response(
          JSON.stringify({
            error: "Server time validation failed. Please try again.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      const extendedStudioSettingsSelect =
        "lead_time_hours, booking_horizon_days, min_booking_duration_hours, recording_songs_per_block, recording_hours_per_block, weekly_schedule_scope, weekly_schedule_end_date, weekly_schedule_dates";
      const legacyStudioSettingsSelect =
        "lead_time_hours, booking_horizon_days, min_booking_duration_hours";

      let studioSettingsResult = await supabaseClient
        .from("studio_settings")
        .select(extendedStudioSettingsSelect)
        .eq("studio_id", studio_id)
        .maybeSingle();

      if (
        studioSettingsResult.error &&
        [
          "recording_songs_per_block",
          "weekly_schedule_scope",
          "weekly_schedule_end_date",
          "weekly_schedule_dates",
        ].some((column) =>
          String(studioSettingsResult.error?.message || "").includes(column),
        )
      ) {
        studioSettingsResult = await supabaseClient
          .from("studio_settings")
          .select(legacyStudioSettingsSelect)
          .eq("studio_id", studio_id)
          .maybeSingle();
      }

      const { data: studioSettingsData, error: studioSettingsError } =
        studioSettingsResult;

      if (studioSettingsError) {
        console.warn("⚠️ Could not load studio settings, using defaults:", studioSettingsError);
      }

      if (
        (!dateOverrides || dateOverrides.length === 0) &&
        !weeklyScheduleAllowsDate(
          weeklyOperatingHoursForDate.find(
            (row: any) => row?.weekly_schedule_scope,
          ) ?? weeklyOperatingHoursForDate[0],
          date,
          studioSettingsData,
        )
      ) {
        return new Response(
          JSON.stringify({
            error:
              "This date is outside the studio's weekly schedule. Please choose a date shown as available by the studio.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const leadTimeHours = Math.max(0, Number(studioSettingsData?.lead_time_hours ?? 24));
      const bookingHorizonDays = Math.max(1, Number(studioSettingsData?.booking_horizon_days ?? 90));
      const recordingRule = getRecordingRule(studioSettingsData);
      const minSlotDurationHours = 1;

      const dayDiff = Math.floor(
        (bookingDateStartUtc.getTime() - todayManilaStartUtc.getTime()) /
          (24 * 60 * 60 * 1000),
      );

      if (dayDiff < 0) {
        return new Response(
          JSON.stringify({
            error: "Cannot create a booking in the past.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      if (dayDiff > bookingHorizonDays) {
        return new Response(
          JSON.stringify({
            error: `Bookings can only be made up to ${bookingHorizonDays} day(s) in advance.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const minAllowedStartUtc = new Date(
        nowUtc.getTime() + leadTimeHours * 60 * 60 * 1000,
      );

      for (const slot of slots) {
        const slotStartUtc = toManilaDateTime(date, slot.start);
        const slotEndUtc = toManilaDateTime(date, slot.end);

        if (!slotStartUtc || !slotEndUtc || slotEndUtc <= slotStartUtc) {
          return new Response(
            JSON.stringify({
              error: `Invalid time slot: ${slot.start} - ${slot.end}.`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }

        if (slotStartUtc < nowUtc) {
          return new Response(
            JSON.stringify({
              error: "Cannot create a booking for a past time slot.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 409,
            },
          );
        }

        if (slotStartUtc < minAllowedStartUtc) {
          return new Response(
            JSON.stringify({
              error: `This studio requires at least ${leadTimeHours} hour(s) advance booking.`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 409,
            },
          );
        }

        const durationHours =
          (slotEndUtc.getTime() - slotStartUtc.getTime()) / (60 * 60 * 1000);

        if (durationHours < minSlotDurationHours) {
          return new Response(
            JSON.stringify({
              error: `Each booking slot must be at least ${minSlotDurationHours} hour(s).`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 409,
            },
          );
        }
      }

      const totalSelectedHours = slots.reduce(
        (total, slot) => total + toHours(slot.start, slot.end),
        0,
      );
      const requiredRecordingBlocks = isRecordingSession
        ? getRequiredRecordingBlocks(requestedSongCount, recordingRule)
        : 0;
      const requiredRecordingHours = isRecordingSession
        ? getRequiredRecordingHours(requestedSongCount, recordingRule)
        : 0;

      if (isRecordingSession) {
        if (totalSelectedHours + 1e-9 < requiredRecordingHours) {
          return new Response(
            JSON.stringify({
              error: `Recording booking requires at least ${formatHoursValue(requiredRecordingHours)} hour(s) across ${requiredRecordingBlocks} block(s) for ${requestedSongCount} song(s), but only ${formatHoursValue(totalSelectedHours)} hour(s) were selected.`,
              debug: {
                requested_song_count: requestedSongCount,
                songs_per_block: recordingRule.songsPerBlock,
                hours_per_block: recordingRule.hoursPerBlock,
                required_blocks: requiredRecordingBlocks,
                required_total_hours: requiredRecordingHours,
                selected_total_hours: totalSelectedHours,
              },
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 409,
            },
          );
        }
      }

      // Use multi-slot availability check
      const { data: isAvailable, error: availError } = await supabaseClient.rpc(
        "are_slots_available",
        {
          p_studio_id: studio_id,
          p_booking_date: date,
          p_time_slots: slots,
          p_user_id: user_id,
        },
      );

      if (availError) {
        console.error("❌ Availability check error:", availError);
        // Fallback to single-slot check if new function doesn't exist
        if (
          availError.message?.includes("function") ||
          availError.code === "42883"
        ) {
          // Check each slot individually using old function
          for (const slot of slots) {
            const { data: slotAvailable, error: slotError } =
              await supabaseClient.rpc("is_slot_available", {
                p_studio_id: studio_id,
                p_booking_date: date,
                p_start_time: slot.start,
                p_end_time: slot.end,
                p_user_id: user_id,
              });

            if (slotError) {
              return new Response(
                JSON.stringify({
                  error: "Availability check failed: " + slotError.message,
                }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                  status: 400,
                },
              );
            }

            if (!slotAvailable) {
              return new Response(
                JSON.stringify({
                  error: `Time slot ${slot.start} - ${slot.end} is not available.`,
                }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                  status: 409,
                },
              );
            }
          }
        } else {
          return new Response(
            JSON.stringify({
              error: "Availability check failed: " + availError.message,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }
      } else if (!isAvailable) {
        return new Response(
          JSON.stringify({
            error:
              "One or more time slots are not available. They may be outside operating hours, overlap with another booking, or the studio may be closed on this date.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409, // Conflict
          },
        );
      }


      // First, verify studio has valid rates for the requested session type
      const { data: studioData, error: studioError } = await supabaseClient
        .from("studios")
        .select("id, name, hourly_rate, recording_rate")
        .eq("id", studio_id)
        .single();

      if (studioError || !studioData) {
        console.error("❌ Studio not found:", studioError);
        return new Response(
          JSON.stringify({
            error: "Studio not found.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }


      if (isRecordingSession) {
        if (!studioData.recording_rate || studioData.recording_rate <= 0) {
          console.error(
            "❌ Studio has no valid recording rate:",
            studioData.recording_rate,
          );
          return new Response(
            JSON.stringify({
              error:
                "This studio does not have a valid recording rate configured. Please contact the studio owner.",
              debug: { studio_id, recording_rate: studioData.recording_rate },
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }
      } else if (!studioData.hourly_rate || studioData.hourly_rate <= 0) {
        console.error(
          "❌ Studio has no valid hourly rate:",
          studioData.hourly_rate,
        );
        return new Response(
          JSON.stringify({
            error:
              "This studio does not have a valid hourly rate configured. Please contact the studio owner.",
            debug: { studio_id, hourly_rate: studioData.hourly_rate },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Calculate pricing for all slots combined
      let pricingData: any = null;

      if (isRecordingSession) {
        const recordingRate = Number(studioData.recording_rate || 0);
        const recordingSubtotal = recordingRate * requestedSongCount;

        pricingData = {
          base_rate: recordingRate,
          hours: totalSelectedHours,
          total_hours: totalSelectedHours,
          subtotal: recordingSubtotal,
          modifiers: buildRecordingPricingModifiers(
            requestedSongCount,
            totalSelectedHours,
            recordingRule,
          ),
          final_price: recordingSubtotal,
        };
      }

      const { data: pricing, error: pricingError } = isRecordingSession
        ? { data: null, error: null }
        : await supabaseClient.rpc(
          "calculate_multi_slot_price",
          {
            p_studio_id: studio_id,
            p_booking_date: date,
            p_time_slots: slots,
          },
        );

      if (!isRecordingSession && pricingError) {
        console.error("❌ Multi-slot pricing error:", pricingError);
        // Fallback to calculating each slot and summing
        if (
          pricingError.message?.includes("function") ||
          pricingError.code === "42883"
        ) {
          let totalHours = 0;
          let totalPrice = 0;
          let baseRate = 0;

          for (const slot of slots) {
            const { data: slotPricing } = await supabaseClient.rpc(
              "calculate_booking_price",
              {
                p_studio_id: studio_id,
                p_booking_date: date,
                p_start_time: slot.start,
                p_end_time: slot.end,
              },
            );

            if (slotPricing && slotPricing[0]) {
              totalHours += slotPricing[0].hours || 0;
              totalPrice += slotPricing[0].final_price || 0;
              baseRate = slotPricing[0].base_rate || baseRate;
            }
          }

          pricingData = {
            base_rate: baseRate,
            hours: totalHours,
            subtotal: baseRate * totalHours,
            modifiers: {},
            final_price: totalPrice,
          };
        } else {
          return new Response(
            JSON.stringify({
              error: "Pricing calculation failed: " + pricingError.message,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }
      } else if (!isRecordingSession && pricing && pricing.length > 0) {
        pricingData = pricing[0];
      }

      if (!pricingData) {
        console.error(
          "❌ No pricing data returned, falling back to manual calculation",
        );
        if (isRecordingSession) {
          const recordingRate = Number(studioData.recording_rate || 0);
          pricingData = {
            base_rate: recordingRate,
            hours: totalSelectedHours,
            total_hours: totalSelectedHours,
            subtotal: recordingRate * requestedSongCount,
            modifiers: buildRecordingPricingModifiers(
              requestedSongCount,
              totalSelectedHours,
              recordingRule,
            ),
            final_price: recordingRate * requestedSongCount,
          };
        } else {
          pricingData = {
            base_rate: studioData.hourly_rate,
            hours: totalSelectedHours,
            total_hours: totalSelectedHours,
            subtotal: studioData.hourly_rate * totalSelectedHours,
            modifiers: {},
            final_price: studioData.hourly_rate * totalSelectedHours,
          };
        }
      }

      // Apply active promotions server-side to keep saved booking totals aligned with listing pricing.
      try {
        const promoHoursInput = Number(pricingData.total_hours || pricingData.hours || 0);
        const promoBasePrice = Number(
          pricingData.final_price || pricingData.subtotal || 0,
        );

        if (promoBasePrice > 0) {
          const { data: promoResult, error: promoError } = await supabaseClient.rpc(
            "apply_studio_promotion",
            {
              p_studio_id: studio_id,
              p_booking_date: date,
              p_session_type: normalizedSessionType,
              p_base_price: promoBasePrice,
              p_hours: promoHoursInput,
            },
          );

          if (promoError) {
            console.warn("⚠️ Promotion apply error, proceeding without promo:", promoError);
          } else if (
            promoResult &&
            Number.isFinite(Number(promoResult.final_price_after_promo))
          ) {
            pricingData = {
              ...pricingData,
              final_price: Number(promoResult.final_price_after_promo),
              modifiers: {
                ...(pricingData.modifiers || {}),
                promotion: promoResult,
              },
            };
          }
        }
      } catch (promoCatchError) {
        console.warn("⚠️ Promotion RPC unavailable, proceeding without promo:", promoCatchError);
      }


      // Get overall start and end times (for backwards compatibility)
      const allStartTimes = slots.map((s) => s.start).sort();
      const allEndTimes = slots.map((s) => s.end).sort();
      const overallStart = allStartTimes[0];
      const overallEnd = allEndTimes[allEndTimes.length - 1];

      // Validate pricing data before insert - use studio rate as fallback
      const finalBaseRate = pricingData.base_rate ||
        (isRecordingSession ? studioData.recording_rate : studioData.hourly_rate);
      const finalHours = pricingData.total_hours || pricingData.hours;

      if (!finalBaseRate || finalBaseRate <= 0) {
        console.error("❌ Invalid base rate:", { pricingData, studioData });
        return new Response(
          JSON.stringify({
            error:
              "Unable to calculate booking price. Studio may not have a valid hourly rate configured.",
            debug: {
              pricingData,
              studio_id,
              studio_recording_rate: studioData.recording_rate,
              studio_hourly_rate: studioData.hourly_rate,
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      if (!finalHours || finalHours <= 0) {
        console.error("❌ Invalid hours calculated:", { pricingData, slots });
        return new Response(
          JSON.stringify({
            error: "Invalid booking duration. Please select valid time slots.",
            debug: { pricingData, slots },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }


      const finalModifiers = {
        ...(pricingData.modifiers || {}),
      };
      finalModifiers.session_type = normalizedSessionType;

      if (isRecordingSession) {
        Object.assign(
          finalModifiers,
          buildRecordingPricingModifiers(
            requestedSongCount,
            Number(finalHours || 0),
            recordingRule,
          ),
        );
      }

      const bookingInsertPayload: Record<string, any> = {
        studio_id,
        user_id,
        booking_date: date,
        start_time: overallStart,
        end_time: overallEnd,
        notes: notes || null,
        status: "pending",
        session_type: normalizedSessionType,
        base_rate: finalBaseRate,
        hours: finalHours,
        subtotal: pricingData.subtotal || finalBaseRate * finalHours,
        modifiers_applied: finalModifiers,
        final_price: pricingData.final_price || finalBaseRate * finalHours,
      };

      // Attach cancellation policy snapshot if studio has an active policy
      try {
        const { data: activePolicy } = await supabaseAdmin
          .from("booking_cancellation_policies")
          .select("*")
          .eq("studio_id", studio_id)
          .eq("is_active", true)
          .maybeSingle();

        if (activePolicy) {
          bookingInsertPayload.cancellation_policy_id = activePolicy.id;
          bookingInsertPayload.cancellation_policy_snapshot = {
            name: activePolicy.name,
            full_refund_hours_before: activePolicy.full_refund_hours_before,
            partial_refund_hours_before: activePolicy.partial_refund_hours_before,
            partial_refund_pct: activePolicy.partial_refund_pct,
            no_show_penalty_pct: activePolicy.no_show_penalty_pct,
            late_cancel_penalty_pct: activePolicy.late_cancel_penalty_pct,
          };
        }
      } catch (policyErr) {
        console.error("Non-critical: failed to attach cancellation policy:", policyErr);
      }

      const { data: insertData, error: insertError } = await supabaseClient
        .from("studio_bookings")
        .insert(bookingInsertPayload)
        .select()
        .single();

      if (insertError) {
        console.error("❌ Insert error:", insertError);
        throw insertError;
      }

      const data = insertData;

      const slotRows = slots.map((slot, index) => ({
        booking_id: data.id,
        start_time: slot.start,
        end_time: slot.end,
        sort_order: index,
      }));

      const { error: slotInsertError } = await supabaseAdmin
        .from("studio_booking_slots")
        .insert(slotRows);

      if (slotInsertError) {
        console.error("❌ Slot insert error:", slotInsertError);
        await supabaseAdmin.from("studio_bookings").delete().eq("id", data.id);
        throw slotInsertError;
      }

      // Notify studio owner of new booking request
      try {
        const { data: studioInfo } = await supabaseClient
          .from("studios")
          .select("owner_id, name")
          .eq("id", studio_id)
          .single();

        if (studioInfo?.owner_id) {
          const notificationPayload = {
            user_id: studioInfo.owner_id,
            type: "info",
            title: "New Booking Request",
            message: `New booking request for ${studioInfo.name} on ${date}.`,
            image: null,
            read: false,
            meta: buildNotificationRouteMeta("/bookings", { tab: "Pending" }, {
              studio_id,
              booking_id: data.id,
              booking_date: date,
              event_type: "booking_request_created",
            }),
          };
          const { error: notifyError } = await supabaseAdmin.from("notifications").insert(notificationPayload);
          if (notifyError) {
            console.error("Error sending booking request notification:", notifyError);
          } else {
            scheduleCoreActionEmailForNotification(supabaseAdmin, notificationPayload, { source: "manage-bookings" });
          }
        }
      } catch (notifyError) {
        console.error(
          "Error sending booking request notification:",
          notifyError,
        );
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201,
      });
    }

    if (action === "reconfirm_gig_terms") {
      const { application_id, decision } = params;
      const normalizedDecision = String(decision || "").trim().toLowerCase();

      if (!application_id || !["accepted", "declined"].includes(normalizedDecision)) {
        return new Response(
          JSON.stringify({ error: "Invalid gig reconfirmation request" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { data: targetApplication, error: targetError } = await supabaseAdmin
        .from("gig_applications")
        .select(
          `
            id,
            applicant_id,
            submitted_by_user_id,
            group_id,
            gig_id,
            production_team_id,
            production_roster_id,
            status,
            reconfirmation_required_at,
            reconfirmation_due_at,
            system_status_reason,
            gig:gig_id(id, name, organizer_id, event_date),
            group:group_id(id, name),
            production_team:production_team_id(id, name),
            production_roster:production_roster_id(
              id,
              entity_kind,
              profile_id,
              group_id,
              roster_profile:profile_id(id, full_name),
              roster_group:group_id(id, name)
            )
          `,
        )
        .eq("id", application_id)
        .maybeSingle();

      if (targetError) throw targetError;

      if (!targetApplication) {
        return new Response(JSON.stringify({ error: "Application not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      const { audience } = await resolveGigApplicationAudience(
        supabaseAdmin,
        targetApplication,
        { includeOrganizer: true },
      );
      const actorMember = audience.find((member) => member.user_id === authUser.id);
      const canReconfirm =
        targetApplication.applicant_id === authUser.id ||
        targetApplication.submitted_by_user_id === authUser.id ||
        (
          actorMember?.viewer_can_act === true &&
          ["applicant", "production_manager"].includes(actorMember.viewer_access)
        );

      if (!canReconfirm) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const requiresReconfirmation =
        String(targetApplication.status || "").toLowerCase() === "pending" &&
        targetApplication.system_status_reason === "system_reconfirm_required_terms_changed" &&
        !!targetApplication.reconfirmation_due_at;

      if (!requiresReconfirmation) {
        return new Response(
          JSON.stringify({ error: "This gig update no longer needs reconfirmation." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const dueAt = new Date(targetApplication.reconfirmation_due_at);
      const now = new Date();

      if (!Number.isNaN(dueAt.getTime()) && dueAt <= now) {
        await supabaseAdmin
          .from("gig_applications")
          .update({
            status: "rejected",
            reconfirmation_required_at: null,
            reconfirmation_due_at: null,
            system_status_reason: "system_reconfirm_timeout",
            cancellation_reason: "Reconfirmation window expired.",
            completion_rate_penalty: false,
            updated_at: now.toISOString(),
          })
          .eq("id", targetApplication.id);

        return new Response(
          JSON.stringify({ error: "The reconfirmation window has expired." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const accepted = normalizedDecision === "accepted";
      const updatePayload = accepted
        ? {
            status: "accepted",
            reconfirmation_required_at: null,
            reconfirmation_due_at: null,
            system_status_reason: null,
            cancellation_reason: null,
            completion_rate_penalty: false,
            updated_at: now.toISOString(),
          }
        : {
            status: "cancelled",
            reconfirmation_required_at: null,
            reconfirmation_due_at: null,
            system_status_reason: "musician_declined_updated_terms",
            cancellation_reason: "Musician declined updated gig terms.",
            completion_rate_penalty: false,
            updated_at: now.toISOString(),
          };

      const { data: updatedApplication, error: updateError } = await supabaseAdmin
        .from("gig_applications")
        .update(updatePayload)
        .eq("id", targetApplication.id)
        .select()
        .maybeSingle();

      if (updateError) throw updateError;

      const organizerId = targetApplication.gig?.organizer_id;

      if (organizerId && organizerId !== authUser.id) {
        const organizerAudienceMember =
          audience.find((member) => member.user_id === organizerId) || {
            user_id: organizerId,
            viewer_access: "organizer" as const,
            viewer_can_act: true,
            viewer_read_only_reason: null,
          };
        const performerName =
          targetApplication.group?.name ||
          targetApplication.production_roster?.roster_profile?.full_name ||
          targetApplication.production_roster?.roster_group?.name ||
          targetApplication.production_team?.name ||
          "A musician";
        const gigName = targetApplication.gig?.name || "your gig";

        await insertNotificationIfMissing(supabaseAdmin, {
          user_id: organizerId,
          type: accepted ? "success" : "warning",
          title: accepted ? "Gig Update Reconfirmed" : "Gig Update Declined",
          message: accepted
            ? `${performerName} reconfirmed the updated terms for ${gigName}.`
            : `${performerName} declined the updated terms for ${gigName}.`,
          image: null,
          meta: buildNotificationRouteMeta(
            "/bookings",
            { tab: "Applicants" },
            buildGigApplicationAudienceMeta(targetApplication, organizerAudienceMember, {
              booking_id: targetApplication.id,
              source_table: "gig_applications",
              status: updatedApplication?.status || updatePayload.status,
              event_type: accepted ? "gig_terms_reconfirmed" : "gig_terms_declined",
            }),
          ),
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: updatedApplication?.status || updatePayload.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // 3. UPDATE STATUS (Cancel/Confirm)
    if (action === "update_status") {
      const { booking_id, new_status, type_id, cancellation_reason } = params; // type_id: 'studio_booking' or 'gig_application'


      let table = "studio_bookings";
      if (type_id === "gig_application") table = "gig_applications";


      const attendanceIssueStatuses = ["late", "not_attending", "no_show"];
      const isAttendanceIssue =
        table === "studio_bookings" &&
        attendanceIssueStatuses.includes(new_status);

      if (isAttendanceIssue) {
        const { data: bookingInfo } = await supabaseClient
          .from("studio_bookings")
          .select("id, user_id, studio_id, booking_date, start_time, studio:studios(name, owner_id)")
          .eq("id", booking_id)
          .single();

        if (bookingInfo) {
          const staffAccessLevel = await getStaffAccessForStudio(supabaseAdmin, authUser.id, bookingInfo.studio_id);
          const canReportAttendance =
            bookingInfo.user_id === authUser.id ||
            bookingInfo.studio?.owner_id === authUser.id ||
            (staffAccessLevel !== null && staffAccessLevel <= 2);

          if (!canReportAttendance) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 403,
            });
          }

          const reporterId = params.userId || null;
          const studioName = bookingInfo.studio?.name || "the studio";
          const eventLabel =
            new_status === "late"
              ? "reported late"
              : "reported not attending";

          const recipients = [bookingInfo.user_id, bookingInfo.studio?.owner_id]
            .filter(Boolean) as string[];

          for (const recipientId of [...new Set(recipients)]) {
            await insertNotificationIfMissing(supabaseAdmin, {
              user_id: recipientId,
              type: "warning",
              title: new_status === "late" ? "Late Arrival Alert" : "Attendance Alert",
              message:
                new_status === "late"
                  ? `A participant for the booking at ${studioName} on ${bookingInfo.booking_date} (${bookingInfo.start_time}) has reported they will be late.`
                  : `A participant for the booking at ${studioName} on ${bookingInfo.booking_date} (${bookingInfo.start_time}) has reported they cannot attend.`,
              image: null,
              meta: {
                booking_id: bookingInfo.id,
                studio_id: bookingInfo.studio_id,
                booking_date: bookingInfo.booking_date,
                issue_status: new_status,
                event_type: `booking_${new_status}`,
                reported_by_user_id: reporterId,
                reporter_event: eventLabel,
              },
            });
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Attendance notification sent.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const updateData: any = { status: new_status };
      let studioBalanceSettlement: any = null;
      let studioBalanceSettlementBooking: any = null;
      let ownerRequestedRelocationCancellation = false;

      if (table === "studio_bookings") {
        const { data: targetBooking, error: targetBookingError } = await supabaseAdmin
          .from("studio_bookings")
          .select("id, user_id, studio_id, status, payment_status, payment_amount, final_price, remaining_balance, paid_at, relocation_requested_at, relocation_expires_at, relocation_proposed_date, relocation_proposed_start_time, relocation_proposed_end_time, studio:studios(id, name, owner_id)")
          .eq("id", booking_id)
          .maybeSingle();

        if (targetBookingError) throw targetBookingError;

        if (!targetBooking) {
          return new Response(JSON.stringify({ error: "Booking not found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          });
        }

        const staffAccessLevel = await getStaffAccessForStudio(supabaseAdmin, authUser.id, targetBooking.studio_id);
        const canUpdateStudioBooking =
          targetBooking.user_id === authUser.id ||
          targetBooking.studio?.owner_id === authUser.id ||
          (staffAccessLevel !== null && staffAccessLevel <= 2);

        if (!canUpdateStudioBooking) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          });
        }

        ownerRequestedRelocationCancellation =
          new_status === "cancelled" &&
          targetBooking.status === "pending_relocation" &&
          targetBooking.user_id === authUser.id;

        if (ownerRequestedRelocationCancellation) {
          Object.assign(updateData, {
            cancellation_reason:
              cancellation_reason ||
              "Musician cancelled after an owner-requested schedule move. No musician completion-rate penalty.",
            relocation_requested_at: null,
            relocation_expires_at: null,
            relocation_proposed_date: null,
            relocation_proposed_start_time: null,
            relocation_proposed_end_time: null,
          });
        }

        if (new_status === "completed") {
          studioBalanceSettlement = getStudioBookingBalanceSettlementFields(targetBooking);
          const canSettleBalance =
            targetBooking.studio?.owner_id === authUser.id ||
            (staffAccessLevel !== null && staffAccessLevel <= 2);

          if (studioBalanceSettlement && !canSettleBalance) {
            return new Response(
              JSON.stringify({ error: "Only the studio owner can mark the remaining balance as paid." }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
              },
            );
          }

          if (studioBalanceSettlement) {
            studioBalanceSettlementBooking = targetBooking;
            Object.assign(updateData, studioBalanceSettlement.fields);
          }
        }
      }

      if (table === "gig_applications") {
        const { data: targetApplication, error: targetError } = await supabaseAdmin
          .from("gig_applications")
          .select("id, applicant_id, submitted_by_user_id, gig_id, production_team_id, status")
          .eq("id", booking_id)
          .maybeSingle();

        if (targetError) throw targetError;

        if (!targetApplication) {
          return new Response(JSON.stringify({ error: "Application not found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          });
        }

        const { data: targetGig, error: targetGigError } = await supabaseAdmin
          .from("gigs")
          .select("id, organizer_id, event_date")
          .eq("id", targetApplication.gig_id)
          .maybeSingle();

        if (targetGigError) throw targetGigError;

        const isOrganizer = targetGig?.organizer_id === authUser.id;
        const isApplicant =
          targetApplication.applicant_id === authUser.id ||
          targetApplication.submitted_by_user_id === authUser.id;
        let isProductionManager = false;
        const venueStaffAccessLevel = await getStaffAccessForGig(supabaseAdmin, authUser.id, targetApplication.gig_id);
        const productionStaffAccessLevel = targetApplication.production_team_id
          ? await getStaffAccessForProduction(supabaseAdmin, authUser.id, targetApplication.production_team_id)
          : null;
        const isVenueStaffManager = venueStaffAccessLevel !== null && venueStaffAccessLevel <= 2;
        const isProductionStaffManager = productionStaffAccessLevel !== null && productionStaffAccessLevel <= 2;

        if (targetApplication.production_team_id) {
          const { data: productionMembership, error: productionMembershipError } =
            await supabaseAdmin
              .from("production_team_members")
              .select("role")
              .eq("team_id", targetApplication.production_team_id)
              .eq("user_id", authUser.id)
              .in("role", ["owner", "manager"])
              .maybeSingle();

          if (productionMembershipError) throw productionMembershipError;
          isProductionManager = !!productionMembership;
        }

        const organizerAllowedStatuses = ["accepted", "rejected", "completed", "cancelled", "fired"];
        const applicantAllowedStatuses = ["cancelled", "resigned"];
        const productionManagerAllowedStatuses = ["cancelled", "resigned", "fired"];

        if (
          !(isOrganizer && organizerAllowedStatuses.includes(new_status)) &&
          !(isApplicant && applicantAllowedStatuses.includes(new_status)) &&
          !(isProductionManager && productionManagerAllowedStatuses.includes(new_status)) &&
          !(isVenueStaffManager && organizerAllowedStatuses.includes(new_status)) &&
          !(isProductionStaffManager && productionManagerAllowedStatuses.includes(new_status))
        ) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          });
        }

        updateData.completion_rate_penalty = shouldPenalizeAcceptedGigWithdrawal({
          newStatus: new_status,
          previousStatus: targetApplication.status,
          eventDate: targetGig?.event_date,
          isApplicant,
          isOrganizer,
        });
      }

      // Add cancellation_reason if status is a terminal negative outcome and reason is provided
      if (
        (new_status === "cancelled" || new_status === "resigned" || new_status === "rejected" || new_status === "fired") &&
        cancellation_reason
      ) {
        updateData.cancellation_reason = cancellation_reason;
      }


      const updateClient = table === "gig_applications" || table === "studio_bookings" ? supabaseAdmin : supabaseClient;

      let data: any = null;
      let error: any = null;

      if (table === "gig_applications" && new_status === "rejected") {
        const result = await supabaseAdmin.rpc("decline_gig_application_safely", {
          p_application_id: booking_id,
          p_actor_user_id: authUser.id,
          p_reason: cancellation_reason || null,
        });
        data = result.data;
        error = result.error;
      } else if (table === "gig_applications" && new_status === "fired") {
        const result = await supabaseAdmin.rpc("terminate_gig_application_safely", {
          p_application_id: booking_id,
          p_actor_user_id: authUser.id,
          p_reason: cancellation_reason,
        });
        data = result.data;
        error = result.error;
      } else {
        const result = await updateClient
          .from(table)
          .update(updateData)
          .eq("id", booking_id)
          .select()
          .maybeSingle();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      if (!data) {
        return new Response(JSON.stringify({ error: "No matching record updated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      if (studioBalanceSettlement) {
        try {
          await creditStudioBookingBalanceToOwner(
            supabaseAdmin,
            { ...data, studio: studioBalanceSettlementBooking?.studio },
            studioBalanceSettlement.remainingBalance,
          );
        } catch (balanceCreditError) {
          console.error("Failed to credit completed booking balance:", balanceCreditError);
          return new Response(
            JSON.stringify({ error: "Booking completed, but wallet balance credit failed." }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            },
          );
        }
      }

      let ownerCancellationRefundResult: any = null;
      if (table === "studio_bookings" && new_status === "cancelled") {
        try {
          ownerCancellationRefundResult = await refundStudioOwnerCancelledBookingToWallet(
            supabaseAdmin,
            booking_id,
            authUser.id,
          );
        } catch (refundError) {
          console.error("Failed to refund studio owner cancelled booking:", refundError);
        }
      }

      let relocationCancellationRefundResult: any = null;
      if (
        table === "studio_bookings" &&
        new_status === "cancelled" &&
        ownerRequestedRelocationCancellation
      ) {
        try {
          relocationCancellationRefundResult = await refundStudioOwnerCancelledBookingToWallet(
            supabaseAdmin,
            booking_id,
            authUser.id,
            {
              allowCustomerRelocationRefund: true,
              description: "Owner-requested studio booking relocation cancelled by musician",
            },
          );
        } catch (refundError) {
          console.error("Failed to refund owner-requested relocation cancellation:", refundError);
          return new Response(
            JSON.stringify({ error: "Booking was cancelled, but wallet refund failed. Please contact support." }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            },
          );
        }
      }

      const studioCancellationRefundResult =
        ownerCancellationRefundResult || relocationCancellationRefundResult;

      // CANCELLATION PENALTY LOGIC for studio bookings
      if (
        table === "studio_bookings" &&
        new_status === "cancelled" &&
        data.cancellation_policy_id &&
        !studioCancellationRefundResult?.owner_cancelled &&
        !studioCancellationRefundResult?.owner_requested_relocation
      ) {
        try {
          const { data: penaltyResult, error: penaltyCalcErr } = await supabaseAdmin.rpc(
            "calculate_booking_cancellation_penalty",
            { p_booking_id: booking_id },
          );

          if (!penaltyCalcErr && penaltyResult && penaltyResult.penalty_amount > 0) {
            const { data: penaltyApplied, error: penaltyApplyErr } = await supabaseAdmin.rpc(
              "apply_booking_penalty",
              {
                p_booking_id: booking_id,
                p_penalty_amount: penaltyResult.penalty_amount,
                p_penalty_type: penaltyResult.penalty_type || "late_cancel",
                p_cancelled_by: authUser.id,
              },
            );

            if (penaltyApplyErr) {
              console.error("Failed to apply penalty:", penaltyApplyErr);
            }
          }
        } catch (penaltyErr) {
          console.error("Non-critical penalty calculation error:", penaltyErr);
        }
      }

      // NOTIFICATION LOGIC
      if (
        ["cancelled", "resigned", "rejected", "confirmed", "accepted", "completed", "fired"].includes(new_status)
      ) {
        try {
          const notificationEventType =
            table === "gig_applications"
              ? `gig_application_${new_status}`
              : `${table}_${new_status}`;

          // Determine who to notify
          let targetUserId = null;
          let notificationTitle = "";
          let notificationMessage = "";
          let notificationType = "info";
          let notificationImage: string | null = null;
          let cancellationActorRole: "musician" | "studio_owner" | "unknown" | null = null;

          if (table === "studio_bookings") {
            // For Studio Bookings
            const { data: bookingInfo } = await supabaseClient
              .from("studio_bookings")
              .select("user_id, studio_id, studio:studios(id, name, address, owner_id, hourly_rate, rate)")
              .eq("id", booking_id)
              .single();

            const [bookingInfoWithLegacy] = bookingInfo
              ? await hydrateStudioBookingLegacy(supabaseAdmin, [bookingInfo])
              : [];

            if (bookingInfoWithLegacy) {
              notificationImage = Array.isArray(bookingInfoWithLegacy.studio?.images)
                ? bookingInfoWithLegacy.studio.images[0] || null
                : null;

              const studioOwnerId = bookingInfoWithLegacy.studio?.owner_id || null;
              const cancelledByMusician = authUser.id === bookingInfoWithLegacy.user_id;
              const cancelledByOwner = Boolean(studioOwnerId && authUser.id === studioOwnerId);
              const reasonSuffix = cancellation_reason
                ? ` Reason: ${cancellation_reason}`
                : "";

              if (new_status === "cancelled") {
                if (cancelledByMusician && studioOwnerId) {
                  targetUserId = studioOwnerId;
                  notificationTitle = "Booking Cancelled";
                  notificationMessage = `A musician cancelled their booking at ${bookingInfoWithLegacy.studio.name}.${reasonSuffix}`;
                  notificationType = "warning";
                  cancellationActorRole = "musician";
                } else {
                  targetUserId = bookingInfoWithLegacy.user_id;
                  const refundAmount = toMoneyNumber(studioCancellationRefundResult?.refund_amount);
                  if (refundAmount > 0) {
                    notificationTitle = "Booking Refunded";
                    notificationMessage = `Your booking at ${bookingInfoWithLegacy.studio.name} has been refunded. A full refund of ₱${refundAmount.toLocaleString()} has been credited to your wallet.${reasonSuffix}`;
                    notificationType = "success";
                  } else {
                    notificationTitle = "Booking Cancelled";
                    notificationMessage = `Your booking at ${bookingInfoWithLegacy.studio.name} has been cancelled.${reasonSuffix}`;
                    notificationType = "warning";
                  }
                  cancellationActorRole = cancelledByOwner ? "studio_owner" : "unknown";
                }
              } else if (new_status === "confirmed") {
                targetUserId = bookingInfoWithLegacy.user_id;
                notificationTitle = "Booking Confirmed!";
                notificationMessage = `Your booking at ${bookingInfoWithLegacy.studio.name} has been confirmed.`;
                notificationType = "success";
              }
            }
          } else if (table === "gig_applications") {
            const { application, audience } = await resolveGigApplicationAudience(
              supabaseAdmin,
              booking_id,
              { includeOrganizer: true },
            );

            if (application) {
              const { data: gigRow, error: gigRowError } = await supabaseAdmin
                .from("gigs_with_stats")
                .select("name, images, organizer_id")
                .eq("id", application.gig_id)
                .maybeSingle();

              if (gigRowError) throw gigRowError;

              const gigName =
                gigRow?.name ||
                application.gig?.name ||
                "this gig";
              const performerName =
                application.group?.name ||
                application.production_roster?.roster_profile?.full_name ||
                application.production_roster?.roster_group?.name ||
                "The performer";
              notificationImage = Array.isArray(gigRow?.images)
                ? gigRow.images[0] || null
                : null;

              const actorIsApplicant =
                authUser.id === application.applicant_id ||
                authUser.id === application.submitted_by_user_id;
              const actorIsOrganizer =
                authUser.id === gigRow?.organizer_id ||
                authUser.id === application.gig?.organizer_id;
              const actorIsProductionManager =
                Boolean(application.production_team_id) &&
                audience.some(
                  (member: any) =>
                    member.user_id === authUser.id &&
                    member.viewer_access === "production_manager",
                );
              const cancelledByApplicant =
                (new_status === "cancelled" || new_status === "resigned") &&
                actorIsApplicant &&
                !actorIsOrganizer;

              if (new_status === "rejected") {
                notificationTitle = "Application Declined";
                notificationMessage = `Your application for ${gigName} has been declined.`;
                notificationType = "error";
              } else if (new_status === "accepted") {
                notificationTitle = "Application Accepted!";
                notificationMessage = `Your application for ${gigName} has been accepted!`;
                notificationType = "success";
              } else if (new_status === "completed") {
                notificationTitle = "Gig Completed";
                notificationMessage = `Your contract for ${gigName} has been marked as completed.`;
                notificationType = "success";
              } else if (new_status === "fired") {
                notificationTitle = "Removed from Gig";
                notificationMessage = actorIsProductionManager
                  ? `Your contract for ${gigName} has been ended by the production team.`
                  : `Your contract for ${gigName} has been ended by the gig.`;
                notificationType = "error";
              } else if (new_status === "resigned") {
                notificationTitle = "Musician Withdrew";
                notificationMessage = `A musician withdrew from ${gigName}.`;
                notificationType = "warning";
              } else if (new_status === "cancelled") {
                notificationTitle = cancelledByApplicant
                  ? "Musician Withdrew"
                  : "Gig Cancelled";
                notificationMessage = cancelledByApplicant
                  ? `A musician withdrew from ${gigName}.`
                  : `Your contract for ${gigName} has been cancelled.`;
                notificationType = cancelledByApplicant ? "warning" : "error";
              }

              if (notificationTitle && notificationMessage) {
                for (const member of audience) {
                  if (member.user_id === authUser.id && new_status !== "fired") continue;

                  const memberTitle = new_status === "fired" && member.viewer_access === "organizer"
                    ? "Performer Removed"
                    : notificationTitle;
                  const memberMessage = new_status === "fired" && member.viewer_access === "organizer"
                    ? `${performerName} was removed from ${gigName}. The performer slot is available for a replacement.`
                    : notificationMessage;

                  await insertNotificationIfMissing(supabaseAdmin, {
                    user_id: member.user_id,
                    type: notificationType,
                    title: memberTitle,
                    message: memberMessage,
                    image: notificationImage,
                    meta: buildNotificationRouteMeta(
                      "/bookings",
                      undefined,
                      buildGigApplicationAudienceMeta(application, member, {
                        booking_id: booking_id,
                        source_table: table,
                        status: new_status,
                        event_type: notificationEventType,
                        cancellation_reason: cancellation_reason || null,
                        cancelled_by_user_id:
                          new_status === "cancelled" ||
                          new_status === "resigned" ||
                          new_status === "fired"
                            ? authUser.id
                            : null,
                        cancelled_by_role: cancellationActorRole,
                      }),
                    ),
                  });
                }
              }
            }
          }

          if (targetUserId) {
            await insertNotificationIfMissing(supabaseAdmin, {
              user_id: targetUserId,
              type: notificationType,
              title: notificationTitle,
              message: notificationMessage,
              image: notificationImage,
              meta: {
                booking_id: booking_id,
                source_table: table,
                status: new_status,
                event_type: notificationEventType,
                cancellation_reason: cancellation_reason || null,
                refund_amount: toMoneyNumber(studioCancellationRefundResult?.refund_amount),
                payment_status: studioCancellationRefundResult?.owner_cancelled ||
                  studioCancellationRefundResult?.owner_requested_relocation
                  ? "refunded"
                  : null,
                cancelled_by_user_id: new_status === "cancelled" || new_status === "resigned" || new_status === "fired" ? authUser.id : null,
                cancelled_by_role: cancellationActorRole,
              },
            });
          }
        } catch (notifyError) {
          console.error("Error sending notification:", notifyError);
        }
      }

      const refundAmountForResponse = toMoneyNumber(studioCancellationRefundResult?.refund_amount);
      const responseData = studioCancellationRefundResult
        ? {
            ...data,
            payment_status: refundAmountForResponse > 0 ? "refunded" : data?.payment_status,
            refund_amount: refundAmountForResponse,
            refund_result: studioCancellationRefundResult,
          }
        : data;

      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 3A. CREATE INCIDENT REPORT (Musician/Owner)
    if (action === "create_incident") {
      const { booking_id, issue_type, notes, userId } = params;

      if (!booking_id || !issue_type) {
        return new Response(
          JSON.stringify({ error: "booking_id and issue_type are required." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const reporterUserId = userId || authUser.id;

      if (reporterUserId !== authUser.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const { data: bookingDetails, error: bookingError } = await supabaseClient
        .from("studio_bookings")
        .select("id, user_id, studio_id, status, booking_date, start_time, studio:studios(name, owner_id)")
        .eq("id", booking_id)
        .maybeSingle();

      if (bookingError) throw bookingError;

      if (!bookingDetails) {
        return new Response(JSON.stringify({ error: "Booking not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      if (["cancelled", "completed"].includes(bookingDetails.status)) {
        return new Response(
          JSON.stringify({ error: "This booking can no longer be reported." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const musicianId = bookingDetails.user_id;
      const studioOwnerId = bookingDetails.studio?.owner_id || null;

      const isMusicianReporter = reporterUserId === musicianId;
      const isOwnerReporter = Boolean(studioOwnerId && reporterUserId === studioOwnerId);
      const incidentStaffAccess = bookingDetails.studio_id
        ? await getStaffAccessForStudio(supabaseAdmin, reporterUserId, bookingDetails.studio_id)
        : null;
      const isStaffReporter = incidentStaffAccess !== null && incidentStaffAccess <= 2;

      if (!isMusicianReporter && !isOwnerReporter && !isStaffReporter) {
        return new Response(
          JSON.stringify({ error: "You are not allowed to report this booking." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      const counterpartyUserId = isMusicianReporter ? studioOwnerId : musicianId;

      if (!counterpartyUserId) {
        return new Response(
          JSON.stringify({ error: "Unable to identify the other participant for this booking." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const { data: existingIncident, error: existingIncidentError } = await supabaseClient
        .from("booking_incidents")
        .select("id, status")
        .eq("booking_id", booking_id)
        .in("status", ["open", "responded", "manual_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingIncidentError) {
        if (isMissingTableError(existingIncidentError, "booking_incidents")) {
          return new Response(
            JSON.stringify({
              error:
                "Incident reporting is not available yet. Please apply the latest database migrations.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 503,
            },
          );
        }
        throw existingIncidentError;
      }

      if (existingIncident) {
        return new Response(
          JSON.stringify({
            error: "There is already an active incident report for this booking.",
            incident_id: existingIncident.id,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const incidentDetails =
        typeof notes === "string" && notes.trim() ? notes.trim() : null;

      const { data: incidentRow, error: insertIncidentError } = await supabaseAdmin
        .from("booking_incidents")
        .insert({
          booking_id,
          issue_type,
          status: "open",
          reporter_user_id: reporterUserId,
          counterparty_user_id: counterpartyUserId,
          reporter_notes: incidentDetails,
          response_deadline_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        })
        .select("*")
        .single();

      if (insertIncidentError) {
        if (isMissingTableError(insertIncidentError, "booking_incidents")) {
          return new Response(
            JSON.stringify({
              error:
                "Incident reporting is not available yet. Please apply the latest database migrations.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 503,
            },
          );
        }
        throw insertIncidentError;
      }

      const { error: holdPayoutError } = await supabaseAdmin.rpc("hold_booking_payout", {
        p_booking_id: booking_id,
        p_reason: `${issue_type} reported`,
        p_reverse_existing: true,
      });

      if (
        holdPayoutError &&
        holdPayoutError.code !== "42883" &&
        holdPayoutError.code !== "PGRST202"
      ) {
        console.error("Failed to hold payout for incident:", holdPayoutError);
      }

      const studioName = bookingDetails.studio?.name || "the studio";
      const issueLabel = String(issue_type).replaceAll("_", " ");

      await insertNotificationIfMissing(supabaseAdmin, {
        user_id: counterpartyUserId,
        type: "warning",
        title: "Booking Incident Reported",
        message: `A booking issue was reported for ${studioName} (${bookingDetails.booking_date} ${bookingDetails.start_time}). Issue: ${issueLabel}.`,
        image: null,
        meta: {
          booking_id,
          incident_id: incidentRow.id,
          issue_type,
          event_type: "booking_incident_created",
        },
      });

      await insertNotificationIfMissing(supabaseAdmin, {
        user_id: reporterUserId,
        type: "info",
        title: "Incident Report Submitted",
        message: `Your report for the booking at ${studioName} was submitted. We will keep payout on hold while this is reviewed.`,
        image: null,
        meta: {
          booking_id,
          incident_id: incidentRow.id,
          issue_type,
          event_type: "booking_incident_acknowledged",
        },
      });

      return new Response(
        JSON.stringify({ success: true, incident: incidentRow }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 201,
        },
      );
    }

    // 3B. PARTIAL SLOT APPROVAL (Studio Owner)
    if (action === "partial_slot_approval") {
      const {
        booking_id,
        user_id,
        accepted_slots,
        declined_slots,
        cancellation_reason,
      } = params;

      if (!booking_id || !user_id || !Array.isArray(accepted_slots)) {
        return new Response(
          JSON.stringify({
            error: "booking_id, user_id, and accepted_slots are required.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const safeDeclinedSlots = Array.isArray(declined_slots)
        ? declined_slots
        : [];

      const { data: bookingDetails, error: bookingError } = await supabaseClient
        .from("studio_bookings")
        .select(
          "id, user_id, studio_id, booking_date, status, base_rate, hours, final_price, studio:studios(name, owner_id, hourly_rate)",
        )
        .eq("id", booking_id)
        .single();

      if (bookingError || !bookingDetails) {
        return new Response(
          JSON.stringify({ error: "Booking not found." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      if (user_id !== authUser.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      const staffAccessLevel = await getStaffAccessForStudio(supabaseAdmin, authUser.id, bookingDetails.studio_id);
      const canApprovePartialSlots =
        bookingDetails.studio?.owner_id === authUser.id ||
        (staffAccessLevel !== null && staffAccessLevel <= 2);

      if (!canApprovePartialSlots) {
        return new Response(
          JSON.stringify({ error: "Not authorized to update this booking." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      if (bookingDetails.status !== "pending") {
        return new Response(
          JSON.stringify({ error: "Only pending bookings can be partially approved." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      if (accepted_slots.length === 0) {
        const declineReason =
          cancellation_reason || "All requested time slots were declined by the studio owner.";

        const { error: cancelError } = await supabaseAdmin
          .from("studio_bookings")
          .update({
            status: "cancelled",
            cancellation_reason: declineReason,
          })
          .eq("id", booking_id);

        if (cancelError) throw cancelError;

        const notificationPayload = {
          user_id: bookingDetails.user_id,
          type: "warning",
          title: "Booking Declined",
          message: `Your booking request for ${bookingDetails.studio?.name || "this studio"} has been declined.`,
          read: false,
          meta: buildNotificationRouteMeta("/bookings", undefined, {
            booking_id,
            studio_id: bookingDetails.studio_id,
            event_type: "booking_all_slots_declined",
          }),
        };
        const { error: notifyError } = await supabaseAdmin.from("notifications").insert(notificationPayload);
        if (notifyError) {
          console.error("Error sending booking decline notification:", notifyError);
        } else {
          scheduleCoreActionEmailForNotification(supabaseAdmin, notificationPayload, { source: "manage-bookings" });
        }

        return new Response(
          JSON.stringify({ success: true, status: "cancelled" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const normalizedAcceptedSlots = accepted_slots.map((slot: any) => ({
        start: normalizeTime(slot?.start),
        end: normalizeTime(slot?.end),
      }));

      const totalHours = normalizedAcceptedSlots.reduce(
        (sum: number, slot: any) => sum + toHours(slot.start, slot.end),
        0,
      );

      if (totalHours <= 0) {
        return new Response(
          JSON.stringify({ error: "Accepted slots must have a positive duration." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const sortedStarts = normalizedAcceptedSlots
        .map((slot: any) => slot.start)
        .sort();
      const sortedEnds = normalizedAcceptedSlots
        .map((slot: any) => slot.end)
        .sort();

      const overallStart = sortedStarts[0];
      const overallEnd = sortedEnds[sortedEnds.length - 1];
      const computedBaseRate =
        bookingDetails.base_rate ||
        bookingDetails.studio?.hourly_rate ||
        (bookingDetails.hours && bookingDetails.hours > 0
          ? bookingDetails.final_price / bookingDetails.hours
          : 0);
      const recomputedPrice = Number((computedBaseRate * totalHours).toFixed(2));

      const { error: updateError } = await supabaseAdmin
        .from("studio_bookings")
        .update({
          status: "confirmed",
          start_time: overallStart,
          end_time: overallEnd,
          hours: totalHours,
          subtotal: recomputedPrice,
          final_price: recomputedPrice,
          cancellation_reason:
            safeDeclinedSlots.length > 0
              ? cancellation_reason || "Some requested time slots were declined."
              : null,
        })
        .eq("id", booking_id);

      if (updateError) throw updateError;

      const { error: clearSlotsError } = await supabaseAdmin
        .from("studio_booking_slots")
        .delete()
        .eq("booking_id", booking_id);

      if (clearSlotsError) throw clearSlotsError;

      const slotRows = normalizedAcceptedSlots.map((slot: any, index: number) => ({
        booking_id,
        start_time: slot.start,
        end_time: slot.end,
        sort_order: index,
      }));

      const { error: insertSlotsError } = await supabaseAdmin
        .from("studio_booking_slots")
        .insert(slotRows);

      if (insertSlotsError) throw insertSlotsError;

      const slotLabel = normalizedAcceptedSlots
        .map((slot: any) => `${slot.start.slice(0, 5)}-${slot.end.slice(0, 5)}`)
        .join(", ");

      const notificationPayload = {
        user_id: bookingDetails.user_id,
        type: safeDeclinedSlots.length > 0 ? "info" : "success",
        title:
          safeDeclinedSlots.length > 0
            ? "Booking Partially Approved"
            : "Booking Confirmed!",
        message:
          safeDeclinedSlots.length > 0
            ? `Your booking was partially approved. Accepted slots: ${slotLabel}.`
            : `Your booking at ${bookingDetails.studio?.name || "the studio"} has been confirmed.`,
        read: false,
        meta: buildNotificationRouteMeta("/bookings", undefined, {
          booking_id,
          studio_id: bookingDetails.studio_id,
          accepted_slots: normalizedAcceptedSlots,
          declined_slots: safeDeclinedSlots,
          event_type:
            safeDeclinedSlots.length > 0
              ? "booking_partial_slot_approval"
              : "booking_confirmed",
        }),
      };
      const { error: notifyError } = await supabaseAdmin.from("notifications").insert(notificationPayload);
      if (notifyError) {
        console.error("Error sending booking approval notification:", notifyError);
      } else {
        scheduleCoreActionEmailForNotification(supabaseAdmin, notificationPayload, { source: "manage-bookings" });
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "confirmed",
          accepted_slots: normalizedAcceptedSlots,
          declined_slots: safeDeclinedSlots,
          hours: totalHours,
          final_price: recomputedPrice,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // 4. CREATE REVIEW
    if (action === "create_review") {
      const {
        userId,
        rating,
        content,
        studioId,
        gigId,
        groupId,
        targetUserId, // For reviewing a user (musician or owner)
        bookingId,
        bookingType, // 'studio_booking' or 'gig_application'
        reviewerRole, // 'customer' or 'owner' / 'applicant' or 'organizer'
      } = params;

      // Enforce role ownership against the booking to avoid mis-targeted reviews.
      if (bookingId && bookingType === "studio_booking") {
        const { data: bookingAuth, error: bookingAuthError } = await supabaseClient
          .from("studio_bookings")
          .select("id, user_id, studio_id, studio:studios(owner_id)")
          .eq("id", bookingId)
          .single();

        if (bookingAuthError || !bookingAuth) {
          return new Response(
            JSON.stringify({ error: "Studio booking not found." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
          );
        }

        const isStudioOwnerReviewer = reviewerRole === "owner" && bookingAuth.studio?.owner_id === userId;
        const isCustomerReviewer = reviewerRole === "customer" && bookingAuth.user_id === userId;
        const staffAccessLevel = reviewerRole === "owner"
          ? await getStaffAccessForStudio(supabaseAdmin, userId, bookingAuth.studio_id)
          : null;
        const isStudioStaffReviewer = staffAccessLevel !== null && staffAccessLevel <= 2;

        if (!isStudioOwnerReviewer && !isCustomerReviewer && !isStudioStaffReviewer) {
          return new Response(
            JSON.stringify({ error: "You are not allowed to submit this studio review." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
          );
        }
      }

      if (bookingId && bookingType === "gig_application") {
        const { data: appAuth, error: appAuthError } = await supabaseClient
          .from("gig_applications")
          .select("id, applicant_id, group_id, gig_id, production_team_id, gig:gig_id(organizer_id)")
          .eq("id", bookingId)
          .single();

        if (appAuthError || !appAuth) {
          return new Response(
            JSON.stringify({ error: "Gig application not found." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
          );
        }

        const isOrganizerReviewer = reviewerRole === "organizer" && appAuth.gig?.organizer_id === userId;
        const isApplicantReviewer = reviewerRole === "applicant" && appAuth.applicant_id === userId;
        const venueStaffAccessLevel = reviewerRole === "organizer"
          ? await getStaffAccessForGig(supabaseAdmin, userId, appAuth.gig_id)
          : null;
        const productionStaffAccessLevel = reviewerRole === "organizer" && appAuth.production_team_id
          ? await getStaffAccessForProduction(supabaseAdmin, userId, appAuth.production_team_id)
          : null;
        const isGigStaffReviewer =
          (venueStaffAccessLevel !== null && venueStaffAccessLevel <= 2) ||
          (productionStaffAccessLevel !== null && productionStaffAccessLevel <= 2);

        if (!isOrganizerReviewer && !isApplicantReviewer && !isGigStaffReviewer) {
          return new Response(
            JSON.stringify({ error: "You are not allowed to submit this gig review." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
          );
        }
      }

      // Check for duplicate review.
      // Prefer booking-level duplicate detection so users can review the same entity
      // across different bookings/applications.
      let existingReview = null;
      if (bookingId && bookingType === "studio_booking") {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("studio_booking_id", bookingId)
          .maybeSingle();
        existingReview = data;
      } else if (bookingId && bookingType === "gig_application") {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("gig_application_id", bookingId)
          .maybeSingle();
        existingReview = data;
      } else if (studioId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("studio_id", studioId)
          .maybeSingle();
        existingReview = data;
      } else if (gigId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("gig_id", gigId)
          .maybeSingle();
        existingReview = data;
      } else if (groupId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("group_id", groupId)
          .maybeSingle();
        existingReview = data;
      } else if (targetUserId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("user_id", targetUserId)
          .maybeSingle();
        existingReview = data;
      }

      if (existingReview) {
        return new Response(
          JSON.stringify({
            error: "You have already submitted a review for this entity.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      // Insert the review
      const reviewData: any = {
        author_id: userId,
        rating,
        content: content || null,
      };

      if (studioId) reviewData.studio_id = studioId;
      if (gigId) reviewData.gig_id = gigId;
      if (groupId) reviewData.group_id = groupId;
      if (targetUserId) reviewData.user_id = targetUserId;
      if (bookingId && bookingType === "studio_booking")
        reviewData.studio_booking_id = bookingId;
      if (bookingId && bookingType === "gig_application")
        reviewData.gig_application_id = bookingId;

      const { data: review, error: reviewError } = await supabaseClient
        .from("reviews")
        .insert(reviewData)
        .select()
        .single();

      if (reviewError) throw reviewError;

      // Update booking reviewed status
      if (bookingId && bookingType === "studio_booking") {
        const updateField =
          reviewerRole === "customer"
            ? "reviewed_by_customer"
            : "reviewed_by_owner";
        await supabaseClient
          .from("studio_bookings")
          .update({ [updateField]: true })
          .eq("id", bookingId);

        // Check if BOTH have reviewed -> mark as completed
        const { data: booking } = await supabaseClient
          .from("studio_bookings")
          .select("reviewed_by_customer, reviewed_by_owner")
          .eq("id", bookingId)
          .single();

        if (booking?.reviewed_by_customer && booking?.reviewed_by_owner) {
          await supabaseClient
            .from("studio_bookings")
            .update({ status: "completed" })
            .eq("id", bookingId);
        }
      } else if (bookingId && bookingType === "gig_application") {
        const updateField =
          reviewerRole === "applicant"
            ? "reviewed_by_applicant"
            : "reviewed_by_organizer";
        await supabaseClient
          .from("gig_applications")
          .update({ [updateField]: true })
          .eq("id", bookingId);
      }

      return new Response(JSON.stringify(review), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201,
      });
    }



    // 6. CHECK REVIEW STATUS (to know if user already reviewed)
    if (action === "check_review_status") {
      const { bookingId, bookingType } = params;

      if (bookingType === "studio_booking") {
        const { data, error } = await supabaseClient
          .from("studio_bookings")
          .select("reviewed_by_customer, reviewed_by_owner, status")
          .eq("id", bookingId)
          .single();

        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        const { data, error } = await supabaseClient
          .from("gig_applications")
          .select("reviewed_by_applicant, reviewed_by_organizer, status")
          .eq("id", bookingId)
          .single();

        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 7. SCAN QR (Create Check-In)
    if (action === "scan_qr") {
      const { qr_code, scanner_id } = params;


      // 1. Verify the booking exists and is confirmed
      const { data: booking, error: fetchError } = await supabaseClient
        .from("studio_bookings")
        .select("*, studio:studios(owner_id)")
        .eq("id", qr_code)
        .single();


      if (fetchError) {
        console.error("📷 Fetch error details:", fetchError);
        return new Response(
          JSON.stringify({
            error: "Invalid booking code.",
            details: fetchError.message,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      if (!booking) {
        return new Response(JSON.stringify({ error: "Booking not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      // 2. Verify scanner is the studio owner or assigned staff with booking actions.
      const qrStaffAccessLevel = booking.studio_id
        ? await getStaffAccessForStudio(supabaseAdmin, authUser.id, booking.studio_id)
        : null;
      const canScanForStudio =
        booking.studio?.owner_id === scanner_id ||
        (scanner_id === authUser.id && qrStaffAccessLevel !== null && qrStaffAccessLevel <= 2);

      if (!booking.studio || !canScanForStudio) {
        return new Response(
          JSON.stringify({
            error: "You are not authorized to scan for this studio.",
            debug: { studio_owner: booking.studio?.owner_id, scanner_id },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      // 3. Verify status
      if (booking.status === "checked_in") {
        return new Response(
          JSON.stringify({ message: "Already checked in!", booking }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (booking.status !== "confirmed") {
        return new Response(
          JSON.stringify({
            error: `Cannot check in. Booking status is ${booking.status}.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // 4. Update status to checked_in
      const { data: updated, error: updateError } = await supabaseClient
        .from("studio_bookings")
        .update({
          status: "checked_in",
          check_in_time: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .select()
        .single();

      if (updateError) {
        console.error("📷 Check-in update error:", updateError);
        return new Response(
          JSON.stringify({
            error: "Failed to update check-in status.",
            details: updateError.message,
            code: updateError.code,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({ success: true, booking: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 8. RENEW CONTRACT (Gig Owner re-hires a musician)
    if (action === "renew_contract") {
      const { application_id } = params;

      if (!application_id) {
        return new Response(JSON.stringify({ error: "application_id is required." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }


      // 1. Verify the original application exists
      const { data: originalApp, error: fetchError } = await supabaseAdmin
        .from("gig_applications")
        .select(`
          *,
          gig:gig_id(id, name, organizer_id),
          applicant:applicant_id(full_name, email, avatar_url),
          group:group_id(id, name, owner_id, group_type),
          production_team:production_team_id(id, name, owner_id, logo_url)
        `)
        .eq("id", application_id)
        .single();

      if (fetchError || !originalApp) {
        return new Response(
          JSON.stringify({ error: "Original application not found." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      // 2. Verify the user is the gig organizer or assigned gig staff with booking actions.
      const renewalStaffAccessLevel = originalApp.gig_id
        ? await getStaffAccessForGig(supabaseAdmin, authUser.id, originalApp.gig_id)
        : null;
      const canRenewContract =
        originalApp.gig?.organizer_id === authUser.id ||
        (renewalStaffAccessLevel !== null && renewalStaffAccessLevel <= 2);

      if (!canRenewContract) {
        return new Response(
          JSON.stringify({
            error: "You are not authorized to renew this contract.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      if (String(originalApp.status || "").toLowerCase() !== "completed") {
        return new Response(
          JSON.stringify({ error: "Only completed contracts can be renewed." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const gigName = originalApp.gig?.name || "Gig";
      const renewalRecipientId =
        toNonEmptyString(originalApp.submitted_by_user_id) ||
        toNonEmptyString(originalApp.applicant_id) ||
        toNonEmptyString(originalApp.production_team?.owner_id);

      if (!renewalRecipientId) {
        return new Response(
          JSON.stringify({ error: "Could not identify who should receive this renewal offer." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { data: organizerProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", authUser.id)
        .maybeSingle();

      const receiverEntityType = originalApp.production_team_id
        ? "production_team"
        : originalApp.group_id
          ? "group"
          : "musician";
      const receiverEntityId =
        receiverEntityType === "production_team"
          ? originalApp.production_team_id
          : receiverEntityType === "group"
            ? originalApp.group_id
            : renewalRecipientId;
      const receiverEntityName =
        originalApp.production_team?.name ||
        originalApp.group?.name ||
        originalApp.applicant?.full_name ||
        originalApp.applicant?.email ||
        "Musician";
      const senderEntityName = organizerProfile?.full_name || "Gig";
      const renewalMessage = `Renewal offer for "${gigName}".`;
      const renewalEventDetails = {
        type: "listing_connection_request",
        source: "contract_renewal",
        event_type: "contract_renewal",
        sender_entity_type: "venue",
        sender_entity_id: originalApp.gig_id || originalApp.gig?.id || null,
        sender_entity_name: senderEntityName,
        receiver_entity_type: receiverEntityType,
        receiver_entity_id: receiverEntityId,
        receiver_entity_name: receiverEntityName,
        production_team_id: originalApp.production_team_id || null,
        listing_type: "Gig",
        listing_id: originalApp.gig_id || originalApp.gig?.id || null,
        gig_id: originalApp.gig_id || originalApp.gig?.id || null,
        original_application_id: application_id,
        route: "/bookings",
        route_params: { tab: "Pending" },
        request_kind: "invite",
        request_details: {
          request_kind: "invite",
          pitch_message: renewalMessage,
          application_context: `Contract renewal for "${gigName}".`,
          context_label: "Renewal Context",
          original_application_id: application_id,
          gig_id: originalApp.gig_id || originalApp.gig?.id || null,
        },
      };

      const { data: existingRenewals, error: existingRenewalError } = await supabaseAdmin
        .from("booking_requests")
        .select("id, created_at, sender_id, receiver_id, group_id, studio_id, status, event_details, attachment_url")
        .eq("sender_id", authUser.id)
        .eq("receiver_id", renewalRecipientId)
        .eq("status", "pending")
        .contains("event_details", {
          source: "contract_renewal",
          original_application_id: application_id,
        })
        .limit(1);

      if (existingRenewalError) {
        return new Response(
          JSON.stringify({ error: existingRenewalError.message }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      let requestRow = existingRenewals?.[0] || null;
      const alreadyPending = Boolean(requestRow);

      if (!requestRow) {
        const { data: insertedRequest, error: requestError } = await supabaseAdmin
          .from("booking_requests")
          .insert({
            sender_id: authUser.id,
            receiver_id: renewalRecipientId,
            group_id: receiverEntityType === "group" ? originalApp.group_id : null,
            message: renewalMessage,
            status: "pending",
            event_details: renewalEventDetails,
          })
          .select("id, created_at, sender_id, receiver_id, group_id, studio_id, status, event_details, attachment_url")
          .single();

        if (requestError) {
          return new Response(
            JSON.stringify({ error: requestError.message }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            },
          );
        }

        requestRow = insertedRequest;
      }

      if (!alreadyPending) {
        // 4. Send notification to the recipient about the actionable renewal offer
          const notificationPayload = {
            user_id: renewalRecipientId,
            type: "success",
            title: "Contract Renewal Offer",
            message: `Great news! ${senderEntityName} wants to work with you again for "${gigName}". Open Activity to accept or decline the offer.`,
            read: false,
            meta: buildNotificationRouteMeta("/bookings", { tab: "Pending" }, {
              type: "contract_renewal",
              event_type: "contract_renewal",
              request_id: requestRow?.id || null,
              gig_id: originalApp.gig_id || originalApp.gig?.id || null,
              original_application_id: application_id,
              organizer_id: authUser.id,
              production_team_id: originalApp.production_team_id || null,
            }),
          };
          const { error: notifyError } = await supabaseAdmin
            .from("notifications")
            .insert(notificationPayload);

          if (!notifyError) {
            scheduleCoreActionEmailForNotification(supabaseAdmin, notificationPayload, { source: "manage-bookings" });
          }

          if (notifyError) {
            console.error("Error sending renewal notification:", notifyError);
          }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: alreadyPending
            ? `A renewal offer is already pending for ${receiverEntityName}.`
            : `Renewal offer sent to ${receiverEntityName}!`,
          applicant_id: renewalRecipientId,
          gig_id: originalApp.gig_id || originalApp.gig?.id || null,
          request: requestRow,
          already_pending: alreadyPending,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // 9. CONFIRM PAYMENT (Secure Server-Side Confirmation)
    if (action === "confirm_payment") {
      const { booking_id, payment_intent_id, payment_method_id, amount } = params;


      if (!booking_id) {
        return new Response(JSON.stringify({ error: "Booking ID is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      // 1. Fetch current booking to check status
      const { data: booking, error: fetchError } = await supabaseClient
        .from("studio_bookings")
        .select("id, status, payment_status, payment_type, remaining_balance, final_price, user_id, studio:studios(name)")
        .eq("id", booking_id)
        .single();

      if (fetchError || !booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      if (booking.user_id !== authUser.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      // 2. Prepare update data
      // If it sends 'confirmed' status, it moves to Upcoming
      const updateData: any = {
        paid_at: new Date().toISOString(),
        status: 'confirmed', // Auto-confirm when paid
      };

      // Handle remaining balance logic
      if (booking.payment_type === 'downpayment' && booking.remaining_balance > 0) {
        // Downpayment paid, but balance remains — mark as partial
        updateData.payment_status = 'partial';
      } else {
        // Full payment or Balance payment -> clear balance
        updateData.payment_status = 'paid';
        updateData.remaining_balance = 0;
      }


      // 3. Update using Admin client to bypass RLS if necessary (though service role is used here)
      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from("studio_bookings")
        .update(updateData)
        .eq("id", booking_id)
        .select()
        .single();

      if (updateError) {
        console.error("❌ Notification error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update booking status", details: updateError }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      // 4. Send Confirmation Notification to User
      try {
        const notificationPayload = {
          user_id: booking.user_id,
          type: "success",
          title: "Payment Successful! 🎉",
          message: `Your booking at ${booking.studio?.name} has been confirmed.`,
          read: false,
          meta: buildNotificationRouteMeta("/bookings", undefined, {
            booking_id: booking.id,
            type: "booking_confirmation"
          })
        };
        const { error: notifyError } = await supabaseAdmin.from("notifications").insert(notificationPayload);
        if (notifyError) {
          console.error("❌ Notification error:", notifyError);
        } else {
          scheduleCoreActionEmailForNotification(supabaseAdmin, notificationPayload, { source: "manage-bookings" });
        }
      } catch (notifyError) {
        console.error("❌ Notification error:", notifyError);
        // Don't fail the request just because notification failed
      }

      return new Response(JSON.stringify({ success: true, booking: updatedBooking }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // CLEAR REMAINING BALANCE (Face-to-Face Payment)
    if (action === "clear_balance") {
      const { booking_id, owner_id, amount } = params;

      if (!booking_id || !owner_id || !amount) {
        return new Response(
          JSON.stringify({ error: "Missing required parameters" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // 1. Get the booking and verify ownership
      const { data: booking, error: bookingError } = await supabaseClient
        .from("studio_bookings")
        .select("*, studio:studios(id, owner_id, name)")
        .eq("id", booking_id)
        .single();

      if (bookingError || !booking) {
        return new Response(
          JSON.stringify({ error: "Booking not found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      // 2. Verify the owner owns this studio, or assigned staff can manage booking actions.
      const clearBalanceStaffAccess = booking.studio_id
        ? await getStaffAccessForStudio(supabaseAdmin, authUser.id, booking.studio_id)
        : null;
      const canClearBalance =
        booking.studio?.owner_id === authUser.id ||
        (clearBalanceStaffAccess !== null && clearBalanceStaffAccess <= 2);

      if (!canClearBalance) {
        return new Response(
          JSON.stringify({ error: "You are not authorized to modify this booking" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      // 3. Verify there's a remaining balance
      if (!booking.remaining_balance || booking.remaining_balance <= 0) {
        return new Response(
          JSON.stringify({ error: "No remaining balance to clear" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const balanceAmount = booking.remaining_balance;

      // 4. Update the booking to clear the balance
      const { error: updateError } = await supabaseAdmin
        .from("studio_bookings")
        .update({
          remaining_balance: 0,
          payment_status: "paid",
          payment_amount: booking.final_price, // Full amount is now paid
          paid_at: booking.paid_at || new Date().toISOString(),
        })
        .eq("id", booking_id);

      if (updateError) {
        console.error("Error updating booking:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update booking" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      // 5. Credit the owner's wallet
      try {
        await creditStudioBookingBalanceToOwner(supabaseAdmin, booking, balanceAmount);
      } catch (walletCreditError) {
        console.error("Wallet credit error:", walletCreditError);
      }

      // 6. Notify the customer that their balance was cleared
      const notificationPayload = {
        user_id: booking.user_id,
        type: "success",
        title: "Balance Cleared! ✅",
        message: `Your remaining balance of ₱${balanceAmount.toLocaleString()} for ${booking.studio?.name || "your booking"} has been marked as paid.`,
        read: false,
        meta: buildNotificationRouteMeta("/bookings", undefined, {
          type: "balance_cleared",
          booking_id: booking_id,
          amount: balanceAmount,
        }),
      };
      const { error: notifyError } = await supabaseAdmin
        .from("notifications")
        .insert(notificationPayload);

      if (!notifyError) {
        scheduleCoreActionEmailForNotification(supabaseAdmin, notificationPayload, { source: "manage-bookings" });
      }

      if (notifyError) {
        console.error("Notification error:", notifyError);
      }


      return new Response(
        JSON.stringify({
          success: true,
          message: `Balance of ₱${balanceAmount.toLocaleString()} cleared successfully`,
          amount: balanceAmount,
          booking_id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ADMIN COMPAT: FETCH REPORT DETAILS
    if (action === "fetch_report_details") {
      const reportId = String(params?.reportId || "").trim();

      if (!reportId) {
        return new Response(JSON.stringify({ error: "Missing reportId" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const requesterRole = await getRequesterRole(supabaseClient, authUser.id);
      if (requesterRole !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const { data: report, error: reportError } = await supabaseAdmin
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();

      if (reportError) throw reportError;

      if (!report) {
        return new Response(JSON.stringify({ error: "Report not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      let reporterProfile = null;
      if (report.reporter_id) {
        const { data: reporterRow, error: reporterError } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .eq("id", report.reporter_id)
          .maybeSingle();

        if (reporterError) throw reporterError;
        reporterProfile = reporterRow || null;
      }

      const targetDetails = await fetchReportTargetDetails(
        supabaseAdmin,
        report.target_type,
        report.target_id,
      );

      return new Response(
        JSON.stringify({
          report: {
            ...report,
            reporter_name: reporterProfile?.full_name || "Unknown",
            reporter_email: reporterProfile?.email || "",
          },
          reporter_profile: reporterProfile,
          target: targetDetails,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ADMIN COMPAT: FETCH USER DETAILS
    if (action === "fetch_user_details") {
      const userId = String(params?.userId || "").trim();

      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const requesterRole = await getRequesterRole(supabaseClient, authUser.id);
      if (requesterRole !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      return new Response(
        JSON.stringify({
          item: profile || null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ADMIN: FETCH BOOKING INCIDENTS QUEUE
    if (action === "admin_fetch_booking_incidents") {
      const { statusFilter = "all", limit = 100 } = params;

      const requesterRole = await getRequesterRole(supabaseClient, authUser.id);
      if (requesterRole !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      let incidentQuery = supabaseAdmin
        .from("booking_incidents")
        .select(
          "id, booking_id, reporter_user_id, counterparty_user_id, issue_type, status, reporter_notes, counterparty_notes, response_deadline_at, responded_at, resolved_at, resolved_by_user_id, resolution, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(Number(limit) || 100, 1), 200));

      if (statusFilter && statusFilter !== "all") {
        incidentQuery = incidentQuery.eq("status", statusFilter);
      }

      const { data: incidents, error: incidentError } = await incidentQuery;

      if (incidentError) {
        if (isMissingTableError(incidentError, "booking_incidents")) {
          return new Response(
            JSON.stringify({
              error:
                "Booking incidents are not available yet. Apply the latest booking incident migration first.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 503,
            },
          );
        }
        throw incidentError;
      }

      const bookingIds = [...new Set((incidents || []).map((item: any) => item.booking_id).filter(Boolean))];
      const profileIds = [
        ...new Set(
          (incidents || [])
            .flatMap((item: any) => [
              item.reporter_user_id,
              item.counterparty_user_id,
              item.resolved_by_user_id,
            ])
            .filter(Boolean),
        ),
      ];

      const bookingMap = new Map<string, any>();
      if (bookingIds.length > 0) {
        const { data: bookings, error: bookingsError } = await supabaseAdmin
          .from("studio_bookings")
          .select("id, booking_date, start_time, end_time, studio_id, studio:studios(name)")
          .in("id", bookingIds);

        if (bookingsError) throw bookingsError;

        (bookings || []).forEach((booking: any) => {
          bookingMap.set(booking.id, booking);
        });
      }

      const profileMap = new Map<string, any>();
      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", profileIds);

        if (profilesError) throw profilesError;

        (profiles || []).forEach((profile: any) => {
          profileMap.set(profile.id, profile);
        });
      }

      const items = (incidents || []).map((incident: any) => {
        const booking = bookingMap.get(incident.booking_id);
        const reporter = profileMap.get(incident.reporter_user_id);
        const counterparty = profileMap.get(incident.counterparty_user_id);
        const resolver = profileMap.get(incident.resolved_by_user_id);

        return {
          ...incident,
          studio_name: booking?.studio?.name || null,
          booking_date: booking?.booking_date || null,
          booking_start_time: booking?.start_time || null,
          booking_end_time: booking?.end_time || null,
          reporter_name: reporter?.full_name || "Unknown",
          reporter_email: reporter?.email || "",
          counterparty_name: counterparty?.full_name || "Unknown",
          counterparty_email: counterparty?.email || "",
          resolver_name: resolver?.full_name || null,
        };
      });

      return new Response(JSON.stringify({ items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ADMIN: RESOLVE BOOKING INCIDENT
    if (action === "admin_resolve_booking_incident") {
      const { incident_id, resolution, admin_notes } = params;
      const allowedResolutions = [
        "resolved_refund",
        "resolved_no_refund",
        "dismissed",
      ];

      if (!incident_id || !allowedResolutions.includes(resolution)) {
        return new Response(
          JSON.stringify({
            error:
              "incident_id and valid resolution are required (resolved_refund | resolved_no_refund | dismissed).",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const requesterRole = await getRequesterRole(supabaseClient, authUser.id);
      if (requesterRole !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const { data: incident, error: incidentError } = await supabaseAdmin
        .from("booking_incidents")
        .select(
          "id, booking_id, status, issue_type, reporter_user_id, counterparty_user_id, booking:studio_bookings(booking_date, start_time, studio:studios(name))",
        )
        .eq("id", incident_id)
        .maybeSingle();

      if (incidentError) {
        if (isMissingTableError(incidentError, "booking_incidents")) {
          return new Response(
            JSON.stringify({
              error:
                "Booking incidents are not available yet. Apply the latest booking incident migration first.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 503,
            },
          );
        }
        throw incidentError;
      }

      if (!incident) {
        return new Response(JSON.stringify({ error: "Incident not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      if (!["open", "responded", "manual_review"].includes(incident.status)) {
        return new Response(
          JSON.stringify({ error: "This incident is already resolved." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const fallbackResolutionNote =
        resolution === "resolved_refund"
          ? "Admin resolved incident with refund outcome."
          : resolution === "resolved_no_refund"
            ? "Admin resolved incident with no-refund outcome."
            : "Admin dismissed incident.";

      const resolverNotes =
        typeof admin_notes === "string" && admin_notes.trim()
          ? admin_notes.trim()
          : fallbackResolutionNote;

      const { data: updatedIncident, error: updateIncidentError } = await supabaseAdmin
        .from("booking_incidents")
        .update({
          status: resolution,
          resolved_at: new Date().toISOString(),
          resolved_by_user_id: authUser.id,
          resolution: resolverNotes,
        })
        .eq("id", incident_id)
        .select("*")
        .single();

      if (updateIncidentError) throw updateIncidentError;

      if (resolution !== "resolved_refund") {
        const { error: payoutReleaseError } = await supabaseAdmin.rpc(
          "release_booking_payout",
          {
            p_booking_id: incident.booking_id,
            p_reason: `Admin resolved incident ${incident_id}: ${resolution}`,
          },
        );

        if (
          payoutReleaseError &&
          payoutReleaseError.code !== "42883" &&
          payoutReleaseError.code !== "PGRST202"
        ) {
          console.error("Failed to release booking payout:", payoutReleaseError);
        }
      }

      const studioName = incident?.booking?.studio?.name || "the studio";
      const whenLabel = [incident?.booking?.booking_date, incident?.booking?.start_time]
        .filter(Boolean)
        .join(" ");
      const resolutionLabel = String(resolution).replace(/_/g, " ");

      const notifyTargets = [
        incident.reporter_user_id,
        incident.counterparty_user_id,
      ].filter(Boolean) as string[];

      for (const userId of [...new Set(notifyTargets)]) {
        await insertNotificationIfMissing(supabaseAdmin, {
          user_id: userId,
          type: "info",
          title: "Booking Incident Resolved",
          message: `An admin resolved the booking incident for ${studioName}${whenLabel ? ` (${whenLabel})` : ""} as ${resolutionLabel}.`,
          image: null,
          meta: {
            incident_id,
            booking_id: incident.booking_id,
            resolution,
            event_type: "booking_incident_resolved_by_admin",
          },
        });
      }

      return new Response(
        JSON.stringify({ success: true, incident: updatedIncident }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    throw new Error("Invalid action");
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

