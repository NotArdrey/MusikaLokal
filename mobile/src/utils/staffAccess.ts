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

type StaffAssignmentFetchOptions = {
  forceRefresh?: boolean;
};

const STAFF_ASSIGNMENTS_CACHE_MS = 15_000;
const STAFF_ASSIGNMENTS_TIMEOUT_MS = 10_000;

const staffAssignmentsCache = new Map<string, { assignments: StaffAssignment[]; expiresAt: number }>();
const staffAssignmentsInFlight = new Map<string, Promise<StaffAssignment[]>>();
const staffAssignmentCache = new Map<string, { assignment: StaffAssignment | null; expiresAt: number }>();
const staffAssignmentInFlight = new Map<string, Promise<StaffAssignment | null>>();

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

const normalizeStaffAssignment = (row: any): StaffAssignment | null => {
  const entityType = normalizeStaffEntityType(row?.entity_type);
  const accessLevel = normalizeStaffAccessLevel(row?.access_level);
  if (!entityType || !accessLevel) return null;

  return {
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
  };
};

const withStaffAssignmentTimeout = async <T>(request: PromiseLike<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Staff workspaces took too long to load. Please try again.'));
        }, STAFF_ASSIGNMENTS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const fetchActiveStaffAssignment = async (
  supabase: any,
  userId: string,
  entityType?: StaffEntityType,
  targetId?: string,
): Promise<StaffAssignment | null> => {
  if (!userId) return null;

  const requestKey = `${userId}:${entityType || '*'}:${targetId || '*'}`;

  const cached = staffAssignmentsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.assignments.find((assignment) => (
      (!entityType || assignment.entity_type === entityType) &&
      (!targetId || getStaffTargetId(assignment) === targetId)
    )) || null;
  }

  const cachedAssignment = staffAssignmentCache.get(requestKey);
  if (cachedAssignment && cachedAssignment.expiresAt > Date.now()) {
    return cachedAssignment.assignment;
  }

  const existingRequest = staffAssignmentInFlight.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    let query = supabase
      .from('staff_listing_access')
      .select('id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level')
      .eq('staff_user_id', userId)
      .is('revoked_at', null);

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    if (targetId && entityType === 'studio') query = query.eq('studio_id', targetId);
    if (targetId && entityType === 'venue') query = query.eq('gig_id', targetId);
    if (targetId && entityType === 'production') query = query.eq('production_team_id', targetId);

    const { data, error } = await withStaffAssignmentTimeout<any>(
      query.order('created_at', { ascending: true }).limit(1).maybeSingle(),
    );

    if (error) throw error;
    const assignment = data ? normalizeStaffAssignment(data) : null;
    staffAssignmentCache.set(requestKey, {
      assignment,
      expiresAt: Date.now() + STAFF_ASSIGNMENTS_CACHE_MS,
    });
    return assignment;
  })();

  staffAssignmentInFlight.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (staffAssignmentInFlight.get(requestKey) === request) {
      staffAssignmentInFlight.delete(requestKey);
    }
  }
};

export const fetchActiveStaffAssignments = async (
  supabase: any,
  userId: string,
  options: StaffAssignmentFetchOptions = {},
): Promise<StaffAssignment[]> => {
  if (!userId) return [];

  const cached = staffAssignmentsCache.get(userId);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.assignments;
  }

  const existingRequest = staffAssignmentsInFlight.get(userId);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const { data, error } = await withStaffAssignmentTimeout<any>(
      supabase
        .from('staff_listing_access')
        .select('id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level')
        .eq('staff_user_id', userId)
        .is('revoked_at', null)
        .order('created_at', { ascending: true }),
    );

    if (error) throw error;
    const assignments = (data || [])
      .map(normalizeStaffAssignment)
      .filter((assignment: StaffAssignment | null): assignment is StaffAssignment => Boolean(assignment));

    staffAssignmentsCache.set(userId, {
      assignments,
      expiresAt: Date.now() + STAFF_ASSIGNMENTS_CACHE_MS,
    });
    return assignments;
  })();

  staffAssignmentsInFlight.set(userId, request);
  try {
    return await request;
  } finally {
    if (staffAssignmentsInFlight.get(userId) === request) {
      staffAssignmentsInFlight.delete(userId);
    }
  }
};
