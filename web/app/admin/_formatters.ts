export type FriendlyDetailEntry = {
  key: string;
  label: string;
  value: string;
};

const imageKeyPriority = [
  'avatar_url',
  'profile_image_url',
  'profile_photo_url',
  'photo_url',
  'image_url',
  'thumbnail_url',
  'cover_url',
  'cover_image_url',
  'banner_url',
  'media_url',
  'album_art_url',
  'poster_url',
];

const hiddenDetailKeys = new Set([
  'auth',
  'app_metadata',
  'aud',
  'bucket_id',
  'didit_session_id',
  'embedding',
  'email_change_token_current',
  'email_change_token_new',
  'encrypted_password',
  'external_id',
  'id',
  'instance_id',
  'interest_vector',
  'interestvector',
  'last_sign_in_ip',
  'metadata',
  'password_hash',
  'provider_id',
  'raw_app_meta_data',
  'raw_user_meta_data',
  'refresh_token',
  'source_table',
  'storage_bucket',
  'storage_path',
  'target_id',
  'token',
  'user_metadata',
]);

const labelOverrides: Record<string, string> = {
  address: 'Address',
  admin_notes: 'Admin notes',
  avatar_url: 'Profile photo',
  bio: 'Bio',
  business_permit_url: 'Business permit',
  category: 'Category',
  contact_number: 'Phone',
  created_at: 'Created',
  description: 'Description',
  details: 'Details',
  display_name: 'Display name',
  email: 'Email',
  escalated_at: 'Escalated on',
  escalation_reason: 'Escalation reason',
  escalation_status: 'Escalation',
  full_name: 'Name',
  id_verified_at: 'ID verified on',
  is_verified: 'Verified',
  moderation_action: 'Action taken',
  moderation_notes: 'Moderator notes',
  name: 'Name',
  permit_rejection_reason: 'Permit notes',
  permit_reviewed_at: 'Permit reviewed on',
  permit_status: 'Permit status',
  phone_number: 'Phone',
  price: 'Price',
  product_type: 'Product type',
  reason: 'Reason',
  reporter_email: 'Reporter email',
  reporter_name: 'Reporter',
  reviewer_name: 'Reviewer',
  reviewed_at: 'Reviewed on',
  role: 'Account type',
  status: 'Status',
  target_name: 'Reported item',
  target_type: 'Reported item type',
  title: 'Title',
  updated_at: 'Last updated',
  verification_status: 'Verification status',
};

const valueOverrides: Record<string, string> = {
  abandoned: 'Abandoned',
  active: 'Active',
  approved: 'Approved',
  cancelled: 'Cancelled',
  declined: 'Declined',
  dismissed: 'Dismissed',
  draft: 'Draft',
  expired: 'Expired',
  fan: 'Fan',
  gig: 'Gig',
  group: 'Group',
  manual_review: 'Manual review',
  musician: 'Musician',
  musician_member: 'Musician',
  none: 'None',
  pending: 'Pending',
  pending_review: 'Pending review',
  playlist: 'Music playlist',
  product: 'Marketplace item',
  producer: 'Producer',
  profile: 'User profile',
  rejected: 'Rejected',
  resolved: 'Resolved',
  resolved_no_refund: 'Resolved without refund',
  resolved_refund: 'Resolved with refund',
  resubmitted: 'Resubmitted',
  studio: 'Studio',
  studio_owner: 'Studio owner',
  suspended: 'Suspended',
  user: 'User profile',
  venue: 'Studio',
  venue_owner: 'Venue owner',
  warn_both: 'Warn both people',
  warn_reporter: 'Warn reporter',
  warn_target_owner: 'Warn reported account',
};

const preferredKeyOrder = [
  'full_name',
  'name',
  'display_name',
  'title',
  'email',
  'contact_number',
  'phone_number',
  'role',
  'verification_status',
  'is_verified',
  'id_verified_at',
  'status',
  'permit_status',
  'reason',
  'details',
  'moderation_action',
  'moderation_notes',
  'escalation_status',
  'escalation_reason',
  'target_type',
  'target_name',
  'reporter_name',
  'reporter_email',
  'reviewer_name',
  'reviewed_at',
  'description',
  'bio',
  'address',
  'category',
  'product_type',
  'price',
  'business_permit_url',
  'avatar_url',
  'created_at',
  'updated_at',
];

const preferredOrderMap = new Map(preferredKeyOrder.map((key, index) => [key, index]));

const normalizeKey = (rawKey: string) => rawKey.trim().toLowerCase();

const normalizeLookupValue = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

const toTitleCase = (value: string) => {
  const normalized = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  return normalized
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (part.toUpperCase() === part && part.length <= 3) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
};

const isIsoDateString = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);

const isUuidLike = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const looksLikeUrl = (value: string) => /^(https?:\/\/|file:\/\/|data:image\/)/i.test(value.trim());

const looksLikeImageUrl = (value: string) => {
  const text = value.trim();
  if (!looksLikeUrl(text)) return false;
  if (/^data:image\//i.test(text)) return true;
  if (/\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(text)) return true;
  return false;
};

const isUrlKey = (key: string) => {
  const normalizedKey = normalizeKey(key);
  return normalizedKey.endsWith('_url') || normalizedKey.endsWith('_urls') || normalizedKey.includes('media_url');
};

const isCurrencyKey = (key: string) => /(amount|balance|cost|earnings|fee|gross|net|payout|price|rate|refund|revenue|total)/i.test(key);

const shouldHumanizeString = (key: string) => {
  const normalizedKey = normalizeKey(key);
  return /(action|category|kind|mode|plan|role|status|tier|type)$/.test(normalizedKey) ||
    normalizedKey.includes('status') ||
    normalizedKey.includes('action') ||
    normalizedKey.includes('type');
};

const hasDisplayableValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasDisplayableValue);
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

export const shouldShowDetailField = (rawKey: string, value: unknown) => {
  const key = normalizeKey(rawKey);
  if (!key || !hasDisplayableValue(value)) return false;
  if (hiddenDetailKeys.has(key)) return false;
  if (key === 'id' || key.endsWith('_id')) return false;
  if (key.includes('password') || key.includes('secret') || key.includes('token')) return false;
  if (key.includes('embedding') || key.includes('vector')) return false;
  if (key.includes('metadata') || key.startsWith('raw_') || key.endsWith('_raw')) return false;
  if (key.includes('storage') || key.endsWith('_bucket') || key.endsWith('_path')) return false;

  return true;
};

export const formatDetailLabel = (rawKey: string) => {
  const key = normalizeKey(rawKey);
  if (labelOverrides[key]) return labelOverrides[key];

  if (key.endsWith('_url') || key.endsWith('_urls')) {
    return toTitleCase(key.replace(/_urls?$/, '')) || 'Attachment';
  }

  const withSpaces = key.replace(/_/g, ' ').trim();
  return toTitleCase(withSpaces) || 'Field';
};

const formatDateTimeValue = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatNumberValue = (value: number, rawKey: string) => {
  if (isCurrencyKey(rawKey)) {
    return `PHP ${value.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return value.toLocaleString('en-PH');
};

const summarizeObject = (value: Record<string, unknown>) => {
  const entries = Object.entries(value)
    .filter(([key, entryValue]) => shouldShowDetailField(key, entryValue))
    .sort(([a], [b]) => sortDetailKeys(a, b))
    .slice(0, 4);

  if (entries.length === 0) return 'Details available';

  return entries
    .map(([key, entryValue]) => `${formatDetailLabel(key)}: ${formatDetailValue(entryValue, key)}`)
    .join(' | ');
};

export const formatDetailValue = (value: unknown, rawKey = ''): string => {
  if (value === null || value === undefined) return '-';

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return formatNumberValue(value, rawKey);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '-';

    if (isIsoDateString(text)) {
      return formatDateTimeValue(text);
    }

    if (looksLikeUrl(text)) {
      return 'Available';
    }

    if (isUuidLike(text)) {
      return 'Reference saved';
    }

    const normalizedValue = normalizeLookupValue(text);
    if (valueOverrides[normalizedValue]) {
      return valueOverrides[normalizedValue];
    }

    if (shouldHumanizeString(rawKey)) {
      return toTitleCase(text) || text;
    }

    return text;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';

    const urlCount = value.filter((item) => typeof item === 'string' && looksLikeUrl(item)).length;
    if (isUrlKey(rawKey) || urlCount === value.length) {
      return `${value.length} ${value.length === 1 ? 'file' : 'files'} attached`;
    }

    const summaries = value
      .filter(hasDisplayableValue)
      .slice(0, 3)
      .map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return summarizeObject(item as Record<string, unknown>);
        }

        return formatDetailValue(item, rawKey);
      })
      .filter((item) => item && item !== '-');

    if (summaries.length === 0) return 'None';

    const suffix = value.length > summaries.length ? ` and ${value.length - summaries.length} more` : '';
    return `${summaries.join(', ')}${suffix}`;
  }

  if (typeof value === 'object') {
    return summarizeObject(value as Record<string, unknown>);
  }

  const text = String(value).trim();
  return text || '-';
};

const sortDetailKeys = (a: string, b: string) => {
  const first = preferredOrderMap.get(normalizeKey(a)) ?? 1000;
  const second = preferredOrderMap.get(normalizeKey(b)) ?? 1000;

  if (first !== second) return first - second;
  return formatDetailLabel(a).localeCompare(formatDetailLabel(b));
};

export const getFriendlyDetailEntries = (details: Record<string, unknown> | null | undefined): FriendlyDetailEntry[] => {
  return Object.entries(details || {})
    .filter(([key, value]) => shouldShowDetailField(key, value))
    .sort(([a], [b]) => sortDetailKeys(a, b))
    .map(([key, value]) => ({
      key,
      label: formatDetailLabel(key),
      value: formatDetailValue(value, key),
    }))
    .filter((entry) => entry.value !== '-');
};

export const getFriendlyDetailImage = (details: Record<string, unknown> | null | undefined): string | null => {
  if (!details) return null;

  for (const key of imageKeyPriority) {
    const value = details[key];
    if (typeof value === 'string' && looksLikeUrl(value)) {
      return value.trim();
    }
  }

  for (const [key, value] of Object.entries(details)) {
    if (!/(avatar|banner|cover|image|media|photo|poster|thumbnail)/i.test(key)) continue;

    if (typeof value === 'string' && looksLikeUrl(value)) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const image = value.find((item) => typeof item === 'string' && looksLikeImageUrl(item));
      if (typeof image === 'string') return image.trim();
    }
  }

  return null;
};
