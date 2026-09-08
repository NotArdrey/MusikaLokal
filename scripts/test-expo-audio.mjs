import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function harness({ loaded = true } = {}) {
  const listeners = new Set();
  const timers = new Set();
  const player = {
    isLoaded: loaded,
    currentStatus: {
      isLoaded: loaded, playing: false, currentTime: 0,
      duration: 12.5, didJustFinish: false, playbackState: "ready",
    },
    seeks: [],
    removed: 0,
    volume: 1,
    addListener(_event, listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    emit(status) {
      this.currentStatus = { ...this.currentStatus, didJustFinish: false, ...status };
      this.isLoaded = this.currentStatus.isLoaded;
      for (const listener of [...listeners]) listener(this.currentStatus);
    },
    play() { this.emit({ playing: true }); },
    pause() { this.emit({ playing: false }); },
    async seekTo(seconds) { this.seeks.push(seconds); this.emit({ currentTime: seconds }); },
    remove() { this.removed += 1; },
  };
  const exports = {};
  const source = readFileSync(new URL("../mobile/src/audio/AudioSound.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.equal(name, "expo-audio");
      return { createAudioPlayer: () => player };
    },
    setTimeout: (callback) => { timers.add(callback); return callback; },
    clearTimeout: (callback) => timers.delete(callback),
  });
  return { AudioSound: exports.AudioSound, player, listeners, timers };
}

test("audio loads before reporting duration and seeking the radio start position", async () => {
  const { AudioSound, player, listeners, timers } = harness({ loaded: false });
  const pending = AudioSound.createAsync({ uri: "track.mp3" }, { positionMillis: 2500, volume: 0 });
  assert.equal(player.seeks.length, 0);
  player.emit({ isLoaded: true });
  const { sound, status } = await pending;
  assert.equal(status.durationMillis, 12500);
  assert.equal(status.positionMillis, 2500);
  assert.deepEqual(player.seeks, [2.5]);
  assert.equal(player.volume, 0);
  assert.equal(timers.size, 0);
  await sound.unloadAsync();
  assert.equal(listeners.size, 0);
});

test("preview can pause, seek, and replay after completion without repeating finish events", async () => {
  const { AudioSound, player } = harness();
  const statuses = [];
  const { sound } = await AudioSound.createAsync({ uri: "track.mp3" }, { shouldPlay: true }, (status) => statuses.push(status));
  assert.equal((await sound.getStatusAsync()).isPlaying, true);
  await sound.pauseAsync();
  assert.equal((await sound.getStatusAsync()).isPlaying, false);
  await sound.setPositionAsync(4500);
  player.emit({ didJustFinish: true, playing: false });
  player.emit({ playing: false });
  assert.equal(statuses.filter((status) => status.didJustFinish).length, 1);
  assert.equal((await sound.getStatusAsync()).didJustFinish, true);
  await sound.playAsync();
  assert.equal(player.seeks.at(-1), 0);
  assert.equal((await sound.getStatusAsync()).didJustFinish, false);
  await sound.unloadAsync();
});

test("failed and timed out loads release the player and all listeners", async () => {
  for (const failure of ["error", "timeout"]) {
    const { AudioSound, player, listeners, timers } = harness({ loaded: false });
    const pending = AudioSound.createAsync({ uri: "broken.mp3" });
    if (failure === "error") player.emit({ playbackState: "error" });
    else for (const timer of timers) timer();
    await assert.rejects(pending, /Unable to load|timed out/);
    assert.equal(player.removed, 1);
    assert.equal(listeners.size, 0);
  }
});

test("disposing a preview twice is safe and detaches callbacks", async () => {
  const { AudioSound, player, listeners } = harness();
  let updates = 0;
  const { sound } = await AudioSound.createAsync({ uri: "track.mp3" }, {}, () => updates++);
  await sound.unloadAsync();
  await sound.unloadAsync();
  player.emit({ playing: true });
  assert.equal(updates, 0);
  assert.equal(player.removed, 1);
  assert.equal(listeners.size, 0);
  assert.equal((await sound.getStatusAsync()).isLoaded, false);
});
