export type GigTimelineBucket = "active" | "upcoming" | "done";

type GigSchedule = {
  slot_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type TimelineGig = {
  event_date?: string | null;
  status?: string | null;
  application_status?: string | null;
  gig_availability_slots?: GigSchedule[] | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const manilaDate = (value?: string | null): string | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00+08:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(parsed);
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const scheduledTime = (date: string, time?: string | null): number | null => {
  if (!time || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(time)) return null;
  const timestamp = Date.parse(`${date}T${time}+08:00`);
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const getGigTimelineBucket = (
  gig: TimelineGig,
  now = new Date(),
): GigTimelineBucket => {
  if (gig.status === "cancelled" || gig.application_status === "cancelled") return "done";

  const windows: { start: number; end: number }[] = [];
  for (const slot of gig.gig_availability_slots || []) {
    const date = manilaDate(slot.slot_date);
    if (!date) continue;
    const start = scheduledTime(date, slot.start_time);
    let end = scheduledTime(date, slot.end_time);
    if (start === null || end === null || end === start) continue;
    if (end < start) end += DAY_MS;
    windows.push({ start, end });
  }

  // Older gigs have only an event date. Treat that as a Manila calendar day.
  if (windows.length === 0) {
    const date = manilaDate(gig.event_date);
    if (!date) return gig.application_status === "completed" ? "done" : "upcoming";
    const start = Date.parse(`${date}T00:00:00+08:00`);
    windows.push({ start, end: start + DAY_MS });
  }

  const timestamp = now.getTime();
  if (windows.some(({ start, end }) => timestamp >= start && timestamp < end)) return "active";
  if (windows.some(({ start }) => timestamp < start)) return "upcoming";
  return "done";
};

export const getGigTimelineLabel = (gig: TimelineGig, now = new Date()) => {
  if (gig.status === "cancelled" || gig.application_status === "cancelled") return "Cancelled";
  const bucket = getGigTimelineBucket(gig, now);
  return bucket === "active" ? "Active" : bucket === "upcoming" ? "Upcoming" : "Done";
};

export const buildGigTimeline = (applications: any[], now = new Date()) => {
  const buckets: Record<GigTimelineBucket, any[]> = { active: [], upcoming: [], done: [] };
  const seen = new Set<string>();
  for (const application of applications) {
    const gig = application?.gigs;
    if (!gig?.id || seen.has(gig.id)) continue;
    seen.add(gig.id);
    const entry = { ...gig, application_status: application.status };
    buckets[getGigTimelineBucket(entry, now)].push(entry);
  }
  for (const items of Object.values(buckets)) {
    items.sort((left, right) => {
      const leftTime = Date.parse(left.event_date || "") || 0;
      const rightTime = Date.parse(right.event_date || "") || 0;
      return rightTime - leftTime || String(left.id).localeCompare(String(right.id));
    });
  }
  return buckets;
};
