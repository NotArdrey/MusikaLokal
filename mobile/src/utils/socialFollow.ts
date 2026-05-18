export type SocialFollowTargetType = "profile" | "group";

export type SocialFollowTarget = {
  id: string;
  type: SocialFollowTargetType;
};

export const normalizeSocialFollowTargetType = (
  value: unknown,
): SocialFollowTargetType => (value === "group" ? "group" : "profile");

export const buildSocialFollowKey = (
  type: unknown,
  id: unknown,
): string => {
  if (typeof id !== "string" || id.trim().length === 0) {
    return "";
  }

  return `${normalizeSocialFollowTargetType(type)}:${id.trim()}`;
};

export const getListingSocialFollowTarget = (
  item: any,
  currentUserId?: string | null,
): SocialFollowTarget | null => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const explicitTargetId =
    typeof item?.social_follow_target_id === "string"
      ? item.social_follow_target_id.trim()
      : "";
  const explicitTargetType = normalizeSocialFollowTargetType(
    item?.social_follow_target_type,
  );

  if (explicitTargetId.length > 0) {
    const explicitOwnerId =
      typeof item?.owner_id === "string" ? item.owner_id.trim() : "";

    if (
      explicitTargetType === "profile" &&
      typeof currentUserId === "string" &&
      explicitTargetId === currentUserId
    ) {
      return null;
    }

    if (
      explicitTargetType === "group" &&
      typeof currentUserId === "string" &&
      explicitOwnerId.length > 0 &&
      explicitOwnerId === currentUserId
    ) {
      return null;
    }

    return {
      id: explicitTargetId,
      type: explicitTargetType,
    };
  }

  const normalizedType =
    typeof item?.type === "string" ? item.type.trim().toLowerCase() : "";
  const hasGroupType =
    typeof item?.group_type === "string" && item.group_type.trim().length > 0;

  if (normalizedType === "group" || normalizedType === "duo" || hasGroupType) {
    const groupId = typeof item?.id === "string" ? item.id.trim() : "";
    const ownerId = typeof item?.owner_id === "string" ? item.owner_id.trim() : "";
    if (
      typeof currentUserId === "string" &&
      ownerId.length > 0 &&
      ownerId === currentUserId
    ) {
      return null;
    }

    return groupId.length > 0
      ? {
          id: groupId,
          type: "group",
        }
      : null;
  }

  if (normalizedType === "artist" || normalizedType === "musician") {
    const profileId = typeof item?.id === "string" ? item.id.trim() : "";
    if (!profileId || profileId === currentUserId) {
      return null;
    }

    return {
      id: profileId,
      type: "profile",
    };
  }

  const ownerOrOrganizerId =
    typeof item?.owner_id === "string" && item.owner_id.trim().length > 0
      ? item.owner_id.trim()
      : typeof item?.organizer_id === "string" &&
          item.organizer_id.trim().length > 0
        ? item.organizer_id.trim()
        : "";

  if (!ownerOrOrganizerId || ownerOrOrganizerId === currentUserId) {
    return null;
  }

  return {
    id: ownerOrOrganizerId,
    type: "profile",
  };
};