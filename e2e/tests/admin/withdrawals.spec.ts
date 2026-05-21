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

async function hasPlatformWithdrawalsTable() {
  const { error } = await getSupabaseAdmin()
    .from('platform_withdrawals')
    .select('id')
    .limit(1);

  if (!error) return true;
  if (String(error.code || '') === 'PGRST205' || /Could not find the table/i.test(error.message || '')) {
    return false;
  }

  throw error;
}

test.describe('admin platform withdrawals CRUD', () => {
  let adminId = '';
  let adminEmail = '';
  let adminPassword = '';

  test.beforeAll(async () => {
    await cleanupE2ERecords();
    const admin = await seedE2EAdmin();
    adminId = admin.id;
    adminEmail = admin.email;
    adminPassword = admin.password;

    const owner = await seedE2EUser({
      suffix: 'platform-withdrawal-owner',
      role: 'studio-owner',
      fullName: 'E2E Platform Withdrawal Owner',
    });
    const studio = await seedE2EStudio(owner.id, 'platform-withdrawal-studio');
    await seedE2EStudioBooking({
      userId: admin.id,
      studioId: studio.id,
      suffix: 'platform-withdrawal-paid-booking',
      status: 'completed',
      paymentStatus: 'paid',
    });
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('creates and reads a manual platform withdrawal through admin UI', async ({ page }) => {
    test.skip(
      !(await hasPlatformWithdrawalsTable()),
      'platform_withdrawals is not exposed in the current live schema.',
    );

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin');

    const section = page.getByTestId('admin-withdrawals-section');
    await expectVisible(section);
    await section.scrollIntoViewIfNeeded();
    await page.getByTestId('admin-platform-withdrawal-open-button').click();
    await expectVisible(page.getByTestId('admin-platform-withdrawal-modal'));

    await page.getByTestId('admin-platform-withdrawal-amount-input').fill('350');
    await expect(page.getByTestId('admin-platform-withdrawal-submit-button')).toBeEnabled({ timeout: 45_000 });
    await page.getByTestId('admin-platform-withdrawal-submit-button').click();
    await expect(page.getByText('Platform Withdrawal Recorded')).toBeVisible({ timeout: 45_000 });

    await expect
      .poll(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('platform_withdrawals')
          .select('*')
          .eq('processed_by', adminId)
          .eq('amount', 350)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return data;
      }, { timeout: 30_000 })
      .not.toBeNull();

    const { data: latestWithdrawal, error } = await getSupabaseAdmin()
      .from('platform_withdrawals')
      .select('*')
      .eq('processed_by', adminId)
      .eq('amount', 350)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;

    await expect(page.getByTestId(`admin-withdrawal-row-${latestWithdrawal.id}`)).toBeVisible({ timeout: 45_000 });
    await page.getByTestId(`admin-withdrawal-details-${latestWithdrawal.id}`).click();
    await expect(page.getByText('Withdrawal Details')).toBeVisible();
  });
});
