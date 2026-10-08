import TrackPlayer, { State } from "./safeTrackPlayer";
import { getLiveStationCursor, type RadioQueueTrack } from "./radioTrackPlayer";

const LIVE_DRIFT_TOLERANCE_SECONDS = 3;
let controlVersion = 0;
let pendingSync: Promise<void> | null = null;

// Native queue metadata lets the headless service recover the live position
// even after Android removes the React screen from recent apps.
const sameSession = (a: RadioQueueTrack, b?: RadioQueueTrack) => Boolean(
  b && a.stationId === b.stationId && a.radioAnchorAt === b.radioAnchorAt &&
  a.radioQueueRevision === b.radioQueueRevision,
);

export const invalidateRadioPlayback = () => ++controlVersion;
export const getRadioPlaybackVersion = () => controlVersion;

export const updateRadioNowPlayingMetadata = async (track: RadioQueueTrack) => {
  await TrackPlayer.updateNowPlayingMetadata({
    title: `${track.stationName || "MusikaLokal Radio"} · LIVE`,
    artist: [track.title, track.artist].filter(Boolean).join(" · "),
    album: track.stationName,
    artwork: track.artwork,
    isLiveStream: true,
    // Android's notification metadata must have an unknown duration. Keep the
    // real song length in the queue for playback and shared timeline calculations.
    duration: -1,
  });
};

const syncLivePosition = async (version: number, resuming: boolean) => {
  const queue: RadioQueueTrack[] = await TrackPlayer.getQueue();
  const activeIndex = await TrackPlayer.getActiveTrackIndex();
  if (version !== controlVersion || activeIndex === undefined) return;
  const activeTrack = queue[activeIndex];
  if (!activeTrack?.radioAnchorAt || queue.length !== activeTrack.radioQueueLength ||
      !queue.every(track => sameSession(activeTrack, track))) return;

  const state = await TrackPlayer.getPlaybackState();
  if (!resuming && state.state !== State.Playing) return;
  const progress = await TrackPlayer.getProgress();
  const latestTrack: RadioQueueTrack | undefined = await TrackPlayer.getActiveTrack();
  const playWhenReady = await TrackPlayer.getPlayWhenReady();
  if (version !== controlVersion || latestTrack?.id !== activeTrack.id ||
      !sameSession(activeTrack, latestTrack) || (!resuming && !playWhenReady)) return;

  const orderedQueue = [...queue].sort((a, b) => a.queueIndex - b.queueIndex);
  const cursor = getLiveStationCursor({ queue_anchor_at: activeTrack.radioAnchorAt }, orderedQueue);
  if (!cursor.isSynchronized) return;
  const targetTrack = orderedQueue[cursor.queueIndex];
  const targetIndex = queue.findIndex(track => track.id === targetTrack.id);
  if (targetIndex !== activeIndex) {
    await TrackPlayer.skip(targetIndex, cursor.positionSeconds);
  } else if (Math.abs(progress.position - cursor.positionSeconds) > (resuming ? 0 : LIVE_DRIFT_TOLERANCE_SECONDS)) {
    await TrackPlayer.seekTo(cursor.positionSeconds);
  }
};

export const synchronizeRadioPlayback = async () => {
  if (pendingSync) return;
  const task = syncLivePosition(controlVersion, false);
  pendingSync = task;
  try {
    await task;
  } finally {
    if (pendingSync === task) pendingSync = null;
  }
};

export const resumeRadioPlayback = async () => {
  const version = invalidateRadioPlayback();
  await pendingSync?.catch(() => undefined);
  if (version !== controlVersion) return;
  await syncLivePosition(version, true);
  const track: RadioQueueTrack | undefined = await TrackPlayer.getActiveTrack();
  if (version !== controlVersion || !track) return;
  await updateRadioNowPlayingMetadata(track);
  if (version === controlVersion) await TrackPlayer.play();
};

export const pauseRadioPlayback = async () => {
  invalidateRadioPlayback();
  await TrackPlayer.pause();
};

export const stopRadioPlayback = async () => {
  invalidateRadioPlayback();
  await TrackPlayer.reset();
};
