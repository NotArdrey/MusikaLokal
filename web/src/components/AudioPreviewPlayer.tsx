import { Ionicons } from "@expo/vector-icons";
import { Audio, type AVPlaybackStatus } from "expo-av";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../context/ThemeContext";

const SIGNED_URL_SECONDS = 60 * 30;
const SEEK_STEP_SECONDS = 15;
const KNOWN_AUDIO_BUCKETS = new Set(["documents", "playlist-assets", "post-media"]);

type StorageObjectReference = {
  bucket: string;
  path: string;
};

type AudioPreviewPlayerProps = {
  sourceUrl?: string | null;
  title?: string;
  subtitle?: string;
  durationSeconds?: number | null;
  emptyMessage?: string;
};

const decodeStoragePath = (value: string) =>
  value
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");

const parseStorageObjectReference = (value: string): StorageObjectReference | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const storageUrlMatch = trimmed.match(
    /(?:^|\/)storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i,
  );

  if (storageUrlMatch) {
    const bucket = decodeURIComponent(storageUrlMatch[1]);
    return {
      bucket,
      path: decodeStoragePath(storageUrlMatch[2]),
    };
  }

  const normalized = trimmed.replace(/^\/+/, "").split(/[?#]/)[0];
  const parts = normalized.split("/");
  if (parts.length > 1 && KNOWN_AUDIO_BUCKETS.has(parts[0])) {
    return {
      bucket: parts[0],
      path: parts.slice(1).join("/"),
    };
  }

  return null;
};

const resolveAudioPlaybackUrl = async (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const storageRef = parseStorageObjectReference(trimmed);
  if (storageRef) {
    const { data, error } = await supabase.storage
      .from(storageRef.bucket)
      .createSignedUrl(storageRef.path, SIGNED_URL_SECONDS);

    if (data?.signedUrl) {
      return data.signedUrl;
    }

    if (error) {
      console.warn("Audio preview signed URL failed", {
        bucket: storageRef.bucket,
        path: storageRef.path,
        message: error.message,
      });
    }
  }

  return trimmed;
};

const toFiniteNonNegativeMillis = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Math.round(numeric);
};

const durationSecondsToMillis = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric * 1000);
};

const formatTime = (millis: number) => {
  const safeMillis = toFiniteNonNegativeMillis(millis);
  const safeSeconds = Math.max(0, Math.floor(safeMillis / 1000));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function AudioPreviewPlayer({
  sourceUrl,
  title = "MP3 preview",
  subtitle,
  durationSeconds,
  emptyMessage = "No MP3 is attached yet.",
}: AudioPreviewPlayerProps) {
  const { colors } = useTheme();
  const soundRef = useRef<Audio.Sound | null>(null);
  const soundSourceRef = useRef<string>("");
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(() => durationSecondsToMillis(durationSeconds));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  const normalizedSource = useMemo(() => (
    typeof sourceUrl === "string" ? sourceUrl.trim() : ""
  ), [sourceUrl]);

  const updateStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsLoading(false);
      setIsPlaying(false);
      if (status.error) {
        setErrorMessage(status.error);
      }
      return;
    }

    setIsLoading(false);
    setErrorMessage(null);
    setPositionMillis(toFiniteNonNegativeMillis(status.positionMillis));
    setDurationMillis((currentDuration) => {
      const nextDuration = toFiniteNonNegativeMillis(status.durationMillis, currentDuration);
      return nextDuration > 0 ? nextDuration : currentDuration;
    });
    setIsPlaying(Boolean(status.isPlaying));

    if (status.didJustFinish) {
      setIsPlaying(false);
    }
  }, []);

  const unloadSound = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    soundSourceRef.current = "";
    setIsPlaying(false);
    setIsLoading(false);

    if (!sound) return;

    try {
      sound.setOnPlaybackStatusUpdate(null);
      await sound.unloadAsync();
    } catch {
      // Ignore cleanup failures for already-disposed sounds.
    }
  }, []);

  const loadSound = useCallback(async (shouldPlay: boolean) => {
    if (!normalizedSource) {
      setErrorMessage(emptyMessage);
      return null;
    }

    const existingSound = soundRef.current;
    if (existingSound && soundSourceRef.current === normalizedSource) {
      return existingSound;
    }

    await unloadSound();
    setIsLoading(true);
    setErrorMessage(null);

    const playbackUrl = await resolveAudioPlaybackUrl(normalizedSource);
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: playbackUrl },
      { shouldPlay, progressUpdateIntervalMillis: 250 },
      updateStatus,
    );

    soundRef.current = sound;
    soundSourceRef.current = normalizedSource;
    updateStatus(status);
    return sound;
  }, [emptyMessage, normalizedSource, unloadSound, updateStatus]);

  useEffect(() => {
    setDurationMillis(durationSecondsToMillis(durationSeconds));
  }, [durationSeconds]);

  useEffect(() => {
    setPositionMillis(0);
    setErrorMessage(null);
    void unloadSound();
  }, [normalizedSource, unloadSound]);

  useEffect(() => () => {
    void unloadSound();
  }, [unloadSound]);

  const handleToggle = useCallback(async () => {
    if (!normalizedSource) {
      setErrorMessage(emptyMessage);
      return;
    }

    try {
      const existingSound = soundRef.current;
      if (!existingSound) {
        await loadSound(true);
        return;
      }

      const sound = existingSound;
      if (!sound) return;

      const status = await sound.getStatusAsync();
      if (!status.isLoaded) {
        await loadSound(true);
        return;
      }

      if (status.isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (error: any) {
      setIsLoading(false);
      setIsPlaying(false);
      setErrorMessage(error?.message || "Unable to play this MP3.");
    }
  }, [emptyMessage, loadSound, normalizedSource]);

  const seekToMillis = useCallback(async (nextMillis: number) => {
    if (!normalizedSource) return;

    try {
      const safeNextMillis = toFiniteNonNegativeMillis(nextMillis, Number.NaN);
      if (!Number.isFinite(safeNextMillis)) {
        return;
      }

      const sound = soundRef.current || await loadSound(false);
      if (!sound) return;

      let targetDuration = toFiniteNonNegativeMillis(durationMillis);
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        const statusDuration = toFiniteNonNegativeMillis(status.durationMillis);
        if (statusDuration > 0) {
          targetDuration = statusDuration;
          setDurationMillis(statusDuration);
        }
      }

      const clampedMillis = targetDuration > 0
        ? Math.min(safeNextMillis, targetDuration)
        : safeNextMillis;
      await sound.setPositionAsync(clampedMillis);
      setPositionMillis(clampedMillis);
    } catch (error: any) {
      setErrorMessage(error?.message || "Unable to seek this MP3.");
    }
  }, [durationMillis, loadSound, normalizedSource]);

  const seekBySeconds = useCallback((seconds: number) => {
    const safePositionMillis = toFiniteNonNegativeMillis(positionMillis);
    void seekToMillis(safePositionMillis + seconds * 1000);
  }, [positionMillis, seekToMillis]);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const handleTrackPress = useCallback((event: GestureResponderEvent) => {
    const safeDurationMillis = toFiniteNonNegativeMillis(durationMillis);
    const safeTrackWidth = Number(trackWidth);
    const locationX = Number(event.nativeEvent.locationX);
    if (safeDurationMillis <= 0 || !Number.isFinite(safeTrackWidth) || safeTrackWidth <= 0 || !Number.isFinite(locationX)) {
      return;
    }

    const ratio = Math.max(0, Math.min(1, locationX / safeTrackWidth));
    void seekToMillis(safeDurationMillis * ratio);
  }, [durationMillis, seekToMillis, trackWidth]);

  const safePositionMillis = toFiniteNonNegativeMillis(positionMillis);
  const safeDurationMillis = toFiniteNonNegativeMillis(durationMillis);
  const progress = safeDurationMillis > 0
    ? Math.max(0, Math.min(1, safePositionMillis / safeDurationMillis))
    : 0;
  const hasSource = normalizedSource.length > 0;

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBubble, { backgroundColor: `${colors.primary}18` }]}>
          <Ionicons name="musical-notes-outline" size={16} color={colors.primary} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          activeOpacity={hasSource ? 0.78 : 1}
          onPress={handleToggle}
          disabled={!hasSource || isLoading}
          style={[
            styles.playButton,
            { backgroundColor: hasSource ? colors.primary : colors.border, opacity: isLoading ? 0.75 : 1 },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name={isPlaying ? "pause" : "play"} size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={hasSource ? 0.78 : 1}
          disabled={!hasSource}
          onPress={() => seekBySeconds(-SEEK_STEP_SECONDS)}
          style={[styles.skipButton, { borderColor: colors.border, opacity: hasSource ? 1 : 0.45 }]}
        >
          <Ionicons name="play-back" size={16} color={colors.text} />
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={hasSource ? 0.78 : 1}
          disabled={!hasSource}
          onPress={() => seekBySeconds(SEEK_STEP_SECONDS)}
          style={[styles.skipButton, { borderColor: colors.border, opacity: hasSource ? 1 : 0.45 }]}
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>15s</Text>
          <Ionicons name="play-forward" size={16} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.timeText, { color: colors.textSecondary }]}>
          {formatTime(safePositionMillis)} / {formatTime(safeDurationMillis)}
        </Text>
      </View>

      <Pressable
        onLayout={handleTrackLayout}
        onPress={handleTrackPress}
        disabled={!hasSource || safeDurationMillis <= 0}
        style={[styles.progressTrack, { backgroundColor: colors.border }]}
      >
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
      </Pressable>

      {!hasSource ? (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{emptyMessage}</Text>
      ) : errorMessage ? (
        <Text style={[styles.helperText, { color: "#DC2626" }]}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  helperText: {
    fontSize: 11,
    lineHeight: 16,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  skipButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  skipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  timeText: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
});
