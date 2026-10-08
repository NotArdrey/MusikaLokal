import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reporter = uid(1), owner = uid(2), admin = uid(3), stranger = uid(4);
const databases = [];
after(async () => { for (const db of databases) await db.close(); });
const migration = '20261007150000_transactional_report_notifications.sql';
assert.equal(read(`mobile/supabase/migrations/${migration}`), read(`web/supabase/migrations/${migration}`));

for (const app of ['mobile', 'web']) {
  let db;
  test(`${app}: saved outcomes notify reporter; warnings notify both, retries deduplicate and later revisions arrive`, async () => {
    db = new PGlite(); databases.push(db);
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create table profiles(id uuid primary key,role text);
      create table groups(id uuid primary key,owner_id uuid);
      create table group_members(group_id uuid,user_id uuid,role text);
      create table group_roster_members(group_id uuid,user_id uuid,member_role text);
      create table studios(id uuid primary key,owner_id uuid);
      create table studio_bookings(id uuid primary key,studio_id uuid);
      create table gigs(id uuid primary key,organizer_id uuid);
      create table products(id uuid primary key,seller_id uuid);
      create table playlists(id uuid primary key,creator_id uuid);
      create table feed_posts(id uuid primary key,author_id uuid);
      create table reports(id uuid primary key,reporter_id uuid,target_type text,target_id uuid,status text default 'pending',
        reviewed_by uuid,reviewed_at timestamptz,moderation_action text default 'none',moderation_notes text,
        escalation_status text default 'none',escalation_reason text,escalated_at timestamptz,target_account_action text default 'none',
        target_account_action_expires_at timestamptz);
      create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,
        read boolean default false,meta jsonb,created_at timestamptz default now());
      insert into profiles values ('${reporter}','musician'),('${owner}','musician'),('${admin}','admin'),('${stranger}','musician');
      insert into reports(id,reporter_id,target_type,target_id) values ('${uid(10)}','${reporter}','profile','${owner}');
    `);
    await db.exec(read(`${app}/supabase/migrations/${migration}`));
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 0, 'migration sends no historical notifications');
    await db.query(`update reports set status='resolved',reviewed_by=$1,reviewed_at=now() where id=$2`, [admin, uid(10)]);
    let rows = (await db.query('select * from notifications')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].user_id, reporter); assert.equal(rows[0].read, false);
    assert.equal(rows[0].meta.report_revision, 1); assert.match(rows[0].message, /resolved your report/);
    await db.query(`update reports set reviewed_at=now(),moderation_revision=999 where id=$1`, [uid(10)]);
    assert.equal((await db.query('select moderation_revision from reports')).rows[0].moderation_revision, 1);
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 1);
    await db.query(`update reports set status='dismissed',moderation_action='warn_both',moderation_notes='Internal private note' where id=$1`, [uid(10)]);
    rows = (await db.query(`select * from notifications where meta->>'report_revision'='2' order by user_id`)).rows;
    assert.deepEqual(rows.map(r=>r.user_id), [reporter, owner]);
    assert.ok(rows.every(r=>!r.message.includes('Internal private note')));
    await db.exec(`update reports set status='pending',moderation_action='manual_review',escalation_status='manual_review';
      update reports set status='resolved',moderation_action='none',escalation_status='none';`);
    assert.equal((await db.query(`select count(*)::int as n from notifications where meta->>'report_revision'='3'`)).rows[0].n, 2);
    assert.equal((await db.query(`select count(*)::int as n from notifications where meta->>'report_revision'='4'`)).rows[0].n, 1);
    await db.exec(read(`${app}/supabase/migrations/${migration}`));
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 6);
  });
  test(`${app}: notification failures roll back outcome and revision; explicit rollback also removes notifications`, async () => {
    await db.exec(`create function reject_notification() returns trigger language plpgsql as $$ begin raise exception 'fixture notification failure'; end $$;
      create trigger reject_notification before insert on notifications for each row execute function reject_notification();`);
    await assert.rejects(db.exec(`update reports set status='dismissed'`), /fixture notification failure/);
    assert.equal((await db.query('select status,moderation_revision from reports')).rows[0].status, 'resolved');
    assert.equal((await db.query('select moderation_revision from reports')).rows[0].moderation_revision, 4);
    await db.exec('drop trigger reject_notification on notifications;');
    await db.exec('begin; update reports set status=\'dismissed\'; rollback;');
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 6);
  });
  test(`${app}: account actions notify owner once per revision; one recipient with both roles gets one notice`, async () => {
    await db.exec(`update reports set target_account_action='ban_7_days';`);
    let rows = (await db.query(`select * from notifications where meta->>'report_revision'='5'`)).rows;
    assert.equal(rows.length, 2); assert.match(rows.find(r=>r.user_id===owner).message, /banned for 7 days/);
    await db.exec(`update reports set target_account_action_expires_at=now()+interval '7 days',reviewed_at=now();`);
    assert.equal((await db.query('select moderation_revision from reports')).rows[0].moderation_revision, 5);
    await db.exec(`update reports set target_account_action='lift_ban';`);
    rows = (await db.query(`select * from notifications where meta->>'report_revision'='6'`)).rows;
    assert.equal(rows.find(r=>r.user_id===owner).type, 'success');
    await db.exec(`update reports set reporter_id='${owner}',moderation_action='warn_both';`);
    rows = (await db.query(`select * from notifications where meta->>'report_revision'='7'`)).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].user_id, owner);
  });
  test(`${app}: owner resolution covers every target type, group fallback and missing/deleted targets`, async () => {
    await db.exec(`insert into groups values ('${uid(20)}','${owner}'),('${uid(21)}',null);
      insert into group_members values ('${uid(21)}','${stranger}','member'),('${uid(21)}','${owner}','leader');
      insert into studios values ('${uid(20)}','${owner}'); insert into studio_bookings values ('${uid(20)}','${uid(20)}');
      insert into gigs values ('${uid(20)}','${owner}'); insert into products values ('${uid(20)}','${owner}');
      insert into playlists values ('${uid(20)}','${owner}'); insert into feed_posts values ('${uid(20)}','${owner}');`);
    for (const target of ['group','studio','venue','booking','gig','product','playlist','feed_post']) {
      assert.equal((await db.query(`select report_notification_owner($1,$2) as id`,[target,uid(20)])).rows[0].id,owner);
    }
    assert.equal((await db.query(`select report_notification_owner('group',$1) as id`,[uid(21)])).rows[0].id,owner);
    await db.exec('delete from group_members;');
    await db.exec(`insert into group_roster_members values ('${uid(21)}','${owner}','leader');`);
    assert.equal((await db.query(`select report_notification_owner('group',$1) as id`,[uid(21)])).rows[0].id,owner);
    assert.equal((await db.query(`select report_notification_owner('group',$1) as id`,[uid(22)])).rows[0].id,null);
    assert.equal((await db.query(`select report_notification_owner('unknown',$1) as id`,[uid(20)])).rows[0].id,null);
  });
  test(`${app}: RLS keeps inbox and unread counts private; clients cannot call the target-owner helper`, async () => {
    await db.exec(read('web/supabase/migrations/20260519140000_harden_notifications_user_isolation.sql'));
    await db.exec(`grant usage on schema public,auth to authenticated; grant select on notifications to authenticated;
      select set_config('test.user','${owner}',false); set role authenticated;`);
    const rows = (await db.query('select user_id from notifications where read=false')).rows;
    assert.ok(rows.length > 0); assert.ok(rows.every(r=>r.user_id===owner));
    await assert.rejects(db.query(`select report_notification_owner('profile',$1)`,[stranger]),/permission denied/);
    await db.exec(`reset role; select set_config('test.user','${stranger}',false); set role authenticated;`);
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n,0);
    await db.exec('reset role;');
  });
}

const flush = () => new Promise(resolve=>setImmediate(resolve));
test('admin handler saves through the transaction, skips duplicate client inserts, and denies non-admin or invalid sessions', async () => {
  const db=databases[1];
  await db.exec(`insert into reports(id,reporter_id,target_type,target_id) values ('${uid(99)}','${reporter}','profile','${owner}');`);
  let actor=admin, invoke, emails=0;
  const client={auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})},from(table){
    const filters=[];let update,one=false;
    const query=new Proxy({}, {get(_,method){
      if(method==='then')return (resolve,reject)=>{
        const run=async()=>{
          const params=[];const where=filters.map(([field,value])=>{params.push(value);return `${field}=$${params.length}`;});
          let sql=`select * from ${table}`;
          if(update){
            const set=Object.entries(update).map(([field,value])=>{params.push(value);return `${field}=$${params.length}`;});
            sql=`update ${table} set ${set.join(',')}`;
          }
          sql+=where.length?` where ${where.join(' and ')}`:'';if(update)sql+=' returning *';
          const result=await db.query(sql,params);
          return {data:one?result.rows[0]||null:result.rows,error:null};
        };run().then(resolve,reject);
      };
      return (...args)=>{
        if(method==='insert')throw new Error('Admin must not insert report notifications separately');
        if(method==='eq')filters.push(args);
        if(method==='contains'){filters.push(["meta->>'event_type'",args[1].event_type],["meta->>'report_id'",args[1].report_id],["meta->>'report_revision'",String(args[1].report_revision)]);}
        if(method==='update')update=args[0];
        if(['single','maybeSingle'].includes(method))one=true;
        return query;
      };
    }});return query;
  }};
  vm.runInNewContext(compile(read('web/supabase/functions/admin-reports-management/index.ts')),{
    exports:{},console,Response,Request,Deno:{env:{get:()=> 'fixture'}},
    require:name=>name.includes('/http/server')?{serve:fn=>{invoke=fn;}}
      :name.includes('supabase-js')?{createClient:()=>client}
      :name.includes('coreActionEmail')?{scheduleCoreActionEmailForNotification:()=>{emails++;}}:{}
  });
  const body={action:'update_report_status',reportId:uid(99),nextStatus:'resolved',moderationAction:'warn_both'};
  const call=()=>invoke(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify(body)}));
  const first=await call();assert.equal(first.status,200);assert.equal((await first.json()).item.moderation_revision,1);
  assert.equal(emails,2);assert.equal((await call()).status,200);assert.equal(emails,2);
  assert.equal((await db.query(`select count(*)::int as n from notifications where meta->>'report_id'=$1`,[uid(99)])).rows[0].n,2);
  actor=stranger;assert.equal((await call()).status,403);actor=null;assert.equal((await call()).status,401);
});

test('unread badge refreshes on events, reconnect/resume and rejects stale users and responses', async () => {
  let cursor=0, effects=[], pending=[], state=[], requestSlots=[], listener, status, change, removed=0;
  const channel={on(_,options,cb){assert.match(options.filter,/user_id=eq\./); change=cb;return channel;},subscribe(cb){status=cb;return channel;}};
  const exports={};
  vm.runInNewContext(compile(read('mobile/src/hooks/useUnreadNotifications.ts')), {
    exports, queueMicrotask, require:name=>name==='react'?{
      useState(initial){const i=cursor++;state[i]??=initial;return [state[i],v=>{state[i]=v;}];},
      useRef(initial){return requestSlots[cursor++]??={current:initial};},
      useCallback:fn=>fn, useEffect:fn=>effects.push(fn),
    }:name==='expo-router'?{useFocusEffect:fn=>effects.push(fn)}
      :name==='react-native'?{AppState:{addEventListener(_,fn){listener=fn;return {remove(){}};}}}
      :name.includes('/supabase')?{prepareRealtimeAuth:async()=>true,supabase:{
        functions:{invoke:(_,options)=>new Promise(resolve=>pending.push({resolve,user:options.body.userId}))},
        channel:()=>channel,removeChannel(){removed++;}}}
      :{createRealtimeChannelTopic:v=>v},
  });
  let cleanup;
  function render(user='neil', enabled=true, mount=false){
    cursor=0;effects=[];const value=exports.useUnreadNotifications(user,enabled);
    if(mount){cleanup?.();cleanup=effects[0]();}return value;
  }
  assert.equal(render('neil',true,true).hasUnread,false); await flush();
  pending.shift().resolve({data:{count:0}});await flush();
  status('SUBSCRIBED'); pending.shift().resolve({data:{count:1}});await flush();
  assert.equal(render().hasUnread,true);
  change();const older=pending.shift();change();pending.shift().resolve({data:{count:0}});await flush();
  older.resolve({data:{count:5}});await flush();assert.equal(render().hasUnread,false);
  listener('active');pending.shift().resolve({data:{count:2}});await flush();assert.equal(render().hasUnread,true);
  status('SUBSCRIBED');const stale=pending.shift();
  assert.equal(render('jared',true,true).hasUnread,false); await flush();
  stale.resolve({data:{count:20}});pending.shift().resolve({data:{count:0}});await flush();
  assert.equal(render('jared').hasUnread,false);
  change(); pending.shift().resolve({error:new Error('offline')});await flush();assert.equal(render('jared').hasUnread,false);
  assert.equal(render('jared',false,true).hasUnread,false);await flush();cleanup?.();assert.equal(removed,2);
});

test('inbox invalidates within five seconds of an event and recovers on reconnect/resume',async()=>{
  const effects=[],events=new Map(),invalidations=[],timers=[];let status,appState;
  const channel={on(_,options,fn){events.set(options.table,fn);return channel;},subscribe(fn){status=fn;return channel;}};
  const exports={};
  vm.runInNewContext(compile(read('mobile/src/data/realtime.ts')),{
    exports,setTimeout(fn,ms){assert.ok(ms<5000);timers.push(fn);return timers.length;},clearTimeout(){},
    require:name=>name==='react'?{useEffect:fn=>effects.push(fn),useRef:initial=>({current:initial})}
      :name==='react-native'?{AppState:{currentState:'active',addEventListener(_,fn){appState=fn;return {remove(){}};}}}
      :name.includes('/supabase')?{prepareRealtimeAuth:async()=>true,supabase:{channel:()=>channel,removeChannel(){}}}
      :name==='./queryKeys'?{queryKeys:{bookings:{summary:user=>['bookings',user]},notifications:{list:user=>['notifications',user]},wallet:{summary:user=>['wallet',user]}}}
      :{createRealtimeChannelTopic:v=>v},
  });
  exports.useGlobalRealtimeInvalidation({invalidateQueries:opts=>invalidations.push(opts.queryKey)},'neil');
  const cleanups=effects.map(fn=>fn());await flush();
  status('SUBSCRIBED');events.get('notifications')();timers.shift()();appState('background');appState('active');status('SUBSCRIBED');
  assert.equal(invalidations.filter(key=>key[0]==='notifications').length,4);
  cleanups.forEach(fn=>fn?.());status('SUBSCRIBED');assert.equal(invalidations.filter(key=>key[0]==='notifications').length,4);
});
