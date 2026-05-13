import { test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectNoDbRecord } from '../../helpers/assertions';
import { makeRunId } from '../../helpers/env';
import { requireAndroidApp, runMaestroFlow } from '../../helpers/maestro';
import { getSupabaseAdmin } from '../../helpers/supabase';
import {
  seedE2EGig,
  seedE2EGigApplication,
  seedE2EGroup,
  seedE2EPayoutMethod,
  seedE2EProductionTeam,
  seedE2EStudio,
  seedE2EStudioBooking,
  seedE2EUser,
  seedE2EWallet,
} from '../../helpers/seed';

const formatManilaDateTime = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';

  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
};

const formatSameDayManilaWindow = (startDate: Date, endDate: Date) => {
  const start = formatManilaDateTime(startDate);
  const end = formatManilaDateTime(endDate);

  if (end.date !== start.date || end.time <= start.time) {
    return {
      start,
      end: {
        date: start.date,
        time: '23:59',
      },
    };
  }

  return { start, end };
};

type NotificationToastFixture = {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  meta?: Record<string, unknown>;
};

const insertAndAssertVisibleNotificationToast = async (userId: string, fixture: NotificationToastFixture) => {
  const notificationId = randomUUID();

  const { error } = await getSupabaseAdmin()
    .from('notifications')
    .insert({
      id: notificationId,
      user_id: userId,
      type: fixture.type,
      title: fixture.title,
      message: fixture.message,
      read: false,
      meta: fixture.meta ?? {},
    });

  if (error) throw error;

  await runMaestroFlow('mobile-notification-toast-visible.yaml', {
    E2E_NOTIFICATION_TOAST_ID: `top-toast-${notificationId}`,
    E2E_NOTIFICATION_TOAST_TITLE: fixture.title,
  });

  await expectDbRecord<any>('notifications', 'id', notificationId, (record) => (
    record.user_id === userId &&
    record.type === fixture.type &&
    record.title === fixture.title &&
    record.read === false
  ));
};

test.describe.configure({ mode: 'serial' });

test.describe('mobile visible CRUD flows', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('updates profile through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-profile-update',
      role: 'musician',
      fullName: 'E2E Mobile Profile User',
    });
    const contact = '+639171234567';
    const bio = `E2E updated mobile bio ${makeRunId('profile')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-profile-update.yaml', {
      E2E_PROFILE_CONTACT: contact,
      E2E_PROFILE_BIO: bio,
    });

    await expectDbRecord<any>('profiles', 'id', user.id, (record) => (
      record.contact_number === contact &&
      record.bio === bio
    ));
  });

  test('creates a production team through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-production-create',
      role: 'producer',
      fullName: 'E2E Mobile Producer',
    });
    const name = `E2E Production ${makeRunId('production')}`;
    const description = `E2E production description ${makeRunId('production')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-production-create.yaml', {
      E2E_PRODUCTION_NAME: name,
      E2E_PRODUCTION_DESCRIPTION: description,
    });

    await expectDbRecord<any>('production_teams', 'name', name, (record) => (
      record.owner_id === user.id &&
      typeof record.description === 'string' &&
      record.description.includes(makeRunId('production'))
    ));
  });

  test('updates a seeded production team through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-production-update',
      role: 'producer',
      fullName: 'E2E Mobile Production Update Owner',
    });
    const team = await seedE2EProductionTeam(user.id, 'mobile-production-update');
    const updatedName = `E2E Production Updated ${makeRunId('production-update')}`;
    const updatedDescription = `E2E updated production description ${makeRunId('production-update')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-production-update.yaml', {
      E2E_PRODUCTION_ID: team.id,
      E2E_PRODUCTION_UPDATED_NAME: updatedName,
      E2E_PRODUCTION_UPDATED_DESCRIPTION: updatedDescription,
    });

    await expectDbRecord<any>('production_teams', 'id', team.id, (record) => (
      record.name === updatedName &&
      record.description === updatedDescription
    ));
  });

  test('creates a studio through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-studio-create',
      role: 'studio-owner',
      fullName: 'E2E Mobile Studio Owner',
    });
    const name = `E2E Studio ${makeRunId('studio')}`;
    const description = `E2E Studio description ${makeRunId('studio')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-studio-create.yaml', {
      E2E_STUDIO_NAME: name,
      E2E_STUDIO_DESCRIPTION: description,
    });

    await expectDbRecord<any>('studios', 'name', name, (record) => (
      record.owner_id === user.id &&
      record.description === description &&
      record.address === 'E2E Studio Address' &&
      Number(record.rehearsal_rate) === 500 &&
      Number(record.recording_rate) === 1000
    ));
  });

  test('creates a gig through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-gig-create',
      role: 'venue-owner',
      fullName: 'E2E Mobile Venue Owner',
    });
    const name = `E2E Gig ${makeRunId('gig')}`;
    const description = `E2E gig description ${makeRunId('gig')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-gig-create.yaml', {
      E2E_GIG_NAME: name,
      E2E_GIG_DESCRIPTION: description,
    });

    await expectDbRecord<any>('gigs', 'name', name, (record) => (
      record.organizer_id === user.id &&
      record.description === description &&
      record.location === 'E2E Venue Address' &&
      Number(record.budget) === 5000 &&
      record.status === 'open'
    ));
  });

  test('creates a group through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-group-create',
      role: 'musician',
      fullName: 'E2E Mobile Group Owner',
    });
    const name = `E2E Group ${makeRunId('group')}`;
    const description = `E2E group description ${makeRunId('group')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-group-create.yaml', {
      E2E_GROUP_NAME: name,
      E2E_GROUP_DESCRIPTION: description,
    });

    const group = await expectDbRecord<any>('groups', 'name', name, (record) => (
      record.owner_id === user.id &&
      record.description === description &&
      record.location === 'E2E Group Address' &&
      String(record.genre || '').includes('OPM')
    ));
    await expectDbRecord<any>('group_members', 'group_id', group.id, (record) => record.user_id === user.id);
  });

  test('creates a playlist and first track through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-playlist-create',
      role: 'musician',
      fullName: 'E2E Mobile Playlist User',
    });
    const title = `E2E Playlist ${makeRunId('playlist')}`;
    const description = `E2E playlist description ${makeRunId('playlist')}`;
    const trackTitle = `E2E Track ${makeRunId('playlist-track')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-playlist-create.yaml', {
      E2E_PLAYLIST_TITLE: title,
      E2E_PLAYLIST_DESCRIPTION: description,
      E2E_PLAYLIST_TRACK_TITLE: trackTitle,
    });

    const playlist = await expectDbRecord<any>('playlists', 'title', title, (record) => (
      record.creator_id === user.id &&
      record.description === description &&
      record.genre === 'OPM'
    ));
    await expectDbRecord<any>('playlist_items', 'title', trackTitle, (record) => (
      record.playlist_id === playlist.id &&
      record.audio_url === 'https://example.com/e2e-fixture.mp3'
    ));
  });

  test('creates a marketplace listing through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-marketplace-create',
      role: 'producer',
      fullName: 'E2E Mobile Seller',
    });
    const title = `E2E Product ${makeRunId('product')}`;
    const description = `E2E product description ${makeRunId('product')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-marketplace-create.yaml', {
      E2E_PRODUCT_TITLE: title,
      E2E_PRODUCT_DESCRIPTION: description,
    });

    await expectDbRecord<any>('products', 'title', title, (record) => (
      record.seller_id === user.id &&
      Number(record.base_price ?? record.price ?? 0) === 1234 &&
      record.category === 'other'
    ));
  });

  test('creates a payout method through mobile wallet UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-wallet-payout',
      role: 'producer',
      fullName: 'E2E Mobile Wallet User',
    });
    const accountName = `E2E Payout ${makeRunId('payout')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-wallet-payout-method.yaml', {
      E2E_PAYOUT_ACCOUNT_NAME: accountName,
    });

    await expectDbRecord<any>('payout_methods', 'account_name', accountName, (record) => (
      record.user_id === user.id &&
      record.type === 'gcash' &&
      record.account_number === '09171234567'
    ));
  });

  test('creates a wallet withdrawal through mobile UI and verifies database state', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-wallet-withdrawal',
      role: 'producer',
      fullName: 'E2E Mobile Withdrawal User',
    });
    const wallet = await seedE2EWallet(user.id, 1000);
    const payoutMethod = await seedE2EPayoutMethod(user.id, 'mobile-withdrawal');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-wallet-withdrawal.yaml', {
      E2E_PAYOUT_METHOD_TEST_ID: `mobile-wallet-payout-method-${payoutMethod.id}`,
    });

    await expectDbRecord<any>('withdrawal_requests', 'payout_method_id', payoutMethod.id, (record) => (
      record.user_id === user.id &&
      record.wallet_id === wallet.id &&
      Number(record.amount) === 200 &&
      record.status === 'completed'
    ));
    await expectDbRecord<any>('wallets', 'id', wallet.id, (record) => Number(record.balance) === 800);
  });

  test('reads and cancels a seeded studio booking as the customer through mobile UI', async () => {
    const customer = await seedE2EUser({
      suffix: 'mobile-booking-customer-cancel',
      role: 'musician',
      fullName: 'E2E Mobile Booking Customer',
    });
    const owner = await seedE2EUser({
      suffix: 'mobile-booking-customer-cancel-owner',
      role: 'studio-owner',
      fullName: 'E2E Mobile Booking Studio Owner',
    });
    const studio = await seedE2EStudio(owner.id, 'mobile-booking-customer-cancel');
    const booking = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'mobile-booking-customer-cancel',
      status: 'confirmed',
      paymentStatus: 'paid',
    });
    const reason = `E2E customer cancellation ${makeRunId('booking-cancel')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: customer.email,
      E2E_MOBILE_PASSWORD: customer.password,
    });
    await runMaestroFlow('mobile-booking-cancel.yaml', {
      E2E_BOOKING_TAB_ID: 'mobile-bookings-tab-upcoming',
      E2E_BOOKING_CARD_ID: `mobile-bookings-studio-booking-card-${booking.id}`,
      E2E_BOOKING_CANCEL_ID: `mobile-bookings-studio-booking-cancel-${booking.id}`,
      E2E_BOOKING_CANCEL_REASON: reason,
    });

    await expectDbRecord<any>('studio_bookings', 'id', booking.id, (record) => (
      record.status === 'cancelled' &&
      record.cancellation_reason === reason
    ));
  });

  test('reads and cancels a pending studio booking as the studio owner through mobile UI', async () => {
    const customer = await seedE2EUser({
      suffix: 'mobile-booking-owner-cancel-customer',
      role: 'musician',
      fullName: 'E2E Mobile Booking Owner Customer',
    });
    const owner = await seedE2EUser({
      suffix: 'mobile-booking-owner-cancel',
      role: 'studio-owner',
      fullName: 'E2E Mobile Booking Owner Cancel',
    });
    const studio = await seedE2EStudio(owner.id, 'mobile-booking-owner-cancel');
    const booking = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'mobile-booking-owner-cancel',
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentAmount: 0,
    });
    const reason = `E2E owner cancellation ${makeRunId('booking-owner-cancel')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: owner.email,
      E2E_MOBILE_PASSWORD: owner.password,
    });
    await runMaestroFlow('mobile-booking-cancel.yaml', {
      E2E_BOOKING_TAB_ID: 'mobile-bookings-tab-pending',
      E2E_BOOKING_CARD_ID: `mobile-bookings-studio-booking-card-${booking.id}`,
      E2E_BOOKING_CANCEL_ID: `mobile-bookings-studio-booking-cancel-${booking.id}`,
      E2E_BOOKING_CANCEL_REASON: reason,
    });

    await expectDbRecord<any>('studio_bookings', 'id', booking.id, (record) => (
      record.status === 'cancelled' &&
      record.cancellation_reason === reason
    ));
  });

  test('reports late arrival for a near-term studio booking through mobile UI', async () => {
    const customer = await seedE2EUser({
      suffix: 'mobile-booking-late-customer',
      role: 'musician',
      fullName: 'E2E Mobile Booking Late Customer',
    });
    const owner = await seedE2EUser({
      suffix: 'mobile-booking-late-owner',
      role: 'studio-owner',
      fullName: 'E2E Mobile Booking Late Owner',
    });
    const studio = await seedE2EStudio(owner.id, 'mobile-booking-late');
    const { start, end } = formatSameDayManilaWindow(
      new Date(Date.now() + 10 * 60 * 1000),
      new Date(Date.now() + 130 * 60 * 1000),
    );
    const booking = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'mobile-booking-late',
      status: 'confirmed',
      paymentStatus: 'paid',
      bookingDate: start.date,
      startTime: start.time,
      endTime: end.time,
    });
    const reason = `E2E late reason ${makeRunId('booking-late')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: customer.email,
      E2E_MOBILE_PASSWORD: customer.password,
    });
    await runMaestroFlow('mobile-booking-report-late.yaml', {
      E2E_BOOKING_CARD_ID: `mobile-bookings-studio-booking-card-${booking.id}`,
      E2E_BOOKING_REPORT_LATE_ID: `mobile-bookings-studio-booking-report-late-${booking.id}`,
      E2E_BOOKING_LATE_REASON: reason,
    });

    await expectDbRecord<any>('booking_attendance_events', 'booking_id', booking.id, (record) => (
      record.reporter_user_id === customer.id &&
      record.event_type === 'late' &&
      record.notes === reason
    ));
  });

  test('reports studio access issue for an ongoing booking through mobile UI', async () => {
    const customer = await seedE2EUser({
      suffix: 'mobile-booking-access-customer',
      role: 'musician',
      fullName: 'E2E Mobile Booking Access Customer',
    });
    const owner = await seedE2EUser({
      suffix: 'mobile-booking-access-owner',
      role: 'studio-owner',
      fullName: 'E2E Mobile Booking Access Owner',
    });
    const studio = await seedE2EStudio(owner.id, 'mobile-booking-access');
    const { start, end } = formatSameDayManilaWindow(
      new Date(Date.now() - 30 * 60 * 1000),
      new Date(Date.now() + 60 * 60 * 1000),
    );
    const booking = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'mobile-booking-access',
      status: 'checked_in',
      paymentStatus: 'paid',
      bookingDate: start.date,
      startTime: start.time,
      endTime: end.time,
    });
    const reason = `E2E access issue ${makeRunId('booking-access')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: customer.email,
      E2E_MOBILE_PASSWORD: customer.password,
    });
    await runMaestroFlow('mobile-booking-report-access.yaml', {
      E2E_BOOKING_CARD_ID: `mobile-bookings-studio-booking-card-${booking.id}`,
      E2E_BOOKING_REPORT_ACCESS_ID: `mobile-bookings-studio-booking-report-access-issue-${booking.id}`,
      E2E_BOOKING_ACCESS_REASON: reason,
    });

    await expectDbRecord<any>('booking_incidents', 'booking_id', booking.id, (record) => (
      record.reporter_user_id === customer.id &&
      record.counterparty_user_id === owner.id &&
      record.issue_type === 'cannot_access_studio' &&
      record.status === 'open' &&
      record.reporter_notes === reason
    ));
  });

  test('accepts a seeded gig application as the venue owner through mobile UI', async () => {
    const organizer = await seedE2EUser({
      suffix: 'mobile-gig-application-accept-owner',
      role: 'venue-owner',
      fullName: 'E2E Mobile Gig Application Owner',
    });
    const applicant = await seedE2EUser({
      suffix: 'mobile-gig-application-accept-applicant',
      role: 'musician',
      fullName: 'E2E Mobile Gig Application Applicant',
    });
    const gig = await seedE2EGig(organizer.id, 'mobile-gig-application-accept');
    const application = await seedE2EGigApplication({
      applicantId: applicant.id,
      gigId: gig.id,
      suffix: 'mobile-gig-application-accept',
      status: 'pending',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: organizer.email,
      E2E_MOBILE_PASSWORD: organizer.password,
    });
    await runMaestroFlow('mobile-gig-application-accept.yaml', {
      E2E_GIG_APPLICATION_CARD_ID: `mobile-bookings-gig-application-card-${application.id}`,
      E2E_GIG_APPLICATION_ACCEPT_ID: `mobile-bookings-gig-application-accept-${application.id}`,
    });

    await expectDbRecord<any>('gig_applications', 'id', application.id, (record) => record.status === 'accepted');
  });

  test('shows an accepted application popup notification while the applicant app is active', async () => {
    const applicant = await seedE2EUser({
      suffix: 'mobile-notification-toast-applicant',
      role: 'musician',
      fullName: 'E2E Mobile Notification Toast Applicant',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: applicant.email,
      E2E_MOBILE_PASSWORD: applicant.password,
    });

    await insertAndAssertVisibleNotificationToast(applicant.id, {
      type: 'success',
      title: 'Application Accepted!',
      message: `Your application for E2E Gig ${makeRunId('notification-toast')} has been accepted!`,
      meta: {
        route: '/bookings',
        event_type: 'gig_application_accepted',
        status: 'accepted',
      },
    });
  });

  test('shows other important popup notifications while the user app is active', async () => {
    const receiver = await seedE2EUser({
      suffix: 'mobile-notification-toast-other',
      role: 'musician',
      fullName: 'E2E Mobile Notification Toast Receiver',
    });
    const runId = makeRunId('notification-toast-other');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: receiver.email,
      E2E_MOBILE_PASSWORD: receiver.password,
    });

    const fixtures: NotificationToastFixture[] = [
      {
        type: 'warning',
        title: 'Application Declined',
        message: `Your application for E2E Gig ${runId} was declined.`,
        meta: {
          route: '/bookings',
          event_type: 'gig_application_declined',
          status: 'rejected',
        },
      },
      {
        type: 'success',
        title: 'Booking Confirmed!',
        message: `Your booking for E2E Studio ${runId} was confirmed.`,
        meta: {
          route: '/bookings',
          event_type: 'studio_booking_confirmed',
          status: 'confirmed',
        },
      },
      {
        type: 'warning',
        title: 'Booking Cancelled',
        message: `Your booking for E2E Studio ${runId} was cancelled.`,
        meta: {
          route: '/bookings',
          event_type: 'studio_booking_cancelled',
          status: 'cancelled',
        },
      },
      {
        type: 'warning',
        title: 'Booking Incident Reported',
        message: `An incident was reported for E2E Booking ${runId}.`,
        meta: {
          route: '/bookings',
          event_type: 'booking_incident_reported',
          status: 'reported',
        },
      },
      {
        type: 'success',
        title: 'Booking Incident Resolved',
        message: `The incident for E2E Booking ${runId} was resolved.`,
        meta: {
          route: '/bookings',
          event_type: 'booking_incident_resolved',
          status: 'resolved',
        },
      },
      {
        type: 'warning',
        title: 'Booking Cancelled & Refunded',
        message: `Your booking for E2E Studio ${runId} was cancelled and refunded.`,
        meta: {
          route: '/bookings',
          event_type: 'studio_booking_cancelled_refunded',
          status: 'refunded',
        },
      },
      {
        type: 'info',
        title: 'New production team invite',
        message: `E2E Production ${runId} invited you to join their production team.`,
        meta: {
          route: '/bookings',
          event_type: 'production_team_invite',
          request_kind: 'invite',
        },
      },
      {
        type: 'info',
        title: 'New group invite',
        message: `E2E Group ${runId} invited you to join their group.`,
        meta: {
          route: '/bookings',
          event_type: 'group_invite',
          request_kind: 'invite',
        },
      },
      {
        type: 'info',
        title: 'New Gig Application',
        message: `A musician applied for E2E Gig ${runId}.`,
        meta: {
          route: '/bookings',
          event_type: 'gig_application_submitted',
          status: 'pending',
        },
      },
      {
        type: 'info',
        title: 'Group Gig Application',
        message: `A group applied for E2E Gig ${runId}.`,
        meta: {
          route: '/bookings',
          event_type: 'group_gig_application_submitted',
          status: 'pending',
        },
      },
      {
        type: 'info',
        title: 'New Group Application',
        message: `A musician applied to join E2E Group ${runId}.`,
        meta: {
          route: '/groups',
          event_type: 'group_application_submitted',
          status: 'pending',
        },
      },
      {
        type: 'success',
        title: 'Group Application Accepted',
        message: `Your application to join E2E Group ${runId} was accepted.`,
        meta: {
          route: '/groups',
          event_type: 'group_application_accepted',
          status: 'accepted',
        },
      },
      {
        type: 'warning',
        title: 'Group Application Declined',
        message: `Your application to join E2E Group ${runId} was declined.`,
        meta: {
          route: '/groups',
          event_type: 'group_application_declined',
          status: 'declined',
        },
      },
      {
        type: 'success',
        title: 'Member Added',
        message: `You were added to E2E Group ${runId}.`,
        meta: {
          route: '/groups',
          event_type: 'group_member_added',
          status: 'accepted',
        },
      },
    ];

    for (const fixture of fixtures) {
      await insertAndAssertVisibleNotificationToast(receiver.id, fixture);
    }
  });

  test('reads and withdraws a seeded gig application as the applicant through mobile UI', async () => {
    const organizer = await seedE2EUser({
      suffix: 'mobile-gig-application-withdraw-owner',
      role: 'venue-owner',
      fullName: 'E2E Mobile Gig Application Withdraw Owner',
    });
    const applicant = await seedE2EUser({
      suffix: 'mobile-gig-application-withdraw-applicant',
      role: 'musician',
      fullName: 'E2E Mobile Gig Application Withdraw Applicant',
    });
    const gig = await seedE2EGig(organizer.id, 'mobile-gig-application-withdraw');
    const application = await seedE2EGigApplication({
      applicantId: applicant.id,
      gigId: gig.id,
      suffix: 'mobile-gig-application-withdraw',
      status: 'pending',
    });
    const reason = `E2E application withdraw ${makeRunId('gig-app-withdraw')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: applicant.email,
      E2E_MOBILE_PASSWORD: applicant.password,
    });
    await runMaestroFlow('mobile-gig-application-withdraw.yaml', {
      E2E_GIG_APPLICATION_CARD_ID: `mobile-bookings-gig-application-card-${application.id}`,
      E2E_GIG_APPLICATION_WITHDRAW_ID: `mobile-bookings-gig-application-withdraw-${application.id}`,
      E2E_GIG_APPLICATION_WITHDRAW_REASON: reason,
    });

    await expectDbRecord<any>('gig_applications', 'id', application.id, (record) => (
      record.status === 'resigned' &&
      record.cancellation_reason === reason
    ));
  });

  test('reads and deletes a seeded production team through mobile UI', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-production-delete',
      role: 'producer',
      fullName: 'E2E Mobile Production Delete Owner',
    });
    const team = await seedE2EProductionTeam(user.id, 'mobile-production-delete');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-production-delete.yaml', {
      E2E_PRODUCTION_CARD_ID: `mobile-production-card-${team.id}`,
      E2E_PRODUCTION_DELETE_ID: `mobile-production-delete-${team.id}`,
      E2E_PRODUCTION_NAME: team.name,
    });

    await expectNoDbRecord('production_teams', 'id', team.id);
  });

  test('reads and deletes a seeded studio through mobile UI', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-studio-delete',
      role: 'studio-owner',
      fullName: 'E2E Mobile Studio Delete Owner',
    });
    const studio = await seedE2EStudio(user.id, 'mobile-studio-delete');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-studio-delete.yaml', {
      E2E_STUDIO_CARD_ID: `mobile-studio-card-${studio.id}`,
      E2E_STUDIO_DELETE_ID: `mobile-studio-delete-${studio.id}`,
      E2E_STUDIO_NAME: studio.name,
    });

    await expectNoDbRecord('studios', 'id', studio.id);
  });

  test('reads and deletes a seeded gig through mobile UI', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-gig-delete',
      role: 'venue-owner',
      fullName: 'E2E Mobile Gig Delete Owner',
    });
    const gig = await seedE2EGig(user.id, 'mobile-gig-delete');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-gig-delete.yaml', {
      E2E_GIG_CARD_ID: `mobile-gig-card-${gig.id}`,
      E2E_GIG_DELETE_ID: `mobile-gig-delete-${gig.id}`,
    });

    await expectNoDbRecord('gigs', 'id', gig.id);
  });

  test('reads and deletes a seeded group through mobile UI', async () => {
    const user = await seedE2EUser({
      suffix: 'mobile-group-delete',
      role: 'musician',
      fullName: 'E2E Mobile Group Delete Owner',
    });
    const group = await seedE2EGroup(user.id, 'mobile-group-delete');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: user.email,
      E2E_MOBILE_PASSWORD: user.password,
    });
    await runMaestroFlow('mobile-group-delete.yaml', {
      E2E_GROUP_CARD_ID: `mobile-group-card-${group.id}`,
      E2E_GROUP_DELETE_ID: `mobile-group-delete-${group.id}`,
      E2E_GROUP_NAME: group.name,
    });

    await expectNoDbRecord('groups', 'id', group.id);
  });
});
