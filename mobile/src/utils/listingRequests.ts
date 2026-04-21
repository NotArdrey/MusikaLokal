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

  const { data, error } = await supabase.functions.invoke("manage-deals", {
    body,
  });

  if (error) {
    console.error("create_listing_request failed", {
      message: error.message,
      status: (error as any).status,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
      context: (error as any).context,
      body,
    });
    throw error;
  }

  if (!data?.success) {
    throw new Error(data?.error || "Failed to send request.");
  }

  return data.request || { id: data?.request?.id || null };
};