import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectVisible } from '../../helpers/assertions';
import {
  seedE2EAdmin,
  seedE2EBookingIncident,
  seedE2EStudio,
  seedE2EStudioBooking,
  seedE2EUser,
} from '../../helpers/seed';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

test.describe('admin booking incidents moderation', () => {
  let adminEmail = '';
  let adminPassword = '';

  test.beforeAll(async () => {
    await cleanupE2ERecords();
    const admin = await seedE2EAdmin();
    adminEmail = admin.email;
    adminPassword = admin.password;
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('reads and resolves booking incidents with no-refund and refund outcomes', async ({ page }) => {
    const reporter = await seedE2EUser({
      suffix: 'incident-reporter',
      role: 'musician',
      fullName: 'E2E Incident Reporter',
    });
    const owner = await seedE2EUser({
      suffix: 'incident-owner',
      role: 'studio-owner',
      fullName: 'E2E Incident Studio Owner',
    });
    const noRefundStudio = await seedE2EStudio(owner.id, 'incident-no-refund-studio');
    const refundStudio = await seedE2EStudio(owner.id, 'incident-refund-studio');
    const noRefundBooking = await seedE2EStudioBooking({
      userId: reporter.id,
      studioId: noRefundStudio.id,
      suffix: 'incident-no-refund-booking',
    });
    const refundBooking = await seedE2EStudioBooking({
      userId: reporter.id,
      studioId: refundStudio.id,
      suffix: 'incident-refund-booking',
    });
    const noRefundIncident = await seedE2EBookingIncident({
      bookingId: noRefundBooking.id,
      reporterId: reporter.id,
      counterpartyId: owner.id,
      suffix: 'incident-no-refund',
    });
    const refundIncident = await seedE2EBookingIncident({
      bookingId: refundBooking.id,
      reporterId: reporter.id,
      counterpartyId: owner.id,
      suffix: 'incident-refund',
    });

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/reports?section=booking_incidents');
    await expectVisible(page.getByTestId('admin-reports-page'));
    await expectVisible(page.getByTestId('admin-incidents-section'));

    await expect(page.getByTestId(`admin-incident-card-${noRefundIncident.id}`)).toBeVisible({ timeout: 45_000 });
    await page.getByTestId(`admin-incident-resolve-no-refund-${noRefundIncident.id}`).click();
    await expectVisible(page.getByTestId('admin-incident-resolution-modal'));
    await page.getByTestId('admin-incident-resolution-notes-input').fill('E2E no-refund incident resolution.');
    await page.getByTestId('admin-incident-resolution-confirm-button').click();
    await expectDbRecord<any>('booking_incidents', 'id', noRefundIncident.id, (record) => (
      record.status === 'resolved_no_refund' &&
      record.resolution === 'E2E no-refund incident resolution.'
    ));

    await expect(page.getByTestId(`admin-incident-card-${refundIncident.id}`)).toBeVisible({ timeout: 45_000 });
    await page.getByTestId(`admin-incident-resolve-refund-${refundIncident.id}`).click();
    await expectVisible(page.getByTestId('admin-incident-resolution-modal'));
    await page.getByTestId('admin-incident-resolution-notes-input').fill('E2E refund incident resolution.');
    await page.getByTestId('admin-incident-resolution-confirm-button').click();
    await expectDbRecord<any>('booking_incidents', 'id', refundIncident.id, (record) => (
      record.status === 'resolved_refund' &&
      record.resolution === 'E2E refund incident resolution.'
    ));
  });
});
