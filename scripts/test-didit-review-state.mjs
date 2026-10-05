import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

for (const workspace of ['web', 'mobile']) {
  const sharedSource = await read(`${workspace}/supabase/functions/_shared/identityDuplicate.ts`);
  const webhookSource = await read(`${workspace}/supabase/functions/didit-webhook/index.ts`);
  const shared = {};
  runInNewContext(compile(sharedSource), {
    exports: shared, crypto: webcrypto, TextEncoder,
    Deno: { env: { get: () => 'test-identity-secret' } },
  });

  const ast = ts.createSourceFile('webhook.ts', webhookSource, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node)
    && ['upsertVerificationSession', 'handleInReview'].includes(node.name?.text));
  assert.equal(functions.length, 2);
  const handlerSource = compile(functions.map((node) => node.getText(ast)).join('\n'));

  function fixture(existing = {}) {
    let session = { verification_data: structuredClone(existing) };
    const reviews = [];
    const profileUpdates = [];
    const client = {
      from(table) {
        const query = {
          select: () => query, eq: () => query,
          maybeSingle: async () => ({
            data: table === 'verification_sessions' ? session : { email: 'fan@example.com', role: 'fan' },
          }),
          upsert: async (next) => { session = structuredClone(next); return { error: null }; },
          update: (next) => { profileUpdates.push(structuredClone(next)); return query; },
          insert: async () => ({ error: null }),
        };
        return query;
      },
    };
    const handleInReview = runInNewContext(`${handlerSource}\nhandleInReview;`, {
      ...shared,
      console: { log() {} },
      queueIdentityReview: async (_client, review) => { reviews.push(structuredClone(review)); return { id: 'review-1' }; },
    });
    return { client, handleInReview, reviews, profileUpdates, session: () => session };
  }

  const document = {
    document_number: 'A123456', document_type: 'passport', issuing_country: 'PHL',
    full_name: 'Maria Reyes', date_of_birth: '1991-05-06', status: 'In Review',
  };

  test(`${workspace}: review webhook retains duplicate-match data without storing the raw document number`, async () => {
    const f = fixture({ email: 'signup@example.com', session_nonce_hash: 'saved-nonce' });
    await f.handleInReview(f.client, 'TEMP_signup', 'session-1', document);
    const saved = f.session();
    assert.equal(saved.status, 'PENDING_REVIEW');
    assert.equal(saved.verification_data.document_fingerprint, await shared.buildIdentityDocumentFingerprint(document));
    assert.equal(saved.verification_data.normalized_full_legal_name, 'MARIA REYES');
    assert.equal(saved.verification_data.birth_date, '1991-05-06');
    assert.equal(saved.verification_data.raw_data.document_number, '[redacted]');
    assert.equal(saved.verification_data.email, 'signup@example.com');
    assert.equal(saved.verification_data.session_nonce_hash, 'saved-nonce');
    assert.equal(f.reviews.length, 0);
  });

  test(`${workspace}: existing accounts retain their role and stay unverified while their identity is reviewed`, async () => {
    const f = fixture();
    await f.handleInReview(f.client, '00000000-0000-0000-0000-000000000001', 'session-1', document);
    assert.equal(f.reviews[0].role, 'fan');
    assert.equal(f.reviews[0].documentFingerprint, f.session().verification_data.document_fingerprint);
    assert.equal(f.reviews[0].normalizedFullLegalName, 'MARIA REYES');
    assert.equal(f.reviews[0].birthDate, '1991-05-06');
    assert.deepEqual(f.profileUpdates, [{ is_verified: false, verification_status: 'PENDING_REVIEW' }]);
  });

  test(`${workspace}: status-only review events retain existing identity data instead of queuing a missing key`, async () => {
    const fingerprint = await shared.buildIdentityDocumentFingerprint(document);
    const f = fixture({
      document_fingerprint: fingerprint, document_type: 'passport', document_country: 'PHL',
      verified_full_legal_name: 'Maria Reyes', normalized_full_legal_name: 'MARIA REYES',
      birth_date: '1991-05-06', raw_data: shared.sanitizeIdentityVerificationData(document),
    });
    await f.handleInReview(f.client, '00000000-0000-0000-0000-000000000001', 'session-1');
    assert.equal(f.session().verification_data.document_fingerprint, fingerprint);
    assert.equal(f.reviews[0].documentFingerprint, fingerprint);
    assert.equal(f.reviews[0].documentType, 'passport');
    assert.equal(f.reviews[0].birthDate, '1991-05-06');
  });

  test(`${workspace}: name and birthdate remain usable when Didit returns no document number`, async () => {
    const f = fixture();
    const { document_number: _number, ...withoutNumber } = document;
    await f.handleInReview(f.client, 'TEMP_signup', 'session-1', withoutNumber);
    assert.equal(f.session().verification_data.document_fingerprint, undefined);
    assert.equal(shared.prepareIdentityNameBirthDateDuplicateInput(f.session().verification_data.raw_data).hasNameBirthDate, true);
  });

  test(`${workspace}: review events without identity data keep the session pending for verification`, async () => {
    const f = fixture({ email: 'signup@example.com' });
    await f.handleInReview(f.client, 'TEMP_signup', 'session-1');
    assert.equal(f.session().status, 'PENDING_REVIEW');
    assert.equal(f.session().verification_data.document_fingerprint, undefined);
    assert.equal(f.session().verification_data.email, 'signup@example.com');
  });
}
