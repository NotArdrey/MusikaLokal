type FriendlyDateInput = string | number | Date | null | undefined;

type FriendlyDateTimeOptions = {
  fallback?: string;
  includeRelative?: boolean;
  forceDateOnly?: boolean;
  forceIncludeTime?: boolean;
};

const DEFAULT_FALLBACK = "N/A";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (value: FriendlyDateInput): Date | null => {
  if (value === null || value === undefined) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
};

const inputHasTimeComponent = (value: FriendlyDateInput) => {
  if (value instanceof Date || typeof value === "number") {
    return true;
  }

  if (typeof value !== "string") return false;

  const normalized = value.trim();
  if (!normalized || DATE_ONLY_PATTERN.test(normalized)) {
    return false;
  }

  return (
    normalized.includes("T") ||
    /\d{1,2}:\d{2}/.test(normalized) ||
    /\b(am|pm)\b/i.test(normalized)
  );
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatClock = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const formatAbsoluteDate = (date: Date, includeYear: boolean) =>
  date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });

const formatRelativeDateLabel = (date: Date, now: Date) => {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayDiff = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / dayMs,
  );

  if (dayDiff === 0) return "Today";
  if (dayDiff === -1) return "Yesterday";
  if (dayDiff === 1) return "Tomorrow";

  if (dayDiff > -7 && dayDiff < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }

  return null;
};

export const formatFriendlyDateTime = (
  value: FriendlyDateInput,
  options: FriendlyDateTimeOptions = {},
) => {
  const date = toDate(value);
  if (!date) return options.fallback ?? DEFAULT_FALLBACK;

  const now = new Date();
  const includeTime = options.forceDateOnly
    ? false
    : options.forceIncludeTime || inputHasTimeComponent(value);

  if (options.includeRelative) {
    const relativeLabel = formatRelativeDateLabel(date, now);
    if (relativeLabel) {
      return includeTime ? `${relativeLabel} at ${formatClock(date)}` : relativeLabel;
    }
  }

  const includeYear = date.getFullYear() !== now.getFullYear();
  const absoluteDate = formatAbsoluteDate(date, includeYear);

  return includeTime ? `${absoluteDate} at ${formatClock(date)}` : absoluteDate;
};

export const formatFriendlyDate = (
  value: FriendlyDateInput,
  options: Omit<FriendlyDateTimeOptions, "forceDateOnly" | "forceIncludeTime"> = {},
) => {
  return formatFriendlyDateTime(value, {
    ...options,
    forceDateOnly: true,
  });
};

export const formatDashedNumericDate = (
  value: FriendlyDateInput,
  fallback = DEFAULT_FALLBACK,
) => {
  const date =
    typeof value === "string" && DATE_ONLY_PATTERN.test(value.trim())
      ? new Date(`${value.trim()}T00:00:00`)
      : toDate(value);

  if (!date || Number.isNaN(date.getTime())) return fallback;

  return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
};
