import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { makeRunId } from '../../helpers/env';
import {
  seedE2EAdmin,
  seedE2EGig,
  seedE2EGigApplication,
  seedE2EProductionTeam,
  seedE2EStudio,
  seedE2EUser,
} from '../../helpers/seed';
import { seedE2EStaffAssignment, seedE2EStaffUser } from '../../helpers/staff';
import { expectDbRecord, expectVisible } from '../../helpers/assertions';
import { getSupabaseAdmin, getSupabaseAnon } from '../../helpers/supabase';
import { loginAsAdmin, loginAsWebUser } from '../../helpers/web-auth';

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

function responseRows(response: any) {
  if (Array.isArray(response?.data)) return response.data;
  return response?.data?.data || response?.data?.items || [];
}

async function expectFunctionRejected(response: any, message: string) {
  if (response.error) {
    expect(response.error, message).toBeTruthy();
    return;
  }

  expect(response.data?.success, message).not.toBe(true);
  expect(response.data?.error, message).toBeTruthy();
}

test.describe('requested live flow coverage', () => {
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

  test('admin creates a staff assignment and assigned staff lands in the scoped web workspace', async ({ page }) => {
    const owner = await seedE2EUser({
      suffix: 'web-admin-staff-studio-owner',
      role: 'studio-owner',
      fullName: 'E2E Web Admin Staff Studio Owner',
    });
    const studio = await seedE2EStudio(owner.id, 'web-admin-staff-studio');
    const runId = makeRunId('web-admin-staff-user');
    const staffEmail = `e2e+${runId}@musikalokal.test`;
    const staffName = `E2E Web Admin Staff ${runId}`;
    const password = 'E2E-password-123';

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/users');
    await expectVisible(page.getByTestId('admin-users-page'));
    await page.getByTestId('admin-users-add-button').click();
    await expectVisible(page.getByTestId('admin-user-form-modal'));

    await page.getByTestId('admin-user-full-name-input').fill(staffName);
    await page.getByTestId('admin-user-email-input').fill(staffEmail);
    await page.getByTestId('admin-user-role-staff').click();
    await page.getByTestId('admin-user-staff-entity-studio').click();
    await page.getByTestId('admin-user-staff-level-2').click();
    await expect(page.getByTestId(`admin-user-staff-target-${studio.id}`)).toBeVisible({ timeout: 45_000 });
    await page.getByTestId(`admin-user-staff-target-${studio.id}`).click();
    await page.getByTestId('admin-user-contact-input').fill('+639171111111');
    await page.getByTestId('admin-user-address-input').fill('E2E Staff Address');
    await page.getByTestId('admin-user-password-input').fill(password);
    await page.getByTestId('admin-user-confirm-password-input').fill(password);
    await page.getByTestId('admin-user-verified-yes').click();
    await page.getByTestId('admin-user-email-confirmed-yes').click();
    await page.getByTestId('admin-user-form-submit').click();

    const createdProfile = await expectDbRecord<any>('profiles', 'email', staffEmail, (record) => (
      record.full_name === staffName &&
      record.role === 'staff' &&
      record.is_verified === true
    ));

    await expect
      .poll(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('staff_listing_access')
          .select('staff_user_id, entity_type, studio_id, access_level')
          .eq('staff_user_id', createdProfile.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      }, { timeout: 30_000 })
      .toEqual(expect.objectContaining({
        staff_user_id: createdProfile.id,
        entity_type: 'studio',
        studio_id: studio.id,
        access_level: 2,
      }));

    await expect(page.getByTestId('admin-user-form-modal')).toHaveCount(0, { timeout: 45_000 });
    await page.getByTestId('admin-users-search-input').fill(staffEmail);
    await expect(page.getByTestId(`admin-user-card-${createdProfile.id}`)).toContainText('Staff Access', { timeout: 45_000 });
    await expect(page.getByTestId(`admin-user-card-${createdProfile.id}`)).toContainText('Level 2');

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await loginAsWebUser(page, staffEmail, password);
    await page.goto('/manage');
    await expect(page).toHaveURL(/\/my_studio/, { timeout: 45_000 });
    await expect(page.getByText(studio.name)).toBeVisible({ timeout: 45_000 });
  });

  test('staff levels are enforced for listing edits and booking/application actions', async () => {
    const studioOwner = await seedE2EUser({
      suffix: 'staff-api-studio-owner',
      role: 'studio-owner',
      fullName: 'E2E Staff API Studio Owner',
    });
    const otherStudioOwner = await seedE2EUser({
      suffix: 'staff-api-other-studio-owner',
      role: 'studio-owner',
      fullName: 'E2E Staff API Other Studio Owner',
    });
    const venueOwner = await seedE2EUser({
      suffix: 'staff-api-venue-owner',
      role: 'venue-owner',
      fullName: 'E2E Staff API Venue Owner',
    });
    const applicant = await seedE2EUser({
      suffix: 'staff-api-applicant',
      role: 'musician',
      fullName: 'E2E Staff API Applicant',
    });
    const producer = await seedE2EUser({
      suffix: 'staff-api-producer',
      role: 'producer',
      fullName: 'E2E Staff API Producer',
    });

    const studio = await seedE2EStudio(studioOwner.id, 'staff-api-studio');
    const otherStudio = await seedE2EStudio(otherStudioOwner.id, 'staff-api-other-studio');
    const gig = await seedE2EGig(venueOwner.id, 'staff-api-gig');
    const application = await seedE2EGigApplication({
      applicantId: applicant.id,
      gigId: gig.id,
      suffix: 'staff-api-gig-application',
      status: 'pending',
    });
    const production = await seedE2EProductionTeam(producer.id, 'staff-api-production');

    const levelOneStudioStaff = await seedE2EStaffUser({
      suffix: 'staff-api-studio-level1',
      fullName: 'E2E Staff API Studio Level One',
    });
    const levelTwoVenueStaff = await seedE2EStaffUser({
      suffix: 'staff-api-venue-level2',
      fullName: 'E2E Staff API Venue Level Two',
    });
    const levelThreeProductionStaff = await seedE2EStaffUser({
      suffix: 'staff-api-production-level3',
      fullName: 'E2E Staff API Production Level Three',
    });

    await seedE2EStaffAssignment({
      staffUserId: levelOneStudioStaff.id,
      entityType: 'studio',
      targetId: studio.id,
      accessLevel: 1,
    });
    await seedE2EStaffAssignment({
      staffUserId: levelTwoVenueStaff.id,
      entityType: 'venue',
      targetId: gig.id,
      accessLevel: 2,
    });
    await seedE2EStaffAssignment({
      staffUserId: levelThreeProductionStaff.id,
      entityType: 'production',
      targetId: production.id,
      accessLevel: 3,
    });

    const studioStaffClient = await clientFor(levelOneStudioStaff);
    const updatedStudioDescription = `E2E level 1 staff edited studio ${makeRunId('staff-api-studio-edit')}`;
    const studioUpdate = await studioStaffClient
      .from('studios')
      .update({ description: updatedStudioDescription })
      .eq('id', studio.id)
      .select('id, description')
      .single();
    expect(studioUpdate.error).toBeNull();
    expect(studioUpdate.data?.description).toBe(updatedStudioDescription);

    const forbiddenStudioDescription = `E2E should not edit other studio ${makeRunId('staff-api-other-edit')}`;
    const otherStudioUpdate = await studioStaffClient
      .from('studios')
      .update({ description: forbiddenStudioDescription })
      .eq('id', otherStudio.id)
      .select('id');
    expect(otherStudioUpdate.data || []).toHaveLength(0);
    const { data: otherStudioAfter } = await getSupabaseAdmin()
      .from('studios')
      .select('description')
      .eq('id', otherStudio.id)
      .single();
    expect(otherStudioAfter?.description).not.toBe(forbiddenStudioDescription);

    const venueStaffClient = await clientFor(levelTwoVenueStaff);
    const fetchApplications = await venueStaffClient.functions.invoke('gig-applications', {
      body: { action: 'fetch_gig_applications', gigId: gig.id },
    });
    expect(fetchApplications.error).toBeNull();
    expect(responseRows(fetchApplications).some((row: any) => row.id === application.id)).toBe(true);

    const applicationUpdate = await venueStaffClient.functions.invoke('gig-applications', {
      body: {
        action: 'update_application_status',
        applicationId: application.id,
        status: 'accepted',
      },
    });
    expect(applicationUpdate.error).toBeNull();
    await expectDbRecord<any>('gig_applications', 'id', application.id, (record) => record.status === 'accepted');

    const forbiddenGigDescription = `E2E level 2 should not edit gig ${makeRunId('staff-api-gig-edit')}`;
    const gigDirectUpdate = await venueStaffClient
      .from('gigs')
      .update({ description: forbiddenGigDescription })
      .eq('id', gig.id)
      .select('id');
    expect(gigDirectUpdate.data || []).toHaveLength(0);
    const { data: gigAfter } = await getSupabaseAdmin()
      .from('gigs')
      .select('description')
      .eq('id', gig.id)
      .single();
    expect(gigAfter?.description).not.toBe(forbiddenGigDescription);

    const productionStaffClient = await clientFor(levelThreeProductionStaff);
    const productionTeams = await productionStaffClient.functions.invoke('manage-production', {
      body: { action: 'list_my_teams' },
    });
    expect(productionTeams.error).toBeNull();
    const productionTeam = (productionTeams.data?.teams || []).find((team: any) => team.id === production.id);
    expect(productionTeam).toEqual(expect.objectContaining({
      id: production.id,
      staff_access_level: 3,
      staff_can_edit: false,
      staff_can_manage_bookings: false,
    }));

    const productionUpdate = await productionStaffClient.functions.invoke('manage-production', {
      body: {
        action: 'update_production_team',
        team_id: production.id,
        name: `${production.name} blocked`,
        description: 'E2E level 3 should not edit this production team',
      },
    });
    await expectFunctionRejected(productionUpdate, 'level 3 production staff cannot edit production teams');
  });

  test('public posts appear in For You and followed creators appear in Following', async () => {
    const creator = await seedE2EUser({
      suffix: 'feed-creator',
      role: 'musician',
      fullName: 'E2E Feed Creator',
    });
    const fan = await seedE2EUser({
      suffix: 'feed-fan',
      role: 'fan',
      fullName: 'E2E Feed Fan',
    });
    const creatorClient = await clientFor(creator);
    const fanClient = await clientFor(fan);

    const publicContent = `E2E For You public post ${makeRunId('feed-public')}`;
    const followersContent = `E2E Following followers post ${makeRunId('feed-followers')}`;

    const publicPost = await creatorClient.functions.invoke('manage-social-feed', {
      body: { action: 'create_post', content: publicContent, visibility: 'public' },
    });
    expect(publicPost.error).toBeNull();

    const followersPost = await creatorClient.functions.invoke('manage-social-feed', {
      body: { action: 'create_post', content: followersContent, visibility: 'followers' },
    });
    expect(followersPost.error).toBeNull();

    const forYouBeforeFollow = await fanClient.functions.invoke('manage-social-feed', {
      body: { action: 'get_feed', feed_type: 'public', limit: 50 },
    });
    expect(forYouBeforeFollow.error).toBeNull();
    expect(responseRows(forYouBeforeFollow).some((post: any) => post.content === publicContent)).toBe(true);
    expect(responseRows(forYouBeforeFollow).some((post: any) => post.content === followersContent)).toBe(false);

    const followingBeforeFollow = await fanClient.functions.invoke('manage-social-feed', {
      body: { action: 'get_feed', feed_type: 'following', limit: 50 },
    });
    expect(followingBeforeFollow.error).toBeNull();
    expect(responseRows(followingBeforeFollow).some((post: any) => post.author_id === creator.id)).toBe(false);

    const follow = await fanClient.functions.invoke('manage-social-feed', {
      body: { action: 'follow', target_id: creator.id, target_type: 'profile' },
    });
    expect(follow.error).toBeNull();

    const followingAfterFollow = await fanClient.functions.invoke('manage-social-feed', {
      body: { action: 'get_feed', feed_type: 'following', limit: 50 },
    });
    expect(followingAfterFollow.error).toBeNull();
    const followingContents = responseRows(followingAfterFollow).map((post: any) => post.content);
    expect(followingContents).toEqual(expect.arrayContaining([publicContent, followersContent]));
  });

  test('playlist creation can feed a live station queue visible from public station APIs', async () => {
    const musician = await seedE2EUser({
      suffix: 'live-station-musician',
      role: 'musician',
      fullName: 'E2E Live Station Musician',
    });
    const adminClient = await clientFor({ email: adminEmail, password: adminPassword });
    const musicianClient = await clientFor(musician);

    const playlistTitle = `E2E Playlist ${makeRunId('live-station-playlist')}`;
    const stationName = `E2E Live Station ${makeRunId('live-station')}`;
    const trackTitle = `E2E Station Track ${makeRunId('live-station-track')}`;

    const playlistCreate = await musicianClient.functions.invoke('manage-playlists', {
      body: {
        action: 'create_playlist',
        title: playlistTitle,
        description: `E2E playlist for live station ${makeRunId('live-station-playlist')}`,
        genre: 'OPM',
        visibility: 'public',
        items: [
          {
            title: trackTitle,
            artist_name: 'E2E Artist',
            audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            duration_seconds: 30,
          },
        ],
      },
    });
    expect(playlistCreate.error).toBeNull();
    const playlistId = playlistCreate.data?.data?.id;
    expect(playlistId).toBeTruthy();

    await expectDbRecord<any>('playlist_items', 'title', trackTitle, (record) => (
      record.playlist_id === playlistId &&
      Number(record.duration_seconds) === 30
    ));

    const stationCreate = await adminClient.functions.invoke('manage-playlists', {
      body: {
        action: 'create_station',
        name: stationName,
        description: `E2E live station ${makeRunId('live-station')}`,
        genre: 'OPM',
        managed_profile_id: musician.id,
        rotation_interval_minutes: 5,
      },
    });
    expect(stationCreate.error).toBeNull();
    const stationId = stationCreate.data?.data?.id;
    expect(stationId).toBeTruthy();

    const activateStation = await adminClient.functions.invoke('manage-playlists', {
      body: {
        action: 'update_station',
        station_id: stationId,
        name: stationName,
        description: `E2E live station active ${makeRunId('live-station')}`,
        genre: 'OPM',
        is_active: true,
        rotation_interval_minutes: 5,
      },
    });
    expect(activateStation.error).toBeNull();

    const slotCreate = await adminClient.functions.invoke('manage-playlists', {
      body: {
        action: 'add_station_slot',
        station_id: stationId,
        playlist_id: playlistId,
      },
    });
    expect(slotCreate.error).toBeNull();

    const publicClient = getSupabaseAnon();
    const details = await publicClient.functions.invoke('manage-playlists', {
      body: { action: 'get_station_details', station_id: stationId },
    });
    expect(details.error).toBeNull();
    expect(details.data?.data?.is_active).toBe(true);
    expect(details.data?.data?.live_slot_count).toBeGreaterThan(0);
    expect(details.data?.data?.live_slots?.[0]?.playlist_id).toBe(playlistId);
    expect(details.data?.data?.live_slots?.[0]?.playlist?.items?.[0]?.title).toBe(trackTitle);
    expect(details.data?.data?.live_slots?.[0]?.playlist?.items?.[0]?.audio_url).toMatch(/^https:\/\//);

    const browse = await publicClient.functions.invoke('manage-playlists', {
      body: { action: 'browse_stations', include_items: true, limit: 50 },
    });
    expect(browse.error).toBeNull();
    expect(responseRows(browse).some((station: any) => (
      station.id === stationId &&
      station.live_slot_count > 0 &&
      station.live_slots?.some((slot: any) => slot.playlist_id === playlistId)
    ))).toBe(true);
  });
});
