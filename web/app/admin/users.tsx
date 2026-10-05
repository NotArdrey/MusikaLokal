import useAdminLayout from '../../src/hooks/useAdminLayout';

import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import { AdminFilterBar } from '../../src/components/admin/filters';
import Header from '../../src/components/admin/AdminPageHeader';
import LoadingState from '../../src/components/LoadingState';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getAdminPageCacheKey, invalidateAdminPageCache, readAdminPageCache, writeAdminPageCache } from '../../src/admin/cache';
import { getFriendlyDetailEntries, getFriendlyDetailImage } from '../../src/admin/formatters';
import { STAFF_ENTITY_LABELS, StaffAccessLevel, StaffAssignment, StaffEntityType, normalizeStaffAccessLevel, normalizeStaffEntityType } from '../../src/utils/staffAccess';

const readErrorContextMessage = async (context: unknown): Promise<string | null> => {
  if (!context) return null;

  const contextAny = context as {
    clone?: () => any;
    json?: () => Promise<any>;
    text?: () => Promise<string>;
    status?: number;
    error?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const tryExtract = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === 'string' && value.trim()) return value.trim();

    if (typeof value === 'object') {
      const code = String(value.code || '').trim().toUpperCase();
      if (code.startsWith('STAFF_')) {
        const message = typeof value.message === 'string' ? value.message.trim() : '';
        const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
        const resolution = typeof value.resolution === 'string' ? value.resolution.trim() : '';
        const parts = [
          message,
          reason ? `Reason: ${reason}` : '',
          resolution ? `Next step: ${resolution}` : '',
        ].filter(Boolean);
        if (parts.length > 0) return parts.join('\n\n');
      }

      const maybe = [value.error, value.message, value.details, value.hint].find(
        (item) => typeof item === 'string' && item.trim().length > 0,
      );
      if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
    }

    return null;
  };

  const directMessage = tryExtract(contextAny);
  if (directMessage) return directMessage;

  try {
    if (typeof contextAny.clone === 'function') {
      const parsed = await contextAny.clone().json();
      const parsedMessage = tryExtract(parsed);
      if (parsedMessage) return parsedMessage;
    } else if (typeof contextAny.json === 'function') {
      const parsed = await contextAny.json();
      const parsedMessage = tryExtract(parsed);
      if (parsedMessage) return parsedMessage;
    }
  } catch {
    // Ignore JSON parsing failures and fallback to text parsing below.
  }

  try {
    let rawText = '';

    if (typeof contextAny.clone === 'function') {
      rawText = await contextAny.clone().text();
    } else if (typeof contextAny.text === 'function') {
      rawText = await contextAny.text();
    }

    if (!rawText) return null;

    try {
      const parsed = JSON.parse(rawText);
      const parsedMessage = tryExtract(parsed);
      if (parsedMessage) return parsedMessage;
    } catch {
      // Plain text fallback
    }

    return rawText.trim() || null;
  } catch {
    return null;
  }
};

type UserRole = 'fan' | 'musician' | 'studio-owner' | 'venue-owner' | 'producer' | 'admin' | 'staff';

type UserFilter = 'all' | 'fan' | 'musicians' | 'studio-owner' | 'venue-owner' | 'producer' | 'staff';

const USERS_CACHE_TTL_MS = 45_000;

interface UserEntry {
  id: string;
  full_name: string;
  email: string;
  role: string;
  contact_number?: string | null;
  address?: string | null;
  location?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  genres?: string[] | null;
  is_verified: boolean;
  verification_status?: string | null;
  created_at: string;
  is_banned?: boolean | null;
  banned_until?: string | null;
  ban_reason?: string | null;
  ban_action?: string | null;
  banned_at?: string | null;
  banned_by?: string | null;
  ban_lifted_at?: string | null;
  ban_lifted_by?: string | null;
  staff_assignment?: StaffAssignment | null;
  staff_assignments?: StaffAssignment[];
  staff_assignment_label?: string | null;
}

interface UserDetailsEntry {
  profile: Record<string, unknown> | null;
}

interface UserDetailsRequestTarget {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

type AdminAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type StaffTargetOption = {
  id: string;
  name: string;
  meta?: string | null;
};

type StaffTargetConflict = {
  id: string;
  name: string;
  entityType: StaffEntityType;
  reason: string;
  resolution: string;
  canAutoResolve: boolean;
};

type OwnedRoleListing = {
  id: string;
  name: string;
  entityType: StaffEntityType;
};

type OwnershipCandidate = {
  id: string;
  fullName: string;
  email?: string | null;
};

type StaffFormAssignments = Record<StaffEntityType, Record<string, StaffAccessLevel>>;
type StaffFormListingPermissions = Record<StaffEntityType, {
  edit: boolean;
  add: boolean;
  delete: boolean;
}>;

const createEmptyStaffFormAssignments = (): StaffFormAssignments => ({
  studio: {},
  venue: {},
  production: {},
});

const createDefaultStaffFormListingPermissions = (): StaffFormListingPermissions => ({
  studio: { edit: true, add: true, delete: true },
  venue: { edit: true, add: true, delete: true },
  production: { edit: true, add: true, delete: true },
});

const userRoleOptions: UserRole[] = ['fan', 'musician', 'studio-owner', 'venue-owner', 'producer', 'admin', 'staff'];
const staffEntityOptions: StaffEntityType[] = ['studio', 'venue', 'production'];
const staffPermissionOptions = [
  {
    key: 'view',
    title: 'View details',
    description: 'Open the assigned Manage page and read its information.',
  },
  {
    key: 'manage',
    title: 'Manage bookings and applications',
    description: 'Accept, decline, and update booking or applicant activity.',
  },
  {
    key: 'edit',
    title: 'Edit listing',
    description: 'Change the assigned studio, gig, or production listing.',
  },
  {
    key: 'add',
    title: 'Add listing',
    description: 'Create a new studio, gig, or production listing for the assigned owner.',
  },
  {
    key: 'delete',
    title: 'Delete listing',
    description: 'Permanently delete an assigned studio, gig, or production listing.',
  },
] as const;
const ownershipRoleConfig: Partial<Record<UserRole, { entityType: StaffEntityType; singular: string; plural: string }>> = {
  'studio-owner': { entityType: 'studio', singular: 'studio', plural: 'studios' },
  'venue-owner': { entityType: 'venue', singular: 'gig', plural: 'gigs' },
  producer: { entityType: 'production', singular: 'production team', plural: 'production teams' },
};
const normalizeDelimitedList = (value: string) => {
  const seen = new Set<string>();
  const items: string[] = [];

  value.split(/[,;\n]/).forEach((item) => {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    items.push(trimmed);
  });

  return items;
};

const formatListForInput = (value: unknown) => (
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).join(', ')
    : typeof value === 'string'
      ? value
      : ''
);

const formatRoleLabel = (role: UserRole | string) => String(role || '')
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const userFilters: { value: UserFilter; label: string }[] = [
  { value: 'all', label: 'All users' },
  { value: 'fan', label: 'Fans' },
  { value: 'musicians', label: 'Musicians' },
  { value: 'studio-owner', label: 'Studio owners' },
  { value: 'venue-owner', label: 'Gig owners' },
  { value: 'producer', label: 'Producers' },
  { value: 'staff', label: 'Staff' },
];

const getDetailsSectionIcon = (title: string) => {
  const normalized = title.toLowerCase();
  if (normalized.includes('account') || normalized.includes('profile')) return 'person-circle-outline';
  if (normalized.includes('report')) return 'flag-outline';
  if (normalized.includes('review')) return 'shield-checkmark-outline';
  if (normalized.includes('content') || normalized.includes('item')) return 'document-text-outline';
  return 'information-circle-outline';
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getActiveUserBan = (user?: Pick<UserEntry, 'is_banned' | 'banned_until' | 'ban_reason' | 'ban_action'> | null) => {
  const isBanned = user?.is_banned === true || String(user?.is_banned || '').toLowerCase() === 'true';
  if (!isBanned) return null;

  const bannedUntil = typeof user?.banned_until === 'string' ? user.banned_until : null;
  if (!bannedUntil) {
    return {
      permanent: true,
      bannedUntil: null,
      reason: user?.ban_reason || user?.ban_action || null,
    };
  }

  const expiry = new Date(bannedUntil);
  if (Number.isNaN(expiry.getTime())) {
    return {
      permanent: true,
      bannedUntil: null,
      reason: user?.ban_reason || user?.ban_action || null,
    };
  }

  if (expiry <= new Date()) return null;

  return {
    permanent: false,
    bannedUntil,
    reason: user?.ban_reason || user?.ban_action || null,
  };
};

const formatBanTimeRemaining = (bannedUntil?: string | null, permanent?: boolean) => {
  if (permanent || !bannedUntil) return 'permanent';

  const expiry = new Date(bannedUntil);
  if (Number.isNaN(expiry.getTime())) return 'permanent';

  const remainingHours = Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / (60 * 60 * 1000)));
  if (remainingHours >= 48) {
    const days = Math.ceil(remainingHours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (remainingHours >= 24) return '1 day';
  return `${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
};

const getErrorMessage = async (error: unknown, fallback: string) => {
  if (!error) return fallback;

  if (typeof error === 'string') return error;

  const err = error as {
    message?: string;
    details?: string;
    hint?: string;
    status?: number;
    context?: unknown;
  };

  const contextMessage = await readErrorContextMessage(err.context);
  const baseMessage = contextMessage || err.details || err.hint || err.message || fallback;

  if (!baseMessage) return fallback;

  return baseMessage;
};

const getUserSaveFeedback = (message: string): { type: AlertType; title: string; message: string } => {
  const normalized = String(message || '').trim();
  const lower = normalized.toLowerCase();

  if (
    (lower.includes('reason:') && lower.includes('next step:')) ||
    lower.includes('cannot assign staff access') ||
    lower.includes('cannot manage it as staff')
  ) {
    return {
      type: 'warning',
      title: 'Staff assignment conflict',
      message: normalized,
    };
  }

  if (lower.includes('marketplace access requires')) {
    return {
      type: 'warning',
      title: 'Marketplace assignment conflict',
      message: normalized,
    };
  }

  return {
    type: 'error',
    title: 'Failed to save user',
    message: normalized || 'Unable to save user changes.',
  };
};

const isUnsupportedActionMessage = (message: string, action: string) => {
  const normalizedMessage = String(message || '').toLowerCase();
  const normalizedAction = String(action || '').toLowerCase();

  if (!normalizedMessage) return false;
  if (normalizedAction && normalizedMessage.includes(`unsupported action: ${normalizedAction}`)) {
    return true;
  }

  return normalizedMessage.includes('unsupported action') || normalizedMessage.includes('invalid action');
};

const normalizeUserRole = (rawRole: unknown): UserRole => {
  const normalized = String(rawRole || '').trim().toLowerCase();

  if (normalized === 'manager' || normalized === 'musician-member') {
    return 'musician';
  }

  return userRoleOptions.includes(normalized as UserRole) ? (normalized as UserRole) : 'musician';
};

const getUserDetailsRecord = (
  data: any,
  fallback: UserDetailsRequestTarget,
): Record<string, unknown> => {
  const candidates = [
    data?.item,
    data?.profile,
    data?.user,
    Array.isArray(data?.items) ? data.items[0] : null,
  ];

  const found = candidates.find((candidate) => candidate && typeof candidate === 'object');
  if (found && typeof found === 'object') {
    return found as Record<string, unknown>;
  }

  return {
    id: fallback.id,
    full_name: fallback.full_name || null,
    email: fallback.email || null,
  };
};

const getOptionalStringField = (
  record: Record<string, unknown>,
  key: string,
  fallback?: string | null,
): string | null => {
  const value = record[key];
  if (value === null || value === undefined) return fallback ?? null;
  const normalized = String(value).trim();
  return normalized || (fallback ?? null);
};

const getStringListField = (
  record: Record<string, unknown>,
  key: string,
  fallback?: string[] | null,
): string[] => {
  const value = record[key];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return normalizeDelimitedList(value);
  }
  return Array.isArray(fallback) ? fallback : [];
};

const getBooleanField = (
  record: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean => {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === 'no') return false;
  }
  return fallback;
};

const normalizeStaffAssignmentFromRecord = (record: Record<string, unknown>): StaffAssignment | null => {
  const raw = record.staff_assignment;
  if (!raw || typeof raw !== 'object') return null;

  const assignment = raw as Record<string, unknown>;
  const entityType = normalizeStaffEntityType(assignment.entity_type);
  const accessLevel = normalizeStaffAccessLevel(assignment.access_level);
  const id = getOptionalStringField(assignment, 'id');
  const staffUserId = getOptionalStringField(assignment, 'staff_user_id');

  if (!entityType || !accessLevel || !id || !staffUserId) return null;

  const studioId = getOptionalStringField(assignment, 'studio_id');
  const gigId = getOptionalStringField(assignment, 'gig_id');
  const productionTeamId = getOptionalStringField(assignment, 'production_team_id');
  const targetId =
    getOptionalStringField(assignment, 'target_id') ||
    (entityType === 'studio' ? studioId : entityType === 'venue' ? gigId : productionTeamId);

  return {
    id,
    staff_user_id: staffUserId,
    entity_type: entityType,
    studio_id: studioId,
    gig_id: gigId,
    production_team_id: productionTeamId,
    access_level: accessLevel,
    can_edit_listing: getBooleanField(assignment, 'can_edit_listing', accessLevel === 1),
    can_add_listing: getBooleanField(assignment, 'can_add_listing', accessLevel === 1),
    can_delete_listing: getBooleanField(assignment, 'can_delete_listing', accessLevel === 1),
    can_manage_marketplace: getBooleanField(assignment, 'can_manage_marketplace'),
    target_id: targetId || null,
    target_name: getOptionalStringField(assignment, 'target_name'),
  };
};

const normalizeStaffAssignmentsFromRecord = (record: Record<string, unknown>): StaffAssignment[] => {
  const rawAssignments = Array.isArray(record.staff_assignments)
    ? record.staff_assignments
    : record.staff_assignment
      ? [record.staff_assignment]
      : [];

  return rawAssignments.flatMap((raw) => {
    const assignment = normalizeStaffAssignmentFromRecord({ staff_assignment: raw });
    return assignment ? [assignment] : [];
  });
};

const getPhilippineTodayStartIso = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}T00:00:00+08:00`;
};

const normalizeUserEntryFromDetails = (
  record: Record<string, unknown>,
  fallback: UserEntry,
): UserEntry => {
  const staffAssignments = normalizeStaffAssignmentsFromRecord(record);
  const resolvedStaffAssignments = staffAssignments.length > 0
    ? staffAssignments
    : fallback.staff_assignments || (fallback.staff_assignment ? [fallback.staff_assignment] : []);
  const staffAssignment = resolvedStaffAssignments[0] || null;

  return {
    id: getOptionalStringField(record, 'id', fallback.id) || fallback.id,
    full_name: getOptionalStringField(record, 'full_name', fallback.full_name) || '',
    email: getOptionalStringField(record, 'email', fallback.email) || '',
    role: getOptionalStringField(record, 'role', fallback.role) || fallback.role,
    contact_number: getOptionalStringField(record, 'contact_number', fallback.contact_number),
    address: getOptionalStringField(record, 'address', fallback.address),
    location: getOptionalStringField(record, 'location', fallback.location),
    bio: getOptionalStringField(record, 'bio', fallback.bio),
    skills: getStringListField(record, 'skills', fallback.skills),
    genres: getStringListField(record, 'genres', fallback.genres),
    is_verified: getBooleanField(record, 'is_verified', Boolean(fallback.is_verified)),
    verification_status: getOptionalStringField(record, 'verification_status', fallback.verification_status),
    created_at: getOptionalStringField(record, 'created_at', fallback.created_at) || fallback.created_at,
    is_banned: getBooleanField(record, 'is_banned', Boolean(fallback.is_banned)),
    banned_until: getOptionalStringField(record, 'banned_until', fallback.banned_until),
    ban_reason: getOptionalStringField(record, 'ban_reason', fallback.ban_reason),
    ban_action: getOptionalStringField(record, 'ban_action', fallback.ban_action),
    banned_at: getOptionalStringField(record, 'banned_at', fallback.banned_at),
    banned_by: getOptionalStringField(record, 'banned_by', fallback.banned_by),
    ban_lifted_at: getOptionalStringField(record, 'ban_lifted_at', fallback.ban_lifted_at),
    ban_lifted_by: getOptionalStringField(record, 'ban_lifted_by', fallback.ban_lifted_by),
    staff_assignment: staffAssignment,
    staff_assignments: resolvedStaffAssignments,
    staff_assignment_label: getOptionalStringField(record, 'staff_assignment_label', fallback.staff_assignment_label),
  };
};

const styles = StyleSheet.create({
  booleanToggleButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  booleanToggleButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  booleanToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  detailLabel: {
    flexBasis: 132,
    flexShrink: 0,
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailsEmptyText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  detailsRows: {
    gap: 8,
  },
  detailsScroll: {
    maxHeight: 520,
  },
  detailsScrollContent: {
    gap: 12,
    paddingBottom: 4,
  },
  detailsSection: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  detailsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailsSectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailsSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsSectionImage: {
    width: 112,
    height: 112,
    borderRadius: 18,
    borderWidth: 1,
  },
  detailsSectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailsSectionMeta: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    marginTop: 1,
  },
  detailHighlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailHighlightCard: {
    flexGrow: 1,
    flexBasis: 190,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  detailHighlightLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailHighlightValue: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    paddingVertical: 14,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    textTransform: 'capitalize',
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  roleSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 4,
  },
  fieldErrorText: {
    color: '#EF4444',
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
  },
  flex1: {
    flex: 1,
  },
  formSection: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },
  formSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formSectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSectionTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
  },
  formLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  inlineActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  staffAccessPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 16,
  },
  staffPermissionList: {
    gap: 10,
  },
  staffPermissionRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  staffPermissionCopy: {
    flex: 1,
    gap: 3,
  },
  staffPermissionTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
  },
  staffLevelText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  staffTargetList: {
    maxHeight: 220,
  },
  staffTargetListContent: {
    gap: 8,
  },
  staffTargetOption: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  staffTargetSelectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staffTargetTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  staffTargetMeta: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
  },
  staffTargetsError: {
    gap: 6,
  },
  staffTargetsRetryText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  staffTargetNotice: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  staffConflictList: {
    gap: 8,
  },
  staffConflictCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 6,
  },
  staffConflictAction: {
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  staffConflictActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  modalActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalButton: {
    flexShrink: 1,
    minWidth: 132,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '94%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    gap: 14,
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 860,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  detailsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailsModalIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsModalCopy: {
    flex: 1,
    minWidth: 0,
  },
  modalInputCompact: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  modalInputMultiline: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  inputInvalid: {
    borderWidth: 1.5,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
  },
  modalDescription: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  primaryActionButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  requiredMark: {
    color: '#EF4444',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  sectionHeading: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
  },
  sectionGap: {
    gap: 12,
  },
  smallActionButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  smallActionButtonFilled: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallActionText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  smallActionTextFilled: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },

  userFormScroll: {
    maxHeight: 680,
  },
  userFormScrollContent: {
    gap: 14,
    paddingBottom: 8,
  },
});

export default function AdminUsersPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { height, isCompact, contentPadding } = useAdminLayout();
  const hasHydratedUsersRef = useRef(false);

  const [initializingUsers, setInitializingUsers] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [userActionLoadingId, setUserActionLoadingId] = useState<string | null>(null);
  const [userEditLoadingId, setUserEditLoadingId] = useState<string | null>(null);
  const [userDetailsLoadingKey, setUserDetailsLoadingKey] = useState<string | null>(null);

  const [userModalVisible, setUserModalVisible] = useState(false);
  const [userModalMode, setUserModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingOriginalRole, setEditingOriginalRole] = useState<UserRole | null>(null);
  const [userFormFullName, setUserFormFullName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormRole, setUserFormRole] = useState<UserRole>('fan');
  const [userFormContactNumber, setUserFormContactNumber] = useState('');
  const [userFormAddress, setUserFormAddress] = useState('');
  const [userFormSkills, setUserFormSkills] = useState('');
  const [userFormGenres, setUserFormGenres] = useState('');
  const [userFormBio, setUserFormBio] = useState('');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userFormConfirmPassword, setUserFormConfirmPassword] = useState('');
  const [userFormIsVerified, setUserFormIsVerified] = useState(false);
  const [userFormEmailConfirmed, setUserFormEmailConfirmed] = useState(false);
  const [userFormSubmitting, setUserFormSubmitting] = useState(false);
  const [userFormSubmitAttempted, setUserFormSubmitAttempted] = useState(false);
  const [staffFormEntityType, setStaffFormEntityType] = useState<StaffEntityType>('studio');
  const [staffFormAccessLevels, setStaffFormAccessLevels] = useState<Record<StaffEntityType, StaffAccessLevel>>({
    studio: 1,
    venue: 1,
    production: 1,
  });
  const [staffFormAssignments, setStaffFormAssignments] = useState<StaffFormAssignments>(createEmptyStaffFormAssignments);
  const [staffFormListingPermissions, setStaffFormListingPermissions] = useState<StaffFormListingPermissions>(
    createDefaultStaffFormListingPermissions,
  );
  const [staffFormMarketplaceAccess, setStaffFormMarketplaceAccess] = useState(false);
  const [staffTargetOptions, setStaffTargetOptions] = useState<StaffTargetOption[]>([]);
  const [staffTargetConflicts, setStaffTargetConflicts] = useState<StaffTargetConflict[]>([]);
  const [hiddenOwnedTargetIds, setHiddenOwnedTargetIds] = useState<string[]>([]);
  const [staffConflictResolvingId, setStaffConflictResolvingId] = useState<string | null>(null);
  const [staffTargetsLoading, setStaffTargetsLoading] = useState(false);
  const [staffTargetsError, setStaffTargetsError] = useState<string | null>(null);
  const staffTargetsRequestIdRef = useRef(0);
  const [ownedRoleListings, setOwnedRoleListings] = useState<OwnedRoleListing[]>([]);
  const [ownershipCandidates, setOwnershipCandidates] = useState<OwnershipCandidate[]>([]);
  const [ownershipReassignments, setOwnershipReassignments] = useState<Record<string, string>>({});
  const [ownershipOptionsLoading, setOwnershipOptionsLoading] = useState(false);
  const [ownershipOptionsReady, setOwnershipOptionsReady] = useState(false);
  const [ownershipOptionsError, setOwnershipOptionsError] = useState<string | null>(null);
  const [userDetailsTarget, setUserDetailsTarget] = useState<UserDetailsEntry | null>(null);
  const [alertState, setAlertState] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
    buttons?: AdminAlertButton[];
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const userFormErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const email = userFormEmail.trim();
    const password = userFormPassword.trim();
    const passwordUpdateRequested = userFormPassword.length > 0 || userFormConfirmPassword.length > 0;

    if (!userFormFullName.trim()) {
      errors.fullName = 'Full name is required.';
    }

    if (!email) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (userModalMode === 'create' || passwordUpdateRequested) {
      if (password.length < 6) {
        errors.password = userModalMode === 'create'
          ? 'Password must be at least 6 characters.'
          : 'New password must be at least 6 characters.';
      }

      if (userFormPassword !== userFormConfirmPassword) {
        errors.confirmPassword = 'Passwords do not match.';
      }
    }

    const staffAssignmentCount = Object.values(staffFormAssignments)
      .reduce((count, assignments) => count + Object.keys(assignments).length, 0);
    if (userFormRole === 'staff' && staffAssignmentCount === 0) {
      errors.staffTarget = 'Select at least one studio, gig, or production team this staff member can access.';
    }

    const ownershipTransferRequired = userModalMode === 'edit'
      && Boolean(editingOriginalRole && ownershipRoleConfig[editingOriginalRole])
      && userFormRole !== editingOriginalRole;
    const missingOwnershipAssignments = ownedRoleListings.filter((item) => !ownershipReassignments[item.id]);
    if (ownershipTransferRequired && (!ownershipOptionsReady || ownershipOptionsLoading)) {
      errors.ownershipReassignment = 'Wait for the owned listings to finish loading.';
    } else if (ownershipTransferRequired && ownershipOptionsError) {
      errors.ownershipReassignment = 'Reload the ownership options before saving.';
    } else if (missingOwnershipAssignments.length > 0) {
      errors.ownershipReassignment = `Choose a new owner for every ${ownershipRoleConfig[editingOriginalRole || 'fan']?.singular || 'listing'}.`;
    }

    return errors;
  }, [
    userFormEmail,
    userFormFullName,
    userFormPassword,
    userFormConfirmPassword,
    userFormRole,
    editingOriginalRole,
    ownedRoleListings,
    ownershipReassignments,
    ownershipOptionsError,
    ownershipOptionsLoading,
    ownershipOptionsReady,
    staffFormAssignments,
    userModalMode,
  ]);

  const userFormHasErrors = Object.keys(userFormErrors).length > 0;

  const showAlert = useCallback((type: AlertType, title: string, message: string) => {
    setAlertState({ visible: true, type, title, message, buttons: undefined });
  }, []);

  const usersCacheKey = useMemo(() => getAdminPageCacheKey('users'), []);

  const invokeAdminUsersManagement = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke<any>('admin-users-management', {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      return data;
    },
    [],
  );

  const invokeManageBookingsAction = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<any>('manage-bookings', {
      body: payload,
    });

    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));

    return data;
  }, []);

  const fetchOwnershipReassignmentOptions = useCallback(async () => {
    const config = editingOriginalRole ? ownershipRoleConfig[editingOriginalRole] : null;
    if (!editingUserId || !config || userFormRole === editingOriginalRole) {
      setOwnedRoleListings([]);
      setOwnershipCandidates([]);
      setOwnershipReassignments({});
      setOwnershipOptionsError(null);
      setOwnershipOptionsLoading(false);
      setOwnershipOptionsReady(true);
      return;
    }

    setOwnershipOptionsLoading(true);
    setOwnershipOptionsReady(false);
    setOwnershipOptionsError(null);
    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_owned_role_listings',
        userId: editingUserId,
      });
      const items: OwnedRoleListing[] = (Array.isArray(data?.items) ? data.items : []).flatMap((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return [];
        return [{
          id,
          name: String(item?.name || 'Untitled'),
          entityType: config.entityType,
        }];
      });
      const candidates: OwnershipCandidate[] = (Array.isArray(data?.candidates) ? data.candidates : []).flatMap((candidate: any) => {
        const id = String(candidate?.id || '').trim();
        if (!id) return [];
        return [{
          id,
          fullName: String(candidate?.full_name || candidate?.email || 'Unnamed owner'),
          email: candidate?.email ? String(candidate.email) : null,
        }];
      });
      setOwnedRoleListings(items);
      setOwnershipCandidates(candidates);
      setOwnershipReassignments((current) => Object.fromEntries(
        items.flatMap((item) => current[item.id] ? [[item.id, current[item.id]]] : []),
      ));
    } catch (error) {
      setOwnedRoleListings([]);
      setOwnershipCandidates([]);
      setOwnershipReassignments({});
      setOwnershipOptionsError(await getErrorMessage(error, 'Unable to load owned listings and replacement owners.'));
    } finally {
      setOwnershipOptionsLoading(false);
      setOwnershipOptionsReady(true);
    }
  }, [editingOriginalRole, editingUserId, invokeAdminUsersManagement, userFormRole]);

  const fetchStaffTargetOptions = useCallback(async () => {
    if (userFormRole !== 'staff') {
      staffTargetsRequestIdRef.current += 1;
      setStaffTargetOptions([]);
      setStaffTargetConflicts([]);
      setHiddenOwnedTargetIds([]);
      setStaffTargetsError(null);
      return;
    }

    const requestId = ++staffTargetsRequestIdRef.current;
    setStaffTargetsLoading(true);
    setStaffTargetsError(null);
    try {
      let items: any[] = [];
      let conflicts: any[] = [];
      let hiddenOwnedIds: string[] = [];
      const entityType = staffFormEntityType;
      const target = entityType === 'studio'
        ? { table: 'studios', ownerColumn: 'owner_id' }
        : entityType === 'venue'
          ? { table: 'gigs', ownerColumn: 'organizer_id' }
          : { table: 'production_teams', ownerColumn: 'owner_id' };
      const shouldUseAdminFilteredTargets = Boolean(editingUserId);
      let directQuery = supabase
        .from(target.table)
        .select(`id, name, created_at, ${entityType === 'venue' ? 'event_date, ' : ''}${target.ownerColumn}`);

      if (entityType === 'studio') {
        directQuery = directQuery.eq('permit_status', 'approved');
      } else if (entityType === 'venue') {
        directQuery = directQuery
          .eq('status', 'open')
          .eq('permit_status', 'approved')
          .or(`event_date.is.null,event_date.gte.${getPhilippineTodayStartIso()}`);
      }

      if (shouldUseAdminFilteredTargets) {
        const data = await invokeAdminUsersManagement({
          action: 'fetch_role_targets',
          entity_type: staffFormEntityType,
          staff_user_id: editingUserId,
        });
        items = Array.isArray(data?.items) ? data.items : [];
        conflicts = Array.isArray(data?.conflicts) ? data.conflicts : [];
        hiddenOwnedIds = Array.isArray(data?.hidden_owned_ids)
          ? data.hidden_owned_ids.map((id: unknown) => String(id || '')).filter(Boolean)
          : [];
      } else {
        const { data: directItems, error: directError } = await directQuery
          .order(entityType === 'venue' ? 'event_date' : 'created_at', {
            ascending: entityType === 'venue',
            nullsFirst: false,
          })
          .limit(300);

        if (!directError) {
          items = (directItems || []).map((item: any) => ({
            ...item,
            owner_id: item[target.ownerColumn] || null,
          }));
        } else {
          // Fall back to the service-role endpoint if public listing policies are tightened later.
          const data = await invokeAdminUsersManagement({
            action: 'fetch_role_targets',
            entity_type: staffFormEntityType,
          });
          items = Array.isArray(data?.items) ? data.items : [];
        }
      }

      const options = items
        .map((item: any) => ({
          id: String(item?.id || ''),
          name: String(item?.name || 'Untitled'),
          meta: item?.event_date
            ? `Event ${formatDateTime(item.event_date)}`
            : item?.created_at
              ? `Created ${formatDateTime(item.created_at)}`
              : null,
        }))
        .filter((item: StaffTargetOption) => item.id.length > 0);

      if (requestId !== staffTargetsRequestIdRef.current) return;
      setStaffTargetOptions(options);
      setStaffTargetConflicts(conflicts.flatMap((item: any) => {
        const conflictEntityType = normalizeStaffEntityType(item?.entity_type);
        const id = String(item?.id || '').trim();
        if (!conflictEntityType || !id) return [];
        return [{
          id,
          name: String(item?.name || 'Untitled'),
          entityType: conflictEntityType,
          reason: String(item?.reason || 'This user already participates in this listing.'),
          resolution: String(item?.resolution || 'Resolve the participation before assigning staff access.'),
          canAutoResolve: item?.can_auto_resolve === true,
        }];
      }));
      setHiddenOwnedTargetIds(hiddenOwnedIds);
      if (shouldUseAdminFilteredTargets && hiddenOwnedIds.length > 0) {
        setStaffFormAssignments((current) => {
          const nextForType = { ...current[staffFormEntityType] };
          hiddenOwnedIds.forEach((id) => delete nextForType[id]);
          return { ...current, [staffFormEntityType]: nextForType };
        });
      }
    } catch (error) {
      console.warn('Failed to load staff target options', error);
      if (requestId !== staffTargetsRequestIdRef.current) return;
      setStaffTargetOptions([]);
      setStaffTargetConflicts([]);
      setHiddenOwnedTargetIds([]);
      setStaffTargetsError(await getErrorMessage(error, 'Unable to load assignable records.'));
    } finally {
      if (requestId === staffTargetsRequestIdRef.current) {
        setStaffTargetsLoading(false);
      }
    }
  }, [editingUserId, invokeAdminUsersManagement, staffFormEntityType, userFormRole]);

  const resolveStaffTargetConflict = useCallback((conflict: StaffTargetConflict) => {
    if (!editingUserId || conflict.entityType !== 'production' || !conflict.canAutoResolve) return;

    const performResolve = async () => {
      setStaffConflictResolvingId(conflict.id);
      try {
        await invokeAdminUsersManagement({
          action: 'resolve_staff_production_conflict',
          staff_user_id: editingUserId,
          team_id: conflict.id,
        });
        setStaffFormAssignments((current) => ({
          ...current,
          production: {
            ...current.production,
            [conflict.id]: staffFormAccessLevels.production,
          },
        }));
        await fetchStaffTargetOptions();
        showAlert(
          'success',
          'Conflict resolved',
          `${conflict.name} is now selected for staff access. Review the permissions, then save the user.`,
        );
      } catch (error) {
        const message = await getErrorMessage(error, 'Unable to resolve this production participation conflict.');
        showAlert('error', 'Could not resolve conflict', message);
      } finally {
        setStaffConflictResolvingId(null);
      }
    };

    const message = `This will permanently remove this user as a production member and direct roster participant from ${conflict.name}. It will not delete the production.\n\n${conflict.reason}\n\nAfterward, the production will be selected for staff access.`;
    const buttons: AdminAlertButton[] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve conflict',
        style: 'destructive',
        onPress: () => void performResolve(),
      },
    ];

    if (Platform.OS === 'web') {
      setAlertState({
        visible: true,
        type: 'warning',
        title: 'Resolve participation conflict?',
        message,
        buttons,
      });
      return;
    }

    Alert.alert('Resolve participation conflict?', message, buttons);
  }, [editingUserId, fetchStaffTargetOptions, invokeAdminUsersManagement, showAlert, staffFormAccessLevels.production]);

  useEffect(() => {
    if (!userModalVisible || userFormRole !== 'staff') {
      return;
    }

    void fetchStaffTargetOptions();
  }, [fetchStaffTargetOptions, userFormRole, userModalMode, userModalVisible]);

  useEffect(() => {
    if (!userModalVisible || userModalMode !== 'edit') {
      setOwnedRoleListings([]);
      setOwnershipCandidates([]);
      setOwnershipReassignments({});
      setOwnershipOptionsError(null);
      setOwnershipOptionsReady(false);
      return;
    }
    void fetchOwnershipReassignmentOptions();
  }, [fetchOwnershipReassignmentOptions, userModalMode, userModalVisible]);

  const fetchUsers = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setUsersLoading(true);
    }

    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_users',
        limit: 300,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      setUsers(items);
      writeAdminPageCache(usersCacheKey, items);
    } catch (error) {
      if (!options?.silent) {
        const message = await getErrorMessage(error, 'Unable to fetch users.');
        showAlert('error', 'Failed to load users', message);
      }
    } finally {
      if (!options?.silent) {
        setUsersLoading(false);
      }
    }
  }, [showAlert, usersCacheKey, invokeAdminUsersManagement]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializingUsers(false);
      hasHydratedUsersRef.current = false;
      return;
    }

    let isMounted = true;
    const cachedUsers = readAdminPageCache<UserEntry[]>(usersCacheKey, USERS_CACHE_TTL_MS);

    if (cachedUsers) {
      setUsers(cachedUsers);
      setInitializingUsers(false);
      hasHydratedUsersRef.current = true;
    } else if (!hasHydratedUsersRef.current) {
      setInitializingUsers(true);
    } else {
      setInitializingUsers(false);
    }

    void (async () => {
      try {
        await fetchUsers({ silent: Boolean(cachedUsers) });
      } finally {
        if (isMounted) {
          setInitializingUsers(false);
          hasHydratedUsersRef.current = true;
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loading, roleResolved, session, isGuest, isAdmin, usersCacheKey, fetchUsers]);

  const resetUserForm = useCallback(() => {
    setUserFormFullName('');
    setUserFormEmail('');
    setUserFormRole('fan');
    setUserFormContactNumber('');
    setUserFormAddress('');
    setUserFormSkills('');
    setUserFormGenres('');
    setUserFormBio('');
    setUserFormPassword('');
    setUserFormConfirmPassword('');
    setUserFormIsVerified(false);
    setUserFormEmailConfirmed(false);
    setUserFormSubmitAttempted(false);
    setStaffFormEntityType('studio');
    setStaffFormAccessLevels({ studio: 1, venue: 1, production: 1 });
    setStaffFormAssignments(createEmptyStaffFormAssignments());
    setStaffFormListingPermissions(createDefaultStaffFormListingPermissions());
    setStaffFormMarketplaceAccess(false);
    setEditingOriginalRole(null);
    setStaffTargetOptions([]);
    setStaffTargetConflicts([]);
    setHiddenOwnedTargetIds([]);
    setStaffConflictResolvingId(null);
    setStaffTargetsError(null);
    staffTargetsRequestIdRef.current += 1;
    setStaffTargetsLoading(false);
    setOwnedRoleListings([]);
    setOwnershipCandidates([]);
    setOwnershipReassignments({});
    setOwnershipOptionsLoading(false);
    setOwnershipOptionsReady(false);
    setOwnershipOptionsError(null);
  }, []);

  const openCreateUserModal = useCallback(() => {
    setUserModalMode('create');
    setEditingUserId(null);
    resetUserForm();
    setUserModalVisible(true);
  }, [resetUserForm]);

  const populateUserForm = useCallback((targetUser: UserEntry) => {
    setUserModalMode('edit');
    setEditingUserId(targetUser.id);
    setEditingOriginalRole(normalizeUserRole(targetUser.role));
    setUserFormFullName(targetUser.full_name || '');
    setUserFormEmail(targetUser.email || '');
    setUserFormRole(normalizeUserRole(targetUser.role));
    setUserFormContactNumber(targetUser.contact_number || '');
    setUserFormAddress(targetUser.address || targetUser.location || '');
    setUserFormSkills(formatListForInput(targetUser.skills));
    setUserFormGenres(formatListForInput(targetUser.genres));
    setUserFormBio(targetUser.bio || '');
    setUserFormPassword('');
    setUserFormConfirmPassword('');
    setUserFormIsVerified(Boolean(targetUser.is_verified));
    setUserFormEmailConfirmed(false);
    const staffAssignments = targetUser.staff_assignments || (targetUser.staff_assignment ? [targetUser.staff_assignment] : []);
    const nextAssignments = createEmptyStaffFormAssignments();
    const nextAccessLevels: Record<StaffEntityType, StaffAccessLevel> = { studio: 1, venue: 1, production: 1 };
    const nextListingPermissions = createDefaultStaffFormListingPermissions();
    staffAssignments.forEach((assignment) => {
      const entityType = normalizeStaffEntityType(assignment.entity_type);
      const accessLevel = normalizeStaffAccessLevel(assignment.access_level);
      const targetId = entityType === 'studio'
        ? assignment.studio_id || assignment.target_id
        : entityType === 'venue'
          ? assignment.gig_id || assignment.target_id
          : assignment.production_team_id || assignment.target_id;
      if (!entityType || !accessLevel || !targetId) return;
      nextAssignments[entityType][targetId] = accessLevel;
      nextAccessLevels[entityType] = accessLevel;
      nextListingPermissions[entityType] = {
        edit: assignment.can_edit_listing,
        add: assignment.can_add_listing,
        delete: assignment.can_delete_listing,
      };
    });
    const firstEntityType = staffAssignments
      .map((assignment) => normalizeStaffEntityType(assignment.entity_type))
      .find(Boolean) || 'studio';
    setStaffFormEntityType(firstEntityType);
    setStaffFormAccessLevels(nextAccessLevels);
    setStaffFormAssignments(nextAssignments);
    setStaffFormListingPermissions(nextListingPermissions);
    setStaffFormMarketplaceAccess(staffAssignments.some((assignment) => assignment.can_manage_marketplace));
    setUserModalVisible(true);
  }, []);

  const openEditUserModal = useCallback(async (targetUser: UserEntry) => {
    setUserEditLoadingId(targetUser.id);

    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_user_details',
        userId: targetUser.id,
      });
      const details = getUserDetailsRecord(data, targetUser);
      const hydratedUser = normalizeUserEntryFromDetails(details, targetUser);
      populateUserForm(hydratedUser);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to load this user for editing.');
      showAlert('error', 'Failed to load user', message);
    } finally {
      setUserEditLoadingId((prev) => (prev === targetUser.id ? null : prev));
    }
  }, [invokeAdminUsersManagement, populateUserForm, showAlert]);

  const openUserDetailsModal = useCallback(async (targetUser: UserDetailsRequestTarget, loadingKey?: string) => {
    const requestLoadingKey = loadingKey || targetUser.id;
    setUserDetailsLoadingKey(requestLoadingKey);
    try {
      let data: any = null;

      try {
        data = await invokeAdminUsersManagement({
          action: 'fetch_user_details',
          userId: targetUser.id,
        });
      } catch (primaryError) {
        const primaryMessage = await getErrorMessage(primaryError, 'Unable to load user details.');

        if (!isUnsupportedActionMessage(primaryMessage, 'fetch_user_details')) {
          throw primaryError;
        }

        try {
          data = await invokeManageBookingsAction({
            action: 'fetch_user_details',
            userId: targetUser.id,
          });
        } catch (secondaryError) {
          const secondaryMessage = await getErrorMessage(secondaryError, 'Unable to load user details.');

          if (!isUnsupportedActionMessage(secondaryMessage, 'fetch_user_details')) {
            throw secondaryError;
          }

          data = {
            item: {
              id: targetUser.id,
              full_name: targetUser.full_name || null,
              email: targetUser.email || null,
            },
          };
        }
      }

      const profile = getUserDetailsRecord(data, targetUser);

      setUserDetailsTarget({
        profile,
      });
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to load user details.');
      showAlert('error', 'Failed to load user details', message);

      setUserDetailsTarget({
        profile: {
          id: targetUser.id,
          full_name: targetUser.full_name || null,
          email: targetUser.email || null,
        },
      });
    } finally {
      setUserDetailsLoadingKey((prev) => (prev === requestLoadingKey ? null : prev));
    }
  }, [invokeAdminUsersManagement, showAlert, invokeManageBookingsAction]);

  const closeUserModal = useCallback(() => {
    if (userFormSubmitting) return;
    setUserModalVisible(false);
    setEditingUserId(null);
    setUserFormSubmitAttempted(false);
  }, [userFormSubmitting]);

  const closeUserDetailsModal = useCallback(() => {
    setUserDetailsTarget(null);
  }, []);

  const submitUserForm = useCallback(async () => {
    setUserFormSubmitAttempted(true);

    const email = userFormEmail.trim().toLowerCase();
    const fullName = userFormFullName.trim();
    const contactNumber = userFormContactNumber.trim();
    const address = userFormAddress.trim();
    const bio = userFormBio.trim();
    const skills = normalizeDelimitedList(userFormSkills);
    const genres = normalizeDelimitedList(userFormGenres);
    const nextPassword = userFormPassword.trim();
    const staffAssignmentsPayload = userFormRole === 'staff'
      ? staffEntityOptions.flatMap((entityType) => Object.entries(staffFormAssignments[entityType]).map(([targetId, accessLevel]) => ({
        entity_type: entityType,
        access_level: accessLevel,
        target_id: targetId,
        studio_id: entityType === 'studio' ? targetId : null,
        gig_id: entityType === 'venue' ? targetId : null,
        production_team_id: entityType === 'production' ? targetId : null,
        can_edit_listing: staffFormListingPermissions[entityType].edit,
        can_add_listing: staffFormListingPermissions[entityType].add,
        can_delete_listing: staffFormListingPermissions[entityType].delete,
        can_manage_marketplace: staffFormMarketplaceAccess,
      })))
      : [];
    const shouldSendStaffAssignments = userFormRole === 'staff' || editingOriginalRole === 'staff';
    const legacyStaffAssignmentPayload = staffAssignmentsPayload[0] || null;
    const ownershipReassignmentsPayload = ownedRoleListings.map((item) => ({
      entity_type: item.entityType,
      target_id: item.id,
      new_owner_id: ownershipReassignments[item.id],
    }));
    if (userFormHasErrors) {
      const missingFields = Object.values(userFormErrors);
      showAlert(
        'warning',
        'Check required fields',
        missingFields.length > 0
          ? missingFields.join(' ')
          : 'Please complete the highlighted fields before saving.',
      );
      return;
    }

    setUserFormSubmitting(true);
    try {
      if (userFormRole === 'staff' && staffAssignmentsPayload.length > 1) {
        try {
          await invokeAdminUsersManagement({
            action: 'fetch_role_targets',
            entity_type: staffAssignmentsPayload[0].entity_type,
          });
        } catch (capabilityError) {
          const capabilityMessage = await getErrorMessage(capabilityError, 'Unable to verify multiple-assignment support.');
          if (isUnsupportedActionMessage(capabilityMessage, 'fetch_role_targets')) {
            throw new Error('Multiple staff assignments require the updated admin function to be deployed. No changes were saved.');
          }
          throw capabilityError;
        }
      }

      if (userModalMode === 'create') {
        await invokeAdminUsersManagement({
          action: 'create_user',
          email,
          password: userFormPassword,
          fullName,
          role: userFormRole,
          contactNumber,
          address,
          skills,
          genres,
          bio,
          isVerified: userFormIsVerified,
          emailConfirmed: userFormEmailConfirmed,
          ...(staffAssignmentsPayload.length > 0
            ? {
                staffAssignments: staffAssignmentsPayload,
                staffAssignment: legacyStaffAssignmentPayload,
              }
            : {}),
        });

        showAlert('success', 'User created', `${fullName} was created as ${formatRoleLabel(userFormRole)}.`);
      } else {
        if (!editingUserId) {
          throw new Error('Missing user id for update.');
        }

        const updateResult = await invokeAdminUsersManagement({
          action: 'update_user',
          userId: editingUserId,
          email,
          fullName,
          role: userFormRole,
          contactNumber,
          address,
          skills,
          genres,
          bio,
          isVerified: userFormIsVerified,
          ...(shouldSendStaffAssignments
            ? {
                staffAssignments: staffAssignmentsPayload,
                staffAssignment: legacyStaffAssignmentPayload,
              }
            : {}),
          ...(ownershipReassignmentsPayload.length > 0
            ? { ownershipReassignments: ownershipReassignmentsPayload }
            : {}),
          ...(nextPassword ? { password: nextPassword } : {}),
        });

        showAlert(
          'success',
          'User updated',
          updateResult?.role_changed
            ? `${fullName}'s role was changed and their active sessions were signed out.`
            : `${fullName}'s account and profile details were saved.`,
        );
      }

      invalidateAdminPageCache();
      setUserModalVisible(false);
      setEditingUserId(null);
      resetUserForm();
      await fetchUsers();
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to save user changes.');
      const feedback = getUserSaveFeedback(message);
      showAlert(feedback.type, feedback.title, feedback.message);
    } finally {
      setUserFormSubmitting(false);
    }
  }, [
    userFormEmail,
    userFormFullName,
    userFormContactNumber,
    userFormAddress,
    userFormSkills,
    userFormGenres,
    userFormBio,
    userModalMode,
    userFormPassword,
    userFormRole,
    staffFormAssignments,
    staffFormListingPermissions,
    staffFormMarketplaceAccess,
    ownedRoleListings,
    ownershipReassignments,
    userFormIsVerified,
    userFormEmailConfirmed,
    editingUserId,
    editingOriginalRole,
    showAlert,
    resetUserForm,
    fetchUsers,
    invokeAdminUsersManagement,
    userFormErrors,
    userFormHasErrors,
  ]);

  const deleteUser = useCallback(
    (targetUser: UserEntry) => {
      if (targetUser.id === session?.user.id) {
        showAlert('warning', 'Action blocked', 'You cannot delete your own account from this panel.');
        return;
      }

      const message = `Are you sure you want to delete ${targetUser.full_name || targetUser.email}? This cannot be undone.`;
      const performDelete = async () => {
        setUserActionLoadingId(targetUser.id);
        try {
          await invokeAdminUsersManagement({
            action: 'delete_user',
            userId: targetUser.id,
          });

          invalidateAdminPageCache();
          showAlert('success', 'User deleted', 'The user account has been removed.');
          await fetchUsers();
        } catch (error) {
          const message = await getErrorMessage(error, 'Unable to delete this user.');
          showAlert('error', 'Failed to delete user', message);
        } finally {
          setUserActionLoadingId(null);
        }
      };

      if (Platform.OS === 'web') {
        setAlertState({
          visible: true,
          type: 'warning',
          title: 'Delete user',
          message,
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                void performDelete();
              },
            },
          ],
        });
        return;
      }

      Alert.alert(
        'Delete user',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void performDelete();
            },
          },
        ],
      );
    },
    [session?.user.id, showAlert, fetchUsers, invokeAdminUsersManagement],
  );

  const unbanUser = useCallback(
    (targetUser: UserEntry) => {
      const activeBan = getActiveUserBan(targetUser);
      if (!activeBan && !targetUser.is_banned) {
        showAlert('info', 'No active ban', 'This user does not have an active ban.');
        return;
      }

      const message = activeBan
        ? `Lift the active ban for ${targetUser.full_name || targetUser.email}? They will be able to sign in again immediately.`
        : `Clear the expired ban record for ${targetUser.full_name || targetUser.email}?`;
      const performUnban = async () => {
        setUserActionLoadingId(targetUser.id);
        try {
          await invokeAdminUsersManagement({
            action: 'unban_user',
            userId: targetUser.id,
          });

          invalidateAdminPageCache();
          showAlert('success', 'User unbanned', 'The account ban has been lifted.');
          await fetchUsers();
        } catch (error) {
          const message = await getErrorMessage(error, 'Unable to unban this user.');
          showAlert('error', 'Failed to unban user', message);
        } finally {
          setUserActionLoadingId(null);
        }
      };

      if (Platform.OS === 'web') {
        setAlertState({
          visible: true,
          type: 'warning',
          title: 'Unban user',
          message,
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Unban',
              style: 'default',
              onPress: () => {
                void performUnban();
              },
            },
          ],
        });
        return;
      }

      Alert.alert(
        'Unban user',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unban',
            style: 'default',
            onPress: () => {
              void performUnban();
            },
          },
        ],
      );
    },
    [showAlert, fetchUsers, invokeAdminUsersManagement],
  );

  const filteredUsers = useMemo(() => {
    const roleFiltered = users.filter((item) => {
      const role = String(item.role || '').trim().toLowerCase();

      if (userFilter === 'all') return true;
      if (userFilter === 'musicians') {
        return role === 'musician' || role === 'musician-member' || role === 'manager';
      }

      return role === userFilter;
    });

    const q = userSearch.trim().toLowerCase();
    if (!q) return roleFiltered;

    return roleFiltered.filter((item) => {
      return (
        String(item.full_name || '').toLowerCase().includes(q) ||
        String(item.email || '').toLowerCase().includes(q) ||
        String(item.role || '').toLowerCase().includes(q) ||
        String(item.ban_reason || '').toLowerCase().includes(q) ||
        String(item.ban_action || '').toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userFilter]);

  const renderDetailsSection = useCallback((title: string, details: Record<string, unknown> | null, emptyText: string) => {
    const entries = getFriendlyDetailEntries(details);
    const imageUrl = getFriendlyDetailImage(details);
    const highlightEntries = entries.slice(0, 2);
    const supportingEntries = entries.slice(2);
    const sectionIcon = getDetailsSectionIcon(title);

    return (
      <View
        style={[
          styles.detailsSection,
          {
            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.detailsSectionHeader}>
          <View style={[styles.detailsSectionIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name={sectionIcon as any} size={18} color={colors.primary} />
          </View>
          <View style={styles.detailsSectionHeaderCopy}>
            <Text style={[styles.detailsSectionTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.detailsSectionMeta, { color: colors.textSecondary }]}>
              {entries.length > 0 ? `${entries.length} visible details` : 'Nothing to review yet'}
            </Text>
          </View>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              resizeMode="cover"
              style={[styles.detailsSectionImage, { borderColor: colors.border }]}
            />
          ) : null}
        </View>
        {entries.length === 0 ? (
          <Text style={[styles.detailsEmptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
        ) : (
          <>
            <View style={styles.detailHighlightGrid}>
              {highlightEntries.map((entry) => (
                <View
                  key={`${title}-${entry.key}-highlight`}
                  style={[
                    styles.detailHighlightCard,
                    {
                      backgroundColor: isDark ? '#111827' : '#F8FAFC',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.detailHighlightLabel, { color: colors.textSecondary }]}>{entry.label}</Text>
                  <Text selectable style={[styles.detailHighlightValue, { color: colors.text }]}>
                    {entry.value}
                  </Text>
                </View>
              ))}
            </View>

            {supportingEntries.length > 0 && (
              <View style={styles.detailsRows}>
                {supportingEntries.map((entry) => (
                  <View
                    key={`${title}-${entry.key}`}
                    style={[
                      styles.detailRow, isCompact && { flexDirection: 'column' },
                      {
                        backgroundColor: isDark ? '#111827' : '#F8FAFC',
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.detailLabel, isCompact && { flexBasis: 'auto' }, { color: colors.textSecondary }]}>{entry.label}</Text>
                    <Text selectable style={[styles.detailValue, isCompact && { flex: 0, width: '100%' }, { color: colors.text }]}>
                      {entry.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    );
  }, [colors.border, colors.primary, colors.text, colors.textSecondary, isCompact, isDark]);

  if (loading || !roleResolved || initializingUsers) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <LoadingState message={initializingUsers ? "Loading users..." : "Checking admin access..."} />
      </View>
    );
  }

  if (!session || isGuest || !isAdmin) {
    return null;
  }

  return (
    <View
      testID="admin-users-page"
      accessibilityLabel="admin-users-page"
      style={[styles.flex1, { backgroundColor: colors.background }]}
    >
      <Header title="Users" hideBackButton />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPadding }]}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >

        <View style={styles.sectionGap}>
          <TextInput
            testID="admin-users-search-input"
            accessibilityLabel="admin-users-search-input"
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search users"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.searchInput,
              {
                color: colors.text,
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
              },
            ]}
          />

          <AdminFilterBar
            filters={[
              {
                key: 'role',
                label: 'Role',
                type: 'single-select',
                emptyValue: 'all',
                emptyLabel: 'All users',
                testID: 'admin-users-filter',
                options: userFilters.map((filter) => ({
                  ...filter,
                  testID: `admin-users-filter-${filter.value}`,
                })),
              },
            ]}
            values={{ role: userFilter }}
            onChange={(key, value) => {
              if (key === 'role' && !Array.isArray(value)) setUserFilter(value as UserFilter);
            }}
          />

          <View style={styles.inlineActionsRow}>
            <TouchableOpacity
              testID="admin-users-add-button"
              accessibilityLabel="admin-users-add-button"
              activeOpacity={1}
              onPress={openCreateUserModal}
              style={[styles.primaryActionButton, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>Add User</Text>
            </TouchableOpacity>
          </View>

          {usersLoading ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : filteredUsers.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No users found.</Text>
          ) : (
            <View style={styles.sectionGap}>
              {filteredUsers.map((user) => {
                const userViewLoadingKey = `user-card-${user.id}`;
                const userEditLoading = userEditLoadingId === user.id;
                const activeBan = getActiveUserBan(user);
                const banLabel = activeBan
                  ? `Banned: ${formatBanTimeRemaining(activeBan.bannedUntil, activeBan.permanent)}`
                  : user.is_banned
                    ? 'Ban expired'
                    : 'Active';

                return (
                  <View
                    key={user.id}
                    testID={`admin-user-card-${user.id}`}
                    accessibilityLabel={`admin-user-card-${user.id}`}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{user.full_name || 'Unknown'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{user.email}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Role: {user.role}</Text>
                    {user.staff_assignment_label ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Staff Access: {user.staff_assignment_label}</Text>
                    ) : null}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Verified: {user.is_verified ? 'Yes' : 'No'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Verification Status: {String(user.verification_status || 'PENDING').replace(/_/g, ' ')}</Text>
                    <Text style={[styles.cardMeta, { color: activeBan ? '#DC2626' : colors.textSecondary }]}>
                      Account Status: {banLabel}
                      {activeBan?.bannedUntil ? ` until ${formatDateTime(activeBan.bannedUntil)}` : ''}
                    </Text>
                    {activeBan?.reason ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Ban Reason: {activeBan.reason}</Text>
                    ) : null}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Joined: {formatDateTime(user.created_at)}</Text>

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        testID={`admin-user-view-${user.id}`}
                        accessibilityLabel={`admin-user-view-${user.id}`}
                        activeOpacity={1}
                        disabled={userDetailsLoadingKey === userViewLoadingKey}
                        onPress={() => void openUserDetailsModal(user, userViewLoadingKey)}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        {userDetailsLoadingKey === userViewLoadingKey ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="eye-outline" size={14} color={colors.text} />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>View</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID={`admin-user-edit-${user.id}`}
                        accessibilityLabel={`admin-user-edit-${user.id}`}
                        activeOpacity={1}
                        disabled={userEditLoading}
                        onPress={() => void openEditUserModal(user)}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        {userEditLoading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="create-outline" size={14} color={colors.text} />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>Edit</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {activeBan || user.is_banned ? (
                        <TouchableOpacity
                          testID={`admin-user-unban-${user.id}`}
                          accessibilityLabel={`admin-user-unban-${user.id}`}
                          activeOpacity={1}
                          disabled={userActionLoadingId === user.id}
                          onPress={() => unbanUser(user)}
                          style={[
                            styles.smallActionButtonFilled,
                            {
                              backgroundColor: '#16A34A',
                              opacity: userActionLoadingId === user.id ? 0.6 : 1,
                            },
                          ]}
                        >
                          {userActionLoadingId === user.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.smallActionTextFilled}>Unban</Text>
                          )}
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        testID={`admin-user-delete-${user.id}`}
                        accessibilityLabel={`admin-user-delete-${user.id}`}
                        activeOpacity={1}
                        disabled={userActionLoadingId === user.id || user.id === session.user.id}
                        onPress={() => deleteUser(user)}
                        style={[
                          styles.smallActionButtonFilled,
                          {
                            backgroundColor: '#DC2626',
                            opacity: userActionLoadingId === user.id || user.id === session.user.id ? 0.6 : 1,
                          },
                        ]}
                      >
                        {userActionLoadingId === user.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.smallActionTextFilled}>
                            {user.id === session.user.id ? 'Current Admin' : 'Delete'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={userModalVisible} transparent animationType="fade" onRequestClose={closeUserModal}>
        <View style={[styles.modalBackdrop, { padding: isCompact ? 8 : 20 }]}>
          <View
            testID="admin-user-form-modal"
            accessibilityLabel="admin-user-form-modal"
            style={[styles.modalCard, { maxHeight: Math.max(180, height - (isCompact ? 16 : 40)), ...(isCompact ? { padding: 14 } : {}) }, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {userModalMode === 'create' ? 'Create User' : 'Edit User'}
            </Text>

            <ScrollView
              style={[styles.userFormScroll, { flexShrink: 1 }]}
              contentContainerStyle={styles.userFormScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.formSection, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                <View style={styles.formSectionHeader}>
                  <View style={[styles.formSectionIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name="person-outline" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.formSectionTitle, { color: colors.text }]}>Account</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Full name <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <TextInput
                    testID="admin-user-full-name-input"
                    accessibilityLabel="admin-user-full-name-input"
                    value={userFormFullName}
                    onChangeText={setUserFormFullName}
                    placeholder="Full name"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      userFormSubmitAttempted && userFormErrors.fullName ? styles.inputInvalid : null,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: userFormSubmitAttempted && userFormErrors.fullName ? '#EF4444' : colors.inputBorder,
                      },
                    ]}
                  />
                  {userFormSubmitAttempted && userFormErrors.fullName ? (
                    <Text style={styles.fieldErrorText}>{userFormErrors.fullName}</Text>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Email address <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <TextInput
                    testID="admin-user-email-input"
                    accessibilityLabel="admin-user-email-input"
                    value={userFormEmail}
                    onChangeText={setUserFormEmail}
                    placeholder="Email address"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      userFormSubmitAttempted && userFormErrors.email ? styles.inputInvalid : null,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: userFormSubmitAttempted && userFormErrors.email ? '#EF4444' : colors.inputBorder,
                      },
                    ]}
                  />
                  {userFormSubmitAttempted && userFormErrors.email ? (
                    <Text style={styles.fieldErrorText}>{userFormErrors.email}</Text>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    {userModalMode === 'create' ? 'Register as' : 'Role'}
                  </Text>
                  <View style={styles.roleSelectorGrid}>
                    {userRoleOptions.map((role) => {
                      const active = userFormRole === role;
                      return (
                        <TouchableOpacity
                          key={role}
                          testID={`admin-user-role-${role}`}
                          accessibilityLabel={`admin-user-role-${role}`}
                          activeOpacity={1}
                          onPress={() => {
                            setUserFormRole(role);
                            if (role !== 'staff') setStaffFormAssignments(createEmptyStaffFormAssignments());
                          }}
                          style={[
                            styles.filterChip,
                            {
                              backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                            {formatRoleLabel(role)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {userFormRole === 'staff' ? (
                  <View style={[styles.staffAccessPanel, { borderColor: colors.border, backgroundColor: isDark ? '#111827' : '#FFFFFF' }]}>
                    <View style={styles.formSectionHeader}>
                      <View style={[styles.formSectionIcon, { backgroundColor: `${colors.primary}18` }]}>
                        <Ionicons name="key-outline" size={16} color={colors.primary} />
                      </View>
                      <Text style={[styles.formSectionTitle, { color: colors.text }]}>Staff Access</Text>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Assign to</Text>
                      <View style={styles.roleSelectorGrid}>
                        {staffEntityOptions.map((entityType) => {
                          const active = staffFormEntityType === entityType;
                          return (
                            <TouchableOpacity
                              key={entityType}
                              testID={`admin-user-staff-entity-${entityType}`}
                              accessibilityLabel={`admin-user-staff-entity-${entityType}`}
                              activeOpacity={1}
                              onPress={() => setStaffFormEntityType(entityType)}
                              style={[
                                styles.filterChip,
                                {
                                  backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                                  borderColor: active ? colors.primary : colors.border,
                                },
                              ]}
                            >
                              <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                                {STAFF_ENTITY_LABELS[entityType]}
                                {Object.keys(staffFormAssignments[entityType]).length > 0
                                  ? ` (${Object.keys(staffFormAssignments[entityType]).length})`
                                  : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Allowed actions</Text>
                      <View style={styles.staffPermissionList}>
                        {staffPermissionOptions.map((permission) => {
                          const staffFormAccessLevel = staffFormAccessLevels[staffFormEntityType];
                          const listingPermissions = staffFormListingPermissions[staffFormEntityType];
                          const checked = permission.key === 'view'
                            || (permission.key === 'manage' && staffFormAccessLevel <= 2)
                            || (permission.key === 'edit' && listingPermissions.edit)
                            || (permission.key === 'add' && listingPermissions.add)
                            || (permission.key === 'delete' && listingPermissions.delete);
                          const isRequired = permission.key === 'view';
                          return (
                            <TouchableOpacity
                              key={permission.key}
                              testID={`admin-user-staff-permission-${permission.key}`}
                              accessibilityLabel={`admin-user-staff-permission-${permission.key}`}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked, disabled: isRequired }}
                              activeOpacity={1}
                              disabled={isRequired}
                              onPress={() => {
                                if (permission.key === 'manage') {
                                  const nextLevel: StaffAccessLevel = staffFormAccessLevel <= 2 ? 3 : 2;
                                  setStaffFormAccessLevels((current) => ({ ...current, [staffFormEntityType]: nextLevel }));
                                  setStaffFormAssignments((current) => ({
                                    ...current,
                                    [staffFormEntityType]: Object.fromEntries(
                                      Object.keys(current[staffFormEntityType]).map((id) => [id, nextLevel]),
                                    ),
                                  }));
                                  return;
                                }
                                if (permission.key === 'edit' || permission.key === 'add' || permission.key === 'delete') {
                                  setStaffFormListingPermissions((current) => ({
                                    ...current,
                                    [staffFormEntityType]: {
                                      ...current[staffFormEntityType],
                                      [permission.key]: !current[staffFormEntityType][permission.key],
                                    },
                                  }));
                                }
                              }}
                              style={[
                                styles.staffPermissionRow,
                                {
                                  backgroundColor: checked ? `${colors.primary}12` : (isDark ? '#1E293B' : '#FFFFFF'),
                                  borderColor: checked ? colors.primary : colors.border,
                                },
                              ]}
                            >
                              <Ionicons
                                name={checked ? 'checkbox' : 'square-outline'}
                                size={22}
                                color={checked ? colors.primary : colors.textSecondary}
                              />
                              <View style={styles.staffPermissionCopy}>
                                <Text style={[styles.staffPermissionTitle, { color: colors.text }]}>{permission.title}</Text>
                                <Text style={[styles.staffLevelText, { color: colors.textSecondary }]}>{permission.description}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        testID="admin-user-staff-permission-marketplace"
                        accessibilityLabel="Manage marketplace"
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: staffFormMarketplaceAccess }}
                        activeOpacity={1}
                        onPress={() => setStaffFormMarketplaceAccess((current) => !current)}
                        style={[
                          styles.staffPermissionRow,
                          {
                            backgroundColor: staffFormMarketplaceAccess ? `${colors.primary}12` : (isDark ? '#1E293B' : '#FFFFFF'),
                            borderColor: staffFormMarketplaceAccess ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name={staffFormMarketplaceAccess ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={staffFormMarketplaceAccess ? colors.primary : colors.textSecondary}
                        />
                        <View style={styles.staffPermissionCopy}>
                          <Text style={[styles.staffPermissionTitle, { color: colors.text }]}>Manage marketplace</Text>
                          <Text style={[styles.staffLevelText, { color: colors.textSecondary }]}>Create, edit, publish, and remove the owner&apos;s products, and manage their sales and fulfillment.</Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                        {STAFF_ENTITY_LABELS[staffFormEntityType]} <Text style={styles.requiredMark}>*</Text>
                      </Text>
                      <Text style={[styles.staffLevelText, { color: colors.textSecondary }]}>
                        Only active records are shown. Listings this user owns are hidden, and participation conflicts must be resolved before assignment.
                      </Text>
                      {staffTargetsLoading ? (
                        <View style={styles.inlineLoader}>
                          <ActivityIndicator size="small" color={colors.primary} />
                        </View>
                      ) : staffTargetsError ? (
                        <View style={styles.staffTargetsError}>
                          <Text style={styles.fieldErrorText}>{staffTargetsError}</Text>
                          <TouchableOpacity onPress={() => void fetchStaffTargetOptions()} activeOpacity={0.8}>
                            <Text style={[styles.staffTargetsRetryText, { color: colors.primary }]}>Try again</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.staffConflictList}>
                          {hiddenOwnedTargetIds.length > 0 ? (
                            <View style={[styles.staffTargetNotice, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                              <Text style={[styles.staffTargetTitle, { color: colors.text }]}>Owner listing hidden</Text>
                              <Text style={[styles.staffTargetMeta, { color: colors.textSecondary }]}>
                                {hiddenOwnedTargetIds.length} {hiddenOwnedTargetIds.length === 1 ? 'listing is' : 'listings are'} hidden because this user owns {hiddenOwnedTargetIds.length === 1 ? 'it' : 'them'}. Transfer ownership before assigning staff access.
                              </Text>
                            </View>
                          ) : null}

                          {staffTargetConflicts
                            .filter((conflict) => conflict.entityType === staffFormEntityType)
                            .map((conflict) => {
                              const resolving = staffConflictResolvingId === conflict.id;
                              return (
                                <View
                                  key={`conflict-${conflict.id}`}
                                  style={[styles.staffConflictCard, { borderColor: '#F59E0B', backgroundColor: isDark ? '#2B2112' : '#FFFBEB' }]}
                                >
                                  <View style={styles.staffTargetSelectionRow}>
                                    <Ionicons name="warning-outline" size={19} color="#D97706" />
                                    <Text style={[styles.staffTargetTitle, { color: colors.text }]} numberOfLines={1}>{conflict.name}</Text>
                                  </View>
                                  <Text style={[styles.staffTargetMeta, { color: colors.textSecondary }]}>{conflict.reason}</Text>
                                  <Text style={[styles.staffTargetMeta, { color: colors.textSecondary }]}>{conflict.resolution}</Text>
                                  {conflict.canAutoResolve ? (
                                    <TouchableOpacity
                                      testID={`admin-user-resolve-staff-conflict-${conflict.id}`}
                                      accessibilityLabel={`Resolve staff conflict for ${conflict.name}`}
                                      accessibilityRole="button"
                                      activeOpacity={0.8}
                                      disabled={Boolean(staffConflictResolvingId)}
                                      onPress={() => resolveStaffTargetConflict(conflict)}
                                      style={[
                                        styles.staffConflictAction,
                                        { backgroundColor: colors.primary, opacity: staffConflictResolvingId && !resolving ? 0.55 : 1 },
                                      ]}
                                    >
                                      {resolving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="build-outline" size={15} color="#FFFFFF" />}
                                      <Text style={styles.staffConflictActionText}>{resolving ? 'Resolving...' : 'Resolve conflict'}</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              );
                            })}

                          {staffTargetOptions.length === 0 ? (
                            <Text style={[styles.detailsEmptyText, { color: colors.textSecondary }]}>
                              No eligible {STAFF_ENTITY_LABELS[staffFormEntityType].toLowerCase()} records found.
                            </Text>
                          ) : (
                            <ScrollView
                              nestedScrollEnabled
                              style={styles.staffTargetList}
                              contentContainerStyle={styles.staffTargetListContent}
                              showsVerticalScrollIndicator={false}
                            >
                              {Object.keys(staffFormAssignments[staffFormEntityType])
                                .filter((id) => (
                                  !staffTargetOptions.some((item) => item.id === id)
                                  && !staffTargetConflicts.some((item) => item.id === id && item.entityType === staffFormEntityType)
                                  && !hiddenOwnedTargetIds.includes(id)
                                ))
                                .map((id) => (
                                  <TouchableOpacity
                                    key={id}
                                    activeOpacity={1}
                                    onPress={() => setStaffFormAssignments((current) => {
                                      const nextForType = { ...current[staffFormEntityType] };
                                      delete nextForType[id];
                                      return { ...current, [staffFormEntityType]: nextForType };
                                    })}
                                    style={[styles.staffTargetOption, { borderColor: colors.primary, backgroundColor: `${colors.primary}14` }]}
                                  >
                                    <Text style={[styles.staffTargetTitle, { color: colors.text }]}>Current assignment</Text>
                                    <Text style={[styles.staffTargetMeta, { color: colors.textSecondary }]}>{id}</Text>
                                  </TouchableOpacity>
                                ))}
                              {staffTargetOptions.map((option) => {
                                const active = Boolean(staffFormAssignments[staffFormEntityType][option.id]);
                                return (
                                  <TouchableOpacity
                                    key={option.id}
                                    testID={`admin-user-staff-target-${option.id}`}
                                    accessibilityLabel={`admin-user-staff-target-${option.id}`}
                                    activeOpacity={1}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: active }}
                                    onPress={() => setStaffFormAssignments((current) => {
                                      const nextForType = { ...current[staffFormEntityType] };
                                      if (nextForType[option.id]) {
                                        delete nextForType[option.id];
                                      } else {
                                        nextForType[option.id] = staffFormAccessLevels[staffFormEntityType];
                                      }
                                      return { ...current, [staffFormEntityType]: nextForType };
                                    })}
                                    style={[
                                      styles.staffTargetOption,
                                      {
                                        borderColor: active ? colors.primary : colors.border,
                                        backgroundColor: active ? `${colors.primary}14` : (isDark ? '#0F172A' : '#F8FAFC'),
                                      },
                                    ]}
                                  >
                                    <View style={styles.staffTargetSelectionRow}>
                                      <Ionicons name={active ? 'checkbox' : 'square-outline'} size={20} color={active ? colors.primary : colors.textSecondary} />
                                      <Text style={[styles.staffTargetTitle, { color: colors.text }]} numberOfLines={1}>{option.name}</Text>
                                    </View>
                                    {option.meta ? (
                                      <Text style={[styles.staffTargetMeta, { color: colors.textSecondary }]}>{option.meta}</Text>
                                    ) : null}
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          )}
                        </View>
                      )}
                      {userFormSubmitAttempted && userFormErrors.staffTarget ? (
                        <Text style={styles.fieldErrorText}>{userFormErrors.staffTarget}</Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {userModalMode === 'edit' && editingOriginalRole && ownershipRoleConfig[editingOriginalRole] && userFormRole !== editingOriginalRole ? (
                  <View style={[styles.staffAccessPanel, { borderColor: isDark ? '#78350F' : '#FDE68A', backgroundColor: isDark ? '#2B2112' : '#FFFBEB', gap: 16 }]}>
                    <View style={{ gap: 8 }}>
                      <View style={styles.formSectionHeader}>
                        <View style={[styles.formSectionIcon, { backgroundColor: '#F59E0B20' }]}>
                          <Ionicons name="swap-horizontal-outline" size={16} color="#D97706" />
                        </View>
                        <Text style={[styles.formSectionTitle, { color: colors.text }]}>Reassign owned {ownershipRoleConfig[editingOriginalRole]?.plural}</Text>
                      </View>
                      <Text style={[styles.staffLevelText, { color: colors.textSecondary }]}>
                        Choose a new {formatRoleLabel(editingOriginalRole)} for each owned listing before changing this account to {formatRoleLabel(userFormRole)}.
                      </Text>
                    </View>

                    {ownershipOptionsLoading ? (
                      <View style={styles.inlineLoader}><ActivityIndicator size="small" color={colors.primary} /></View>
                    ) : ownershipOptionsError ? (
                      <View style={styles.staffTargetsError}>
                        <Text style={styles.fieldErrorText}>{ownershipOptionsError}</Text>
                        <TouchableOpacity onPress={() => void fetchOwnershipReassignmentOptions()} activeOpacity={0.8}>
                          <Text style={[styles.staffTargetsRetryText, { color: colors.primary }]}>Try again</Text>
                        </TouchableOpacity>
                      </View>
                    ) : ownedRoleListings.length === 0 ? (
                      <Text style={[styles.detailsEmptyText, { color: colors.textSecondary }]}>No owned listings need to be reassigned.</Text>
                    ) : ownershipCandidates.length === 0 ? (
                      <Text style={styles.fieldErrorText}>
                        No other verified {formatRoleLabel(editingOriginalRole)} account is available. Create or verify a replacement owner first.
                      </Text>
                    ) : (
                      <View style={styles.staffConflictList}>
                        {ownedRoleListings.map((item) => (
                          <View key={item.id} style={{ borderWidth: 1, borderRadius: 12, padding: 14, gap: 12, borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }}>
                            <Text style={[styles.staffTargetTitle, { color: colors.text, fontSize: 14, fontFamily: 'Poppins_700Bold' }]}>{item.name}</Text>
                            <View style={{ gap: 6 }}>
                              <Text style={[styles.fieldLabel, { color: colors.textSecondary, fontSize: 11 }]}>New owner</Text>
                              <View style={{ borderWidth: 1, borderRadius: 10, borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#1E293B' : '#F1F5F9', overflow: 'hidden' }}>
                                <Picker
                                  selectedValue={ownershipReassignments[item.id] || ''}
                                  onValueChange={(value) => setOwnershipReassignments((current) => ({ ...current, [item.id]: String(value || '') }))}
                                  style={{ color: colors.text, backgroundColor: 'transparent', height: 44, paddingHorizontal: 12, borderWidth: 0 }}
                                >
                                  <Picker.Item label="Select a replacement owner" value="" color={isDark ? '#94A3B8' : '#64748B'} />
                                  {ownershipCandidates.map((candidate) => (
                                    <Picker.Item
                                      key={candidate.id}
                                      label={`${candidate.fullName}${candidate.email ? ` (${candidate.email})` : ''}`}
                                      value={candidate.id}
                                    />
                                  ))}
                                </Picker>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    {userFormSubmitAttempted && userFormErrors.ownershipReassignment ? (
                      <Text style={styles.fieldErrorText}>{userFormErrors.ownershipReassignment}</Text>
                    ) : null}
                  </View>
                ) : null}

              </View>

              <View style={[styles.formSection, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                <View style={styles.formSectionHeader}>
                  <View style={[styles.formSectionIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name="musical-notes-outline" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.formSectionTitle, { color: colors.text }]}>Profile Details</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Contact number</Text>
                  <TextInput
                    testID="admin-user-contact-input"
                    accessibilityLabel="admin-user-contact-input"
                    value={userFormContactNumber}
                    onChangeText={setUserFormContactNumber}
                    placeholder="Contact number"
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Address</Text>
                  <TextInput
                    testID="admin-user-address-input"
                    accessibilityLabel="admin-user-address-input"
                    value={userFormAddress}
                    onChangeText={setUserFormAddress}
                    placeholder="Address"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Roles & instruments</Text>
                  <TextInput
                    testID="admin-user-skills-input"
                    accessibilityLabel="admin-user-skills-input"
                    value={userFormSkills}
                    onChangeText={setUserFormSkills}
                    placeholder="Vocalist, Guitarist, Producer"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Genres</Text>
                  <TextInput
                    testID="admin-user-genres-input"
                    accessibilityLabel="admin-user-genres-input"
                    value={userFormGenres}
                    onChangeText={setUserFormGenres}
                    placeholder="OPM, Rock, Jazz"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
                  <TextInput
                    testID="admin-user-bio-input"
                    accessibilityLabel="admin-user-bio-input"
                    value={userFormBio}
                    onChangeText={setUserFormBio}
                    placeholder="Short profile bio"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputMultiline,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                <View style={styles.formSectionHeader}>
                  <View style={[styles.formSectionIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.formSectionTitle, { color: colors.text }]}>Security</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    {userModalMode === 'create' ? 'Password' : 'New password'}
                    {userModalMode === 'create' ? <Text style={styles.requiredMark}> *</Text> : null}
                  </Text>
                  <TextInput
                    testID="admin-user-password-input"
                    accessibilityLabel="admin-user-password-input"
                    value={userFormPassword}
                    onChangeText={setUserFormPassword}
                    placeholder={userModalMode === 'create' ? 'Password' : 'New password'}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      userFormSubmitAttempted && userFormErrors.password ? styles.inputInvalid : null,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: userFormSubmitAttempted && userFormErrors.password ? '#EF4444' : colors.inputBorder,
                      },
                    ]}
                  />
                  {userFormSubmitAttempted && userFormErrors.password ? (
                    <Text style={styles.fieldErrorText}>{userFormErrors.password}</Text>
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    {userModalMode === 'create' ? 'Confirm password' : 'Confirm new password'}
                    {userModalMode === 'create' ? <Text style={styles.requiredMark}> *</Text> : null}
                  </Text>
                  <TextInput
                    testID="admin-user-confirm-password-input"
                    accessibilityLabel="admin-user-confirm-password-input"
                    value={userFormConfirmPassword}
                    onChangeText={setUserFormConfirmPassword}
                    placeholder={userModalMode === 'create' ? 'Confirm password' : 'Confirm new password'}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholderTextColor={colors.textSecondary}
                    style={[
                      styles.modalInputCompact,
                      userFormSubmitAttempted && userFormErrors.confirmPassword ? styles.inputInvalid : null,
                      {
                        color: colors.text,
                        backgroundColor: colors.inputBackground,
                        borderColor: userFormSubmitAttempted && userFormErrors.confirmPassword ? '#EF4444' : colors.inputBorder,
                      },
                    ]}
                  />
                  {userFormSubmitAttempted && userFormErrors.confirmPassword ? (
                    <Text style={styles.fieldErrorText}>{userFormErrors.confirmPassword}</Text>
                  ) : null}
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                <View style={styles.formSectionHeader}>
                  <View style={[styles.formSectionIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.formSectionTitle, { color: colors.text }]}>Verification</Text>
                </View>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Verified</Text>
                <View style={styles.booleanToggleRow}>
                  <TouchableOpacity
                    testID="admin-user-verified-yes"
                    accessibilityLabel="admin-user-verified-yes"
                    activeOpacity={1}
                    onPress={() => setUserFormIsVerified(true)}
                    style={[
                      styles.booleanToggleButton,
                      {
                        backgroundColor: userFormIsVerified ? '#16A34A' : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: userFormIsVerified ? '#16A34A' : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.booleanToggleButtonText, { color: userFormIsVerified ? '#FFFFFF' : colors.textSecondary }]}>Yes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="admin-user-verified-no"
                    accessibilityLabel="admin-user-verified-no"
                    activeOpacity={1}
                    onPress={() => setUserFormIsVerified(false)}
                    style={[
                      styles.booleanToggleButton,
                      {
                        backgroundColor: !userFormIsVerified ? '#DC2626' : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: !userFormIsVerified ? '#DC2626' : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.booleanToggleButtonText, { color: !userFormIsVerified ? '#FFFFFF' : colors.textSecondary }]}>No</Text>
                  </TouchableOpacity>
                </View>

                {userModalMode === 'create' && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email confirmed</Text>
                <View style={styles.booleanToggleRow}>
                  <TouchableOpacity
                    testID="admin-user-email-confirmed-yes"
                    accessibilityLabel="admin-user-email-confirmed-yes"
                    activeOpacity={1}
                    onPress={() => setUserFormEmailConfirmed(true)}
                    style={[
                      styles.booleanToggleButton,
                      {
                        backgroundColor: userFormEmailConfirmed ? '#16A34A' : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: userFormEmailConfirmed ? '#16A34A' : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.booleanToggleButtonText, { color: userFormEmailConfirmed ? '#FFFFFF' : colors.textSecondary }]}>Yes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="admin-user-email-confirmed-no"
                    accessibilityLabel="admin-user-email-confirmed-no"
                    activeOpacity={1}
                    onPress={() => setUserFormEmailConfirmed(false)}
                    style={[
                      styles.booleanToggleButton,
                      {
                        backgroundColor: !userFormEmailConfirmed ? '#DC2626' : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: !userFormEmailConfirmed ? '#DC2626' : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.booleanToggleButtonText, { color: !userFormEmailConfirmed ? '#FFFFFF' : colors.textSecondary }]}>No</Text>
                  </TouchableOpacity>
                </View>
                  </>
                )}
              </View>
            </ScrollView>

            <View style={[styles.modalActionsRow, isCompact && { flexDirection: 'column' }]}>
              <TouchableOpacity
                testID="admin-user-form-cancel"
                accessibilityLabel="admin-user-form-cancel"
                activeOpacity={1}
                onPress={closeUserModal}
                disabled={userFormSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="admin-user-form-submit"
                accessibilityLabel="admin-user-form-submit"
                activeOpacity={1}
                onPress={() => void submitUserForm()}
                disabled={userFormSubmitting}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: userFormSubmitting ? 0.6 : 1,
                  },
                ]}
              >
                {userFormSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>{userModalMode === 'create' ? 'Create User' : 'Save Changes'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!userDetailsTarget} transparent animationType="fade" onRequestClose={closeUserDetailsModal}>
        <View style={[styles.modalBackdrop, { padding: isCompact ? 8 : 20 }]}>
          <View
            testID="admin-user-details-modal"
            accessibilityLabel="admin-user-details-modal"
            style={[styles.modalCardLarge, { maxHeight: Math.max(180, height - (isCompact ? 16 : 40)), ...(isCompact ? { padding: 14 } : {}) }, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.detailsModalHeader}>
              <View style={[styles.detailsModalIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.detailsModalCopy}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>User Summary</Text>
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                  A clean account overview for admin review.
                </Text>
              </View>
            </View>

            <ScrollView
              style={[styles.detailsScroll, { flexShrink: 1 }]}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailsSection('Account', userDetailsTarget?.profile || null, 'Account details are unavailable.')}
            </ScrollView>

            <View style={[styles.modalActionsRow, isCompact && { flexDirection: 'column' }]}>
              <TouchableOpacity
                testID="admin-user-details-close"
                accessibilityLabel="admin-user-details-close"
                activeOpacity={1}
                onPress={closeUserDetailsModal}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertState.visible}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

