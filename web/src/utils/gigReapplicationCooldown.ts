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
  now?: Date;
}

export const getGigReapplicationCooldownInfo = ({
  cooldownDays,
  rejectedAt,
  createdAt,
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

  const cooldownEndsAt = new Date(rejectionTime + normalizedCooldownDays * DAY_MS);
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

  return {
    isActive: true,
    daysRemaining,
    cooldownEndsAt: cooldownEndsAt.toISOString(),
    message: `Your application was declined. You can reapply to this gig in ${daysRemaining} more ${dayLabel}.`,
  };
};
