export const getGroupTypeLabel = (groupType?: string): "Solo" | "Duo" | "Group" => {
  const normalizedType = String(groupType || "").trim().toLowerCase();

  if (normalizedType === "solo" || normalizedType === "soloist") {
    return "Solo";
  }

  if (normalizedType === "duo" || normalizedType === "duoist") {
    return "Duo";
  }

  return "Group";
};

export const getGroupMembersLabel = (groupType?: string): string => {
  const groupTypeLabel = getGroupTypeLabel(groupType);

  if (groupTypeLabel === "Solo") {
    return "Soloist";
  }

  if (groupTypeLabel === "Duo") {
    return "Duoists";
  }

  return "Group Members";
};

export const isGroupLeaderMember = (
  member: any,
  ownerId?: string | null,
): boolean => {
  if (!member || typeof member === "string") return false;
  const role = String(member.role || "").toLowerCase();
  if (ownerId && member.user_id === ownerId) return true;
  return role === "leader" || role === "owner";
};