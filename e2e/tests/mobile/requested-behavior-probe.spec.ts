import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { loadE2EEnv, makeRunId } from '../../helpers/env';
import { getSupabaseAdmin, getSupabaseAnon } from '../../helpers/supabase';
import {
  seedE2EGig,
  seedE2EGroup,
  seedE2EProductionTeam,
  seedE2EStudio,
  seedE2EStudioBooking,
  seedE2EUser,
  seedE2EWallet,
} from '../../helpers/seed';

const password = 'E2E-password-123';

async function asUser(user: { email: string; password: string }) {
  const client = getSupabaseAnon();
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return client;
}

async function invokeFunction(
  client: ReturnType<typeof getSupabaseAnon>,
  functionName: string,
  body: Record<string, unknown>,
) {
  const env = loadE2EEnv();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Missing authenticated session for function invoke');

  const response = await fetch(`${env.E2E_SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.E2E_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data };
}

async function insertGigRequirements(gigId: string, slots: Record<string, { needed: number }>) {
  const total = Object.values(slots).reduce((sum, slot) => sum + slot.needed, 0);
  const { error } = await getSupabaseAdmin().from('gig_requirements').insert([
    { gig_id: gigId, requirement_key: 'total_slots_needed', requirement_value: total },
    { gig_id: gigId, requirement_key: 'slots', requirement_value: slots },
  ]);
  if (error) throw error;
}

async function submitApplication(client: ReturnType<typeof getSupabaseAnon>, payload: Record<string, unknown>) {
  const { data, error } = await client
    .from('gig_applications')
    .insert({
      pitch_message: `E2E pitch ${makeRunId('requested-probe')}`,
      note: `E2E note ${makeRunId('requested-probe')}`,
      video_url: 'https://example.com/e2e-video.mp4',
      cv_url: 'https://example.com/e2e-cv.pdf',
      status: 'pending',
      ...payload,
    })
    .select('*')
    .single();
  return { data, error };
}

function futureDate(days = 10) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test.describe.configure({ mode: 'serial' });

test('requested gig, production, booking, and wallet guardrails hold on live backend', async () => {
  await cleanupE2ERecords();

  const musician = await seedE2EUser({
    suffix: 'requested-musician',
    role: 'musician',
    fullName: 'E2E Requested Musician',
    password,
  });
  const otherMusician = await seedE2EUser({
    suffix: 'requested-other-musician',
    role: 'musician',
    fullName: 'E2E Requested Other Musician',
    password,
  });
  const venue = await seedE2EUser({
    suffix: 'requested-venue',
    role: 'venue-owner',
    fullName: 'E2E Requested Venue Owner',
    password,
  });
  const producer = await seedE2EUser({
    suffix: 'requested-producer',
    role: 'producer',
    fullName: 'E2E Requested Producer',
    password,
  });
  const studioOwner = await seedE2EUser({
    suffix: 'requested-studio-owner',
    role: 'studio-owner',
    fullName: 'E2E Requested Studio Owner',
    password,
  });
  const customer = await seedE2EUser({
    suffix: 'requested-customer',
    role: 'musician',
    fullName: 'E2E Requested Studio Customer',
    password,
  });

  const musicianClient = await asUser(musician);
  const venueClient = await asUser(venue);
  const producerClient = await asUser(producer);
  const studioOwnerClient = await asUser(studioOwner);
  const customerClient = await asUser(customer);
  const admin = getSupabaseAdmin();

  const gig = await seedE2EGig(venue.id, 'requested-gig-apply');
  await insertGigRequirements(gig.id, {
    solo: { needed: 2 },
    band: { needed: 1 },
  });

  const firstDirect = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: gig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  expect(firstDirect.error).toBeNull();

  const duplicateDirect = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: gig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  expect(duplicateDirect.error?.message).toMatch(/active application|duplicate|unique/i);

  for (const app of [firstDirect.data]) {
    const cancel = await invokeFunction(musicianClient, 'gig-applications', {
      action: 'cancel_application',
      applicationId: app.id,
    });
    expect(cancel.response.ok).toBeTruthy();
  }

  const secondDirect = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: gig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  expect(secondDirect.error).toBeNull();

  await invokeFunction(musicianClient, 'gig-applications', {
    action: 'cancel_application',
    applicationId: secondDirect.data.id,
  });

  const thirdDirect = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: gig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  expect(thirdDirect.error).toBeNull();

  await invokeFunction(musicianClient, 'gig-applications', {
    action: 'cancel_application',
    applicationId: thirdDirect.data.id,
  });

  const blockedFourthDirect = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: gig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  expect(blockedFourthDirect.error?.message).toMatch(/maximum|cancel/i);

  const group = await seedE2EGroup(musician.id, 'requested-band');
  const groupApp = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: group.id,
    gig_id: gig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'band',
  });
  expect(groupApp.error).toBeNull();

  const duplicateGroup = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: group.id,
    gig_id: gig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'band',
  });
  expect(duplicateGroup.error?.message).toMatch(/active application|duplicate|unique/i);

  await invokeFunction(musicianClient, 'gig-applications', {
    action: 'cancel_application',
    applicationId: groupApp.data.id,
  });
  const secondGroupApp = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: group.id,
    gig_id: gig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'band',
  });
  expect(secondGroupApp.error).toBeNull();
  await invokeFunction(musicianClient, 'gig-applications', {
    action: 'cancel_application',
    applicationId: secondGroupApp.data.id,
  });
  const thirdGroupApp = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: group.id,
    gig_id: gig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'band',
  });
  expect(thirdGroupApp.error).toBeNull();
  await invokeFunction(musicianClient, 'gig-applications', {
    action: 'cancel_application',
    applicationId: thirdGroupApp.data.id,
  });
  const blockedFourthGroup = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: group.id,
    gig_id: gig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'band',
  });
  expect(blockedFourthGroup.error?.message).toMatch(/maximum|cancel/i);

  const team = await seedE2EProductionTeam(producer.id, 'requested-production');
  const addRoster = await invokeFunction(producerClient, 'manage-production', {
    action: 'add_team_roster_profile',
    team_id: team.id,
    profile_id: musician.id,
  });
  expect(addRoster.response.ok).toBeTruthy();
  const rosterEntry = addRoster.data.roster.find((entry: any) => entry.profile_id === musician.id);
  expect(rosterEntry?.id).toBeTruthy();

  const productionApp = await invokeFunction(producerClient, 'gig-applications', {
    action: 'submit_production_gig_application',
    gigId: gig.id,
    teamId: team.id,
    rosterId: rosterEntry.id,
    slotType: 'solo',
    pitchMessage: 'E2E production pitch',
    videoUrl: 'https://example.com/e2e-video.mp4',
    cvUrl: 'https://example.com/e2e-cv.pdf',
  });
  expect(productionApp.response.ok).toBeTruthy();

  const productionMismatch = await invokeFunction(producerClient, 'gig-applications', {
    action: 'submit_production_gig_application',
    gigId: gig.id,
    teamId: team.id,
    rosterId: rosterEntry.id,
    slotType: 'band',
  });
  expect(productionMismatch.response.status).toBe(400);
  expect(productionMismatch.data.error).toMatch(/solo slot/i);

  const leaderApproveGig = await seedE2EGig(venue.id, 'requested-leader-approve');
  await insertGigRequirements(leaderApproveGig.id, { band: { needed: 1 } });
  const pendingLeaderApp = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: otherMusician.id,
    group_id: group.id,
    gig_id: leaderApproveGig.id,
    is_solo_application: false,
    leader_approval_status: 'pending',
    slot_type: 'band',
  });
  expect(pendingLeaderApp.error).toBeNull();
  const leaderApproval = await invokeFunction(musicianClient, 'gig-applications', {
    action: 'update_leader_approval',
    applicationId: pendingLeaderApp.data.id,
    decision: 'approved',
  });
  expect(leaderApproval.response.ok).toBeTruthy();
  expect(leaderApproval.data.leader_approval_status).toBe('approved');

  const leaderRejectGig = await seedE2EGig(venue.id, 'requested-leader-reject');
  await insertGigRequirements(leaderRejectGig.id, { band: { needed: 1 } });
  const pendingRejectApp = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: otherMusician.id,
    group_id: group.id,
    gig_id: leaderRejectGig.id,
    is_solo_application: false,
    leader_approval_status: 'pending',
    slot_type: 'band',
  });
  expect(pendingRejectApp.error).toBeNull();
  const leaderReject = await invokeFunction(musicianClient, 'gig-applications', {
    action: 'update_leader_approval',
    applicationId: pendingRejectApp.data.id,
    decision: 'rejected',
  });
  expect(leaderReject.response.ok).toBeTruthy();
  expect(leaderReject.data.status).toBe('rejected');
  const retryAfterLeaderReject = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: group.id,
    gig_id: leaderRejectGig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'band',
  });
  expect(retryAfterLeaderReject.error).toBeNull();

  const fullSlotGig = await seedE2EGig(venue.id, 'requested-all-slot-types');
  await insertGigRequirements(fullSlotGig.id, {
    solo: { needed: 1 },
    duo: { needed: 1 },
    band: { needed: 1 },
  });
  const duoGroup = await seedE2EGroup(musician.id, 'requested-duo');
  const { error: duoUpdateError } = await admin
    .from('groups')
    .update({ group_type: 'duo' })
    .eq('id', duoGroup.id);
  if (duoUpdateError) throw duoUpdateError;
  const fullSlotSolo = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: fullSlotGig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  const fullSlotDuo = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: duoGroup.id,
    gig_id: fullSlotGig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'duo',
  });
  const fullSlotBand = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    group_id: group.id,
    gig_id: fullSlotGig.id,
    is_solo_application: false,
    leader_approval_status: 'approved',
    slot_type: 'band',
  });
  expect(fullSlotSolo.error).toBeNull();
  expect(fullSlotDuo.error).toBeNull();
  expect(fullSlotBand.error).toBeNull();
  for (const app of [fullSlotSolo.data, fullSlotDuo.data, fullSlotBand.data]) {
    const acceptSlot = await invokeFunction(venueClient, 'gig-applications', {
      action: 'update_application_status',
      applicationId: app.id,
      status: 'accepted',
    });
    expect(acceptSlot.response.ok).toBeTruthy();
  }

  const slotGig = await seedE2EGig(venue.id, 'requested-slot-full');
  await insertGigRequirements(slotGig.id, { solo: { needed: 1 } });
  const slotA = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: slotGig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  const slotBClient = await asUser(otherMusician);
  const slotB = await submitApplication(slotBClient, {
    applicant_id: otherMusician.id,
    submitted_by_user_id: otherMusician.id,
    gig_id: slotGig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  expect(slotA.error).toBeNull();
  expect(slotB.error).toBeNull();
  const acceptA = await invokeFunction(venueClient, 'gig-applications', {
    action: 'update_application_status',
    applicationId: slotA.data.id,
    status: 'accepted',
  });
  expect(acceptA.response.ok).toBeTruthy();
  const acceptB = await invokeFunction(venueClient, 'gig-applications', {
    action: 'update_application_status',
    applicationId: slotB.data.id,
    status: 'accepted',
  });
  expect(acceptB.response.status).toBeGreaterThanOrEqual(400);
  expect(acceptB.data.error).toMatch(/slot|filled/i);

  const raceGig = await seedE2EGig(venue.id, 'requested-race');
  await insertGigRequirements(raceGig.id, { solo: { needed: 1 } });
  const raceA = await submitApplication(musicianClient, {
    applicant_id: musician.id,
    submitted_by_user_id: musician.id,
    gig_id: raceGig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  const raceB = await submitApplication(slotBClient, {
    applicant_id: otherMusician.id,
    submitted_by_user_id: otherMusician.id,
    gig_id: raceGig.id,
    is_solo_application: true,
    slot_type: 'solo',
  });
  const raceResults = await Promise.all([
    invokeFunction(venueClient, 'gig-applications', {
      action: 'update_application_status',
      applicationId: raceA.data.id,
      status: 'accepted',
    }),
    invokeFunction(venueClient, 'gig-applications', {
      action: 'update_application_status',
      applicationId: raceB.data.id,
      status: 'accepted',
    }),
  ]);
  expect(raceResults.filter((result) => result.response.ok)).toHaveLength(1);
  expect(raceResults.filter((result) => !result.response.ok)).toHaveLength(1);

  const pendingProductionGig = await seedE2EGig(venue.id, 'requested-prod-pending');
  await insertGigRequirements(pendingProductionGig.id, { solo: { needed: 1 } });
  const acceptedProductionGig = await seedE2EGig(venue.id, 'requested-prod-accepted');
  await insertGigRequirements(acceptedProductionGig.id, { solo: { needed: 1 } });
  const pendingLinked = await invokeFunction(producerClient, 'gig-applications', {
    action: 'submit_production_gig_application',
    gigId: pendingProductionGig.id,
    teamId: team.id,
    rosterId: rosterEntry.id,
    slotType: 'solo',
  });
  const acceptedLinked = await invokeFunction(producerClient, 'gig-applications', {
    action: 'submit_production_gig_application',
    gigId: acceptedProductionGig.id,
    teamId: team.id,
    rosterId: rosterEntry.id,
    slotType: 'solo',
  });
  expect(pendingLinked.response.ok).toBeTruthy();
  expect(acceptedLinked.response.ok).toBeTruthy();
  const acceptLinked = await invokeFunction(venueClient, 'gig-applications', {
    action: 'update_application_status',
    applicationId: acceptedLinked.data.id,
    status: 'accepted',
  });
  expect(acceptLinked.response.ok).toBeTruthy();

  const removeRoster = await invokeFunction(producerClient, 'manage-production', {
    action: 'remove_team_roster_entry',
    team_id: team.id,
    roster_id: rosterEntry.id,
  });
  expect(removeRoster.response.ok).toBeTruthy();
  expect(removeRoster.data.affected_applications_updated).toBeGreaterThanOrEqual(2);

  const { data: linkedApps, error: linkedError } = await admin
    .from('gig_applications')
    .select('id, status, performer_snapshot')
    .in('id', [pendingLinked.data.id, acceptedLinked.data.id]);
  if (linkedError) throw linkedError;
  expect(linkedApps.find((app: any) => app.id === pendingLinked.data.id)?.status).toBe('cancelled');
  expect(linkedApps.find((app: any) => app.id === acceptedLinked.data.id)?.status).toBe('fired');
  expect(linkedApps.every((app: any) => Object.keys(app.performer_snapshot || {}).length > 0)).toBeTruthy();

  const studio = await seedE2EStudio(studioOwner.id, 'requested-studio');
  const bookingDate = futureDate(14);
  await admin.from('studio_settings').upsert({
    studio_id: studio.id,
    time_zone: 'Asia/Manila',
    slot_increment_minutes: 60,
    min_booking_duration_hours: 1,
    max_booking_duration_hours: 8,
    buffer_minutes: 0,
    lead_time_hours: 0,
    booking_horizon_days: 180,
    recording_songs_per_block: 2,
    recording_hours_per_block: 2,
    recording_rate_negotiable: false,
    weekly_schedule_scope: 'indefinite',
    weekly_schedule_dates: [],
  }, { onConflict: 'studio_id' });
  await admin.from('studio_date_overrides').insert({
    studio_id: studio.id,
    override_date: bookingDate,
    is_open: true,
    open_time: '09:00',
    close_time: '15:00',
    slot_order: 0,
    reason: 'E2E requested availability [session_type:rehearsal]',
  });

  const duplicateSlots = await invokeFunction(customerClient, 'manage-bookings', {
    action: 'create',
    studio_id: studio.id,
    user_id: customer.id,
    date: bookingDate,
    time_slots: [{ start: '09:00', end: '10:00' }, { start: '09:00', end: '10:00' }],
    session_type: 'rehearsal',
  });
  expect(duplicateSlots.response.status).toBe(409);
  expect(duplicateSlots.data.error).toMatch(/duplicate/i);

  const overlappingSlots = await invokeFunction(customerClient, 'manage-bookings', {
    action: 'create',
    studio_id: studio.id,
    user_id: customer.id,
    date: bookingDate,
    time_slots: [{ start: '10:00', end: '12:00' }, { start: '11:00', end: '13:00' }],
    session_type: 'rehearsal',
  });
  expect(overlappingSlots.response.status).toBe(409);
  expect(overlappingSlots.data.error).toMatch(/overlap/i);

  const unresolvedBooking = await invokeFunction(customerClient, 'manage-bookings', {
    action: 'create',
    studio_id: studio.id,
    user_id: customer.id,
    date: bookingDate,
    time_slots: [{ start: '09:00', end: '10:00' }],
    session_type: 'rehearsal',
  });
  expect(unresolvedBooking.response.ok).toBeTruthy();

  const blockedByPending = await invokeFunction(customerClient, 'manage-bookings', {
    action: 'create',
    studio_id: studio.id,
    user_id: customer.id,
    date: bookingDate,
    time_slots: [{ start: '09:00', end: '10:00' }],
    session_type: 'rehearsal',
  });
  expect(blockedByPending.response.status).toBe(409);
  expect(blockedByPending.data.error).toMatch(/not available|overlap|blocked/i);

  await admin
    .from('studio_bookings')
    .update({ created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(), payment_status: 'pending' })
    .eq('id', unresolvedBooking.data.id);
  const { data: expiredCount, error: expireError } = await admin.rpc('expire_unresolved_studio_payments', {
    p_threshold_minutes: 30,
  });
  if (expireError) throw expireError;
  expect(expiredCount).toBeGreaterThanOrEqual(1);

  const availableAfterExpiry = await invokeFunction(customerClient, 'manage-bookings', {
    action: 'create',
    studio_id: studio.id,
    user_id: customer.id,
    date: bookingDate,
    time_slots: [{ start: '09:00', end: '10:00' }],
    session_type: 'rehearsal',
  });
  expect(availableAfterExpiry.response.ok).toBeTruthy();

  await seedE2EWallet(studioOwner.id, 100);
  const partialBooking = await seedE2EStudioBooking({
    userId: customer.id,
    studioId: studio.id,
    bookingDate: futureDate(20),
    status: 'confirmed',
    paymentStatus: 'partial',
    paymentType: 'downpayment',
    paymentAmount: 400,
    remainingBalance: 600,
  });
  const clearBalance = await invokeFunction(studioOwnerClient, 'manage-bookings', {
    action: 'clear_balance',
    booking_id: partialBooking.id,
    owner_id: studioOwner.id,
    amount: 600,
  });
  expect(clearBalance.response.ok).toBeTruthy();
  const { data: clearedBooking, error: clearedError } = await admin
    .from('studio_bookings')
    .select('remaining_balance, payment_status')
    .eq('id', partialBooking.id)
    .single();
  if (clearedError) throw clearedError;
  expect(Number(clearedBooking.remaining_balance)).toBe(0);
  expect(clearedBooking.payment_status).toBe('paid');

  const ownerAvailabilityDate = futureDate(24);
  const ownerUpdateStudio = await studioOwnerClient
    .from('studios')
    .update({
      description: 'E2E owner edited studio settings',
      rehearsal_rate: 650,
      recording_rate: 1200,
    })
    .eq('id', studio.id)
    .eq('owner_id', studioOwner.id)
    .select('id, description, rehearsal_rate, recording_rate')
    .single();
  expect(ownerUpdateStudio.error).toBeNull();
  expect(Number(ownerUpdateStudio.data.rehearsal_rate)).toBe(650);

  const ownerSettings = await studioOwnerClient.from('studio_settings').upsert({
    studio_id: studio.id,
    time_zone: 'Asia/Manila',
    slot_increment_minutes: 60,
    min_booking_duration_hours: 1,
    max_booking_duration_hours: 8,
    buffer_minutes: 0,
    lead_time_hours: 0,
    booking_horizon_days: 180,
    recording_songs_per_block: 2,
    recording_hours_per_block: 2,
    recording_rate_negotiable: false,
    weekly_schedule_scope: 'indefinite',
    weekly_schedule_dates: [],
  }, { onConflict: 'studio_id' }).select('studio_id').single();
  expect(ownerSettings.error).toBeNull();

  const ownerWeeklyDelete = await studioOwnerClient
    .from('studio_operating_hours')
    .delete()
    .eq('studio_id', studio.id);
  expect(ownerWeeklyDelete.error).toBeNull();
  const ownerWeeklyInsert = await studioOwnerClient.from('studio_operating_hours').insert({
    studio_id: studio.id,
    day_of_week: new Date(`${ownerAvailabilityDate}T00:00:00Z`).getUTCDay(),
    is_open: true,
    open_time: '08:00',
    close_time: '10:00',
    slot_order: 0,
    reason: 'E2E weekly owner save [session_type:rehearsal]',
    weekly_schedule_scope: 'indefinite',
    weekly_schedule_dates: [],
  });
  expect(ownerWeeklyInsert.error).toBeNull();

  const ownerOverrideInsert = await studioOwnerClient.from('studio_date_overrides').insert({
    studio_id: studio.id,
    override_date: ownerAvailabilityDate,
    is_open: true,
    open_time: '13:00',
    close_time: '15:00',
    slot_order: 0,
    reason: 'E2E owner date override [session_type:rehearsal]',
  }).select('id').single();
  expect(ownerOverrideInsert.error).toBeNull();

  const customerSeesOverrideAvailability = await invokeFunction(customerClient, 'manage-bookings', {
    action: 'create',
    studio_id: studio.id,
    user_id: customer.id,
    date: ownerAvailabilityDate,
    time_slots: [{ start: '13:00', end: '14:00' }],
    session_type: 'rehearsal',
  });
  expect(customerSeesOverrideAvailability.response.ok).toBeTruthy();

  const ownerOverrideDelete = await studioOwnerClient
    .from('studio_date_overrides')
    .delete()
    .eq('id', ownerOverrideInsert.data.id)
    .eq('studio_id', studio.id);
  expect(ownerOverrideDelete.error).toBeNull();

  const customerSeesWeeklyAfterOverrideRemoval = await invokeFunction(customerClient, 'manage-bookings', {
    action: 'create',
    studio_id: studio.id,
    user_id: customer.id,
    date: ownerAvailabilityDate,
    time_slots: [{ start: '08:00', end: '09:00' }],
    session_type: 'rehearsal',
  });
  expect(customerSeesWeeklyAfterOverrideRemoval.response.ok).toBeTruthy();
});
