import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertE2EEmail, assertE2EName, loadE2EEnv } from './env';

type Role = 'admin' | 'musician' | 'studio-owner' | 'venue-owner' | 'producer' | 'fan';

let serviceClient: SupabaseClient | null = null;

export const getSupabaseAdmin = () => {
  if (serviceClient) return serviceClient;

  const env = loadE2EEnv();
  serviceClient = createClient(env.E2E_SUPABASE_URL, env.E2E_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        'x-client-info': 'musika-lokal-e2e',
      },
    },
  });

  return serviceClient;
};

export const getSupabaseAnon = () => {
  const env = loadE2EEnv();
  return createClient(env.E2E_SUPABASE_URL, env.E2E_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
};

export async function findAuthUserByEmail(email: string) {
  assertE2EEmail(email);
  const client = getSupabaseAdmin();
  const normalizedEmail = email.toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < 1000) return null;
    page += 1;
  }

  throw new Error('Too many auth users to scan while looking for an E2E account.');
}

export async function upsertE2EAuthUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  verified?: boolean;
}) {
  assertE2EEmail(input.email);
  assertE2EName(input.fullName);

  const client = getSupabaseAdmin();
  const metadata = {
    full_name: input.fullName,
    role: input.role,
    is_verified: input.verified ?? true,
    verification_status: input.verified === false ? 'PENDING_REVIEW' : 'APPROVED',
    e2e: true,
  };
  const existing = await findAuthUserByEmail(input.email);

  const authResult = existing
    ? await client.auth.admin.updateUserById(existing.id, {
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: metadata,
      })
    : await client.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: metadata,
      });

  if (authResult.error) throw authResult.error;
  const userId = authResult.data.user.id;

  const { error: profileError } = await client.from('profiles').upsert({
    id: userId,
    email: input.email.toLowerCase(),
    full_name: input.fullName,
    role: input.role,
    is_verified: input.verified ?? true,
    verification_status: input.verified === false ? 'PENDING_REVIEW' : 'APPROVED',
    bio: 'E2E seeded profile',
    location: 'E2E Manila',
    contact_number: '+639170000000',
    address: 'E2E Test Address',
  });

  if (profileError) throw profileError;

  await client.from('profile_skills').delete().eq('profile_id', userId);
  await client.from('profile_genres').delete().eq('profile_id', userId);

  const { error: skillsError } = await client
    .from('profile_skills')
    .insert([
      { profile_id: userId, skill: 'Guitar' },
      { profile_id: userId, skill: 'Vocals' },
    ]);
  if (skillsError) throw skillsError;

  const { error: genresError } = await client
    .from('profile_genres')
    .insert([
      { profile_id: userId, genre: 'OPM' },
      { profile_id: userId, genre: 'Jazz' },
    ]);
  if (genresError) throw genresError;

  return {
    id: userId,
    email: input.email.toLowerCase(),
    password: input.password,
    fullName: input.fullName,
    role: input.role,
  };
}

export async function getProfileByEmail(email: string) {
  assertE2EEmail(email);
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function requireProfileByEmail(email: string) {
  const profile = await getProfileByEmail(email);
  if (!profile) throw new Error(`Expected profile for ${email}`);
  return profile;
}

export async function requireRecordByColumn<T extends Record<string, unknown>>(
  table: string,
  column: string,
  value: string,
) {
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .select('*')
    .eq(column, value)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Expected ${table}.${column}=${value}`);
  return data as T;
}

export async function maybeRecordByColumn<T extends Record<string, unknown>>(
  table: string,
  column: string,
  value: string,
) {
  const { data, error } = await getSupabaseAdmin()
    .from(table)
    .select('*')
    .eq(column, value)
    .maybeSingle();

  if (error) throw error;
  return data as T | null;
}

export async function deleteAuthUserByEmail(email: string) {
  assertE2EEmail(email);
  const user = await findAuthUserByEmail(email);
  if (!user) return;

  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(user.id);
  if (error) throw error;
}
