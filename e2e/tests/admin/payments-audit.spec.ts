import { promises as fs } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectVisible } from '../../helpers/assertions';
import {
  seedE2EAdmin,
  seedE2EStudio,
  seedE2EStudioBooking,
  seedE2EUser,
} from '../../helpers/seed';
import { getSupabaseAdmin } from '../../helpers/supabase';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });
test.use({ acceptDownloads: true });

const futureBookingDate = (daysFromNow: number) => (
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
);

test.describe('admin payment transactions and audit', () => {
  let adminEmail = '';
  let adminPassword = '';
  let paidBookingId = '';
  let cancelledBookingId = '';
  let refundedBookingId = '';
  let refundPendingBookingId = '';
  let partialBookingId = '';
  let pendingBookingId = '';
  let failedBookingId = '';

  test.beforeAll(async () => {
    await cleanupE2ERecords();
    const admin = await seedE2EAdmin();
    adminEmail = admin.email;
    adminPassword = admin.password;

    const customer = await seedE2EUser({
      suffix: 'payment-audit-customer',
      role: 'musician',
      fullName: 'E2E Payment Audit Customer',
    });
    const owner = await seedE2EUser({
      suffix: 'payment-audit-owner',
      role: 'studio-owner',
      fullName: 'E2E Payment Audit Owner',
    });
    const studio = await seedE2EStudio(owner.id, 'payment-audit-studio');
    const client = getSupabaseAdmin();

    const paid = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'payment-audit-paid',
      bookingDate: futureBookingDate(3),
      paymentStatus: 'paid',
      paymentAmount: 1000,
    });
    paidBookingId = paid.id;
    await client
      .from('studio_bookings')
      .update({
        payment_method: 'card',
        payment_intent_id: '=E2E-FORMULA-GUARD',
        checkout_session_id: 'e2e-checkout-paid',
      })
      .eq('id', paid.id);

    const partial = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'payment-audit-partial',
      bookingDate: futureBookingDate(4),
      paymentStatus: 'partial',
      paymentType: 'downpayment',
      paymentAmount: 400,
      remainingBalance: 600,
    });
    partialBookingId = partial.id;

    const pending = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'payment-audit-pending',
      bookingDate: futureBookingDate(5),
      paymentStatus: 'pending',
      paymentAmount: 0,
    });
    pendingBookingId = pending.id;

    const failed = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'payment-audit-failed',
      bookingDate: futureBookingDate(6),
      paymentStatus: 'failed',
      paymentAmount: 0,
    });
    failedBookingId = failed.id;

    const cancelled = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'payment-audit-cancelled',
      bookingDate: futureBookingDate(7),
      status: 'cancelled',
      paymentStatus: 'pending',
      paymentAmount: 0,
    });
    cancelledBookingId = cancelled.id;
    await client
      .from('studio_bookings')
      .update({ cancellation_reason: 'E2E cancelled payment audit' })
      .eq('id', cancelled.id);

    const refunded = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'payment-audit-refunded',
      bookingDate: futureBookingDate(8),
      status: 'cancelled',
      paymentStatus: 'refunded',
      paymentAmount: 1000,
    });
    refundedBookingId = refunded.id;
    await client
      .from('studio_bookings')
      .update({
        refund_amount: 1000,
        refund_id: 'e2e-refund-complete',
        refunded_at: new Date().toISOString(),
        cancellation_reason: 'E2E refunded payment audit',
      })
      .eq('id', refunded.id);

    const refundPending = await seedE2EStudioBooking({
      userId: customer.id,
      studioId: studio.id,
      suffix: 'payment-audit-refund-pending',
      bookingDate: futureBookingDate(9),
      status: 'cancelled',
      paymentStatus: 'refund_pending',
      paymentAmount: 1000,
    });
    refundPendingBookingId = refundPending.id;
    await client
      .from('studio_bookings')
      .update({
        refund_amount: 500,
        refund_id: 'e2e-refund-pending',
        cancellation_reason: 'E2E refund pending payment audit',
      })
      .eq('id', refundPending.id);
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('exports filtered payment transactions as Excel from the admin dashboard', async ({ page }) => {
    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin');
    await expectVisible(page.getByTestId('admin-dashboard-page'));
    await expectVisible(page.getByTestId('admin-payment-transactions-section'));

    await page.getByTestId('admin-dashboard-global-search-input').fill(paidBookingId);
    await expect(page.getByTestId(`admin-payment-transaction-row-${paidBookingId}`)).toBeVisible({ timeout: 45_000 });
    await page.getByTestId(`admin-payment-transaction-details-${paidBookingId}`).click();
    await expect(page.getByText('Payment Details')).toBeVisible();
    await page.getByTestId('custom-alert-button-ok').click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('admin-payment-transactions-export-button').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^musikalokal-payment-transactions-\d{4}-\d{2}-\d{2}\.xls$/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const content = await fs.readFile(filePath as string, 'utf8');
    expect(content).toContain('MusikaLokal Payment Transactions');
    expect(content).toContain('Payment Paid');
    expect(content).toContain('&#39;=E2E-FORMULA-GUARD');

    await expect(page.getByText('Excel Export Ready')).toBeVisible();
    await page.getByTestId('custom-alert-button-ok').click();

    const pdfDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('admin-payment-transactions-export-pdf-button').click();
    const pdfDownload = await pdfDownloadPromise;

    expect(pdfDownload.suggestedFilename()).toMatch(/^musikalokal-payment-transactions-\d{4}-\d{2}-\d{2}\.pdf$/);
    const pdfPath = await pdfDownload.path();
    expect(pdfPath).toBeTruthy();

    const pdfContent = await fs.readFile(pdfPath as string, 'utf8');
    expect(pdfContent).toContain('%PDF-1.4');
    expect(pdfContent).toContain('MusikaLokal Payment Transactions');
    expect(pdfContent).toContain('Payment Paid');
  });

  test('shows payment paid, partial, pending, failed, cancelled, refunded, and refund-pending audit entries', async ({ page }) => {
    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/audit');
    await expect(page.getByPlaceholder('Search activity history')).toBeVisible({ timeout: 45_000 });

    const cases = [
      { id: paidBookingId, label: 'Payment completed' },
      { id: partialBookingId, label: 'Partially paid' },
      { id: pendingBookingId, label: 'Waiting for payment' },
      { id: failedBookingId, label: 'Payment failed' },
      { id: cancelledBookingId, label: 'Payment cancelled' },
      { id: refundedBookingId, label: 'Payment refunded' },
      { id: refundPendingBookingId, label: 'Refund in progress' },
    ];

    for (const item of cases) {
      await page.getByPlaceholder('Search activity history').fill(item.id);
      const card = page.getByTestId(`admin-audit-card-payment-${item.id}`);
      await expect(card).toBeVisible({ timeout: 45_000 });
      await expect(card.getByText(`What happened: ${item.label}`)).toBeVisible();
      await expect(card.getByText('Area: Payments')).toBeVisible();
    }
  });
});
