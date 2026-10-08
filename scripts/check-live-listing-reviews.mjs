// Read-only verification of the actual hook and public review query. Uses the
// root-file credentials without printing them or changing any remote records.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const requireMobile = createRequire(new URL('../mobile/package.json', import.meta.url));
const env = requireMobile('dotenv').parse(readFileSync('.env'));
const query = `select jsonb_build_object(
  'profileColumns', (select jsonb_agg(column_name) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('id','full_name','avatar_url','created_at','updated_at')),
  'targets', (select jsonb_agg(row_to_json(t)) from (
    (select 'Studio' as type, studio_id as id, count(*) as total from public.reviews where studio_id is not null group by studio_id order by count(*) desc limit 1)
    union all (select 'Group', group_id, count(*) from public.reviews where group_id is not null group by group_id order by count(*) desc limit 1)
    union all (select 'Artist', user_id, count(*) from public.reviews where user_id is not null group by user_id order by count(*) desc limit 1)
  ) t)
);`;
const metadataResponse = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
});
assert.ok(metadataResponse.ok, `Database inspection returned ${metadataResponse.status}`);
const [{ jsonb_build_object: metadata }] = await metadataResponse.json();
assert.ok(!metadata.profileColumns.includes('updated_at'));
const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const originalQuery = await client.from('reviews').select('*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url, updated_at)').limit(1);
assert.equal(originalQuery.status, 400);
assert.equal(originalQuery.error.code, '42703');

async function runHook(workspace, target) {
  let dispose;
  const state = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { dispose?.(); reject(new Error('Public review read timed out')); }, 25000);
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(`${workspace}/src/hooks/useListingReviews.ts`, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, {
      exports, AbortController, require: name => name === 'react' ? {
        useState: initial => [initial, next => { if (next.key && !next.loading) { clearTimeout(timer); resolve(next); } }],
        useRef: initial => ({ current: initial }), useCallback: fn => fn,
        useEffect: fn => { dispose = fn(); },
      } : { supabase: client },
    });
    exports.useListingReviews(target.type, target.id);
  });
  dispose?.();
  assert.equal(state.error, null, `${workspace} ${target.type}: ${state.error}`);
  assert.equal(state.reviews.length, Math.min(5, Number(target.total)));
  assert.ok(state.reviews.every(row => row.author?.id && typeof row.author.full_name === 'string'));
  return { workspace, listingType: target.type, publicReviewCount: state.reviews.length, expectedCount: Math.min(5, Number(target.total)), authorJoinSucceeded: true };
}
const checks = await Promise.all(['mobile', 'web'].flatMap(workspace => metadata.targets.map(target => runHook(workspace, target))));
const evidence = {
  verifiedAt: new Date().toISOString(), projectRef: env.SUPABASE_PROJECT_REF,
  originalFailure: { status: originalQuery.status, code: originalQuery.error.code, message: originalQuery.error.message },
  profileColumns: metadata.profileColumns, publicHookChecks: checks,
  mutationsPerformed: false, supabaseDeploymentRequiredForReviews: false,
  clientBundleBuilt: false, androidDeviceChecksPending: true,
};
writeFileSync('docs/testing/new-listing-reviews-2026-10-07.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
