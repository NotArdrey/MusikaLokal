import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto, createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const migration = '20261007180000_record_online_studio_payments.sql';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const payer = uid(1), owner = uid(2), stranger = uid(3), studio = uid(4);
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(path, imports = {}, globals = {}, suffix = '') {
  const exports = {};
  vm.runInNewContext(compile(read(path)+suffix), {exports,require:name=>{
    if (!(name in imports)) throw new Error('Unexpected import '+name); return imports[name];
  },console,Date, ...globals});
  return exports;
}
const history = load('mobile/supabase/functions/_shared/studioPaymentHistory.ts');
const ui = load('mobile/src/utils/walletHistory.ts');
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(read('mobile/supabase/migrations/'+migration),read('web/supabase/migrations/'+migration));
assert.equal(read('mobile/supabase/functions/paymongo/index.ts'),read('web/supabase/functions/paymongo/index.ts'));

async function database(app) {
  const db = new PGlite();
  await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid', true),'')::uuid$$;
    create table profiles(id uuid primary key, role text);
    create table studios(id uuid primary key, owner_id uuid references profiles(id), name text);
    create table studio_bookings(id uuid primary key, user_id uuid references profiles(id), studio_id uuid references studios(id),
      final_price numeric, payment_amount numeric, remaining_balance numeric default 0, status text default 'pending', payment_status text default 'pending',
      payment_type text default 'full', payment_method text, checkout_session_id text, payment_intent_id text, paid_at timestamptz, refund_id text,
      refund_amount numeric, refunded_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
    create table wallets(id uuid primary key default gen_random_uuid(), user_id uuid unique references profiles(id), balance numeric default 0, updated_at timestamptz default now());
    create table wallet_transactions(id uuid primary key default gen_random_uuid(), wallet_id uuid references wallets(id), amount numeric not null,
      type text, description text, reference_id uuid, reference_type text, is_credit boolean, status text default 'completed', created_at timestamptz default now());
    grant usage on schema auth,public to anon,authenticated,service_role;
    insert into profiles values('${payer}','musician'),('${owner}','studio-owner'),('${stranger}','musician');
    insert into studios values('${studio}','${owner}','Fixture Studio');
    insert into wallets(user_id,balance) values('${payer}',42),('${owner}',100);
    insert into studio_bookings(id,user_id,studio_id,final_price,payment_amount,remaining_balance,payment_type,payment_status,paid_at,checkout_session_id,payment_method) values
      ('${uid(90)}','${payer}','${studio}',6000,6000,0,'full','paid','2026-10-01','cs_old_full','qrph'),
      ('${uid(91)}','${payer}','${studio}',1000,500,0,'downpayment','paid','2026-10-02','cs_old_installment','qrph'),
      ('${uid(92)}','${payer}','${studio}',1000,1000,0,'downpayment','paid','2026-10-03','cs_cash_balance','qrph'),
      ('${uid(93)}','${payer}','${studio}',1000,500,500,'downpayment','pending',null,'cs_unpaid','qrph'),
      ('${uid(94)}','${payer}','${studio}',1000,500,500,'downpayment','partial','2026-10-04','cs_old_down','qrph');
    insert into wallet_transactions(wallet_id,amount,type,reference_id,reference_type,is_credit) select id,500,'earning','${uid(92)}','booking_downpayment',true from wallets where user_id='${owner}';
    insert into wallet_transactions(wallet_id,amount,type,reference_id,reference_type,is_credit) select id,500,'earning','${uid(92)}','booking_balance',true from wallets where user_id='${owner}';`);
  const before = (await db.query('select jsonb_agg(to_jsonb(b) order by id) as rows from studio_bookings b')).rows[0].rows;
  const balances = (await db.query('select user_id,balance from wallets order by user_id')).rows;
  await db.exec(read(`${app}/supabase/migrations/${migration}`));
  assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(b) order by id) as rows from studio_bookings b')).rows[0].rows,before);
  assert.deepEqual((await db.query('select user_id,balance from wallets order by user_id')).rows,balances);
  return db;
}
const book = async (db,id,{price=6000,amount=price,remaining=0,stage='full',session='cs_'+id,paymentStatus='pending',status='pending',user=payer}={}) => {
  await db.query(`insert into studio_bookings(id,user_id,studio_id,final_price,payment_amount,remaining_balance,payment_type,checkout_session_id,payment_status,status)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[uid(id),user,studio,price,amount,remaining,stage,session,paymentStatus,status]);
};
const confirm = async (db,ids,{ref='pay_'+ids[0],stage='full',amount=6000,session='cs_'+ids[0],intent='pi_'+ids[0]}={}) =>
  (await db.query('select confirm_online_studio_payment($1,$2,$3,$4,$5,$6,$7,$8) as result',[
    ref,ids.map(uid),stage,amount,'qrph','2026-10-07T03:00:00Z',session,intent])).rows[0].result;
const refund = async (db,ids,{ref='ref_'+ids[0],payment='pay_'+ids[0],amount=3000}={}) =>
  (await db.query('select record_online_studio_refund($1,$2,$3,$4,$5) as result',[
    ref,payment,ids.map(uid),amount,'2026-10-07T04:00:00Z'])).rows[0].result;
const state = async db => (await db.query(`select jsonb_build_object(
  'bookings',(select jsonb_agg(to_jsonb(b) order by id) from studio_bookings b),
  'events',(select jsonb_agg(to_jsonb(e) order by id) from studio_payment_events e),
  'wallets',(select jsonb_agg(to_jsonb(w) order by id) from wallets w),
  'transactions',(select jsonb_agg(to_jsonb(w) order by id) from wallet_transactions w)) as result`)).rows[0].result;
for (const app of ['mobile','web']) test(`${app}: online payment database acceptance`,async t=>{
  const db=await database(app);
  try {
    await t.test('historical reconciliation preserves balances, excludes pending, and does not invent installment dates',async()=>{
      const rows=(await db.query('select booking_id,stage,amount,occurred_at,is_historical from studio_payment_events order by booking_id')).rows;
      assert.equal(rows.length,4); assert.deepEqual(rows.map(r=>[r.stage,Number(r.amount)]),[['full',6000],['historical',1000],['historical',500],['downpayment',500]]);
      assert.equal(rows[1].occurred_at.toISOString(),'2026-10-02T00:00:00.000Z');
      assert.ok(rows.every(r=>r.is_historical));
    });
    await t.test('PHP 6000 is stored once, only owner earnings change a wallet, and recreation reads the same event',async()=>{
      await book(db,10); const result=await confirm(db,[10]); assert.deepEqual(result.booking_ids,[uid(10)]);
      const rows=(await db.query('select * from studio_payment_events where booking_id=$1',[uid(10)])).rows;
      assert.equal(rows.length,1); assert.equal(Number(rows[0].amount),6000);
      const wallets=(await db.query('select user_id,balance from wallets order by user_id')).rows;
      assert.equal(Number(wallets[0].balance),42); assert.equal(Number(wallets[1].balance),6100);
      const saved=await state(db); assert.equal((await confirm(db,[10])).already_recorded,true); assert.deepEqual(await state(db),saved);
      assert.equal(history.mergeWalletPaymentHistory([],rows)[0].amount,6000);
    });
    await t.test('one provider payment aggregates multiple booking allocations once and preserves cents',async()=>{
      await book(db,11,{price:1000.01,session:'cs_batch'}); await book(db,12,{price:2000.02,session:'cs_batch'});
      await confirm(db,[12,11,11],{amount:3000.03,session:'cs_batch',ref:'pay_batch'});
      const rows=(await db.query("select * from studio_payment_events where provider_reference='pay_batch'")).rows;
      const merged=history.mergeWalletPaymentHistory([],rows); assert.equal(merged.length,1); assert.equal(merged[0].amount,3000.03);
      assert.equal(merged[0].booking_ids.length,2); assert.equal((await confirm(db,[11,12],{amount:3000.03,session:'cs_batch',ref:'pay_batch'})).already_recorded,true);
    });
    await t.test('downpayment then balance keep accurate amounts, stages, original downpayment, and retries',async()=>{
      await book(db,13,{amount:3000,remaining:3000,stage:'downpayment'});
      await confirm(db,[13],{stage:'downpayment',amount:3000});
      await db.query("update studio_bookings set checkout_session_id='cs_balance',payment_status='pending' where id=$1",[uid(13)]);
      await confirm(db,[13],{stage:'balance',amount:3000,session:'cs_balance',ref:'pay_balance'});
      const b=(await db.query('select * from studio_bookings where id=$1',[uid(13)])).rows[0];
      assert.equal(b.payment_status,'paid'); assert.equal(Number(b.remaining_balance),0); assert.equal(Number(b.payment_amount),3000);
      const events=(await db.query('select stage,amount from studio_payment_events where booking_id=$1 order by occurred_at,stage',[uid(13)])).rows;
      assert.deepEqual(events.map(e=>[e.stage,Number(e.amount)]),[['balance',3000],['downpayment',3000]]);
      const saved=await state(db); await confirm(db,[13],{stage:'downpayment',amount:3000}); assert.deepEqual(await state(db),saved);
    });
    await t.test('a historical confirmed downpayment can pay its balance without replaying old earnings',async()=>{
      const saved=await state(db); assert.equal((await confirm(db,[90],{ref:'pay_old',session:'cs_old_full'})).already_recorded,true); assert.deepEqual(await state(db),saved);
      await db.query("update studio_bookings set checkout_session_id='cs_old_balance',payment_status='pending' where id=$1",[uid(94)]);
      await confirm(db,[94],{stage:'balance',amount:500,session:'cs_old_balance',ref:'pay_old_balance'});
      assert.equal(Number((await db.query('select sum(amount) as amount from studio_payment_events where booking_id=$1',[uid(94)])).rows[0].amount),1000);
    });
    await t.test('missing bookings, cross-payer batches, superseded sessions, altered references, and underpayment roll back completely',async()=>{
      await book(db,14); await book(db,15,{session:'cs_14',user:stranger});
      for(const [ids,options,pattern] of [
        [[14,999],{},/BOOKING_NOT_FOUND/],[[14,15],{amount:12000},/PAYMENT_PAYER_MISMATCH/],
        [[14],{session:'cs_stale'},/PAYMENT_TARGET_MISMATCH/],[[14],{amount:1},/PAYMENT_AMOUNT_MISMATCH/],
        [[14],{ref:'pay_10'},/PAYMENT_REFERENCE_MISMATCH/],[[10],{ref:'pay_10',amount:5},/PAYMENT_REFERENCE_MISMATCH/],
        [[10],{ref:'pay_other'},/PAYMENT_STAGE_ALREADY_RECORDED/],
      ]) { const saved=await state(db); await assert.rejects(confirm(db,ids,options),pattern); assert.deepEqual(await state(db),saved); }
    });
    await t.test('financial failure cannot leave paid bookings or history without owner credits',async()=>{
      await book(db,16);
      await db.exec(`create function fixture_fail_earning() returns trigger language plpgsql as $$begin raise exception 'fixture finance failure'; end$$;
        create trigger fixture_fail before insert on wallet_transactions for each row execute function fixture_fail_earning();`);
      const saved=await state(db); await assert.rejects(confirm(db,[16]),/fixture finance failure/); assert.deepEqual(await state(db),saved);
      await db.exec('drop trigger fixture_fail on wallet_transactions; drop function fixture_fail_earning();');
    });
    await t.test('late confirmation records payment but keeps cancelled/completed lifecycle state',async()=>{
      await book(db,17,{status:'cancelled'}); await confirm(db,[17]);
      await book(db,18,{status:'completed'}); await confirm(db,[18]);
      assert.deepEqual((await db.query('select status from studio_bookings where id=any($1) order by id',[[uid(17),uid(18)]])).rows.map(r=>r.status),['cancelled','completed']);
    });
    await t.test('successful external refunds atomically reverse owner earnings, preserve payer balance, and deduplicate retries',async()=>{
      const payerBalance=(await db.query('select balance from wallets where user_id=$1',[payer])).rows[0].balance;
      const ownerBefore=Number((await db.query('select balance from wallets where user_id=$1',[owner])).rows[0].balance);
      await refund(db,[10]);
      assert.equal(Number((await db.query('select balance from wallets where user_id=$1',[owner])).rows[0].balance),ownerBefore-3000);
      assert.equal((await db.query('select balance from wallets where user_id=$1',[payer])).rows[0].balance,payerBalance);
      const saved=await state(db); assert.equal((await refund(db,[10])).already_recorded,true); assert.deepEqual(await state(db),saved);
      await assert.rejects(refund(db,[10],{ref:'ref_over',amount:3001}),/REFUND_EXCEEDS_PAYMENT/); assert.deepEqual(await state(db),saved);
      await assert.rejects(refund(db,[11],{ref:'ref_10',payment:'pay_batch'}),/REFUND_REFERENCE_MISMATCH/); assert.deepEqual(await state(db),saved);
    });
    await t.test('refund financial failure rolls back booking state and event',async()=>{
      await db.exec(`create function fixture_fail_refund() returns trigger language plpgsql as $$begin raise exception 'fixture refund failure'; end$$;
        create trigger fixture_fail before insert on wallet_transactions for each row execute function fixture_fail_refund();`);
      const saved=await state(db); await assert.rejects(refund(db,[17]),/fixture refund failure/); assert.deepEqual(await state(db),saved);
      await db.exec('drop trigger fixture_fail on wallet_transactions; drop function fixture_fail_refund();');
    });
    await t.test('payer-only history RLS and service-only financial RPCs prevent spoofed confirmations',async()=>{
      await db.exec(`set role authenticated; set test.uid='${stranger}';`);
      assert.equal((await db.query('select count(*) as count from studio_payment_events')).rows[0].count,0);
      await assert.rejects(confirm(db,[16]),/permission denied/);
      await assert.rejects(refund(db,[17]),/permission denied/);
      await assert.rejects(db.query('delete from studio_payment_events'),/permission denied/);
      await db.exec(`set test.uid='${payer}';`); assert.ok((await db.query('select count(*) as count from studio_payment_events')).rows[0].count>0);
      await db.exec('reset role;');
    });
    await t.test('history limits whole payments without dropping allocations from a large batch',async()=>{
      await db.exec(`insert into studio_bookings(id,user_id,studio_id,final_price,payment_amount)
        select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${payer}','${studio}',1,1 from generate_series(1000,1249) n;
        insert into studio_payment_events(booking_id,user_id,provider_reference,stage,amount,occurred_at)
        select id,user_id,'pay_large_batch','full',1,'2026-10-09' from studio_bookings where id>='${uid(1000)}';`);
      const events=(await db.query('select get_online_studio_payment_events($1,1) as result',[payer])).rows[0].result;
      assert.equal(events.length,250);const merged=history.mergeWalletPaymentHistory([],events);
      assert.equal(merged.length,1);assert.equal(merged[0].amount,250);
    });
  } finally {await db.close();}
});

test('wallet Payments filter excludes earnings, labels external spending and historical totals, and preserves stable ordering',()=>{
  const rows=history.mergeWalletPaymentHistory([{id:'wallet',type:'earning',reference_type:'booking_payment',amount:6000,is_credit:true,created_at:'2026-10-07'}],[
    {id:'a',booking_id:uid(10),provider_reference:'pay_a',stage:'full',amount:6000,payment_method:'qrph',occurred_at:'2026-10-07'},
    {id:'b',booking_id:uid(11),provider_reference:'old',stage:'historical',amount:1000,is_historical:true,occurred_at:null},
    {id:'c',booking_id:uid(10),provider_reference:'ref_a',stage:'refund',amount:3000,payment_method:'qrph',occurred_at:'2026-10-08'},
  ]);
  assert.equal(ui.filterWalletTransactions(rows,'payments').length,2);
  assert.equal(ui.getTransactionCategoryLabel(rows.find(r=>r.is_historical)),'Historical payment total');
  assert.equal(ui.getExternalPaymentLabel(rows.find(r=>r.type==='payment'&&!r.is_historical)),'Paid via QR Ph');
  assert.equal(rows[0].type,'refund'); assert.equal(rows.at(-1).created_at,null);
  assert.equal(ui.filterWalletTransactions(rows,'refund').length,1);
  assert.equal(ui.filterWalletTransactions(rows,'booking_payment').length,2);
});

test('only a paid PHP provider payment becomes confirmed history',()=>{
  const payment={id:'pay_fixture',attributes:{status:'paid',currency:'PHP',amount:600000,source:{type:'qrph'},paid_at:1791342000}};
  assert.equal(history.getConfirmedProviderPayment(payment).amount,6000);
  for(const patch of [{status:'failed'},{status:'pending'},{currency:'USD'},{amount:1.5},{amount:0}])
    assert.throws(()=>history.getConfirmedProviderPayment({...payment,attributes:{...payment.attributes,...patch}}),/not been confirmed/);
});

test('production webhook handler accepts signed provider envelopes, rejects missing/invalid signatures, and shares confirmation across three paths',async()=>{
  let handler; let calls=[];
  const query = table => {
    let single=false;
    const chain={select(){return chain;},eq(){return chain;},in(){return chain;},limit(){return chain;},maybeSingle(){single=true;return chain;},single(){single=true;return chain;},
      then(resolve){return Promise.resolve({data:single?{payment_type:'full',checkout_session_id:'cs_fixture'}:[],error:null}).then(resolve);}};
    return chain;
  };
  const client={from:query,rpc:async(name,args)=>{calls.push({name,args});return{data:{booking_ids:[],already_recorded:true},error:null};},auth:{getUser:async()=>({data:{user:{id:payer}},error:null})}};
  const payment={id:'pay_fixture',type:'payment',attributes:{status:'paid',currency:'PHP',amount:600000,paid_at:1791342000,source:{type:'qrph'},payment_intent_id:'pi_fixture',metadata:{booking_id:uid(10),payment_type:'full'}}};
  load('mobile/supabase/functions/paymongo/index.ts',{
    'https://deno.land/std@0.168.0/http/server.ts':{serve:fn=>handler=fn},
    'https://esm.sh/@supabase/supabase-js@2':{createClient:()=>client},
    'https://deno.land/std@0.168.0/crypto/mod.ts':{crypto:webcrypto},
    '../_shared/studioPaymentHistory.ts':history,
    '../_shared/notificationRoutes.ts':{withNotificationRouteMeta:x=>x},
    '../_shared/coreActionEmail.ts':{scheduleCoreActionEmailForNotification:()=>{}},
  },{Deno:{env:{get:key=>key==='PAYMONGO_WEBHOOK_SECRET'?'fixture-secret':'fixture'}},TextEncoder,Request,Response,URL,btoa,
    fetch:async()=>new Response(JSON.stringify({data:{id:'cs_fixture',attributes:{payments:[payment],metadata:payment.attributes.metadata}}})),
  });
  const event={data:{type:'event',attributes:{type:'payment.paid',data:payment}}};
  const body=JSON.stringify(event),signature=createHmac('sha256','fixture-secret').update('123.'+body).digest('hex');
  const request=headers=>new Request('https://fixture.invalid/paymongo',{method:'POST',body,headers:{'Content-Type':'application/json',...headers}});
  assert.equal((await handler(request({}))).status,401);
  assert.equal((await handler(request({'paymongo-signature':'t=123,te=invalid'}))).status,401);
  assert.equal((await handler(request({'paymongo-signature':`t=123,te=${signature}`}))).status,200);
  assert.equal(calls.length,1); assert.equal(calls[0].name,'confirm_online_studio_payment'); assert.equal(calls[0].args.p_amount,6000);
  assert.equal(calls[0].args.p_payment_id,'pay_fixture');
  const source=read('mobile/supabase/functions/paymongo/index.ts');
  assert.equal(source.match(/await applyProviderBookingPayment/g).length,4);
  assert.ok(!source.includes('async function creditOwnerWallet'));
});

test('real payment and wallet handlers execute against the migrated database',async t=>{
  const db=await database('mobile');
  await db.exec('create table payout_methods(id uuid,user_id uuid,is_default boolean); create table withdrawal_requests(id uuid,user_id uuid,created_at timestamptz);');
  let actor=payer, handler, walletHandler, notifications=0, chargedAmount;
  const client={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},
    from(table){
      const where=[],args=[];let single=false,limit=null,values=null;
      const chain={select(){return chain;},eq(key,value){args.push(value);where.push(`${key}=$${args.length}`);return chain;},
        in(key,ids){args.push(ids);where.push(`${key}=any($${args.length})`);return chain;},
        gt(key,value){args.push(value);where.push(`${key}>$${args.length}`);return chain;},
        neq(key,value){args.push(value);where.push(`${key}<>$${args.length}`);return chain;},
        is(key,value){assert.equal(value,null);where.push(`${key} is null`);return chain;},
        order(){return chain;},limit(value){limit=value;return chain;},single(){single=true;return chain;},maybeSingle(){single=true;return chain;},
        update(value){values=value;return chain;},insert(){assert.equal(table,'notifications');notifications++;return Promise.resolve({error:null});},
        async then(resolve){
          if(table==='studios_with_stats') return resolve({data:[],error:null});
          try {
            let result;
            if(values){const count=args.length;const sets=Object.entries(values).map(([key,value],i)=>{args.push(value);return `${key}=$${count+i+1}`;});
              result=await db.query(`update ${table} set ${sets.join(',')} ${where.length?'where '+where.join(' and '):''} returning *`,args);
            }else result=await db.query(`select * from ${table} ${where.length?'where '+where.join(' and '):''} ${limit?'limit '+limit:''}`,args);
            const rows=[];
            for(const row of result.rows){if(table==='studio_bookings')row.studio=(await db.query('select * from studios where id=$1',[row.studio_id])).rows[0];rows.push(row);}
            return resolve({data:single?rows[0]||null:rows,error:null});
          }catch(error){return resolve({data:null,error:{message:error.message}});}
        },
      };return chain;
    },
    async rpc(name,args){try{
      let data;
      if(name==='confirm_online_studio_payment')data=(await db.query('select confirm_online_studio_payment($1,$2,$3,$4,$5,$6,$7,$8) as result',[
        args.p_payment_id,args.p_booking_ids,args.p_stage,args.p_amount,args.p_payment_method,args.p_paid_at,args.p_checkout_session_id,args.p_payment_intent_id])).rows[0].result;
      else if(name==='record_online_studio_refund')data=(await db.query('select record_online_studio_refund($1,$2,$3,$4,$5) as result',[
        args.p_refund_id,args.p_payment_id,args.p_booking_ids,args.p_amount,args.p_refunded_at])).rows[0].result;
      else if(name==='get_online_studio_payment_events')data=(await db.query('select get_online_studio_payment_events($1) as result',[args.p_user_id])).rows[0].result;
      else throw new Error(name);
      return{data,error:null};
    }catch(error){return{data:null,error:{message:error.message}};}},
  };
  const payment={id:'pay_real_handler',type:'payment',attributes:{status:'paid',currency:'PHP',amount:600000,paid_at:1791342000,source:{type:'qrph'},payment_intent_id:'pi_20'}};
  const metadata={booking_id:uid(20),payment_type:'full'};
  const imports={
    'https://deno.land/std@0.168.0/http/server.ts':{serve:fn=>handler=fn},
    'https://esm.sh/@supabase/supabase-js@2':{createClient:()=>client},
    'https://deno.land/std@0.168.0/crypto/mod.ts':{crypto:webcrypto},
    '../_shared/studioPaymentHistory.ts':history,
    '../_shared/notificationRoutes.ts':{withNotificationRouteMeta:x=>x},
    '../_shared/coreActionEmail.ts':{scheduleCoreActionEmailForNotification:()=>{}},
  };
  const globals={Deno:{env:{get:key=>key==='PAYMONGO_WEBHOOK_SECRET'?'fixture-secret':'fixture'}},TextEncoder,Request,Response,URL,btoa,
    fetch:async(url,options)=>{
      if(options?.method==='POST')chargedAmount=JSON.parse(options.body).data.attributes.line_items[0].amount;
      return new Response(JSON.stringify({data:{id:'cs_20',attributes:{checkout_url:'https://fixture.invalid/checkout',payments:[payment],metadata,payment_intent:{id:'pi_20',attributes:{status:'succeeded'}}}}}));
    },
  };
  load('mobile/supabase/functions/paymongo/index.ts',imports,globals);
  load('mobile/supabase/functions/withdrawals/index.ts',{...imports,'https://deno.land/std@0.168.0/http/server.ts':{serve:fn=>walletHandler=fn}},globals);
  const post=(fn,body)=>fn(new Request('https://fixture.invalid/function',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)}));
  const webhook=async(type,data)=>{const body=JSON.stringify({data:{type:'event',attributes:{type,data}}});
    const signature=createHmac('sha256','fixture-secret').update('123.'+body).digest('hex');
    return handler(new Request('https://fixture.invalid/function',{method:'POST',body,headers:{'paymongo-signature':`t=123,li=, te=${signature}`}}));};
  try {
    await book(db,20);
    await t.test('checkout prices come from saved bookings and the intent is linked before a direct payment event arrives',async()=>{
      const response=await post(handler,{action:'create_checkout',booking_id:uid(20),user_id:payer,amount:1,payment_type:'full'});
      assert.equal(response.status,200);assert.equal(chargedAmount,600000);
      assert.equal((await db.query('select payment_intent_id from studio_bookings where id=$1',[uid(20)])).rows[0].payment_intent_id,'pi_20');
    });
    await t.test('direct payment webhook, poll, checkout webhook, and redirect save one history record and one owner earning',async()=>{
      assert.equal((await webhook('payment.paid',payment)).status,200);
      const response=await post(handler,{action:'check_payment',booking_id:uid(20)});assert.equal(response.status,200);assert.equal((await response.json()).payment_status,'paid');
      const saved=await state(db);assert.equal(notifications,2);
      assert.equal((await webhook('checkout_session.payment.paid',{id:'cs_20',attributes:{metadata,payments:[payment],payment_intent:{id:'pi_20'}}})).status,200);
      assert.equal((await handler(new Request('https://fixture.invalid/function?action=payment_success&booking_id='+uid(20)))).status,302);
      assert.deepEqual(await state(db),saved);assert.equal(notifications,2);
    });
    await t.test('late failed and cancellation callbacks cannot downgrade or remove confirmed history',async()=>{
      const saved=await state(db);
      assert.equal((await webhook('payment.failed',{id:'pay_failed',attributes:{metadata}})).status,200);
      assert.equal((await handler(new Request('https://fixture.invalid/function?action=payment_cancelled&booking_id='+uid(20)))).status,302);
      assert.deepEqual(await state(db),saved);
    });
    await t.test('wallet summary shows PHP 6000 once with the original balance and rejects a different payer',async()=>{
      const response=await post(walletHandler,{action:'get_wallet_summary'});assert.equal(response.status,200);const result=await response.json();
      assert.equal(Number(result.balance),42);const records=result.transactions.filter(tx=>tx.reference_id===uid(20));assert.equal(records.length,1);
      assert.equal(records[0].amount,6000);assert.equal(records[0].affects_wallet_balance,false);
      actor=stranger;const denied=await post(handler,{action:'check_payment',checkout_session_id:'cs_20'});assert.equal(denied.status,403);
      actor=payer;
    });
    await t.test('pending refunds create no completed history; successful and repeated signed refunds atomically record one refund',async()=>{
      const refundResource={id:'ref_real_handler',type:'refund',attributes:{amount:300000,currency:'PHP',payment_id:payment.id,metadata:{booking_id:uid(20)},status:'pending',updated_at:1791345600}};
      const saved=await state(db);assert.equal((await webhook('payment.refund.updated',refundResource)).status,200);assert.deepEqual(await state(db),saved);
      refundResource.attributes.status='succeeded';assert.equal((await webhook('payment.refunded',refundResource)).status,200);
      const refunded=await state(db);assert.equal((await webhook('payment.refund.updated',refundResource)).status,200);assert.deepEqual(await state(db),refunded);
      const result=await (await post(walletHandler,{action:'get_wallet_summary'})).json();const records=result.transactions.filter(tx=>tx.reference_id===uid(20));
      assert.equal(records.length,2);assert.equal(records.find(tx=>tx.type==='refund').amount,3000);assert.equal(Number(result.balance),42);
    });
  }finally{await db.close();}
});
