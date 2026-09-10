import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { createVideoPlayer } from "expo-video";

export type NativeVideoFrame = {
  base64: string;
  dataUrl: string;
  height: number;
  timeMs: number;
  width: number;
};

type NativeVideoFrameOptions = {
  compress?: number;
  maxHeight?: number;
  maxWidth?: number;
};

/**
 * Expo Go can place files created by expo-video-thumbnails in the host app's
 * cache instead of the experience-scoped cache. ExponentFileSystem then
 * rejects reads and copies of the returned file:// URI. expo-video exposes a
 * native image reference, which ImageManipulator can encode without reopening
 * that inaccessible path through FileSystem.
 */
export const generateNativeVideoFrame = async (
  sourceUri: string,
  timeMs: number,
  options: NativeVideoFrameOptions = {},
): Promise<NativeVideoFrame> => {
  const player = createVideoPlayer(normalizeVideoSourceUri(sourceUri));

  try {
    const [thumbnail] = await player.generateThumbnailsAsync(
      [Math.max(0, timeMs) / 1000],
      {
        maxWidth: options.maxWidth ?? 1024,
        maxHeight: options.maxHeight ?? 1024,
      },
    );

    if (!thumbnail) {
      throw new Error("No video preview was generated.");
    }

    const context = ImageManipulator.manipulate(thumbnail);
    try {
      const renderedImage = await context.renderAsync();
      try {
        const result = await renderedImage.saveAsync({
          base64: true,
          compress: options.compress ?? 0.8,
          format: SaveFormat.JPEG,
        });

        if (!result.base64) {
          throw new Error("Video preview encoding returned no image data.");
        }

        return {
          base64: result.base64,
          dataUrl: `data:image/jpeg;base64,${result.base64}`,
          width: result.width,
          height: result.height,
          timeMs,
        };
      } finally {
        renderedImage.release();
      }
    } finally {
      context.release();
      thumbnail.release();
    }
  } catch (error) {
    throw new Error("This video could not be read. Please select it again or try a different video.", {
      cause: error,
    });
  } finally {
    player.release();
  }
};

export const normalizeVideoSourceUri = (uri: string): string => {
  // Some Expo Go picker paths encode the scoped experience directory twice.
  // expo-video passes file URL paths directly to MediaMetadataRetriever, so
  // remove the extra encoding layer before generating frames.
  if (!/^file:\/\//i.test(uri) || !/%25[0-9a-f]{2}/i.test(uri)) {
    return uri;
  }

  try {
    return decodeURI(uri);
  } catch {
    return uri;
  }
};
