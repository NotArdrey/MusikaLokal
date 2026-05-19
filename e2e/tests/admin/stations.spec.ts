import { expect, test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { makeRunId } from '../../helpers/env';
import { expectDbRecord, expectNoDbRecord, expectVisible } from '../../helpers/assertions';
import { getSupabaseAdmin, getSupabaseAnon } from '../../helpers/supabase';
import { seedE2EAdmin, seedE2EPlaylistWithTrack, seedE2EStation, seedE2EUser } from '../../helpers/seed';
import { loginAsAdmin } from '../../helpers/web-auth';

test.describe.configure({ mode: 'serial' });

async function expectActionButtonsAligned(page: any, testIds: string[]) {
  const boxes = await Promise.all(
    testIds.map(async (testId) => {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, `${testId} should have a visible box`).not.toBeNull();
      return box!;
    }),
  );

  const centerYs = boxes.map((box) => Math.round(box.y + box.height / 2));
  const heights = boxes.map((box) => Math.round(box.height));
  expect(Math.max(...centerYs) - Math.min(...centerYs)).toBeLessThanOrEqual(2);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
}

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

  test('keeps auto-create hidden and opens an empty picker when no playlist source can create a station', async ({ page }) => {
    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/stations');
    await expectVisible(page.getByTestId('admin-stations-page'));
    await expectVisible(page.getByTestId('admin-stations-empty-title'));
    await expect(page.getByTestId('admin-stations-empty-description')).toContainText(
      'Create a public musician or group playlist first, then add it as a station.',
    );
    await expect(page.getByTestId('admin-stations-auto-create-button')).toHaveCount(0);
    await expect(page.getByTestId('admin-stations-empty-auto-create-button')).toHaveCount(0);
    await expect(page.getByTestId('admin-stations-add-button')).not.toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('admin-stations-add-button').click();
    await expectVisible(page.getByTestId('admin-station-source-picker-modal'));
    await expect(page.getByTestId('admin-station-source-picker-empty')).toContainText(
      'Create a public musician or group playlist first, then add it as a station.',
    );
    await expect(page.getByTestId('admin-stations-empty-add-button')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('views and deletes a station through admin UI', async ({ page }) => {
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
    await expectActionButtonsAligned(page, [
      `admin-station-view-${station.id}`,
      `admin-station-delete-${station.id}`,
    ]);

    await page.getByTestId(`admin-station-view-${station.id}`).click();
    await expect(page).toHaveURL(/station_details/);
    await page.goto('/admin/stations');
    await expectVisible(page.getByTestId('admin-stations-page'));
    await page.getByTestId('admin-stations-search-input').fill(station.name);
    await expect(stationCard).toBeVisible({ timeout: 45_000 });

    await page.getByTestId(`admin-station-delete-${station.id}`).click();
    await page.getByTestId('custom-alert-button-delete').click();
    await expectNoDbRecord('stations', 'id', station.id);
  });

  test('manually adds a looping radio station from multiple musician playlists and exposes it to the user side', async ({ page }) => {
    const musician = await seedE2EUser({
      suffix: 'station-manual-owner',
      role: 'musician',
      fullName: 'E2E Station Manual Owner',
    });
    const guestMusician = await seedE2EUser({
      suffix: 'station-manual-guest-owner',
      role: 'musician',
      fullName: 'E2E Station Guest Owner',
    });
    const { playlist, item } = await seedE2EPlaylistWithTrack(musician.id, 'admin-station-manual-playlist-a');
    const { playlist: secondPlaylist, item: secondItem } = await seedE2EPlaylistWithTrack(
      guestMusician.id,
      'admin-station-manual-playlist-b',
      { visibility: 'unlisted' },
    );
    const stationName = `E2E Manual Station ${makeRunId('manual-station')}`;
    const stationDescription = `E2E manual station description ${makeRunId('manual-station')}`;
    const { count: existingStationCount, error: countError } = await getSupabaseAdmin()
      .from('stations')
      .select('id', { count: 'exact', head: true });
    if (countError) throw countError;

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/stations');
    await expectVisible(page.getByTestId('admin-stations-page'));
    if ((existingStationCount || 0) === 0) {
      await expectVisible(page.getByTestId('admin-stations-empty-title'));
      await expect(page.getByTestId('admin-stations-empty-description')).toContainText(
        'Create your first station manually or generate one automatically.',
      );
      await expect(page.getByTestId('admin-stations-search-input')).toHaveCount(0);
      await expect(page.getByTestId('admin-stations-empty-add-button')).not.toHaveAttribute('aria-disabled', 'true');
      await page.getByTestId('admin-stations-empty-add-button').click();
    } else {
      await expect(page.getByTestId('admin-stations-search-input')).toHaveAttribute(
        'placeholder',
        'Search by station name, genre, or location...',
      );
      await expect(page.getByTestId('admin-stations-add-button')).not.toHaveAttribute('aria-disabled', 'true');
      await page.getByTestId('admin-stations-add-button').click();
    }

    await expectVisible(page.getByTestId('admin-station-source-picker-modal'));
    await page.getByTestId(`admin-station-source-profile-${musician.id}`).click();
    await expectVisible(page.getByTestId('admin-station-editor-modal'));
    await page.getByTestId('admin-station-name-input').fill(stationName);
    await page.getByTestId('admin-station-description-input').fill(stationDescription);
    await page.getByTestId('admin-station-genre-input').fill('OPM');
    await page.getByTestId('admin-station-status-live').click();
    await expect(page.getByTestId(`admin-station-playlist-${playlist.id}`)).toBeVisible();
    await expect(page.getByTestId(`admin-station-playlist-${secondPlaylist.id}`)).toBeVisible();
    await page.getByTestId(`admin-station-playlist-${secondPlaylist.id}`).click();
    await page.getByTestId('admin-station-editor-save-button').click();

    const station = await expect
      .poll(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('stations')
          .select('*')
          .eq('managed_profile_id', musician.id)
          .eq('name', stationName)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;
        return data;
      }, { timeout: 45_000 })
      .not.toBeNull()
      .then(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('stations')
          .select('*')
          .eq('managed_profile_id', musician.id)
          .eq('name', stationName)
          .single();
        if (error) throw error;
        return data;
      });

    let slotPlaylistIds: string[] = [];
    await expect
      .poll(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('station_playlist_slots')
          .select('playlist_id, is_active, position')
          .eq('station_id', station.id)
          .order('position', { ascending: true });

        if (error) throw error;
        slotPlaylistIds = (data || [])
          .filter((record) => record.is_active !== false)
          .map((record) => record.playlist_id);
        return (
          slotPlaylistIds.length === 2 &&
          slotPlaylistIds.includes(playlist.id) &&
          slotPlaylistIds.includes(secondPlaylist.id)
        );
      }, { timeout: 30_000 })
      .toBe(true);

    await page.getByTestId('admin-stations-search-input').fill(stationName);
    await expectVisible(page.getByTestId(`admin-station-card-${station.id}`));
    await expect(page.getByTestId(`admin-station-card-${station.id}`)).toContainText('Continuous loop');
    await expect(page.getByTestId(`admin-station-card-${station.id}`)).toContainText(playlist.title);
    await expect(page.getByTestId(`admin-station-card-${station.id}`)).toContainText(secondPlaylist.title);
    await expectVisible(page.getByTestId(`admin-station-edit-${station.id}`));
    await expectActionButtonsAligned(page, [
      `admin-station-view-${station.id}`,
      `admin-station-edit-${station.id}`,
      `admin-station-delete-${station.id}`,
    ]);
    await page.getByTestId(`admin-station-edit-${station.id}`).click();
    await expectVisible(page.getByTestId('admin-station-editor-modal'));
    await page.getByTestId('admin-station-status-offline').click();
    await page.getByTestId('admin-station-editor-save-button').click();
    await expect(page.getByTestId('admin-station-editor-modal')).toHaveCount(0);
    await expectDbRecord<any>('stations', 'id', station.id, (record) => record.is_active === false);
    await expect(page.getByTestId(`admin-station-card-${station.id}`)).toContainText('OFFLINE');

    await page.getByTestId(`admin-station-edit-${station.id}`).click();
    await expectVisible(page.getByTestId('admin-station-editor-modal'));
    await page.getByTestId('admin-station-status-live').click();
    await page.getByTestId('admin-station-editor-save-button').click();
    await expect(page.getByTestId('admin-station-editor-modal')).toHaveCount(0);
    await expectDbRecord<any>('stations', 'id', station.id, (record) => record.is_active === true);

    const anon = getSupabaseAnon();
    const stationDetails = await anon.functions.invoke('manage-playlists', {
      body: { action: 'get_station_details', station_id: station.id },
    });
    if (stationDetails.error) throw stationDetails.error;

    expect(stationDetails.data?.data?.is_active).toBe(true);
    expect(stationDetails.data?.data?.stream_url).toBeNull();
    expect(stationDetails.data?.data?.now_playing_title).toBeNull();
    const liveSlots = stationDetails.data?.data?.live_slots || [];
    expect(liveSlots).toHaveLength(2);
    expect(liveSlots.map((slot: any) => slot.playlist_id)).toEqual(slotPlaylistIds);
    expect(liveSlots.map((slot: any) => slot.playlist_id)).toEqual(expect.arrayContaining([playlist.id, secondPlaylist.id]));
    expect(liveSlots.flatMap((slot: any) => slot.playlist?.items?.map((track: any) => track.id) || [])).toEqual(
      expect.arrayContaining([item.id, secondItem.id]),
    );
    for (const slot of liveSlots) {
      expect(slot.playlist?.items?.[0]?.audio_url).toMatch(/^https:\/\//);
    }

    const userStations = await anon.functions.invoke('manage-playlists', {
      body: { action: 'list_user_stations', user_id: musician.id },
    });
    if (userStations.error) throw userStations.error;

    expect((userStations.data?.data || []).some((row: any) => row.id === station.id && row.live_slot_count === 2)).toBe(true);
  });

  test('auto-creates a live radio station from a musician playlist and exposes it to the user side', async ({ page }) => {
    const musician = await seedE2EUser({
      suffix: 'station-playlist-owner',
      role: 'musician',
      fullName: 'E2E Station Playlist Owner',
    });
    const { playlist, item } = await seedE2EPlaylistWithTrack(musician.id, 'admin-station-playlist');

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await loginAsAdmin(page, adminEmail, adminPassword);
    await page.goto('/admin/stations');
    await expectVisible(page.getByTestId('admin-stations-page'));
    await expect(page.getByTestId('admin-stations-auto-create-button')).not.toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('admin-stations-auto-create-button').click();

    const station = await expect
      .poll(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('stations')
          .select('*')
          .eq('managed_profile_id', musician.id)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;
        return data;
      }, { timeout: 45_000 })
      .not.toBeNull()
      .then(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('stations')
          .select('*')
          .eq('managed_profile_id', musician.id)
          .eq('is_active', true)
          .single();
        if (error) throw error;
        return data;
      });

    await expectDbRecord<any>('station_playlist_slots', 'station_id', station.id, (record) => (
      record.playlist_id === playlist.id &&
      record.is_active !== false
    ));

    const anon = getSupabaseAnon();
    const stationDetails = await anon.functions.invoke('manage-playlists', {
      body: { action: 'get_station_details', station_id: station.id },
    });
    if (stationDetails.error) throw stationDetails.error;

    expect(stationDetails.data?.data?.is_active).toBe(true);
    expect(stationDetails.data?.data?.live_slots?.[0]?.playlist_id).toBe(playlist.id);
    expect(stationDetails.data?.data?.live_slots?.[0]?.playlist?.items?.[0]?.id).toBe(item.id);
    expect(stationDetails.data?.data?.live_slots?.[0]?.playlist?.items?.[0]?.duration_seconds).toBe(30);
    expect(stationDetails.data?.data?.live_slots?.[0]?.playlist?.items?.[0]?.audio_url).toMatch(/^https:\/\//);

    const userStations = await anon.functions.invoke('manage-playlists', {
      body: { action: 'list_user_stations', user_id: musician.id },
    });
    if (userStations.error) throw userStations.error;

    expect((userStations.data?.data || []).some((row: any) => row.id === station.id && row.live_slot_count > 0)).toBe(true);
  });
});
