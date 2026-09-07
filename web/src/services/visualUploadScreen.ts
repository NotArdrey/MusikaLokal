import * as FileSystem from "expo-file-system/src/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Platform } from "react-native";
import {
  screenUploadsWithAi,
  type UploadSafetyFileInput,
} from "./uploadSafetyScreen";

const readBlobDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read this media."));
    reader.readAsDataURL(blob);
  });

async function webVideoFrames(uri: string): Promise<string[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  const waitFor = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(event, ready);
        video.removeEventListener("error", fail);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(
          new Error("Unable to extract video safety frames. Please retry."),
        );
      };
      const timer = setTimeout(fail, 15000);
      video.addEventListener(event, ready, { once: true });
      video.addEventListener("error", fail, { once: true });
    });
  try {
    const ready = waitFor("loadeddata");
    video.src = uri;
    await ready;
    const duration = Number.isFinite(video.duration) ? video.duration : 1;
    const times = [
      ...new Set([
        Math.min(1, duration / 2),
        duration / 2,
        Math.max(0, duration - 0.1),
      ]),
    ];
    const frames: string[] = [];
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      1024 / Math.max(video.videoWidth, video.videoHeight, 1),
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Video safety screening is unavailable in this browser.");
    for (const time of times) {
      if (Math.abs(video.currentTime - time) > 0.01) {
        const seek = waitFor("seeked");
        video.currentTime = time;
        await seek;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.8));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export async function screenVisualUpload(
  input: Omit<UploadSafetyFileInput, "contentDataUrl"> & {
    durationMs?: number;
  },
  context: string,
): Promise<void> {
  if (!input.uri)
    throw new Error("Media is missing. Please select the file again.");
  let frames: string[];
  if (input.kind === "video") {
    if (Platform.OS === "web") frames = await webVideoFrames(input.uri);
    else {
      const duration = input.durationMs || 2000;
      const times = [
        ...new Set([
          Math.min(1000, duration / 2),
          duration / 2,
          Math.max(0, duration - 100),
        ]),
      ];
      frames = [];
      for (const time of times) {
        const thumbnail = await VideoThumbnails.getThumbnailAsync(input.uri, {
          time,
          quality: 0.8,
        });
        try {
          frames.push(
            `data:image/jpeg;base64,${await FileSystem.readAsStringAsync(thumbnail.uri, { encoding: "base64" })}`,
          );
        } finally {
          await FileSystem.deleteAsync(thumbnail.uri, {
            idempotent: true,
          }).catch(() => undefined);
        }
      }
    }
  } else if (Platform.OS === "web") {
    const response = await fetch(input.uri);
    if (!response.ok) throw new Error("Unable to read selected media.");
    frames = [await readBlobDataUrl(await response.blob())];
  } else {
    frames = [
      `data:${input.mimeType || "image/jpeg"};base64,${await FileSystem.readAsStringAsync(input.uri, { encoding: "base64" })}`,
    ];
  }
  if (!frames.length)
    throw new Error("Unable to read media for safety screening.");
  const summary = await screenUploadsWithAi(
    frames.map((contentDataUrl, index) => ({
      ...input,
      contentDataUrl,
      originalUri: input.uri,
      originalMimeType: input.mimeType,
      uri:
        input.kind === "video" ? `${input.uri}#frame-${index + 1}` : input.uri,
    })),
    context,
  );
  if (!summary.allowed)
    throw new Error(summary.reason || "This media is blocked pending review.");
}
