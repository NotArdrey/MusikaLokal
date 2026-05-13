import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { assertE2EEmail, assertE2EName, makeRunId } from '../../helpers/env';
import { expectDbRecord, expectNoDbRecord, expectVisible } from '../../helpers/assertions';
import { seedE2EAdmin } from '../../helpers/seed';
import { requireProfileByEmail } from '../../helpers/supabase';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

test.describe('admin users CRUD', () => {
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

  test('creates, searches, edits, deletes, and verifies database cleanup', async ({ page }) => {
    const runId = makeRunId('admin-user-crud');
    const createdEmail = `e2e+${runId}@musikalokal.test`;
    const createdName = `E2E Admin User ${runId}`;
    const updatedName = `E2E Admin User Updated ${runId}`;

    assertE2EEmail(createdEmail);
    assertE2EName(createdName);
    assertE2EName(updatedName);

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/users');
    await expectVisible(page.getByTestId('admin-users-page'));

    await page.getByTestId('admin-users-add-button').click();
    await expectVisible(page.getByTestId('admin-user-form-modal'));
    await page.getByTestId('admin-user-full-name-input').fill(createdName);
    await page.getByTestId('admin-user-email-input').fill(createdEmail);
    await page.getByTestId('admin-user-role-musician').click();
    await page.getByTestId('admin-user-contact-input').fill('+639171111111');
    await page.getByTestId('admin-user-address-input').fill('E2E Admin User Address');
    await page.getByTestId('admin-user-skills-input').fill('Guitar, Vocals');
    await page.getByTestId('admin-user-genres-input').fill('OPM, Jazz');
    await page.getByTestId('admin-user-bio-input').fill('E2E created from admin CRUD.');
    await page.getByTestId('admin-user-password-input').fill('E2E-password-123');
    await page.getByTestId('admin-user-confirm-password-input').fill('E2E-password-123');
    await page.getByTestId('admin-user-verified-yes').click();
    await page.getByTestId('admin-user-email-confirmed-yes').click();
    await page.getByTestId('admin-user-form-submit').click();

    const createdProfile = await expectDbRecord<any>('profiles', 'email', createdEmail, (record) => (
      record.full_name === createdName &&
      record.role === 'musician' &&
      record.is_verified === true
    ));
    await expect(page.getByTestId(`admin-user-card-${createdProfile.id}`)).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('admin-users-search-input').fill(createdEmail);
    await expect(page.getByTestId(`admin-user-card-${createdProfile.id}`)).toBeVisible();
    await page.getByTestId(`admin-user-edit-${createdProfile.id}`).click();
    await expectVisible(page.getByTestId('admin-user-form-modal'));
    await page.getByTestId('admin-user-full-name-input').fill(updatedName);
    await page.getByTestId('admin-user-bio-input').fill('E2E updated from admin CRUD.');
    await page.getByTestId('admin-user-form-submit').click();

    await expectDbRecord<any>('profiles', 'email', createdEmail, (record) => (
      record.full_name === updatedName &&
      record.bio === 'E2E updated from admin CRUD.'
    ));
    await expect(page.getByTestId(`admin-user-card-${createdProfile.id}`).getByText(updatedName)).toBeVisible({ timeout: 45_000 });

    const updatedProfile = await requireProfileByEmail(createdEmail);
    await page.getByTestId(`admin-user-delete-${updatedProfile.id}`).click();
    await page.getByTestId('custom-alert-button-delete').click();
    await expect(page.getByTestId(`admin-user-card-${updatedProfile.id}`)).toHaveCount(0, { timeout: 45_000 });
    await expectNoDbRecord('profiles', 'email', createdEmail);
  });
});
