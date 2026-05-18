import { test } from '@playwright/test';
import { assertManifestIsExplicit } from '../../manifest/crud-manifest';

test('CRUD manifest marks every non-UI entry explicitly', async () => {
  assertManifestIsExplicit();
});
