import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { chromium } from '@playwright/test';
import * as links from '../mobile/supabase/functions/_shared/emailChangeLinks.ts';
import * as actions from '../mobile/src/utils/actionLinks.ts';

const read = file => readFileSync(file, 'utf8');
const compile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

test('email-change credentials stay in the fragment and cannot be saved as ordinary app destinations', () => {
  const link = links.buildEmailChangeUrl('fixture_hash');
  assert.equal(new URL(link).search, '');
  assert.equal(links.parseEmailChangeUrl(link), 'fixture_hash');
  assert.equal(actions.getActionDestination(link), null);
  for (const raw of [link.replace('email_change', 'recovery'), link + '&type=email_change',
    link + '&token_hash=another', link.replace('#', '?'), link.replace('https:', 'http:'),
    link.replace('musika-lokal.vercel.app', 'attacker.test'), link + '&redirect_to=//attacker.test',
    links.EMAIL_CHANGE_GATEWAY_URL, link.replace('fixture_hash', ''), link.replace('fixture_hash', 'bad%0Ahash')]) {
    assert.equal(links.parseEmailChangeUrl(raw), null, raw);
  }
});

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: both email-change notices use HTTPS hashes and reject client redirect overrides`, async () => {
    const exports = {}, delivered = [], generated = [], queued = [];
    let sent = true;
    const admin = {
      auth: { admin: { generateLink: async input => {
        generated.push(input);
        return { data: { properties: { hashed_token: 'incorrect_old_email_hash',
          action_link: `https://fixture.supabase.co/auth/v1/verify?token=${input.type}_correct_hash&type=email_change` } } };
      } } },
      from: table => ({ insert: async payload => { assert.equal(table, 'email_notifications'); queued.push(payload); return {}; } }),
    };
    const authClient = { auth: { getUser: async () => ({ data: { user: { email: 'current@fixture.test' } } }) } };
    const imports = {
      'https://deno.land/std@0.168.0/http/server.ts': { serve() {} },
      'https://esm.sh/@supabase/supabase-js@2': { createClient: () => authClient },
      '../_shared/emailChangeLinks.ts': links,
      '../_shared/gmailEmail.ts': { sendEmailWithGmail: async payload => { delivered.push(payload); return { sent, provider: 'gmail_http' }; } },
    };
    vm.runInNewContext(compile(read(`${workspace}/supabase/functions/account-email/index.ts`) + '\nexports.handleEmailChange = handleEmailChange;'), {
      exports, Response, URL, URLSearchParams, console: { log() {}, error() {} },
      require: name => { assert.ok(name in imports, name); return imports[name]; },
    });
    const request = new Request('https://fixture.test', { headers: { Authorization: 'Bearer fixture' } });
    for (const available of [true, false]) {
      sent = available;
      const result = await exports.handleEmailChange(request, admin,
        { newEmail: 'new@fixture.test', redirectTo: 'https://attacker.test' }, 'fixture-url', 'anon-key');
      assert.equal(result.status, 200);
    }
    assert.equal(generated.length, 4);
    assert.ok(generated.every(value => value.options.redirectTo === links.EMAIL_CHANGE_GATEWAY_URL));
    assert.deepEqual(generated.slice(0, 2).map(value => value.type), ['email_change_current', 'email_change_new']);
    assert.deepEqual(delivered.slice(0, 2).map(value => value.to), ['current@fixture.test', 'new@fixture.test']);
    for (const email of [...delivered.map(item => item.html), ...queued.map(item => item.html_content)]) {
      const hrefs = [...email.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
      assert.equal(hrefs.length, 2);
      assert.ok(hrefs.every(href => links.parseEmailChangeUrl(href)));
      assert.ok(hrefs.every(href => links.parseEmailChangeUrl(href).endsWith('_correct_hash')));
      assert.doesNotMatch(email, /attacker|musikalokal:\/\//);
    }
    assert.equal(queued.length, 2);
  });
}

test('email-change page waits for a click, confirms both-address flows, handles expired links and permits network retries', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const config = JSON.parse(read('web/public/recovery/config.js').replace('export const config = ', '').replace(/;\s*$/, ''));
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const calls = [];
  let status = 200, delayed;
  await context.route('https://musika-lokal.vercel.app/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = pathname === '/email-change' ? 'web/public/email-change/index.html' : 'web/public' + pathname;
    await route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: read(file) });
  });
  await context.route(config.url + '/**', async route => {
    calls.push({ method: route.request().method(), body: route.request().postDataJSON() });
    if (delayed) await delayed;
    await route.fulfill({ status, json: status === 200 ? { msg: 'Confirmation accepted' } : { error: 'invalid' } });
  });
  const page = await context.newPage();
  try {
    for (const hash of ['current_hash', 'new_hash']) {
      await page.goto(links.buildEmailChangeUrl(hash));
      await page.getByRole('button', { name: 'Confirm email change' }).waitFor();
      assert.equal(page.url(), links.EMAIL_CHANGE_GATEWAY_URL);
      const before = calls.length;
      assert.equal(before, hash === 'current_hash' ? 0 : 1);
      let release;
      delayed = new Promise(resolve => { release = resolve; });
      await page.getByRole('button', { name: 'Confirm email change' }).click();
      assert.equal(await page.getByRole('button', { name: 'Confirm email change' }).isDisabled(), true);
      release(); delayed = null;
      await page.getByRole('status').filter({ hasText: 'This address is confirmed' }).waitFor();
      assert.equal(calls.length, before + 1);
      assert.deepEqual(calls.at(-1).body, { token_hash: hash, type: 'email_change' });
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    }
    status = 503;
    await page.goto(links.buildEmailChangeUrl('retry_hash'));
    await page.getByRole('button', { name: 'Confirm email change' }).click();
    await page.getByRole('status').filter({ hasText: 'temporarily unavailable' }).waitFor();
    status = 200;
    await page.getByRole('button', { name: 'Confirm email change' }).click();
    await page.getByRole('status').filter({ hasText: 'This address is confirmed' }).waitFor();
    status = 403;
    await page.goto(links.buildEmailChangeUrl('expired_hash'));
    await page.getByRole('button', { name: 'Confirm email change' }).click();
    await page.getByRole('status').filter({ hasText: 'invalid, expired, or already used' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Confirm email change' }).isVisible(), false);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  } finally { await browser.close(); }
});

test('email-change server copies, generated browser module and auth templates remain aligned', () => {
  const source = read('mobile/supabase/functions/_shared/emailChangeLinks.ts');
  assert.equal(read('web/supabase/functions/_shared/emailChangeLinks.ts'), source);
  assert.equal(read('web/public/email-change/flow.js'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  for (const workspace of ['mobile', 'web']) {
    assert.match(read(`${workspace}/supabase/templates/email_change.html`), /email-change#token_hash={{ .TokenHash }}/);
  }
});
