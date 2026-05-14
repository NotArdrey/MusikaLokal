import { getSupabaseAdmin } from './supabase';

const missingColumnCodes = new Set(['PGRST204', 'PGRST205', '42703', '42P01']);

async function ignoreSchemaDrift<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error: any) {
    if (missingColumnCodes.has(String(error?.code || ''))) return null;
    if (/column .* does not exist|relation .* does not exist/i.test(String(error?.message || ''))) return null;
    throw error;
  }
}

async function deleteWhereIn(table: string, column: string, values: string[]) {
  if (values.length === 0) return;
  await ignoreSchemaDrift(async () => {
    const { error } = await getSupabaseAdmin().from(table).delete().in(column, values);
    if (error) throw error;
  });
}

async function deleteWhereTextStarts(table: string, column: string, prefix: string) {
  await ignoreSchemaDrift(async () => {
    const { error } = await getSupabaseAdmin().from(table).delete().ilike(column, `${prefix}%`);
    if (error) throw error;
  });
}

async function getE2EProfileIds() {
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, email, full_name')
    .or('email.ilike.e2e+%,full_name.ilike.E2E %');

  if (error) throw error;
  return (data || []).map((profile: any) => String(profile.id)).filter(Boolean);
}

async function getE2EWalletIds(profileIds: string[]) {
  if (profileIds.length === 0) return [];

  const { data, error } = await getSupabaseAdmin()
    .from('wallets')
    .select('id')
    .in('user_id', profileIds);

  if (error) throw error;
  return (data || []).map((wallet: any) => String(wallet.id)).filter(Boolean);
}

async function getE2EFeedPostIds(profileIds: string[]) {
  if (profileIds.length === 0) return [];

  const { data, error } = await getSupabaseAdmin()
    .from('feed_posts')
    .select('id')
    .in('author_id', profileIds);

  if (error) throw error;
  return (data || []).map((post: any) => String(post.id)).filter(Boolean);
}

export async function cleanupE2ERecords() {
  const client = getSupabaseAdmin();
  const profileIds = await getE2EProfileIds();
  const walletIds = await getE2EWalletIds(profileIds);
  const feedPostIds = await getE2EFeedPostIds(profileIds);

  await deleteWhereIn('post_comments', 'author_id', profileIds);
  await deleteWhereIn('post_reactions', 'user_id', profileIds);
  await deleteWhereIn('post_media', 'post_id', feedPostIds);
  await deleteWhereIn('social_activity_events', 'actor_id', profileIds);
  await deleteWhereIn('social_activity_events', 'target_user_id', profileIds);
  await deleteWhereIn('follows', 'follower_id', profileIds);
  await deleteWhereIn('follows', 'followed_id', profileIds);
  await deleteWhereIn('feed_posts', 'author_id', profileIds);
  await deleteWhereIn('reports', 'reporter_id', profileIds);
  await deleteWhereIn('reports', 'reviewed_by', profileIds);
  await deleteWhereTextStarts('reports', 'reason', 'E2E ');
  await deleteWhereIn('manual_identity_reviews', 'user_id', profileIds);
  await deleteWhereIn('identity_document_claims', 'user_id', profileIds);
  await deleteWhereIn('profile_portfolio_urls', 'profile_id', profileIds);
  await deleteWhereIn('profile_genres', 'profile_id', profileIds);
  await deleteWhereIn('profile_skills', 'profile_id', profileIds);
  await deleteWhereIn('payout_methods', 'user_id', profileIds);
  await deleteWhereIn('withdrawal_requests', 'user_id', profileIds);
  await deleteWhereIn('wallet_deposits', 'user_id', profileIds);
  await deleteWhereIn('wallet_transactions', 'wallet_id', walletIds);
  await deleteWhereIn('wallets', 'user_id', profileIds);
  await deleteWhereIn('platform_withdrawals', 'processed_by', profileIds);
  await deleteWhereIn('booking_incidents', 'reporter_user_id', profileIds);
  await deleteWhereIn('booking_incidents', 'counterparty_user_id', profileIds);
  await deleteWhereIn('booking_requests', 'sender_id', profileIds);
  await deleteWhereIn('booking_requests', 'receiver_id', profileIds);
  await deleteWhereIn('studio_bookings', 'user_id', profileIds);
  await deleteWhereIn('gig_applications', 'applicant_id', profileIds);
  await deleteWhereIn('notifications', 'user_id', profileIds);
  await deleteWhereIn('playlist_play_events', 'user_id', profileIds);
  await deleteWhereIn('stations', 'creator_id', profileIds);
  await deleteWhereIn('stations', 'managed_profile_id', profileIds);
  await deleteWhereTextStarts('stations', 'name', 'E2E ');
  await deleteWhereIn('playlists', 'creator_id', profileIds);
  await deleteWhereTextStarts('playlists', 'title', 'E2E ');
  await deleteWhereIn('products', 'seller_id', profileIds);
  await deleteWhereTextStarts('products', 'title', 'E2E ');
  await deleteWhereIn('production_team_roster', 'profile_id', profileIds);
  await deleteWhereIn('production_team_roster', 'added_by_user_id', profileIds);
  await deleteWhereIn('production_team_members', 'user_id', profileIds);
  await deleteWhereIn('production_teams', 'owner_id', profileIds);
  await deleteWhereTextStarts('production_teams', 'name', 'E2E ');
  await deleteWhereIn('group_members', 'user_id', profileIds);
  await deleteWhereIn('groups', 'owner_id', profileIds);
  await deleteWhereTextStarts('groups', 'name', 'E2E ');
  await deleteWhereIn('gigs', 'organizer_id', profileIds);
  await deleteWhereTextStarts('gigs', 'name', 'E2E ');
  await deleteWhereIn('studios', 'owner_id', profileIds);
  await deleteWhereTextStarts('studios', 'name', 'E2E ');
  await deleteWhereIn('profiles', 'id', profileIds);
  await deleteWhereTextStarts('profiles', 'full_name', 'E2E ');

  const { data: authUsers, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  for (const user of authUsers.users) {
    const email = String(user.email || '').toLowerCase();
    if (!email.startsWith('e2e+')) continue;
    const { error: deleteError } = await client.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
}
