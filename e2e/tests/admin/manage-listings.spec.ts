import { expect, test, type Locator, type Page, type Response as PlaywrightResponse } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord, expectNoDbRecord, expectVisible } from '../../helpers/assertions';
import { assertE2EName, makeRunId } from '../../helpers/env';
import {
  seedE2EAdmin,
  seedE2EGigApplication,
  seedE2EGig,
  seedE2EProductionConnectionRequest,
  seedE2EProductionTeam,
  seedE2EStudio,
  seedE2EStudioBooking,
  seedE2EUser,
} from '../../helpers/seed';
import { getSupabaseAdmin } from '../../helpers/supabase';
import { loginAsAdmin } from '../../helpers/web-auth';

type ResourceType = 'studio' | 'venue' | 'production';
type RelatedActivityKind = 'booking_request' | 'gig_application' | 'studio_booking';

test.describe.configure({ mode: 'serial' });

const normalizeTestPart = (value: string) => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
);

const resourceCardId = (type: ResourceType, id: string) => `admin-manage-card-${type}-${id}`;
const resourceButtonId = (action: 'view' | 'edit' | 'delete', type: ResourceType, id: string) => (
  `admin-manage-${action}-${type}-${id}`
);
const relatedCardId = (kind: RelatedActivityKind, id: string) => (
  `admin-manage-related-card-${kind}-${id}`
);
const relatedActionId = (
  action: string,
  kind: RelatedActivityKind,
  id: string,
) => `admin-manage-related-action-${action}-${kind}-${id}`;

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

async function expectActionEnabled(locator: Locator) {
  await expect(locator).not.toHaveAttribute('aria-disabled', 'true', { timeout: 45_000 });
}

async function expectAuditEvent(input: {
  actorId: string;
  action: string;
  entityId: string;
  entityTable: 'booking_requests' | 'gig_applications' | 'gigs' | 'production_teams' | 'studio_bookings';
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

async function performRelatedAction(input: {
  page: Page;
  action: string;
  kind: RelatedActivityKind;
  activityId: string;
  parentResourceId: string;
  confirmButtonTestId: string;
}) {
  const actionFetch = waitForManageAction(input.page, 'admin_update_related_activity', input.activityId);
  const detailRefresh = waitForManageAction(input.page, 'admin_get_resource', input.parentResourceId);
  const listRefresh = waitForManageAction(input.page, 'admin_list_resources');
  const actionButton = input.page.getByTestId(relatedActionId(input.action, input.kind, input.activityId));

  await expectActionEnabled(actionButton);
  await actionButton.click();
  await input.page.getByTestId(input.confirmButtonTestId).click();
  await expectSuccessfulAction(await actionFetch);
  await expectSuccessfulAction(await detailRefresh);
  await expectSuccessfulAction(await listRefresh);
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
    test.setTimeout(240_000);

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
    const musician = await seedE2EUser({
      suffix: 'admin-manage-musician',
      role: 'musician',
      fullName: 'E2E Manage Musician',
    });
    const [
      declineApplicant,
      completeApplicant,
      fireApplicant,
      cancelApplicant,
      leaderApproveApplicant,
      leaderRejectApplicant,
      productionAcceptParticipant,
    ] = await Promise.all([
      seedE2EUser({ suffix: 'admin-manage-decline-applicant', role: 'musician', fullName: 'E2E Decline Applicant' }),
      seedE2EUser({ suffix: 'admin-manage-complete-applicant', role: 'musician', fullName: 'E2E Complete Applicant' }),
      seedE2EUser({ suffix: 'admin-manage-fire-applicant', role: 'musician', fullName: 'E2E Fire Applicant' }),
      seedE2EUser({ suffix: 'admin-manage-cancel-applicant', role: 'musician', fullName: 'E2E Cancel Applicant' }),
      seedE2EUser({ suffix: 'admin-manage-leader-approve-applicant', role: 'musician', fullName: 'E2E Leader Approve Applicant' }),
      seedE2EUser({ suffix: 'admin-manage-leader-reject-applicant', role: 'musician', fullName: 'E2E Leader Reject Applicant' }),
      seedE2EUser({ suffix: 'admin-manage-production-accept-participant', role: 'musician', fullName: 'E2E Production Accept Participant' }),
    ]);

    const studio = await seedE2EStudio(studioOwner.id, 'admin-manage-studio');
    const venue = await seedE2EGig(venueOwner.id, 'admin-manage-venue');
    const production = await seedE2EProductionTeam(producer.id, 'admin-manage-production');
    const cardDeleteProduction = await seedE2EProductionTeam(producer.id, 'admin-manage-card-delete-production');
    const studioBooking = await seedE2EStudioBooking({
      userId: musician.id,
      studioId: studio.id,
      suffix: 'admin-manage-studio-booking',
      status: 'pending',
      paymentStatus: 'unpaid',
      notes: 'E2E pending studio booking for admin Manage',
    });
    const studioBookingToCancel = await seedE2EStudioBooking({
      userId: musician.id,
      studioId: studio.id,
      suffix: 'admin-manage-studio-booking-cancel',
      status: 'pending',
      paymentStatus: 'unpaid',
      bookingDate: '2026-06-11',
      startTime: '09:00',
      endTime: '11:00',
      notes: 'E2E cancellable studio booking for admin Manage',
    });
    const studioBookingToComplete = await seedE2EStudioBooking({
      userId: musician.id,
      studioId: studio.id,
      suffix: 'admin-manage-studio-booking-complete',
      status: 'confirmed',
      paymentStatus: 'paid',
      bookingDate: '2026-06-12',
      startTime: '09:00',
      endTime: '11:00',
      notes: 'E2E completable studio booking for admin Manage',
    });
    const historicalStudioBooking = await seedE2EStudioBooking({
      userId: musician.id,
      studioId: studio.id,
      suffix: 'admin-manage-studio-booking-history',
      status: 'completed',
      paymentStatus: 'paid',
      bookingDate: '2026-01-15',
      startTime: '13:00',
      endTime: '15:00',
      notes: 'E2E completed studio booking history for admin Manage',
    });
    const gigApplication = await seedE2EGigApplication({
      applicantId: musician.id,
      gigId: venue.id,
      suffix: 'admin-manage-gig-application',
      status: 'pending',
    });
    const gigApplicationToDecline = await seedE2EGigApplication({
      applicantId: declineApplicant.id,
      gigId: venue.id,
      suffix: 'admin-manage-gig-application-decline',
      status: 'pending',
    });
    const gigApplicationToComplete = await seedE2EGigApplication({
      applicantId: completeApplicant.id,
      gigId: venue.id,
      suffix: 'admin-manage-gig-application-complete',
      status: 'accepted',
    });
    const gigApplicationToFire = await seedE2EGigApplication({
      applicantId: fireApplicant.id,
      gigId: venue.id,
      suffix: 'admin-manage-gig-application-fire',
      status: 'accepted',
    });
    const gigApplicationToCancel = await seedE2EGigApplication({
      applicantId: cancelApplicant.id,
      gigId: venue.id,
      suffix: 'admin-manage-gig-application-cancel',
      status: 'accepted',
    });
    const leaderApplicationToApprove = await seedE2EGigApplication({
      applicantId: leaderApproveApplicant.id,
      gigId: venue.id,
      suffix: 'admin-manage-gig-application-leader-approve',
      status: 'pending',
      leaderApprovalStatus: 'pending',
    });
    const leaderApplicationToReject = await seedE2EGigApplication({
      applicantId: leaderRejectApplicant.id,
      gigId: venue.id,
      suffix: 'admin-manage-gig-application-leader-reject',
      status: 'pending',
      leaderApprovalStatus: 'pending',
    });
    const productionRequest = await seedE2EProductionConnectionRequest({
      productionTeamId: production.id,
      productionTeamName: production.name,
      producerId: producer.id,
      producerName: producer.fullName || 'E2E Manage Producer',
      participantId: musician.id,
      participantName: musician.fullName || 'E2E Manage Musician',
      participantType: 'musician',
      direction: 'application',
      suffix: 'admin-manage-production-application',
    });
    const productionRequestToAccept = await seedE2EProductionConnectionRequest({
      productionTeamId: production.id,
      productionTeamName: production.name,
      producerId: producer.id,
      producerName: producer.fullName || 'E2E Manage Producer',
      participantId: productionAcceptParticipant.id,
      participantName: productionAcceptParticipant.fullName || 'E2E Production Accept Participant',
      participantType: 'musician',
      direction: 'application',
      suffix: 'admin-manage-production-application-accept',
    });

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
    await expectVisible(page.getByTestId(resourceCardId('production', cardDeleteProduction.id)));

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
    await page.getByTestId('admin-manage-filter-studio').click();
    await expectVisible(page.getByTestId(resourceCardId('studio', studio.id)));
    await expect(page.getByTestId(resourceCardId('venue', venue.id))).toHaveCount(0);
    await page.getByTestId('admin-manage-filter-venue').click();
    await expectVisible(page.getByTestId(resourceCardId('venue', venue.id)));
    await expect(page.getByTestId(resourceCardId('studio', studio.id))).toHaveCount(0);
    await page.getByTestId('admin-manage-filter-production').click();
    await expectVisible(page.getByTestId(resourceCardId('production', production.id)));
    await expect(page.getByTestId(resourceCardId('venue', venue.id))).toHaveCount(0);
    await page.getByTestId('admin-manage-filter-all').click();

    await page.getByTestId('admin-manage-add-studio').click();
    await expectVisible(page.getByTestId('admin-manage-owner-search'));
    await page.getByTestId('admin-manage-editor-close').click();
    await expect(page.getByTestId('admin-manage-owner-search')).toHaveCount(0);

    await page.getByTestId('admin-manage-add-venue').click();
    await expectVisible(page.getByTestId('admin-manage-owner-search'));
    await page.getByTestId('admin-manage-editor-cancel').click();
    await expect(page.getByTestId('admin-manage-owner-search')).toHaveCount(0);

    const studioEditFetch = waitForManageAction(page, 'admin_get_resource', studio.id);
    await page.getByTestId(resourceButtonId('edit', 'studio', studio.id)).click();
    await expectSuccessfulAction(await studioEditFetch);
    await expect(page.getByTestId('admin-manage-name-input')).toHaveValue(studio.name);
    await page.getByTestId('admin-manage-editor-close').click();
    await expect(page.getByTestId('admin-manage-name-input')).toHaveCount(0);

    const productionEditFetch = waitForManageAction(page, 'admin_get_resource', production.id);
    await page.getByTestId(resourceButtonId('edit', 'production', production.id)).click();
    await expectSuccessfulAction(await productionEditFetch);
    await expect(page.getByTestId('admin-manage-name-input')).toHaveValue(production.name);
    await expectVisible(page.getByTestId('admin-manage-editor-logo-preview-1'));
    await page.getByTestId('admin-manage-editor-cancel').click();
    await expect(page.getByTestId('admin-manage-name-input')).toHaveCount(0);

    const studioDetailsFetch = waitForManageAction(page, 'admin_get_resource', studio.id);
    await page.getByTestId(resourceButtonId('view', 'studio', studio.id)).click();
    const studioDetailsBody = await expectSuccessfulAction(await studioDetailsFetch);
    expect(studioDetailsBody.data.id).toBe(studio.id);
    expect(studioDetailsBody.data.amenities).toContain('Parking');
    expect(studioDetailsBody.data.related_activity.some((item: any) => item.id === studioBooking.id)).toBeTruthy();
    expect(studioDetailsBody.data.related_activity.some((item: any) => item.id === studioBookingToCancel.id)).toBeTruthy();
    expect(studioDetailsBody.data.related_activity.some((item: any) => item.id === studioBookingToComplete.id)).toBeTruthy();
    expect(studioDetailsBody.data.related_activity.some((item: any) => item.id === historicalStudioBooking.id)).toBeTruthy();
    await expect(page.getByText('Studio Details')).toBeVisible();
    await expect(page.getByText('Parking')).toBeVisible();
    await expect(page.getByText('Drums')).toBeVisible();
    await expectVisible(page.getByTestId('admin-manage-image-gallery'));
    await expectVisible(page.getByTestId('admin-manage-image-preview-1'));
    await expect(page.getByTestId('admin-manage-image-url-1')).toHaveCount(0);
    await expectVisible(page.getByTestId('admin-manage-related-section'));
    await expectVisible(page.getByTestId(relatedCardId('studio_booking', studioBooking.id)));
    await expectVisible(page.getByTestId(relatedCardId('studio_booking', studioBookingToCancel.id)));
    await expectVisible(page.getByTestId(relatedCardId('studio_booking', studioBookingToComplete.id)));
    await expectVisible(page.getByTestId(relatedCardId('studio_booking', historicalStudioBooking.id)));
    await expect(page.getByText('E2E completed studio booking history for admin Manage')).toBeVisible();
    await performRelatedAction({
      page,
      action: 'confirm',
      kind: 'studio_booking',
      activityId: studioBooking.id,
      parentResourceId: studio.id,
      confirmButtonTestId: 'custom-alert-button-confirm',
    });
    await expectDbRecord<any>('studio_bookings', 'id', studioBooking.id, (record) => record.status === 'confirmed');
    await expectAuditEvent({
      actorId: adminId,
      action: 'confirmed',
      entityTable: 'studio_bookings',
      entityId: studioBooking.id,
    });
    await performRelatedAction({
      page,
      action: 'cancel',
      kind: 'studio_booking',
      activityId: studioBookingToCancel.id,
      parentResourceId: studio.id,
      confirmButtonTestId: 'custom-alert-button-cancel-booking',
    });
    await expectDbRecord<any>('studio_bookings', 'id', studioBookingToCancel.id, (record) => record.status === 'cancelled');
    await expectAuditEvent({
      actorId: adminId,
      action: 'cancelled',
      entityTable: 'studio_bookings',
      entityId: studioBookingToCancel.id,
    });
    await performRelatedAction({
      page,
      action: 'complete',
      kind: 'studio_booking',
      activityId: studioBookingToComplete.id,
      parentResourceId: studio.id,
      confirmButtonTestId: 'custom-alert-button-complete',
    });
    await expectDbRecord<any>('studio_bookings', 'id', studioBookingToComplete.id, (record) => record.status === 'completed');
    await expectAuditEvent({
      actorId: adminId,
      action: 'completed',
      entityTable: 'studio_bookings',
      entityId: studioBookingToComplete.id,
    });
    await expectVisible(page.getByTestId('admin-manage-details-edit'));
    await expectVisible(page.getByTestId('admin-manage-details-delete'));
    await expectActionEnabled(page.getByTestId('admin-manage-details-close-footer'));
    await page.getByTestId('admin-manage-details-close-footer').click();
    await expect(page.getByTestId(relatedCardId('studio_booking', studioBooking.id))).toHaveCount(0);

    const venueDetailsFetch = waitForManageAction(page, 'admin_get_resource', venue.id);
    await page.getByTestId(resourceButtonId('view', 'venue', venue.id)).click();
    const venueDetailsBody = await expectSuccessfulAction(await venueDetailsFetch);
    expect(venueDetailsBody.data.id).toBe(venue.id);
    expect(venueDetailsBody.data.requirements.genres).toContain('OPM');
    expect(venueDetailsBody.data.related_activity.some((item: any) => item.id === gigApplication.id)).toBeTruthy();
    expect(venueDetailsBody.data.related_activity.some((item: any) => item.id === gigApplicationToDecline.id)).toBeTruthy();
    expect(venueDetailsBody.data.related_activity.some((item: any) => item.id === gigApplicationToComplete.id)).toBeTruthy();
    expect(venueDetailsBody.data.related_activity.some((item: any) => item.id === gigApplicationToFire.id)).toBeTruthy();
    expect(venueDetailsBody.data.related_activity.some((item: any) => item.id === gigApplicationToCancel.id)).toBeTruthy();
    expect(venueDetailsBody.data.related_activity.some((item: any) => item.id === leaderApplicationToApprove.id)).toBeTruthy();
    expect(venueDetailsBody.data.related_activity.some((item: any) => item.id === leaderApplicationToReject.id)).toBeTruthy();
    await expect(page.getByText('Event Details')).toBeVisible();
    await expect(page.getByText('OPM, Jazz')).toBeVisible();
    await expect(page.getByText('Vocals, Guitar')).toBeVisible();
    await expectVisible(page.getByTestId(relatedCardId('gig_application', gigApplication.id)));
    await performRelatedAction({
      page,
      action: 'accept',
      kind: 'gig_application',
      activityId: gigApplication.id,
      parentResourceId: venue.id,
      confirmButtonTestId: 'custom-alert-button-accept',
    });
    await expectDbRecord<any>('gig_applications', 'id', gigApplication.id, (record) => record.status === 'accepted');
    await expectAuditEvent({
      actorId: adminId,
      action: 'accepted',
      entityTable: 'gig_applications',
      entityId: gigApplication.id,
    });
    await performRelatedAction({
      page,
      action: 'decline',
      kind: 'gig_application',
      activityId: gigApplicationToDecline.id,
      parentResourceId: venue.id,
      confirmButtonTestId: 'custom-alert-button-decline',
    });
    await expectDbRecord<any>('gig_applications', 'id', gigApplicationToDecline.id, (record) => record.status === 'rejected');
    await expectAuditEvent({
      actorId: adminId,
      action: 'rejected',
      entityTable: 'gig_applications',
      entityId: gigApplicationToDecline.id,
    });
    await performRelatedAction({
      page,
      action: 'complete',
      kind: 'gig_application',
      activityId: gigApplicationToComplete.id,
      parentResourceId: venue.id,
      confirmButtonTestId: 'custom-alert-button-complete',
    });
    await expectDbRecord<any>('gig_applications', 'id', gigApplicationToComplete.id, (record) => record.status === 'completed');
    await expectAuditEvent({
      actorId: adminId,
      action: 'completed',
      entityTable: 'gig_applications',
      entityId: gigApplicationToComplete.id,
    });
    await performRelatedAction({
      page,
      action: 'fire',
      kind: 'gig_application',
      activityId: gigApplicationToFire.id,
      parentResourceId: venue.id,
      confirmButtonTestId: 'custom-alert-button-fire',
    });
    await expectDbRecord<any>('gig_applications', 'id', gigApplicationToFire.id, (record) => record.status === 'fired');
    await expectAuditEvent({
      actorId: adminId,
      action: 'fired',
      entityTable: 'gig_applications',
      entityId: gigApplicationToFire.id,
    });
    await performRelatedAction({
      page,
      action: 'cancel',
      kind: 'gig_application',
      activityId: gigApplicationToCancel.id,
      parentResourceId: venue.id,
      confirmButtonTestId: 'custom-alert-button-cancel-application',
    });
    await expectDbRecord<any>('gig_applications', 'id', gigApplicationToCancel.id, (record) => record.status === 'cancelled');
    await expectAuditEvent({
      actorId: adminId,
      action: 'cancelled',
      entityTable: 'gig_applications',
      entityId: gigApplicationToCancel.id,
    });
    await performRelatedAction({
      page,
      action: 'approve_leader',
      kind: 'gig_application',
      activityId: leaderApplicationToApprove.id,
      parentResourceId: venue.id,
      confirmButtonTestId: 'custom-alert-button-approve',
    });
    await expectDbRecord<any>('gig_applications', 'id', leaderApplicationToApprove.id, (
      record,
    ) => record.leader_approval_status === 'approved');
    await expectAuditEvent({
      actorId: adminId,
      action: 'update',
      entityTable: 'gig_applications',
      entityId: leaderApplicationToApprove.id,
    });
    await performRelatedAction({
      page,
      action: 'reject_leader',
      kind: 'gig_application',
      activityId: leaderApplicationToReject.id,
      parentResourceId: venue.id,
      confirmButtonTestId: 'custom-alert-button-reject',
    });
    await expectDbRecord<any>('gig_applications', 'id', leaderApplicationToReject.id, (
      record,
    ) => record.leader_approval_status === 'rejected');
    await expectAuditEvent({
      actorId: adminId,
      action: 'update',
      entityTable: 'gig_applications',
      entityId: leaderApplicationToReject.id,
    });
    await expectActionEnabled(page.getByTestId('admin-manage-details-close'));
    await page.getByTestId('admin-manage-details-close').click();
    await expect(page.getByTestId(relatedCardId('gig_application', gigApplication.id))).toHaveCount(0);

    const productionDetailsFetch = waitForManageAction(page, 'admin_get_resource', production.id);
    await page.getByTestId(resourceButtonId('view', 'production', production.id)).click();
    const productionDetailsBody = await expectSuccessfulAction(await productionDetailsFetch);
    expect(productionDetailsBody.data.id).toBe(production.id);
    expect(productionDetailsBody.data.related_activity.some((item: any) => item.id === productionRequest.id)).toBeTruthy();
    expect(productionDetailsBody.data.related_activity.some((item: any) => item.id === productionRequestToAccept.id)).toBeTruthy();
    await expect(page.getByText('Production Details')).toBeVisible();
    await expectVisible(page.getByTestId('admin-manage-image-gallery'));
    await expect(page.getByTestId('admin-manage-image-url-1')).toHaveCount(0);
    await expectVisible(page.getByTestId(relatedCardId('booking_request', productionRequest.id)));
    await expectVisible(page.getByTestId(relatedCardId('booking_request', productionRequestToAccept.id)));
    await performRelatedAction({
      page,
      action: 'decline',
      kind: 'booking_request',
      activityId: productionRequest.id,
      parentResourceId: production.id,
      confirmButtonTestId: 'custom-alert-button-decline',
    });
    await expectDbRecord<any>('booking_requests', 'id', productionRequest.id, (record) => record.status === 'declined');
    await expectAuditEvent({
      actorId: adminId,
      action: 'declined',
      entityTable: 'booking_requests',
      entityId: productionRequest.id,
    });
    await performRelatedAction({
      page,
      action: 'accept',
      kind: 'booking_request',
      activityId: productionRequestToAccept.id,
      parentResourceId: production.id,
      confirmButtonTestId: 'custom-alert-button-accept',
    });
    await expectDbRecord<any>('booking_requests', 'id', productionRequestToAccept.id, (record) => record.status === 'accepted');
    await expectAuditEvent({
      actorId: adminId,
      action: 'accepted',
      entityTable: 'booking_requests',
      entityId: productionRequestToAccept.id,
    });
    await expectActionEnabled(page.getByTestId('admin-manage-details-close'));
    await page.getByTestId('admin-manage-details-close').click();
    await expect(page.getByTestId(relatedCardId('booking_request', productionRequest.id))).toHaveCount(0);

    const editFetch = waitForManageAction(page, 'admin_get_resource', venue.id);
    await page.getByTestId(resourceButtonId('edit', 'venue', venue.id)).click();
    await expectSuccessfulAction(await editFetch);
    await expectVisible(page.getByTestId('admin-manage-name-input'));
    await expect(page.getByTestId('admin-manage-owner-id')).toHaveValue(venueOwner.id);
    await expect(page.getByTestId('admin-manage-name-input')).toHaveValue(venue.name);
    await expectVisible(page.getByTestId('admin-manage-event-date-button'));
    await page.getByTestId('admin-manage-event-date-button').click();
    await expectVisible(page.getByTestId('admin-manage-event-calendar'));
    await page.getByTestId('admin-manage-event-date-button').click();
    await expect(page.getByTestId('admin-manage-event-calendar')).toHaveCount(0);
    await expectVisible(page.getByTestId('admin-manage-event-start-time'));
    await expectVisible(page.getByTestId('admin-manage-event-start-period'));
    await expectVisible(page.getByTestId('admin-manage-event-end-time'));
    await expectVisible(page.getByTestId('admin-manage-event-end-period'));
    await expectVisible(page.getByTestId('admin-manage-editor-image-preview-1'));
    await expect(page.getByTestId('admin-manage-editor-image-preview-url-1')).toHaveCount(0);

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

    const createdProductionDetailsEditFetch = waitForManageAction(page, 'admin_get_resource', createdProductionId);
    await page.getByTestId('admin-manage-details-edit').click();
    await expectSuccessfulAction(await createdProductionDetailsEditFetch);
    await expect(page.getByTestId('admin-manage-name-input')).toHaveValue(createdProductionName);
    await page.getByTestId('admin-manage-editor-close').click();
    await expect(page.getByTestId('admin-manage-name-input')).toHaveCount(0);

    const createdProductionDetailsReopenFetch = waitForManageAction(page, 'admin_get_resource', createdProductionId);
    await page.getByTestId(resourceButtonId('view', 'production', createdProductionId)).click();
    await expectSuccessfulAction(await createdProductionDetailsReopenFetch);
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

    const directDeleteFetch = waitForManageAction(page, 'admin_delete_resource', cardDeleteProduction.id);
    await page.getByTestId(resourceButtonId('delete', 'production', cardDeleteProduction.id)).click();
    await page.getByTestId('custom-alert-button-delete').click();
    await expectSuccessfulAction(await directDeleteFetch);
    await expectNoDbRecord('production_teams', 'id', cardDeleteProduction.id);
    await expect(page.getByTestId(resourceCardId('production', cardDeleteProduction.id))).toHaveCount(0, { timeout: 45_000 });
    await expectAuditEvent({
      actorId: adminId,
      action: 'delete',
      entityTable: 'production_teams',
      entityId: cardDeleteProduction.id,
    });
  });
});
