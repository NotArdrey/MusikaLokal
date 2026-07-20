const DAY_MS = 24 * 60 * 60 * 1000;

export interface GigReapplicationCooldownInfo {
  isActive: boolean;
  daysRemaining: number;
  cooldownEndsAt: string | null;
  message: string | null;
}

interface GigReapplicationCooldownInput {
  cooldownDays: number | null | undefined;
  rejectedAt?: string | null;
  createdAt?: string | null;
  eventDate?: string | Date | null;
  eventStartTime?: string | null;
  now?: Date;
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

const getEventStartDate = (
  eventDate: string | Date | null | undefined,
  eventStartTime: string | null | undefined
) => {
  if (!eventDate) return null;

  const parsedDate =
    eventDate instanceof Date
      ? new Date(eventDate.getTime())
      : new Date(eventDate);

  if (!Number.isFinite(parsedDate.getTime())) return null;

  if (eventStartTime) {
    const parsedTime = parseEventStartTime(eventStartTime);
    if (parsedTime) {
      parsedDate.setHours(parsedTime.hour24, parsedTime.minutes, 0, 0);
    }
  }

  return parsedDate;
};

export const getGigReapplicationCooldownInfo = ({
  cooldownDays,
  rejectedAt,
  createdAt,
  eventDate,
  eventStartTime,
  now = new Date(),
}: GigReapplicationCooldownInput): GigReapplicationCooldownInfo => {
  const rawCooldownDays = cooldownDays ?? 30;
  const numericCooldownDays = Number(rawCooldownDays);
  const normalizedCooldownDays = Number.isFinite(numericCooldownDays)
    ? Math.max(0, numericCooldownDays)
    : 30;

  if (normalizedCooldownDays <= 0) {
    return {
      isActive: false,
      daysRemaining: 0,
      cooldownEndsAt: null,
      message: null,
    };
  }

  const rejectionDate = new Date(rejectedAt || createdAt || "");
  const rejectionTime = rejectionDate.getTime();

  if (!Number.isFinite(rejectionTime)) {
    return {
      isActive: false,
      daysRemaining: 0,
      cooldownEndsAt: null,
      message: null,
    };
  }

  const cooldownEndsAt = new Date(
    rejectionTime + normalizedCooldownDays * DAY_MS
  );
  const remainingMs = cooldownEndsAt.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return {
      isActive: false,
      daysRemaining: 0,
      cooldownEndsAt: cooldownEndsAt.toISOString(),
      message: null,
    };
  }

  const daysRemaining = Math.max(1, Math.ceil(remainingMs / DAY_MS));
  const dayLabel = daysRemaining === 1 ? "day" : "days";
  const eventStartsAt = getEventStartDate(eventDate, eventStartTime);

  if (eventStartsAt && eventStartsAt.getTime() <= now.getTime()) {
    return {
      isActive: true,
      daysRemaining,
      cooldownEndsAt: cooldownEndsAt.toISOString(),
      message:
        "Your application was declined. This gig has already started, so reapplications are closed.",
    };
  }

  if (eventStartsAt && eventStartsAt.getTime() <= cooldownEndsAt.getTime()) {
    return {
      isActive: true,
      daysRemaining,
      cooldownEndsAt: cooldownEndsAt.toISOString(),
      message:
        "Your application was declined. This gig starts before your reapplication cooldown ends, so you cannot reapply.",
    };
  }

  return {
    isActive: true,
    daysRemaining,
    cooldownEndsAt: cooldownEndsAt.toISOString(),
    message: `Your application was declined. You can reapply to this gig in ${daysRemaining} more ${dayLabel}.`,
  };
};
