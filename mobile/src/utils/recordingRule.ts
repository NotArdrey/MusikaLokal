export interface RecordingRule {
  songsPerBlock: number;
  hoursPerBlock: number;
}

export const DEFAULT_RECORDING_RULE: RecordingRule = {
  songsPerBlock: 1,
  hoursPerBlock: 3,
};

const toPositiveInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const toPositiveDecimal = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const formatRecordingHours = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
};

export const resolveRecordingRule = (
  source: any,
  fallback: RecordingRule = DEFAULT_RECORDING_RULE,
): RecordingRule => {
  const songsPerBlock =
    toPositiveInteger(source?.recording_songs_per_block) ??
    fallback.songsPerBlock;
  const hoursPerBlock =
    toPositiveDecimal(source?.recording_hours_per_block) ??
    toPositiveDecimal(source?.min_booking_duration_hours) ??
    fallback.hoursPerBlock;

  return {
    songsPerBlock,
    hoursPerBlock,
  };
};

export const getRecordingRequiredBlocks = (
  songCount: unknown,
  rule: RecordingRule,
): number => {
  const normalizedSongCount = toPositiveInteger(songCount);
  if (!normalizedSongCount) return 0;

  return Math.ceil(normalizedSongCount / Math.max(1, rule.songsPerBlock));
};

export const getRecordingRequiredHours = (
  songCount: unknown,
  rule: RecordingRule,
): number => {
  const requiredBlocks = getRecordingRequiredBlocks(songCount, rule);
  if (!requiredBlocks) return 0;

  return requiredBlocks * Math.max(rule.hoursPerBlock, 0);
};

