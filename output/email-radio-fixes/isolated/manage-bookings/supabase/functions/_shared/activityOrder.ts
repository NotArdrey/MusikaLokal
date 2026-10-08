type ActivityItem = {
  activity_at?: unknown;
  created_at?: unknown;
  paid_at?: unknown;
  refunded_at?: unknown;
  rejected_at?: unknown;
  fired_at?: unknown;
  leader_reviewed_at?: unknown;
  type_id?: unknown;
  id?: unknown;
};

const parseTimestamp = (value: unknown): number => {
  if (typeof value !== "string" || !value.trim()) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getActivityTimestamp = (item: ActivityItem): number => {
  const activityAt = parseTimestamp(item?.activity_at);
  if (activityAt) return activityAt;
  // Older responses may lack activity_at. Only use persisted action times;
  // updated_at also changes during automated reviews, and event dates are schedules.
  return Math.max(0, ...[
    item?.created_at, item?.paid_at, item?.refunded_at,
    item?.rejected_at, item?.fired_at, item?.leader_reviewed_at,
  ].map(parseTimestamp));
};

export const compareActivityItems = (a: ActivityItem, b: ActivityItem): number => {
  const difference = getActivityTimestamp(b) - getActivityTimestamp(a);
  if (difference) return difference;
  const aKey = `${a?.type_id || ""}:${a?.id || ""}`;
  const bKey = `${b?.type_id || ""}:${b?.id || ""}`;
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
};
