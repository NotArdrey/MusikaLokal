import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { test, before, after } from 'node:test';
import { chromium } from '@playwright/test';

let browser;
const host = 'https://musika-lokal.vercel.app';
const config = JSON.parse(readFileSync('web/public/recovery/config.js', 'utf8').replace('export const config = ', '').replace(/;\s*$/, ''));
const token = `header.${Buffer.from(JSON.stringify({ sub: 'reset-user', iss: config.url + '/auth/v1',
  exp: Math.floor(Date.now()/1000)+3600, amr: [{ method: 'otp' }], })).toString('base64url')}.signature`;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function fixture({ width = 390, colorScheme = 'light', failVerification = false, failSignOut = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme });
  const calls = [];
  await context.route(host + '/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const file = path === '/recovery' ? 'index.html' : path.replace('/recovery/', '');
    const types = { html: 'text/html', css: 'text/css', js: 'application/javascript' };
    if (!['index.html', 'styles.css', 'config.js', 'flow.js', 'page.js'].includes(file)) return route.fulfill({ status: 404 });
    await route.fulfill({ status: 200, contentType: types[file.split('.').pop()], body: readFileSync('web/public/recovery/' + file) });
  });
  await context.route(config.url + '/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push({ path, method: request.method(), body: request.postDataJSON(), authorization: request.headers().authorization });
    if (path.endsWith('/verify')) return route.fulfill({ status: failVerification ? 403 : 200,
      json: failVerification ? {} : { access_token: token } });
    if (path.endsWith('/logout')) return route.fulfill({ status: failSignOut ? 503 : 204, body: '' });
    if (path.endsWith('/account-email')) return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: { id: 'reset-user', email: 'fixture@musikalokal.test' } });
  });
  const page = await context.newPage();
  return { page, context, calls, async close() { await context.close(); } };
}

test('callback exposes no password form for missing, expired or forged recovery markers', async () => {
  const view = await fixture();
  try {
    for (const suffix of ['', '?type=recovery', '#type=recovery&error_code=otp_expired']) {
      await view.page.goto(host + '/recovery' + suffix);
      await view.page.getByRole('button', { name: 'Request a new link' }).waitFor();
      assert.equal(await view.page.locator('#password-form').isVisible(), false);
      assert.match(await view.page.locator('#status').innerText(), /invalid, expired, or already used/);
    }
    assert.equal(view.calls.length, 0);
  } finally { await view.close(); }
});

test('user chooses app or browser before a hash is consumed, and secrets leave browser history', async () => {
  const view = await fixture();
  try {
    await view.page.goto(host + '/recovery#token_hash=one-time&type=recovery');
    await view.page.getByRole('link', { name: 'Open in app' }).waitFor();
    assert.equal(view.page.url(), host + '/recovery');
    assert.equal(view.calls.length, 0, 'passive page loads cannot consume a reset credential');
    assert.equal(await view.page.getByRole('link', { name: 'Open in app' }).getAttribute('href'), 'musikalokal://password_recovery?type=recovery&token_hash=one-time');
    await view.page.getByRole('button', { name: 'Continue in browser' }).click();
    await view.page.getByLabel('New password', { exact: true }).waitFor();
    assert.equal(view.calls.filter(c => c.path.endsWith('/verify')).length, 1);
    assert.equal(await view.page.locator('#open-app').getAttribute('href'), null);
  } finally { await view.close(); }
});

test('password mismatch is blocked; confirmed reset updates once, signs out and shows login', async () => {
  const view = await fixture();
  try {
    await view.page.goto(host + '/recovery?type=recovery#token_hash=one-time');
    await view.page.getByRole('button', { name: 'Continue in browser' }).click();
    await view.page.getByLabel('New password', { exact: true }).fill('new-password');
    await view.page.getByLabel('Confirm new password').fill('different-password');
    await view.page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await view.page.getByRole('status').filter({ hasText: 'do not match' }).waitFor();
    assert.equal(view.calls.filter(c => c.method === 'PUT').length, 0);
    await view.page.getByLabel('Confirm new password').fill('new-password');
    await view.page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await view.page.getByRole('link', { name: 'Back to login in app' }).waitFor();
    assert.equal(view.calls.filter(c => c.method === 'PUT').length, 1);
    assert.equal(view.calls.filter(c => c.path.endsWith('/logout')).length, 1);
    assert.equal(await view.page.locator('#password-form').isVisible(), false);
    assert.equal(await view.page.locator('#password').inputValue(), '');
    await view.page.reload();
    await view.page.getByRole('button', { name: 'Request a new link' }).waitFor();
  } finally { await view.close(); }
});

test('already-used verification shows the new-link action and never enables a password update', async () => {
  const view = await fixture({ failVerification: true });
  try {
    await view.page.goto(host + '/recovery#token_hash=used&type=recovery');
    await view.page.getByRole('button', { name: 'Continue in browser' }).click();
    await view.page.getByRole('button', { name: 'Request a new link' }).waitFor();
    await view.page.getByLabel('Email address').fill('fixture@musikalokal.test');
    await view.page.getByRole('button', { name: 'Request a new link' }).click();
    await view.page.getByRole('status').filter({ hasText: 'If an account uses that email' }).waitFor();
    assert.equal(view.calls.filter(c => c.method === 'PUT').length, 0);
    assert.equal(view.calls.filter(c => c.path.endsWith('/account-email')).length, 1);
  } finally { await view.close(); }
});

test('a new warm callback replaces a completed or invalid flow in the same browser tab', async () => {
  const view = await fixture();
  try {
    await view.page.goto(host + '/recovery');
    await view.page.getByRole('button', { name: 'Request a new link' }).waitFor();
    await view.page.goto(host + '/recovery#token_hash=first&type=recovery');
    await view.page.getByRole('button', { name: 'Continue in browser' }).click();
    await view.page.getByLabel('New password', { exact: true }).waitFor();
    await view.page.goto(host + '/recovery#token_hash=second&type=recovery');
    await view.page.getByRole('button', { name: 'Continue in browser' }).click();
    await view.page.getByLabel('New password', { exact: true }).waitFor();
    assert.deepEqual(view.calls.filter(c=>c.path.endsWith('/verify')).map(c=>c.body.token_hash), ['first','second']);
    await view.page.goto(host + '/recovery#type=recovery&error_code=otp_expired');
    await view.page.getByRole('button', { name: 'Request a new link' }).waitFor();
    assert.equal(await view.page.locator('#password-form').isVisible(), false);
  } finally { await view.close(); }
});

test('delayed verification from an earlier callback cannot replace the newer form', async () => {
  const view=await fixture();
  let releaseFirst;
  const delayed=new Promise(resolve=>{releaseFirst=resolve;});
  await view.context.route(config.url+'/auth/v1/verify',async route=>{
    if(route.request().postDataJSON().token_hash==='first')await delayed;
    await route.fulfill({json:{access_token:token}});
  });
  try {
    await view.page.goto(host+'/recovery#token_hash=first&type=recovery');
    await view.page.getByRole('button',{name:'Continue in browser'}).click();
    await view.page.getByRole('status').filter({hasText:'Checking your reset link'}).waitFor();
    await view.page.goto(host+'/recovery#type=recovery&error_code=otp_expired');
    await view.page.getByRole('button',{name:'Request a new link'}).waitFor();
    releaseFirst();
    await view.page.waitForResponse(config.url+'/auth/v1/user');
    assert.equal(await view.page.locator('#password-form').isVisible(),false);
    assert.equal(await view.page.locator('#request-form').isVisible(),true);
  } finally {releaseFirst();await view.close();}
});

test('failed sign-out retries only sign-out after the password has already changed', async () => {
  const view = await fixture({ failSignOut: true });
  try {
    await view.page.goto(host + '/recovery#token_hash=one-time&type=recovery');
    await view.page.getByRole('button', { name: 'Continue in browser' }).click();
    await view.page.getByLabel('New password', { exact: true }).fill('new-password');
    await view.page.getByLabel('Confirm new password').fill('new-password');
    await view.page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await view.page.getByRole('status').filter({ hasText: 'sign-out failed' }).waitFor();
    await view.page.getByRole('button', { name: 'Finish signing out' }).click();
    assert.equal(view.calls.filter(c => c.method === 'PUT').length, 1);
  } finally { await view.close(); }
});

test('both themes stay usable at 320px and 1280px with normal and enlarged text', async () => {
  mkdirSync('docs/testing/password-recovery-2026-10-07', { recursive: true });
  for (const colorScheme of ['light', 'dark']) for (const width of [320, 1280]) for (const fontSize of [100, 160]) {
    const view = await fixture({ width, colorScheme });
    try {
      await view.page.goto(host + '/recovery#token_hash=one-time&type=recovery');
      await view.page.getByRole('button', { name: 'Continue in browser' }).click();
      await view.page.getByLabel('New password', { exact: true }).waitFor();
      await view.page.evaluate(size => { document.documentElement.style.fontSize = size + '%'; }, fontSize);
      const metrics = await view.page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert.ok(metrics.content <= metrics.viewport, JSON.stringify({ width, colorScheme, fontSize, ...metrics }));
      if (width === 320 && fontSize === 160) await view.page.screenshot({ path: `docs/testing/password-recovery-2026-10-07/${colorScheme}-320-160.png`, fullPage: true });
    } finally { await view.close(); }
  }
});
