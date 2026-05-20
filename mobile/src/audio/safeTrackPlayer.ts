type TrackPlayerModuleLike = {
  default?: Record<string, (...args: any[]) => any>;
  Event?: Record<string, string>;
  State?: Record<string, string>;
  Capability?: Record<string, any>;
  IOSCategory?: Record<string, string>;
  AppKilledPlaybackBehavior?: Record<string, string>;
  RepeatMode?: Record<string, string | number>;
  registerPlaybackService?: (...args: any[]) => any;
  setupPlayer?: (...args: any[]) => any;
  updateOptions?: (...args: any[]) => any;
  reset?: (...args: any[]) => any;
  add?: (...args: any[]) => any;
  load?: (...args: any[]) => any;
  setVolume?: (...args: any[]) => any;
  skip?: (...args: any[]) => any;
  play?: (...args: any[]) => any;
  pause?: (...args: any[]) => any;
  seekTo?: (...args: any[]) => any;
  getProgress?: (...args: any[]) => any;
  getPlaybackState?: (...args: any[]) => any;
  addEventListener?: (...args: any[]) => any;
  skipToNext?: (...args: any[]) => any;
  skipToPrevious?: (...args: any[]) => any;
  setRepeatMode?: (...args: any[]) => any;
};

const FALLBACK_EVENT = {
  PlaybackState: "playback-state",
  PlaybackError: "playback-error",
  PlaybackPlayWhenReadyChanged: "playback-play-when-ready-changed",
  PlaybackActiveTrackChanged: "playback-active-track-changed",
  RemotePlay: "remote-play",
  RemotePause: "remote-pause",
  RemoteStop: "remote-stop",
  RemoteNext: "remote-next",
  RemotePrevious: "remote-previous",
  RemoteSeek: "remote-seek",
} as const;

const FALLBACK_STATE = {
  None: "none",
  Ready: "ready",
  Playing: "playing",
  Paused: "paused",
  Stopped: "stopped",
  Loading: "loading",
  Buffering: "buffering",
  Error: "error",
  Ended: "ended",
} as const;

const FALLBACK_CAPABILITY = {
  Play: "play",
  Pause: "pause",
  Stop: "stop",
  SeekTo: "seek-to",
  SkipToNext: "skip-to-next",
  SkipToPrevious: "skip-to-previous",
} as const;

const FALLBACK_IOS_CATEGORY = {
  Playback: "playback",
} as const;

const FALLBACK_APP_KILLED_BEHAVIOR = {
  StopPlaybackAndRemoveNotification: "stop-playback-and-remove-notification",
} as const;

const FALLBACK_REPEAT_MODE = {
  Off: "off",
  Track: "track",
  Queue: "queue",
} as const;

let nativeModule: TrackPlayerModuleLike | null = null;

try {
  const dynamicRequire = eval("require") as (id: string) => any;
  nativeModule = dynamicRequire("react-native-track-player");
} catch (error) {
  if (__DEV__) {
    console.info(
      "[radio] react-native-track-player unavailable; radio playback is disabled until you run a native dev build.",
    );
  }
}

const nativeTrackPlayer = (nativeModule?.default ?? nativeModule ?? null) as Record<string, any> | null;

export const isTrackPlayerAvailable = !!nativeTrackPlayer;

export const Event = (nativeModule?.Event ?? FALLBACK_EVENT) as typeof FALLBACK_EVENT;
export const State = (nativeModule?.State ?? FALLBACK_STATE) as typeof FALLBACK_STATE;
export const Capability = (nativeModule?.Capability ?? FALLBACK_CAPABILITY) as typeof FALLBACK_CAPABILITY;
export const IOSCategory = (nativeModule?.IOSCategory ?? FALLBACK_IOS_CATEGORY) as typeof FALLBACK_IOS_CATEGORY;
export const AppKilledPlaybackBehavior = (
  nativeModule?.AppKilledPlaybackBehavior ?? FALLBACK_APP_KILLED_BEHAVIOR
) as typeof FALLBACK_APP_KILLED_BEHAVIOR;
export const RepeatMode = (nativeModule?.RepeatMode ?? FALLBACK_REPEAT_MODE) as typeof FALLBACK_REPEAT_MODE;

const createAsyncNoOp = <T,>(value: T) => async () => value;

const noOpSubscription = {
  remove: () => undefined,
};

const TrackPlayer = {
  registerPlaybackService: (...args: any[]) => nativeTrackPlayer?.registerPlaybackService?.(...args),
  setupPlayer: (...args: any[]) => nativeTrackPlayer?.setupPlayer?.(...args) ?? Promise.resolve(),
  updateOptions: (...args: any[]) => nativeTrackPlayer?.updateOptions?.(...args) ?? Promise.resolve(),
  reset: (...args: any[]) => nativeTrackPlayer?.reset?.(...args) ?? Promise.resolve(),
  add: (...args: any[]) => nativeTrackPlayer?.add?.(...args) ?? Promise.resolve([]),
  load: (...args: any[]) => nativeTrackPlayer?.load?.(...args) ?? Promise.resolve(),
  setVolume: (...args: any[]) => nativeTrackPlayer?.setVolume?.(...args) ?? Promise.resolve(),
  skip: (...args: any[]) => nativeTrackPlayer?.skip?.(...args) ?? Promise.resolve(),
  play: (...args: any[]) => nativeTrackPlayer?.play?.(...args) ?? Promise.resolve(),
  pause: (...args: any[]) => nativeTrackPlayer?.pause?.(...args) ?? Promise.resolve(),
  seekTo: (...args: any[]) => nativeTrackPlayer?.seekTo?.(...args) ?? Promise.resolve(),
  getProgress: (...args: any[]) => nativeTrackPlayer?.getProgress?.(...args) ?? Promise.resolve({ position: 0, duration: 0, buffered: 0 }),
  getPlaybackState: (...args: any[]) => nativeTrackPlayer?.getPlaybackState?.(...args) ?? Promise.resolve({ state: State.None }),
  addEventListener: (...args: any[]) => nativeTrackPlayer?.addEventListener?.(...args) ?? noOpSubscription,
  skipToNext: (...args: any[]) => nativeTrackPlayer?.skipToNext?.(...args) ?? Promise.resolve(),
  skipToPrevious: (...args: any[]) => nativeTrackPlayer?.skipToPrevious?.(...args) ?? Promise.resolve(),
  setRepeatMode: (...args: any[]) => nativeTrackPlayer?.setRepeatMode?.(...args) ?? Promise.resolve(),
};

export default TrackPlayer;
