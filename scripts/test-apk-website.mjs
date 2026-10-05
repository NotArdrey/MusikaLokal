import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dist = fileURLToPath(new URL('../web/dist/', import.meta.url)).replace(/[\\/]$/, '');
const output = fileURLToPath(new URL('../output/android-testing/', import.meta.url));
const contentTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };

test('exported website supports public downloads, themes and protected admin routes', { timeout: 120000 }, async () => {
  await stat(resolve(dist, 'index.html'));
  await mkdir(output, { recursive: true });
  const hosting = JSON.parse(await readFile(new URL('../web/vercel.json', import.meta.url), 'utf8'));
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const redirect = hosting.redirects.find((entry) => entry.source === pathname);
      if (redirect) {
        response.writeHead(redirect.permanent ? 308 : 307, { Location: redirect.destination }).end();
        return;
      }
      let file = resolve(dist, `.${pathname}`);
      if (!file.startsWith(`${dist}${sep}`) && file !== dist) { response.writeHead(403).end(); return; }
      try { if (!(await stat(file)).isFile()) file = resolve(dist, 'index.html'); }
      catch { file = resolve(dist, 'index.html'); }
      response.setHeader('Content-Type', contentTypes[extname(file)] || 'application/octet-stream');
      createReadStream(file).pipe(response);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const screenshot = async (options) => {
    const logo = page.getByRole('img', { name: 'MusikaLokal', exact: true });
    await logo.waitFor();
    await logo.evaluate((image) => image.decode());
    await page.screenshot(options);
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/android-release.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(baseUrl);
    await page.getByRole('heading', { name: /Find your sound/ }).waitFor();
    for (const path of [
      '/feed?postId=9d28c58a-7f1e-4fcb-8091-b8f1b65f79cc',
      '/feed?listingId=123&listingType=production_team', '/home?listingId=123&listingType=studio',
      '/group_details?id=123', '/profile?userId=123', '/production_team?teamId=123',
      '/product_details?product_id=123', '/playlist_details?playlist_id=123',
    ]) {
      await page.goto(baseUrl + path);
      await page.getByRole('heading', { name: /Find your sound/ }).waitFor();
      await page.waitForURL((url) => url.pathname === '/');
    }
    const associationResponse = await page.request.get(baseUrl + '/.well-known/assetlinks.json');
    assert.equal(associationResponse.status(), 200);
    assert.match(associationResponse.headers()['content-type'], /application\/json/);
    assert.equal((await associationResponse.json())[0].target.package_name, 'com.anonymous.musikalokal');
    assert.equal(await page.locator('.download-header a[href="/admin/login"]').count(), 0);
    assert.equal(await page.locator('.download-footer a').count(), 0);
    assert.equal(await page.getByText('ANDROID APP', { exact: true }).count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /\b(testing|build|development|standalone|Expo|Metro|administrator|admin portal)\b/i);
    await page.getByRole('button', { name: 'Download unavailable' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download unavailable' }).isDisabled(), true);
    await page.evaluate(() => document.fonts.ready);
    await screenshot({ path: resolve(output, 'homepage-desktop-light.png'), fullPage: true });
    await page.getByText('How to install', { exact: true }).click();
    await page.getByRole('heading', { name: 'Allow this installation' }).scrollIntoViewIfNeeded();
    const permissionStep = page.locator('.installation-step').filter({ hasText: 'Allow this installation' });
    assert.equal(await permissionStep.locator('p').isVisible(), false);
    await permissionStep.locator('summary').click();
    assert.equal(await permissionStep.locator('p').isVisible(), true);
    await permissionStep.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await permissionStep.locator('p').isVisible(), false);
    await page.keyboard.press('Enter');
    await screenshot({ path: resolve(output, 'installation-desktop-light.png') });
    await page.locator('#hero-title').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.locator('.download-site.dark').waitFor();
    await screenshot({ path: resolve(output, 'homepage-desktop-dark.png'), fullPage: true });
    await page.reload();
    await page.locator('.download-site.dark').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot({ path: resolve(output, 'homepage-mobile-dark.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout must not overflow horizontally');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await screenshot({ path: resolve(output, 'homepage-mobile-light.png'), fullPage: true });

    const release = {
      downloadUrl: 'https://test.public.blob.vercel-storage.com/android/testing/musikalokal-testing.apk?download=1',
      packageId: 'com.anonymous.musikalokal', versionName: '1.0.0', versionCode: 1,
      sizeBytes: 32 * 1024 * 1024, sha256: 'a'.repeat(64), certificateSha256: 'b'.repeat(64),
      minSdk: 24, builtAt: '2026-10-05T00:00:00Z', testing: true,
    };
    await page.unroute('**/android-release.json');
    await page.route('**/android-release.json', (route) => route.fulfill({ json: release }));
    await page.reload();
    await page.getByRole('link', { name: 'Download Android APK' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Download Android APK' }).getAttribute('href'), release.downloadUrl);
    assert.match(await page.getByRole('status').innerText(), /1\.0\.0.*32\.0 MB.*Android 7\.0\+/);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('.download-actions').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${width}px layout must not overflow`);
      const action = await page.getByRole('link', { name: 'Download Android APK' }).boundingBox();
      assert.ok(action.height >= 44 && action.x >= 0 && action.x + action.width <= width, 'primary action must fit and provide a touch target');
      await page.locator('#installation').scrollIntoViewIfNeeded();
      if (width <= 760) {
        await page.getByRole('button', { name: 'Download app', exact: true }).waitFor();
        const quickAction = await page.getByRole('button', { name: 'Download app', exact: true }).boundingBox();
        assert.ok(quickAction.height >= 44 && quickAction.y + quickAction.height <= 844, 'quick download stays in the mobile viewport');
      } else {
        assert.equal(await page.getByRole('button', { name: 'Download app', exact: true }).isVisible(), false);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.download-actions').scrollIntoViewIfNeeded();
    await screenshot({ path: resolve(output, 'responsive-download-light.png'), fullPage: true });

    // Retry a truncated range and verify the complete file before saving it.
    const apkBytes = Buffer.alloc(2 * 1024 * 1024 + 97);
    for (let i = 0; i < apkBytes.length; i++) apkBytes[i] = i % 251;
    const apkChecksum = createHash('sha256').update(apkBytes).digest('hex');
    let downloadRelease = { ...release, sizeBytes: apkBytes.length, sha256: apkChecksum };
    let requests = 0;
    let truncateOnce = true;
    let delayTransfer = false;
    await page.unroute('**/android-release.json');
    await page.route('**/android-release.json', (route) => route.fulfill({ json: downloadRelease }));
    await page.route(release.downloadUrl, async (route) => {
      requests++;
      const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range);
      assert.ok(range, 'APK requests must use bounded byte ranges');
      const start = Number(range[1]);
      const end = Number(range[2]);
      let body = apkBytes.subarray(start, end + 1);
      if (truncateOnce && start === 0) { body = body.subarray(0, 100); truncateOnce = false; }
      if (delayTransfer) await new Promise((ready) => setTimeout(ready, 500));
      await route.fulfill({ status: 206, headers: {
        'content-type': 'application/vnd.android.package-archive',
        'content-range': `bytes ${start}-${end}/${apkBytes.length}`,
        'access-control-allow-origin': '*',
      }, body });
    });
    await page.reload();
    let savedDownloads = 0;
    page.on('download', () => savedDownloads++);
    const transfer = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download Android APK' }).click();
    const downloaded = await transfer;
    assert.equal(downloaded.suggestedFilename(), 'MusikaLokal.apk');
    const downloadedPath = resolve(output, 'download-retry-fixture.apk');
    await downloaded.saveAs(downloadedPath);
    assert.equal(createHash('sha256').update(await readFile(downloadedPath)).digest('hex'), apkChecksum);
    assert.equal(requests, 10, 'one incomplete range must be retried');
    await page.getByText('Download ready. Open MusikaLokal.apk from your browser downloads to install.', { exact: true }).waitFor();

    downloadRelease = { ...downloadRelease, sha256: 'a'.repeat(64) };
    await page.reload();
    await page.getByRole('link', { name: 'Download Android APK' }).click();
    await page.getByText('The download did not finish. Please try again.', { exact: true }).waitFor();
    assert.equal(savedDownloads, 1, 'a checksum mismatch must never save an APK');

    downloadRelease = { ...downloadRelease, sha256: apkChecksum };
    delayTransfer = true;
    await page.reload();
    await page.locator('#installation').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Download app', exact: true }).click();
    await page.getByRole('progressbar', { name: 'Quick download progress', exact: true }).waitFor();
    await screenshot({ path: resolve(output, 'responsive-download-progress.png') });
    await page.getByRole('button', { name: 'Cancel download', exact: true }).click();
    await page.getByText('Download canceled.', { exact: true }).waitFor();
    assert.equal(savedDownloads, 1, 'a canceled download must never save an APK');
    await page.getByRole('link', { name: 'Download Android APK' }).waitFor();
    await page.unrouteAll({ behavior: 'wait' });

    for (const [device, userAgent, message] of [
      ['android', 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36', 'Keep this page open until your download is ready.'],
      ['ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'This app is for Android. Open this page on your Android phone to install.'],
    ]) {
      const deviceContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent, reducedMotion: 'reduce' });
      try {
        const devicePage = await deviceContext.newPage();
        await devicePage.route('**/android-release.json', (route) => route.fulfill({ json: release }));
        await devicePage.goto(baseUrl);
        await devicePage.getByText(message, { exact: true }).waitFor();
        await devicePage.getByRole('link', { name: 'Download Android APK' }).waitFor();
        assert.equal(await devicePage.evaluate(() => window.innerWidth), 390, 'mobile viewport must use device width');
        assert.equal(await devicePage.getByText('ANDROID APP', { exact: true }).count(), 0);
        assert.equal(await devicePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const logo = devicePage.getByRole('img', { name: 'MusikaLokal', exact: true });
        await logo.evaluate((image) => image.decode());
        await devicePage.screenshot({ path: resolve(output, `responsive-${device}-light.png`), fullPage: true });
        await devicePage.getByRole('button', { name: 'Switch to dark theme' }).click();
        await logo.evaluate((image) => image.decode());
        await devicePage.evaluate(async () => {
          await document.fonts.ready;
          await new Promise((ready) => requestAnimationFrame(() => requestAnimationFrame(ready)));
        });
        assert.equal(await devicePage.getByRole('link', { name: 'Download Android APK' }).evaluate((link) => getComputedStyle(link).color), 'rgb(255, 255, 255)');
        await devicePage.screenshot({ path: resolve(output, `responsive-${device}-dark.png`), fullPage: true });
        await devicePage.locator('#installation').scrollIntoViewIfNeeded();
        await devicePage.getByRole('button', { name: 'Download app', exact: true }).waitFor();
      } finally { await deviceContext.close(); }
    }

    await page.unroute('**/android-release.json');
    await page.route('**/android-release.json', (route) => route.fulfill({ json: { ...release, downloadUrl: 'javascript:alert(1)' } }));
    await page.reload();
    await page.getByRole('button', { name: 'Download unavailable' }).waitFor();

    await page.goto(`${baseUrl}/download`);
    await page.waitForURL(`${baseUrl}/`);
    await page.goto(`${baseUrl}/admin/users`);
    await page.waitForURL(`${baseUrl}/admin/login`);
    await page.getByText('Welcome back', { exact: true }).waitFor();
    await screenshot({ path: resolve(output, 'admin-login-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('link', { name: 'Back to APK download' }).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole('link', { name: 'Back to APK download' }).isVisible(), true);
    await page.getByRole('link', { name: 'Back to APK download' }).click();
    await page.getByRole('heading', { name: /Find your sound/ }).waitFor();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.goto(`${baseUrl}/admin/login`);
    await page.getByText('Welcome back', { exact: true }).waitFor();
    await screenshot({ path: resolve(output, 'admin-login-mobile-dark.png') });

    // These fixtures exercise routing/session behavior without changing live data.
    await page.setViewportSize({ width: 1440, height: 1100 });
    let role = 'admin';
    let signOuts = 0;
    const userId = '00000000-0000-4000-8000-000000000001';
    const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
    const session = () => ({ access_token: jwt, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user: { id: userId, email: 'admin@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { role }, user_metadata: {}, created_at: '2026-10-05T00:00:00Z' } });
    await page.route('**/*.supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/auth/v1/logout') { signOuts++; await route.fulfill({ status: 204 }); return; }
      if (url.pathname === '/auth/v1/token') { await route.fulfill({ json: session() }); return; }
      if (url.pathname === '/auth/v1/user') { await route.fulfill({ json: session().user }); return; }
      if (url.pathname === '/rest/v1/profiles') { await route.fulfill({ json: [{ id: userId, role, is_banned: false }] }); return; }
      if (url.pathname.startsWith('/rest/v1/')) { await route.fulfill({ json: [] }); return; }
      await route.fulfill({ json: {} });
    });
    await page.routeWebSocket('**/*.supabase.co/**', (socket) => socket.close());
    await page.goto(`${baseUrl}/admin/login`);
    await screenshot({ path: resolve(output, 'admin-login-desktop-dark.png') });
    await page.getByLabel('Admin email', { exact: true }).fill('admin@example.test');
    assert.equal(await page.getByLabel('Admin email', { exact: true }).evaluate((input) => getComputedStyle(input).outlineStyle), 'solid');
    await page.getByLabel('Admin password', { exact: true }).fill('test-password');
    await page.getByTestId('admin-login-button').click();
    await page.waitForURL(`${baseUrl}/admin`);
    await page.getByTestId('admin-dashboard-page').waitFor();
    const sidebarLogo = page.getByRole('img', { name: 'MusikaLokal', exact: true });
    await sidebarLogo.waitFor({ state: 'attached' });
    await sidebarLogo.evaluate((image) => image.decode());
    await screenshot({ path: resolve(output, 'admin-dashboard-desktop-dark.png') });
    const darkLogoUrl = await sidebarLogo.getAttribute('src');
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).waitFor();
    assert.notEqual(await sidebarLogo.getAttribute('src'), darkLogoUrl);
    await sidebarLogo.evaluate((image) => image.decode());
    await screenshot({ path: resolve(output, 'admin-dashboard-desktop-light.png') });
    await page.getByText('Users', { exact: true }).click();
    await page.waitForURL(`${baseUrl}/admin/users`);
    await page.reload();
    await page.getByLabel('Log out', { exact: true }).waitFor();
    await page.getByLabel('Log out', { exact: true }).click();
    await page.waitForURL(`${baseUrl}/admin/login`);
    assert.ok(signOuts > 0, 'admin logout must revoke the session');

    role = 'musician';
    await page.getByLabel('Admin email', { exact: true }).fill('member@example.test');
    await page.getByLabel('Admin password', { exact: true }).fill('test-password');
    await page.getByTestId('admin-login-button').click();
    await page.getByText('This portal is restricted to administrator accounts.', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/admin/login');

    const authKey = await page.evaluate(() => Object.keys(localStorage).find((key) => /^sb-.*-auth-token$/.test(key)));
    // The key can be removed by rejection; recover it from the mocked API hostname.
    const configuration = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).find((url) => url.includes('.supabase.co/auth/')));
    const sessionKey = authKey || `sb-${new URL(configuration).hostname.split('.')[0]}-auth-token`;
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: sessionKey, value: { ...session(), expires_at: Math.floor(Date.now() / 1000) + 3600 } });
    const beforePublic = signOuts;
    await page.goto(baseUrl);
    await page.getByRole('heading', { name: /Find your sound/ }).waitFor();
    assert.equal(await page.locator('.download-footer a').count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /\b(testing|build|development|standalone|Expo|Metro|administrator|admin portal)\b/i);
    assert.equal(signOuts, beforePublic, 'public homepage must not sign out a non-admin session');
    assert.ok(await page.evaluate((key) => localStorage.getItem(key), sessionKey), 'public homepage preserves stored session');
    await page.goto(`${baseUrl}/admin/users`);
    await page.waitForURL(`${baseUrl}/admin/login`);
    await page.getByText('Welcome back', { exact: true }).waitFor();
    assert.deepEqual(errors, [], 'exported app must not throw browser runtime errors');
  } catch (error) {
    console.error('Browser runtime errors:', errors);
    console.error('Visible page:', (await page.locator('body').innerText()).slice(0, 1500));
    await page.screenshot({ path: resolve(output, 'website-test-failure.png'), fullPage: true });
    throw error;
  } finally {
    await browser.close();
    await new Promise((closed) => server.close(closed));
  }
});
