import { supabase } from "../../lib/supabase";

type EntityType = "musician" | "group" | "venue" | "production_team";

type RouteParams = Record<string, string | number | null | undefined>;

type FunctionsInvokeError = Error & {
  context?: {
    status?: number;
    clone?: () => {
      json?: () => Promise<unknown>;
      text?: () => Promise<string>;
    };
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };
  code?: string | number;
  details?: string;
  hint?: string;
  status?: number;
};

type FunctionsErrorBody = {
  error?: string;
  message?: string;
  code?: string | number;
  details?: string;
  hint?: string;
};

type ListingRequestPayload = {
  currentUserId: string;
  receiverUserId: string;
  message: string;
  senderEntityType: EntityType;
  senderEntityName: string;
  senderEntityId: string | null;
  receiverEntityType: EntityType;
  receiverEntityName: string;
  receiverEntityId: string | null;
  groupId: string | null;
  studioId: string | null;
  productionTeamId: string | null;
  notificationTitle: string;
  notificationMessage: string;
  notificationImage: string | null;
  attachmentUrl: string | null;
  routePath?: string;
  routeParams?: Record<string, string>;
  extraMeta: Record<string, unknown> | null;
};

const ACTIVE_LISTING_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "approved",
  "connected",
];

const toNonEmptyString = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeExtraMeta = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
};

const buildListingRequestEventDetails = (payload: ListingRequestPayload) => ({
  type: "listing_connection_request",
  sender_entity_type: payload.senderEntityType,
  sender_entity_id: toNonEmptyString(payload.senderEntityId),
  sender_entity_name: payload.senderEntityName,
  receiver_entity_type: payload.receiverEntityType,
  receiver_entity_id: toNonEmptyString(payload.receiverEntityId),
  receiver_entity_name: payload.receiverEntityName,
  production_team_id: toNonEmptyString(payload.productionTeamId),
  route: toNonEmptyString(payload.routePath) || undefined,
  route_params: payload.routeParams,
  ...normalizeExtraMeta(payload.extraMeta),
});

const readEventString = (details: any, key: string) =>
  toNonEmptyString(details?.[key]) ||
  toNonEmptyString(details?.request_details?.[key]);

const valuesConflict = (expected: unknown, actual: unknown) => {
  const normalizedExpected = toNonEmptyString(expected);
  const normalizedActual = toNonEmptyString(actual);

  return Boolean(
    normalizedExpected &&
      normalizedActual &&
      normalizedExpected !== normalizedActual,
  );
};

const isDuplicateListingRequest = (
  row: any,
  expectedDetails: ReturnType<typeof buildListingRequestEventDetails>,
) => {
  const details =
    row?.event_details && typeof row.event_details === "object"
      ? row.event_details
      : {};
  const expectedKind = readEventString(expectedDetails, "request_kind");
  const actualKind = readEventString(details, "request_kind");

  if (expectedKind && actualKind && expectedKind !== actualKind) {
    return false;
  }

  if (
    valuesConflict(expectedDetails.sender_entity_type, details.sender_entity_type) ||
    valuesConflict(expectedDetails.receiver_entity_type, details.receiver_entity_type) ||
    valuesConflict(expectedDetails.sender_entity_id, details.sender_entity_id) ||
    valuesConflict(expectedDetails.receiver_entity_id, details.receiver_entity_id) ||
    valuesConflict(expectedDetails.production_team_id, details.production_team_id)
  ) {
    return false;
  }

  return true;
};

const findActiveDuplicateListingRequest = async (payload: ListingRequestPayload) => {
  const eventDetails = buildListingRequestEventDetails(payload);
  let query = supabase
    .from("booking_requests")
    .select("id, status, event_details")
    .eq("sender_id", payload.currentUserId)
    .eq("receiver_id", payload.receiverUserId)
    .in("status", ACTIVE_LISTING_REQUEST_STATUSES);

  query = payload.groupId
    ? query.eq("group_id", payload.groupId)
    : query.is("group_id", null);

  query = payload.studioId
    ? query.eq("studio_id", payload.studioId)
    : query.is("studio_id", null);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return (data || []).find((row) => isDuplicateListingRequest(row, eventDetails)) || null;
};

const ensureNoActiveDuplicateListingRequest = async (payload: ListingRequestPayload) => {
  const duplicate = await findActiveDuplicateListingRequest(payload);

  if (duplicate) {
    throw new Error("An active request already exists for this listing.");
  }
};

const createListingRequestFallback = async (payload: ListingRequestPayload) => {
  await ensureNoActiveDuplicateListingRequest(payload);

  const eventDetails = buildListingRequestEventDetails(payload);
  const eventMeta = eventDetails as Record<string, any>;

  const { data, error } = await supabase
    .from("booking_requests")
    .insert({
      sender_id: payload.currentUserId,
      receiver_id: payload.receiverUserId,
      group_id: payload.groupId,
      studio_id: payload.studioId,
      message: payload.message,
      status: "pending",
      attachment_url: payload.attachmentUrl,
      event_details: eventDetails,
    })
    .select("id, created_at, sender_id, receiver_id, group_id, studio_id, status, event_details, attachment_url")
    .single();

  if (error) {
    throw error;
  }

  const notificationMeta = {
    type: "listing_connection_request",
    request_id: data?.id || null,
    sender_entity_type: eventDetails.sender_entity_type || null,
    sender_entity_id: eventDetails.sender_entity_id || null,
    sender_entity_name: eventDetails.sender_entity_name || null,
    receiver_entity_type: eventDetails.receiver_entity_type || null,
    receiver_entity_id: eventDetails.receiver_entity_id || null,
    receiver_entity_name: eventDetails.receiver_entity_name || null,
    group_id: payload.groupId || null,
    studio_id: payload.studioId || null,
    production_team_id: eventDetails.production_team_id || null,
    request_kind: eventMeta.request_kind || null,
    request_details: eventMeta.request_details || null,
    route: eventDetails.route || null,
    route_params: eventDetails.route_params || null,
  };

  try {
    const { error: notificationError } = await supabase.functions.invoke("listings-crud", {
      body: {
        action: "create_notification",
        userId: payload.currentUserId,
        targetUserId: payload.receiverUserId,
        type: "info",
        title: payload.notificationTitle,
        message: payload.notificationMessage,
        image: payload.notificationImage,
        meta: notificationMeta,
      },
    });

    if (notificationError) {
      console.error("create_notification fallback failed for listing request", {
        message: notificationError.message,
        status: (notificationError as any).status,
        code: (notificationError as any).code,
        details: (notificationError as any).details,
        hint: (notificationError as any).hint,
        context: (notificationError as any).context,
        request_id: data?.id || null,
      });
    }
  } catch (notificationError) {
    console.warn("booking_requests fallback created request but could not send notification", notificationError);
  }

  return data;
};

const readFunctionsErrorBody = async (
  error: FunctionsInvokeError,
): Promise<FunctionsErrorBody | null> => {
  const responseLike = error?.context;
  if (!responseLike || typeof responseLike !== "object") {
    return null;
  }

  const readable = typeof responseLike.clone === "function"
    ? responseLike.clone()
    : responseLike;

  try {
    if (typeof readable.json === "function") {
      const parsed = await readable.json();
      return parsed && typeof parsed === "object" ? (parsed as FunctionsErrorBody) : null;
    }
  } catch {
    // Fall through to text parsing.
  }

  try {
    if (typeof readable.text === "function") {
      const text = await readable.text();
      if (!text) {
        return null;
      }

      try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? (parsed as FunctionsErrorBody) : { message: text };
      } catch {
        return { message: text };
      }
    }
  } catch {
    return null;
  }

  return null;
};

const getFunctionsErrorMessage = (
  error: FunctionsInvokeError,
  contextBody: FunctionsErrorBody | null,
) => {
  const messageCandidates = [
    contextBody?.error,
    contextBody?.message,
    error?.details,
    error?.hint,
    error?.message,
  ];

  for (const candidate of messageCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return "Failed to send request.";
};

const buildFunctionsError = (
  error: FunctionsInvokeError,
  contextBody: FunctionsErrorBody | null,
) => {
  const normalizedStatus = Number(error?.status || error?.context?.status || 0) || undefined;
  const normalizedError = new Error(
    getFunctionsErrorMessage(error, contextBody),
  ) as FunctionsInvokeError & { contextBody?: FunctionsErrorBody | null };

  normalizedError.name = error?.name || "FunctionsHttpError";
  normalizedError.context = error?.context;
  normalizedError.contextBody = contextBody;
  normalizedError.status = normalizedStatus;
  normalizedError.code = error?.code ?? contextBody?.code;
  normalizedError.details = error?.details ?? contextBody?.details;
  normalizedError.hint = error?.hint ?? contextBody?.hint;

  return normalizedError;
};

const isProductionTeamInvitePayload = (payload: ListingRequestPayload) => {
  const extraMeta = normalizeExtraMeta(payload.extraMeta);
  return (
    payload.senderEntityType === "production_team" &&
    String(extraMeta.request_kind || "").trim().toLowerCase() === "invite"
  );
};

export const uploadListingRequestDocument = async (
  userId: string,
  file: any,
  folder: "contracts" | "applications" = "applications",
) => {
  const response = await fetch(file.uri);
  const arrayBuffer = await response.arrayBuffer();

  const fileExt = file.name?.split(".").pop() || "pdf";
  const storagePath = `${userId}/${folder}/${Date.now()}_${folder}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("documents")
    .upload(storagePath, arrayBuffer, {
      contentType: file.mimeType || "application/pdf",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from("documents")
    .getPublicUrl(data.path);

  return urlData.publicUrl;
};

export interface SubmitListingRequestInput {
  currentUserId: string;
  receiverUserId: string;
  message: string;
  senderEntityType: EntityType;
  senderEntityName: string;
  senderEntityId?: string | null;
  receiverEntityType: EntityType;
  receiverEntityName: string;
  receiverEntityId?: string | null;
  groupId?: string | null;
  studioId?: string | null;
  productionTeamId?: string | null;
  notificationTitle: string;
  notificationMessage: string;
  notificationImage?: string | null;
  attachmentUrl?: string | null;
  routePath?: string | null;
  routeParams?: RouteParams | null;
  extraMeta?: Record<string, unknown> | null;
}

const normalizeRouteParams = (value?: RouteParams | null) => {
  if (!value) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
    .map(([key, entryValue]) => [key, String(entryValue)]);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
};

export const submitListingRequest = async ({
  currentUserId,
  receiverUserId,
  message,
  senderEntityType,
  senderEntityName,
  senderEntityId,
  receiverEntityType,
  receiverEntityName,
  receiverEntityId,
  groupId,
  studioId,
  productionTeamId,
  notificationTitle,
  notificationMessage,
  notificationImage,
  attachmentUrl,
  routePath,
  routeParams,
  extraMeta,
}: SubmitListingRequestInput) => {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new Error("Message is required.");
  }

  if (!currentUserId.trim()) {
    throw new Error("Current user is required.");
  }

  const normalizedRoutePath = routePath?.trim() || undefined;
  const normalizedRouteParams = normalizeRouteParams(routeParams);

  const body = {
    action: "create_listing_request",
    currentUserId,
    receiverUserId,
    message: normalizedMessage,
    senderEntityType,
    senderEntityName,
    senderEntityId: senderEntityId || null,
    receiverEntityType,
    receiverEntityName,
    receiverEntityId: receiverEntityId || null,
    groupId: groupId || null,
    studioId: studioId || null,
    productionTeamId: productionTeamId || null,
    notificationTitle,
    notificationMessage,
    notificationImage: notificationImage || null,
    attachmentUrl: attachmentUrl?.trim() || null,
    routePath: normalizedRoutePath,
    routeParams: normalizedRouteParams,
    extraMeta: extraMeta || null,
  };

  await ensureNoActiveDuplicateListingRequest(body);

  const { data, error } = await supabase.functions.invoke("manage-production", {
    body,
  });

  if (error) {
    const contextBody = await readFunctionsErrorBody(error as FunctionsInvokeError);
    if (isProductionTeamInvitePayload(body)) {
      console.error("create_listing_request failed for production invite", {
        message: getFunctionsErrorMessage(error as FunctionsInvokeError, contextBody),
        status: (error as any).status || (error as any).context?.status,
        code: (error as any).code || contextBody?.code,
        details: (error as any).details || contextBody?.details,
        hint: (error as any).hint || contextBody?.hint,
        context: (error as any).context,
        contextBody,
        body,
      });
      throw buildFunctionsError(error as FunctionsInvokeError, contextBody);
    }

    try {
      const fallbackRequest = await createListingRequestFallback(body);
      console.warn("create_listing_request edge function failed; used direct booking_requests fallback", {
        status: (error as any).status || (error as any).context?.status,
        message: getFunctionsErrorMessage(error as FunctionsInvokeError, contextBody),
      });
      return fallbackRequest || { id: null };
    } catch (fallbackError) {
      console.error("create_listing_request fallback failed", fallbackError);
    }

    console.error("create_listing_request failed", {
      message: getFunctionsErrorMessage(error as FunctionsInvokeError, contextBody),
      status: (error as any).status || (error as any).context?.status,
      code: (error as any).code || contextBody?.code,
      details: (error as any).details || contextBody?.details,
      hint: (error as any).hint || contextBody?.hint,
      context: (error as any).context,
      contextBody,
      body,
    });
    throw buildFunctionsError(error as FunctionsInvokeError, contextBody);
  }

  if (!data?.success) {
    throw new Error(data?.error || "Failed to send request.");
  }

  return data.request || { id: data?.request?.id || null };
};
