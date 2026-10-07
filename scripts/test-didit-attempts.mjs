import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { createDiditAttemptMonitor } from '../mobile/src/utils/diditAttempt.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture(read) {
  const states = [], results = [], timers = new Map(); let current = true, nextTimer = 0;
  const monitor = createDiditAttemptMonitor({ read, classify: row => row.status,
    onResult: row => { results.push(row); }, onState: state => { states.push(state); },
    isCurrent: () => current, schedule: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    unschedule: id => timers.delete(id),
  });
  return { monitor, states, results, timers, replace: () => { current = false; } };
}

test('callback, timer and manual checks share one in-flight request and finish once', async () => {
  let reads = 0; const pending = deferred();
  const f = fixture(() => { reads++; return pending.promise; });
  const checks = [f.monitor.check(), f.monitor.check(), f.monitor.check()];
  assert.equal(reads, 1);
  pending.resolve({ status: 'approved' }); await Promise.all(checks);
  await f.monitor.check(); assert.equal(reads, 1); assert.equal(f.results.length, 1); assert.equal(f.timers.size, 0);
});

test('cancelled or superseded reads cannot approve, clear a new attempt or schedule polling', async () => {
  for (const action of ['stop', 'replace']) {
    const pending = deferred(), f = fixture(() => pending.promise);
    const p = f.monitor.check(); action === 'stop' ? f.monitor.stop() : f.replace();
    pending.resolve({ status: 'approved' }); await p;
    assert.equal(f.results.length, 0); assert.equal(f.timers.size, 0);
  }
});

test('unknown/pending and failed network states never finish signup; explicit checks recover', async () => {
  let outcome = 'pending';
  const f = fixture(async () => { if (outcome === 'error') throw Error('Offline'); return { status: outcome }; });
  await f.monitor.check(); assert.equal(f.results.length, 0); assert.equal(f.timers.size, 1);
  outcome = 'error'; await f.monitor.check(); assert.equal(f.states.at(-1), 'error'); assert.equal(f.results.length, 0);
  outcome = 'review'; await f.monitor.check(); assert.equal(f.results.at(-1).status, 'review'); assert.equal(f.timers.size, 0);
});

test('repeated decline and cancellation followed by a fresh success uses independent monitors', async () => {
  for (const status of ['failed', 'failed', 'review', 'approved']) {
    const f = fixture(async () => ({ status })); await f.monitor.check();
    assert.equal(f.results.length, 1); f.monitor.stop(); assert.equal(f.timers.size, 0);
  }
});

function signupCreationFixture() {
  const source=readFileSync('mobile/app/signup.tsx','utf8');
  const ast=ts.createSourceFile('signup.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const screen=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='SignupScreen');
  const names=['clearDiditSignupSession','startNewVerificationSession'];
  const declarations=screen.body.statements.filter(node=>ts.isVariableStatement(node)&&names.includes(node.declarationList.declarations[0].name.getText(ast)));
  assert.equal(declarations.length,2);
  const request=deferred(),saved=new Map(),state={},calls=[];
  const ref={current:0},current={current:{id:'',nonce:''}};
  const globals={exports:{},URL,Math,Date,useCallback:fn=>fn,
    signupCancellationVersionRef:ref,currentDiditAttemptRef:current,diditMonitorRef:{current:null},
    creatingDiditSessionRef:{current:false},diditVerificationReturnHandledRef:{current:false},
    sessionId:'',sessionNonce:'',verificationUrl:'',tempSessionRef:'',verificationMode:'didit',
    email:'signup@musikalokal.test',password:'fixture-password',selectedRole:'fan',selectedDocumentKey:'passport',
    selectedDocumentOption:{label:'Passport',diditDocumentType:'passport'},musicianVideoProof:null,
    router:{setParams(){}},Platform:{OS:'android'},Linking:{createURL:()=> 'musikalokal://signup?check_verification=true'},
    logSignupFlow(){},logSignupFlowError(){},maskEmailForLog:value=>value,summarizeSessionRefForLog:value=>value,
    summarizeSignupInvokeData:value=>value,getDiditVerificationUrlFromInvokeData:data=>data.verificationUrl,
    getSignupInvokeErrorMessage:data=>data.error,Alert:{alert(){}},
    AsyncStorage:{setItem:async(key,value)=>saved.set(key,value),removeItem:async key=>saved.delete(key)},
    supabase:{functions:{invoke:async(name,{body})=>{calls.push(body);return body.action==='cancel_session'?{data:{success:true}}:request.promise;}}},
  };
  for(const setter of ['VerificationUrl','SessionId','SessionNonce','TempSessionRef','DiditCreationError','Step'])globals['set'+setter]=value=>{state[setter]=value;};
  const functions=vm.runInNewContext(compile(declarations.map(d=>d.getText(ast)).join('\n'))+'\n({clearDiditSignupSession,startNewVerificationSession});',globals);
  return {functions,request,saved,state,calls,current};
}

test('production signup creates exactly one fresh attempt on rapid retry presses and saves its own nonce', async()=>{
  const f=signupCreationFixture();
  const first=f.functions.startNewVerificationSession({forceNew:true});
  const second=f.functions.startNewVerificationSession({forceNew:true});
  await tick();assert.equal(f.calls.filter(c=>!c.action).length,1);
  f.request.resolve({data:{sessionId:'fresh',sessionNonce:'fresh-nonce',verificationUrl:'https://verify.didit.me/fresh'}});
  await Promise.all([first,second]);
  assert.equal(f.current.current.id,'fresh');assert.equal(f.current.current.nonce,'fresh-nonce');
  const stored=JSON.parse(f.saved.get('signup_current_session'));
  assert.equal(stored.sSessionId,'fresh');assert.equal(stored.sSessionNonce,'fresh-nonce');
  assert.equal(stored.email,'signup@musikalokal.test');assert.equal(f.calls[0].force_new,true);
});

test('production signup rejects a late created session after cancellation and never retries a failure automatically',async()=>{
  const f=signupCreationFixture();const first=f.functions.startNewVerificationSession({forceNew:true});
  await tick();await f.functions.clearDiditSignupSession('user_cancelled');
  f.request.resolve({data:{sessionId:'late',sessionNonce:'nonce',verificationUrl:'https://verify.didit.me/late'}});
  assert.equal(await first,'');assert.equal(f.current.current.id,'');assert.equal(f.saved.size,0);
  const failed=signupCreationFixture();const start=failed.functions.startNewVerificationSession({forceNew:true});
  await tick();failed.request.resolve({error:Error('Offline')});await start;await tick();
  assert.equal(failed.state.DiditCreationError,true);assert.equal(failed.calls.filter(c=>!c.action).length,1);
});

test('production signup restores the saved attempt on restart and ignores a superseded callback ID',async()=>{
  const source=readFileSync('mobile/app/signup.tsx','utf8');
  const ast=ts.createSourceFile('signup.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const screen=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='SignupScreen');
  const effects=screen.body.statements.filter(node=>ts.isExpressionStatement(node)&&node.getText(ast).startsWith('useEffect('));
  const restore=effects.find(node=>node.getText(ast).includes("getItem('signup_current_session')"));
  const callback=effects.find(node=>node.getText(ast).includes('Delayed callbacks from a replaced session'));
  assert.ok(restore);assert.ok(callback);
  const saved={sSessionId:'latest',sSessionNonce:'latest-nonce',sVerificationUrl:'https://verify.didit.me/latest',email:'saved@musikalokal.test',password:'saved-password',selectedRole:'fan',selectedDocumentKey:'passport'};
  const current={current:{id:'',nonce:''}},state={};let registered,checks=0;
  const context={useEffect:fn=>{registered=fn;},signupCancellationVersionRef:{current:0},currentDiditAttemptRef:current,lastVerificationEmailRef:{current:''},
    AsyncStorage:{getItem:async()=>JSON.stringify(saved),removeItem:async()=>{}},isAllowedSignupRole:role=>role==='fan',getDocumentOptionByKey:key=>({key}),
  };
  for(const setter of ['Email','Password','ConfirmPassword','SelectedRole','SelectedDocumentKey','MusicianVideoProof','SessionId','SessionNonce','TempSessionRef','VerificationUrl','Step'])context['set'+setter]=value=>{state[setter]=value;};
  vm.runInNewContext(compile(restore.getText(ast)),context);const cleanup=registered();await tick();
  assert.equal(current.current.id,'latest');assert.equal(state.Email,saved.email);assert.equal(state.Step,'verification');cleanup();
  for(const session_id of ['replaced','latest']){
    vm.runInNewContext(compile(callback.getText(ast)),{...context,verified:'',check_verification:'true',session_id,
      diditMonitorRef:{current:{check:()=>{checks++;}}},router:{setParams(){}},
    });registered();
  }
  assert.equal(checks,1);assert.equal(current.current.id,'latest');
});

for (const workspace of ['mobile', 'web']) {
  const exports = {};
  vm.runInNewContext(compile(readFileSync(`${workspace}/supabase/functions/_shared/identityDuplicate.ts`, 'utf8')), {
    exports, crypto: webcrypto, TextEncoder, Deno: { env: { get: () => 'fixture-secret' } },
  });
  const attempt = {};
  vm.runInNewContext(compile(readFileSync(`${workspace}/supabase/functions/_shared/diditAttempt.ts`, 'utf8')), {
    exports: attempt, require: () => exports,
  });
  const nonce = exports.createSessionNonce();
  const hash = await exports.hashSessionNonce('session-1', nonce);
  function client(row) {
    let updates = 0;
    return { get updates() { return updates; }, from() {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }),
        update(values) { updates++; Object.assign(row, values); return q; },
        then(resolve) { resolve({ error: null }); },
      }; return q;
    } };
  }
  test(`${workspace}: cancelling requires the attempt nonce; a repeated cancellation is idempotent`, async () => {
    const c = client({ status: 'PENDING', verification_data: { session_nonce_hash: hash } });
    await assert.rejects(attempt.cancelDiditAttempt(c, 'session-1', 'wrong'), /could not be validated/);
    assert.equal(c.updates, 0);
    await attempt.cancelDiditAttempt(c, 'session-1', nonce);
    await attempt.cancelDiditAttempt(c, 'session-1', nonce);
    assert.equal((await attempt.readDiditAttempt(c, 'session-1', nonce)).status, 'SUPERSEDED');
    await assert.rejects(attempt.cancelDiditAttempt(client({ status: 'PENDING', verification_data: {} }), 'legacy', ''), /could not be validated/);
  });

  test(`${workspace}: the real session handler rejects wrong credentials and ignores old approval without contacting Didit`, async () => {
    const c = client({ status: 'SUPERSEDED', verification_data: { session_nonce_hash: hash } });
    let handler, providerRequests = 0;
    const env = { DIDIT_API_KEY: 'provider-fixture', DIDIT_WORKFLOW_ID: 'workflow-fixture', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', SUPABASE_ANON_KEY: 'anon-fixture' };
    vm.runInNewContext(compile(readFileSync(`${workspace}/supabase/functions/create-didit-session/index.ts`, 'utf8')), {
      exports: {}, Request, Response, Headers, AbortSignal, URL, crypto: webcrypto, TextEncoder,
      console: { log() {}, error() {}, warn() {} }, Deno: { env: { get: key => env[key] } },
      fetch: async () => { providerRequests++; throw Error('Provider should not be called'); },
      require(name) {
        if (name.includes('/http/server')) return { serve: fn => { handler = fn; } };
        if (name.includes('supabase-js')) return { createClient: () => c };
        if (name.includes('identityDuplicate')) return exports;
        if (name.includes('diditAttempt')) return attempt;
        return {};
      },
    });
    const invoke = body => handler(new Request('https://fixture.supabase.co/functions/v1/create-didit-session', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
    const bad = await (await invoke({ action: 'get_session', session_id: 'session-1', sessionNonce: 'wrong' })).json();
    assert.equal(bad.code, 'SESSION_VALIDATION_FAILED');
    const old = await (await invoke({ action: 'get_session', session_id: 'session-1', sessionNonce: nonce })).json();
    assert.equal(old.status, 'SUPERSEDED'); assert.equal(providerRequests, 0);
    assert.equal((await invoke({ action: 'get_workflow' })).status, 401);
    const cancelled = await (await invoke({ action: 'cancel_session', session_id: 'session-1', sessionNonce: nonce })).json();
    assert.equal(cancelled.success, true); assert.equal(providerRequests, 0);
  });

  test(`${workspace}: the database retains invalidation despite delayed approval or review writes`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated;
        create table verification_sessions(session_ref text primary key, status text, verification_data jsonb);
        insert into verification_sessions values ('old','PENDING','{}'), ('new','PENDING','{}');`);
      const migration = readdirSync(`${workspace}/supabase/migrations`).find(f => f.endsWith('_guard_invalidated_didit_attempts.sql'));
      await db.exec(readFileSync(`${workspace}/supabase/migrations/${migration}`, 'utf8'));
      await db.exec(`update verification_sessions set status='SUPERSEDED' where session_ref='old';
        insert into verification_sessions values ('old','APPROVED','{"late":true}')
        on conflict(session_ref) do update set status=excluded.status,verification_data=excluded.verification_data;
        update verification_sessions set status='PENDING_REVIEW' where session_ref='old';
        update verification_sessions set status='APPROVED' where session_ref='new';`);
      const { rows } = await db.query('select session_ref,status from verification_sessions order by session_ref');
      assert.deepEqual(rows, [{ session_ref: 'new', status: 'APPROVED' }, { session_ref: 'old', status: 'SUPERSEDED' }]);
      const privileges = await db.query(`select has_function_privilege('anon','guard_invalidated_didit_attempt()','execute') as anon,
        has_function_privilege('authenticated','guard_invalidated_didit_attempt()','execute') as authenticated`);
      assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false });
    } finally { await db.close(); }
  });

  test(`${workspace}: invalidated account creation is rejected before querying a stale provider approval`, async () => {
    const source = readFileSync(`${workspace}/supabase/functions/create-unverified-user/index.ts`, 'utf8');
    const ast = ts.createSourceFile('signup.ts', source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getValidatedDiditSession');
    const scope = vm.runInNewContext(compile(fn.getText(ast)) + '\ngetValidatedDiditSession;', {
      verifySessionNonce: exports.verifySessionNonce, stripPrivateSessionFields: exports.stripPrivateSessionFields,
    });
    await assert.rejects(scope(client({ status: 'SUPERSEDED', verification_data: { session_nonce_hash: hash } }), 'session-1', nonce), /not approved/);
  });
}
