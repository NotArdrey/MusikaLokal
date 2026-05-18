import { test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { makeRunId } from '../../helpers/env';
import {
  requireAndroidApp,
  resetMobileAppForMaestro,
  runMaestroFlow,
} from '../../helpers/maestro';
import { getSupabaseAdmin } from '../../helpers/supabase';
import { seedE2EGroup, seedE2EUser } from '../../helpers/seed';

test.describe.configure({ mode: 'serial' });

test.describe('mobile role access and signup flows', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('shows the Activity/Bookings sign-in gate for guests', async () => {
    await resetMobileAppForMaestro();
    await runMaestroFlow('mobile-guest-bookings-gate.yaml');
  });

  test('hides the Activity navbar tab for fan accounts', async () => {
    const fan = await seedE2EUser({
      suffix: 'mobile-fan-navbar',
      role: 'fan',
      fullName: 'E2E Mobile Fan Navbar',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: fan.email,
      E2E_MOBILE_PASSWORD: fan.password,
    });
    await runMaestroFlow('mobile-fan-navbar.yaml');
  });

  for (const role of ['musician', 'studio-owner'] as const) {
    test(`shows standard Activity tabs for ${role} accounts`, async () => {
      const user = await seedE2EUser({
        suffix: `mobile-${role}-activity-tabs`,
        role,
        fullName: role === 'musician'
          ? 'E2E Mobile Musician Activity'
          : 'E2E Mobile Studio Owner Activity',
      });

      await runMaestroFlow('mobile-login.yaml', {
        E2E_MOBILE_EMAIL: user.email,
        E2E_MOBILE_PASSWORD: user.password,
      });
      await runMaestroFlow('mobile-bookings-standard-tabs.yaml');
    });
  }

  test('shows venue Activity tabs for venue-owner accounts', async () => {
    const venueOwner = await seedE2EUser({
      suffix: 'mobile-venue-owner-activity-tabs',
      role: 'venue-owner',
      fullName: 'E2E Mobile Venue Owner Activity',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: venueOwner.email,
      E2E_MOBILE_PASSWORD: venueOwner.password,
    });
    await runMaestroFlow('mobile-bookings-venue-tabs.yaml');
  });

  test('shows standard Activity tabs for producer accounts', async () => {
    const producer = await seedE2EUser({
      suffix: 'mobile-producer-activity-tabs',
      role: 'producer',
      fullName: 'E2E Mobile Producer Activity',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: producer.email,
      E2E_MOBILE_PASSWORD: producer.password,
    });
    await runMaestroFlow('mobile-bookings-standard-tabs.yaml');
  });

  test('shows standard Activity tabs for group-owner musician accounts', async () => {
    const owner = await seedE2EUser({
      suffix: 'mobile-group-owner-activity-tabs',
      role: 'musician',
      fullName: 'E2E Mobile Group Owner Activity',
    });
    await seedE2EGroup(owner.id, 'mobile-group-owner-activity-tabs');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: owner.email,
      E2E_MOBILE_PASSWORD: owner.password,
    });
    await runMaestroFlow('mobile-bookings-standard-tabs.yaml');
  });

  test('shows standard Activity tabs for group-member musician accounts', async () => {
    const owner = await seedE2EUser({
      suffix: 'mobile-group-member-activity-owner',
      role: 'musician',
      fullName: 'E2E Mobile Group Member Activity Owner',
    });
    const member = await seedE2EUser({
      suffix: 'mobile-group-member-activity-tabs',
      role: 'musician',
      fullName: 'E2E Mobile Group Member Activity',
    });
    const group = await seedE2EGroup(owner.id, 'mobile-group-member-activity-tabs');
    const { error } = await getSupabaseAdmin()
      .from('group_members')
      .upsert({
        group_id: group.id,
        user_id: member.id,
        role: 'member',
      }, { onConflict: 'group_id,user_id' });
    if (error) throw error;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: member.email,
      E2E_MOBILE_PASSWORD: member.password,
    });
    await runMaestroFlow('mobile-bookings-standard-tabs.yaml');
  });

  for (const role of ['fan', 'musician'] as const) {
    test(`reaches manual review signup step for ${role} registration`, async () => {
      await resetMobileAppForMaestro();
      const emailToken = makeRunId(`mobile-signup-${role}`).replace(/[^a-z0-9]+/gi, '').toLowerCase();
      await runMaestroFlow('mobile-signup-manual-review.yaml', {
        E2E_SIGNUP_ROLE_ID: `signup-role-${role}`,
        E2E_SIGNUP_EMAIL: `signup${role}${emailToken}@musikalokal.test`,
        E2E_SIGNUP_PASSWORD: 'Password-123',
      });
    });
  }
});
