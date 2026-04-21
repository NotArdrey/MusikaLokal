type NotificationMeta = Record<string, unknown> | null | undefined;

type NotificationRouteOptions = {
  pathname?: string | null;
  routeParams?: Record<string, unknown> | null;
};

type NotificationRouteTarget = {
  pathname: string;
  routeParams?: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

const normalizePathname = (value: unknown) => {
  const pathname = readString(value);
  if (!pathname) {
    return null;
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
};

const normalizeRouteParams = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  const normalized: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    if (typeof rawValue === "object") {
      continue;
    }

    const stringValue = String(rawValue).trim();
    if (!stringValue) {
      continue;
    }

    normalized[key] = stringValue;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
};

const inferDealType = (eventType: string | null) => {
  if (eventType?.toLowerCase().includes("recording")) {
    return "recording";
  }

  return "partnership";
};

const inferNotificationRoute = (
  meta: Record<string, unknown>,
): NotificationRouteTarget | null => {
  const eventType = readString(meta.event_type, meta.type)?.toLowerCase() || null;

  const teamId = readString(meta.team_id, meta.teamId);
  if (teamId) {
    return {
      pathname: "/production_team",
      routeParams: { teamId },
    };
  }

  const projectId = readString(meta.project_id, meta.projectId);
  if (projectId) {
    return {
      pathname: "/producer_project_details",
      routeParams: { project_id: projectId },
    };
  }

  const dealId = readString(meta.deal_id, meta.dealId);
  if (dealId) {
    return {
      pathname: "/deal_details",
      routeParams: {
        deal_id: dealId,
        deal_type: readString(meta.deal_type, meta.dealType) || inferDealType(eventType),
      },
    };
  }

  const bookingId = readString(meta.booking_id, meta.bookingId);
  if (bookingId) {
    return { pathname: "/bookings" };
  }

  if (eventType === "contract_renewal") {
    return { pathname: "/bookings" };
  }

  const orderId = readString(meta.order_id, meta.orderId);
  if (orderId) {
    return { pathname: "/orders" };
  }

  const productId = readString(meta.product_id, meta.productId);
  if (productId) {
    return {
      pathname: "/product_details",
      routeParams: { product_id: productId },
    };
  }

  const postId = readString(meta.post_id, meta.postId);
  if (postId) {
    return {
      pathname: "/post_details",
      routeParams: { post_id: postId },
    };
  }

  const playlistId = readString(meta.playlist_id, meta.playlistId);
  if (playlistId) {
    return {
      pathname: "/playlist_details",
      routeParams: { playlist_id: playlistId },
    };
  }

  const stationId = readString(meta.station_id, meta.stationId);
  if (stationId) {
    return {
      pathname: "/station_details",
      routeParams: { station_id: stationId },
    };
  }

  const groupId = readString(meta.group_id, meta.groupId);
  if (groupId) {
    return {
      pathname: "/group_details",
      routeParams: { id: groupId },
    };
  }

  if (eventType === "follow") {
    const followerId = readString(meta.follower_id, meta.followerId, meta.actor_id, meta.actorId);
    if (followerId) {
      return {
        pathname: "/profile",
        routeParams: { userId: followerId },
      };
    }
  }

  const walletEvent = eventType === "wallet_deposit" ||
    eventType?.startsWith("subscription_") ||
    readString(meta.withdrawal_id, meta.withdrawalId, meta.refund_id, meta.refundId, meta.plan_id, meta.planId);

  if (walletEvent) {
    return { pathname: "/wallet" };
  }

  return null;
};

export function withNotificationRouteMeta(
  meta?: NotificationMeta,
  options: NotificationRouteOptions = {},
) {
  const nextMeta = isRecord(meta) ? { ...meta } : {};

  const explicitPath = normalizePathname(options.pathname);
  const explicitParams = normalizeRouteParams(options.routeParams);

  if (explicitPath) {
    nextMeta.route = explicitPath;

    if (explicitParams) {
      nextMeta.route_params = explicitParams;
    } else {
      delete nextMeta.route_params;
    }

    return Object.keys(nextMeta).length > 0 ? nextMeta : null;
  }

  const existingPath = normalizePathname(nextMeta.route);
  if (existingPath) {
    nextMeta.route = existingPath;

    const existingParams = normalizeRouteParams(nextMeta.route_params);
    if (existingParams) {
      nextMeta.route_params = existingParams;
    } else {
      delete nextMeta.route_params;
    }

    return Object.keys(nextMeta).length > 0 ? nextMeta : null;
  }

  const inferredRoute = inferNotificationRoute(nextMeta);
  if (inferredRoute) {
    nextMeta.route = inferredRoute.pathname;

    const inferredParams = normalizeRouteParams(inferredRoute.routeParams);
    if (inferredParams) {
      nextMeta.route_params = inferredParams;
    }
  }

  return Object.keys(nextMeta).length > 0 ? nextMeta : null;
}

export function buildNotificationRouteMeta(
  pathname: string,
  routeParams?: Record<string, unknown> | null,
  meta?: NotificationMeta,
) {
  return withNotificationRouteMeta(meta, { pathname, routeParams });
}