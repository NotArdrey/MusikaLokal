import { expect, test, type Page } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { getSupabaseAdmin } from '../../helpers/supabase';
import {
  seedE2EAdmin,
  seedE2EFeedPost,
  seedE2EGroup,
  seedE2EPlaylistWithTrack,
  seedE2EProduct,
  seedE2EUser,
} from '../../helpers/seed';
import { loginAsAdmin, loginAsWebUser } from '../../helpers/web-auth';

const reportReason = 'Spam or scam';

type ReportTargetType = 'profile' | 'group' | 'product' | 'playlist' | 'feed_post';

type CreatedReport = {
  id: string;
  targetId: string;
  targetType: ReportTargetType;
};

const submittedWebReports: CreatedReport[] = [];

const findReport = async (input: {
  reporterId: string;
  targetType: string;
  targetId: string;
  reason?: string;
}) => {
  let query = getSupabaseAdmin()
    .from('reports')
    .select('*')
    .eq('reporter_id', input.reporterId)
    .eq('target_type', input.targetType)
    .eq('target_id', input.targetId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);

  if (input.reason) {
    query = query.eq('reason', input.reason);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
};

const expectReport = async (input: {
  reporterId: string;
  targetType: string;
  targetId: string;
  reason?: string;
}) => {
  let latest: any = null;

  await expect
    .poll(async () => {
      latest = await findReport(input);
      return Boolean(latest?.id);
    }, { timeout: 45_000 })
    .toBe(true);

  return latest;
};

const submitWebReport = async (
  page: Page,
  route: string,
  reportButtonTestId: string,
) => {
  await page.goto(route);
  await expect(page.getByTestId(reportButtonTestId)).toBeVisible({ timeout: 45_000 });
  await page.getByTestId(reportButtonTestId).click();
  await expect(page.getByTestId('report-modal')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('report-reason-spam-or-scam').click();
  await page.getByTestId('report-submit-button').click();
  await expect(page.getByTestId('report-done-button')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('report-done-button').click();
};

const submitWebPostReport = async (page: Page, route: string) => {
  await page.goto(route);
  await expect(page.getByTestId('post-report-button')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('post-report-button').click();
};

test.describe.configure({ mode: 'serial' });

test.describe('web report buttons with admin moderation', () => {
  let adminEmail = '';
  let adminPassword = '';
  let reporter: Awaited<ReturnType<typeof seedE2EUser>>;

  test.beforeAll(async () => {
    await cleanupE2ERecords();
    const admin = await seedE2EAdmin();
    adminEmail = admin.email;
    adminPassword = admin.password;
    reporter = await seedE2EUser({
      suffix: 'web-report-buttons-reporter',
      role: 'musician',
      fullName: 'E2E Web Report Buttons Reporter',
    });
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('submits profile, group, product, playlist, and post reports from web buttons', async ({ page }) => {
    const targetProfile = await seedE2EUser({
      suffix: 'web-report-profile-target',
      role: 'musician',
      fullName: 'E2E Web Report Profile Target',
    });
    const groupOwner = await seedE2EUser({
      suffix: 'web-report-group-owner',
      role: 'musician',
      fullName: 'E2E Web Report Group Owner',
    });
    const seller = await seedE2EUser({
      suffix: 'web-report-product-seller',
      role: 'producer',
      fullName: 'E2E Web Report Product Seller',
    });
    const playlistOwner = await seedE2EUser({
      suffix: 'web-report-playlist-owner',
      role: 'musician',
      fullName: 'E2E Web Report Playlist Owner',
    });
    const postAuthor = await seedE2EUser({
      suffix: 'web-report-post-author',
      role: 'musician',
      fullName: 'E2E Web Report Post Author',
    });
    const group = await seedE2EGroup(groupOwner.id, 'web-report-group');
    const product = await seedE2EProduct(seller.id, 'web-report-product');
    const { playlist } = await seedE2EPlaylistWithTrack(playlistOwner.id, 'web-report-playlist');
    const post = await seedE2EFeedPost(postAuthor.id, 'web-report-post');

    await loginAsWebUser(page, reporter.email, reporter.password);

    const targets = [
      {
        route: `/profile?userId=${targetProfile.id}`,
        button: 'profile-report-button',
        targetType: 'profile' as const,
        targetId: targetProfile.id,
      },
      {
        route: `/group_details?id=${group.id}`,
        button: 'group-report-button',
        targetType: 'group' as const,
        targetId: group.id,
      },
      {
        route: `/product_details?product_id=${product.id}`,
        button: 'product-report-button',
        targetType: 'product' as const,
        targetId: product.id,
      },
      {
        route: `/playlist_details?playlist_id=${playlist.id}`,
        button: 'playlist-report-button',
        targetType: 'playlist' as const,
        targetId: playlist.id,
      },
    ];

    for (const target of targets) {
      await submitWebReport(page, target.route, target.button);
      const report = await expectReport({
        reporterId: reporter.id,
        targetType: target.targetType,
        targetId: target.targetId,
        reason: reportReason,
      });
      submittedWebReports.push({
        id: report.id,
        targetId: target.targetId,
        targetType: target.targetType,
      });
    }

    await submitWebPostReport(page, `/post_details?post_id=${post.id}`);
    const postReport = await expectReport({
      reporterId: reporter.id,
      targetType: 'feed_post',
      targetId: post.id,
      reason: reportReason,
    });
    submittedWebReports.push({
      id: postReport.id,
      targetId: post.id,
      targetType: 'feed_post',
    });
  });

  test('admin views and moderates reports submitted from web buttons', async ({ page }) => {
    expect(submittedWebReports.length).toBeGreaterThanOrEqual(4);

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/reports');
    await expect(page.getByTestId('admin-reports-page')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('admin-reports-search-input').fill(reportReason);

    const [firstReport, ...remainingReports] = submittedWebReports;

    await page.getByTestId(`admin-report-view-${firstReport.id}`).click();
    await expect(page.getByTestId('admin-report-details-modal')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('admin-report-details-close-button').click();

    const feedPostReport = submittedWebReports.find((report) => report.targetType === 'feed_post');
    expect(feedPostReport).toBeTruthy();
    await page.getByTestId(`admin-report-view-${feedPostReport!.id}`).click();
    await expect(page.getByTestId('admin-report-details-modal')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('admin-report-details-close-button').click();

    await page.getByTestId(`admin-report-moderate-${firstReport.id}`).click();
    await expect(page.getByTestId('admin-report-moderation-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('admin-report-moderation-status-resolved').click();
    await page.getByTestId('admin-report-moderation-action-warn_both').click();
    await page.getByTestId('admin-report-moderation-notes-input').fill('E2E admin moderated web-submitted report.');
    await page.getByTestId('admin-report-moderation-apply-button').click();
    await expect
      .poll(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('reports')
          .select('status, moderation_action, reviewed_by')
          .eq('id', firstReport.id)
          .single();
        if (error) throw error;
        return data;
      }, { timeout: 45_000 })
      .toMatchObject({
        status: 'resolved',
        moderation_action: 'warn_both',
        reviewed_by: expect.any(String),
      });

    for (const report of remainingReports) {
      await page.getByTestId(`admin-report-dismiss-${report.id}`).click();
      await expect
        .poll(async () => {
          const { data, error } = await getSupabaseAdmin()
            .from('reports')
            .select('status')
            .eq('id', report.id)
            .single();
          if (error) throw error;
          return data.status;
        }, { timeout: 30_000 })
        .toBe('dismissed');
    }
  });
});
