import * as FileSystem from 'expo-file-system/src/legacy';
import { Platform } from 'react-native';
import { createFile, MP4BoxBuffer, type Movie } from 'mp4box';

const COPYRIGHT_CLIP_SECONDS = 12;
const MAX_ACRCLOUD_SAMPLE_BYTES = 4 * 1024 * 1024;
const ISO_MEDIA_MIME_PATTERN = /^(video\/(?:mp4|quicktime|x-m4v)|audio\/(?:mp4|x-m4a))$/i;

export interface CopyrightVideoSource {
  uri: string;
  mimeType: string;
  fileName: string;
  webFile?: Blob | null;
}

export interface CopyrightVideoSample {
  contentDataUrl: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  extractedAudio: boolean;
  temporaryUri?: string;
}

const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let index = 0; index < chars.length; index += 1) {
    lookup[chars.charCodeAt(index)] = index;
  }

  let bufferLength = base64.length * 0.75;
  if (base64.endsWith('==')) bufferLength -= 2;
  else if (base64.endsWith('=')) bufferLength -= 1;

  const bytes = new Uint8Array(Math.floor(bufferLength));
  let outputIndex = 0;
  for (let index = 0; index < base64.length; index += 4) {
    const encoded1 = lookup[base64.charCodeAt(index)];
    const encoded2 = lookup[base64.charCodeAt(index + 1)];
    const encoded3 = lookup[base64.charCodeAt(index + 2)];
    const encoded4 = lookup[base64.charCodeAt(index + 3)];
    if (outputIndex < bytes.length) bytes[outputIndex++] = (encoded1 << 2) | (encoded2 >> 4);
    if (outputIndex < bytes.length) bytes[outputIndex++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (outputIndex < bytes.length) bytes[outputIndex++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  return bytes;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
};

const concatenateBuffers = (first: ArrayBuffer, second: ArrayBuffer): ArrayBuffer => {
  const combined = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(new Uint8Array(first), 0);
  combined.set(new Uint8Array(second), first.byteLength);
  return combined.buffer;
};

const extractAudioFragment = (source: ArrayBuffer): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const mediaFile = createFile();
    let initializationBuffer: ArrayBuffer | null = null;
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    mediaFile.onError = (_module, message) => {
      fail(`The video audio could not be parsed: ${message}`);
    };

    mediaFile.onSegment = (_trackId, _user, segmentBuffer) => {
      if (settled || !initializationBuffer) return;
      const audioFile = concatenateBuffers(initializationBuffer, segmentBuffer);
      if (audioFile.byteLength > MAX_ACRCLOUD_SAMPLE_BYTES) {
        fail('The extracted audio sample is too large for copyright screening. Please use a shorter video.');
        return;
      }
      settled = true;
      mediaFile.stop();
      resolve(audioFile);
    };

    mediaFile.onReady = (info: Movie) => {
      const audioTrack = info.audioTracks[0];
      if (!audioTrack) {
        fail('This video has no readable audio track for copyright screening.');
        return;
      }

      const durationSeconds = audioTrack.duration > 0 && audioTrack.timescale > 0
        ? audioTrack.duration / audioTrack.timescale
        : 0;
      const samplesPerSecond = durationSeconds > 0
        ? audioTrack.nb_samples / durationSeconds
        : audioTrack.nb_samples;
      const requestedSamples = Math.max(
        1,
        Math.min(
          audioTrack.nb_samples,
          Math.ceil(samplesPerSecond * Math.min(COPYRIGHT_CLIP_SECONDS, durationSeconds || COPYRIGHT_CLIP_SECONDS)),
        ),
      );

      mediaFile.setSegmentOptions(audioTrack.id, null, {
        nbSamples: requestedSamples,
        nbSamplesPerFragment: requestedSamples,
        rapAlignement: false,
      });
      const initializationSegments = mediaFile.initializeSegmentation('per-track');
      initializationBuffer = initializationSegments.find((segment) => segment.id === audioTrack.id)?.buffer || null;
      if (!initializationBuffer) {
        fail('The video audio track could not be prepared for copyright screening.');
        return;
      }
      mediaFile.start();
    };

    try {
      mediaFile.appendBuffer(MP4BoxBuffer.fromArrayBuffer(source, 0), true);
      mediaFile.flush();
      if (!settled && !mediaFile.readySent) {
        fail('The selected video is not a readable MP4/MOV file.');
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : 'The selected video could not be parsed.');
    }
  });

const readNativeFile = async (uri: string): Promise<ArrayBuffer> => {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const bytes = base64ToUint8Array(base64);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const downloadRemoteVideo = async (uri: string, fileName: string): Promise<string> => {
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('Temporary media storage is unavailable on this device.');
  }
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'portfolio-video.mp4';
  const targetUri = `${cacheDirectory}copyright-${Date.now()}-${safeName}`;
  const result = await FileSystem.downloadAsync(uri, targetUri);
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => undefined);
    throw new Error(`My Media video could not be downloaded (HTTP ${result.status}).`);
  }
  return targetUri;
};

const readSource = async (
  source: CopyrightVideoSource,
): Promise<{ buffer: ArrayBuffer; temporaryUri?: string }> => {
  if (Platform.OS === 'web') {
    const blob = source.webFile || await (await fetch(source.uri)).blob();
    return { buffer: await blob.arrayBuffer() };
  }

  const isRemote = /^https?:\/\//i.test(source.uri);
  const temporaryUri = isRemote
    ? await downloadRemoteVideo(source.uri, source.fileName)
    : undefined;
  return {
    buffer: await readNativeFile(temporaryUri || source.uri),
    temporaryUri,
  };
};

export const createCopyrightVideoSample = async (
  source: CopyrightVideoSource,
): Promise<CopyrightVideoSample> => {
  const { buffer, temporaryUri } = await readSource(source);

  try {
    if (ISO_MEDIA_MIME_PATTERN.test(source.mimeType)) {
      const audioBuffer = await extractAudioFragment(buffer);
      return {
        contentDataUrl: `data:audio/mp4;base64,${arrayBufferToBase64(audioBuffer)}`,
        fileName: source.fileName.replace(/\.[^.]+$/, '') + '-copyright-sample.m4a',
        mimeType: 'audio/mp4',
        byteLength: audioBuffer.byteLength,
        extractedAudio: true,
        temporaryUri,
      };
    }

    if (buffer.byteLength > MAX_ACRCLOUD_SAMPLE_BYTES) {
      throw new Error(
        'Copyright screening supports large MP4/MOV videos. Please convert this video to MP4 or choose a file under 4 MB.',
      );
    }

    return {
      contentDataUrl: `data:${source.mimeType};base64,${arrayBufferToBase64(buffer)}`,
      fileName: source.fileName,
      mimeType: source.mimeType,
      byteLength: buffer.byteLength,
      extractedAudio: false,
      temporaryUri,
    };
  } catch (error) {
    if (temporaryUri) {
      await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    }
    throw error;
  }
};

export const removeCopyrightVideoTemporaryFile = async (sample?: CopyrightVideoSample | null) => {
  if (!sample?.temporaryUri || Platform.OS === 'web') return;
  await FileSystem.deleteAsync(sample.temporaryUri, { idempotent: true }).catch(() => undefined);
};
