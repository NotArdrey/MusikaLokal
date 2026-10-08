import TrackPlayer, { Event, State, isTrackPlayerAvailable } from "./safeTrackPlayer";
import {
  pauseRadioPlayback,
  resumeRadioPlayback,
  stopRadioPlayback,
  synchronizeRadioPlayback,
  updateRadioNowPlayingMetadata,
} from "./radioLivePlayback";
import type { RadioQueueTrack } from "./radioTrackPlayer";

const playbackService = async () => {
  if (!isTrackPlayerAvailable) {
    return;
  }

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try {
      await resumeRadioPlayback();
    } catch {
      // Ignore remote command failures to keep the service resilient.
    }
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    try {
      await pauseRadioPlayback();
    } catch {
      // Ignore remote command failures to keep the service resilient.
    }
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    try {
      await stopRadioPlayback();
    } catch {
      // Ignore remote command failures to keep the service resilient.
    }
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    // Live radio keeps one shared timeline; remote skip is intentionally ignored.
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    // Live radio keeps one shared timeline; remote skip is intentionally ignored.
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event: { position: number }) => {
    void event;
    // Live radio keeps one shared timeline; remote seek is intentionally ignored.
  });

  const recoverLivePosition = () => {
    void synchronizeRadioPlayback().catch(error => console.warn("Radio live recovery failed:", error));
  };
  let lastSyncAt = 0;
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => {
    if (Date.now() - lastSyncAt < 5_000) return;
    lastSyncAt = Date.now();
    recoverLivePosition();
  });
  TrackPlayer.addEventListener(Event.PlaybackState, (event: { state: string }) => {
    if (event.state === State.Playing) recoverLivePosition();
  });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event: { track?: RadioQueueTrack }) => {
    if (!event.track) return;
    void updateRadioNowPlayingMetadata(event.track).catch(error => console.warn("Radio metadata update failed:", error));
    recoverLivePosition();
  });
};

export default playbackService;
