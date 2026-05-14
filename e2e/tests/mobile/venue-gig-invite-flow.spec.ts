import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord } from '../../helpers/assertions';
import { requireAndroidApp, runMaestroFlow } from '../../helpers/maestro';
import { getSupabaseAdmin } from '../../helpers/supabase';
import {
  seedE2EGig,
  seedE2EUser,
  seedE2EVenueGigInviteRequest,
} from '../../helpers/seed';

test.describe.configure({ mode: 'serial' });

type E2EUserFixture = Awaited<ReturnType<typeof seedE2EUser>>;

let acceptedVenueOwner: E2EUserFixture;
let acceptedMusician: E2EUserFixture;
let acceptedGig: any;
let acceptedRequest: any;
let acceptedApplication: any;

const requireGigApplication = async (gigId: string, applicantId: string) => {
  let lastRows: any[] = [];

  await expect
    .poll(async () => {
      const { data, error } = await getSupabaseAdmin()
        .from('gig_applications')
        .select('*')
        .eq('gig_id', gigId)
        .eq('applicant_id', applicantId)
        .is('production_team_id', null);

      if (error) throw error;
      lastRows = data || [];
      return lastRows.find((row) => row.status === 'accepted')?.id || null;
    }, { timeout: 30_000 })
    .not.toBeNull();

  const application = lastRows.find((row) => row.status === 'accepted');
  if (!application) {
    throw new Error(`Expected accepted gig application. Last rows: ${JSON.stringify(lastRows)}`);
  }

  return application;
};

const expectNoGigApplication = async (gigId: string, applicantId: string) => {
  await expect
    .poll(async () => {
      const { data, error } = await getSupabaseAdmin()
        .from('gig_applications')
        .select('id')
        .eq('gig_id', gigId)
        .eq('applicant_id', applicantId)
        .is('production_team_id', null);

      if (error) throw error;
      return data?.length || 0;
    }, { timeout: 30_000 })
    .toBe(0);
};

test.describe('mobile venue gig invite flow', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('accepts a venue gig invite as the musician from Bookings', async () => {
    acceptedVenueOwner = await seedE2EUser({
      suffix: 'mobile-venue-gig-invite-accept-owner',
      role: 'venue-owner',
      fullName: 'E2E Mobile Venue Gig Invite Owner',
    });
    acceptedMusician = await seedE2EUser({
      suffix: 'mobile-venue-gig-invite-accept-musician',
      role: 'musician',
      fullName: 'E2E Mobile Venue Gig Invite Musician',
    });
    acceptedGig = await seedE2EGig(acceptedVenueOwner.id, 'mobile-venue-gig-invite-accept');
    acceptedRequest = await seedE2EVenueGigInviteRequest({
      venueOwnerId: acceptedVenueOwner.id,
      venueName: acceptedVenueOwner.fullName,
      receiverId: acceptedMusician.id,
      receiverName: acceptedMusician.fullName,
      gigId: acceptedGig.id,
      gigName: acceptedGig.name,
      suffix: 'mobile-venue-gig-invite-accept',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: acceptedMusician.email,
      E2E_MOBILE_PASSWORD: acceptedMusician.password,
    });
    await runMaestroFlow('mobile-venue-gig-invite-accept.yaml', {
      E2E_VENUE_INVITE_CARD_ID: `mobile-bookings-booking-request-card-${acceptedRequest.id}`,
      E2E_VENUE_INVITE_ACCEPT_ID: `mobile-bookings-booking-request-accept-${acceptedRequest.id}`,
    });

    await expectDbRecord<any>('booking_requests', 'id', acceptedRequest.id, (record) => record.status === 'accepted');
    acceptedApplication = await requireGigApplication(acceptedGig.id, acceptedMusician.id);

    expect(acceptedApplication.group_id).toBeNull();
    expect(acceptedApplication.submitted_by_user_id).toBe(acceptedMusician.id);
    expect(acceptedApplication.slot_type).toBe('solo');
  });

  test('shows the accepted musician on the venue Active tab', async () => {
    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: acceptedVenueOwner.email,
      E2E_MOBILE_PASSWORD: acceptedVenueOwner.password,
    });
    await runMaestroFlow('mobile-venue-active-musician-visible.yaml', {
      E2E_GIG_APPLICATION_CARD_ID: `mobile-bookings-gig-application-card-${acceptedApplication.id}`,
    });
  });

  test('shows the accepted gig on the musician My Venue page', async () => {
    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: acceptedMusician.email,
      E2E_MOBILE_PASSWORD: acceptedMusician.password,
    });
    await runMaestroFlow('mobile-my-venue-gig-visible.yaml', {
      E2E_GIG_CARD_ID: `mobile-gig-card-${acceptedGig.id}`,
    });
  });

  test('declines a venue gig invite without creating a gig application', async () => {
    const venueOwner = await seedE2EUser({
      suffix: 'mobile-venue-gig-invite-decline-owner',
      role: 'venue-owner',
      fullName: 'E2E Mobile Venue Gig Decline Owner',
    });
    const musician = await seedE2EUser({
      suffix: 'mobile-venue-gig-invite-decline-musician',
      role: 'musician',
      fullName: 'E2E Mobile Venue Gig Decline Musician',
    });
    const gig = await seedE2EGig(venueOwner.id, 'mobile-venue-gig-invite-decline');
    const request = await seedE2EVenueGigInviteRequest({
      venueOwnerId: venueOwner.id,
      venueName: venueOwner.fullName,
      receiverId: musician.id,
      receiverName: musician.fullName,
      gigId: gig.id,
      gigName: gig.name,
      suffix: 'mobile-venue-gig-invite-decline',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: musician.email,
      E2E_MOBILE_PASSWORD: musician.password,
    });
    await runMaestroFlow('mobile-venue-gig-invite-decline.yaml', {
      E2E_VENUE_INVITE_CARD_ID: `mobile-bookings-booking-request-card-${request.id}`,
      E2E_VENUE_INVITE_DECLINE_ID: `mobile-bookings-booking-request-decline-${request.id}`,
    });

    await expectDbRecord<any>('booking_requests', 'id', request.id, (record) => record.status === 'declined');
    await expectNoGigApplication(gig.id, musician.id);
  });
});
