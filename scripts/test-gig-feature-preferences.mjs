import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8');
const migrationName = '20261007160000_individual_gig_feature_preferences.sql';
const ids = Object.fromEntries(['neil','jared','stranger','admin','solo','manager','band','gig','app','otherApp','soloApp','roster','rosterApp']
  .map((name, index) => [name, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]));
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(workspace) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.uid',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('fixture.role',true) $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table profiles(id uuid primary key,full_name text,avatar_url text);
    create table groups(id uuid primary key,owner_id uuid references profiles(id),name text);
    create table group_members(id uuid default gen_random_uuid(),group_id uuid,user_id uuid,role text);
    create table production_team_roster(id uuid primary key,group_id uuid,profile_id uuid);
    create table gigs(id uuid primary key,name text,location text,budget numeric,event_date date,status text);
    create table gig_availability_slots(gig_id uuid,slot_date date,start_time time,end_time time);
    create table group_media(group_id uuid,media_url text,sort_order int,created_at timestamptz);
    create table gig_applications(id uuid primary key,gig_id uuid,applicant_id uuid,group_id uuid,production_roster_id uuid,
      status text,created_at timestamptz default now(),feature_consent_status text default 'pending',
      show_on_profile boolean default false,show_on_gig_page boolean default false,performer_snapshot jsonb default '{}',
      feature_consent_responded_at timestamptz,feature_consent_requested_at timestamptz default now(),cv_url text default 'private-cv');
    alter table gig_applications enable row level security;
    grant select,update on gig_applications to authenticated;
    create policy fixture_applicant on gig_applications for all to authenticated using(applicant_id=auth.uid());
    insert into profiles(id,full_name) values ${['neil','jared','stranger','admin','solo','manager'].map(n=>`('${ids[n]}','${n}')`).join(',')};
    insert into groups values('${ids.band}','${ids.neil}','Fantastic duo');
    insert into group_members(group_id,user_id,role) values('${ids.band}','${ids.jared}','member'),('${ids.band}','${ids.admin}','admin');
    insert into gigs values('${ids.gig}','One roots heavy bagsakan','JG Plaza',6000,'2026-10-22','closed');
    insert into gig_availability_slots values('${ids.gig}','2026-10-22','08:00','12:00');
    insert into gig_applications(id,gig_id,applicant_id,group_id,status,feature_consent_status,show_on_profile,show_on_gig_page,feature_consent_responded_at)
      values('${ids.app}','${ids.gig}','${ids.neil}','${ids.band}','accepted','accepted',true,true,'2026-10-01T10:00:00Z'),
      ('${ids.otherApp}','${ids.gig}','${ids.jared}','${ids.band}','accepted','pending',false,false,null);
    insert into gig_applications(id,gig_id,applicant_id,status,feature_consent_status,show_on_profile,show_on_gig_page,feature_consent_responded_at)
      values('${ids.soloApp}','${ids.gig}','${ids.solo}','accepted','accepted',true,true,'2026-10-01T10:00:00Z');
    insert into production_team_roster values('${ids.roster}','${ids.band}',null);
    insert into gig_applications(id,gig_id,applicant_id,production_roster_id,status)
      values('${ids.rosterApp}','${ids.gig}','${ids.manager}','${ids.roster}','accepted');
  `);
  await db.exec(read(`${workspace}/supabase/migrations/${migrationName}`));
  await db.exec(read(`${workspace}/supabase/migrations/20261007160500_guard_feature_consent_status_transitions.sql`));
  const consent = async (user, scope = null, profile = false, gig = false, write = false, app = 'app') =>
    (await db.query('select public.manage_gig_feature_consent($1,$2,$3,$4,$5,$6) as result',
      [ids[app], ids[user], scope, profile, gig, write])).rows[0].result;
  const timeline = async (user, type = 'artist') =>
    (await db.query('select * from public.get_public_performer_gig_timeline($1,$2)',[ids[user],type])).rows;
  const row = async (app = 'app') => (await db.query('select * from gig_applications where id=$1',[ids[app]])).rows[0];
  return { db, consent, timeline, row };
}

for (const workspace of ['mobile','web']) {
  test(`${workspace}: database featuring acceptance`, async t => {
    const f = await fixture(workspace);
    const { db, consent, timeline, row } = f;
    try {
      await t.test('migration preserves explicit owner/solo consent and leaves other members private', async () => {
        assert.equal((await consent('neil')).self_show_on_profile,true);
        assert.equal((await consent('solo',null,false,false,false,'soloApp')).self_show_on_profile,true);
        const member = await consent('jared');
        assert.equal(member.self_show_on_profile,false);
        assert.equal(member.can_edit_self,true);
        assert.equal(member.can_edit_group,false);
        assert.equal((await timeline('jared')).length,0);
        assert.equal((await timeline('neil')).length,1);
        assert.equal((await timeline('band','group')).length,1);
      });
      await t.test('Jared opts in independently, persists across reads, and cannot edit the band or another user', async () => {
        const original = await row();
        await consent('jared','self',true,true,true);
        assert.equal((await consent('jared')).self_show_on_profile,true);
        assert.deepEqual(await row(),original);
        assert.equal((await timeline('jared')).length,1);
        assert.equal((await timeline('neil')).length,1);
        assert.equal((await consent('neil')).self_show_on_profile,true);
        await assert.rejects(consent('jared','group',false,false,true),/authorized group leader/);
        await assert.rejects(consent('stranger'),/current group members/);
        await assert.rejects(consent('neil','invalid',true,true,true),/Invalid featuring scope/);
        await db.exec(`update group_members set role=null where user_id='${ids.jared}'`);
        await assert.rejects(consent('jared','group',true,true,true),/authorized group leader/);
        await db.exec(`update group_members set role='member' where user_id='${ids.jared}'`);
        const publicRow = (await timeline('jared'))[0];
        assert.deepEqual(Object.keys(publicRow).sort(),['gigs','group_id','group_name','id','status']);
        assert.equal(publicRow.group_name,'Fantastic duo');
        assert.equal(publicRow.gigs.gig_availability_slots[0].start_time,'08:00:00');
        assert.ok(!JSON.stringify(publicRow).includes('private-cv'));
      });
      await t.test('leader/admin band choices leave member choices independent and the band occupies one lineup entry', async () => {
        await consent('neil','self',false,false,true);
        assert.equal((await timeline('neil')).length,0);
        assert.equal((await timeline('jared')).length,1);
        await consent('admin','group',false,false,true);
        assert.equal((await timeline('band','group')).length,0);
        assert.equal((await timeline('jared')).length,1);
        await consent('neil','group',true,true,true);
        await consent('neil','group',true,true,true,'otherApp');
        const lineup = (await db.query('select * from get_gig_featured_performers($1)',[ids.gig])).rows;
        assert.equal(lineup.filter(r=>r.group_id===ids.band).length,1);
        assert.equal(lineup.find(r=>r.group_id===ids.band).display_name,'Fantastic duo');
        assert.equal((await timeline('neil')).length,0);
        assert.equal((await timeline('jared')).length,1);
        const before = await row();
        const retry = await consent('neil','group',true,true,true);
        assert.equal(retry.changed,false);
        assert.deepEqual(await row(),before);
      });
      await t.test('production-roster members get self access while submitting managers cannot choose for them', async () => {
        assert.equal((await consent('jared',null,false,false,false,'rosterApp')).can_edit_self,true);
        assert.equal((await consent('neil',null,false,false,false,'rosterApp')).can_edit_group,true);
        await assert.rejects(consent('manager','self',true,false,true,'rosterApp'),/current group members/);
        await consent('jared','self',true,false,true,'rosterApp');
        assert.equal((await timeline('jared')).length,1);
      });
      await t.test('real RLS and RPC grants block cross-user preference reads/writes and direct band bypass', async () => {
        await db.exec(`set fixture.uid='${ids.jared}';set fixture.role='authenticated';set role authenticated;`);
        assert.ok((await db.query('select * from gig_application_profile_preferences')).rows.every(r=>r.user_id===ids.jared));
        await assert.rejects(db.exec(`update gig_application_profile_preferences set show_on_profile=false`),/permission denied/);
        await assert.rejects(consent('neil','self',true,false,true),/permission denied/);
        await assert.rejects(db.exec(`update gig_applications set show_on_gig_page=false where id='${ids.otherApp}'`),/authorized group leader/);
        await assert.rejects(db.exec(`update gig_applications set status='completed',show_on_gig_page=false where id='${ids.otherApp}'`),/authorized group leader/);
        await db.exec('reset role');
        await db.exec(`set fixture.role='';set role anon;`);
        await assert.rejects(db.query('select * from gig_application_profile_preferences'),/permission denied/);
        assert.equal((await timeline('jared')).length,1);
        await assert.rejects(consent('jared'),/permission denied/);
        await db.exec('reset role');
      });
      await t.test('removed members lose public and editing access; completion preserves consent; cancellation and reacceptance revoke it', async () => {
        await db.exec(`delete from group_members where user_id='${ids.jared}'`);
        assert.equal((await timeline('jared')).length,0);
        await assert.rejects(consent('jared'),/current group members/);
        await db.exec(`insert into group_members(group_id,user_id,role) values('${ids.band}','${ids.jared}','member')`);
        await db.exec(`update gig_applications set status='completed' where id='${ids.app}'`);
        assert.equal((await consent('jared')).self_show_on_profile,true);
        await consent('jared','self',false,false,true);
        assert.equal((await consent('jared')).self_show_on_profile,false);
        await consent('jared','self',true,false,true);
        await db.exec(`update gig_applications set status='cancelled' where id='${ids.app}'`);
        await assert.rejects(consent('jared','self',true,false,true),/accepted or completed/);
        await db.exec(`update gig_applications set status='accepted' where id='${ids.app}'`);
        assert.equal((await consent('jared')).self_show_on_profile,false);
      });
      await t.test('solo legacy saves update both projections atomically and failed transactions roll back choices', async () => {
        await consent('solo',null,false,false,true,'soloApp');
        assert.equal((await row('soloApp')).show_on_profile,false);
        assert.equal((await consent('solo',null,false,false,false,'soloApp')).self_show_on_profile,false);
        await db.exec('begin');
        await consent('solo','self',true,true,true,'soloApp');
        await db.exec('rollback');
        assert.equal((await row('soloApp')).show_on_profile,false);
        assert.equal((await consent('solo',null,false,false,false,'soloApp')).self_show_on_profile,false);
        assert.ok(!(await db.query(`select relrowsecurity from pg_class where oid='gig_applications'::regclass`)).rows.some(r=>!r.relrowsecurity));
      });
    } finally { await db.close(); }
  });

  test(`${workspace}: real Edge Function verifies identity and routes self/group choices through the database`, async () => {
    const f = await fixture(workspace);
    let user = ids.jared;
    let handler;
    const client = {
      auth: { getUser: async token => ({ data: { user: token==='valid'?{id:user}:null },error:null }) },
      from(table) {
        assert.equal(table,'gig_applications');
        let id;
        const query={select(){return query;},eq(column,value){assert.equal(column,'id');id=value;return query;},
          async maybeSingle(){return {data:(await f.db.query('select * from gig_applications where id=$1',[id])).rows[0]||null,error:null};}};
        return query;
      },
      async rpc(name,params) {
        assert.equal(name,'manage_gig_feature_consent');
        try { return {data:(await f.db.query('select manage_gig_feature_consent($1,$2,$3,$4,$5,$6) as result',
          [params.p_application_id,params.p_user_id,params.p_scope,params.p_show_on_profile,params.p_show_on_gig_page,params.p_write])).rows[0].result,error:null}; }
        catch(error){return {data:null,error};}
      },
    };
    vm.runInNewContext(compile(read(`${workspace}/supabase/functions/gig-applications/index.ts`)), {
      exports:{},console,Response,Request,
      require:name=>name.includes('supabase-js')?{createClient:()=>client}:{},
      Deno:{serve:fn=>{handler=fn;},env:{get:()=> 'fixture-service-key'}},
    });
    const invoke = (action,extra={},token='valid') => handler(new Request('https://fixture.invalid',{
      method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify({action,applicationId:ids.app,...extra}),
    }));
    try {
      assert.equal((await invoke('fetch_feature_consent',{},null)).status,401);
      assert.equal((await invoke('fetch_feature_consent',{},'invalid')).status,401);
      assert.equal((await invoke('fetch_feature_consent',{userId:ids.neil})).status,403);
      assert.equal((await invoke('fetch_feature_consent')).status,200);
      assert.equal((await invoke('respond_feature_consent',{scope:'self',showOnProfile:true})).status,200);
      assert.equal((await f.consent('jared')).self_show_on_profile,true);
      assert.equal((await invoke('respond_feature_consent',{scope:'group',showOnProfile:false})).status,403);
      assert.equal((await invoke('respond_feature_consent',{scope:'self',showOnProfile:'true'})).status,400);
      assert.equal((await invoke('respond_feature_consent',{scope:'other',showOnProfile:true})).status,400);
      user=ids.neil;
      assert.equal((await invoke('respond_feature_consent',{scope:'group',showOnProfile:false,showOnGigPage:false})).status,200);
      assert.equal((await f.consent('jared')).self_show_on_profile,true);
      user=ids.stranger;
      assert.equal((await invoke('fetch_feature_consent')).status,403);
    } finally { await f.db.close(); }
  });
}

function hookFixture() {
  const slots=[],pending=[],saves=[];
  let cursor=0,effects=[],authListener;
  let session={user:{id:'jared'},access_token:'fixture-token'};
  const React={
    useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
    useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},
    useCallback(fn){return fn;},
    useEffect(fn,deps){const i=cursor++;const slot=slots[i]??={};if(!slot.deps||deps.some((v,j)=>v!==slot.deps[j])){slot.cleanup?.();slot.deps=deps;effects.push(()=>{slot.cleanup=fn();});}},
  };
  const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{authListener=fn;return{data:{subscription:{unsubscribe(){authListener=null;}}}};}},
    functions:{invoke:(_name,options)=>new Promise(resolve=>{pending.push({options,resolve});if(options.body.action==='respond_feature_consent')saves.push(options.body);})}};
  const exports={};
  vm.runInNewContext(compile(read('mobile/src/hooks/useGigFeatureConsent.ts')),{exports,Response,require:name=>name==='react'?React:{supabase}});
  const render=id=>{cursor=0;effects=[];const result=exports.useGigFeatureConsent(id);effects.forEach(fn=>fn());return result;};
  const auth=user=>{session=user?{user:{id:user},access_token:'fixture-token'}:null;authListener('SIGNED_IN',session);};
  return{render,pending,saves,auth,unmount:()=>slots.forEach(s=>s.cleanup?.())};
}

test('consent hook rejects delayed reads/saves after switching applications, users, sign-out, or unmount',async()=>{
  const f=hookFixture();
  f.render('first');await tick();const first=f.pending.shift();
  f.render('second');await tick();const second=f.pending.shift();
  second.resolve({data:{id:'second',can_edit_self:true,self_show_on_profile:false},error:null});await tick();
  first.resolve({data:{id:'first'},error:null});await tick();
  assert.equal(f.render('second').application.id,'second');
  const save=f.render('second').saveConsent('self',true);await tick();const delayed=f.pending.shift();
  f.auth('neil');await tick();const neil=f.pending.shift();
  neil.resolve({data:{id:'second',viewer:'neil'},error:null});await tick();
  delayed.resolve({data:{id:'second',viewer:'jared'},error:null});await save;
  assert.equal(f.render('second').application.viewer,'neil');
  f.auth(null);await tick();assert.equal(f.render('second').application,null);
  assert.match(f.render('second').errorMessage,/sign in/);
  f.auth('jared');await tick();const last=f.pending.shift();
  f.unmount();last.resolve({data:{id:'stale'},error:null});await tick();
  assert.equal(f.render('second').application,null);
});

test('consent hook blocks duplicate saves, sends explicit scope, preserves saved choices on failure, and retries reads',async()=>{
  const f=hookFixture();f.render('app');await tick();
  f.pending.shift().resolve({data:{id:'app',can_edit_self:true,self_show_on_profile:false},error:null});await tick();
  const state=f.render('app');const save=state.saveConsent('self',true,true);const duplicate=state.saveConsent('group',true,true);
  await tick();assert.equal(f.saves.length,1);assert.equal(f.saves[0].scope,'self');
  f.pending.shift().resolve({data:null,error:{message:'Offline'}});await Promise.all([save,duplicate]);
  assert.equal(f.render('app').application.self_show_on_profile,false);
  assert.equal(f.render('app').errorMessage,'Offline');
  const retry=f.render('app').saveConsent('self',true);await tick();
  f.pending.shift().resolve({data:{id:'app',self_show_on_profile:true},error:null});await retry;
  assert.equal(f.render('app').application.self_show_on_profile,true);
  const refresh=f.render('app').loadApplication();await tick();
  f.pending.shift().resolve({data:{id:'app',self_show_on_profile:true},error:null});await refresh;
  assert.equal(f.render('app').application.self_show_on_profile,true);f.unmount();
});

test('production consent screen gives members self controls and leaders separate band controls',()=>{
  const slots=[];let cursor=0,effects=[],choices;
  const calls=[];
  const React={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'Fragment',
    useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,value=>{slots[i].value=value;}];},
    useEffect(fn,deps){const i=cursor++;const slot=slots[i]??={};if(!slot.deps||deps.some((v,j)=>v!==slot.deps[j])){slot.deps=deps;effects.push(fn);}},
  };
  const exports={};
  vm.runInNewContext(compile(read('mobile/app/gig_feature_consent.tsx')),{exports,
    require:name=>name==='react'?React:name==='react-native'?{ActivityIndicator:'Spinner',Image:'Image',ScrollView:'ScrollView',StyleSheet:{create:x=>x},Switch:'Switch',Text:'Text',TouchableOpacity:'Button',View:'View'}
      :name.includes('useGigFeatureConsent')?{useGigFeatureConsent:()=>({application:choices,loading:false,saving:null,errorMessage:'',successMessage:'',saveConsent:(...args)=>calls.push(args)})}
      :name==='expo-router'?{useLocalSearchParams:()=>({applicationId:'app'}),router:{}}
      :name.includes('ThemeContext')?{useTheme:()=>({colors:{primary:'#14B8A6'},isDark:false})}
      :name.includes('useBottomBarClearance')?{useBottomBarClearance:()=>({contentBottomPadding:32})}
      :name.includes('tokens')?{typography:{}}:{default:'Component',Ionicons:'Icon',LoadingButtonContent:'Loading'},
  });
  const render=()=>{cursor=0;effects=[];const tree=exports.default();effects.forEach(fn=>fn());return tree;};
  const find=(tree,id)=>Array.isArray(tree)?tree.flatMap(node=>find(node,id))
    :tree?.props?[...(tree.props.testID===id?[tree]:[]),...find(tree.props.children,id)]:[];
  const node=id=>find(render(),id)[0];
  choices={id:'app',is_group_performance:true,can_edit_self:true,can_edit_group:false,self_show_on_profile:false};
  render();
  assert.equal(node('feature-band-on-gig-toggle'),undefined);
  assert.equal(node('save-band-feature-consent'),undefined);
  assert.equal(node('feature-on-gig-page-toggle'),undefined);
  node('feature-on-profile-toggle').props.onValueChange(true);
  node('save-feature-consent').props.onPress();
  assert.deepEqual(calls.pop(),['self',true,false]);
  node('keep-feature-private').props.onPress();
  assert.deepEqual(calls.pop(),['self',false,false]);
  choices={...choices,can_edit_group:true,show_on_gig_page:false,show_on_profile:false};render();
  node('feature-band-on-gig-toggle').props.onValueChange(true);
  node('feature-band-on-profile-toggle').props.onValueChange(true);
  node('save-band-feature-consent').props.onPress();
  assert.deepEqual(calls.pop(),['group',true,true]);
  choices={...choices,is_group_performance:false,can_edit_group:false};render();
  node('feature-on-gig-page-toggle').props.onValueChange(true);
  node('save-feature-consent').props.onPress();
  assert.deepEqual(calls.pop(),['self',false,true]);
  choices={...choices,can_edit_self:false};render();
  assert.equal(node('save-feature-consent').props.disabled,true);
});
