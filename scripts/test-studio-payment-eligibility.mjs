import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read=path=>readFileSync(path,'utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const customer=uid(1),other=uid(2),studio=uid(10),secondStudio=uid(11);
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const databases=[];after(async()=>{for(const db of databases)await db.close();});
const migration='20261007153000_enforce_studio_payment_eligibility.sql';
assert.equal(read(`mobile/supabase/migrations/${migration}`),read(`web/supabase/migrations/${migration}`));
const reservation=(studioId=studio,date='2026-10-22',slots=[{start:'10:00',end:'11:00'}])=>({payload:{
  studio_id:studioId,booking_date:date,start_time:slots[0].start,end_time:slots.at(-1).end,
  session_type:'rehearsal',base_rate:500,hours:slots.length,subtotal:500*slots.length,
  final_price:500*slots.length,modifiers_applied:{},notes:'Fixture'},slots});
for(const app of ['mobile','web']){
 let db;
 const create=async(requests,user=customer)=>(await db.query('select create_studio_reservation_batch($1,$2) as result',[user,JSON.stringify(requests)])).rows[0].result;
 const eligible=async(user=customer)=>{await db.query("select set_config('test.user',$1,false)",[user]);return (await db.query('select get_studio_payment_eligibility() as result')).rows[0].result;};
 test(`${app}: one transaction creates all days and ordered slots; a new studio is blocked with affected bookings and Pay Now`,async()=>{
  db=new PGlite();databases.push(db);
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    create table profiles(id uuid primary key);create table studios(id uuid primary key,name text);
    create table studio_bookings(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles(id),studio_id uuid not null references studios(id),
      booking_date date,start_time time,end_time time,notes text,status text default 'pending',payment_status text default 'unpaid',
      session_type text,base_rate numeric,hours numeric,subtotal numeric,modifiers_applied jsonb,final_price numeric,
      payment_amount numeric default 0,remaining_balance numeric default 0,cancellation_policy_id uuid,cancellation_policy_snapshot jsonb,created_at timestamptz default now());
    create table studio_booking_slots(id uuid default gen_random_uuid(),booking_id uuid references studio_bookings(id) on delete cascade,
      start_time time,end_time time,sort_order integer,check(end_time>start_time));
    insert into profiles values('${customer}'),('${other}');insert into studios values('${studio}','Studio A'),('${secondStudio}','Studio B');`);
  await db.exec(read(`${app}/supabase/migrations/${migration}`));
  await db.exec(read(`${app}/supabase/migrations/20261007153500_avoid_studio_eligibility_fk_deadlocks.sql`));
  assert.match((await db.query("select pg_get_functiondef('enforce_studio_payment_eligibility()'::regprocedure) as body")).rows[0].body,/for no key update/);
  assert.equal((await eligible()).eligible,true);
  const rows=await create([reservation(),reservation(studio,'2026-10-23',[{start:'10:00',end:'11:00'},{start:'14:00',end:'15:00'}])]);
  assert.equal(rows.length,2);assert.ok(rows.every(b=>b.user_id===customer&&b.payment_status==='unpaid'));
  const slots=(await db.query('select start_time,sort_order from studio_booking_slots where booking_id=$1 order by sort_order',[rows[1].id])).rows;
  assert.deepEqual(slots.map(s=>s.start_time),['10:00:00','14:00:00']);assert.deepEqual(slots.map(s=>s.sort_order),[0,1]);
  await assert.rejects(create([reservation(secondStudio)]),error=>{
    assert.equal(error.message,'OUTSTANDING_STUDIO_PAYMENT');const detail=JSON.parse(error.detail);
    assert.equal(detail.bookings.length,2);assert.equal(detail.bookings[0].studio_name,'Studio A');assert.equal(detail.pay_now.pathname,'/bookings');return true;
  });
  assert.equal((await db.query('select count(*)::int as n from studio_bookings')).rows[0].n,2);
  const state=await eligible();assert.equal(state.eligible,false);assert.equal(state.code,'OUTSTANDING_STUDIO_PAYMENT');
 });
 test(`${app}: downpayments, failed checkouts and positive balances block; payment and cancellation restore eligibility`,async()=>{
  await db.exec("update studio_bookings set payment_status='partial',payment_amount=200,remaining_balance=final_price-200,status='confirmed';");
  await assert.rejects(create([reservation(secondStudio)]),/OUTSTANDING_STUDIO_PAYMENT/);
  assert.deepEqual((await eligible()).bookings.map(b=>b.remaining_balance).sort((a,b)=>a-b),[300,800]);
  await db.exec("update studio_bookings set payment_status='paid',payment_amount=final_price,remaining_balance=0;");
  assert.equal((await eligible()).eligible,true);
  const rows=await create([reservation(secondStudio)]);assert.equal(rows.length,1);
  await db.exec("update studio_bookings set payment_status='failed' where studio_id='"+secondStudio+"';");
  assert.equal((await eligible()).eligible,false);
  await db.exec("update studio_bookings set payment_status='pending',payment_amount=final_price where studio_id='"+secondStudio+"';");
  assert.equal((await eligible()).eligible,false,'an unconfirmed checkout blocks even when its intended payment amount is filled in');
  await db.exec("update studio_bookings set status='cancelled' where studio_id='"+secondStudio+"';");
  assert.equal((await eligible()).eligible,true);
  await db.exec("update studio_bookings set remaining_balance=50 where studio_id='"+studio+"';");
  assert.equal((await eligible()).eligible,false,'positive balance blocks even if payment status says paid');
  await db.exec('update studio_bookings set remaining_balance=0;');
  assert.equal((await eligible()).eligible,true);
 });
 test(`${app}: invalid later slots roll back the complete batch and cannot leave unpaid ghost reservations`,async()=>{
  const before=(await db.query('select count(*)::int as n from studio_bookings')).rows[0].n;
  await assert.rejects(create([reservation(),reservation(secondStudio,'2026-10-24',[{start:'12:00',end:'11:00'}])]),/check constraint/);
  assert.equal((await db.query('select count(*)::int as n from studio_bookings')).rows[0].n,before);
  assert.equal((await eligible()).eligible,true);
 });
 test(`${app}: direct inserts and reused batch IDs cannot bypass enforcement; a single statement permits multiple new rows`,async()=>{
  await db.exec(`insert into studio_bookings(user_id,studio_id,final_price,modifiers_applied) values
    ('${other}','${studio}',500,'{"batch_id":"reused"}'),('${other}','${secondStudio}',500,'{"batch_id":"reused"}');`);
  await assert.rejects(db.exec(`insert into studio_bookings(user_id,studio_id,final_price,modifiers_applied) values
    ('${other}','${secondStudio}',500,'{"batch_id":"reused"}')`),/OUTSTANDING_STUDIO_PAYMENT/);
  await db.exec(`update studio_bookings set status='cancelled' where user_id='${other}';`);
  await db.exec(`insert into studio_bookings(user_id,studio_id,final_price) values('${other}','${secondStudio}',500);`);
  await db.exec(read(`${app}/supabase/migrations/${migration}`));
  assert.equal((await eligible(other)).bookings.length,1);
 });
 test(`${app}: public eligibility reads only the signed-in user; clients cannot supply server-priced batches`,async()=>{
  await db.exec(`grant usage on schema public,auth to authenticated;set role authenticated;`);
  const state=await eligible(customer);assert.equal(state.eligible,true);assert.equal(state.bookings.length,0);
  assert.equal((await eligible(other)).bookings.length,1);
  await assert.rejects(create([reservation()],other),/permission denied/);
  await assert.rejects(db.query('select outstanding_studio_payments($1)',[other]),/permission denied/);
  await db.query("select set_config('test.user','',false)");await assert.rejects(db.query('select get_studio_payment_eligibility()'),/Authentication required/);
  await db.exec('reset role;');
 });
}

for(const app of ['mobile','web']){
 test(`${app}: real booking handler prepares every session before writing, prices server-side, and returns the structured block`,async()=>{
  let invoke,actor=customer,calls=[],blocked=false;
  const client={auth:{getUser:async()=>({data:{user:actor?{id:actor}:null}})},
    from(table){let one=false;const filters=[];const query=new Proxy({}, {get(_,method){
      if(method==='then')return resolve=>{
        let data=table==='studios'?{id:filters.find(f=>f[0]==='id')?.[1],name:'Fixture',hourly_rate:500,recording_rate:500}
          :table==='studio_settings'?{lead_time_hours:0,booking_horizon_days:90,min_booking_duration_hours:1}
          :table==='profiles'?{id:actor,role:'musician'}:table==='studio_operating_hours'?[{is_open:true,start_time:'00:00',end_time:'23:59'}]:[];
        if(one&&Array.isArray(data))data=data[0]||null;
        resolve({data,error:null});
      };
      return (...args)=>{if(method==='eq')filters.push(args);if(['single','maybeSingle'].includes(method))one=true;return query;};
    }});return query;},
    async rpc(name,args){
      if(name==='are_slots_available')return {data:true,error:null};
      if(name==='calculate_multi_slot_price')return {data:[{base_rate:500,hours:1,subtotal:500,final_price:500}],error:null};
      if(name==='apply_studio_promotion')return {data:null,error:null};
      if(name==='create_studio_reservation_batch'){
        calls.push(args);return blocked?{error:{message:'OUTSTANDING_STUDIO_PAYMENT',details:JSON.stringify({code:'OUTSTANDING_STUDIO_PAYMENT',bookings:[{id:uid(80)}],pay_now:{pathname:'/bookings'}})}}
          :{data:args.p_reservations.map((r,i)=>({...r.payload,id:uid(70+i)})),error:null};
      }return {data:null,error:null};
    },
  };
  const NativeDate=Date;
  class FixtureDate extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-07T04:00:00Z']));}static now(){return new NativeDate('2026-10-07T04:00:00Z').getTime();}}
  vm.runInNewContext(compile(read(`${app}/supabase/functions/manage-bookings/index.ts`)),{
    exports:{},console,Response,Request,Date:FixtureDate,Deno:{env:{get:()=> 'fixture'}},
    require:name=>name.includes('/http/server')?{serve:fn=>{invoke=fn;}}:name.includes('supabase-js')?{createClient:()=>client}:{}
  });
  const single={studio_id:studio,user_id:customer,date:'2026-10-22',time_slots:[{start:'10:00',end:'11:00'}],session_type:'rehearsal',final_price:1};
  const call=body=>invoke(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify(body)}));
  const response=await call({action:'create',reservations:[single,{...single,date:'2026-10-23'}]});assert.equal(response.status,201);
  assert.equal((await response.json()).bookings.length,2);assert.equal(calls.length,1);assert.equal(calls[0].p_reservations[0].payload.final_price,500);
  assert.equal(calls[0].p_user_id,customer);
  calls=[];const invalid=await call({action:'create',reservations:[single,{...single,user_id:other}]});assert.equal(invalid.status,403);assert.equal(calls.length,0,'later validation failure creates no earlier reservations');
  blocked=true;const block=await call({action:'create',...single});assert.equal(block.status,409);const payload=await block.json();
  assert.equal(payload.code,'OUTSTANDING_STUDIO_PAYMENT');assert.equal(payload.bookings[0].id,uid(80));assert.equal(payload.pay_now.pathname,'/bookings');
  blocked=false;const legacy=await call({action:'create',...single});assert.equal(legacy.status,201);assert.ok((await legacy.json()).id,'single-session callers keep the legacy response');
  actor=null;assert.equal((await call({action:'create',...single})).status,401);
 });
 test(`${app}: actual submit callback sends one multi-session request and presents Pay Now on a server block`,async()=>{
  const source=read(`${app}/src/components/listingDetails/StudioBookTab.tsx`);
  const ast=ts.createSourceFile('StudioBookTab.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let batchTry;
  function walk(node){if(ts.isTryStatement(node)&&node.tryBlock.getText(ast).includes('const reservations = bookings.map'))batchTry=node;ts.forEachChild(node,walk);}walk(ast);assert.ok(batchTry);
  let requests=[],alerts=[],navigations=[],refreshes=0;
  const bookings=[{date:'2026-10-22',startTime:'10:00',endTime:'11:00',session_type:'rehearsal'},
    {date:'2026-10-23',timeSlots:[{start:'10:00',end:'11:00'},{start:'14:00',end:'15:00'}],session_type:'recording',songCount:2}];
  const execute=async(block=false)=>{
    const results=[],errors=[];
    await vm.runInNewContext(compile(`(async()=>{${batchTry.getText(ast)}})()`),{
      bookings,group:{id:studio},bookingUserId:customer,bookingAccessToken:'fixture',bookingNotes:'fixture',results,errors,
      toDateKey:v=>v,toTimeLabel:v=>v,getBookingSessionType:b=>b.session_type,getBookingSongCount:b=>b.songCount,
      invokeManageBookingsCreate:async body=>{requests.push(body);return block?{error:{serverError:{code:'OUTSTANDING_STUDIO_PAYMENT',error:'Outstanding payment'}}}:{data:{bookings:body.reservations.map((b,i)=>({id:uid(50+i)}))}};},
      setLoading(){},paymentEligibility:{refresh:()=>{refreshes++;}},showAlert:(...args)=>alerts.push(args),
      sheetRef:{current:{dismiss(){}}},router:{push:target=>navigations.push(target)},
    });return {results,errors};
  };
  assert.equal((await execute()).results.length,2);assert.equal(requests.length,1);assert.equal(requests[0].reservations.length,2);
  assert.equal(requests[0].reservations[1].time_slots.length,2);
  assert.equal((await execute(true)).results.length,0);assert.equal(refreshes,1);assert.equal(alerts[0][1],'Outstanding Studio Payment');
  alerts[0][3].find(b=>b.text==='Pay Now').onPress();assert.equal(navigations[0].pathname,'/bookings');
 });

 test(`${app}: eligibility refreshes across studios, reconnect and resume; old users and slower responses cannot overwrite it`,async()=>{
  const exports={},state=[],refs=[],pending=[];let cursor=0,effects=[],status,event,resume,cleanup;
  const channel={on(_,options,callback){assert.equal(options.table,'studio_bookings');assert.match(options.filter,/user_id=eq\./);event=callback;return channel;},subscribe(callback){status=callback;return channel;}};
  vm.runInNewContext(compile(read(`${app}/src/hooks/useStudioPaymentEligibility.ts`)),{
    exports,queueMicrotask,require:name=>name==='react'?{
      useState(initial){const i=cursor++;state[i]??=initial;return [state[i],value=>{state[i]=value;}];},
      useRef(initial){return refs[cursor++]??={current:initial};},useCallback:fn=>fn,useEffect:fn=>effects.push(fn),
    }:name==='react-native'?{AppState:{addEventListener(_,fn){resume=fn;return {remove(){}};}}}
      :name.includes('/supabase')?{prepareRealtimeAuth:async()=>true,supabase:{rpc:()=>new Promise(resolve=>pending.push(resolve)),channel:()=>channel,removeChannel(){}}}
      :{createRealtimeChannelTopic:value=>value},
  });
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const render=(user=customer,mount=false)=>{cursor=0;effects=[];const result=exports.useStudioPaymentEligibility(user);if(mount){cleanup?.();cleanup=effects[0]();}return result;};
  render(customer,true);await flush();pending.shift()({data:{bookings:[{id:uid(99),studio_id:secondStudio}]}});await flush();assert.equal(render().hasOutstanding,true);
  event();const old=pending.shift();event();pending.shift()({data:{bookings:[]}});await flush();old({data:{bookings:[{id:uid(99)}]}});await flush();assert.equal(render().hasOutstanding,false);
  status('SUBSCRIBED');pending.shift()({data:{bookings:[{id:uid(99)}]}});await flush();assert.equal(render().hasOutstanding,true);
  resume('active');const stale=pending.shift();assert.equal(render(other,true).hasOutstanding,false);await flush();
  stale({data:{bookings:[{id:uid(99)}]}});pending.shift()({data:{bookings:[]}});await flush();assert.equal(render(other).hasOutstanding,false);cleanup();
 });
}
