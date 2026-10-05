import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as shareLinks from '../mobile/src/utils/shareLinks.ts';
const { buildListingShareUrl, buildPostShareUrl, getShareDestination } = shareLinks;

const postId = '9d28c58a-7f1e-4fcb-8091-b8f1b65f79cc';

test('the reported post URL keeps the exact post destination', () => {
  const url = `https://musikalokal.app/feed?postId=${postId}`;
  assert.equal(buildPostShareUrl(postId), url);
  assert.equal(getShareDestination(url), `/feed?postId=${postId}`);
});

test('all shared content types round-trip with encoded IDs', () => {
  for (const [input, expected] of [
    ['Artist', 'profile'], ['Musician', 'profile'], ['Profile', 'profile'],
    ['Group', 'group'], ['Duo', 'group'], ['Studio', 'studio'], ['Venue', 'venue'],
    ['Gig', 'gig'], ['Production', 'production_team'], ['Production Team', 'production_team'],
    ['Production-Team', 'production_team'], ['Product', 'product'], ['Playlist', 'playlist'], ['Music', 'playlist'],
  ]) {
    const url = buildListingShareUrl('id /?&=日本', input);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('listingId'), 'id /?&=日本');
    assert.equal(parsed.searchParams.get('listingType'), expected);
    assert.equal(getShareDestination(url), parsed.pathname + parsed.search);
  }
});

test('old custom-scheme and website shares reach the same content', () => {
  for (const prefix of ['musikalokal://', 'musikalokal:///', 'https://musikalokal.app/', 'http://musikalokal.app/']) {
    for (const [path, destination] of [
      [`feed?postId=${postId}`, `/feed?postId=${postId}`],
      ['home?listingId=123&listingType=studio', '/feed?listingId=123&listingType=studio'],
      ['group_details?id=123', '/feed?listingId=123&listingType=group'],
      ['profile?userId=123', '/feed?listingId=123&listingType=profile'],
      ['production_team?teamId=123', '/feed?listingId=123&listingType=production_team'],
      ['product_details?product_id=123', '/feed?listingId=123&listingType=product'],
      ['playlist_details?playlist_id=123', '/feed?listingId=123&listingType=playlist'],
    ]) assert.equal(getShareDestination(prefix + path), destination);
  }
  assert.equal(getShareDestination('/feed?listingId=123&listingType=production_team'), '/feed?listingId=123&listingType=production_team');
});

test('unrelated links, malformed URLs and unsafe destinations are not treated as shares', () => {
  for (const path of [
    'https://evil.example/feed?postId=123', '//evil.example/feed?postId=123',
    'https://musikalokal.app.evil.example/feed?postId=123',
    'https://user:pass@musikalokal.app/feed?postId=123',
    'https://musikalokal.app:8443/feed?postId=123', 'https://[invalid',
    'javascript:alert(1)', '/feed?postId=', '/feed?postId=%20',
    '/feed?listingId=123&listingType=admin', '/feed?listingType=group',
    'musikalokal://payment-result?booking_id=123&status=success',
    'musikalokal://change_password?type=recovery', 'musikalokal://?verified=true',
    'musikalokal://e2e-login?email=test', '/admin', '',
  ]) assert.equal(getShareDestination(path), null, path);
});

test('cold and warm native links save the destination before routing through the auth gate', async () => {
  const source = await readFile(new URL('../mobile/app/+native-intent.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const saved = new Map();
  let rejectStorage = false;
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === '../src/utils/shareLinks') return shareLinks;
      if (name === '@react-native-async-storage/async-storage') return { default: {
        async setItem(key, value) {
          if (rejectStorage) throw new Error('Storage unavailable');
          saved.set(key, value);
        },
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  for (const initial of [true, false]) {
    for (const id of [postId, 'second-post']) {
      const result = await exports.redirectSystemPath({ path: buildPostShareUrl(id), initial });
      assert.equal(saved.get(shareLinks.PENDING_SHARE_STORAGE_KEY), `/feed?postId=${id}`);
      const entry = new URL(result, 'https://musikalokal.app');
      assert.equal(entry.pathname, '/shared');
      assert.equal(getShareDestination(entry.searchParams.get('destination')), `/feed?postId=${id}`);
    }
  }
  const payment = 'musikalokal://payment-result?status=success';
  assert.equal(await exports.redirectSystemPath({ path: payment, initial: false }), payment);
  rejectStorage = true;
  assert.match(await exports.redirectSystemPath({ path: buildPostShareUrl(postId), initial: true }), /^\/shared\?/);
});

test('Android association uses the published APK certificate and all share paths have a landing fallback', async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  const mobile = await readJson('../mobile/app.json');
  const vercel = await readJson('../web/vercel.json');
  const release = await readJson('../web/public/android-release.json');
  const association = await readJson('../web/public/.well-known/assetlinks.json');
  const filter = mobile.expo.android.intentFilters.find((entry) => entry.autoVerify && entry.data.some((data) => data.host));
  assert.ok(filter);
  assert.ok(filter.data.some((entry) => entry.scheme === 'https'));
  assert.ok(filter.data.some((entry) => entry.scheme === 'http'));
  const target = association[0].target;
  assert.equal(target.package_name, mobile.expo.android.package);
  assert.equal(target.package_name, release.packageId);
  assert.equal(target.sha256_cert_fingerprints[0].replaceAll(':', '').toLowerCase(), release.certificateSha256);
  assert.ok(association[0].relation.includes('delegate_permission/common.handle_all_urls'));
  for (const entry of filter.data.filter((data) => data.host)) {
    assert.equal(entry.host, 'musikalokal.app');
    assert.ok(vercel.redirects.some((redirect) => redirect.source === entry.path && redirect.destination === '/'));
  }
});
