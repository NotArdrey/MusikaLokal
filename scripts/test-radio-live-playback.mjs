import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(path, 'utf8');
const compile = source => ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
}}).outputText;
function load(path, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(compile(read(path)), {exports, console, ...globals, require: name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }});
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const anchor = '2026-10-07T00:00:00.000Z';
const stationId = '00000000-0000-4000-8000-000000000001';
const queueHelpers = load('mobile/src/utils/stationQueue.ts', {});
const Event = Object.fromEntries(['RemotePlay','RemotePause','RemoteStop','RemoteNext','RemotePrevious','RemoteSeek',
  'PlaybackProgressUpdated','PlaybackState','PlaybackActiveTrackChanged','PlaybackPlayWhenReadyChanged','PlaybackError'].map(name => [name,name]));
const State = Object.fromEntries(['None','Ready','Stopped','Playing','Paused','Buffering','Ended','Loading'].map(name => [name,name]));
const Capability = Object.fromEntries(['Play','Pause','Stop','SeekTo','SkipToNext','SkipToPrevious'].map(name => [name,name]));
const settle = async () => {for (let i=0;i<3;i++) await new Promise(resolve => setImmediate(resolve));};

async function harness({elapsed = 45, position = 10, playing = true} = {}) {
  const calls = [], listeners = new Map();
  const native = {queue: [], index: 0, position, state: playing ? State.Playing : State.Paused,
    playWhenReady: playing, elapsed, gate: null};
  class FixedDate extends Date {static now() {return Date.parse(anchor) + native.elapsed * 1000;}}
  const player = {
    async setupPlayer(options) {calls.push(['setup',options]);},
    async updateOptions(options) {calls.push(['options',options]);},
    async getQueue() {return native.queue.slice();},
    async getActiveTrackIndex() {return native.queue.length ? native.index : undefined;},
    async getActiveTrack() {return native.queue[native.index];},
    async getPlaybackState() {return {state:native.state};},
    async getPlayWhenReady() {return native.playWhenReady;},
    async getProgress() {if(native.gate) await native.gate;return {position:native.position,duration:60};},
    async play() {calls.push(['play']);native.playWhenReady=true;native.state=State.Playing;},
    async pause() {calls.push(['pause']);native.playWhenReady=false;native.state=State.Paused;},
    async reset() {calls.push(['reset']);native.queue=[];native.playWhenReady=false;native.state=State.None;},
    async skip(index,position) {calls.push(['skip',index,position]);native.index=index;native.position=position;},
    async seekTo(position) {calls.push(['seek',position]);native.position=position;},
    async updateNowPlayingMetadata(metadata) {calls.push(['metadata',metadata]);},
    addEventListener(event,handler) {listeners.set(event,handler);return {remove(){listeners.delete(event);}};},
  };
  const safe = {default:player,Event,State,Capability,isTrackPlayerAvailable:true,
    AppKilledPlaybackBehavior:{ContinuePlayback:'continue-playback'},IOSCategory:{Playback:'playback'}};
  const radio = load('mobile/src/audio/radioTrackPlayer.ts', {
    './safeTrackPlayer':safe,'../../lib/supabase':{supabase:{storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:path}})})}}},
    '../utils/stationQueue':queueHelpers,
  }, {Date:FixedDate});
  const station = {id:stationId,name:'Local Radio',queue_anchor_at:anchor,queue_revision:7,
    cover_image_url:'https://fixture.invalid/station.jpg', playback_queue:['a','b','c'].map((id,index)=>({
      item_index:index,item:{id,title:id.toUpperCase(),artist_name:'Artist',duration_seconds:60,audio_url:`https://fixture.invalid/${id}.mp3`},
    }))};
  native.queue = await radio.buildStationQueue(station);
  const live = load('mobile/src/audio/radioLivePlayback.ts', {'./safeTrackPlayer':safe,'./radioTrackPlayer':radio}, {Date:FixedDate});
  const service = load('mobile/src/audio/playbackService.ts', {'./safeTrackPlayer':safe,'./radioLivePlayback':live}, {Date:FixedDate});
  await service.default();
  return {calls,listeners,native,player,radio,live,station};
}

test('native radio exposes working play/pause/stop, disables seeking/skipping, and continues after removal from recents', async () => {
  const {radio,calls} = await harness();
  await radio.ensureRadioPlayerSetup();
  const setup = calls.find(([name])=>name==='setup')[1];
  const options = calls.find(([name])=>name==='options')[1];
  assert.equal(setup.autoUpdateMetadata,false);
  assert.equal(options.android.appKilledPlaybackBehavior,'continue-playback');
  assert.deepEqual(plain(options.capabilities),['Play','Pause','Stop']);
  assert.deepEqual(plain(options.notificationCapabilities),['Play','Pause','Stop']);
  await radio.updateRadioPlayerCapabilities(true,true);
  assert.equal(calls.filter(([name])=>name==='options').length,1);
});

test('background metadata identifies the station and current song, hides duration, and keeps real song timing in the queue', async () => {
  const {native,calls,live} = await harness();
  await live.updateRadioNowPlayingMetadata(native.queue[0]);
  const metadata = calls[0][1];
  assert.equal(metadata.title,'Local Radio · LIVE');
  assert.equal(metadata.artist,'A · Artist');
  assert.equal(metadata.duration,-1);
  assert.equal(metadata.isLiveStream,true);
  assert.equal(metadata.artwork,'https://fixture.invalid/station.jpg');
  assert.equal(native.queue[0].duration,60);
  assert.equal(native.queue[0].radioQueueLength,3);
  assert.equal(native.queue[0].radioAnchorAt,anchor);
});

test('Android Pause pauses audio and does not issue Play', async () => {
  const {listeners,calls,native} = await harness();
  await listeners.get(Event.RemotePause)();
  assert.deepEqual(calls,[['pause']]);
  assert.equal(native.playWhenReady,false);
});

test('Play after a pause seeks to the live position before audio resumes', async () => {
  const {listeners,calls,native} = await harness({playing:false});
  await listeners.get(Event.RemotePlay)();
  assert.deepEqual(calls.map(([name])=>name),['seek','metadata','play']);
  assert.deepEqual(calls[0],['seek',45]);
  assert.equal(native.playWhenReady,true);
});

test('resume across a song boundary selects the current song in a rotated native queue', async () => {
  const {listeners,calls,native} = await harness({elapsed:135,position:30,playing:false});
  const [a,b,c] = native.queue; native.queue=[b,c,a];
  await listeners.get(Event.RemotePlay)();
  assert.deepEqual(calls[0],['skip',1,15]);
  assert.equal(native.queue[native.index].itemId,'c');
  assert.equal(calls[1][1].artist,'C · Artist');
});

test('loop boundaries return to the shared first song rather than continuing a delayed queue', async () => {
  const {live,calls,native} = await harness({elapsed:185,position:55});
  native.index=2;
  await live.synchronizeRadioPlayback();
  assert.deepEqual(calls,[['skip',0,5]]);
});

test('one-track stations also recover the shared loop position', async () => {
  const {live,calls,native} = await harness({elapsed:125,position:30});
  native.queue=[{...native.queue[0],radioQueueLength:1}];
  await live.synchronizeRadioPlayback();
  assert.deepEqual(calls,[['seek',5]]);
});

test('normal playback within tolerance is uninterrupted', async () => {
  const {live,calls} = await harness({position:43});
  await live.synchronizeRadioPlayback();
  assert.deepEqual(calls,[]);
});

test('periodic recovery leaves paused listeners paused', async () => {
  const {live,calls,native} = await harness({playing:false});
  await live.synchronizeRadioPlayback();
  assert.deepEqual(calls,[]);
  assert.equal(native.playWhenReady,false);
});

test('partial tune-in queues are not treated as complete station loops', async () => {
  const {live,calls,native} = await harness();
  native.queue=native.queue.slice(0,1);
  await live.synchronizeRadioPlayback();
  assert.deepEqual(calls,[]);
});

test('queues with another station or revision cannot be used for live recovery', async () => {
  for(const patch of [{stationId:'different'},{radioQueueRevision:8},{radioAnchorAt:'2026-10-07T01:00:00Z'}]) {
    const {live,calls,native} = await harness();
    native.queue[1]={...native.queue[1],...patch};
    await live.synchronizeRadioPlayback();
    assert.deepEqual(calls,[]);
  }
});

test('a newer Pause cancels a delayed resume without seeking or restarting', async () => {
  const {live,calls,native} = await harness({playing:false});
  let release; native.gate=new Promise(resolve=>release=resolve);
  const resume=live.resumeRadioPlayback();await settle();
  await live.pauseRadioPlayback();release();await resume;
  assert.deepEqual(calls,[['pause']]);
});

test('a newer Stop cancels delayed recovery and clears the queue', async () => {
  const {live,calls,native} = await harness();
  let release; native.gate=new Promise(resolve=>release=resolve);
  const sync=live.synchronizeRadioPlayback();await settle();
  await live.stopRadioPlayback();release();await sync;
  assert.deepEqual(calls,[['reset']]);
  assert.equal(native.queue.length,0);
});

test('station changes invalidate delayed recovery', async () => {
  const {live,calls,native} = await harness();
  let release; native.gate=new Promise(resolve=>release=resolve);
  const sync=live.synchronizeRadioPlayback();await settle();
  live.invalidateRadioPlayback();native.queue=native.queue.map(track=>({...track,stationId:'new'}));
  release();await sync;
  assert.deepEqual(calls,[]);
});

test('overlapping progress events coalesce and recover buffering delay after playback restarts', async () => {
  const {live,listeners,calls,native} = await harness();
  native.state=State.Buffering;
  await live.synchronizeRadioPlayback();assert.deepEqual(calls,[]);
  native.state=State.Playing;
  let release;native.gate=new Promise(resolve=>release=resolve);
  listeners.get(Event.PlaybackState)({state:State.Playing});
  listeners.get(Event.PlaybackProgressUpdated)();
  await settle();release();await settle();
  assert.deepEqual(calls,[['seek',45]]);
  calls.length=0;native.position=30;native.elapsed=46;
  listeners.get(Event.PlaybackProgressUpdated)();await settle();assert.deepEqual(calls,[]);
  native.elapsed=51;listeners.get(Event.PlaybackProgressUpdated)();await settle();
  assert.deepEqual(calls,[['seek',51]]);
});

test('track transitions refresh station/song metadata in the headless service', async () => {
  const {listeners,native,calls} = await harness({elapsed:75,position:15});
  native.index=1;
  listeners.get(Event.PlaybackActiveTrackChanged)({track:native.queue[1]});await settle();
  assert.equal(calls[0][1].artist,'B · Artist');
  assert.equal(calls[0][1].duration,-1);
  assert.equal(calls.length,1);
});

test('remote Stop clears playback, while seek/next/previous cannot change the shared timeline', async () => {
  const {listeners,calls,native} = await harness();
  for(const event of [Event.RemoteSeek,Event.RemoteNext,Event.RemotePrevious]) await listeners.get(event)({position:0});
  assert.deepEqual(calls,[]);
  await listeners.get(Event.RemoteStop)();
  assert.deepEqual(calls,[['reset']]);assert.equal(native.queue.length,0);
});

function callback(name) {
  const ast=ts.createSourceFile('player.tsx',read('mobile/src/context/RadioPlayerContext.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let result;
  const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name) result=node.initializer.arguments[0];ts.forEachChild(node,visit);};
  visit(ast);assert.ok(result);return result.getText(ast);
}

test('the in-app control pauses and resumes through the same live recovery path', async () => {
  const calls=[];
  const globals={activeStationRef:{current:{id:stationId}},fullQueueRef:{current:[{}]},isPlaying:true,
    playWhenReadyRef:{current:true},playbackStateRef:{current:State.Playing},State,isTrackPlayerAvailable:true,
    pauseRadioPlayback:async()=>calls.push('pause'),resumeLiveStation:async()=>calls.push('resume'),setIsPlaying:value=>calls.push(value)};
  await vm.runInNewContext(compile(`(${callback('togglePlayPause')})`),globals)();
  assert.deepEqual(calls,['pause',false]);assert.equal(globals.playWhenReadyRef.current,false);
  globals.isPlaying=false;
  await vm.runInNewContext(compile(`(${callback('togglePlayPause')})`),globals)();
  assert.equal(calls.at(-1),'resume');
});

function effectContaining(marker) {
  const ast=ts.createSourceFile('player.tsx',read('mobile/src/context/RadioPlayerContext.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let result;
  const visit=node=>{
    if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0].getText(ast).includes(marker)) result=node.arguments[0];
    ts.forEachChild(node,visit);
  };
  visit(ast);assert.ok(result);return result.getText(ast);
}

async function restoreHarness(options = {}) {
  const h=await harness(options), restored=[], refreshed=[];
  let requestId=0;
  const globals={TrackPlayer:h.player,State,isTrackPlayerAvailable:true,console,
    ensureRadioPlayerSetup:async()=>{},ensureStationData:async()=>({...h.station,__queueReady:true}),
    playbackRequestIdRef:{get current(){return requestId;}},isPlaybackRequestCurrent:id=>id===requestId,
    activeStationRef:{current:null},preparingPlayerStationRef:{current:null},preparedQueueRef:{current:null},playerQueueLengthRef:{current:0},
    playWhenReadyRef:{current:false},playbackStateRef:{current:State.None},getStationQueueEntries:queueHelpers.getStationQueueEntries,
    updateSharedQueueState:(...args)=>{restored.push(args);globals.activeStationRef.current=args[0];},
    setIsPlaying:value=>restored.push(value),deriveIsPlaying:(ready,state)=>ready&&[State.Playing,State.Buffering,State.Loading].includes(state),
    syncStationData:station=>refreshed.push(station)};
  const run=()=>vm.runInNewContext(compile(`(${effectContaining('Radio session restore failed')})`),globals)();
  return {...h,globals,restored,refreshed,run,cancel:()=>requestId++};
}

test('reopening the app restores the current native song and queue without restarting playback', async () => {
  const h=await restoreHarness({elapsed:135,position:15});
  const [a,b,c]=h.native.queue;h.native.queue=[b,c,a];h.native.index=1;
  const cleanup=h.run();await settle();
  assert.equal(h.restored[0][0].id,stationId);
  assert.deepEqual(plain(h.restored[0][1].map(track=>track.itemId)),['a','b','c']);
  assert.equal(h.restored[0][2],2);
  assert.equal(h.restored[1],true);
  assert.equal(h.globals.playerQueueLengthRef.current,3);
  assert.deepEqual(h.calls,[]);assert.deepEqual(h.refreshed,[]);cleanup();
});

test('reopening a paused station preserves the pause', async () => {
  const h=await restoreHarness({playing:false});
  const cleanup=h.run();await settle();
  assert.equal(h.restored[1],false);assert.deepEqual(h.calls,[]);cleanup();
});

test('an idle preloaded song cannot become the active artist during session restoration', async () => {
  for (const state of [State.Ready, State.None, State.Stopped]) {
    const h = await restoreHarness({ playing: false });
    h.native.state = state;
    const cleanup = h.run(); await settle();
    assert.deepEqual(h.restored, []);
    cleanup();
  }
});

test('preparation that completes during restoration cannot replace the chosen artist', async () => {
  const h = await restoreHarness(); let release;
  h.globals.ensureStationData = () => new Promise(resolve => { release = resolve; });
  const cleanup = h.run(); await settle();
  h.globals.preparedQueueRef.current = { playerPreparedAt: Date.now() };
  release({ ...h.station, __queueReady: true }); await settle();
  assert.deepEqual(h.restored, []);
  cleanup();
});

test('prepared playback refuses a native song from another artist before publishing its metadata', async () => {
  const h = await harness({ playing: false });
  const changes = [];
  const globals = {
    isTrackPlayerAvailable: true, TrackPlayer: h.player, Date,
    getRadioPlaybackVersion: h.live.getRadioPlaybackVersion, isPlaybackRequestCurrent: () => true,
    queueTransitionInFlightRef: { current: false }, ensureRadioPlayerSetup: async () => {}, logRadioTuneInDebug() {},
    updateSharedQueueState: (...args) => changes.push(args),
  };
  const play = vm.runInNewContext(compile(`(${callback('playPreparedPlayerQueue')})`), globals);
  const wrongTrack = { ...h.native.queue[0], id: 'other-track', stationId: 'other-artist' };
  assert.equal(await play({ ...h.station, id: 'other-artist' }, [wrongTrack], 1), false);
  assert.deepEqual(changes, []);
  assert.deepEqual(h.calls, []);
});

test('preparing another station cannot inherit the previous artist native or fallback player', async () => {
  for (const native of [true, false]) {
    const queue = [{ id: 'neil-track', stationId: 'neil-station', queueIndex: 0 }];
    const globals = {
      Date, isTrackPlayerAvailable: native, activeStationRef: { current: { id: 'bulacan-station' } },
      preparedQueueRef: { current: { stationId: 'bulacan-station', playerPreparedAt: 123, fallbackPreparedAt: 123 } },
      getFastStationLiveCursor: () => ({ queueIndex: 0 }), normalizePrepareQueueIndex: value => value,
      getPreparedQueueForStation: () => null, getRadioPrepareKey: (id, index) => id + ':' + index,
      pendingPrepareKeyRef: { current: null }, pendingPreparedQueueRef: { current: null }, prepareRequestIdRef: { current: 0 },
      ensureRadioPlayerSetup: async () => {}, buildStationQueue: async () => queue,
      getStationQueueEntries: () => [{ item: { id: 'neil-track' } }],
      logRadioTuneInDebug() {}, summarizeRadioQueueForDebug: () => [], summarizeRadioStationForDebug: () => ({}),
    };
    await vm.runInNewContext(compile(`(${callback('prepareStation')})`), globals)({ id: 'neil-station', __queueReady: true });
    assert.equal(globals.preparedQueueRef.current.stationId, 'neil-station');
    assert.equal(globals.preparedQueueRef.current.playerPreparedAt, undefined);
    assert.equal(globals.preparedQueueRef.current.fallbackPreparedAt, undefined);
  }
});

test('the feed credits the playing artist immediately and never borrows another station song', () => {
  const ast = ts.createSourceFile('feed.tsx', read('mobile/app/(tabs)/feed.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function initializer(name) {
    let found;
    const visit = node => {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer;
      ts.forEachChild(node, visit);
    };
    visit(ast); assert.ok(found);
    return compile(`(${found.getText(ast)})`);
  }
  const globals = {
    isCurrentStation: true, displayStationId: 'neil', hasDisplayStation: true,
    currentTrack: { stationId: 'neil', title: 'Red', sourceArtistName: 'Neil' },
    currentSlotIndex: 0, liveTimelineTitle: 'Earlier song',
    liveTimelineState: { item: { artist_name: 'Earlier artist' } },
    displayStation: { managed_profile: { full_name: 'Station artist' } },
    getStationNowPlayingTitle: () => '', getStationLiveCurrentItem: () => null,
  };
  globals.displayTrack = vm.runInNewContext(initializer('displayTrack'), globals);
  assert.equal(vm.runInNewContext(initializer('primaryTrackTitle'), globals), 'Red');
  assert.equal(vm.runInNewContext(initializer('primaryArtistName'), globals), 'Neil');
  globals.displayStationId = 'bulacan';
  globals.displayTrack = vm.runInNewContext(initializer('displayTrack'), globals);
  assert.equal(globals.displayTrack, null);
  assert.equal(vm.runInNewContext(initializer('primaryTrackTitle'), globals), 'Earlier song');
  assert.equal(vm.runInNewContext(initializer('primaryArtistName'), globals), 'Earlier artist');
});

test('reopening after a station revision changed hands the fresh snapshot to queue synchronization', async () => {
  const h=await restoreHarness();
  h.globals.ensureStationData=async()=>({...h.station,queue_revision:8,__queueReady:true});
  const cleanup=h.run();await settle();
  assert.equal(h.restored[0][0].queue_revision,7);
  assert.equal(h.refreshed[0].queue_revision,8);
  assert.deepEqual(h.calls,[]);cleanup();
});

test('removed tracks in a fresh station snapshot cannot relabel an old native queue as current', async () => {
  const h=await restoreHarness();
  h.globals.ensureStationData=async()=>({...h.station,playback_queue:h.station.playback_queue.slice(0,2),__queueReady:true});
  const cleanup=h.run();await settle();
  assert.equal(h.restored[0][0].playback_queue.length,3);
  assert.equal(h.refreshed[0].playback_queue.length,2);cleanup();
});

test('late session restoration cannot override a newer tune-in, an unmount, or a remote Stop', async () => {
  for(const action of ['tune-in','unmount','stop']) {
    const h=await restoreHarness();let release;
    h.globals.ensureStationData=()=>new Promise(resolve=>release=resolve);
    const cleanup=h.run();await settle();assert.ok(release);
    if(action==='tune-in') {h.cancel();h.globals.activeStationRef.current={id:'chosen-by-user'};}
    if(action==='unmount') cleanup();
    if(action==='stop') await h.live.stopRadioPlayback();
    release({...h.station,__queueReady:true});await settle();
    assert.deepEqual(h.restored,[]);cleanup();
  }
});

test('closing the React screen leaves native background audio running, and remote Stop clears its screen state', async () => {
  const h=await harness(), cleared=[];
  const globals={TrackPlayer:h.player,State,Event,isTrackPlayerAvailable:true,console,
    ensureRadioPlayerSetup:async()=>{},activeStationRef:{current:h.station},queueTransitionInFlightRef:{current:false},
    playbackStateRef:{current:State.Playing},playWhenReadyRef:{current:true},preparedQueueRef:{current:null},
    preparingPlayerStationRef:{current:null},playerQueueLengthRef:{current:3},currentQueueIndexRef:{current:0},fullQueueRef:{current:h.native.queue},
    deriveIsPlaying:(ready,state)=>ready&&state===State.Playing,updatePlaybackControlAvailability:async()=>{},
    invalidatePlaybackRequests:()=>h.live.invalidateRadioPlayback(),clearLocalPlaybackState:value=>cleared.push(value),
    setIsPlaying(){},setCurrentTrack(){},setCurrentSlotIndex(){},setCurrentQueueIndex(){}};
  const cleanup=vm.runInNewContext(compile(`(${effectContaining('const stateSubscription')})`),globals)();
  h.listeners.get(Event.PlaybackState)({state:State.None});assert.deepEqual(cleared,[true]);
  cleanup();await settle();
  assert.equal(h.native.playWhenReady,true);assert.equal(h.native.queue.length,3);
  assert.deepEqual(h.calls,[]);
});

test('a background Pause during direct or prepared tune-in cannot be undone by its delayed Play', async () => {
  for(const name of ['applyPlayerQueue','playPreparedPlayerQueue']) {
    const h=await harness({playing:false});let release;
    const metadataGate=new Promise(resolve=>release=resolve);
    h.player.add=async queue=>{h.native.queue=queue;};h.player.setVolume=async()=>{};h.player.setRepeatMode=async()=>{};
    const tracks=h.native.queue.slice();
    const globals={console,Date,State,RepeatMode:{Queue:1,Off:0},isTrackPlayerAvailable:true,TrackPlayer:h.player,
      getRadioPlaybackVersion:h.live.getRadioPlaybackVersion,isPlaybackRequestCurrent:()=>true,beginPlaybackRequest:()=>1,
      ensureRadioPlayerSetup:async()=>{},logRadioTuneInDebug(){},normalizeQueueIndex:()=>0,
      buildInitialPlayerQueue:queue=>({initialQueue:queue,remainingQueue:[]}),getFastStationLiveCursor:()=>({isSynchronized:true,queueIndex:0,positionSeconds:45}),
      queueTransitionInFlightRef:{current:false},playerQueueLengthRef:{current:0},isMutedRef:{current:false},isAutoplayEnabledRef:{current:true},
      playWhenReadyRef:{current:false},playbackStateRef:{current:State.Paused},updateSharedQueueState(){},setIsPlaying(){},clearLocalPlaybackState(){},
      deriveIsPlaying:(ready,state)=>ready&&state===State.Playing,
      updateRadioNowPlayingMetadata:async track=>{await metadataGate;await h.live.updateRadioNowPlayingMetadata(track);}};
    const apply=vm.runInNewContext(compile(`(${callback(name)})`),globals);
    const pending=name==='applyPlayerQueue' ? apply(h.station,tracks,0,true,1,45) : apply(h.station,tracks,1,45);
    await settle();await h.live.pauseRadioPlayback();release();await pending;
    assert.equal(h.calls.some(([name])=>name==='play'),false);
    assert.equal(h.native.playWhenReady,false);
    assert.equal(globals.playWhenReadyRef.current,false);
  }
});

async function fallbackHarness(options = {}) {
  const h=await harness(options), seeks=[], applied=[];
  const globals={console,isTrackPlayerAvailable:false,
    fallbackSyncInFlightRef:{current:false},playWhenReadyRef:{current:true},activeStationRef:{current:h.station},
    fullQueueRef:{current:h.native.queue},currentQueueIndexRef:{current:0},playbackRequestIdRef:{current:0},
    fallbackSoundRef:{current:{getStatusAsync:async()=>({isLoaded:true,isPlaying:true,positionMillis:h.native.position*1000}),
      setPositionAsync:async value=>seeks.push(value)}},
    isPlaybackRequestCurrent:id=>id===globals.playbackRequestIdRef.current,
    getStationQueueEntries:queueHelpers.getStationQueueEntries,getLiveStationCursor:h.radio.getLiveStationCursor,
    applyFallbackQueue:async(...args)=>applied.push(args),beginPlaybackRequest:()=>++globals.playbackRequestIdRef.current,
    buildStationQueue:h.radio.buildStationQueue};
  return {...h,globals,seeks,applied,run:name=>vm.runInNewContext(compile(`(${callback(name)})`),globals)()};
}

test('the Expo fallback corrects drift without replacing the current audio source', async () => {
  const h=await fallbackHarness();await h.run('synchronizeFallbackPlayback');
  assert.deepEqual(h.seeks,[45000]);assert.deepEqual(h.applied,[]);
});

test('the Expo fallback rejoins the current song after a track boundary', async () => {
  const h=await fallbackHarness({elapsed:75});await h.run('synchronizeFallbackPlayback');
  assert.equal(h.applied[0][2],1);assert.equal(h.applied[0][3],true);assert.equal(h.applied[0][5],15);
  assert.deepEqual(h.seeks,[]);
});

test('a Pause received while the fallback reads progress cancels live recovery', async () => {
  const h=await fallbackHarness({elapsed:75});let release;
  h.globals.fallbackSoundRef.current.getStatusAsync=()=>new Promise(resolve=>release=resolve);
  const pending=h.run('synchronizeFallbackPlayback');await settle();
  h.globals.playWhenReadyRef.current=false;
  release({isLoaded:true,isPlaying:true,positionMillis:10000});await pending;
  assert.deepEqual(h.seeks,[]);assert.deepEqual(h.applied,[]);
});

test('resuming a partial fallback queue loads the station before finding the live song', async () => {
  const h=await fallbackHarness({elapsed:135});h.globals.fullQueueRef.current=h.native.queue.slice(0,1);
  await h.run('resumeLiveStation');
  assert.equal(h.applied[0][1].length,3);assert.equal(h.applied[0][2],2);assert.equal(h.applied[0][5],15);
});
