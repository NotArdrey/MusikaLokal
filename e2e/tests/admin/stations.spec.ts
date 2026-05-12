import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectNoDbRecord, expectVisible } from '../../helpers/assertions';
import { seedE2EAdmin, seedE2EStation, seedE2EUser } from '../../helpers/seed';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

test.describe('admin stations CRUD', () => {
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

  test('reads, updates flags, and deletes a station through admin UI', async ({ page }) => {
    const creator = await seedE2EUser({
      suffix: 'station-owner',
      role: 'musician',
      fullName: 'E2E Station Owner',
    });
    const station = await seedE2EStation(creator.id, 'admin-station-crud');

    page.on('dialog', async (dialog) => {
      if (/delete station/i.test(dialog.message())) {
        await dialog.accept();
        return;
      }
      await dialog.dismiss();
    });

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/stations');
    await expectVisible(page.getByTestId('admin-stations-page'));
    await page.getByTestId('admin-stations-search-input').fill(station.name);

    const stationCard = page.getByTestId(`admin-station-card-${station.id}`);
    await expect(stationCard).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-station-toggle-active-${station.id}`).click();
    await expectDbRecord<any>('stations', 'id', station.id, (record) => record.is_active === false);

    await page.getByTestId(`admin-station-toggle-featured-${station.id}`).click();
    await expectDbRecord<any>('stations', 'id', station.id, (record) => record.is_featured === true);

    await page.getByTestId(`admin-station-delete-${station.id}`).click();
    await expectNoDbRecord('stations', 'id', station.id);
  });
});
