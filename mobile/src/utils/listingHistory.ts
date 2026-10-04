export type ListingManagementStatus = 'active' | 'inactive' | 'done';
export type ManagedListingType = 'group' | 'studio' | 'gig' | 'production';

type GigHistoryRecord = {
  management_status?: ListingManagementStatus;
  status?: string | null;
  event_date?: string | null;
  requirements?: Record<string, unknown>;
};

const clockMinutes = (value: unknown): number | null => {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const period = match[3]?.toUpperCase();
  if (minutes > 59 || hours > (period ? 12 : 23) || (period && hours < 1)) return null;
  if (period) hours = hours % 12 + (period === 'PM' ? 12 : 0);
  return hours * 60 + minutes;
};

export const getGigHistoryEndAt = (gig: GigHistoryRecord): number | null => {
  const requirements = gig.requirements || {};
  const schedules = Array.isArray(requirements.event_schedules) && requirements.event_schedules.length
    ? requirements.event_schedules
    : [{ date: gig.event_date, start_time: requirements.event_start_time, end_time: requirements.event_end_time }];
  const ends = schedules.map((schedule) => {
    if (!schedule || typeof schedule !== 'object') return NaN;
    const dateValue = String(schedule.date || '');
    const parsed = new Date(dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00+08:00`);
    if (Number.isNaN(parsed.getTime())) return NaN;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(parsed);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    const dayStart = Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00+08:00`);
    const start = clockMinutes(schedule.start_time);
    const end = clockMinutes(schedule.end_time);
    if ((schedule.end_time && end === null) || (schedule.start_time && start === null)) return NaN;
    return end === null ? dayStart + 86_400_000 - 1
      : dayStart + end * 60_000 + (start !== null && end < start ? 86_400_000 : 0);
  });
  return ends.some((end) => !Number.isFinite(end)) ? null : Math.max(...ends);
};

export const isGigInHistory = (gig: GigHistoryRecord, now = Date.now()): boolean => {
  if (gig.management_status === 'done' || ['cancelled', 'canceled', 'completed', 'done'].includes(String(gig.status || '').toLowerCase())) return true;
  const end = getGigHistoryEndAt(gig);
  return end !== null && end < now;
};

export const canMarkGigDone = (gig: GigHistoryRecord, now = Date.now()): boolean => {
  const end = getGigHistoryEndAt(gig);
  return gig.management_status !== 'done' && !['cancelled', 'canceled'].includes(String(gig.status || '').toLowerCase()) && end !== null && end <= now;
};
