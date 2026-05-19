import { expect, test, type Page, type Response as PlaywrightResponse } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectNoDbRecord, expectVisible } from '../../helpers/assertions';
import { assertE2EName, makeRunId } from '../../helpers/env';
import {
  seedE2EAdmin,
  seedE2EGig,
  seedE2EProductionTeam,
  seedE2EStudio,
  seedE2EUser,
} from '../../helpers/seed';
import { getSupabaseAdmin } from '../../helpers/supabase';
import { loginAsAdmin } from '../../helpers/web-auth';

type ResourceType = 'studio' | 'venue' | 'production';

test.describe.configure({ mode: 'serial' });

const normalizeTestPart = (value: string) => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
);

const resourceCardId = (type: ResourceType, id: string) => `admin-manage-card-${type}-${id}`;
const resourceButtonId = (action: 'view' | 'edit' | 'delete', type: ResourceType, id: string) => (
  `admin-manage-${action}-${type}-${id}`
);

async function waitForManageAction(page: Page, action: string, bodyIncludes?: string) {
  return page.waitForResponse(async (response) => {
    if (!response.url().includes('/functions/v1/admin-listings-management')) return false;
    if (response.request().method() !== 'POST') return false;

    const postData = response.request().postData() || '';
    return postData.includes(`"action":"${action}"`) && (!bodyIncludes || postData.includes(bodyIncludes));
  }, { timeout: 45_000 });
}

async function expectSuccessfulAction(response: PlaywrightResponse) {
  expect(response.ok(), `${response.request().postData()} should return 2xx`).toBeTruthy();
  const body = await response.json();
  expect(body.success).toBeTruthy();
  return body;
}

async function expectAuditEvent(input: {
  actorId: string;
  action: 'create' | 'update' | 'delete';
  entityId: string;
  entityTable: 'gigs' | 'production_teams';
}) {
  const client = getSupabaseAdmin();

  await expect
    .poll(async () => {
      const { data, error } = await client
        .from('audit_events')
        .select('id, actor_user_id, actor_role, action, entity_table, entity_id, source')
        .eq('actor_user_id', input.actorId)
        .eq('actor_role', 'admin')
        .eq('action', input.action)
        .eq('entity_table', input.entityTable)
        .eq('entity_id', input.entityId)
        .eq('source', 'admin-listings-management')
        .limit(1);

      if (error) throw error;
      return (data || []).length > 0;
    }, { timeout: 30_000 })
    .toBe(true);
}

test.describe('admin manage listings', () => {
  let adminEmail = '';
  let adminPassword = '';
  let adminId = '';

  test.beforeAll(async () => {
    await cleanupE2ERecords();
    const admin = await seedE2EAdmin();
    adminEmail = admin.email;
    adminPassword = admin.password;
    adminId = admin.id;
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('fetches, views details, creates, edits, deletes, and audits listing resources', async ({ page }) => {
    const client = getSupabaseAdmin();
    const runId = makeRunId('admin-manage-listings');
    const createdProductionName = `E2E Production Created ${runId}`;
    const updatedVenueName = `E2E Gig Updated ${runId}`;
    assertE2EName(createdProductionName);
    assertE2EName(updatedVenueName);

    const studioOwner = await seedE2EUser({
      suffix: 'admin-manage-studio-owner',
      role: 'studio-owner',
      fullName: 'E2E Manage Studio Owner',
    });
    const venueOwner = await seedE2EUser({
      suffix: 'admin-manage-venue-owner',
      role: 'venue-owner',
      fullName: 'E2E Manage Venue Owner',
    });
    const producer = await seedE2EUser({
      suffix: 'admin-manage-producer',
      role: 'producer',
      fullName: 'E2E Manage Producer',
    });

    const studio = await seedE2EStudio(studioOwner.id, 'admin-manage-studio');
    const venue = await seedE2EGig(venueOwner.id, 'admin-manage-venue');
    const production = await seedE2EProductionTeam(producer.id, 'admin-manage-production');

    await client.from('studio_types').upsert(
      { studio_id: studio.id, studio_type: 'Recording' },
      { onConflict: 'studio_id,studio_type' },
    );
    await client.from('studio_amenities').upsert(
      { studio_id: studio.id, amenity: 'Parking' },
      { onConflict: 'studio_id,amenity' },
    );
    await client.from('studio_instruments').upsert(
      { studio_id: studio.id, instrument_name: 'Drums', image_url: 'https://example.com/e2e-drums.png' },
      { onConflict: 'studio_id,instrument_name,image_url' },
    );
    await client.from('studio_media').upsert(
      {
        studio_id: studio.id,
        media_type: 'image',
        media_url: 'https://example.com/e2e-studio.png',
        sort_order: 0,
      },
      { onConflict: 'studio_id,media_type,media_url' },
    );

    await client.from('gig_requirements').upsert([
      { gig_id: venue.id, requirement_key: 'genres', requirement_value: ['OPM', 'Jazz'] },
      { gig_id: venue.id, requirement_key: 'instruments', requirement_value: ['Vocals', 'Guitar'] },
      { gig_id: venue.id, requirement_key: 'event_start_time', requirement_value: '07:00 PM' },
      { gig_id: venue.id, requirement_key: 'event_end_time', requirement_value: '10:00 PM' },
    ], { onConflict: 'gig_id,requirement_key' });
    await client.from('gig_media').upsert([
      {
        gig_id: venue.id,
        media_type: 'image',
        media_url: 'https://example.com/e2e-venue.png',
        sort_order: 0,
      },
      {
        gig_id: venue.id,
        media_type: 'document',
        media_url: 'https://example.com/e2e-contract.pdf',
        sort_order: 1,
      },
    ], { onConflict: 'gig_id,media_type,media_url' });

    await loginAsAdmin(page, adminEmail, adminPassword);
    await expectVisible(page.getByTestId('admin-dashboard-page'));

    const initialFetch = waitForManageAction(page, 'admin_list_resources');
    await page.getByText('Manage', { exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/manage/);
    await expectVisible(page.getByTestId('admin-manage-page'));
    await expectSuccessfulAction(await initialFetch);

    await expectVisible(page.getByTestId(resourceCardId('studio', studio.id)));
    await expectVisible(page.getByTestId(resourceCardId('venue', venue.id)));
    await expectVisible(page.getByTestId(resourceCardId('production', production.id)));

    const refreshFetch = waitForManageAction(page, 'admin_list_resources');
    await page.getByTestId('admin-manage-refresh-button').click();
    await expectSuccessfulAction(await refreshFetch);

    const searchFetch = waitForManageAction(page, 'admin_list_resources', studio.name);
    await page.getByTestId('admin-manage-search-input').fill(studio.name);
    await expectSuccessfulAction(await searchFetch);
    await expectVisible(page.getByTestId(resourceCardId('studio', studio.id)));
    await expect(page.getByTestId(resourceCardId('venue', venue.id))).toHaveCount(0);

    const clearSearchFetch = waitForManageAction(page, 'admin_list_resources');
    await page.getByTestId('admin-manage-search-input').fill('');
    await expectSuccessfulAction(await clearSearchFetch);
    await page.getByTestId('admin-manage-filter-venue').click();
    await expectVisible(page.getByTestId(resourceCardId('venue', venue.id)));
    await expect(page.getByTestId(resourceCardId('studio', studio.id))).toHaveCount(0);
    await page.getByTestId('admin-manage-filter-all').click();

    const studioDetailsFetch = waitForManageAction(page, 'admin_get_resource', studio.id);
    await page.getByTestId(resourceButtonId('view', 'studio', studio.id)).click();
    const studioDetailsBody = await expectSuccessfulAction(await studioDetailsFetch);
    expect(studioDetailsBody.data.id).toBe(studio.id);
    expect(studioDetailsBody.data.amenities).toContain('Parking');
    await expect(page.getByText('Studio Details')).toBeVisible();
    await expect(page.getByText('Parking')).toBeVisible();
    await expect(page.getByText('Drums')).toBeVisible();
    await expectVisible(page.getByTestId('admin-manage-details-edit'));
    await expectVisible(page.getByTestId('admin-manage-details-delete'));
    await page.getByTestId('admin-manage-details-close-footer').click();

    const venueDetailsFetch = waitForManageAction(page, 'admin_get_resource', venue.id);
    await page.getByTestId(resourceButtonId('view', 'venue', venue.id)).click();
    const venueDetailsBody = await expectSuccessfulAction(await venueDetailsFetch);
    expect(venueDetailsBody.data.id).toBe(venue.id);
    expect(venueDetailsBody.data.requirements.genres).toContain('OPM');
    await expect(page.getByText('Event Details')).toBeVisible();
    await expect(page.getByText('OPM, Jazz')).toBeVisible();
    await expect(page.getByText('Vocals, Guitar')).toBeVisible();
    await page.getByTestId('admin-manage-details-close').click();

    const editFetch = waitForManageAction(page, 'admin_get_resource', venue.id);
    await page.getByTestId(resourceButtonId('edit', 'venue', venue.id)).click();
    await expectSuccessfulAction(await editFetch);
    await expectVisible(page.getByTestId('admin-manage-name-input'));
    await expect(page.getByTestId('admin-manage-owner-id')).toHaveValue(venueOwner.id);
    await expect(page.getByTestId('admin-manage-name-input')).toHaveValue(venue.name);

    const updateFetch = waitForManageAction(page, 'admin_update_resource', updatedVenueName);
    await page.getByTestId('admin-manage-name-input').fill(updatedVenueName);
    await page.getByTestId('admin-manage-editor-save').click();
    await expectSuccessfulAction(await updateFetch);
    await expectDbRecord<any>('gigs', 'id', venue.id, (record) => record.name === updatedVenueName);
    await expect(page.getByTestId(resourceCardId('venue', venue.id)).getByText(updatedVenueName)).toBeVisible({ timeout: 45_000 });
    await expectAuditEvent({
      actorId: adminId,
      action: 'update',
      entityTable: 'gigs',
      entityId: venue.id,
    });

    await page.getByTestId('admin-manage-add-production').click();
    await expectVisible(page.getByTestId('admin-manage-owner-search'));

    const ownerOptionsFetch = waitForManageAction(page, 'admin_owner_options', producer.email);
    await page.getByTestId('admin-manage-owner-search').fill(producer.email);
    const ownerOptionsBody = await expectSuccessfulAction(await ownerOptionsFetch);
    expect(ownerOptionsBody.data.some((owner: any) => owner.id === producer.id)).toBeTruthy();
    await page.getByTestId(`admin-manage-owner-${normalizeTestPart(producer.email)}`).click();
    await expect(page.getByTestId('admin-manage-owner-id')).toHaveValue(producer.id);

    const createFetch = waitForManageAction(page, 'admin_create_resource', createdProductionName);
    await page.getByTestId('admin-manage-name-input').fill(createdProductionName);
    await page.getByTestId('admin-manage-editor-save').click();
    const createBody = await expectSuccessfulAction(await createFetch);
    const createdProductionId = createBody.data.id as string;
    await expectDbRecord<any>('production_teams', 'id', createdProductionId, (record) => (
      record.name === createdProductionName &&
      record.owner_id === producer.id
    ));
    await expect(page.getByTestId(resourceCardId('production', createdProductionId))).toBeVisible({ timeout: 45_000 });
    await expectAuditEvent({
      actorId: adminId,
      action: 'create',
      entityTable: 'production_teams',
      entityId: createdProductionId,
    });

    const createdProductionDetailsFetch = waitForManageAction(page, 'admin_get_resource', createdProductionId);
    await page.getByTestId(resourceButtonId('view', 'production', createdProductionId)).click();
    const createdProductionDetailsBody = await expectSuccessfulAction(await createdProductionDetailsFetch);
    expect(createdProductionDetailsBody.data.id).toBe(createdProductionId);
    await expect(page.getByText('Production Details')).toBeVisible();
    await expectVisible(page.getByTestId('admin-manage-details-delete'));
    await expectVisible(page.getByTestId('admin-manage-details-edit'));

    const deleteFetch = waitForManageAction(page, 'admin_delete_resource', createdProductionId);
    await page.getByTestId('admin-manage-details-delete').click();
    await page.getByTestId('custom-alert-button-delete').click();
    await expectSuccessfulAction(await deleteFetch);
    await expectNoDbRecord('production_teams', 'id', createdProductionId);
    await expect(page.getByTestId(resourceCardId('production', createdProductionId))).toHaveCount(0, { timeout: 45_000 });
    await expectAuditEvent({
      actorId: adminId,
      action: 'delete',
      entityTable: 'production_teams',
      entityId: createdProductionId,
    });
  });
});
