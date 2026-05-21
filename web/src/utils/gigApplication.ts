export interface GigApplicationDeadlineInfo {
  deadline: Date;
  isPassed: boolean;
  isUrgent: boolean;
  hoursLeft: number;
}

interface GigApplicationTarget {
  type?: string;
  event_date?: string | Date | null;
  requirements?: {
    event_start_time?: string | null;
  } | null;
}

const parseEventStartTime = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

  let hour24 = hours;
  if (period === "PM" && hours !== 12) hour24 += 12;
  if (period === "AM" && hours === 12) hour24 = 0;

  return { hour24, minutes };
};

export const getGigApplicationDeadlineInfo = (
  gig: GigApplicationTarget | null | undefined,
): GigApplicationDeadlineInfo | null => {
  if (!gig || gig.type !== "Gig" || !gig.event_date) return null;

  const eventDate = new Date(gig.event_date);
  if (Number.isNaN(eventDate.getTime())) return null;

  const eventStartTime = gig.requirements?.event_start_time;
  if (eventStartTime) {
    const parsed = parseEventStartTime(eventStartTime);
    if (parsed) {
      eventDate.setHours(parsed.hour24, parsed.minutes, 0, 0);
    }
  }

  const deadline = new Date(eventDate.getTime());
  const now = new Date();
  const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  return {
    deadline,
    isPassed: hoursUntilDeadline <= 0,
    isUrgent: hoursUntilDeadline > 0 && hoursUntilDeadline < 48,
    hoursLeft: Math.max(0, Math.floor(hoursUntilDeadline)),
  };
};

export const isGigApplicationClosed = (
  gig: GigApplicationTarget | null | undefined,
) => Boolean(getGigApplicationDeadlineInfo(gig)?.isPassed);
