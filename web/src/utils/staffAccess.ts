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
  entityType?: StaffEntityType,
  targetId?: string,
): Promise<StaffAssignment | null> => {
  const assignments = await fetchActiveStaffAssignments(supabase, userId);
  if (!entityType) return assignments[0] || null;

  return assignments.find((assignment) => (
    assignment.entity_type === entityType &&
    (!targetId || getStaffTargetId(assignment) === targetId)
  )) || null;
};

export const fetchActiveStaffAssignments = async (
  supabase: any,
  userId: string,
): Promise<StaffAssignment[]> => {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('staff_listing_access')
    .select('id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level')
    .eq('staff_user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).flatMap((row: any) => {
    const entityType = normalizeStaffEntityType(row.entity_type);
    const accessLevel = normalizeStaffAccessLevel(row.access_level);
    if (!entityType || !accessLevel) return [];

    return [{
      id: String(row.id),
      staff_user_id: String(row.staff_user_id),
      entity_type: entityType,
      studio_id: row.studio_id || null,
      gig_id: row.gig_id || null,
      production_team_id: row.production_team_id || null,
      access_level: accessLevel,
      target_id:
        entityType === 'studio'
          ? row.studio_id || null
          : entityType === 'venue'
            ? row.gig_id || null
            : row.production_team_id || null,
    }];
  });
};
