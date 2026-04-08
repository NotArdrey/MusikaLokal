/**
 * MusikaLokal On-Device LLM Adapter
 *
 * Wraps llama.rn (llama.cpp React Native binding) to implement the
 * OfflineLlmNativeModule contract expected by offlineLlmEnhancer.ts.
 *
 * Model is downloaded on first prepareModel() call and cached locally.
 */

import { initLlama, type LlamaContext } from "llama.rn";
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  createDownloadResumable,
} from "expo-file-system/legacy";
import { TurboModuleRegistry } from "react-native";

// ── Model configuration ──────────────────────────────────────────────
// Small instruct model suitable for JSON generation on mobile.
// Override via setModelConfig() before first prepareModel() call.
let MODEL_DOWNLOAD_URL =
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
let MODEL_FILENAME = "qwen2.5-0.5b-instruct-q4_k_m.gguf";

// ── Runtime state ────────────────────────────────────────────────────
let llamaContext: LlamaContext | null = null;
let modelReady = false;
let prepareError: string | null = null;
let preparePromise: Promise<boolean> | null = null;
let nativeUnavailable = false;
let backgroundSkipLogged = false;
let onModelReadyCallbacks: Array<() => void> = [];
let warmupComplete = false;
let warmupPromise: Promise<void> | null = null;
let completionQueue: Promise<void> = Promise.resolve();

// ── Native runtime check ─────────────────────────────────────────────

/**
 * Returns true if the llama.rn native module is available in this build.
 * Expo Go does not include custom native modules — only custom dev client
 * builds (`expo run:android`) or EAS builds will have it.
 *
 * We check the actual TurboModule registry for 'RNLlama' which is what
 * llama.rn's installJsi() calls .install() on. If it's null, the native
 * side is not linked (e.g. Expo Go).
 */
const isNativeRuntimeAvailable = (): boolean => {
  try {
    const nativeModule = TurboModuleRegistry.get("RNLlama");
    return nativeModule != null;
  } catch {
    return false;
  }
};

// ── Helpers ──────────────────────────────────────────────────────────

const MODELS_DIR = `${documentDirectory}llm-models/`;

const getModelPath = () => `${MODELS_DIR}${MODEL_FILENAME}`;

const log = (tag: string, ...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log(`[MusikaLLM:${tag}]`, ...args);
};

/**
 * Allow runtime override of model URL/filename before first use.
 */
export const setModelConfig = (url: string, filename: string) => {
  if (modelReady || preparePromise) {
    log("config", "Cannot change model config after init. Call releaseModel() first.");
    return;
  }
  MODEL_DOWNLOAD_URL = url;
  MODEL_FILENAME = filename;
};

/**
 * Download model GGUF if not already cached.
 */
const ensureModelDownloaded = async (): Promise<string | null> => {
  const modelPath = getModelPath();

  const info = await getInfoAsync(modelPath);
  if (info.exists && (info as any).size > 0) {
    log("download", "Model already cached:", modelPath);
    return modelPath;
  }

  log("download", "Creating models directory...");
  await makeDirectoryAsync(MODELS_DIR, { intermediates: true });

  log("download", "Downloading model from:", MODEL_DOWNLOAD_URL);
  log("download", "This may take a few minutes depending on connection speed...");

  const downloadResumable = createDownloadResumable(
    MODEL_DOWNLOAD_URL,
    modelPath,
    {},
    (progress) => {
      const pct = Math.round(
        (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100,
      );
      if (pct % 10 === 0) {
        log("download", `Progress: ${pct}%`);
      }
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    log("download", "Download failed — no URI returned");
    return null;
  }

  log("download", "Model downloaded successfully:", result.uri);
  return result.uri;
};

// ── Adapter interface (matches OfflineLlmNativeModule) ───────────────

/**
 * Check if the LLM context is fully initialised and ready for inference.
 */
const isModelReady = async (): Promise<boolean> => {
  return modelReady && llamaContext !== null;
};

const runQueuedCompletion = async <T>(task: () => Promise<T>): Promise<T> => {
  let releaseQueue = () => {};
  const previousCompletion = completionQueue;

  completionQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousCompletion.catch(() => {});

  try {
    return await task();
  } finally {
    releaseQueue();
  }
};

const warmModel = async (): Promise<void> => {
  if (warmupComplete || !llamaContext) {
    return;
  }

  if (warmupPromise) {
    await warmupPromise;
    return;
  }

  warmupPromise = (async () => {
    log("warmup", "Priming llama context...");

    try {
      await runQueuedCompletion(() =>
        llamaContext!.completion({
          messages: [{ role: "user", content: "Reply with OK." }],
          n_predict: 8,
          temperature: 0,
          stop: ["\n", "</s>", "<|im_end|>", "<|endoftext|>", "<|end|>"],
        } as any),
      );
      log("warmup", "Warm-up complete");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log("warmup", "Warm-up failed:", msg);
    } finally {
      warmupComplete = true;
      warmupPromise = null;
    }
  })();

  await warmupPromise;
};

/**
 * Download (if needed) and initialise the llama.cpp context.
 * Uses a shared promise so concurrent calls wait for the same preparation.
 */
const prepareModel = async (): Promise<boolean> => {
  if (modelReady && llamaContext) return true;

  // If already preparing, wait for the same promise
  if (preparePromise) return preparePromise;

  preparePromise = doPrepareModel();
  const result = await preparePromise;
  preparePromise = null;
  return result;
};

const doPrepareModel = async (): Promise<boolean> => {
  prepareError = null;
  const runtimeAvailable = isNativeRuntimeAvailable();

  // Gate: skip the entire download + init if native runtime is missing
  if (nativeUnavailable || !runtimeAvailable) {
    const wasUnavailable = nativeUnavailable;
    nativeUnavailable = true;
    prepareError = "llama.rn native module is not available — requires a custom dev client build (expo run:android).";
    if (!wasUnavailable) {
      log("init", prepareError, {
        runtimeAvailable,
      });
    }
    return false;
  }

  try {
    const modelPath = await ensureModelDownloaded();
    if (!modelPath) {
      prepareError = "Model download failed";
      return false;
    }

    log("init", "Initialising llama context...");
    llamaContext = await initLlama({
      model: modelPath,
      n_ctx: 1024,
      n_gpu_layers: 0, // CPU-only — safe for emulators and all devices
      use_mlock: false,
      use_mmap: true,
    });

    await warmModel();
    modelReady = true;
    log("init", "LLM context ready");
    onModelReadyCallbacks.forEach((cb) => { try { cb(); } catch { /* ignore */ } });
    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    prepareError = msg;
    // If the error indicates missing native module, don't retry
    if (msg.includes("install") || msg.includes("null") || msg.includes("JSI")) {
      nativeUnavailable = true;
    }
    log("init", "Failed to initialise LLM:", msg);
    return false;
  }
};

/**
 * Run structured JSON generation.
 * Matches the contract: generateJson(payload) → Promise<string | object>
 */
const generateJson = async (payload: {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> => {
  if (!llamaContext) throw new Error("LLM not ready — call prepareModel first");

  const messages: Array<{ role: string; content: string }> = [];
  const jsonSystemPrompt = payload.systemPrompt
    ? `${payload.systemPrompt}\nReturn strict JSON only. Do not include markdown fences or extra commentary.`
    : "Return strict JSON only. Do not include markdown fences or extra commentary.";

  messages.push({ role: "system", content: jsonSystemPrompt });
  messages.push({ role: "user", content: payload.prompt });

  const result = await runQueuedCompletion(() =>
    llamaContext!.completion({
      messages,
      n_predict: payload.maxTokens ?? 650,
      temperature: payload.temperature ?? 0.2,
      stop: ["</s>", "<|im_end|>", "<|endoftext|>", "<|end|>"],
    } as any),
  );

  log("generate", `Tokens: ${result.timings?.predicted_n ?? "?"}, Time: ${Math.round(result.timings?.predicted_ms ?? 0)}ms`);
  return result.text;
};

/**
 * Run free-form text generation.
 * Matches the contract: generateText(prompt, options) → Promise<string>
 */
const generateText = async (
  prompt: string,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> => {
  if (!llamaContext) throw new Error("LLM not ready — call prepareModel first");

  const result = await runQueuedCompletion(() =>
    llamaContext!.completion({
      prompt,
      n_predict: options?.maxTokens ?? 650,
      temperature: options?.temperature ?? 0.3,
      stop: ["</s>", "<|im_end|>", "<|endoftext|>", "<|end|>"],
    } as any),
  );

  return result.text;
};

/**
 * Release the llama context and free memory.
 */
export const releaseModel = async (): Promise<void> => {
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch {
      // ignore
    }
    llamaContext = null;
  }
  modelReady = false;
  preparePromise = null;
  prepareError = null;
  warmupComplete = false;
  warmupPromise = null;
  backgroundStarted = false;
  log("release", "LLM context released");
};

/**
 * Register a callback to be called when the model becomes ready.
 * Returns an unsubscribe function.
 */
export const onModelReady = (callback: () => void): (() => void) => {
  if (modelReady && llamaContext) {
    // Already ready — fire immediately
    try { callback(); } catch { /* ignore */ }
    return () => {};
  }
  onModelReadyCallbacks.push(callback);
  return () => {
    onModelReadyCallbacks = onModelReadyCallbacks.filter((cb) => cb !== callback);
  };
};

/**
 * Get the last error from prepareModel, if any.
 */
export const getLastPrepareError = (): string | null => prepareError;

/**
 * Check if model preparation is currently in progress (downloading/initializing).
 */
export const isModelPreparing = (): boolean => preparePromise !== null;

/**
 * Start model download + initialization in background.
 * Call this early in app lifecycle so the model is ready by the time
 * the user navigates to AI features.
 */
let backgroundStarted = false;

export const startBackgroundPreparation = () => {
  if (backgroundStarted) return;
  if (modelReady && llamaContext) return;
  if (preparePromise) return; // already in progress
  if (nativeUnavailable) {
    if (!backgroundSkipLogged) {
      log("background", "Skipping preparation because native runtime is unavailable.");
      backgroundSkipLogged = true;
    }
    return; // already determined unavailable
  }

  backgroundStarted = true;
  log("background", "Starting background model preparation...");
  prepareModel().then((success) => {
    log("background", success ? "Model ready for inference" : "Model preparation failed");
  });
};

// ── Exported adapter object ──────────────────────────────────────────
// Shape matches OfflineLlmNativeModule so offlineLlmEnhancer can use it directly.

export const musikaLlmAdapter = {
  isModelReady,
  prepareModel,
  generateJson,
  generateText,
} as const;
