import TrackPlayer from "./src/audio/safeTrackPlayer";
import playbackService from "./src/audio/playbackService";
import "expo-router/entry";

TrackPlayer.registerPlaybackService(() => playbackService);