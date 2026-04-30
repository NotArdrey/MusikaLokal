export type NotificationRouteParams = Record<string, string>;

export type NotificationNavigationTarget = {
  pathname: string;
  params?: NotificationRouteParams;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

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
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
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

  if (explicitPath) {
    return explicitParams
      ? { pathname: explicitPath, params: explicitParams }
      : { pathname: explicitPath };
  }

  const notificationType = readStringId(record.type, meta.type)?.toLowerCase();
  if (notificationType === "leadership_transfer") {
    return { pathname: "/notifications" };
  }

  const teamId = readStringId(record.team_id, record.teamId, meta.team_id, meta.teamId);
  if (teamId) {
    return { pathname: "/production_team", params: { teamId } };
  }

  const bookingId = readStringId(
    record.booking_id,
    record.bookingId,
    meta.booking_id,
    meta.bookingId,
  );
  if (bookingId || notificationType === "contract_renewal") {
    return { pathname: "/bookings" };
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

  const postId = readStringId(record.post_id, record.postId, meta.post_id, meta.postId);
  if (postId) {
    return { pathname: "/post_details", params: { post_id: postId } };
  }

  const groupId = readStringId(record.group_id, record.groupId, meta.group_id, meta.groupId);
  if (groupId) {
    return { pathname: "/group_details", params: { id: groupId } };
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
