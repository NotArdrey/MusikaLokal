import { assertE2EName, loadE2EEnv, makeRunId } from './env';
import { getSupabaseAdmin, upsertE2EAuthUser } from './supabase';

export async function seedE2EAdmin() {
  const env = loadE2EEnv();
  return upsertE2EAuthUser({
    email: env.E2E_ADMIN_EMAIL,
    password: env.E2E_ADMIN_PASSWORD,
    fullName: 'E2E Admin',
    role: 'admin',
    verified: true,
  });
}

export async function seedE2EMobileUser(suffix = 'mobile-musician') {
  const runId = makeRunId(suffix);
  const shortToken = `m${Date.now().toString(36)}-${suffix.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 8).toLowerCase()}`;
  return upsertE2EAuthUser({
    email: `e2e+${shortToken}@musikalokal.test`,
    password: 'E2E-password-123',
    fullName: `E2E Mobile Musician ${runId}`,
    role: 'musician',
    verified: true,
  });
}

export async function seedE2EUser(input: {
  suffix: string;
  role: 'admin' | 'musician' | 'studio-owner' | 'venue-owner' | 'producer' | 'fan';
  fullName: string;
  password?: string;
  verified?: boolean;
}) {
  assertE2EName(input.fullName);
  const runId = makeRunId(input.suffix);
  return upsertE2EAuthUser({
    email: `e2e+${runId}@musikalokal.test`,
    password: input.password || 'E2E-password-123',
    fullName: input.fullName,
    role: input.role,
    verified: input.verified ?? true,
  });
}

export async function seedE2EStudio(ownerId: string, suffix = 'studio') {
  const runId = makeRunId(suffix);
  const name = `E2E Studio ${runId}`;
  const { data, error } = await getSupabaseAdmin()
    .from('studios')
    .insert({
      owner_id: ownerId,
      name,
      address: 'E2E Studio Address',
      hourly_rate: 500,
      rehearsal_rate: 500,
      recording_rate: 1000,
      description: 'E2E seeded studio',
      latitude: 14.5995,
      longitude: 120.9842,
      permit_status: 'approved',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EGig(organizerId: string, suffix = 'gig') {
  const runId = makeRunId(suffix);
  const name = `E2E Gig ${runId}`;
  const { data, error } = await getSupabaseAdmin()
    .from('gigs')
    .insert({
      organizer_id: organizerId,
      name,
      location: 'E2E Gig Venue',
      budget: 5000,
      rate: 5000,
      description: 'E2E seeded gig',
      event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'open',
      latitude: 14.5995,
      longitude: 120.9842,
      permit_status: 'approved',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EGroup(ownerId: string, suffix = 'group') {
  const runId = makeRunId(suffix);
  const name = `E2E Group ${runId}`;
  const { data, error } = await getSupabaseAdmin()
    .from('groups')
    .insert({
      owner_id: ownerId,
      name,
      genre: 'OPM',
      description: 'E2E seeded group',
      location: 'E2E Group Address',
      latitude: 14.5995,
      longitude: 120.9842,
      group_type: 'band',
    })
    .select('*')
    .single();

  if (error) throw error;

  const { error: memberError } = await getSupabaseAdmin()
    .from('group_members')
    .upsert({
      group_id: data.id,
      user_id: ownerId,
      role: 'owner',
    }, { onConflict: 'group_id,user_id' });
  if (memberError) throw memberError;

  return data;
}

export async function seedE2EStation(creatorId: string, suffix = 'station') {
  const runId = makeRunId(suffix);
  const name = `E2E Station ${runId}`;
  const { data, error } = await getSupabaseAdmin()
    .from('stations')
    .insert({
      creator_id: creatorId,
      managed_profile_id: creatorId,
      name,
      description: `E2E seeded station ${runId}`,
      genre: 'OPM',
      is_active: true,
      is_featured: false,
      rotation_interval_minutes: 15,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EProductionTeam(ownerId: string, suffix = 'production') {
  const runId = makeRunId(suffix);
  const name = `E2E Production ${runId}`;
  const { data, error } = await getSupabaseAdmin()
    .from('production_teams')
    .insert({
      owner_id: ownerId,
      name,
      description: `E2E seeded production team ${runId}`,
      logo_url: 'https://example.com/e2e-fixture.png',
    })
    .select('*')
    .single();

  if (error) throw error;

  const { error: memberError } = await getSupabaseAdmin()
    .from('production_team_members')
    .upsert({
      team_id: data.id,
      user_id: ownerId,
      role: 'owner',
    }, { onConflict: 'team_id,user_id' });
  if (memberError) throw memberError;

  return data;
}

export async function seedE2EProductionConnectionRequest(input: {
  productionTeamId: string;
  productionTeamName: string;
  producerId: string;
  producerName: string;
  participantId: string;
  participantName: string;
  participantType: 'musician' | 'group';
  groupId?: string;
  direction: 'application' | 'invite';
  suffix?: string;
}) {
  const runId = makeRunId(input.suffix || `production-${input.direction}`);
  const participantIsGroup = input.participantType === 'group';
  if (participantIsGroup && !input.groupId) {
    throw new Error('seedE2EProductionConnectionRequest requires groupId for group requests.');
  }
  const senderIsProduction = input.direction === 'invite';
  const senderEntityType = senderIsProduction ? 'production_team' : input.participantType;
  const receiverEntityType = senderIsProduction ? input.participantType : 'production_team';
  const senderEntityName = senderIsProduction ? input.productionTeamName : input.participantName;
  const receiverEntityName = senderIsProduction ? input.participantName : input.productionTeamName;
  const senderEntityId = senderIsProduction
    ? input.productionTeamId
    : participantIsGroup
      ? input.groupId
      : input.participantId;
  const receiverEntityId = senderIsProduction
    ? participantIsGroup
      ? input.groupId
      : input.participantId
    : input.productionTeamId;

  const { data, error } = await getSupabaseAdmin()
    .from('booking_requests')
    .insert({
      sender_id: senderIsProduction ? input.producerId : input.participantId,
      receiver_id: senderIsProduction ? input.participantId : input.producerId,
      group_id: participantIsGroup ? input.groupId : null,
      status: 'pending',
      message: `E2E production ${input.direction} ${runId}`,
      attachment_url: senderIsProduction
        ? 'https://example.com/e2e-production-contract.pdf'
        : 'https://example.com/e2e-production-cv.pdf',
      event_details: {
        sender_entity_type: senderEntityType,
        sender_entity_id: senderEntityId,
        sender_entity_name: senderEntityName,
        receiver_entity_type: receiverEntityType,
        receiver_entity_id: receiverEntityId,
        receiver_entity_name: receiverEntityName,
        production_team_id: input.productionTeamId,
        request_kind: input.direction === 'invite' ? 'invite' : 'application',
        request_details: {
          request_kind: input.direction === 'invite' ? 'invite' : 'application',
          pitch_message: `E2E production ${input.direction} pitch ${runId}`,
          application_context: input.direction === 'invite'
            ? `E2E production invite context ${runId}`
            : `E2E production application context ${runId}`,
          context_label: input.direction === 'invite' ? 'Invite Context' : 'Application Context',
          slot_type: participantIsGroup ? 'group' : 'solo',
          roster_entry_name: input.participantName,
          roster_entry_kind: participantIsGroup ? 'group' : 'musician',
          cv_url: senderIsProduction ? null : 'https://example.com/e2e-production-cv.pdf',
          contract_url: senderIsProduction ? 'https://example.com/e2e-production-contract.pdf' : null,
        },
        route: '/production_team',
        route_params: { teamId: input.productionTeamId },
      },
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EStudioBooking(input: {
  userId: string;
  studioId: string;
  suffix?: string;
  status?: string;
  paymentStatus?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  paymentType?: string;
  remainingBalance?: number;
  paymentAmount?: number;
  notes?: string;
}) {
  const runId = makeRunId(input.suffix || 'studio-booking');
  const finalPrice = 1000;
  const remainingBalance = input.remainingBalance ?? 0;
  const paymentAmount = input.paymentAmount ?? Math.max(0, finalPrice - remainingBalance);
  const { data, error } = await getSupabaseAdmin()
    .from('studio_bookings')
    .insert({
      user_id: input.userId,
      studio_id: input.studioId,
      booking_date: input.bookingDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      start_time: input.startTime || '10:00',
      end_time: input.endTime || '12:00',
      base_rate: 500,
      hours: 2,
      subtotal: 1000,
      modifiers_applied: {},
      final_price: finalPrice,
      status: input.status || 'confirmed',
      payment_status: input.paymentStatus || 'paid',
      payment_type: input.paymentType || 'full',
      payment_amount: paymentAmount,
      remaining_balance: remainingBalance,
      paid_at: ['paid', 'partial'].includes(input.paymentStatus || 'paid') ? new Date().toISOString() : null,
      notes: input.notes || `E2E booking ${runId}`,
      buffer_minutes: 30,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EGigApplication(input: {
  applicantId: string;
  gigId: string;
  suffix?: string;
  status?: string;
  submittedByUserId?: string;
  leaderApprovalStatus?: string | null;
}) {
  const runId = makeRunId(input.suffix || 'gig-application');
  const { data, error } = await getSupabaseAdmin()
    .from('gig_applications')
    .insert({
      applicant_id: input.applicantId,
      submitted_by_user_id: input.submittedByUserId || input.applicantId,
      gig_id: input.gigId,
      pitch_message: `E2E gig application pitch ${runId}`,
      note: `E2E gig application note ${runId}`,
      video_url: 'https://example.com/e2e-audition.mp4',
      cv_url: 'https://example.com/e2e-cv.pdf',
      status: input.status || 'pending',
      is_solo_application: true,
      leader_approval_status: input.leaderApprovalStatus,
      slot_type: 'solo',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EBookingIncident(input: {
  bookingId: string;
  reporterId: string;
  counterpartyId: string;
  suffix?: string;
}) {
  const runId = makeRunId(input.suffix || 'booking-incident');
  const { data, error } = await getSupabaseAdmin()
    .from('booking_incidents')
    .insert({
      booking_id: input.bookingId,
      reporter_user_id: input.reporterId,
      counterparty_user_id: input.counterpartyId,
      issue_type: 'cannot_access_studio',
      status: 'open',
      reporter_notes: `E2E booking incident ${runId}`,
      response_deadline_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EWallet(userId: string, balance = 1000) {
  await getSupabaseAdmin()
    .from('wallets')
    .delete()
    .eq('user_id', userId);

  const { data, error } = await getSupabaseAdmin()
    .from('wallets')
    .insert({
      user_id: userId,
      balance,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EPayoutMethod(userId: string, suffix = 'payout-method') {
  const runId = makeRunId(suffix);
  const { data, error } = await getSupabaseAdmin()
    .from('payout_methods')
    .insert({
      user_id: userId,
      type: 'gcash',
      account_name: `E2E Payout ${runId}`,
      account_number: '09171234567',
      is_default: true,
      is_verified: true,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EFeedPost(authorId: string, suffix = 'feed-post') {
  const runId = makeRunId(suffix);
  const content = `E2E Post ${runId}`;
  const { data, error } = await getSupabaseAdmin()
    .from('feed_posts')
    .insert({
      author_id: authorId,
      post_type: 'text',
      content,
      visibility: 'public',
      is_reported: true,
      is_hidden: false,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EProduct(sellerId: string, suffix = 'product') {
  const runId = makeRunId(suffix);
  const title = `E2E Product ${runId}`;
  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .insert({
      seller_id: sellerId,
      title,
      description: `E2E product description ${runId}`,
      product_type: 'merch',
      category: 'other',
      base_price: 1234,
      currency: 'PHP',
      status: 'active',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EReport(input: {
  reporterId: string;
  targetType: 'profile' | 'studio' | 'gig' | 'group' | 'product' | 'playlist';
  targetId: string;
  suffix?: string;
}) {
  const runId = makeRunId(input.suffix || 'report');
  const { data, error } = await getSupabaseAdmin()
    .from('reports')
    .insert({
      reporter_id: input.reporterId,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: `E2E Report ${runId}`,
      details: `E2E report details ${runId}`,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function seedE2EManualIdentityReview(userId: string, email: string, suffix = 'identity') {
  const runId = makeRunId(suffix);
  const { data, error } = await getSupabaseAdmin()
    .from('manual_identity_reviews')
    .insert({
      user_id: userId,
      submitted_by_email: email,
      submitted_role: 'musician',
      document_type: 'Passport',
      document_type_key: 'passport',
      document_country: 'PHL',
      source: 'MANUAL_UPLOAD',
      status: 'PENDING_REVIEW',
      document_fingerprint: `e2e-${runId}`,
      front_image_path: `e2e/${runId}/front.jpg`,
      back_image_path: `e2e/${runId}/back.jpg`,
      selfie_image_path: `e2e/${runId}/selfie.jpg`,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
