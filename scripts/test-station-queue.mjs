import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = uid(1), owner = uid(2), member = uid(3), stationId = uid(4);
const p1 = uid(10), p2 = uid(11), a = uid(20), b = uid(21), c = uid(22), restricted = uid(23), noAudio = uid(24);
const migration = '20261007170000_persist_station_playback_queue.sql';
const compile = source => ts.transpileModule(source, {compilerOptions: {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.React}}).outputText;
function load(path, requires = {}, globals = {}, suffix = '') {
  const exports = {};
  vm.runInNewContext(compile(read(path) + suffix), {exports, require:name => {
    if (!(name in requires)) throw new Error('Unexpected import: ' + name);
    return requires[name];
  }, console, Date, ...globals});
  return exports;
}
const queue = load('mobile/src/utils/stationQueue.ts');
const timeline = load('mobile/src/utils/radioTimeline.ts', {'./stationQueue':queue});
const editor = load('web/src/utils/stationQueueEditor.ts');
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(read('mobile/supabase/migrations/'+migration), read('web/supabase/migrations/'+migration));
assert.equal(read('mobile/supabase/functions/manage-playlists/index.ts'), read('web/supabase/functions/manage-playlists/index.ts'));

async function database(app) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    create table profiles(id uuid primary key, role text, full_name text, avatar_url text);
    create table groups(id uuid primary key, name text, group_type text, genre text);
    create table playlists(id uuid primary key, creator_id uuid, title text, is_hidden boolean default false, visibility text default 'public', created_at timestamptz default now(), updated_at timestamptz default now());
    create table playlist_teaser_assets(id uuid primary key, storage_path text, screen_result text, duration_seconds numeric);
    create table playlist_items(id uuid primary key, playlist_id uuid references playlists(id), title text, position integer, audio_url text, duration_seconds numeric,
      teaser_asset_id uuid references playlist_teaser_assets(id), copyright_status text default 'not_required');
    create table stations(id uuid primary key default gen_random_uuid(), creator_id uuid references profiles(id), managed_profile_id uuid, managed_group_id uuid,
      name text, description text, genre text, cover_image_url text, is_active boolean default true, is_featured boolean default false, rotation_interval_minutes integer default 15,
      stream_url text, stream_status text, now_playing_title text, now_playing_artist text, last_seen_live_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz default now());
    create table station_playlist_slots(id uuid primary key default gen_random_uuid(), station_id uuid references stations(id) on delete cascade, playlist_id uuid references playlists(id),
      position integer, is_active boolean default true, label text, starts_at timestamptz, ends_at timestamptz, created_at timestamptz default now());
    insert into profiles(id,role,full_name) values('${admin}','admin','Admin'),('${owner}','musician','Artist'),('${member}','musician','Listener');
    insert into playlists(id,creator_id,title) values('${p1}','${owner}','Playlist One'),('${p2}','${owner}','Playlist Two');
    insert into playlist_items(id,playlist_id,title,position,audio_url,duration_seconds,copyright_status) values
      ('${a}','${p1}','Alpha',0,'https://fixture.invalid/a.mp3',60,'not_required'),
      ('${b}','${p1}','Beta',1,'https://fixture.invalid/b.mp3',90,'approved'),
      ('${c}','${p2}','Charlie',0,'https://fixture.invalid/c.mp3',120,'not_required'),
      ('${restricted}','${p1}','Restricted',2,'https://fixture.invalid/restricted.mp3',60,'pending_review'),
      ('${noAudio}','${p2}','No Audio',1,null,60,'not_required');
    insert into stations(id,creator_id,managed_profile_id,name,created_at,updated_at) values('${stationId}','${owner}','${owner}','Legacy Radio','2026-10-01','2026-10-01');
    insert into station_playlist_slots(station_id,playlist_id,position,created_at) values('${stationId}','${p1}',0,'2026-10-01'),('${stationId}','${p2}',1,'2026-10-01');
    alter table stations enable row level security;
    create policy station_read on stations for select using(is_active or creator_id=auth.uid());
    create policy station_write on stations for all to authenticated using(creator_id=auth.uid()) with check(creator_id=auth.uid());
    grant usage on schema public,auth to authenticated,anon; grant select on profiles,stations to anon,authenticated; grant insert,update on stations to authenticated;`);
  const before = (await db.query('select to_jsonb(s) as row from stations s')).rows[0].row;
  await db.exec(read(`${app}/supabase/migrations/${migration}`));
  const after = (await db.query("select to_jsonb(s)-'queue_item_ids'-'queue_revision'-'queue_anchor_at' as row from stations s")).rows[0].row;
  assert.deepEqual(after,before,'additive migration preserves legacy station contents');
  return db;
}
const patch = {managed_profile_id:owner, managed_group_id:null, name:'Artist Radio', is_active:true, rotation_interval_minutes:15};
const save = async (db, ids = [a,b,c], playlists = [p1,p2], actor = admin, id = stationId) => (await db.query(
  'select admin_save_station_queue($1,$2,$3,$4,$5) as result',[actor,id,JSON.stringify(patch),playlists,ids])).rows[0].result;
const snapshot = async db => (await db.query('select get_station_playback_snapshot($1) as result',[stationId])).rows[0].result;

for (const app of ['mobile','web']) test(`${app}: persisted station queue`, async t => {
  const db = await database(app);
  try {
    await t.test('legacy stations keep their order and repeated migration does not change business rows', async () => {
      const station = (await snapshot(db)).station;
      assert.equal(station.queue_item_ids,null); assert.equal(station.queue_revision,0); assert.equal(station.queue_anchor_at,null);
      const first = await snapshot(db); await db.exec(read(`${app}/supabase/migrations/${migration}`)); assert.deepEqual(await snapshot(db),first);
    });
    await t.test('selection and shuffled order are persisted once for every listener; playlist order is independent', async () => {
      const station = await save(db,[c,b,a],[p2,p1]);
      assert.deepEqual(station.queue_item_ids,[c,b,a]); assert.equal(station.queue_revision,1); assert.ok(station.queue_anchor_at);
      const saved = await snapshot(db); assert.deepEqual(saved.slots.map(slot => slot.playlist_id),[p2,p1]);
      const entries = queue.getStationQueueEntries({...saved.station,slots:saved.slots}); assert.deepEqual(plain(entries.map(entry => entry.item.id)),[c,b,a]);
      const recreated = await snapshot(db); assert.deepEqual(recreated,saved);
    });
    await t.test('invalid, duplicate, restricted, silent, hidden, and cross-playlist tracks cannot partially save', async () => {
      const before=await snapshot(db);
      for(const ids of [[a,a],[restricted],[noAudio],[uid(999)],[a,c]]) {
        await assert.rejects(save(db,ids,[p1]),/unavailable|outside/);
        assert.deepEqual(await snapshot(db),before);
      }
      await db.query('update playlists set is_hidden=true where id=$1',[p2]);
      await assert.rejects(save(db),/playlist is unavailable/);
      await db.query('update playlists set is_hidden=false where id=$1',[p2]);
      await assert.rejects(save(db,[]),/playable track/);
    });
    await t.test('a later slot failure rolls back queue order, revision, anchor, name, and all slots', async () => {
      await db.exec(`create function fail_slot() returns trigger language plpgsql as $$begin if new.playlist_id='${p2}' then raise exception 'Fixture slot failure'; end if; return new; end$$;
        create trigger fail_slot before insert on station_playlist_slots for each row execute function fail_slot();`);
      const before=await snapshot(db); await assert.rejects(save(db,[a,b,c]),/Fixture slot failure/); assert.deepEqual(await snapshot(db),before);
      await db.exec('drop trigger fail_slot on station_playlist_slots; drop function fail_slot();');
    });
    await t.test('playlist-only callers flatten playable tracks in the requested order; edits start a new revision', async () => {
      const before=(await snapshot(db)).station; const station=await save(db,null,[p1,p2]);
      assert.deepEqual(station.queue_item_ids,[a,b,c]); assert.equal(station.queue_revision,before.queue_revision+1);
      assert.ok(Date.parse(station.queue_anchor_at)>=Date.parse(before.queue_anchor_at));
    });
    await t.test('RPC writes and snapshots are service-only; non-admins and direct queue-field changes are denied', async () => {
      await assert.rejects(save(db,[a], [p1], member),/Admin role required/);
      await db.query("select set_config('test.uid',$1,false)",[admin]); await db.exec('set role authenticated;');
      try {
        await assert.rejects(save(db),/permission denied/); await assert.rejects(snapshot(db),/permission denied/);
        await assert.rejects(db.query("update stations set queue_item_ids=$1,queue_revision=999 where id=$2",[[a],stationId]),/admin service/);
      } finally {await db.exec('reset role;');}
    });
    await t.test('current restrictions and missing tracks disappear from the playback snapshot without rewriting saved order', async () => {
      await db.query("update playlist_items set copyright_status='declined' where id=$1",[b]);
      await db.query('delete from playlist_items where id=$1',[c]);
      const result=await snapshot(db); const entries=queue.getStationQueueEntries({...result.station, slots:result.slots});
      assert.deepEqual(plain(entries.map(entry=>entry.item.id)),[a]); assert.deepEqual(result.station.queue_item_ids,[a,b,c]);
    });
    await t.test('legacy add/remove controls retain track exclusions, append new tracks, and permit an empty queue atomically', async () => {
      await db.query("update playlist_items set copyright_status='approved' where id=$1",[b]);
      await save(db,[b],[p1]);
      const change=async (playlistId,remove) => (await db.query('select admin_change_station_playlist($1,$2,$3,$4,$5) as result',
        [admin,stationId,playlistId,remove,JSON.stringify({label:'New slot'})])).rows[0].result;
      await change(p2,false);assert.deepEqual((await snapshot(db)).station.queue_item_ids,[b]);
      const revision=(await snapshot(db)).station.queue_revision;await change(p2,false);assert.equal((await snapshot(db)).station.queue_revision,revision);
      await change(p1,true);assert.deepEqual((await snapshot(db)).station.queue_item_ids,[]);
      await change(p1,false);assert.deepEqual((await snapshot(db)).station.queue_item_ids,[a,b]);
      await change(p1,true);await change(p2,true);assert.equal((await snapshot(db)).slots.length,0);
    });
  } finally {await db.close();}
});

test('editor helpers include/exclude tracks, reorder playlists/tracks, shuffle without mutating, and restore exact saved order', () => {
  const playlists=[{id:p1,items:[{id:a},{id:b}]},{id:p2,items:[{id:c}]}];
  let selection=editor.createStationSelection([p1,p2],playlists,[c,a]); assert.deepEqual(plain(selection.trackIds),[c,a]);
  selection=editor.toggleStationPlaylist(selection,playlists[0]); assert.deepEqual(plain(selection),{playlistIds:[p2],trackIds:[c]});
  selection=editor.toggleStationPlaylist(selection,playlists[0]); assert.deepEqual(plain(selection.trackIds),[c,a,b]);
  selection=editor.moveStationPlaylist(selection,playlists,p1,-1); assert.deepEqual(plain(selection.trackIds),[a,b,c]);
  assert.deepEqual(plain(editor.moveQueueItem(selection.trackIds,c,-1)),[a,c,b]);
  const shuffled=editor.shuffleStationQueue(selection.trackIds,()=>0); assert.deepEqual(plain(shuffled),[b,c,a]);
  assert.deepEqual(plain(selection.trackIds),[a,b,c]); assert.deepEqual([...shuffled].sort(),[a,b,c].sort());
  assert.deepEqual(plain(editor.createStationSelection([p1],playlists,null).trackIds),[a,b]);
  assert.deepEqual(plain(editor.createStationSelection([p1],playlists,[]).trackIds),[]);
});

const slots=[{id:'slot1',playlist:{id:p1,title:'One',items:[{id:a,title:'Alpha',audio_url:'https://fixture.invalid/a.mp3',duration_seconds:60},{id:b,title:'Beta',audio_url:'https://fixture.invalid/b.mp3',duration_seconds:90}]}},
  {id:'slot2',playlist:{id:p2,title:'Two',items:[{id:c,title:'Charlie',audio_url:'https://fixture.invalid/c.mp3',duration_seconds:120}]}}];
const anchor='2026-10-07T05:00:00Z';
const station={id:stationId,slots,live_slots:slots,queue_item_ids:[c,a,b],queue_revision:7,queue_anchor_at:anchor,__queueReady:true,
  playback_queue:[{slot_id:'slot2',item_index:0,item:slots[1].playlist.items[0]},{slot_id:'slot1',item_index:0,item:slots[0].playlist.items[0]},
    {slot_id:'slot1',item_index:1,item:slots[0].playlist.items[1]}]};

test('both clients share the saved shuffled timeline, Now Playing and Up Next across track/loop boundaries', () => {
  for(const app of ['mobile','web']) {
    const helper=load(`${app}/src/utils/stationQueue.ts`);
    const clock=load(`${app}/src/utils/radioTimeline.ts`,{'./stationQueue':helper});
    for(const [seconds,id,position] of [[0,c,0],[119,c,119],[120,a,0],[185,b,5],[270,c,0]]) {
      const listener1=clock.getStationLiveTimelineState(station,Date.parse(anchor)+seconds*1000);
      const listener2=clock.getStationLiveTimelineState(plain(station),Date.parse(anchor)+seconds*1000);
      assert.deepEqual(plain(listener1),plain(listener2)); assert.equal(listener1.item.id,id); assert.equal(listener1.positionSeconds,position);
      assert.equal(helper.getStationQueueEntries(station)[listener1.queueIndex].item.id,id);
    }
  }
});

test('stale revisions and partial summaries cannot relabel loaded playback; expiring signed URL tokens do not restart audio', () => {
  assert.equal(queue.mergeStationSnapshot(station,{...station,queue_revision:6}),station);
  const merged=queue.mergeStationSnapshot(station,{id:stationId,queue_revision:8,queue_anchor_at:'later',name:'Renamed',slots:[],__queueReady:false});
  assert.equal(merged.name,'Renamed'); assert.equal(merged.queue_revision,7); assert.equal(merged.slots,slots);
  const renewed=plain(station);renewed.playback_queue[0].item.audio_url+='?token=renewed';
  assert.equal(queue.getStationQueueFingerprint(station),queue.getStationQueueFingerprint(renewed));
  assert.notEqual(queue.getStationQueueFingerprint(station),queue.getStationQueueFingerprint({...station,queue_revision:8}));
  assert.equal(queue.getStationQueueEntries({...station,playback_queue:[]}).length,0);
});

for(const app of ['mobile','web']) test(`${app}: actual refresh hook serializes events and rejects responses after station changes or unmount`, async () => {
  let effect,refs=[],refIndex=0,channelCallback,subscribed,resume,interval,removed=0,calls=0,pending=[];
  const supabase={functions:{invoke:()=>{calls++;return new Promise(resolve=>pending.push(resolve));}},
    channel:()=>({on(_event,_filter,callback){channelCallback=callback;return this;},subscribe(callback){subscribed=callback;return this;}}),removeChannel:()=>{removed++;}};
  const exports=load(`${app}/src/hooks/useStationQueueRefresh.ts`,{
    react:{useId:()=> 'fixture',useRef:value=>refs[refIndex++]|| (refs[refIndex-1]={current:value}),useEffect:fn=>{effect=fn;}},
    'react-native':{AppState:{addEventListener:(_event,fn)=>{resume=fn;return {remove(){removed++;}};}}},
    '../../lib/supabase':{supabase},
  },{setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{removed++;}});
  const snapshots=[];exports.useStationQueueRefresh(stationId,value=>snapshots.push(value));const cleanup=effect();
  assert.equal(calls,1);channelCallback();subscribed('SUBSCRIBED');resume('active');interval();assert.equal(calls,1);
  pending.shift()({data:{data:station},error:null});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);assert.equal(snapshots.length,1);
  cleanup();pending.shift()({data:{data:{...station,queue_revision:8}},error:null});await new Promise(resolve=>setImmediate(resolve));assert.equal(snapshots.length,1);assert.equal(removed,3);
  refIndex=0;exports.useStationQueueRefresh('changed',value=>snapshots.push(value));const newCleanup=effect();
  pending.shift()({data:{data:{id:'changed'}},error:null});await new Promise(resolve=>setImmediate(resolve));assert.equal(snapshots.at(-1).id,'changed');
  interval();pending.shift()({data:null,error:{context:{status:404}}});await new Promise(resolve=>setImmediate(resolve));assert.equal(snapshots.at(-1).__queueUnavailable,true);
  newCleanup();
});

for(const app of ['mobile','web']) test(`${app}: production player builds and seeks the authoritative shuffled queue`, async () => {
  const supabase={storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:path}}),createSignedUrl:async path=>({data:{signedUrl:path}})})}};
  const module=app==='mobile' ? load('mobile/src/audio/radioTrackPlayer.ts', {
    './safeTrackPlayer':{default:{},AppKilledPlaybackBehavior:{},Capability:{},IOSCategory:{}}, '../../lib/supabase':{supabase}, '../utils/stationQueue':queue,
  }) : load('web/src/context/RadioPlayerContext.tsx',{
    react:{createContext:()=>({})}, '../../lib/supabase':{supabase}, '../utils/stationQueue':queue,'../hooks/useStationQueueRefresh':{},
  }, {}, '\nexport {buildStationQueue, getLiveStationCursor};');
  const tracks=await module.buildStationQueue(station);assert.deepEqual(plain(tracks.map(track=>track.itemId)),[c,a,b]);
  if(app==='mobile') {
    const cursor=module.getLiveStationCursor(station,tracks,Date.parse(anchor)+185_000);assert.equal(tracks[cursor.queueIndex].itemId,b);assert.equal(cursor.positionSeconds,5);
    assert.deepEqual(plain((await module.buildStationQueue(station,{onlyQueueIndex:1})).map(track=>[track.itemId,track.queueIndex])),[[a,1]]);
  } else {
    // Web's cursor reads Date.now; fix only the clock while executing its real function.
    const NativeDate=Date;class FixedDate extends NativeDate {static now(){return Date.parse(anchor)+185_000;}}
    const fixed=load('web/src/context/RadioPlayerContext.tsx',{
      react:{createContext:()=>({})},'../../lib/supabase':{supabase},'../utils/stationQueue':queue,'../hooks/useStationQueueRefresh':{},
    },{Date:FixedDate},'\nexport {getLiveStationCursor};');
    const cursor=fixed.getLiveStationCursor(station,tracks);assert.equal(tracks[cursor.queueIndex].itemId,b);assert.equal(cursor.positionSeconds,5);
  }
});

for(const app of ['mobile','web']) test(`${app}: production refresh callback replaces audio on new revisions and rejects stale playback requests`, async () => {
  const source=read(`${app}/src/context/RadioPlayerContext.tsx`);const ast=ts.createSourceFile('player.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback;const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='syncStationData')callback=node.initializer.arguments[0];ts.forEachChild(node,visit);};visit(ast);assert.ok(callback);
  let requestId=0,applied=[],pending=[];
  const activeStationRef={current:plain(station)},preparedQueueRef={current:{}};
  const globals={activeStationRef,preparedQueueRef,playWhenReadyRef:{current:true},audioRef:{current:{paused:false,pause(){},removeAttribute(){},load(){}}},
    requestIdRef:{get current(){return requestId;}},getStationQueueFingerprint:queue.getStationQueueFingerprint,mergeStationSnapshot:queue.mergeStationSnapshot,
    beginPlaybackRequest:()=>++requestId,beginRequest:()=>++requestId,isPlaybackRequestCurrent:id=>id===requestId,
    setActiveStation:value=>{activeStationRef.current=value;},buildStationQueue:data=>new Promise(resolve=>pending.push(()=>resolve(queue.getStationQueueEntries(data)))),
    getLiveStationCursor:()=>({queueIndex:0,positionSeconds:3}),
    applyPlayerQueue:async (data,tracks,index,playing,id,position)=>{applied.push({data,tracks,index,playing,id,position});activeStationRef.current=data;},
    setQueueState:(data,tracks,index)=>{applied.push({data,tracks,index});activeStationRef.current=data;},playQueueIndex:async()=>{},setIsPlaying(){},console,
  };
  const sync=vm.runInNewContext(compile('('+callback.getText(ast)+')'),globals);
  sync({...station,name:'Renamed'});assert.equal(activeStationRef.current.name,'Renamed');assert.equal(applied.length,0);
  sync({...station,queue_revision:8});assert.equal(pending.length,1);pending.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(applied.length,1);
  assert.equal(applied[0].data.queue_revision,8);assert.deepEqual(plain(applied[0].tracks.map(entry=>entry.item.id)),[c,a,b]);
  if(app==='mobile')assert.equal(applied[0].playing,true);
  sync({...station,queue_revision:6});assert.equal(pending.length,0);
  sync({id:stationId,__queueUnavailable:true});pending.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(applied.length,2);assert.equal(applied[1].tracks.length,0);assert.equal(activeStationRef.current.is_active,false);
  sync({...station,queue_revision:9});requestId++;activeStationRef.current={id:'changed'};pending.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(applied.length,2);
});

test('native prepared audio is discarded when a revision or current playable track list changes', () => {
  const source=read('mobile/src/context/RadioPlayerContext.tsx'),ast=ts.createSourceFile('player.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback;const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='getPreparedQueueForStation')callback=node.initializer.arguments[0];ts.forEachChild(node,visit);};visit(ast);
  const tracks=[{itemId:c}], preparedQueueRef={current:{stationId,key:'fixture',queueIndex:0,queueRevision:7,queueItemIds:JSON.stringify([c,a,b]),queue:tracks,preparedAt:Date.now()}};
  const getPrepared=vm.runInNewContext(compile('('+callback.getText(ast)+')'),{Date,preparedQueueRef,getRadioPrepareKey:()=> 'fixture',
    getStationQueueEntries:queue.getStationQueueEntries,RADIO_PREPARED_QUEUE_TTL_MS:45000});
  assert.equal(getPrepared(station,0),tracks);
  assert.equal(getPrepared({...station,queue_revision:8},0),null);
  assert.equal(getPrepared({...station,playback_queue:station.playback_queue.slice(1)},0),null);
});

for(const app of ['mobile','web']) test(`${app}: production admin handler persists selected order and returns one playable snapshot; guests cannot edit`, async () => {
  const db=await database(app);let actor=admin,handler;
  const client={auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})},storage:{from:()=>({createSignedUrl:async path=>({data:{signedUrl:'https://fixture.invalid/'+path}})})},
    from(table){let single=false,limit=Infinity;const filters=[],orders=[];
      const query=new Proxy({}, {get(_target,method){if(method==='then')return (resolve,reject)=>{(async()=>{
        let rows=table==='group_playlists'?[]:(await db.query('select * from '+table)).rows;
        for(const [key,value,mode] of filters)rows=rows.filter(row=>mode==='in'?value.includes(row[key]):row[key]===value);
        for(const [key,options] of orders.reverse())rows.sort((left,right)=>(left[key]<right[key]?-1:left[key]>right[key]?1:0)*(options?.ascending===false?-1:1));
        rows=rows.slice(0,limit);return {data:single?rows[0]||null:rows,error:null};
      })().then(resolve,reject);};return (...args)=>{if(['eq','is','in'].includes(method))filters.push([args[0],args[1],method]);
        if(['single','maybeSingle'].includes(method))single=true;if(method==='limit')limit=args[0];if(method==='order')orders.push(args);return query;};}});return query;},
    async rpc(name,args){try {const data=name==='get_station_playback_snapshot'
      ? (await db.query('select get_station_playback_snapshot($1) as result',[args.p_station_id])).rows[0].result
      : name==='admin_save_station_queue' ? (await db.query('select admin_save_station_queue($1,$2,$3,$4,$5) as result',
        [args.p_admin_id,args.p_station_id,JSON.stringify(args.p_patch),args.p_playlist_ids,args.p_item_ids])).rows[0].result:null;
      return {data,error:null};}catch(error){return {data:null,error:{message:error.message}};}}
  };
  load(`${app}/supabase/functions/manage-playlists/index.ts`,{'npm:@supabase/supabase-js@2':{createClient:()=>client},'../_shared/stationQueue.ts':queue},
    {Deno:{env:{get:()=> 'fixture'},serve:callback=>{handler=callback;}},Request,Response,URL});
  const call=async (body,authenticated=true)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:authenticated?{Authorization:'Bearer fixture'}:{},body:JSON.stringify(body)}));
  try {
    const response=await call({action:'admin_upsert_station_from_source',source_kind:'profile',source_id:owner,playlist_ids:[p2,p1],selected_track_ids:[c,a]});
    assert.equal(response.status,200,await response.clone().text());assert.deepEqual((await response.json()).data.queue_item_ids,[c,a]);
    const detail=await call({action:'get_station_details',station_id:stationId},false);assert.equal(detail.status,200);
    const data=(await detail.json()).data;assert.deepEqual(data.playback_queue.map(entry=>entry.item.id),[c,a]);assert.equal(data.live_current_item.id,c);
    assert.equal(data.__queueReady,true);assert.equal(data.queue_revision,1);
    for(const body of [{action:'browse_stations',include_items:false},{action:'list_user_stations',user_id:owner}]) {
      const response=await call(body,false);assert.equal(response.status,200,await response.clone().text());
      const summary=(await response.json()).data.find(row=>row.id===stationId);
      assert.deepEqual(summary.playback_queue.map(entry=>entry.item.id),[c,a]);assert.equal(summary.__queueReady,false);
      assert.ok(summary.playback_queue.every(entry=>!entry.item.audio_url));
      assert.equal(timeline.getStationLiveTimelineState(summary,Date.parse(summary.queue_anchor_at)).item.id,c);
    }
    const denied=await call({action:'admin_upsert_station_from_source',source_id:owner},false);assert.equal(denied.status,401);
    actor=member;assert.equal((await call({action:'admin_upsert_station_from_source',source_id:owner})).status,403);
    actor=admin;const invalid=await call({action:'admin_upsert_station_from_source',source_id:owner,playlist_ids:[p1],selected_track_ids:[restricted]});assert.equal(invalid.status,400);
    assert.equal((await snapshot(db)).station.queue_revision,1);
  } finally {await db.close();}
});
