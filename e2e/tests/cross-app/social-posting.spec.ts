import { expect, test, type APIResponse } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import {
  seedE2EAdmin,
  seedE2EFeedPost,
  seedE2EGig,
  seedE2EGroup,
  seedE2EProductionTeam,
  seedE2EStudio,
  seedE2EUser,
} from '../../helpers/seed';
import { getSupabaseAdmin, getSupabaseAnon } from '../../helpers/supabase';

test.describe.configure({ mode: 'serial' });

type TestUser = Awaited<ReturnType<typeof seedE2EUser>>;

async function clientFor(user: Pick<TestUser, 'email' | 'password'>) {
  const client = getSupabaseAnon();
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  expect(error).toBeNull();
  return client;
}

async function invokeSocial(client: ReturnType<typeof getSupabaseAnon>, body: Record<string, unknown>) {
  return client.functions.invoke('manage-social-feed', { body });
}

async function expectHttpErrorBody(error: unknown) {
  const context = (error as { context?: APIResponse | Response })?.context;
  if (!context || typeof (context as Response).json !== 'function') return null;
  try {
    return await (context as Response).json();
  } catch {
    return null;
  }
}

test.describe('social posting and follower notifications', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('allows creator and fan roles to post, validates media safety, and supports fan comments/shares', async () => {
    const creatorInputs = [
      { suffix: 'post-role-musician', role: 'musician' as const, fullName: 'E2E Post Role Musician' },
      { suffix: 'post-role-producer', role: 'producer' as const, fullName: 'E2E Post Role Producer' },
      { suffix: 'post-role-studio', role: 'studio-owner' as const, fullName: 'E2E Post Role Studio Owner' },
      { suffix: 'post-role-venue', role: 'venue-owner' as const, fullName: 'E2E Post Role Venue Owner' },
    ];

    const admin = await seedE2EAdmin();
    const creators = await Promise.all(creatorInputs.map((input) => seedE2EUser(input)));
    const fan = await seedE2EUser({
      suffix: 'post-role-fan',
      role: 'fan',
      fullName: 'E2E Post Role Fan',
    });
    const fanClient = await clientFor(fan);
    const createdPostIds: string[] = [];

    for (const creator of [...creators, admin]) {
      const client = await clientFor(creator);
      const { data, error } = await invokeSocial(client, {
        action: 'create_post',
        content: `E2E social post by ${creator.role}`,
        visibility: 'public',
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
      expect(data?.data?.id).toBeTruthy();
      createdPostIds.push(String(data.data.id));
    }

    const fanCreate = await invokeSocial(fanClient, {
      action: 'create_post',
      content: 'E2E social post by fan',
      visibility: 'public',
    });
    expect(fanCreate.error).toBeNull();
    expect(fanCreate.data?.success).toBe(true);
    expect(fanCreate.data?.data?.id).toBeTruthy();
    createdPostIds.push(String(fanCreate.data.data.id));

    const blockedFanPost = await invokeSocial(fanClient, {
      action: 'create_post',
      content: 'E2E fan t@ng!na local moderation should block this post',
      visibility: 'public',
    });
    expect(blockedFanPost.error).toBeNull();
    expect(blockedFanPost.data?.blocked).toBe(true);
    expect(blockedFanPost.data?.status).toBe('blocked');
    expect(blockedFanPost.data?.moderation?.categories).toContain('filipino_profanity');

    const mediaOwner = creators[0];
    const mediaClient = await clientFor(mediaOwner);
    const mediaCreate = await invokeSocial(mediaClient, {
      action: 'create_post',
      content: 'E2E mixed media post',
      visibility: 'public',
      media: [
        {
          media_type: 'image',
          storage_path: `${mediaOwner.id}/e2e/social/image.jpg`,
          mime_type: 'image/jpeg',
          safety_status: 'passed',
          safety_metadata: { e2e: true },
        },
        {
          media_type: 'video',
          storage_path: `${mediaOwner.id}/e2e/social/video.mp4`,
          thumbnail_path: `${mediaOwner.id}/e2e/social/video-thumb.jpg`,
          mime_type: 'video/mp4',
          duration_seconds: 3,
          safety_status: 'passed',
          safety_metadata: { e2e: true },
          is_cover: true,
        },
      ],
    });
    expect(mediaCreate.error).toBeNull();
    expect(mediaCreate.data?.data?.media).toHaveLength(2);
    createdPostIds.push(String(mediaCreate.data.data.id));

    const blockedMedia = await invokeSocial(mediaClient, {
      action: 'create_post',
      content: 'E2E blocked media should fail',
      media: [
        {
          media_type: 'image',
          storage_path: `${mediaOwner.id}/e2e/social/blocked.jpg`,
          mime_type: 'image/jpeg',
          safety_status: 'blocked',
        },
      ],
    });
    expect(blockedMedia.error).toBeTruthy();
    const blockedMediaBody = await expectHttpErrorBody(blockedMedia.error);
    expect(String(blockedMediaBody?.error || '')).toContain('Media must pass AI safety screening');

    const blockedFilipinoPost = await invokeSocial(mediaClient, {
      action: 'create_post',
      content: 'E2E t@ng!na local moderation should block this post',
      visibility: 'public',
    });
    expect(blockedFilipinoPost.error).toBeNull();
    expect(blockedFilipinoPost.data?.blocked).toBe(true);
    expect(blockedFilipinoPost.data?.status).toBe('blocked');
    expect(blockedFilipinoPost.data?.moderation?.categories).toContain('filipino_profanity');

    const postId = createdPostIds[0];
    const comment = await invokeSocial(fanClient, {
      action: 'add_comment',
      post_id: postId,
      content: 'E2E this is a normal fan comment',
    });
    expect(comment.error).toBeNull();
    expect(comment.data?.success).toBe(true);
    expect(['approved', 'pending_review']).toContain(comment.data?.status);

    const blockedComment = await invokeSocial(fanClient, {
      action: 'add_comment',
      post_id: postId,
      content: 'E2E kill yourself',
    });
    expect(blockedComment.error).toBeNull();
    expect(blockedComment.data?.blocked).toBe(true);
    expect(blockedComment.data?.status).toBe('blocked');

    const blockedFilipinoComment = await invokeSocial(fanClient, {
      action: 'add_comment',
      post_id: postId,
      content: 'E2E g@go ka',
    });
    expect(blockedFilipinoComment.error).toBeNull();
    expect(blockedFilipinoComment.data?.blocked).toBe(true);
    expect(blockedFilipinoComment.data?.status).toBe('blocked');
    expect(blockedFilipinoComment.data?.moderation?.categories).toContain('filipino_profanity');

    const share = await invokeSocial(fanClient, {
      action: 'share_post',
      post_id: postId,
    });
    expect(share.error).toBeNull();
    expect(share.data?.success).toBe(true);
    expect(Number(share.data?.data?.share_count)).toBeGreaterThanOrEqual(1);

    const update = await invokeSocial(mediaClient, {
      action: 'update_post',
      post_id: postId,
      content: 'E2E social post updated by owner',
      visibility: 'public',
    });
    expect(update.error).toBeNull();
    expect(update.data?.success).toBe(true);

    const fanDelete = await invokeSocial(fanClient, {
      action: 'delete_post',
      post_id: postId,
    });
    expect(fanDelete.error).toBeTruthy();
  });

  test('notifies followers when followed creators publish posts, gigs, venues, groups, and production teams', async () => {
    const fan = await seedE2EUser({
      suffix: 'follow-notification-fan',
      role: 'fan',
      fullName: 'E2E Follow Notification Fan',
    });
    const musician = await seedE2EUser({
      suffix: 'follow-notification-musician',
      role: 'musician',
      fullName: 'E2E Follow Notification Musician',
    });
    const venueOwner = await seedE2EUser({
      suffix: 'follow-notification-venue',
      role: 'venue-owner',
      fullName: 'E2E Follow Notification Venue Owner',
    });
    const producer = await seedE2EUser({
      suffix: 'follow-notification-producer',
      role: 'producer',
      fullName: 'E2E Follow Notification Producer',
    });

    const client = getSupabaseAdmin();
    const { error: followError } = await client.from('follows').upsert([
      { follower_id: fan.id, followed_id: musician.id, followed_type: 'profile' },
      { follower_id: fan.id, followed_id: venueOwner.id, followed_type: 'profile' },
      { follower_id: fan.id, followed_id: producer.id, followed_type: 'profile' },
    ], { onConflict: 'follower_id,followed_type,followed_id' });
    if (followError) throw followError;

    await seedE2EFeedPost(musician.id, 'follow-notification-post');
    await seedE2EGig(musician.id, 'follow-notification-gig');
    await seedE2EGroup(musician.id, 'follow-notification-group');
    await seedE2EStudio(venueOwner.id, 'follow-notification-venue');
    await seedE2EProductionTeam(producer.id, 'follow-notification-production');

    await expect
      .poll(async () => {
        const { data, error } = await client
          .from('notifications')
          .select('type, meta')
          .eq('user_id', fan.id);
        if (error) throw error;
        for (const notification of data || []) {
          expect(notification.type).toBe('info');
        }
        return (data || [])
          .map((notification: any) => notification.meta?.event_type || notification.meta?.notification_type)
          .filter(Boolean)
          .sort();
      }, { timeout: 30_000 })
      .toEqual(expect.arrayContaining([
        'followed_post_created',
        'followed_gig_created',
        'followed_group_created',
        'followed_venue_created',
        'followed_production_created',
      ]));
  });
});
