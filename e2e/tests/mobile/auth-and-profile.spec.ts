import { test } from '@playwright/test';
import { cleanupE2ERecords } from '../../helpers/cleanup';
import { requireAndroidApp, runMaestroFlow } from '../../helpers/maestro';
import { seedE2EMobileUser } from '../../helpers/seed';
import { expectDbRecord } from '../../helpers/assertions';

test.describe.configure({ mode: 'serial' });

test.describe('mobile CRUD harness', () => {
  test.beforeAll(async () => {
    await cleanupE2ERecords();
    await requireAndroidApp();
  });

  test.afterAll(async () => {
    await cleanupE2ERecords();
  });

  test('logs in through visible mobile UI and verifies the seeded profile', async () => {
    const mobileUser = await seedE2EMobileUser('mobile-login');

    await runMaestroFlow('mobile-login.yaml', {
      E2E_MOBILE_EMAIL: mobileUser.email,
      E2E_MOBILE_PASSWORD: mobileUser.password,
    });

    await expectDbRecord<any>('profiles', 'email', mobileUser.email, (record) => (
      record.full_name === mobileUser.fullName &&
      record.is_verified === true
    ));
  });
});
