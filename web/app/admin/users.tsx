
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import Header from '../../src/components/header';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getAdminPageCacheKey, invalidateAdminPageCache, readAdminPageCache, writeAdminPageCache } from './_cache';
import { getFriendlyDetailEntries, getFriendlyDetailImage } from './_formatters';
import {
  STAFF_ACCESS_LEVEL_LABELS,
  STAFF_ENTITY_LABELS,
  StaffAccessLevel,
  StaffAssignment,
  StaffEntityType,
  normalizeStaffAccessLevel,
  normalizeStaffEntityType,
} from '../../src/utils/staffAccess';

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

type Tab = 'dashboard' | 'users' | 'reports' | 'audit' | 'posts' | 'products';

type UserRole = 'fan' | 'musician' | 'studio-owner' | 'venue-owner' | 'producer' | 'admin' | 'staff';

type UserFilter = 'all' | 'fan' | 'musicians' | 'studio-owner' | 'venue-owner' | 'producer' | 'staff';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  posts: '/admin/posts',
  products: '/admin/products',
};

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
  staff_assignment_label?: string | null;
  staff_access_level_label?: string | null;
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

const userRoleOptions: UserRole[] = ['fan', 'musician', 'studio-owner', 'venue-owner', 'producer', 'admin', 'staff'];
const staffEntityOptions: StaffEntityType[] = ['studio', 'venue', 'production'];
const staffAccessLevelOptions: StaffAccessLevel[] = [1, 2, 3];

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
  { value: 'all', label: 'all' },
  { value: 'fan', label: 'fans' },
  { value: 'musicians', label: 'musicians' },
  { value: 'studio-owner', label: 'studio owner' },
  { value: 'venue-owner', label: 'gig owner' },
  { value: 'producer', label: 'producer' },
  { value: 'staff', label: 'staff' },
];

const USER_MANAGEMENT_HIDDEN_VERIFICATION_STATUSES = new Set(['DECLINED', 'PENDING_REVIEW']);

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

  const status = Number(err.status || 0);
  if (status && !baseMessage.toLowerCase().includes('status')) {
    return `${baseMessage} (status ${status})`;
  }

  return baseMessage;
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

const isVisibleInUserManagement = (user: UserEntry) => {
  const verificationStatus = String(user.verification_status || '').trim().toUpperCase();
  return !USER_MANAGEMENT_HIDDEN_VERIFICATION_STATUSES.has(verificationStatus);
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
    target_id: targetId || null,
    target_name: getOptionalStringField(assignment, 'target_name'),
  };
};

const normalizeUserEntryFromDetails = (
  record: Record<string, unknown>,
  fallback: UserEntry,
): UserEntry => {
  const staffAssignment = normalizeStaffAssignmentFromRecord(record) || fallback.staff_assignment || null;

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
    staff_assignment_label: getOptionalStringField(record, 'staff_assignment_label', fallback.staff_assignment_label),
    staff_access_level_label: getOptionalStringField(record, 'staff_access_level_label', fallback.staff_access_level_label),
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
  staffLevelGrid: {
    gap: 10,
  },
  staffLevelButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 4,
  },
  staffLevelTitle: {
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
  staffTargetTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  staffTargetMeta: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  modalActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
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
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  smallActionButtonFilled: {
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
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    position: 'relative',
  },
  tabsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'capitalize',
  },
  userFormScroll: {
    maxHeight: 680,
  },
  userFormScrollContent: {
    gap: 14,
    paddingBottom: 8,
  },
});

const tabItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
];

export default function AdminUsersPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();
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
  const [staffFormAccessLevel, setStaffFormAccessLevel] = useState<StaffAccessLevel>(1);
  const [staffFormTargetId, setStaffFormTargetId] = useState('');
  const [staffTargetOptions, setStaffTargetOptions] = useState<StaffTargetOption[]>([]);
  const [staffTargetsLoading, setStaffTargetsLoading] = useState(false);
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

  const showInlineTabNav = !(Platform.OS === 'web' && width >= 768);

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

    if (userFormRole === 'staff' && !staffFormTargetId) {
      errors.staffTarget = 'Select the studio, gig, or production team this staff member can access.';
    }

    return errors;
  }, [
    userFormEmail,
    userFormFullName,
    userFormPassword,
    userFormConfirmPassword,
    userFormRole,
    staffFormTargetId,
    userModalMode,
  ]);

  const userFormHasErrors = Object.keys(userFormErrors).length > 0;

  const showAlert = useCallback((type: AlertType, title: string, message: string) => {
    setAlertState({ visible: true, type, title, message, buttons: undefined });
  }, []);

  const usersCacheKey = useMemo(() => getAdminPageCacheKey('users'), []);

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'users') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

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

  const fetchStaffTargetOptions = useCallback(async () => {
    if (userFormRole !== 'staff') {
      setStaffTargetOptions([]);
      return;
    }

    setStaffTargetsLoading(true);
    try {
      const table =
        staffFormEntityType === 'studio'
          ? 'studios'
          : staffFormEntityType === 'venue'
            ? 'gigs'
            : 'production_teams';

      const { data, error } = await supabase
        .from(table)
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const options = (data || [])
        .map((item: any) => ({
          id: String(item?.id || ''),
          name: String(item?.name || 'Untitled'),
          meta: item?.created_at ? `Created ${formatDateTime(item.created_at)}` : null,
        }))
        .filter((item) => item.id.length > 0);

      setStaffTargetOptions(options);
    } catch (error) {
      console.warn('Failed to load staff target options', error);
      setStaffTargetOptions([]);
    } finally {
      setStaffTargetsLoading(false);
    }
  }, [staffFormEntityType, userFormRole]);

  useEffect(() => {
    if (!userModalVisible || userFormRole !== 'staff') {
      setStaffTargetOptions([]);
      setStaffTargetsLoading(false);
      return;
    }

    void fetchStaffTargetOptions();
  }, [fetchStaffTargetOptions, userFormRole, userModalVisible]);

  const fetchUsers = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setUsersLoading(true);
    }

    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_users',
        limit: 300,
      });

      const items = Array.isArray(data?.items)
        ? data.items.filter(isVisibleInUserManagement)
        : [];
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
    setStaffFormAccessLevel(1);
    setStaffFormTargetId('');
    setStaffTargetOptions([]);
    setStaffTargetsLoading(false);
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
    const staffAssignment = targetUser.staff_assignment || null;
    const staffEntityType = normalizeStaffEntityType(staffAssignment?.entity_type) || 'studio';
    const staffAccessLevel = normalizeStaffAccessLevel(staffAssignment?.access_level) || 1;
    setStaffFormEntityType(staffEntityType);
    setStaffFormAccessLevel(staffAccessLevel);
    setStaffFormTargetId(
      staffEntityType === 'studio'
        ? staffAssignment?.studio_id || staffAssignment?.target_id || ''
        : staffEntityType === 'venue'
          ? staffAssignment?.gig_id || staffAssignment?.target_id || ''
          : staffAssignment?.production_team_id || staffAssignment?.target_id || '',
    );
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
    const staffAssignmentPayload = userFormRole === 'staff'
      ? {
        entity_type: staffFormEntityType,
        access_level: staffFormAccessLevel,
        target_id: staffFormTargetId,
        studio_id: staffFormEntityType === 'studio' ? staffFormTargetId : null,
        gig_id: staffFormEntityType === 'venue' ? staffFormTargetId : null,
        production_team_id: staffFormEntityType === 'production' ? staffFormTargetId : null,
      }
      : null;
    const shouldSendStaffAssignment = userFormRole === 'staff' || staffFormTargetId.length > 0;

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
          ...(staffAssignmentPayload ? { staffAssignment: staffAssignmentPayload } : {}),
        });

        showAlert('success', 'User created', `${fullName} was created as ${formatRoleLabel(userFormRole)}.`);
      } else {
        if (!editingUserId) {
          throw new Error('Missing user id for update.');
        }

        await invokeAdminUsersManagement({
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
          ...(shouldSendStaffAssignment ? { staffAssignment: staffAssignmentPayload } : {}),
          ...(nextPassword ? { password: nextPassword } : {}),
        });

        showAlert('success', 'User updated', `${fullName}'s account and profile details were saved.`);
      }

      invalidateAdminPageCache();
      setUserModalVisible(false);
      setEditingUserId(null);
      resetUserForm();
      await fetchUsers();
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to save user changes.');
      showAlert('error', 'Failed to save user', message);
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
    staffFormEntityType,
    staffFormAccessLevel,
    staffFormTargetId,
    userFormIsVerified,
    userFormEmailConfirmed,
    editingUserId,
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
      if (!isVisibleInUserManagement(item)) return false;

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
                      styles.detailRow,
                      {
                        backgroundColor: isDark ? '#111827' : '#F8FAFC',
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{entry.label}</Text>
                    <Text selectable style={[styles.detailValue, { color: colors.text }]}>
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
  }, [colors.border, colors.primary, colors.text, colors.textSecondary, isDark]);

  if (loading || !roleResolved || initializingUsers) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading users...</Text>
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
      <Header title="Admin" hideBackButton />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {showInlineTabNav && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {tabItems.map((item) => {
              const active = item.key === 'users';
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={1}
                  onPress={() => handleTabChange(item.key)}
                  style={[
                    styles.tabButton,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#F3F4F6'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={16}
                    color={active ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {userFilters.map((filter) => {
              const active = userFilter === filter.value;
              return (
                <TouchableOpacity
                  key={filter.value}
                  testID={`admin-users-filter-${filter.value}`}
                  accessibilityLabel={`admin-users-filter-${filter.value}`}
                  activeOpacity={1}
                  onPress={() => setUserFilter(filter.value)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

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
        <View style={styles.modalBackdrop}>
          <View
            testID="admin-user-form-modal"
            accessibilityLabel="admin-user-form-modal"
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {userModalMode === 'create' ? 'Create User' : 'Edit User'}
            </Text>

            <ScrollView
              style={styles.userFormScroll}
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
                          onPress={() => setUserFormRole(role)}
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
                              onPress={() => {
                                setStaffFormEntityType(entityType);
                                setStaffFormTargetId('');
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
                                {STAFF_ENTITY_LABELS[entityType]}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Access level</Text>
                      <View style={styles.staffLevelGrid}>
                        {staffAccessLevelOptions.map((level) => {
                          const active = staffFormAccessLevel === level;
                          return (
                            <TouchableOpacity
                              key={level}
                              testID={`admin-user-staff-level-${level}`}
                              accessibilityLabel={`admin-user-staff-level-${level}`}
                              activeOpacity={1}
                              onPress={() => setStaffFormAccessLevel(level)}
                              style={[
                                styles.staffLevelButton,
                                {
                                  backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                                  borderColor: active ? colors.primary : colors.border,
                                },
                              ]}
                            >
                              <Text style={[styles.staffLevelTitle, { color: active ? '#FFFFFF' : colors.text }]}>
                                Level {level}
                              </Text>
                              <Text style={[styles.staffLevelText, { color: active ? '#E5E7EB' : colors.textSecondary }]}>
                                {STAFF_ACCESS_LEVEL_LABELS[level].replace(`Level ${level} - `, '')}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                        {STAFF_ENTITY_LABELS[staffFormEntityType]} <Text style={styles.requiredMark}>*</Text>
                      </Text>
                      {staffTargetsLoading ? (
                        <View style={styles.inlineLoader}>
                          <ActivityIndicator size="small" color={colors.primary} />
                        </View>
                      ) : staffTargetOptions.length === 0 ? (
                        <Text style={[styles.detailsEmptyText, { color: colors.textSecondary }]}>
                          No {STAFF_ENTITY_LABELS[staffFormEntityType].toLowerCase()} records found.
                        </Text>
                      ) : (
                        <ScrollView
                          nestedScrollEnabled
                          style={styles.staffTargetList}
                          contentContainerStyle={styles.staffTargetListContent}
                          showsVerticalScrollIndicator={false}
                        >
                          {staffFormTargetId && !staffTargetOptions.some((item) => item.id === staffFormTargetId) ? (
                            <TouchableOpacity
                              testID="admin-user-staff-target-current"
                              accessibilityLabel="admin-user-staff-target-current"
                              activeOpacity={1}
                              style={[styles.staffTargetOption, { borderColor: colors.primary, backgroundColor: `${colors.primary}14` }]}
                            >
                              <Text style={[styles.staffTargetTitle, { color: colors.text }]}>Current assignment</Text>
                              <Text style={[styles.staffTargetMeta, { color: colors.textSecondary }]}>{staffFormTargetId}</Text>
                            </TouchableOpacity>
                          ) : null}
                          {staffTargetOptions.map((option) => {
                            const active = staffFormTargetId === option.id;
                            return (
                              <TouchableOpacity
                                key={option.id}
                                testID={`admin-user-staff-target-${option.id}`}
                                accessibilityLabel={`admin-user-staff-target-${option.id}`}
                                activeOpacity={1}
                                onPress={() => setStaffFormTargetId(option.id)}
                                style={[
                                  styles.staffTargetOption,
                                  {
                                    borderColor: active ? colors.primary : colors.border,
                                    backgroundColor: active ? `${colors.primary}14` : (isDark ? '#0F172A' : '#F8FAFC'),
                                  },
                                ]}
                              >
                                <Text style={[styles.staffTargetTitle, { color: colors.text }]} numberOfLines={1}>{option.name}</Text>
                                {option.meta ? (
                                  <Text style={[styles.staffTargetMeta, { color: colors.textSecondary }]}>{option.meta}</Text>
                                ) : null}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                      {userFormSubmitAttempted && userFormErrors.staffTarget ? (
                        <Text style={styles.fieldErrorText}>{userFormErrors.staffTarget}</Text>
                      ) : null}
                    </View>
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

            <View style={styles.modalActionsRow}>
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
        <View style={styles.modalBackdrop}>
          <View
            testID="admin-user-details-modal"
            accessibilityLabel="admin-user-details-modal"
            style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}
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
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailsSection('Account', userDetailsTarget?.profile || null, 'Account details are unavailable.')}
            </ScrollView>

            <View style={styles.modalActionsRow}>
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

