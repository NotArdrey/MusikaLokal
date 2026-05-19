import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectVisible } from '../../helpers/assertions';
import { seedE2EAdmin, seedE2EReport, seedE2EUser } from '../../helpers/seed';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

test.describe('admin reports moderation CRUD', () => {
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

  test('reads, resolves, reopens, and dismisses a seeded report through admin UI', async ({ page }) => {
    const reporter = await seedE2EUser({
      suffix: 'reporter',
      role: 'musician',
      fullName: 'E2E Report Reporter',
    });
    const target = await seedE2EUser({
      suffix: 'report-target',
      role: 'musician',
      fullName: 'E2E Report Target',
    });
    const report = await seedE2EReport({
      reporterId: reporter.id,
      targetType: 'profile',
      targetId: target.id,
      suffix: 'admin-report-moderation',
    });

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/reports');
    await expectVisible(page.getByTestId('admin-reports-page'));
    await page.getByTestId('admin-reports-search-input').fill(report.reason);

    const reportCard = page.getByTestId(`admin-report-card-${report.id}`);
    await expect(reportCard).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-report-resolve-${report.id}`).click();
    await expect(page.getByTestId('admin-report-moderation-modal')).toBeVisible();
    await page.getByTestId('admin-report-account-action-mark_unverified').click();
    await page.getByTestId('admin-report-moderation-apply-button').click();
    await expectDbRecord<any>('reports', 'id', report.id, (record) => record.status === 'resolved');
    await expectDbRecord<any>(
      'profiles',
      'id',
      target.id,
      (record) => record.is_verified === false && record.verification_status === 'PENDING_REVIEW',
    );

    await page.getByTestId(`admin-report-reopen-${report.id}`).click();
    await expectDbRecord<any>('reports', 'id', report.id, (record) => record.status === 'pending');

    await page.getByTestId(`admin-report-dismiss-${report.id}`).click();
    await expectDbRecord<any>('reports', 'id', report.id, (record) => record.status === 'dismissed');
  });
});
