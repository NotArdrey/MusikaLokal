const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

for (const [app, file] of [['mobile', 'mobile/app/(tabs)/profile.tsx'], ['web', 'web/app/profile.tsx']]) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'removeMediaFromPortfolio') {
      handler = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert(handler, `${app}: removal handler missing`);
  const compiled = ts.transpileModule(`(${handler})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { cleanupRemovedStorageObjects } = require(`../${app}/src/utils/storageCleanup.ts`);

  for (const failure of ['network', 'api', 'database', 'none']) {
    test(`${app}: portfolio removal handles ${failure} failure without misreporting saved state`, async () => {
      const url = 'https://test.supabase.co/storage/v1/object/public/portfolio/owner/photo.png';
      let profile = { portfolio_urls: [url] };
      let removals = 0;
      let busy = false;
      const alerts = [];
      const db = { error: failure === 'database' ? new Error('Database unavailable') : null, delete() { return this; }, eq() { return this; } };
      const context = {
        currentUserId: 'owner', isOwner: true,
        supabaseUrl: 'https://test.supabase.co',
        supabase: {
          from: () => db,
          storage: { from: () => ({ remove: async () => {
            removals++;
            if (failure === 'network') throw new Error('Network unavailable');
            return failure === 'api' ? { data: null, error: { message: 'Storage unavailable' } } : { data: [{}], error: null };
          } }) },
        },
        cleanupRemovedStorageObjects,
        uploadingRef: { current: false },
        setUploading: (value) => { busy = value; },
        setUploadMessage: () => {}, logProfileMedia: () => {}, fetchProfile: () => {},
        setProfile: (update) => { profile = update(profile); },
        showAlert: (...args) => alerts.push(args),
      };
      await vm.runInNewContext(compiled, context)(url);
      assert.equal(busy, false);
      assert.equal(context.uploadingRef.current, false);
      if (failure === 'database') {
        assert.equal(removals, 0, 'Failed database removal must keep the stored file');
        assert.equal(profile.portfolio_urls.length, 1);
        assert.equal(alerts[0][1], 'Remove Failed');
      } else {
        assert.equal(removals, 1);
        assert.equal(profile.portfolio_urls.length, 0, 'Saved removal must update the UI even if cleanup fails');
        assert.equal(alerts[0][0], 'success');
        assert.equal(alerts[0][1], 'Removed');
      }
    });
  }
}
