import { assertE2EEmail, assertE2EName, makeRunId } from './env';
import { findAuthUserByEmail, getSupabaseAdmin } from './supabase';

export type StaffEntityType = 'studio' | 'venue' | 'production';
export type StaffAccessLevel = 1 | 2 | 3;

export type E2EStaffUser = {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: 'staff';
};

export async function seedE2EStaffUser(input: {
  suffix: string;
  fullName: string;
  password?: string;
}) {
  assertE2EName(input.fullName);

  const runId = makeRunId(input.suffix);
  const email = `e2e+${runId}@musikalokal.test`.toLowerCase();
  const password = input.password || 'E2E-password-123';
  assertE2EEmail(email);

  const client = getSupabaseAdmin();
  const metadata = {
    full_name: input.fullName,
    role: 'staff',
    is_verified: true,
    verification_status: 'APPROVED',
    e2e: true,
  };
  const existing = await findAuthUserByEmail(email);
  const authResult = existing
    ? await client.auth.admin.updateUserById(existing.id, {
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      })
    : await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

  if (authResult.error) throw authResult.error;
  const userId = authResult.data.user.id;

  const { error: profileError } = await client.from('profiles').upsert({
    id: userId,
    email,
    full_name: input.fullName,
    role: 'staff',
    is_verified: true,
    verification_status: 'APPROVED',
    bio: 'E2E seeded staff profile',
    location: 'E2E Manila',
    contact_number: '+639170000000',
    address: 'E2E Test Address',
  });

  if (profileError) throw profileError;

  return {
    id: userId,
    email,
    password,
    fullName: input.fullName,
    role: 'staff' as const,
  };
}

export async function seedE2EStaffAssignment(input: {
  staffUserId: string;
  entityType: StaffEntityType;
  targetId: string;
  accessLevel: StaffAccessLevel;
}) {
  const client = getSupabaseAdmin();

  const { error: deleteError } = await client
    .from('staff_listing_access')
    .delete()
    .eq('staff_user_id', input.staffUserId);
  if (deleteError) throw deleteError;

  const row = {
    staff_user_id: input.staffUserId,
    entity_type: input.entityType,
    studio_id: input.entityType === 'studio' ? input.targetId : null,
    gig_id: input.entityType === 'venue' ? input.targetId : null,
    production_team_id: input.entityType === 'production' ? input.targetId : null,
    access_level: input.accessLevel,
  };

  const { data, error } = await client
    .from('staff_listing_access')
    .insert(row)
    .select('id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level')
    .single();

  if (error) throw error;
  return data;
}
