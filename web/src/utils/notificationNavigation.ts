export type NotificationRouteParams = Record<string, string>;

export type NotificationNavigationTarget = {
  pathname: string;
  params?: NotificationRouteParams;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const NOTIFICATION_SEVERITY_TYPES = new Set(["success", "info", "warning", "error"]);

const normalizeRoute = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const readStringId = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }

    const trimmed = String(value).trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
};

const normalizeListingType = (...values: unknown[]) =>
  readStringId(...values)
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const normalizeActivityTab = (...values: unknown[]) => {
  const normalized = readStringId(...values)?.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!normalized) return undefined;

  if (normalized === "active musicians") return "Active Musicians";

  const titled = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return ["Pending", "Upcoming", "Ongoing", "Review", "History", "Applicants"].includes(titled)
    ? titled
    : undefined;
};

const includesAny = (value: string, needles: string[]) =>
  needles.some((needle) => value.includes(needle));

const inferActivityTabFromNotification = (
  record: Record<string, unknown>,
  meta: Record<string, unknown>,
  notificationType?: string,
  explicitParams?: NotificationRouteParams,
) => {
  const explicitTab = normalizeActivityTab(explicitParams?.tab, meta.tab, record.tab);
  if (explicitTab) return explicitTab;

  const status = readStringId(
    meta.status,
    record.status,
    meta.booking_status,
    meta.bookingStatus,
    meta.application_status,
    meta.applicationStatus,
    meta.payment_status,
    meta.paymentStatus,
  )?.toLowerCase() || "";
  const eventType = (notificationType || "").toLowerCase();
  const sourceTable = readStringId(meta.source_table, meta.sourceTable, record.source_table, record.sourceTable)?.toLowerCase() || "";
  const title = readStringId(record.title, meta.title)?.toLowerCase() || "";
  const message = readStringId(record.message, meta.message)?.toLowerCase() || "";
  const combined = `${eventType} ${status} ${sourceTable} ${title} ${message}`;

  if (
    includesAny(combined, [
      "cancelled",
      "canceled",
      "declined",
      "rejected",
      "resigned",
      "fired",
      "refunded",
      "removed from gig",
      "gig cancelled",
      "booking cancelled",
    ])
  ) {
    return "History";
  }

  if (
    includesAny(combined, [
      "payment successful",
      "payment received",
      "paid",
      "confirmed",
      "accepted",
      "reserved",
      "reservation",
      "downpayment",
      "partially_paid",
      "moved to upcoming",
      "upcoming",
    ])
  ) {
    return "Upcoming";
  }

  if (includesAny(combined, ["ongoing", "in_progress", "in progress", "happening now"])) {
    return "Ongoing";
  }

  if (includesAny(combined, ["completed", "review"])) {
    return "Review";
  }

  if (includesAny(combined, ["pending", "booking request", "new booking request", "request created", "awaiting"])) {
    return "Pending";
  }

  return undefined;
};

const readNotificationEventType = (
  record: Record<string, unknown>,
  meta: Record<string, unknown>,
) => {
  const eventTypeCandidates = [
    meta.event_type,
    meta.eventType,
    meta.notification_type,
    meta.notificationType,
    meta.type,
    record.event_type,
    record.eventType,
    record.notification_type,
    record.notificationType,
    record.type,
  ];

  for (const candidate of eventTypeCandidates) {
    const eventType = readStringId(candidate)?.toLowerCase();
    if (eventType && !NOTIFICATION_SEVERITY_TYPES.has(eventType)) {
      return eventType;
    }
  }

  return undefined;
};

const isProductionTeamInviteNotification = (
  notificationType: string | undefined,
  record: Record<string, unknown>,
  meta: Record<string, unknown>,
) => {
  if (notificationType !== "listing_connection_request") {
    return false;
  }

  const senderEntityType = readStringId(
    meta.sender_entity_type,
    meta.senderEntityType,
    record.sender_entity_type,
    record.senderEntityType,
  )?.toLowerCase();

  const requestKind = readStringId(
    meta.request_kind,
    meta.requestKind,
    record.request_kind,
    record.requestKind,
  )?.toLowerCase();

  return senderEntityType === "production_team" || requestKind === "invite";
};

const resolveBookingRequestNotificationTarget = (
  notificationType: string | undefined,
  record: Record<string, unknown>,
  meta: Record<string, unknown>,
): NotificationNavigationTarget | null => {
  const bookingId = readStringId(
    record.booking_id,
    record.bookingId,
    meta.booking_id,
    meta.bookingId,
  );
  if (!bookingId) return null;

  const eventType = notificationType || "";
  const title = readStringId(record.title, meta.title)?.toLowerCase() || "";
  const message = readStringId(record.message, meta.message)?.toLowerCase() || "";
  const isBookingRequest =
    eventType.includes("booking_request") ||
    title.includes("booking request") ||
    message.includes("booking request");

  if (!isBookingRequest) return null;

  const status = readStringId(meta.status, record.status)?.toLowerCase();
  const isTerminal =
    eventType.includes("cancelled") ||
    eventType.includes("canceled") ||
    eventType.includes("declined") ||
    eventType.includes("rejected") ||
    ["cancelled", "canceled", "declined", "rejected"].includes(status || "");

  return {
    pathname: "/bookings",
    params: {
      tab: isTerminal || (status && status !== "pending") ? "History" : "Pending",
    },
  };
};

const isGigApplicationNotification = (
  notificationType: string | undefined,
  record: Record<string, unknown>,
  meta: Record<string, unknown>,
) => {
  const title = readStringId(record.title, meta.title)?.toLowerCase() || "";
  const hasApplicationId = Boolean(readStringId(
    record.application_id,
    record.applicationId,
    meta.application_id,
    meta.applicationId,
  ));
  const hasGigId = Boolean(readStringId(
    record.gig_id,
    record.gigId,
    meta.gig_id,
    meta.gigId,
  ));

  return (
    notificationType === "gig_application" ||
    title.includes("new gig application") ||
    (hasApplicationId && hasGigId)
  );
};

export const normalizeNotificationRouteParams = (value: unknown) => {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
    .filter(([, entryValue]) => typeof entryValue !== "object")
    .map(([key, entryValue]) => [key, String(entryValue)]);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as NotificationRouteParams;
};

export const buildNotificationRouteMeta = (
  pathname: string,
  routeParams?: Record<string, unknown> | null,
  meta?: Record<string, unknown> | null,
) => {
  const nextMeta = isRecord(meta) ? { ...meta } : {};
  const normalizedPath = normalizeRoute(pathname);
  const normalizedParams = normalizeNotificationRouteParams(routeParams);

  if (normalizedPath) {
    nextMeta.route = normalizedPath;
  }

  if (normalizedParams) {
    nextMeta.route_params = normalizedParams;
  }

  return nextMeta;
};

export const resolveNotificationNavigationTarget = (
  value: unknown,
  fallbackRoute?: string,
): NotificationNavigationTarget | null => {
  const record = isRecord(value) ? value : {};
  const meta = isRecord(record.meta) ? record.meta : {};

  const explicitPath = normalizeRoute(record.route) || normalizeRoute(meta.route);
  const explicitParams = normalizeNotificationRouteParams(record.route_params)
    || normalizeNotificationRouteParams(record.params)
    || normalizeNotificationRouteParams(meta.route_params)
    || normalizeNotificationRouteParams(meta.params);
  const notificationType = readNotificationEventType(record, meta);
  const activityTab = inferActivityTabFromNotification(record, meta, notificationType, explicitParams);
  const postId = readStringId(record.post_id, record.postId, meta.post_id, meta.postId, explicitParams?.post_id, explicitParams?.postId);
  const teamId = readStringId(
    record.team_id,
    record.teamId,
    record.production_team_id,
    record.productionTeamId,
    meta.team_id,
    meta.teamId,
    meta.production_team_id,
    meta.productionTeamId,
    explicitParams?.teamId,
    explicitParams?.team_id,
    explicitParams?.production_team_id,
    explicitParams?.productionTeamId,
  );
  const gigId = readStringId(
    record.gig_id,
    record.gigId,
    meta.gig_id,
    meta.gigId,
    explicitParams?.gig_id,
    explicitParams?.gigId,
  );
  const studioId = readStringId(
    record.studio_id,
    record.studioId,
    meta.studio_id,
    meta.studioId,
    explicitParams?.studio_id,
    explicitParams?.studioId,
  );
  const listingId = readStringId(
    record.listing_id,
    record.listingId,
    meta.listing_id,
    meta.listingId,
    explicitParams?.reopenListingId,
    explicitParams?.listing_id,
    explicitParams?.listingId,
    explicitParams?.id,
  );
  const listingType = normalizeListingType(
    record.listing_type,
    record.listingType,
    meta.listing_type,
    meta.listingType,
    explicitParams?.listing_type,
    explicitParams?.listingType,
    meta.display_listing_type,
    meta.displayListingType,
  );

  if (explicitPath === "/post_details" && postId) {
    return { pathname: "/feed", params: { postId } };
  }

  if (isProductionTeamInviteNotification(notificationType, record, meta)) {
    return { pathname: "/bookings", params: { tab: "Pending" } };
  }

  const bookingRequestTarget = resolveBookingRequestNotificationTarget(notificationType, record, meta);
  if (bookingRequestTarget) {
    return bookingRequestTarget;
  }

  const bookingId = readStringId(
    record.booking_id,
    record.bookingId,
    meta.booking_id,
    meta.bookingId,
    explicitParams?.booking_id,
    explicitParams?.bookingId,
  );
  const isActivityNotification = Boolean(
    bookingId ||
      activityTab ||
      notificationType?.includes("booking") ||
      notificationType?.includes("application") ||
      notificationType === "contract_renewal" ||
      explicitPath === "/bookings",
  );

  if (isActivityNotification && activityTab) {
    return { pathname: "/bookings", params: { tab: activityTab } };
  }

  if (isGigApplicationNotification(notificationType, record, meta)) {
    const gigId = readStringId(
      record.gig_id,
      record.gigId,
      meta.gig_id,
      meta.gigId,
      explicitParams?.id,
    );
    const params = {
      ...(explicitParams || {}),
      ...(gigId ? { id: gigId } : {}),
      tab: "Applicants",
    };

    return { pathname: "/manage_gig", params };
  }

  if (explicitPath === "/feed") {
    if (postId) {
      return { pathname: "/feed", params: { postId } };
    }

    if (teamId || (listingId && (listingType === "production_team" || listingType === "production"))) {
      return { pathname: "/production_team", params: { teamId: teamId || listingId! } };
    }

    const feedListingId = explicitParams?.reopenListingId || gigId || studioId || listingId;
    if (feedListingId && (!listingType || ["gig", "studio", "venue"].includes(listingType))) {
      return { pathname: "/feed", params: { reopenListingId: feedListingId } };
    }
  }

  if (explicitPath) {
    return explicitParams
      ? { pathname: explicitPath, params: explicitParams }
      : { pathname: explicitPath };
  }

  if (notificationType === "leadership_transfer") {
    return { pathname: "/notifications" };
  }

  if (teamId) {
    return { pathname: "/production_team", params: { teamId } };
  }

  if (bookingId || notificationType === "contract_renewal") {
    return { pathname: "/bookings", params: { tab: activityTab || "Pending" } };
  }

  const orderId = readStringId(record.order_id, record.orderId, meta.order_id, meta.orderId);
  if (orderId) {
    return { pathname: "/orders" };
  }

  const stationId = readStringId(record.station_id, record.stationId, meta.station_id, meta.stationId);
  if (stationId) {
    return { pathname: "/station_details", params: { station_id: stationId } };
  }

  const playlistId = readStringId(record.playlist_id, record.playlistId, meta.playlist_id, meta.playlistId);
  if (playlistId) {
    return { pathname: "/playlist_details", params: { playlist_id: playlistId } };
  }

  const productId = readStringId(record.product_id, record.productId, meta.product_id, meta.productId);
  if (productId) {
    return { pathname: "/product_details", params: { product_id: productId } };
  }

  if (postId) {
    return { pathname: "/feed", params: { postId } };
  }

  const groupId = readStringId(record.group_id, record.groupId, meta.group_id, meta.groupId);
  if (groupId) {
    return { pathname: "/group_details", params: { id: groupId } };
  }

  if (gigId) {
    return { pathname: "/feed", params: { reopenListingId: gigId } };
  }

  if (studioId) {
    return { pathname: "/feed", params: { reopenListingId: studioId } };
  }

  if (listingId && (listingType === "production_team" || listingType === "production")) {
    return { pathname: "/production_team", params: { teamId: listingId } };
  }

  if (listingId && (listingType === "gig" || listingType === "studio" || listingType === "venue")) {
    return { pathname: "/feed", params: { reopenListingId: listingId } };
  }

  if (notificationType === "follow") {
    const followerId = readStringId(
      record.follower_id,
      record.followerId,
      record.actor_id,
      record.actorId,
      meta.follower_id,
      meta.followerId,
      meta.actor_id,
      meta.actorId,
    );

    if (followerId) {
      return { pathname: "/profile", params: { userId: followerId } };
    }
  }

  const profileId = readStringId(
    record.profile_id,
    record.profileId,
    meta.profile_id,
    meta.profileId,
  );
  if (profileId) {
    return { pathname: "/profile", params: { userId: profileId } };
  }

  const walletRelatedId = readStringId(
    record.withdrawal_id,
    record.withdrawalId,
    record.refund_id,
    record.refundId,
    meta.withdrawal_id,
    meta.withdrawalId,
    meta.refund_id,
    meta.refundId,
  );
  if (walletRelatedId || notificationType === "wallet_deposit") {
    return { pathname: "/wallet" };
  }

  const fallbackPath = normalizeRoute(fallbackRoute);
  if (fallbackPath) {
    return { pathname: fallbackPath };
  }

  return null;
};
