import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";

export type PlaybackStatus =
  | { isLoaded: false; error?: string }
  | {
      isLoaded: true;
      isPlaying: boolean;
      shouldPlay: boolean;
      didJustFinish: boolean;
      positionMillis: number;
      durationMillis: number;
    };

type PlaybackOptions = {
  shouldPlay?: boolean;
  positionMillis?: number;
  progressUpdateIntervalMillis?: number;
  volume?: number;
};

const getAudioStatusError = (status: AudioStatus) => {
  const error = (status as AudioStatus & { error?: unknown }).error;
  return typeof error === "string" ? error : "";
};

// Keep playlist/radio timing in milliseconds while expo-audio uses seconds.
// These players are owned by async queue operations, so they cannot use hooks.
export class AudioSound {
  private callback: ((status: PlaybackStatus) => void) | null = null;
  private subscription: { remove(): void };
  private disposed = false;
  private shouldPlay = false;
  private finished = false;

  private constructor(private player: AudioPlayer) {
    this.subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        this.finished = true;
        this.shouldPlay = false;
      }
      this.callback?.(this.readStatus(status));
    });
  }

  static async createAsync(
    source: { uri: string },
    options: PlaybackOptions = {},
    callback?: (status: PlaybackStatus) => void,
  ) {
    const player = createAudioPlayer(source, {
      updateInterval: Math.max(100, options.progressUpdateIntervalMillis ?? 500),
    });
    const sound = new AudioSound(player);
    try {
      // createAudioPlayer returns before loading; duration probes and initial
      // radio seeks must wait until the native player has loaded the source.
      if (!player.isLoaded) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            listener.remove();
            reject(new Error("Audio loading timed out."));
          }, 30_000);
          const listener = player.addListener("playbackStatusUpdate", (status) => {
            const statusError = getAudioStatusError(status);
            if (status.isLoaded || statusError || status.playbackState === "error") {
              clearTimeout(timeout);
              listener.remove();
              if (statusError || status.playbackState === "error") {
                reject(new Error(statusError || "Unable to load this audio."));
              } else resolve();
            }
          });
          if (player.isLoaded) {
            clearTimeout(timeout);
            listener.remove();
            resolve();
          }
        });
      }
      player.volume = options.volume ?? 1;
      if (options.positionMillis) await sound.setPositionAsync(options.positionMillis);
      sound.setOnPlaybackStatusUpdate(callback ?? null);
      if (options.shouldPlay) await sound.playAsync();
      return { sound, status: await sound.getStatusAsync() };
    } catch (error) {
      await sound.unloadAsync();
      throw error;
    }
  }

  private readStatus(status: AudioStatus = this.player.currentStatus): PlaybackStatus {
    const statusError = getAudioStatusError(status);
    if (statusError || status.playbackState === "error") {
      return { isLoaded: false, error: statusError || "Audio playback failed." };
    }
    if (!status.isLoaded) return { isLoaded: false };
    return {
      isLoaded: true,
      isPlaying: status.playing,
      shouldPlay: this.shouldPlay,
      didJustFinish: status.didJustFinish,
      positionMillis: status.currentTime * 1000,
      durationMillis: status.duration * 1000,
    };
  }

  setOnPlaybackStatusUpdate(callback: ((status: PlaybackStatus) => void) | null) {
    this.callback = callback;
  }

  enableBackgroundPlayback(title: string) {
    this.player.setActiveForLockScreen(true, { title });
  }

  async getStatusAsync(): Promise<PlaybackStatus> {
    return this.disposed
      ? { isLoaded: false }
      : this.readStatus({ ...this.player.currentStatus, didJustFinish: this.finished });
  }

  async playAsync() {
    if (this.finished) await this.setPositionAsync(0);
    this.shouldPlay = true;
    this.player.play();
  }

  async pauseAsync() {
    this.shouldPlay = false;
    this.player.pause();
  }

  async stopAsync() {
    await this.pauseAsync();
    await this.setPositionAsync(0);
  }

  async setPositionAsync(positionMillis: number) {
    this.finished = false;
    await this.player.seekTo(Math.max(0, positionMillis) / 1000);
  }

  async setVolumeAsync(volume: number) {
    this.player.volume = volume;
  }

  async unloadAsync() {
    if (this.disposed) return;
    this.disposed = true;
    this.callback = null;
    this.subscription.remove();
    this.player.remove();
  }
}
