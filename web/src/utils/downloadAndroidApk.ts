import type { AndroidRelease } from "./androidRelease";

export async function downloadAndroidApk(
  release: AndroidRelease,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  const bytes = new Uint8Array(release.sizeBytes);
  const chunkSize = 256 * 1024;
  const chunkCount = Math.ceil(release.sizeBytes / chunkSize);
  let nextChunk = 0;
  let received = 0;

  const worker = async () => {
    while (nextChunk < chunkCount) {
      const start = nextChunk++ * chunkSize;
      const end = Math.min(start + chunkSize, release.sizeBytes) - 1;
      let chunk: Uint8Array | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
        const request = new AbortController();
        const abortRequest = () => request.abort();
        controller.signal.addEventListener("abort", abortRequest, { once: true });
        const timeout = setTimeout(abortRequest, 90000);
        try {
          const response = await fetch(release.downloadUrl, {
            cache: "no-store",
            headers: { Range: `bytes=${start}-${end}` }, signal: request.signal,
          });
          if (response.status !== 206) {
            await response.body?.cancel();
            throw new Error("Download range unavailable");
          }
          const data = new Uint8Array(await response.arrayBuffer());
          if (data.length !== end - start + 1) throw new Error("Incomplete download range");
          chunk = data;
          break;
        } catch (error) {
          if (controller.signal.aborted || attempt === 2) throw error;
        } finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener("abort", abortRequest);
        }
      }
      if (!chunk) throw new Error("Download incomplete");
      bytes.set(chunk, start);
      received += chunk.length;
      onProgress(Math.floor(received / release.sizeBytes * 100));
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(6, chunkCount) }, worker));
    if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const checksum = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (checksum !== release.sha256) throw new Error("Download checksum mismatch");
    return new Blob([bytes], { type: "application/vnd.android.package-archive" });
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
