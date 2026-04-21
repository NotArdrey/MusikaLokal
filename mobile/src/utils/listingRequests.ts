import { supabase } from "../../lib/supabase";

type EntityType = "musician" | "group" | "venue" | "production_team";

type RouteParams = Record<string, string | number | null | undefined>;

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

  const normalizedRoutePath = routePath?.trim() || undefined;
  const normalizedRouteParams = normalizeRouteParams(routeParams);

  const eventDetails = {
    type: "listing_connection_request",
    sender_entity_type: senderEntityType,
    sender_entity_id: senderEntityId || null,
    sender_entity_name: senderEntityName,
    receiver_entity_type: receiverEntityType,
    receiver_entity_id: receiverEntityId || null,
    receiver_entity_name: receiverEntityName,
    production_team_id: productionTeamId || null,
    route: normalizedRoutePath,
    route_params: normalizedRouteParams,
    ...(extraMeta || {}),
  };

  const { data: requestRow, error: requestError } = await supabase
    .from("booking_requests")
    .insert({
      sender_id: currentUserId,
      receiver_id: receiverUserId,
      group_id: groupId || null,
      studio_id: studioId || null,
      message: normalizedMessage,
      status: "pending",
      attachment_url: attachmentUrl?.trim() || null,
      event_details: eventDetails,
    })
    .select("id")
    .single();

  if (requestError) {
    throw requestError;
  }

  const notificationMeta = {
    type: "listing_connection_request",
    request_id: requestRow?.id || null,
    sender_entity_type: senderEntityType,
    sender_entity_id: senderEntityId || null,
    sender_entity_name: senderEntityName,
    receiver_entity_type: receiverEntityType,
    receiver_entity_id: receiverEntityId || null,
    receiver_entity_name: receiverEntityName,
    group_id: groupId || null,
    studio_id: studioId || null,
    production_team_id: productionTeamId || null,
    route: normalizedRoutePath,
    route_params: normalizedRouteParams,
    ...(extraMeta || {}),
  };

  const { error: notificationError } = await supabase.from("notifications").insert({
    user_id: receiverUserId,
    type: "info",
    title: notificationTitle,
    message: notificationMessage,
    image: notificationImage || null,
    meta: notificationMeta,
  });

  if (notificationError) {
    console.warn("Failed to create listing request notification:", notificationError);
  }

  return requestRow;
};