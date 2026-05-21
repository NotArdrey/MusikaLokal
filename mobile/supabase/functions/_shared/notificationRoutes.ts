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

export type NotificationSeverityType = "success" | "info" | "warning" | "error";

const NOTIFICATION_SEVERITY_TYPES = new Set<NotificationSeverityType>([
  "success",
  "info",
  "warning",
  "error",
]);

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }

    const trimmed = String(value).trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

const readEventType = (...values: unknown[]) => {
  for (const value of values) {
    const eventType = readString(value)?.toLowerCase();
    if (eventType && !NOTIFICATION_SEVERITY_TYPES.has(eventType as NotificationSeverityType)) {
      return eventType;
    }
  }

  return null;
};

export function normalizeNotificationSeverityType(
  value: unknown,
  fallback: NotificationSeverityType = "info",
): NotificationSeverityType {
  const normalized = readString(value)?.toLowerCase();

  return normalized && NOTIFICATION_SEVERITY_TYPES.has(normalized as NotificationSeverityType)
    ? (normalized as NotificationSeverityType)
    : fallback;
}

export function withNotificationSeverityType<T extends Record<string, unknown>>(payload: T) {
  const rawType = readString(payload.type)?.toLowerCase();
  const severityType = normalizeNotificationSeverityType(rawType);
  const nextPayload: Record<string, unknown> = {
    ...payload,
    type: severityType,
  };

  if (rawType && rawType !== severityType) {
    const meta = isRecord(payload.meta) ? { ...payload.meta } : {};
    const existingEventType = readString(
      meta.event_type,
      meta.eventType,
      meta.notification_type,
      meta.notificationType,
    );

    if (!existingEventType) {
      meta.event_type = rawType;
    }

    nextPayload.meta = meta;
  }

  return nextPayload as T & { type: NotificationSeverityType };
}

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


const inferNotificationRoute = (
  meta: Record<string, unknown>,
): NotificationRouteTarget | null => {
  const eventType = readEventType(
    meta.event_type,
    meta.eventType,
    meta.notification_type,
    meta.notificationType,
    meta.type,
  );
  const senderEntityType = readString(meta.sender_entity_type, meta.senderEntityType)?.toLowerCase();
  const requestKind = readString(meta.request_kind, meta.requestKind)?.toLowerCase();

  if (eventType?.includes("booking_request")) {
    const status = readString(meta.status)?.toLowerCase();
    const isTerminal =
      eventType.includes("cancelled") ||
      eventType.includes("canceled") ||
      eventType.includes("declined") ||
      eventType.includes("rejected") ||
      ["cancelled", "canceled", "declined", "rejected"].includes(status || "");

    return {
      pathname: "/bookings",
      routeParams: {
        tab: isTerminal || (status && status !== "pending") ? "History" : "Pending",
      },
    };
  }

  if (
    eventType === "listing_connection_request" &&
    (senderEntityType === "production_team" || requestKind === "invite")
  ) {
    return {
      pathname: "/bookings",
      routeParams: { tab: "Pending" },
    };
  }

  if (eventType === "listing_connection_request") {
    const status = readString(meta.status)?.toLowerCase();
    return {
      pathname: "/bookings",
      routeParams: { tab: status && status !== "pending" ? "History" : "Pending" },
    };
  }

  if (eventType) {
    const status = readString(meta.status)?.toLowerCase();
    const isTerminal =
      eventType.includes("cancelled") ||
      eventType.includes("canceled") ||
      eventType.includes("fired") ||
      ["cancelled", "canceled", "fired", "rejected", "declined"].includes(status || "");

    if (isTerminal) {
      return { pathname: "/bookings", routeParams: { tab: "History" } };
    }

    if (eventType.includes("application")) {
      return {
        pathname: "/bookings",
        routeParams: { tab: status && status !== "pending" ? "History" : "Pending" },
      };
    }
  }

  const teamId = readString(
    meta.team_id,
    meta.teamId,
    meta.production_team_id,
    meta.productionTeamId,
  );
  if (teamId) {
    return {
      pathname: "/production_team",
      routeParams: { teamId },
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
    readString(meta.withdrawal_id, meta.withdrawalId, meta.refund_id, meta.refundId);

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
