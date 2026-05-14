import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { requireAndroidApp, runMaestroFlow } from '../../helpers/maestro';
import { getSupabaseAdmin } from '../../helpers/supabase';
import {
  seedE2EFeedPost,
  seedE2EGroup,
  seedE2EPlaylistWithTrack,
  seedE2EProduct,
  seedE2EUser,
} from '../../helpers/seed';

const reportReason = 'Spam or scam';

const expectReport = async (input: {
  reporterId: string;
  targetType: string;
  targetId: string;
  reason?: string;
}) => {
  let latest: any = null;

  await expect
    .poll(async () => {
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
      latest = data?.[0] || null;
      return Boolean(latest?.id);
    }, {
      message: `Expected pending report for ${input.targetType}:${input.targetId}`,
      timeout: 45_000,
    })
    .toBe(true);

  return latest;
};

test.describe.configure({ mode: 'serial' });

test.describe('mobile report buttons', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('submits profile, group, product, playlist, and post reports through mobile UI', async () => {
    test.setTimeout(900_000);

    const reporter = await seedE2EUser({
      suffix: 'm-report-r',
      role: 'musician',
      fullName: 'E2E Mobile Report Buttons Reporter',
    });
    const targetProfile = await seedE2EUser({
      suffix: 'mobile-report-profile-target',
      role: 'musician',
      fullName: 'E2E Mobile Report Profile Target',
    });
    const groupOwner = await seedE2EUser({
      suffix: 'mobile-report-group-owner',
      role: 'musician',
      fullName: 'E2E Mobile Report Group Owner',
    });
    const seller = await seedE2EUser({
      suffix: 'mobile-report-product-seller',
      role: 'producer',
      fullName: 'E2E Mobile Report Product Seller',
    });
    const playlistOwner = await seedE2EUser({
      suffix: 'mobile-report-playlist-owner',
      role: 'musician',
      fullName: 'E2E Mobile Report Playlist Owner',
    });
    const postAuthor = await seedE2EUser({
      suffix: 'mobile-report-post-author',
      role: 'musician',
      fullName: 'E2E Mobile Report Post Author',
    });
    const group = await seedE2EGroup(groupOwner.id, 'mobile-report-group');
    const product = await seedE2EProduct(seller.id, 'mobile-report-product');
    const { playlist } = await seedE2EPlaylistWithTrack(playlistOwner.id, 'mobile-report-playlist');
    const post = await seedE2EFeedPost(postAuthor.id, 'mobile-report-post');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: reporter.email,
      E2E_MOBILE_PASSWORD: reporter.password,
    });

    const targets = [
      {
        route: `musikalokal://profile?userId=${targetProfile.id}`,
        button: 'profile-report-button',
        targetType: 'profile',
        targetId: targetProfile.id,
      },
      {
        route: `musikalokal://group_details?id=${group.id}`,
        button: 'group-report-button',
        targetType: 'group',
        targetId: group.id,
      },
      {
        route: `musikalokal://product_details?product_id=${product.id}`,
        button: 'product-report-button',
        targetType: 'product',
        targetId: product.id,
      },
      {
        route: `musikalokal://playlist_details?playlist_id=${playlist.id}`,
        button: 'playlist-report-button',
        targetType: 'playlist',
        targetId: playlist.id,
      },
    ];

    for (const target of targets) {
      await runMaestroFlow('mobile-submit-report.yaml', {
        E2E_REPORT_ROUTE: target.route,
        E2E_REPORT_BUTTON_ID: target.button,
      });
      await expectReport({
        reporterId: reporter.id,
        targetType: target.targetType,
        targetId: target.targetId,
        reason: reportReason,
      });
    }

    await runMaestroFlow('mobile-submit-post-report.yaml', {
      E2E_REPORT_ROUTE: `musikalokal://post_details?post_id=${post.id}`,
    });
    await expectReport({
      reporterId: reporter.id,
      targetType: 'feed_post',
      targetId: post.id,
    });
  });
});
