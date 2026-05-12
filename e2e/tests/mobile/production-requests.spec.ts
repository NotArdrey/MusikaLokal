import { test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { expectDbRecord } from '../../helpers/assertions';
import { requireAndroidApp, runMaestroFlow } from '../../helpers/maestro';
import {
  seedE2EGroup,
  seedE2EProductionConnectionRequest,
  seedE2EProductionTeam,
  seedE2EUser,
} from '../../helpers/seed';

test.describe.configure({ mode: 'serial' });

test.describe('mobile production applications and invites', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('accepts a musician application to a production team from Activity', async () => {
    const producer = await seedE2EUser({
      suffix: 'mobile-production-musician-apply-owner',
      role: 'producer',
      fullName: 'E2E Mobile Production Musician Apply Owner',
    });
    const musician = await seedE2EUser({
      suffix: 'mobile-production-musician-apply',
      role: 'musician',
      fullName: 'E2E Mobile Production Musician Apply',
    });
    const team = await seedE2EProductionTeam(producer.id, 'mobile-production-musician-apply');
    const request = await seedE2EProductionConnectionRequest({
      productionTeamId: team.id,
      productionTeamName: team.name,
      producerId: producer.id,
      producerName: producer.fullName,
      participantId: musician.id,
      participantName: musician.fullName,
      participantType: 'musician',
      direction: 'application',
      suffix: 'mobile-production-musician-apply',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: producer.email,
      E2E_MOBILE_PASSWORD: producer.password,
    });
    await runMaestroFlow('mobile-production-request-accept.yaml', {
      E2E_PRODUCTION_REQUEST_CARD_ID: `mobile-bookings-booking-request-card-${request.id}`,
      E2E_PRODUCTION_REQUEST_ACCEPT_ID: `mobile-bookings-booking-request-accept-${request.id}`,
    });

    await expectDbRecord<any>('booking_requests', 'id', request.id, (record) => record.status === 'accepted');
    await expectDbRecord<any>('production_team_roster', 'profile_id', musician.id, (record) => (
      record.team_id === team.id &&
      record.entity_kind === 'musician'
    ));
    await expectDbRecord<any>('production_team_members', 'user_id', musician.id, (record) => (
      record.team_id === team.id &&
      record.role === 'member'
    ));
  });

  test('accepts a group application to a production team from Activity', async () => {
    const producer = await seedE2EUser({
      suffix: 'mobile-production-group-apply-owner',
      role: 'producer',
      fullName: 'E2E Mobile Production Group Apply Owner',
    });
    const groupOwner = await seedE2EUser({
      suffix: 'mobile-production-group-apply',
      role: 'musician',
      fullName: 'E2E Mobile Production Group Apply',
    });
    const team = await seedE2EProductionTeam(producer.id, 'mobile-production-group-apply');
    const group = await seedE2EGroup(groupOwner.id, 'mobile-production-group-apply');
    const request = await seedE2EProductionConnectionRequest({
      productionTeamId: team.id,
      productionTeamName: team.name,
      producerId: producer.id,
      producerName: producer.fullName,
      participantId: groupOwner.id,
      participantName: group.name,
      participantType: 'group',
      groupId: group.id,
      direction: 'application',
      suffix: 'mobile-production-group-apply',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: producer.email,
      E2E_MOBILE_PASSWORD: producer.password,
    });
    await runMaestroFlow('mobile-production-request-accept.yaml', {
      E2E_PRODUCTION_REQUEST_CARD_ID: `mobile-bookings-booking-request-card-${request.id}`,
      E2E_PRODUCTION_REQUEST_ACCEPT_ID: `mobile-bookings-booking-request-accept-${request.id}`,
    });

    await expectDbRecord<any>('booking_requests', 'id', request.id, (record) => record.status === 'accepted');
    await expectDbRecord<any>('production_team_roster', 'group_id', group.id, (record) => (
      record.team_id === team.id &&
      record.entity_kind === 'group'
    ));
    await expectDbRecord<any>('production_team_members', 'user_id', groupOwner.id, (record) => (
      record.team_id === team.id &&
      record.role === 'member'
    ));
  });

  test('accepts a production team invite as a musician from Activity', async () => {
    const producer = await seedE2EUser({
      suffix: 'mobile-production-musician-invite-owner',
      role: 'producer',
      fullName: 'E2E Mobile Production Musician Invite Owner',
    });
    const musician = await seedE2EUser({
      suffix: 'mobile-production-musician-invite',
      role: 'musician',
      fullName: 'E2E Mobile Production Musician Invite',
    });
    const team = await seedE2EProductionTeam(producer.id, 'mobile-production-musician-invite');
    const request = await seedE2EProductionConnectionRequest({
      productionTeamId: team.id,
      productionTeamName: team.name,
      producerId: producer.id,
      producerName: producer.fullName,
      participantId: musician.id,
      participantName: musician.fullName,
      participantType: 'musician',
      direction: 'invite',
      suffix: 'mobile-production-musician-invite',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: musician.email,
      E2E_MOBILE_PASSWORD: musician.password,
    });
    await runMaestroFlow('mobile-production-request-accept.yaml', {
      E2E_PRODUCTION_REQUEST_CARD_ID: `mobile-bookings-booking-request-card-${request.id}`,
      E2E_PRODUCTION_REQUEST_ACCEPT_ID: `mobile-bookings-booking-request-accept-${request.id}`,
    });

    await expectDbRecord<any>('booking_requests', 'id', request.id, (record) => record.status === 'accepted');
    await expectDbRecord<any>('production_team_roster', 'profile_id', musician.id, (record) => (
      record.team_id === team.id &&
      record.entity_kind === 'musician'
    ));
    await expectDbRecord<any>('production_team_members', 'user_id', musician.id, (record) => (
      record.team_id === team.id &&
      record.role === 'member'
    ));
  });

  test('accepts a production team invite as a group owner from Activity', async () => {
    const producer = await seedE2EUser({
      suffix: 'mobile-production-group-invite-owner',
      role: 'producer',
      fullName: 'E2E Mobile Production Group Invite Owner',
    });
    const groupOwner = await seedE2EUser({
      suffix: 'mobile-production-group-invite',
      role: 'musician',
      fullName: 'E2E Mobile Production Group Invite',
    });
    const team = await seedE2EProductionTeam(producer.id, 'mobile-production-group-invite');
    const group = await seedE2EGroup(groupOwner.id, 'mobile-production-group-invite');
    const request = await seedE2EProductionConnectionRequest({
      productionTeamId: team.id,
      productionTeamName: team.name,
      producerId: producer.id,
      producerName: producer.fullName,
      participantId: groupOwner.id,
      participantName: group.name,
      participantType: 'group',
      groupId: group.id,
      direction: 'invite',
      suffix: 'mobile-production-group-invite',
    });

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: groupOwner.email,
      E2E_MOBILE_PASSWORD: groupOwner.password,
    });
    await runMaestroFlow('mobile-production-request-accept.yaml', {
      E2E_PRODUCTION_REQUEST_CARD_ID: `mobile-bookings-booking-request-card-${request.id}`,
      E2E_PRODUCTION_REQUEST_ACCEPT_ID: `mobile-bookings-booking-request-accept-${request.id}`,
    });

    await expectDbRecord<any>('booking_requests', 'id', request.id, (record) => record.status === 'accepted');
    await expectDbRecord<any>('production_team_roster', 'group_id', group.id, (record) => (
      record.team_id === team.id &&
      record.entity_kind === 'group'
    ));
    await expectDbRecord<any>('production_team_members', 'user_id', groupOwner.id, (record) => (
      record.team_id === team.id &&
      record.role === 'member'
    ));
  });
});
