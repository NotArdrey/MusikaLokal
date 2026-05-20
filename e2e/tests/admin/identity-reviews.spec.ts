import { expect, test, type Page } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectNoDbRecord, expectVisible } from '../../helpers/assertions';
import { seedE2EAdmin, seedE2EManualIdentityReview, seedE2EUser } from '../../helpers/seed';
import { findAuthUserByEmail } from '../../helpers/supabase';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

async function dismissCustomAlertIfPresent(page: Page) {
  const okButton = page.getByTestId('custom-alert-button-ok');
  if (await okButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await okButton.click();
  }
}

test.describe('admin identity review moderation', () => {
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

  test('approves and declines manual identity reviews through admin UI', async ({ page }) => {
    const approveUser = await seedE2EUser({
      suffix: 'identity-approve',
      role: 'musician',
      fullName: 'E2E Identity Approve User',
      verified: false,
    });
    const declineUser = await seedE2EUser({
      suffix: 'identity-decline',
      role: 'musician',
      fullName: 'E2E Identity Decline User',
      verified: false,
    });
    const approveReview = await seedE2EManualIdentityReview(
      approveUser.id,
      approveUser.email,
      'identity-approve',
    );
    const declineReview = await seedE2EManualIdentityReview(
      declineUser.id,
      declineUser.email,
      'identity-decline',
    );

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/identity-reviews');
    await expectVisible(page.getByTestId('admin-identity-reviews-page'));

    await page.getByTestId('admin-identity-reviews-search-input').fill(approveUser.email);
    await expect(page.getByTestId(`admin-identity-review-card-${approveReview.id}`)).toBeVisible({ timeout: 45_000 });
    await page.getByTestId(`admin-identity-review-approve-${approveReview.id}`).click();
    await expectVisible(page.getByTestId('admin-identity-review-decision-modal'));
    await page.getByTestId('admin-identity-review-notes-input').fill('E2E approval from admin identity review spec.');
    await page.getByTestId('admin-identity-review-confirm-button').click();
    await expectDbRecord<any>('manual_identity_reviews', 'id', approveReview.id, (record) => (
      String(record.status || '').toUpperCase() === 'APPROVED'
    ));
    await expectDbRecord<any>('profiles', 'id', approveUser.id, (record) => record.is_verified === true);
    await expect(page.getByTestId('admin-identity-review-decision-modal')).toBeHidden({ timeout: 45_000 });
    await dismissCustomAlertIfPresent(page);

    const searchInput = page.getByTestId('admin-identity-reviews-search-input');
    await searchInput.fill('');
    await expect(searchInput).toHaveValue('');
    await searchInput.fill(declineUser.email);
    await expect(searchInput).toHaveValue(declineUser.email);
    await expect(page.getByTestId(`admin-identity-review-card-${declineReview.id}`)).toBeVisible({ timeout: 45_000 });
    await page.getByTestId(`admin-identity-review-decline-${declineReview.id}`).click();
    await expectVisible(page.getByTestId('admin-identity-review-decision-modal'));
    await page.getByTestId('admin-identity-review-notes-input').fill('E2E decline from admin identity review spec.');
    await page.getByTestId('admin-identity-review-confirm-button').click();
    await expectNoDbRecord('manual_identity_reviews', 'id', declineReview.id);
    await expectNoDbRecord('profiles', 'id', declineUser.id);
    await expect
      .poll(async () => {
        const authUser = await findAuthUserByEmail(declineUser.email);
        return authUser?.id || null;
      }, { timeout: 30_000 })
      .toBeNull();
    await expect(page.getByTestId('admin-identity-review-decision-modal')).toBeHidden({ timeout: 45_000 });
    await dismissCustomAlertIfPresent(page);
  });
});
