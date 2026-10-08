const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const map = JSON.parse(fs.readFileSync('mobile/android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map', 'utf8'));
for (const file of ['src/context/RadioPlayerContext.tsx', 'src/data/queryClient.ts', 'src/hooks/usePushNotifications.ts', 'src/components/ApplicantDetailsModal.tsx']) {
  const index = map.sources.findIndex(source => source.replaceAll('\\', '/').endsWith('/' + file));
  assert.ok(index >= 0, file);
  assert.equal(map.sourcesContent[index], fs.readFileSync(path.join('mobile', file), 'utf8'), file);
  console.log('Embedded source matches: ' + file);
}
