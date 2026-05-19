import { test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import {
  seedE2EGig,
  seedE2EProductionTeam,
  seedE2EStudio,
  seedE2EUser,
} from '../../helpers/seed';
import { seedE2EStaffAssignment, seedE2EStaffUser } from '../../helpers/staff';
import { requireAndroidApp, runMaestroFlow } from '../../helpers/maestro';

test.describe.configure({ mode: 'serial' });

test.describe('mobile staff assignment access', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('routes assigned staff to the correct mobile workspace and gates level actions', async () => {
    test.setTimeout(1_200_000);

    const studioOwner = await seedE2EUser({
      suffix: 'mobile-staff-studio-owner',
      role: 'studio-owner',
      fullName: 'E2E Mobile Staff Studio Owner',
    });
    const venueOwner = await seedE2EUser({
      suffix: 'mobile-staff-venue-owner',
      role: 'venue-owner',
      fullName: 'E2E Mobile Staff Venue Owner',
    });
    const producer = await seedE2EUser({
      suffix: 'mobile-staff-production-owner',
      role: 'producer',
      fullName: 'E2E Mobile Staff Production Owner',
    });

    const studio = await seedE2EStudio(studioOwner.id, 'mobile-staff-studio');
    const gig = await seedE2EGig(venueOwner.id, 'mobile-staff-gig');
    const production = await seedE2EProductionTeam(producer.id, 'mobile-staff-production');

    const studioStaff = await seedE2EStaffUser({
      suffix: 'mobile-staff-studio-level1',
      fullName: 'E2E Mobile Studio Staff Level One',
    });
    const venueStaff = await seedE2EStaffUser({
      suffix: 'mobile-staff-venue-level2',
      fullName: 'E2E Mobile Venue Staff Level Two',
    });
    const productionStaff = await seedE2EStaffUser({
      suffix: 'mobile-staff-production-level3',
      fullName: 'E2E Mobile Production Staff Level Three',
    });

    await seedE2EStaffAssignment({
      staffUserId: studioStaff.id,
      entityType: 'studio',
      targetId: studio.id,
      accessLevel: 1,
    });
    await seedE2EStaffAssignment({
      staffUserId: venueStaff.id,
      entityType: 'venue',
      targetId: gig.id,
      accessLevel: 2,
    });
    await seedE2EStaffAssignment({
      staffUserId: productionStaff.id,
      entityType: 'production',
      targetId: production.id,
      accessLevel: 3,
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: studioStaff.email,
      E2E_MOBILE_PASSWORD: studioStaff.password,
    });
    await runMaestroFlow('mobile-staff-studio-level1.yaml', {
      E2E_STAFF_STUDIO_CARD_ID: `mobile-studio-card-${studio.id}`,
      E2E_STAFF_STUDIO_MANAGE_ID: `mobile-studio-manage-${studio.id}`,
      E2E_STAFF_STUDIO_EDIT_ID: `mobile-studio-edit-${studio.id}`,
      E2E_STAFF_STUDIO_DELETE_ID: `mobile-studio-delete-${studio.id}`,
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: venueStaff.email,
      E2E_MOBILE_PASSWORD: venueStaff.password,
    });
    await runMaestroFlow('mobile-staff-venue-level2.yaml', {
      E2E_STAFF_GIG_CARD_ID: `mobile-gig-card-${gig.id}`,
      E2E_STAFF_GIG_MANAGE_ID: `mobile-gig-manage-${gig.id}`,
      E2E_STAFF_GIG_EDIT_ID: `mobile-gig-edit-${gig.id}`,
      E2E_STAFF_GIG_DELETE_ID: `mobile-gig-delete-${gig.id}`,
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: productionStaff.email,
      E2E_MOBILE_PASSWORD: productionStaff.password,
    });
    await runMaestroFlow('mobile-staff-production-level3.yaml', {
      E2E_STAFF_PRODUCTION_CARD_ID: `mobile-production-card-${production.id}`,
      E2E_STAFF_PRODUCTION_MANAGE_ID: `mobile-production-manage-${production.id}`,
      E2E_STAFF_PRODUCTION_EDIT_ID: `mobile-production-edit-${production.id}`,
      E2E_STAFF_PRODUCTION_DELETE_ID: `mobile-production-delete-${production.id}`,
    });
  });
});
