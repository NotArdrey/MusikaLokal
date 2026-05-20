import TrackPlayer, { Event, State, isTrackPlayerAvailable } from "./safeTrackPlayer";

const playbackService = async () => {
  if (!isTrackPlayerAvailable) {
    return;
  }

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try {
      const playbackState = await TrackPlayer.getPlaybackState();
      if (playbackState.state === State.Ended) {
        await TrackPlayer.seekTo(0);
      }
      await TrackPlayer.play();
    } catch (_) {
      // Ignore remote command failures to keep the service resilient.
    }
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    try {
      await TrackPlayer.play();
    } catch (_) {
      // Ignore remote command failures to keep the service resilient.
    }
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    try {
      await TrackPlayer.reset();
    } catch (_) {
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
};

export default playbackService;
