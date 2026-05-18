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
      await TrackPlayer.pause();
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
    try {
      await TrackPlayer.skipToNext();
    } catch (_) {
      // Ignore when there is no next track in the current queue.
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      const progress = await TrackPlayer.getProgress();
      if ((progress.position || 0) > 3) {
        await TrackPlayer.seekTo(0);
        return;
      }

      await TrackPlayer.skipToPrevious();
    } catch (_) {
      // Ignore when there is no previous track in the current queue.
    }
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event: { position: number }) => {
    try {
      await TrackPlayer.seekTo(event.position);
    } catch (_) {
      // Ignore remote command failures to keep the service resilient.
    }
  });
};

export default playbackService;