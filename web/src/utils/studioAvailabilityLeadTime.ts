export type StudioAvailabilitySlot = {
  start: string;
  end: string;
};

export type StudioDateOverrideEntry = {
  selected?: boolean;
  slots?: StudioAvailabilitySlot[];
  sessionType?: unknown;
};

export type StudioDateOverrideMap = Record<
  string,
  StudioDateOverrideEntry | undefined
>;

export const STUDIO_AVAILABILITY_LEAD_TIME_HOURS = 24;

const MIN_OVERRIDE_SLOT_MINUTES = 60;
const MINUTE_MS = 60 * 1000;

const getLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDateKey = (dateStr: string): Date | null => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    0,
    0,
    0,
    0,
  );
};

const getEndOfDate = (dateStr: string): Date | null => {
  const date = parseLocalDateKey(dateStr);
  if (!date) return null;
  date.setHours(23, 59, 0, 0);
  return date;
};

const formatReadableDate = (dateStr: string): string => {
  const date = parseLocalDateKey(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatReadableDateTime = (date: Date): string =>
  date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatScheduleTime = (date: Date): string => {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${period}`;
};

const parseScheduleDateTime = (
  dateStr: string,
  timeValue: string,
): Date | null => {
  const date = parseLocalDateKey(dateStr);
  if (!date) return null;

  const normalized = String(timeValue || "").trim().toUpperCase();
  const time12Match = normalized.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/);
  const time24Match = normalized.match(/^(\d{1,2}):(\d{2})/);

  let hours: number;
  let minutes: number;

  if (time12Match) {
    hours = Number(time12Match[1]);
    minutes = Number(time12Match[2]);
    const period = time12Match[3];
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (hours === 12) hours = 0;
    if (period === "PM") hours += 12;
  } else if (time24Match) {
    hours = Number(time24Match[1]);
    minutes = Number(time24Match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  } else {
    return null;
  }

  date.setHours(hours, minutes, 0, 0);
  return date;
};

const getStudioAvailabilityLeadTimeDateTime = (): Date => {
  const leadTime = new Date(
    Date.now() + STUDIO_AVAILABILITY_LEAD_TIME_HOURS * 60 * MINUTE_MS,
  );
  if (leadTime.getSeconds() > 0 || leadTime.getMilliseconds() > 0) {
    leadTime.setMinutes(leadTime.getMinutes() + 1);
  }
  leadTime.setSeconds(0, 0);
  return leadTime;
};

export const getStudioAvailabilityMinDateKey = (): string => {
  const leadTime = getStudioAvailabilityLeadTimeDateTime();
  const leadDateKey = getLocalDateKey(leadTime);
  const leadDateEnd = getEndOfDate(leadDateKey);

  if (
    leadDateEnd &&
    leadDateEnd.getTime() - leadTime.getTime() <
      MIN_OVERRIDE_SLOT_MINUTES * MINUTE_MS
  ) {
    const nextDate = parseLocalDateKey(leadDateKey);
    nextDate?.setDate(nextDate.getDate() + 1);
    return getLocalDateKey(nextDate || leadTime);
  }

  return leadDateKey;
};

export const isStudioDateOverrideDateSelectable = (dateStr: string): boolean =>
  dateStr >= getStudioAvailabilityMinDateKey();

export const getDefaultStudioDateOverrideSlot = (
  dateStr: string,
  fallback: StudioAvailabilitySlot = { start: "09:00 AM", end: "05:00 PM" },
): StudioAvailabilitySlot => {
  const leadTime = getStudioAvailabilityLeadTimeDateTime();
  const fallbackStart = parseScheduleDateTime(dateStr, fallback.start);

  if (!fallbackStart || fallbackStart >= leadTime) {
    return fallback;
  }

  if (getLocalDateKey(leadTime) !== dateStr) {
    return fallback;
  }

  const dayEnd = getEndOfDate(dateStr);
  if (!dayEnd) return fallback;

  let start = new Date(leadTime);
  let end =
    parseScheduleDateTime(dateStr, fallback.end) ||
    new Date(start.getTime() + MIN_OVERRIDE_SLOT_MINUTES * MINUTE_MS);

  if (end <= start) {
    end = new Date(start.getTime() + MIN_OVERRIDE_SLOT_MINUTES * MINUTE_MS);
  }

  if (end > dayEnd) {
    end = dayEnd;
  }

  if (end <= start) {
    start = new Date(dayEnd.getTime() - MIN_OVERRIDE_SLOT_MINUTES * MINUTE_MS);
    end = dayEnd;
  }

  return {
    start: formatScheduleTime(start),
    end: formatScheduleTime(end),
  };
};

const normalizeOverrideEntryForComparison = (
  entry?: StudioDateOverrideEntry,
) =>
  JSON.stringify({
    selected: Boolean(entry?.selected),
    sessionType: String(entry?.sessionType || ""),
    slots: (Array.isArray(entry?.slots) ? entry?.slots : []).map((slot) => ({
      start: String(slot?.start || ""),
      end: String(slot?.end || ""),
    })),
  });

const isUnchangedOverrideEntry = (
  current?: StudioDateOverrideEntry,
  original?: StudioDateOverrideEntry,
): boolean =>
  Boolean(original) &&
  normalizeOverrideEntryForComparison(current) ===
    normalizeOverrideEntryForComparison(original);

export const getStudioDateOverrideLeadTimeError = (
  selectedDates: StudioDateOverrideMap,
  originalDates?: StudioDateOverrideMap,
): string | null => {
  const leadTime = getStudioAvailabilityLeadTimeDateTime();
  const minDateKey = getStudioAvailabilityMinDateKey();

  for (const dateStr of Object.keys(selectedDates).sort()) {
    const entry = selectedDates[dateStr];
    if (!entry?.selected) continue;
    if (isUnchangedOverrideEntry(entry, originalDates?.[dateStr])) continue;

    if (dateStr < minDateKey) {
      return `Date overrides must be at least ${STUDIO_AVAILABILITY_LEAD_TIME_HOURS} hours in advance. ${formatReadableDate(dateStr)} is too soon.`;
    }

    const slots = Array.isArray(entry.slots) ? entry.slots : [];
    for (const slot of slots) {
      const slotStart = parseScheduleDateTime(dateStr, slot.start);
      if (!slotStart) continue;

      if (slotStart < leadTime) {
        return `Date override times must be at least ${STUDIO_AVAILABILITY_LEAD_TIME_HOURS} hours in advance. ${formatReadableDate(dateStr)} at ${slot.start} is too soon. Earliest allowed start is ${formatReadableDateTime(leadTime)}.`;
      }
    }
  }

  return null;
};
