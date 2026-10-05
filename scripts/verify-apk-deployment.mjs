import assert from 'node:assert/strict';
import { appendFileSync, createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { parseAndroidRelease } from '../web/src/utils/androidRelease.ts';

const baseUrl = new URL(process.argv[2] || 'https://musika-lokal.vercel.app').origin;
const output = fileURLToPath(new URL('../output/android-testing/', import.meta.url));
await mkdir(output, { recursive: true });
const http1 = process.env.APK_VERIFY_HTTP1 === '1';
const browser = await chromium.launch({ args: http1 ? ['--disable-http2'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
context.setDefaultTimeout(120000);
context.setDefaultNavigationTimeout(120000);
try {
  // Optional Netscape cookie jar from authenticated `vercel curl` for previews.
  if (process.argv[3]) {
    const cookies = (await readFile(process.argv[3], 'utf8')).split(/\r?\n/)
      .filter((line) => line.startsWith('#HttpOnly_') || (line && !line.startsWith('#')))
      .map((line) => {
        const [domain, , path, secure, expires, name, value] = line.replace(/^#HttpOnly_/, '').split('\t');
        return { domain, path, secure: secure === 'TRUE', expires: Number(expires) || -1, name, value, httpOnly: line.startsWith('#HttpOnly_') };
      });
    await context.addCookies(cookies);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name: /Find your sound/ }).waitFor();
  assert.equal(await page.locator('.download-header a[href="/admin/login"]').count(), 0);
  assert.equal(await page.locator('.download-footer a').count(), 0);
  assert.equal(await page.getByText('ANDROID APP', { exact: true }).count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /\b(testing|build|development|standalone|Expo|Metro|administrator|admin portal)\b/i);
  const manifestResponse = await context.request.get(`${baseUrl}/android-release.json`);
  assert.equal(manifestResponse.status(), 200);
  assert.match(manifestResponse.headers()['content-type'], /application\/json/);
  const release = parseAndroidRelease(await manifestResponse.json());
  assert.ok(release, 'deployed release metadata must be valid');
  const previousBytes = process.env.APK_VERIFY_REUSE_REPORT
    ? await readFile(process.env.APK_VERIFY_REUSE_REPORT) : null;
  const previousCheck = previousBytes ? JSON.parse(
    previousBytes[0] === 0xff && previousBytes[1] === 0xfe
      ? previousBytes.subarray(2).toString('utf16le')
      : previousBytes.toString('utf8').replace(/^\uFEFF/, ''),
  ) : null;
  if (previousCheck) {
    assert.equal(previousCheck.browserChecks, 'passed');
    assert.equal(previousCheck.downloadUrl, release.downloadUrl);
    assert.equal(previousCheck.sha256, release.sha256);
    assert.equal(previousCheck.sizeBytes, release.sizeBytes);
  }
  const link = page.getByRole('link', { name: 'Download Android APK' });
  await link.waitFor();
  assert.equal(await link.getAttribute('href'), release.downloadUrl);
  await page.evaluate(() => document.fonts.ready);
  const waitForLogos = () => page.waitForFunction(() => {
    const logos = [...document.querySelectorAll('.brand img, .logo-card img')];
    return logos.length >= 2 && logos.every((logo) => logo.complete && logo.naturalWidth > 0);
  }, {}, { timeout: 60000 });
  const logoUrls = {};
  const checkLogoAsset = async (theme) => {
    const src = await page.locator('.brand img').getAttribute('src');
    logoUrls[theme] = src;
    const response = await context.request.get(new URL(src, baseUrl).href);
    assert.equal(response.status(), 200);
    const filename = theme === 'dark' ? 'musika-lokal-logo-modern-wordmark-dark.png' : 'musika-lokal-logo-modern-wordmark.png';
    const local = await readFile(fileURLToPath(new URL(`../web/assets/images/${filename}`, import.meta.url)));
    assert.equal(createHash('sha256').update(await response.body()).digest('hex'), createHash('sha256').update(local).digest('hex'), `${theme} logo must match the branch's asset`);
  };
  await waitForLogos();
  await checkLogoAsset('light');
  await page.screenshot({ path: resolve(output, 'deployed-desktop-light.png') });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await waitForLogos();
  await checkLogoAsset('dark');
  await page.screenshot({ path: resolve(output, 'deployed-desktop-dark.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((ready) => requestAnimationFrame(() => requestAnimationFrame(ready)));
  });
  await page.screenshot({ path: resolve(output, 'deployed-mobile-dark.png') });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await waitForLogos();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((ready) => requestAnimationFrame(() => requestAnimationFrame(ready)));
  });
  await page.screenshot({ path: resolve(output, 'deployed-mobile-light.png') });
  await page.locator('#installation').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Download app', exact: true }).waitFor();
  const quickAction = await page.getByRole('button', { name: 'Download app', exact: true }).boundingBox();
  assert.ok(quickAction.height >= 44 && quickAction.y + quickAction.height <= 844);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const permissionStep = page.locator('.installation-step').filter({ hasText: 'Allow this installation' });
  await permissionStep.locator('summary').click();
  assert.equal(await permissionStep.locator('p').isVisible(), true);
  await page.screenshot({ path: resolve(output, 'deployed-mobile-installation.png') });
  await page.locator('.download-actions').scrollIntoViewIfNeeded();
  const artifact = resolve(output, 'deployed-musikalokal-testing.apk');
  if (!previousCheck) {
    const downloadReady = page.waitForEvent('download', { timeout: 1200000 });
    const downloadRejected = page.getByText('The download did not finish. Please try again.', { exact: true })
      .waitFor({ timeout: 1200000 }).then(() => { throw new Error('The website rejected an incomplete or mismatched APK transfer'); });
    let ranges = 0;
    page.on('response', (response) => {
      if (response.url() === release.downloadUrl && response.status() === 206 && ++ranges % 10 === 0 && process.env.APK_VERIFY_PROGRESS_LOG) {
        appendFileSync(process.env.APK_VERIFY_PROGRESS_LOG, `APK range responses received: ${ranges}\n`);
      }
    });
    await link.click();
    const download = await Promise.race([downloadReady, downloadRejected]);
    assert.equal(download.suggestedFilename(), 'MusikaLokal.apk');
    await download.saveAs(artifact);
    assert.equal(await download.failure(), null);
  }
  assert.equal((await stat(artifact)).size, release.sizeBytes);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  assert.equal(hash.digest('hex'), release.sha256, 'downloaded APK must match local build metadata');
  await page.goto(`${baseUrl}/download`);
  await page.waitForURL(`${baseUrl}/`);
  await page.goto(`${baseUrl}/admin/users`);
  await page.waitForURL(`${baseUrl}/admin/login`);
  await page.getByText('Welcome back', { exact: true }).waitFor();
  const adminLogo = page.getByRole('img', { name: 'MusikaLokal', exact: true });
  await adminLogo.waitFor();
  await adminLogo.evaluate((logo) => logo.decode());
  assert.equal(await adminLogo.getAttribute('src'), logoUrls.light, 'admin login must use the same light asset');
  await page.reload();
  await page.getByText('Welcome back', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ website: baseUrl, downloadUrl: release.downloadUrl, sha256: release.sha256, sizeBytes: release.sizeBytes, browserTransport: http1 ? 'HTTP/1.1' : 'browser default', downloadVerifiedAt: previousCheck?.downloadVerifiedAt || previousCheck?.website || baseUrl, downloadTransport: previousCheck?.downloadTransport || previousCheck?.browserTransport || (http1 ? 'HTTP/1.1' : 'browser default'), browserChecks: 'passed' }, null, 2));
} catch (error) {
  const page = context.pages()[0];
  if (page) {
    console.error('Visible page:', (await page.locator('body').innerText()).slice(0, 1500));
    await page.screenshot({ path: resolve(output, 'deployed-verification-failure.png'), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
}
