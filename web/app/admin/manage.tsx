import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import Header from '../../src/components/header';
import ImageUploader from '../../src/components/ImageUploader';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getEdgeFunctionErrorMessage } from '../../src/utils/edgeFunctionErrors';

type ResourceType = 'studio' | 'venue' | 'production';
type ResourceFilter = 'all' | ResourceType;
type EditorMode = 'create' | 'edit';
type RelatedActivityKind = 'gig_application' | 'booking_request' | 'studio_booking';

type RelatedActivityAction = {
  key: string;
  label: string;
  next_status?: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
};

type RelatedPerson = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type AdminRelatedActivity = {
  kind: RelatedActivityKind;
  id: string;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  primary_person?: RelatedPerson | null;
  secondary_person?: RelatedPerson | null;
  group?: { id?: string | null; name?: string | null; group_type?: string | null } | null;
  listing?: {
    id?: string | null;
    name?: string | null;
    date?: string | null;
    location?: string | null;
    budget?: number | null;
    status?: string | null;
  } | null;
  request_kind?: string | null;
  sender_entity_type?: string | null;
  sender_entity_name?: string | null;
  receiver_entity_type?: string | null;
  receiver_entity_name?: string | null;
  message?: string | null;
  note?: string | null;
  notes?: string | null;
  video_url?: string | null;
  cv_url?: string | null;
  attachment_url?: string | null;
  proof_url?: string | null;
  cancellation_reason?: string | null;
  leader_approval_status?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  session_type?: string | null;
  hours?: number | string | null;
  final_price?: number | string | null;
  payment_status?: string | null;
  payment_type?: string | null;
  remaining_balance?: number | string | null;
  production_team_id?: string | null;
  studio_id?: string | null;
  available_actions?: RelatedActivityAction[];
};

type AdminResource = {
  id: string;
  resource_type: ResourceType;
  owner_id?: string;
  organizer_id?: string;
  owner_name?: string;
  owner_email?: string;
  name?: string;
  description?: string | null;
  address?: string | null;
  location?: string | null;
  location_label?: string | null;
  studio_type?: string | null;
  studio_types?: string[];
  hourly_rate?: number | null;
  rehearsal_rate?: number | null;
  recording_rate?: number | null;
  pax?: number | null;
  budget?: number | null;
  event_date?: string | null;
  status?: string | null;
  permit_status?: string | null;
  permit_rejection_reason?: string | null;
  contract_url?: string | null;
  business_permit_url?: string | null;
  reapplication_cooldown_days?: number | null;
  requirements?: Record<string, unknown>;
  images?: string[];
  documents?: string[];
  amenities?: string[];
  instruments?: { name?: string | null; image?: string | null }[];
  logo_url?: string | null;
  open_production_applications?: boolean;
  member_count?: number;
  primary_image_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  related_activity?: AdminRelatedActivity[];
};

type OwnerOption = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
};

type EditorForm = {
  resourceType: ResourceType;
  ownerId: string;
  name: string;
  description: string;
  address: string;
  location: string;
  studioType: string;
  hourlyRate: string;
  rehearsalRate: string;
  recordingRate: string;
  pax: string;
  budget: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  gigStatus: string;
  experienceLevel: string;
  musicianType: string;
  permitStatus: string;
  reapplicationCooldownDays: string;
  genres: string;
  instruments: string;
  amenities: string;
  imageUrls: string;
  contractUrl: string;
  businessPermitUrl: string;
  logoUrl: string;
  openApplications: boolean;
};

type AdminAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type DetailRow = {
  label: string;
  value: unknown;
};

type DetailSection = {
  title: string;
  icon: string;
  rows: DetailRow[];
};

const resourceTabs: { key: ResourceFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'albums-outline' },
  { key: 'studio', label: 'Studios', icon: 'business-outline' },
  { key: 'venue', label: 'Gigs', icon: 'musical-notes-outline' },
  { key: 'production', label: 'Production', icon: 'people-circle-outline' },
];

const studioTypeOptions = ['Rehearsal', 'Recording', 'Both'];
const gigStatusOptions = ['open', 'closed', 'cancelled'];
const experienceLevelOptions = ['Any', 'Beginner', 'Intermediate', 'Advanced', 'Professional'];
const musicianTypeOptions = ['solo', 'group', 'both'];
const permitStatusOptions = ['approved', 'pending_review', 'resubmitted', 'rejected'];

const defaultForm = (resourceType: ResourceType = 'studio'): EditorForm => ({
  resourceType,
  ownerId: '',
  name: '',
  description: '',
  address: '',
  location: '',
  studioType: 'Rehearsal',
  hourlyRate: '',
  rehearsalRate: '',
  recordingRate: '',
  pax: '',
  budget: '',
  eventDate: '',
  eventStartTime: '06:00 PM',
  eventEndTime: '11:00 PM',
  gigStatus: 'open',
  experienceLevel: 'Any',
  musicianType: 'both',
  permitStatus: 'approved',
  reapplicationCooldownDays: '30',
  genres: '',
  instruments: '',
  amenities: '',
  imageUrls: '',
  contractUrl: '',
  businessPermitUrl: '',
  logoUrl: '',
  openApplications: true,
});

const typeLabels: Record<ResourceType, string> = {
  studio: 'Studio',
  venue: 'Gig',
  production: 'Production',
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const money = (value?: number | string | null) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return '-';
  return `PHP ${parsed.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const formatCalendarDate = (value?: string | null) => {
  if (!value) return 'Select date';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const listText = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return typeof value === 'string' ? value : '';
};

const splitList = (value: string) => (
  value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const uniqueList = (values: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const isImageUrl = (url?: string | null) => (
  /^https?:\/\//i.test(String(url || '').trim()) || /^data:image\//i.test(String(url || '').trim())
);

const normalizeTimeForInput = (value: string, fallback: string) => {
  const normalized = String(value || fallback).trim();
  const match = normalized.match(/^(\d{1,2}:\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return fallback;
  const clock = match[1];
  const period = (match[2] || fallback.split(' ')[1] || 'PM').toUpperCase();
  return `${clock} ${period}`;
};

const getClockPart = (value: string, fallback: string) => normalizeTimeForInput(value, fallback).split(' ')[0];
const getPeriodPart = (value: string, fallback: string) => normalizeTimeForInput(value, fallback).split(' ')[1] || 'PM';

const valueText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    const text = value
      .map((item) => valueText(item))
      .filter((item) => item !== '-')
      .join(', ');
    return text || '-';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => `${key.replace(/_/g, ' ')}: ${valueText(nestedValue)}`)
      .join('\n') || '-';
  }
  return String(value);
};

const getOwnerRoleForResource = (resourceType: ResourceType) => (
  resourceType === 'studio'
    ? 'studio-owner'
    : resourceType === 'venue'
      ? 'venue-owner'
      : 'producer'
);

const getDisplayOwnerName = (owner?: OwnerOption | null) => (
  owner?.full_name || owner?.email || 'Selected owner'
);

const getDisplayOwnerMeta = (owner?: OwnerOption | null) => (
  owner?.email || owner?.role || 'Owner selected'
);

const getResourceIcon = (resourceType: ResourceType) => (
  resourceType === 'studio'
    ? 'business-outline'
    : resourceType === 'venue'
      ? 'musical-notes-outline'
      : 'people-circle-outline'
);

const getDetailSections = (resource: AdminResource): DetailSection[] => {
  const requirements = resource.requirements || {};
  const sections: DetailSection[] = [
    {
      title: 'Record Info',
      icon: 'information-circle-outline',
      rows: [
        { label: 'Type', value: typeLabels[resource.resource_type] },
        { label: 'Status', value: getResourceStatus(resource) },
        { label: 'Created', value: formatDateTime(resource.created_at) },
        { label: 'Updated', value: formatDateTime(resource.updated_at) },
      ],
    },
    {
      title: 'Owner',
      icon: 'person-circle-outline',
      rows: [
        { label: 'Name', value: resource.owner_name || 'Unknown owner' },
        { label: 'Email', value: resource.owner_email },
      ],
    },
  ];

  if (resource.resource_type === 'studio') {
    sections.push(
      {
        title: 'Studio Details',
        icon: 'calendar-outline',
        rows: [
          { label: 'Address', value: resource.address || resource.location_label },
          { label: 'Studio Type', value: resource.studio_type || resource.studio_types },
          { label: 'Hourly Rate', value: money(resource.hourly_rate) },
          { label: 'Rehearsal Rate', value: money(resource.rehearsal_rate) },
          { label: 'Recording Rate', value: money(resource.recording_rate) },
          { label: 'Capacity', value: resource.pax ? `${resource.pax} pax` : '-' },
          { label: 'Permit Status', value: resource.permit_status },
          { label: 'Permit Rejection', value: resource.permit_rejection_reason },
        ],
      },
      {
        title: 'Setup',
        icon: 'construct-outline',
        rows: [
          { label: 'Amenities', value: resource.amenities },
          {
            label: 'Equipment',
            value: (resource.instruments || [])
              .map((item) => item?.name)
              .filter(Boolean),
          },
          { label: 'Images', value: `${resource.images?.length || 0} image(s)` },
        ],
      },
    );
  } else if (resource.resource_type === 'venue') {
    sections.push(
      {
        title: 'Event Details',
        icon: 'calendar-outline',
        rows: [
          { label: 'Location', value: resource.location || resource.location_label },
          { label: 'Event Date', value: formatDateTime(resource.event_date) },
          { label: 'Start Time', value: requirements.event_start_time },
          { label: 'End Time', value: requirements.event_end_time },
          { label: 'Schedule Conditions', value: requirements.event_schedules },
          { label: 'Budget', value: money(resource.budget) },
          { label: 'Listing Status', value: resource.status },
          { label: 'Permit Status', value: resource.permit_status },
          { label: 'Permit Rejection', value: resource.permit_rejection_reason },
          { label: 'Reapply Cooldown', value: resource.reapplication_cooldown_days ? `${resource.reapplication_cooldown_days} day(s)` : '-' },
        ],
      },
      {
        title: 'Requirements',
        icon: 'list-outline',
        rows: [
          { label: 'Genres', value: requirements.genres },
          { label: 'Required Instruments', value: requirements.instruments },
          { label: 'Experience', value: requirements.experience_level },
          { label: 'Musician Type', value: requirements.musician_type },
          { label: 'Images', value: `${resource.images?.length || 0} image(s)` },
          { label: 'Documents', value: `${resource.documents?.length || 0} document(s)` },
        ],
      },
    );
  } else {
    sections.push({
      title: 'Production Details',
      icon: 'people-outline',
      rows: [
        { label: 'Applications', value: resource.open_production_applications === false ? 'Closed' : 'Open' },
        { label: 'Members', value: `${resource.member_count || 0} member(s)` },
        { label: 'Logo', value: resource.logo_url ? 'Available' : '-' },
      ],
    });
  }

  sections.push({
    title: 'Description',
    icon: 'document-text-outline',
    rows: [
      { label: 'Details', value: resource.description || 'No description' },
    ],
  });

  return sections;
};

const getResourceLinks = (resource: AdminResource) => {
  const links: { label: string; url: string; icon: string }[] = [];
  const pushLink = (label: string, url?: string | null, icon = 'open-outline') => {
    const normalized = String(url || '').trim();
    if (normalized) links.push({ label, url: normalized, icon });
  };

  pushLink('Contract', resource.contract_url, 'document-attach-outline');
  pushLink('Business Permit', resource.business_permit_url, 'shield-checkmark-outline');
  pushLink('Logo', resource.logo_url, 'image-outline');
  (resource.images || []).forEach((url, index) => pushLink(`Image ${index + 1}`, url, 'image-outline'));
  (resource.documents || []).forEach((url, index) => pushLink(`Document ${index + 1}`, url, 'document-outline'));

  return links;
};

const getResourceImages = (resource: AdminResource) => {
  const images = resource.resource_type === 'production'
    ? uniqueList([resource.logo_url, resource.primary_image_url, ...(resource.images || [])])
    : uniqueList([resource.primary_image_url, ...(resource.images || []), resource.logo_url]);

  return images.filter(isImageUrl).map((url, index) => ({
    url,
    label: resource.resource_type === 'production' && index === 0 ? 'Logo' : `Image ${index + 1}`,
  }));
};

const activityTypeLabels: Record<RelatedActivityKind, string> = {
  gig_application: 'Application',
  booking_request: 'Request',
  studio_booking: 'Booking',
};

const activityTypeIcons: Record<RelatedActivityKind, string> = {
  gig_application: 'person-add-outline',
  booking_request: 'mail-open-outline',
  studio_booking: 'calendar-outline',
};

const activityActionColors: Record<RelatedActivityAction['tone'], string> = {
  primary: '#2563EB',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const normalizeStatusText = (value?: string | null) => (
  String(value || '-').replace(/_/g, ' ')
);

const formatActivitySchedule = (activity: AdminRelatedActivity) => {
  const date = activity.booking_date ? formatDate(activity.booking_date) : '-';
  const start = activity.start_time || '';
  const end = activity.end_time || '';
  const time = [start, end].filter(Boolean).join(' - ');
  return time ? `${date} | ${time}` : date;
};

const getActivityLinks = (activity: AdminRelatedActivity) => {
  const links: { label: string; url: string; icon: string }[] = [];
  const pushLink = (label: string, url?: string | null, icon = 'open-outline') => {
    const normalized = String(url || '').trim();
    if (normalized) links.push({ label, url: normalized, icon });
  };

  pushLink('Audition Video', activity.video_url, 'videocam-outline');
  pushLink('CV', activity.cv_url, 'document-text-outline');
  pushLink('Attachment', activity.attachment_url, 'attach-outline');
  pushLink('Proof', activity.proof_url, 'receipt-outline');

  return links;
};

const getActivityDetailRows = (activity: AdminRelatedActivity): DetailRow[] => {
  const rows: DetailRow[] = [
    { label: 'Type', value: activityTypeLabels[activity.kind] },
    { label: 'Status', value: normalizeStatusText(activity.status) },
    { label: 'Created', value: formatDateTime(activity.created_at) },
  ];

  if (activity.updated_at) rows.push({ label: 'Updated', value: formatDateTime(activity.updated_at) });
  if (activity.primary_person?.name) rows.push({ label: 'Primary', value: activity.primary_person.name });
  if (activity.primary_person?.email) rows.push({ label: 'Primary Email', value: activity.primary_person.email });
  if (activity.secondary_person?.name) rows.push({ label: 'Secondary', value: activity.secondary_person.name });
  if (activity.group?.name) rows.push({ label: 'Group', value: activity.group.name });
  if (activity.listing?.name) rows.push({ label: 'Gig', value: activity.listing.name });
  if (activity.listing?.date) rows.push({ label: 'Gig Date', value: formatDateTime(activity.listing.date) });
  if (activity.listing?.location) rows.push({ label: 'Gig Location', value: activity.listing.location });
  if (activity.request_kind) rows.push({ label: 'Request Kind', value: normalizeStatusText(activity.request_kind) });
  if (activity.sender_entity_name) rows.push({ label: 'From', value: activity.sender_entity_name });
  if (activity.receiver_entity_name) rows.push({ label: 'To', value: activity.receiver_entity_name });
  if (activity.booking_date) rows.push({ label: 'Schedule', value: formatActivitySchedule(activity) });
  if (activity.session_type) rows.push({ label: 'Session', value: normalizeStatusText(activity.session_type) });
  if (activity.hours) rows.push({ label: 'Hours', value: activity.hours });
  if (activity.final_price) rows.push({ label: 'Price', value: money(activity.final_price) });
  if (activity.payment_status) rows.push({ label: 'Payment', value: normalizeStatusText(activity.payment_status) });
  if (activity.payment_type) rows.push({ label: 'Payment Type', value: normalizeStatusText(activity.payment_type) });
  if (activity.remaining_balance) rows.push({ label: 'Balance', value: money(activity.remaining_balance) });
  if (activity.leader_approval_status) rows.push({ label: 'Leader Approval', value: normalizeStatusText(activity.leader_approval_status) });
  if (activity.message) rows.push({ label: 'Message', value: activity.message });
  if (activity.note) rows.push({ label: 'Note', value: activity.note });
  if (activity.notes) rows.push({ label: 'Booking Notes', value: activity.notes });
  if (activity.cancellation_reason) rows.push({ label: 'Reason', value: activity.cancellation_reason });

  return rows;
};

const getResourceOwnerId = (resource: AdminResource) => resource.owner_id || resource.organizer_id || '';

const getResourceStatus = (resource: AdminResource) => {
  if (resource.resource_type === 'production') {
    return resource.open_production_applications === false ? 'closed' : 'open';
  }
  return resource.resource_type === 'venue'
    ? resource.status || 'open'
    : resource.permit_status || 'approved';
};

const formFromResource = (resource: AdminResource): EditorForm => {
  const form = defaultForm(resource.resource_type);
  const requirements = resource.requirements || {};
  const studioInstrumentNames = (resource.instruments || [])
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);

  return {
    ...form,
    ownerId: getResourceOwnerId(resource),
    name: resource.name || '',
    description: resource.description || '',
    address: resource.address || '',
    location: resource.location || '',
    studioType: resource.studio_type || (
      Array.isArray(resource.studio_types) && resource.studio_types.length > 1
        ? 'Both'
        : resource.studio_types?.[0] || 'Rehearsal'
    ),
    hourlyRate: resource.hourly_rate == null ? '' : String(resource.hourly_rate),
    rehearsalRate: resource.rehearsal_rate == null ? '' : String(resource.rehearsal_rate),
    recordingRate: resource.recording_rate == null ? '' : String(resource.recording_rate),
    pax: resource.pax == null ? '' : String(resource.pax),
    budget: resource.budget == null ? '' : String(resource.budget),
    eventDate: resource.event_date ? String(resource.event_date).slice(0, 10) : '',
    eventStartTime: String(requirements.event_start_time || '06:00 PM'),
    eventEndTime: String(requirements.event_end_time || '11:00 PM'),
    gigStatus: resource.status || 'open',
    experienceLevel: String(requirements.experience_level || 'Any'),
    musicianType: String(requirements.musician_type || 'both'),
    permitStatus: resource.permit_status || 'approved',
    reapplicationCooldownDays: resource.reapplication_cooldown_days == null
      ? '30'
      : String(resource.reapplication_cooldown_days),
    genres: listText(requirements.genres),
    instruments: resource.resource_type === 'studio'
      ? studioInstrumentNames.join(', ')
      : listText(requirements.instruments),
    amenities: listText(resource.amenities),
    imageUrls: listText(resource.images),
    contractUrl: resource.contract_url || '',
    businessPermitUrl: resource.business_permit_url || '',
    logoUrl: resource.logo_url || resource.primary_image_url || '',
    openApplications: resource.open_production_applications !== false,
  };
};

const normalizeTestPart = (value: string) => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
);

export default function AdminManagePage() {
  const { colors, isDark } = useTheme();
  const { loading, isAdmin, roleResolved, userId: adminUserId } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 1040;

  const [resources, setResources] = useState<AdminResource[]>([]);
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('all');
  const [search, setSearch] = useState('');
  const [loadingResources, setLoadingResources] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailResource, setDetailResource] = useState<AdminResource | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingResource, setEditingResource] = useState<AdminResource | null>(null);
  const [form, setForm] = useState<EditorForm>(() => defaultForm('studio'));
  const [eventCalendarVisible, setEventCalendarVisible] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [alert, setAlert] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: AdminAlertButton[];
    forceModal?: boolean;
  } | null>(null);

  const invokeAdminManage = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-listings-management', { body });

    if (error) {
      throw new Error(await getEdgeFunctionErrorMessage(error, 'Unable to reach admin listing tools.'));
    }

    if (data?.error && !data?.success) {
      throw new Error(String(data.error));
    }

    return data?.data;
  }, []);

  const fetchResources = useCallback(async () => {
    if (loading || !roleResolved || !isAdmin) return;

    setLoadingResources(true);
    try {
      const data = await invokeAdminManage({
        action: 'admin_list_resources',
        search,
      });
      setResources(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setResources([]);
      setAlert({
        type: 'error',
        title: 'Unable to Load',
        message: error?.message || 'Failed to load managed resources.',
      });
    } finally {
      setLoadingResources(false);
    }
  }, [invokeAdminManage, isAdmin, loading, roleResolved, search]);

  const fetchOwnerOptions = useCallback(async (resourceType: ResourceType, nextSearch = '') => {
    try {
      const data = await invokeAdminManage({
        action: 'admin_owner_options',
        resource_type: resourceType,
        search: nextSearch,
      });
      setOwnerOptions(Array.isArray(data) ? data : []);
    } catch {
      setOwnerOptions([]);
    }
  }, [invokeAdminManage]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    if (!editorVisible) return;
    fetchOwnerOptions(form.resourceType, ownerSearch);
  }, [editorVisible, fetchOwnerOptions, form.resourceType, ownerSearch]);

  const counts = useMemo(() => {
    return resources.reduce(
      (acc, resource) => {
        acc.all += 1;
        acc[resource.resource_type] += 1;
        return acc;
      },
      { all: 0, studio: 0, venue: 0, production: 0 },
    );
  }, [resources]);

  const visibleResources = useMemo(() => {
    if (resourceFilter === 'all') return resources;
    return resources.filter((resource) => resource.resource_type === resourceFilter);
  }, [resourceFilter, resources]);

  const selectedOwner = useMemo<OwnerOption | null>(() => {
    const matched = ownerOptions.find((owner) => owner.id === form.ownerId);
    if (matched) return matched;
    if (!form.ownerId) return null;

    return {
      id: form.ownerId,
      full_name: editingResource?.owner_name || null,
      email: editingResource?.owner_email || null,
      role: getOwnerRoleForResource(form.resourceType),
    };
  }, [editingResource?.owner_email, editingResource?.owner_name, form.ownerId, form.resourceType, ownerOptions]);

  const openCreateEditor = useCallback((resourceType: ResourceType) => {
    setDetailVisible(false);
    setDetailResource(null);
    setEditorMode('create');
    setEditingResource(null);
    setForm(defaultForm(resourceType));
    setEventCalendarVisible(false);
    setOwnerSearch('');
    setOwnerOptions([]);
    setEditorVisible(true);
  }, []);

  const openViewDetails = useCallback(async (resource: AdminResource) => {
    const key = `view:${resource.resource_type}:${resource.id}`;
    setBusyKey(key);
    try {
      const data = await invokeAdminManage({
        action: 'admin_get_resource',
        resource_type: resource.resource_type,
        id: resource.id,
      });
      setDetailResource(data || resource);
      setDetailVisible(true);
    } catch (error: any) {
      setAlert({
        type: 'error',
        title: 'Unable to Load Details',
        message: error?.message || 'Failed to load resource details.',
      });
    } finally {
      setBusyKey(null);
    }
  }, [invokeAdminManage]);

  const openEditEditor = useCallback(async (resource: AdminResource) => {
    setDetailVisible(false);
    setBusyKey(`edit:${resource.resource_type}:${resource.id}`);
    try {
      const data = await invokeAdminManage({
        action: 'admin_get_resource',
        resource_type: resource.resource_type,
        id: resource.id,
      });
      const detail = data || resource;
      setEditorMode('edit');
      setEditingResource(detail);
      setForm(formFromResource(detail));
      setEventCalendarVisible(false);
      setOwnerSearch('');
      setOwnerOptions([]);
      setEditorVisible(true);
    } catch (error: any) {
      setAlert({
        type: 'error',
        title: 'Unable to Edit',
        message: error?.message || 'Failed to load resource details.',
      });
    } finally {
      setBusyKey(null);
    }
  }, [invokeAdminManage]);

  const closeEditor = useCallback(() => {
    if (busyKey === 'save') return;
    setEditorVisible(false);
    setEditingResource(null);
    setEventCalendarVisible(false);
  }, [busyKey]);

  const closeDetails = useCallback(() => {
    if (busyKey) return;
    setDetailVisible(false);
    setDetailResource(null);
  }, [busyKey]);

  const openExternalLink = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error: any) {
      setAlert({
        type: 'error',
        title: 'Unable to Open',
        message: error?.message || 'The link could not be opened.',
      });
    }
  }, []);

  const updateForm = useCallback((patch: Partial<EditorForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const buildPayload = useCallback(() => {
    const common = {
      owner_id: form.ownerId.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
    };

    if (form.resourceType === 'studio') {
      return {
        ...common,
        address: form.address.trim() || null,
        studio_type: form.studioType,
        hourly_rate: form.hourlyRate,
        rehearsal_rate: form.rehearsalRate,
        recording_rate: form.recordingRate,
        pax: form.pax,
        permit_status: form.permitStatus,
        amenities: splitList(form.amenities),
        instruments: splitList(form.instruments).map((name) => ({ name })),
        images: splitList(form.imageUrls),
        contract_url: form.contractUrl.trim() || null,
        business_permit_url: form.businessPermitUrl.trim() || null,
      };
    }

    if (form.resourceType === 'venue') {
      return {
        ...common,
        location: form.location.trim() || null,
        budget: form.budget,
        event_date: form.eventDate.trim() || null,
        status: form.gigStatus,
        permit_status: form.permitStatus,
        reapplication_cooldown_days: form.reapplicationCooldownDays,
        images: splitList(form.imageUrls),
        contract_url: form.contractUrl.trim() || null,
        business_permit_url: form.businessPermitUrl.trim() || null,
        requirements: {
          genres: splitList(form.genres),
          instruments: splitList(form.instruments),
          experience_level: form.experienceLevel === 'Any' ? null : form.experienceLevel,
          event_start_time: form.eventStartTime.trim() || null,
          event_end_time: form.eventEndTime.trim() || null,
          event_schedules: form.eventDate.trim()
            ? [{
                date: form.eventDate.trim(),
                start_time: form.eventStartTime.trim() || '06:00 PM',
                end_time: form.eventEndTime.trim() || '11:00 PM',
              }]
            : [],
          musician_type: form.musicianType || 'both',
        },
      };
    }

    return {
      ...common,
      logo_url: form.logoUrl.trim() || null,
      open_production_applications: form.openApplications,
    };
  }, [form]);

  const validateForm = useCallback(() => {
    if (!form.ownerId.trim()) {
      setAlert({ type: 'warning', title: 'Missing Owner', message: 'Select an owner before saving.' });
      return false;
    }

    if (!form.name.trim()) {
      setAlert({ type: 'warning', title: 'Missing Name', message: 'Enter a name before saving.' });
      return false;
    }

    if (form.resourceType === 'studio' && !form.address.trim()) {
      setAlert({ type: 'warning', title: 'Missing Address', message: 'Enter the studio address before saving.' });
      return false;
    }

    if (form.resourceType === 'venue' && !form.location.trim()) {
      setAlert({ type: 'warning', title: 'Missing Location', message: 'Enter the gig location before saving.' });
      return false;
    }

    return true;
  }, [form]);

  const handleSave = useCallback(async () => {
    if (busyKey === 'save' || !validateForm()) return;

    setBusyKey('save');
    try {
      const payload = buildPayload();
      await invokeAdminManage({
        action: editorMode === 'create' ? 'admin_create_resource' : 'admin_update_resource',
        resource_type: form.resourceType,
        id: editingResource?.id,
        payload,
      });

      setEditorVisible(false);
      setEditingResource(null);
      await fetchResources();
      setAlert({
        type: 'success',
        title: editorMode === 'create' ? 'Created' : 'Saved',
        message: `${typeLabels[form.resourceType]} ${editorMode === 'create' ? 'created' : 'updated'} successfully.`,
      });
    } catch (error: any) {
      setAlert({
        type: 'error',
        title: 'Unable to Save',
        message: error?.message || 'The resource could not be saved.',
      });
    } finally {
      setBusyKey(null);
    }
  }, [buildPayload, busyKey, editingResource?.id, editorMode, fetchResources, form.resourceType, invokeAdminManage, validateForm]);

  const performDelete = useCallback(async (resource: AdminResource) => {
    const key = `delete:${resource.resource_type}:${resource.id}`;
    setBusyKey(key);
    try {
      await invokeAdminManage({
        action: 'admin_delete_resource',
        resource_type: resource.resource_type,
        id: resource.id,
        reason: 'Deleted from admin Manage.',
      });
      await fetchResources();
      setDetailVisible(false);
      setDetailResource(null);
      setAlert({
        type: 'success',
        title: 'Deleted',
        message: `${typeLabels[resource.resource_type]} removed successfully.`,
      });
    } catch (error: any) {
      setAlert({
        type: 'error',
        title: 'Unable to Delete',
        message: error?.message || 'The resource could not be deleted.',
      });
    } finally {
      setBusyKey(null);
    }
  }, [fetchResources, invokeAdminManage]);

  const confirmDelete = useCallback((resource: AdminResource) => {
    setAlert({
      type: 'warning',
      title: `Delete ${typeLabels[resource.resource_type]}`,
      message: `Delete "${resource.name || 'this resource'}"? This action cannot be undone.`,
      forceModal: true,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            performDelete(resource);
          },
        },
      ],
    });
  }, [performDelete]);

  const performRelatedActivityAction = useCallback(async (
    activity: AdminRelatedActivity,
    action: RelatedActivityAction,
  ) => {
    if (!detailResource) return;

    const key = `related:${activity.kind}:${activity.id}:${action.key}`;
    setBusyKey(key);
    try {
      await invokeAdminManage({
        action: 'admin_update_related_activity',
        kind: activity.kind,
        id: activity.id,
        activity_action: action.key,
        reason: `Updated by admin from Manage: ${action.label}`,
      });

      const refreshed = await invokeAdminManage({
        action: 'admin_get_resource',
        resource_type: detailResource.resource_type,
        id: detailResource.id,
      });
      setDetailResource(refreshed || detailResource);
      await fetchResources();
      setAlert({
        type: 'success',
        title: 'Updated',
        message: `${activityTypeLabels[activity.kind]} ${action.label.toLowerCase()} action completed.`,
      });
    } catch (error: any) {
      setAlert({
        type: 'error',
        title: 'Unable to Update',
        message: error?.message || 'The related activity could not be updated.',
      });
    } finally {
      setBusyKey(null);
    }
  }, [detailResource, fetchResources, invokeAdminManage]);

  const confirmRelatedActivityAction = useCallback((
    activity: AdminRelatedActivity,
    action: RelatedActivityAction,
  ) => {
    const destructive = action.tone === 'danger' || action.tone === 'warning';
    const confirmText = action.key === 'cancel'
      ? `Cancel ${activityTypeLabels[activity.kind]}`
      : action.label;
    setAlert({
      type: destructive ? 'warning' : 'info',
      title: `${action.label} ${activityTypeLabels[activity.kind]}`,
      message: `${action.label} "${activity.title || 'this activity'}"?`,
      forceModal: true,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => {
            performRelatedActivityAction(activity, action);
          },
        },
      ],
    });
  }, [performRelatedActivityAction]);

  const selectOwner = useCallback((owner: OwnerOption) => {
    setForm((current) => ({ ...current, ownerId: owner.id }));
  }, []);

  const updateVenueTime = useCallback((
    field: 'eventStartTime' | 'eventEndTime',
    clock: string,
    period: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: `${clock.trim()} ${period}`.trim(),
    }));
  }, []);

  if (loading || !roleResolved) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Admin" onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Admin" onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary }}>Access denied</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      testID="admin-manage-page"
      accessibilityLabel="admin-manage-page"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Header title="Admin Manage" onBackPress={() => router.replace('/admin')} />

      <View style={styles.topBand}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.pageTitle, { color: colors.text }]}>Manage Listings</Text>
            <Text style={[styles.pageMeta, { color: colors.textSecondary }]}>
              {counts.studio} studios | {counts.venue} gigs | {counts.production} production teams
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.82}
            testID="admin-manage-refresh-button"
            accessibilityLabel="admin-manage-refresh-button"
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={fetchResources}
            disabled={loadingResources}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            testID="admin-manage-search-input"
            accessibilityLabel="admin-manage-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search listings, owners, emails"
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search ? (
            <TouchableOpacity activeOpacity={0.82} onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {resourceTabs.map((tab) => {
            const active = tab.key === resourceFilter;
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.82}
                testID={`admin-manage-filter-${tab.key}`}
                accessibilityLabel={`admin-manage-filter-${tab.key}`}
                style={[
                  styles.tabButton,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setResourceFilter(tab.key)}
              >
                <Ionicons name={tab.icon as any} size={16} color={active ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.text }]}>
                  {tab.label} ({counts[tab.key]})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.createRow}>
          {(['studio', 'venue', 'production'] as ResourceType[]).map((resourceType) => (
            <TouchableOpacity
              key={resourceType}
              activeOpacity={0.82}
              testID={`admin-manage-add-${resourceType}`}
              accessibilityLabel={`admin-manage-add-${resourceType}`}
              style={[styles.createButton, { backgroundColor: colors.primary }]}
              onPress={() => openCreateEditor(resourceType)}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.createButtonText}>New {typeLabels[resourceType]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loadingResources ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading resources...</Text>
          </View>
        ) : visibleResources.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="folder-open-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No resources found</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Try another filter or search term.</Text>
          </View>
        ) : (
          <View style={[styles.grid, isWide && styles.gridWide]}>
            {visibleResources.map((resource) => {
              const status = getResourceStatus(resource);
              const testPart = `${resource.resource_type}-${resource.id}`;
              const isDeleting = busyKey === `delete:${resource.resource_type}:${resource.id}`;
              const isEditing = busyKey === `edit:${resource.resource_type}:${resource.id}`;
              const isViewing = busyKey === `view:${resource.resource_type}:${resource.id}`;

              return (
                <View
                  key={`${resource.resource_type}:${resource.id}`}
                  testID={`admin-manage-card-${testPart}`}
                  accessibilityLabel={`admin-manage-card-${testPart}`}
                  style={[
                    styles.resourceCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    },
                    isWide && styles.resourceCardWide,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.resourceIcon, { backgroundColor: isDark ? '#1F2937' : '#EEF2FF' }]}>
                      <Ionicons
                        name={
                          resource.resource_type === 'studio'
                            ? 'business-outline'
                            : resource.resource_type === 'venue'
                              ? 'musical-notes-outline'
                              : 'people-circle-outline'
                        }
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.text }]}>
                        {resource.name || 'Untitled'}
                      </Text>
                      <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.textSecondary }]}>
                        {typeLabels[resource.resource_type]} | {resource.owner_name || 'Unknown owner'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metaGrid}>
                    <View style={styles.metaCell}>
                      <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Status</Text>
                      <Text numberOfLines={1} style={[styles.metaValue, { color: colors.text }]}>{status}</Text>
                    </View>
                    <View style={styles.metaCell}>
                      <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Created</Text>
                      <Text numberOfLines={1} style={[styles.metaValue, { color: colors.text }]}>{formatDate(resource.created_at)}</Text>
                    </View>
                    <View style={styles.metaCellWide}>
                      <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Location</Text>
                      <Text numberOfLines={1} style={[styles.metaValue, { color: colors.text }]}>
                        {resource.location_label || resource.address || resource.location || '-'}
                      </Text>
                    </View>
                  </View>

                  <Text numberOfLines={2} style={[styles.description, { color: colors.textSecondary }]}>
                    {resource.description || 'No description'}
                  </Text>

                  <View style={styles.detailLine}>
                    <Text numberOfLines={1} style={[styles.detailText, { color: colors.textSecondary }]}>
                      {resource.resource_type === 'studio'
                        ? `${resource.studio_type || 'Studio'} | ${money(resource.hourly_rate || resource.rehearsal_rate || resource.recording_rate)}`
                        : resource.resource_type === 'venue'
                          ? `${money(resource.budget)} | ${resource.event_date ? formatDate(resource.event_date) : 'Date TBA'}`
                          : `${resource.member_count || 0} member(s) | ${resource.open_production_applications === false ? 'Closed' : 'Open'} applications`}
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      testID={`admin-manage-view-${testPart}`}
                      accessibilityLabel={`admin-manage-view-${testPart}`}
                      style={[styles.rowButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]}
                      onPress={() => openViewDetails(resource)}
                      disabled={Boolean(busyKey)}
                    >
                      {isViewing ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="eye-outline" size={15} color={colors.primary} />
                          <Text style={[styles.rowButtonText, { color: colors.primary }]}>View</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      testID={`admin-manage-edit-${testPart}`}
                      accessibilityLabel={`admin-manage-edit-${testPart}`}
                      style={[styles.rowButton, { borderColor: colors.border }]}
                      onPress={() => openEditEditor(resource)}
                      disabled={Boolean(busyKey)}
                    >
                      {isEditing ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="create-outline" size={15} color={colors.text} />
                          <Text style={[styles.rowButtonText, { color: colors.text }]}>Edit</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.82}
                      testID={`admin-manage-delete-${testPart}`}
                      accessibilityLabel={`admin-manage-delete-${testPart}`}
                      style={[styles.rowButton, { borderColor: '#EF4444', backgroundColor: '#EF444414' }]}
                      onPress={() => confirmDelete(resource)}
                      disabled={Boolean(busyKey)}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#EF4444" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={15} color="#EF4444" />
                          <Text style={[styles.rowButtonText, { color: '#EF4444' }]}>Delete</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={editorVisible}
        transparent
        animationType="fade"
        onRequestClose={closeEditor}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.editor, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.editorHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.editorTitle, { color: colors.text }]}>
                  {editorMode === 'create' ? 'New' : 'Edit'} {typeLabels[form.resourceType]}
                </Text>
                <Text numberOfLines={1} style={[styles.editorSubtitle, { color: colors.textSecondary }]}>
                  {editorMode === 'edit' ? `${typeLabels[form.resourceType]} details` : 'Admin managed record'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.82}
                testID="admin-manage-editor-close"
                accessibilityLabel="admin-manage-editor-close"
                style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={closeEditor}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            {editorMode === 'create' ? (
              <View style={styles.segmentedRow}>
                {(['studio', 'venue', 'production'] as ResourceType[]).map((resourceType) => {
                  const active = form.resourceType === resourceType;
                  return (
                    <TouchableOpacity
                      key={resourceType}
                      activeOpacity={0.82}
                      style={[
                        styles.segmentButton,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        updateForm(defaultForm(resourceType));
                        setEventCalendarVisible(false);
                        setOwnerSearch('');
                      }}
                    >
                      <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : colors.text }]}>
                        {typeLabels[resourceType]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.editorBody} showsVerticalScrollIndicator={false}>
              <FieldLabel label="Owner" colors={colors} />
              <TextInput
                testID="admin-manage-owner-search"
                accessibilityLabel="admin-manage-owner-search"
                value={ownerSearch}
                onChangeText={setOwnerSearch}
                placeholder="Search owner name or email"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ownerRow}>
                {ownerOptions.map((owner, index) => {
                  const active = form.ownerId === owner.id;
                  const testLabel = owner.email || owner.full_name || owner.role || `owner-${index + 1}`;
                  return (
                    <TouchableOpacity
                      key={owner.id}
                      activeOpacity={0.82}
                      testID={`admin-manage-owner-${normalizeTestPart(testLabel)}`}
                      accessibilityLabel={`admin-manage-owner-${normalizeTestPart(testLabel)}`}
                      style={[
                        styles.ownerChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? `${colors.primary}1F` : colors.card,
                        },
                      ]}
                      onPress={() => selectOwner(owner)}
                    >
                      <Text numberOfLines={1} style={[styles.ownerName, { color: colors.text }]}>
                        {getDisplayOwnerName(owner)}
                      </Text>
                      <Text numberOfLines={1} style={[styles.ownerEmail, { color: colors.textSecondary }]}>
                        {getDisplayOwnerMeta(owner)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {selectedOwner ? (
                <SelectedOwnerCard owner={selectedOwner} colors={colors} />
              ) : (
                <Text style={[styles.ownerHint, { color: colors.textSecondary }]}>
                  Search and select an owner before saving.
                </Text>
              )}

              <FieldLabel label="Name" colors={colors} />
              <TextInput
                testID="admin-manage-name-input"
                accessibilityLabel="admin-manage-name-input"
                value={form.name}
                onChangeText={(name) => updateForm({ name })}
                placeholder={`${typeLabels[form.resourceType]} name`}
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              />

              <FieldLabel label="Description" colors={colors} />
              <TextInput
                value={form.description}
                onChangeText={(description) => updateForm({ description })}
                placeholder="Description"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              />

              {form.resourceType === 'studio' ? (
                <>
                  <FieldLabel label="Studio Type" colors={colors} />
                  <OptionRow
                    options={studioTypeOptions}
                    value={form.studioType}
                    colors={colors}
                    onChange={(studioType) => updateForm({ studioType })}
                  />
                  <FieldLabel label="Address" colors={colors} />
                  <TextInput
                    value={form.address}
                    onChangeText={(address) => updateForm({ address })}
                    placeholder="Studio address"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                  <View style={styles.twoColumn}>
                    <SmallField label="Hourly" value={form.hourlyRate} onChange={(hourlyRate) => updateForm({ hourlyRate })} colors={colors} />
                    <SmallField label="Pax" value={form.pax} onChange={(pax) => updateForm({ pax })} colors={colors} />
                  </View>
                  <View style={styles.twoColumn}>
                    <SmallField label="Rehearsal Rate" value={form.rehearsalRate} onChange={(rehearsalRate) => updateForm({ rehearsalRate })} colors={colors} />
                    <SmallField label="Recording Rate" value={form.recordingRate} onChange={(recordingRate) => updateForm({ recordingRate })} colors={colors} />
                  </View>
                  <FieldLabel label="Amenities" colors={colors} />
                  <TextInput
                    value={form.amenities}
                    onChangeText={(amenities) => updateForm({ amenities })}
                    placeholder="Parking, aircon, lounge"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                  <FieldLabel label="Equipment / Instruments" colors={colors} />
                  <TextInput
                    value={form.instruments}
                    onChangeText={(instruments) => updateForm({ instruments })}
                    placeholder="Drums, guitar amp, keyboard"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                </>
              ) : null}

              {form.resourceType === 'venue' ? (
                <>
                  <FieldLabel label="Gig Location" colors={colors} />
                  <TextInput
                    value={form.location}
                    onChangeText={(location) => updateForm({ location })}
                    placeholder="Gig location"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                  <View style={styles.twoColumn}>
                    <SmallField label="Budget" value={form.budget} onChange={(budget) => updateForm({ budget })} colors={colors} />
                    <SmallField label="Cooldown Days" value={form.reapplicationCooldownDays} onChange={(reapplicationCooldownDays) => updateForm({ reapplicationCooldownDays })} colors={colors} />
                  </View>
                  <FieldLabel label="Event Date" colors={colors} />
                  <TouchableOpacity
                    activeOpacity={0.82}
                    testID="admin-manage-event-date-button"
                    accessibilityLabel="admin-manage-event-date-button"
                    style={[styles.datePickerButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => setEventCalendarVisible((visible) => !visible)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text
                      testID="admin-manage-event-date-display"
                      accessibilityLabel="admin-manage-event-date-display"
                      style={[styles.datePickerText, { color: form.eventDate ? colors.text : colors.textSecondary }]}
                    >
                      {formatCalendarDate(form.eventDate)}
                    </Text>
                  </TouchableOpacity>
                  {eventCalendarVisible ? (
                    <View
                      testID="admin-manage-event-calendar"
                      accessibilityLabel="admin-manage-event-calendar"
                      style={[styles.calendarPanel, { borderColor: colors.border, backgroundColor: colors.card }]}
                    >
                      <Calendar
                        current={form.eventDate || todayKey()}
                        minDate={todayKey()}
                        markedDates={form.eventDate ? {
                          [form.eventDate]: { selected: true, selectedColor: colors.primary },
                        } : {}}
                        onDayPress={(day) => {
                          updateForm({ eventDate: day.dateString });
                          setEventCalendarVisible(false);
                        }}
                        theme={{
                          selectedDayBackgroundColor: colors.primary,
                          todayTextColor: colors.primary,
                          arrowColor: colors.primary,
                          calendarBackground: colors.card,
                          dayTextColor: colors.text,
                          monthTextColor: colors.text,
                          textDisabledColor: colors.textSecondary,
                        }}
                      />
                    </View>
                  ) : null}
                  <View style={styles.twoColumn}>
                    <TimeField
                      label="Start Time"
                      value={form.eventStartTime}
                      colors={colors}
                      fallback="06:00 PM"
                      testIDPrefix="admin-manage-event-start"
                      onClockChange={(clock) => updateVenueTime('eventStartTime', clock, getPeriodPart(form.eventStartTime, '06:00 PM'))}
                      onTogglePeriod={() => updateVenueTime(
                        'eventStartTime',
                        getClockPart(form.eventStartTime, '06:00 PM'),
                        getPeriodPart(form.eventStartTime, '06:00 PM') === 'AM' ? 'PM' : 'AM',
                      )}
                    />
                    <TimeField
                      label="End Time"
                      value={form.eventEndTime}
                      colors={colors}
                      fallback="11:00 PM"
                      testIDPrefix="admin-manage-event-end"
                      onClockChange={(clock) => updateVenueTime('eventEndTime', clock, getPeriodPart(form.eventEndTime, '11:00 PM'))}
                      onTogglePeriod={() => updateVenueTime(
                        'eventEndTime',
                        getClockPart(form.eventEndTime, '11:00 PM'),
                        getPeriodPart(form.eventEndTime, '11:00 PM') === 'AM' ? 'PM' : 'AM',
                      )}
                    />
                  </View>
                  <FieldLabel label="Gig Status" colors={colors} />
                  <OptionRow options={gigStatusOptions} value={form.gigStatus} colors={colors} onChange={(gigStatus) => updateForm({ gigStatus })} />
                  <FieldLabel label="Experience Level" colors={colors} />
                  <OptionRow
                    options={experienceLevelOptions}
                    value={form.experienceLevel}
                    colors={colors}
                    onChange={(experienceLevel) => updateForm({ experienceLevel })}
                  />
                  <FieldLabel label="Musician Type" colors={colors} />
                  <OptionRow
                    options={musicianTypeOptions}
                    value={form.musicianType}
                    colors={colors}
                    onChange={(musicianType) => updateForm({ musicianType })}
                  />
                  <FieldLabel label="Genres" colors={colors} />
                  <TextInput
                    value={form.genres}
                    onChangeText={(genres) => updateForm({ genres })}
                    placeholder="Rock, pop, jazz"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                  <FieldLabel label="Required Instruments" colors={colors} />
                  <TextInput
                    value={form.instruments}
                    onChangeText={(instruments) => updateForm({ instruments })}
                    placeholder="Vocals, drums, bass"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                </>
              ) : null}

              {form.resourceType === 'production' ? (
                <>
                  <FieldLabel label="Logo" colors={colors} />
                  <ImageUploader
                    images={uniqueList([form.logoUrl]).filter(isImageUrl)}
                    onImagesChange={(images) => updateForm({ logoUrl: images[0] || '' })}
                    maxImages={1}
                    userId={form.ownerId || adminUserId || 'admin-manage'}
                    folder="production"
                  />
                  <View style={[styles.switchRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.switchTitle, { color: colors.text }]}>Open Applications</Text>
                      <Text style={[styles.switchMeta, { color: colors.textSecondary }]}>Visible on production team matching</Text>
                    </View>
                    <Switch
                      value={form.openApplications}
                      onValueChange={(openApplications) => updateForm({ openApplications })}
                      trackColor={{ false: '#CBD5E1', true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </>
              ) : null}

              {form.resourceType !== 'production' ? (
                <>
                  <FieldLabel label="Permit Status" colors={colors} />
                  <OptionRow
                    options={permitStatusOptions}
                    value={form.permitStatus}
                    colors={colors}
                    onChange={(permitStatus) => updateForm({ permitStatus })}
                  />
                  <FieldLabel label="Images" colors={colors} />
                  <ImageUploader
                    images={splitList(form.imageUrls).filter(isImageUrl)}
                    onImagesChange={(images) => updateForm({ imageUrls: images.join('\n') })}
                    maxImages={10}
                    userId={form.ownerId || adminUserId || 'admin-manage'}
                    folder={form.resourceType === 'venue' ? 'gigs' : 'studios'}
                  />
                  <DocumentLinkControl
                    label="Contract"
                    url={form.contractUrl}
                    colors={colors}
                    onOpenLink={openExternalLink}
                    onClear={() => updateForm({ contractUrl: '' })}
                  />
                  <DocumentLinkControl
                    label="Business Permit"
                    url={form.businessPermitUrl}
                    colors={colors}
                    onOpenLink={openExternalLink}
                    onClear={() => updateForm({ businessPermitUrl: '' })}
                  />
                </>
              ) : null}

              {editorMode === 'edit' && editingResource ? (
                <RelatedActivityPreview
                  activities={editingResource.related_activity || []}
                  colors={colors}
                  isDark={isDark}
                />
              ) : null}
            </ScrollView>

            <View style={styles.editorFooter}>
              <TouchableOpacity
                activeOpacity={0.82}
                testID="admin-manage-editor-cancel"
                accessibilityLabel="admin-manage-editor-cancel"
                style={[styles.footerButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={closeEditor}
              >
                <Text style={[styles.footerButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.82}
                testID="admin-manage-editor-save"
                accessibilityLabel="admin-manage-editor-save"
                style={[styles.footerButton, styles.primaryFooterButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={busyKey === 'save'}
              >
                {busyKey === 'save' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>
                    {editorMode === 'create' ? 'Create' : 'Save'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDetails}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.detailPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {detailResource ? (
              <>
                <View style={styles.editorHeader}>
                  <View style={[styles.resourceIcon, { backgroundColor: isDark ? '#1F2937' : '#EEF2FF' }]}>
                    <Ionicons name={getResourceIcon(detailResource.resource_type) as any} size={19} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.editorTitle, { color: colors.text }]}>
                      {detailResource.name || 'Untitled'}
                    </Text>
                    <Text numberOfLines={1} style={[styles.editorSubtitle, { color: colors.textSecondary }]}>
                      {typeLabels[detailResource.resource_type]} | {detailResource.owner_name || 'Unknown owner'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${colors.primary}14`, borderColor: colors.primary }]}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                    <Text style={[styles.statusBadgeText, { color: colors.primary }]}>
                      {getResourceStatus(detailResource)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.82}
                    testID="admin-manage-details-close"
                    accessibilityLabel="admin-manage-details-close"
                    style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={closeDetails}
                  >
                    <Ionicons name="close" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
                  {getDetailSections(detailResource).map((section) => (
                    <DetailSectionCard
                      key={section.title}
                      section={section}
                      colors={colors}
                      isDark={isDark}
                    />
                  ))}

                  <ResourceImageGallery
                    resource={detailResource}
                    colors={colors}
                    onOpenLink={openExternalLink}
                  />

                  <View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={styles.detailCardHeader}>
                      <Ionicons name="attach-outline" size={18} color={colors.primary} />
                      <Text style={[styles.detailCardTitle, { color: colors.text }]}>Attachments</Text>
                    </View>
                    {getResourceLinks(detailResource).length === 0 ? (
                      <Text style={[styles.detailEmpty, { color: colors.textSecondary }]}>No linked files.</Text>
                    ) : (
                      <View style={styles.attachmentGrid}>
                        {getResourceLinks(detailResource).map((link) => (
                          <TouchableOpacity
                            key={`${link.label}:${link.url}`}
                            activeOpacity={0.82}
                            testID={`admin-manage-attachment-${normalizeTestPart(link.label)}`}
                            accessibilityLabel={`admin-manage-attachment-${normalizeTestPart(link.label)}`}
                            style={[styles.attachmentButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                            onPress={() => openExternalLink(link.url)}
                          >
                            <Ionicons name={link.icon as any} size={15} color={colors.primary} />
                            <Text numberOfLines={1} style={[styles.attachmentText, { color: colors.text }]}>
                              {link.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  <RelatedActivitySection
                    activities={detailResource.related_activity || []}
                    colors={colors}
                    isDark={isDark}
                    busyKey={busyKey}
                    onAction={confirmRelatedActivityAction}
                    onOpenLink={openExternalLink}
                  />
                </ScrollView>

                <View style={styles.editorFooter}>
                  <TouchableOpacity
                    activeOpacity={0.82}
                    testID="admin-manage-details-close-footer"
                    accessibilityLabel="admin-manage-details-close-footer"
                    style={[styles.footerButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={closeDetails}
                    disabled={Boolean(busyKey)}
                  >
                    <Text style={[styles.footerButtonText, { color: colors.text }]}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.82}
                    testID="admin-manage-details-delete"
                    accessibilityLabel="admin-manage-details-delete"
                    style={[styles.footerButton, { borderColor: '#EF4444', backgroundColor: '#EF444414' }]}
                    onPress={() => {
                      const resource = detailResource;
                      setDetailVisible(false);
                      confirmDelete(resource);
                    }}
                    disabled={Boolean(busyKey)}
                  >
                    <Text style={[styles.footerButtonText, { color: '#EF4444' }]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.82}
                    testID="admin-manage-details-edit"
                    accessibilityLabel="admin-manage-details-edit"
                    style={[styles.footerButton, styles.primaryFooterButton, { backgroundColor: colors.primary }]}
                    onPress={() => openEditEditor(detailResource)}
                    disabled={Boolean(busyKey)}
                  >
                    <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {alert ? (
        <CustomAlert
          visible
          forceModal={alert.forceModal}
          type={alert.type}
          title={alert.title}
          message={alert.message}
          buttons={alert.buttons}
          onClose={() => setAlert(null)}
        />
      ) : null}
    </View>
  );
}

function FieldLabel({ label, colors }: { label: string; colors: any }) {
  return <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>;
}

function SelectedOwnerCard({ owner, colors }: { owner: OwnerOption; colors: any }) {
  return (
    <View style={[styles.selectedOwnerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={[styles.selectedOwnerIcon, { backgroundColor: `${colors.primary}18` }]}>
        <Ionicons name="person-circle-outline" size={19} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.selectedOwnerName, { color: colors.text }]}>
          {getDisplayOwnerName(owner)}
        </Text>
        <Text numberOfLines={1} style={[styles.selectedOwnerMeta, { color: colors.textSecondary }]}>
          {getDisplayOwnerMeta(owner)}
        </Text>
      </View>
    </View>
  );
}

function DocumentLinkControl({
  label,
  url,
  colors,
  onOpenLink,
  onClear,
}: {
  label: string;
  url?: string | null;
  colors: any;
  onOpenLink: (url: string) => void;
  onClear: () => void;
}) {
  const normalizedUrl = String(url || '').trim();
  const hasFile = normalizedUrl.length > 0;

  return (
    <View style={[styles.documentControl, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={[styles.documentIcon, { backgroundColor: `${colors.primary}18` }]}>
        <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.documentLabel, { color: colors.text }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.documentMeta, { color: colors.textSecondary }]}>
          {hasFile ? 'Attached file' : `No ${label.toLowerCase()} attached.`}
        </Text>
      </View>
      {hasFile ? (
        <View style={styles.documentActions}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.documentActionButton, { borderColor: colors.border }]}
            onPress={() => onOpenLink(normalizedUrl)}
          >
            <Ionicons name="open-outline" size={14} color={colors.primary} />
            <Text style={[styles.documentActionText, { color: colors.primary }]}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.documentActionButton, { borderColor: '#EF4444', backgroundColor: '#EF444414' }]}
            onPress={onClear}
          >
            <Ionicons name="close-outline" size={14} color="#EF4444" />
            <Text style={[styles.documentActionText, { color: '#EF4444' }]}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const isInviteActivity = (activity: AdminRelatedActivity) => (
  String(activity.request_kind || '').trim().toLowerCase() === 'invite' ||
  String(activity.title || '').trim().toLowerCase().includes('invite')
);

function RelatedActivityPreview({
  activities,
  colors,
  isDark,
}: {
  activities: AdminRelatedActivity[];
  colors: any;
  isDark: boolean;
}) {
  const inviteCount = activities.filter(isInviteActivity).length;
  const previewActivities = [...activities]
    .sort((a, b) => Number(isInviteActivity(b)) - Number(isInviteActivity(a)))
    .slice(0, 4);

  return (
    <View style={[styles.editorActivityCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.detailCardHeader}>
        <View style={[styles.detailSectionIcon, { backgroundColor: isDark ? '#111827' : '#EFF6FF' }]}>
          <Ionicons name="mail-open-outline" size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.detailCardTitle, { color: colors.text }]}>Invites & Activity</Text>
          <Text style={[styles.relatedMeta, { color: colors.textSecondary }]}>
            {inviteCount} invite(s) | {activities.length} total item(s)
          </Text>
        </View>
      </View>

      {previewActivities.length === 0 ? (
        <Text style={[styles.detailEmpty, { color: colors.textSecondary }]}>
          No related invites or applications yet.
        </Text>
      ) : (
        <View style={styles.editorActivityList}>
          {previewActivities.map((activity, index) => {
            const label = isInviteActivity(activity)
              ? 'Invite'
              : activityTypeLabels[activity.kind] || 'Activity';
            return (
              <View
                key={`${activity.kind}:${activity.id}`}
                style={[styles.editorActivityItem, { borderColor: colors.border, backgroundColor: colors.background }]}
              >
                <Text numberOfLines={1} style={[styles.editorActivityTitle, { color: colors.text }]}>
                  {activity.title || `${label} ${index + 1}`}
                </Text>
                <Text numberOfLines={1} style={[styles.editorActivityMeta, { color: colors.textSecondary }]}>
                  {label} | {normalizeStatusText(activity.status)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function DetailSectionCard({
  section,
  colors,
  isDark,
}: {
  section: DetailSection;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.detailCardHeader}>
        <View style={[styles.detailSectionIcon, { backgroundColor: isDark ? '#111827' : '#EFF6FF' }]}>
          <Ionicons name={section.icon as any} size={17} color={colors.primary} />
        </View>
        <Text style={[styles.detailCardTitle, { color: colors.text }]}>{section.title}</Text>
      </View>

      <View style={styles.detailRows}>
        {section.rows.map((row) => (
          <View key={`${section.title}:${row.label}`} style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{row.label}</Text>
            <Text selectable style={[styles.detailValue, { color: colors.text }]}>
              {valueText(row.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RelatedActivitySection({
  activities,
  colors,
  isDark,
  busyKey,
  onAction,
  onOpenLink,
}: {
  activities: AdminRelatedActivity[];
  colors: any;
  isDark: boolean;
  busyKey: string | null;
  onAction: (activity: AdminRelatedActivity, action: RelatedActivityAction) => void;
  onOpenLink: (url: string) => void;
}) {
  return (
    <View
      testID="admin-manage-related-section"
      accessibilityLabel="admin-manage-related-section"
      style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={styles.detailCardHeader}>
        <View style={[styles.detailSectionIcon, { backgroundColor: isDark ? '#111827' : '#EFF6FF' }]}>
          <Ionicons name="swap-horizontal-outline" size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.detailCardTitle, { color: colors.text }]}>Applications, Invites & Bookings</Text>
          <Text style={[styles.relatedMeta, { color: colors.textSecondary }]}>
            {activities.length} related item(s)
          </Text>
        </View>
      </View>

      {activities.length === 0 ? (
        <Text
          testID="admin-manage-related-empty"
          accessibilityLabel="admin-manage-related-empty"
          style={[styles.detailEmpty, { color: colors.textSecondary }]}
        >
          No related applications, invites, or bookings yet.
        </Text>
      ) : (
        <View style={styles.relatedList}>
          {activities.map((activity) => {
            const actionList = activity.available_actions || [];
            const links = getActivityLinks(activity);
            const testPart = `${activity.kind}-${activity.id}`;

            return (
              <View
                key={testPart}
                testID={`admin-manage-related-card-${testPart}`}
                accessibilityLabel={`admin-manage-related-card-${testPart}`}
                style={[styles.relatedCard, { borderColor: colors.border, backgroundColor: colors.background }]}
              >
                <View style={styles.relatedHeader}>
                  <View style={[styles.relatedIcon, { backgroundColor: isDark ? '#1F2937' : '#F8FAFC' }]}>
                    <Ionicons name={activityTypeIcons[activity.kind] as any} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={[styles.relatedTitle, { color: colors.text }]}>
                      {activity.title || activityTypeLabels[activity.kind]}
                    </Text>
                    <Text numberOfLines={1} style={[styles.relatedSubtitle, { color: colors.textSecondary }]}>
                      {activityTypeLabels[activity.kind]} | {normalizeStatusText(activity.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRows}>
                  {getActivityDetailRows(activity).map((row) => (
                    <View key={`${activity.id}:${row.label}`} style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                      <Text selectable style={[styles.detailValue, { color: colors.text }]}>
                        {valueText(row.value)}
                      </Text>
                    </View>
                  ))}
                </View>

                {links.length > 0 ? (
                  <View style={styles.relatedLinks}>
                    {links.map((link) => (
                      <TouchableOpacity
                        key={`${activity.id}:${link.label}:${link.url}`}
                        activeOpacity={0.82}
                        testID={`admin-manage-related-link-${normalizeTestPart(link.label)}-${activity.id}`}
                        accessibilityLabel={`admin-manage-related-link-${normalizeTestPart(link.label)}-${activity.id}`}
                        style={[styles.attachmentButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                        onPress={() => onOpenLink(link.url)}
                      >
                        <Ionicons name={link.icon as any} size={15} color={colors.primary} />
                        <Text numberOfLines={1} style={[styles.attachmentText, { color: colors.text }]}>
                          {link.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                <View style={styles.relatedActions}>
                  {actionList.length === 0 ? (
                    <Text style={[styles.relatedNoActions, { color: colors.textSecondary }]}>No actions available</Text>
                  ) : (
                    actionList.map((activityAction) => {
                      const isBusy = busyKey === `related:${activity.kind}:${activity.id}:${activityAction.key}`;
                      const toneColor = activityActionColors[activityAction.tone];
                      return (
                        <TouchableOpacity
                          key={`${activity.id}:${activityAction.key}`}
                          activeOpacity={0.82}
                          testID={`admin-manage-related-action-${activityAction.key}-${testPart}`}
                          accessibilityLabel={`admin-manage-related-action-${activityAction.key}-${testPart}`}
                          style={[
                            styles.relatedActionButton,
                            {
                              borderColor: toneColor,
                              backgroundColor: `${toneColor}14`,
                            },
                          ]}
                          onPress={() => onAction(activity, activityAction)}
                          disabled={Boolean(busyKey)}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color={toneColor} />
                          ) : (
                            <Text style={[styles.relatedActionText, { color: toneColor }]}>
                              {activityAction.label}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function OptionRow({
  options,
  value,
  colors,
  onChange,
}: {
  options: string[];
  value: string;
  colors: any;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.optionRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <TouchableOpacity
            key={option}
            activeOpacity={0.82}
            style={[
              styles.optionChip,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : colors.card,
              },
            ]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.optionText, { color: active ? '#FFFFFF' : colors.text }]}>
              {option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SmallField({
  label,
  value,
  colors,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  colors: any;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <FieldLabel label={label} colors={colors} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || '0'}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function TimeField({
  label,
  value,
  colors,
  fallback,
  testIDPrefix,
  onClockChange,
  onTogglePeriod,
}: {
  label: string;
  value: string;
  colors: any;
  fallback: string;
  testIDPrefix: string;
  onClockChange: (clock: string) => void;
  onTogglePeriod: () => void;
}) {
  const normalized = normalizeTimeForInput(value, fallback);
  const clock = getClockPart(normalized, fallback);
  const period = getPeriodPart(normalized, fallback);

  return (
    <View style={{ flex: 1 }}>
      <FieldLabel label={label} colors={colors} />
      <View style={styles.timeInputRow}>
        <TextInput
          testID={`${testIDPrefix}-time`}
          accessibilityLabel={`${testIDPrefix}-time`}
          value={clock}
          onChangeText={onClockChange}
          placeholder={fallback.split(' ')[0]}
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            styles.timeInput,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
          ]}
        />
        <TouchableOpacity
          activeOpacity={0.82}
          testID={`${testIDPrefix}-period`}
          accessibilityLabel={`${testIDPrefix}-period`}
          style={[styles.periodButton, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={onTogglePeriod}
        >
          <Text style={[styles.periodText, { color: colors.primary }]}>{period}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ResourceImageGallery({
  resource,
  colors,
  onOpenLink,
}: {
  resource: AdminResource;
  colors: any;
  onOpenLink: (url: string) => void;
}) {
  const images = getResourceImages(resource);
  if (images.length === 0) return null;

  return (
    <View
      testID="admin-manage-image-gallery"
      accessibilityLabel="admin-manage-image-gallery"
      style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={styles.detailCardHeader}>
        <Ionicons name="images-outline" size={18} color={colors.primary} />
        <Text style={[styles.detailCardTitle, { color: colors.text }]}>Images</Text>
      </View>
      <View style={styles.imageGalleryGrid}>
        {images.map((image, index) => (
          <TouchableOpacity
            key={`${image.url}:${index}`}
            activeOpacity={0.82}
            testID={`admin-manage-image-preview-${index + 1}`}
            accessibilityLabel={`admin-manage-image-preview-${index + 1}`}
            style={[styles.imageGalleryTile, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => onOpenLink(image.url)}
          >
            <Image source={{ uri: image.url }} style={styles.imageGalleryImage} resizeMode="cover" />
            <View style={styles.imageGalleryMeta}>
              <Text style={[styles.imageGalleryLabel, { color: colors.text }]}>{image.label}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBand: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  pageMeta: { marginTop: 2, fontSize: 12, fontFamily: 'Poppins_400Regular' },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 9, fontSize: 14, fontFamily: 'Poppins_400Regular' },
  tabRow: { gap: 8, paddingVertical: 2 },
  tabButton: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  createRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  createButton: {
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  createButtonText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Poppins_700Bold' },
  content: { padding: 18, paddingTop: 8, paddingBottom: 90 },
  loadingBlock: { alignItems: 'center', gap: 12, paddingTop: 42 },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
  emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
  grid: { gap: 12 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  resourceCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  resourceCardWide: {
    width: '32.3%',
    minWidth: 290,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resourceIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
  cardMeta: { marginTop: 2, fontSize: 12, fontFamily: 'Poppins_400Regular' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaCell: { width: '48%' },
  metaCellWide: { width: '100%' },
  metaLabel: { fontSize: 10, textTransform: 'uppercase', fontFamily: 'Poppins_600SemiBold' },
  metaValue: { marginTop: 2, fontSize: 12, fontFamily: 'Poppins_500Medium', textTransform: 'capitalize' },
  description: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
  detailLine: { minHeight: 20, justifyContent: 'center' },
  detailText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowButton: {
    flex: 1,
    minWidth: 88,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rowButtonText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  editor: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  detailPanel: {
    width: '100%',
    maxWidth: 860,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  editorHeader: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editorTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  editorSubtitle: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_400Regular' },
  statusBadge: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusBadgeText: { fontSize: 11, fontFamily: 'Poppins_700Bold', textTransform: 'capitalize' },
  detailBody: { padding: 16, gap: 12, paddingBottom: 24 },
  detailCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  detailCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  detailSectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCardTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
  detailRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailRow: {
    minWidth: 220,
    flexBasis: '31%',
    flexGrow: 1,
  },
  detailLabel: { fontSize: 10, textTransform: 'uppercase', fontFamily: 'Poppins_700Bold' },
  detailValue: { marginTop: 3, fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_500Medium' },
  detailEmpty: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachmentButton: {
    minHeight: 34,
    maxWidth: 220,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attachmentText: { flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
  relatedMeta: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_400Regular' },
  relatedList: { gap: 10 },
  relatedCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  relatedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  relatedIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedTitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Poppins_700Bold' },
  relatedSubtitle: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_500Medium', textTransform: 'capitalize' },
  relatedLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relatedActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relatedActionButton: {
    minHeight: 34,
    minWidth: 96,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedActionText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  relatedNoActions: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
  segmentedRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  segmentButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  editorBody: { padding: 16, paddingBottom: 24 },
  fieldLabel: { marginTop: 12, marginBottom: 7, fontSize: 12, fontFamily: 'Poppins_700Bold' },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  ownerRow: { gap: 8, paddingVertical: 9 },
  ownerChip: {
    width: 210,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  ownerName: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  ownerEmail: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_400Regular' },
  ownerHint: { marginTop: 4, fontSize: 12, fontFamily: 'Poppins_400Regular' },
  selectedOwnerCard: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedOwnerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedOwnerName: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
  selectedOwnerMeta: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_400Regular' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', textTransform: 'capitalize' },
  twoColumn: { flexDirection: 'row', gap: 10 },
  datePickerButton: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePickerText: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  calendarPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  timeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, minWidth: 0 },
  periodButton: {
    minHeight: 42,
    minWidth: 58,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  imageGalleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  imageGalleryTile: {
    width: 190,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  imageGalleryImage: { width: '100%', height: 118, backgroundColor: '#E5E7EB' },
  imageGalleryMeta: { padding: 9, gap: 4 },
  imageGalleryLabel: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  documentControl: {
    marginTop: 12,
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  documentIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentLabel: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
  documentMeta: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_400Regular' },
  documentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  documentActionButton: {
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  documentActionText: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
  editorActivityCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  editorActivityList: { gap: 8 },
  editorActivityItem: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  editorActivityTitle: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
  editorActivityMeta: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_500Medium', textTransform: 'capitalize' },
  switchRow: {
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchTitle: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
  switchMeta: { marginTop: 2, fontSize: 11, fontFamily: 'Poppins_400Regular' },
  editorFooter: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.35)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  footerButton: {
    minHeight: 40,
    minWidth: 112,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryFooterButton: { borderWidth: 0 },
  footerButtonText: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
});
