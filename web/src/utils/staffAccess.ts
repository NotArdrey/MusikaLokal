export type StaffEntityType = 'studio' | 'venue' | 'production';
export type StaffAccessLevel = 1 | 2 | 3;

export type StaffAssignment = {
  id: string;
  staff_user_id: string;
  entity_type: StaffEntityType;
  studio_id: string | null;
  gig_id: string | null;
  production_team_id: string | null;
  access_level: StaffAccessLevel;
  target_id: string | null;
  target_name?: string | null;
};

export type StaffPermissions = {
  canEditListing: boolean;
  canManageBookings: boolean;
  canViewOnly: boolean;
};

export const STAFF_ACCESS_LEVEL_LABELS: Record<StaffAccessLevel, string> = {
  1: 'Level 1 - edit and actions',
  2: 'Level 2 - actions only',
  3: 'Level 3 - view only',
};

export const STAFF_ENTITY_LABELS: Record<StaffEntityType, string> = {
  studio: 'Studio',
  venue: 'Gig',
  production: 'Production',
};

export const normalizeStaffEntityType = (value: unknown): StaffEntityType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'studio' || normalized === 'venue' || normalized === 'production') {
    return normalized;
  }
  return null;
};

export const normalizeStaffAccessLevel = (value: unknown): StaffAccessLevel | null => {
  const numeric = Number(value);
  if (numeric === 1 || numeric === 2 || numeric === 3) return numeric;
  return null;
};

export const getStaffTargetId = (assignment?: Partial<StaffAssignment> | null): string | null => {
  if (!assignment) return null;
  const entityType = normalizeStaffEntityType(assignment.entity_type);
  if (entityType === 'studio') return assignment.studio_id || null;
  if (entityType === 'venue') return assignment.gig_id || null;
  if (entityType === 'production') return assignment.production_team_id || null;
  return assignment.target_id || null;
};

export const getStaffPermissions = (accessLevel: unknown): StaffPermissions => {
  const level = normalizeStaffAccessLevel(accessLevel);
  return {
    canEditListing: level === 1,
    canManageBookings: level === 1 || level === 2,
    canViewOnly: level === 3,
  };
};

export const isStaffRole = (role: unknown): boolean =>
  String(role || '').trim().toLowerCase() === 'staff';

export const fetchActiveStaffAssignment = async (
  supabase: any,
  userId: string,
): Promise<StaffAssignment | null> => {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('staff_listing_access')
    .select('id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level')
    .eq('staff_user_id', userId)
    .is('revoked_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const entityType = normalizeStaffEntityType(data.entity_type);
  const accessLevel = normalizeStaffAccessLevel(data.access_level);
  if (!entityType || !accessLevel) return null;

  return {
    id: String(data.id),
    staff_user_id: String(data.staff_user_id),
    entity_type: entityType,
    studio_id: data.studio_id || null,
    gig_id: data.gig_id || null,
    production_team_id: data.production_team_id || null,
    access_level: accessLevel,
    target_id:
      entityType === 'studio'
        ? data.studio_id || null
        : entityType === 'venue'
          ? data.gig_id || null
          : data.production_team_id || null,
  };
};
