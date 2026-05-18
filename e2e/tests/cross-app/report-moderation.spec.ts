import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord } from '../../helpers/assertions';
import { seedE2EAdmin, seedE2EReport, seedE2EUser } from '../../helpers/seed';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

test.describe('cross-app report moderation', () => {
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

  test('admin reads a mobile-style submitted report seeded under E2E scope', async ({ page }) => {
    const reporter = await seedE2EUser({
      suffix: 'cross-reporter',
      role: 'musician',
      fullName: 'E2E Cross Reporter',
    });
    const target = await seedE2EUser({
      suffix: 'cross-target',
      role: 'musician',
      fullName: 'E2E Cross Target',
    });
    const report = await seedE2EReport({
      reporterId: reporter.id,
      targetType: 'profile',
      targetId: target.id,
      suffix: 'cross-report',
    });

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/reports');
    await page.getByPlaceholder('Search reports').fill(String(report.reason));
    await expect(page.getByText(String(report.reason))).toBeVisible({ timeout: 45_000 });
    await expectDbRecord<any>('reports', 'id', report.id, (record) => record.status === 'pending');
  });
});
