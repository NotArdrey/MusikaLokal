import { test } from '@playwright/test';
import { expectDbRecord } from '../../helpers/assertions';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { makeRunId } from '../../helpers/env';
import { requireAndroidApp, runMaestroFlow } from '../../helpers/maestro';
import { seedE2EMobileUser } from '../../helpers/seed';

test.describe.configure({ mode: 'serial' });

test.describe('mobile social posting', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('creates feed posts as a creator and fan', async () => {
    test.setTimeout(900_000);

    const creator = await seedE2EMobileUser(
      'mobile-social-post-creator',
      'musician',
      'E2E Mobile Social Post Creator',
    );
    const fan = await seedE2EMobileUser(
      'mobile-social-post-fan',
      'fan',
      'E2E Mobile Social Post Fan',
    );
    const content = `MobilePost${makeRunId('mobile-social-post').replace(/[^a-zA-Z0-9]/g, '')}`;
    const fanContent = `MobileFanPost${makeRunId('mobile-social-post-fan').replace(/[^a-zA-Z0-9]/g, '')}`;

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: creator.email,
      E2E_MOBILE_PASSWORD: creator.password,
    });
    await runMaestroFlow('mobile-feed-create-post.yaml', {
      E2E_POST_CONTENT: content,
    });

    await expectDbRecord<any>('feed_posts', 'content', content, (record) => (
      record.author_id === creator.id &&
      record.visibility === 'public' &&
      record.is_hidden === false
    ));

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: fan.email,
      E2E_MOBILE_PASSWORD: fan.password,
    });
    await runMaestroFlow('mobile-feed-create-post.yaml', {
      E2E_POST_CONTENT: fanContent,
    });

    await expectDbRecord<any>('feed_posts', 'content', fanContent, (record) => (
      record.author_id === fan.id &&
      record.visibility === 'public' &&
      record.is_hidden === false
    ));
  });
});
