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

// expo-device requires a native module that is only available in custom dev
// client builds (expo run:android / EAS).  In Expo Go the import throws
// "Cannot find native module 'ExpoDevice'" which would crash the entire
// module and make every export (including getLlmDeviceConfig) undefined.
let Device: { totalMemory: number | null } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Device = require("expo-device") as typeof import("expo-device");
} catch {
  // Expo Go — Device will stay null, detectDeviceConfig uses fallback.
}

// ── Model configuration ──────────────────────────────────────────────
// Small instruct model suitable for JSON generation on mobile.
// Override via setModelConfig() before first prepareModel() call.
let MODEL_DOWNLOAD_URL =
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
let MODEL_FILENAME = "qwen2.5-0.5b-instruct-q4_k_m.gguf";

// ── RAM-based context configuration ─────────────────────────────────

export interface LlmDeviceConfig {
  nCtx: number;
  ramTierLabel: string;
  totalRamGB: number | null;
  nBatch: number;
  nThreads: number;
}

export interface LlmDeviceCapabilityInfo {
  config: LlmDeviceConfig;
  summaryText: string;
  limitationText: string;
  maxCandidateCap: number;
  maxTokens: number;
  timeoutMs: number;
}

interface LlmRamTierProfile {
  minDetectedRamGB: number;
  label: string;
  nCtx: number;
  nBatch: number;
  nThreads: number;
  maxCandidateCap: number;
  maxTokens: number;
  timeoutMs: number;
  limitationText: string;
}

const LLM_RAM_TIER_PROFILES: LlmRamTierProfile[] = [
  {
    minDetectedRamGB: 7.5,
    label: "8 GB",
    nCtx: 8192,
    nBatch: 512,
    nThreads: 6,
    maxCandidateCap: 14,
    maxTokens: 260,
    timeoutMs: 32000,
    limitationText:
      "Current device limit: up to 14 candidate instruments, 260 AI output tokens, and a 32s local generation window.",
  },
  {
    minDetectedRamGB: 5.5,
    label: "6 GB",
    nCtx: 4096,
    nBatch: 384,
    nThreads: 5,
    maxCandidateCap: 12,
    maxTokens: 220,
    timeoutMs: 28000,
    limitationText:
      "Current device limit: up to 12 candidate instruments, 220 AI output tokens, and a 28s local generation window.",
  },
  {
    minDetectedRamGB: 3.5,
    label: "4 GB",
    nCtx: 3072,
    nBatch: 320,
    nThreads: 4,
    maxCandidateCap: 10,
    maxTokens: 180,
    timeoutMs: 24000,
    limitationText:
      "Current device limit: up to 10 candidate instruments, 180 AI output tokens, and a 24s local generation window.",
  },
  {
    minDetectedRamGB: 2.5,
    label: "3 GB",
    nCtx: 2048,
    nBatch: 256,
    nThreads: 3,
    maxCandidateCap: 8,
    maxTokens: 140,
    timeoutMs: 22000,
    limitationText:
      "Current device limit: up to 8 candidate instruments, 140 AI output tokens, and a 22s local generation window.",
  },
  {
    minDetectedRamGB: 1.75,
    label: "2 GB",
    nCtx: 1536,
    nBatch: 192,
    nThreads: 2,
    maxCandidateCap: 7,
    maxTokens: 120,
    timeoutMs: 21000,
    limitationText:
      "This device runs AI in compact mode: up to 7 candidate instruments, 120 AI output tokens, and a 21s local generation window. Broader requests may fall back to smart local ranking.",
  },
  {
    minDetectedRamGB: 0,
    label: "<2 GB",
    nCtx: 1024,
    nBatch: 128,
    nThreads: 2,
    maxCandidateCap: 6,
    maxTokens: 100,
    timeoutMs: 20000,
    limitationText:
      "This device runs AI in compact mode: up to 6 candidate instruments, 100 AI output tokens, and a 20s local generation window. Broader requests may fall back to smart local ranking.",
  },
];

let deviceConfig: LlmDeviceConfig | null = null;

const buildDeviceSummaryText = (config: LlmDeviceConfig): string => {
  if (config.totalRamGB != null) {
    return `Context: ${config.nCtx.toLocaleString()} tokens \u00B7 ${config.ramTierLabel} RAM tier`;
  }

  return `Context: ${config.nCtx.toLocaleString()} tokens \u00B7 RAM not detected`;
};

const resolveLlmRamTier = (totalRamGB: number | null): LlmRamTierProfile | null => {
  if (totalRamGB == null) {
    return null;
  }

  return (
    LLM_RAM_TIER_PROFILES.find((profile) => totalRamGB >= profile.minDetectedRamGB) ??
    LLM_RAM_TIER_PROFILES[LLM_RAM_TIER_PROFILES.length - 1]
  );
};

const buildLlmDeviceCapabilityInfo = (
  config: LlmDeviceConfig,
): LlmDeviceCapabilityInfo => {
  const summaryText = buildDeviceSummaryText(config);

  const tier = resolveLlmRamTier(config.totalRamGB);
  if (!tier) {
    return {
      config,
      summaryText,
      limitationText:
        "RAM could not be detected, so AI stays in the safest compact mode: up to 6 candidate instruments, 100 AI output tokens, and a 20s local generation window.",
      maxCandidateCap: 6,
      maxTokens: 100,
      timeoutMs: 20000,
    };
  }

  return {
    config,
    summaryText,
    limitationText: tier.limitationText,
    maxCandidateCap: tier.maxCandidateCap,
    maxTokens: tier.maxTokens,
    timeoutMs: tier.timeoutMs,
  };
};

const detectDeviceConfig = (): LlmDeviceConfig => {
  if (deviceConfig) return deviceConfig;

  const totalBytes = Device?.totalMemory ?? null;
  if (totalBytes == null) {
    deviceConfig = {
      nCtx: 1024,
      ramTierLabel: "Unknown RAM",
      totalRamGB: null,
      nBatch: 128,
      nThreads: 2,
    };
    log("config", "Device.totalMemory unavailable — using fallback n_ctx=1024");
  } else {
    const totalGB = totalBytes / (1024 ** 3);
    const roundedTotalGB = Math.round(totalGB * 10) / 10;
    const tier = resolveLlmRamTier(roundedTotalGB) ?? LLM_RAM_TIER_PROFILES[LLM_RAM_TIER_PROFILES.length - 1];

    deviceConfig = {
      nCtx: tier.nCtx,
      ramTierLabel: tier.label,
      totalRamGB: roundedTotalGB,
      nBatch: tier.nBatch,
      nThreads: tier.nThreads,
    };
    log(
      "config",
      `RAM: ${roundedTotalGB} GB measured, using ${tier.label} tier with n_ctx=${tier.nCtx}, n_batch=${tier.nBatch}, n_threads=${tier.nThreads}`,
    );
  }

  const capabilityInfo = buildLlmDeviceCapabilityInfo(deviceConfig);
  console.log("[MusikaLLM:deviceConfig]", {
    totalRamGB: deviceConfig.totalRamGB,
    ramTier: deviceConfig.ramTierLabel,
    nCtx: deviceConfig.nCtx,
    nBatch: deviceConfig.nBatch,
    nThreads: deviceConfig.nThreads,
    maxCandidates: capabilityInfo.maxCandidateCap,
    maxTokens: capabilityInfo.maxTokens,
    timeoutMs: capabilityInfo.timeoutMs,
    limitation: capabilityInfo.limitationText,
  });
  return deviceConfig;
};

/**
 * Returns the RAM-based LLM configuration for this device.
 * Safe to call at any time — detection is lazy and cached.
 */
export const getLlmDeviceConfig = (): LlmDeviceConfig => detectDeviceConfig();

export const getLlmDeviceCapabilityInfo = (): LlmDeviceCapabilityInfo =>
  buildLlmDeviceCapabilityInfo(detectDeviceConfig());

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
const NATIVE_RUNTIME_UNAVAILABLE_ERROR =
  "llama.rn native module is not available — requires a custom dev client build (expo run:android).";

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
export const isNativeRuntimeAvailable = (): boolean => {
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

export const waitForIdle = async (): Promise<void> => {
  await completionQueue.catch(() => {});
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
  if (!runtimeAvailable) {
    const wasUnavailable = nativeUnavailable;
    nativeUnavailable = true;
    prepareError = NATIVE_RUNTIME_UNAVAILABLE_ERROR;
    if (!wasUnavailable) {
      log("init", prepareError, {
        runtimeAvailable,
      });
    }
    return false;
  }

  if (nativeUnavailable) {
    nativeUnavailable = false;
    backgroundSkipLogged = false;
    log("init", "Native runtime became available. Retrying model preparation...");
  }

  try {
    const modelPath = await ensureModelDownloaded();
    if (!modelPath) {
      prepareError = "Model download failed";
      return false;
    }

    log("init", "Initialising llama context...");
    const config = detectDeviceConfig();
    log(
      "init",
      `Using n_ctx=${config.nCtx}, n_batch=${config.nBatch}, n_threads=${config.nThreads} (${config.ramTierLabel} RAM detected)`,
    );
    llamaContext = await initLlama({
      model: modelPath,
      n_ctx: config.nCtx,
      n_batch: config.nBatch,
      n_threads: config.nThreads,
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
  const startedAt = Date.now();

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

  const wallMs = Date.now() - startedAt;
  log(
    "generate",
    `Tokens: ${result.timings?.predicted_n ?? "?"}, Time: ${Math.round(result.timings?.predicted_ms ?? 0)}ms, Wall: ${wallMs}ms`,
  );
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
  const startedAt = Date.now();

  const result = await runQueuedCompletion(() =>
    llamaContext!.completion({
      prompt,
      n_predict: options?.maxTokens ?? 650,
      temperature: options?.temperature ?? 0.3,
      stop: ["</s>", "<|im_end|>", "<|endoftext|>", "<|end|>"],
    } as any),
  );

  const wallMs = Date.now() - startedAt;
  log(
    "generate",
    `Tokens: ${result.timings?.predicted_n ?? "?"}, Time: ${Math.round(result.timings?.predicted_ms ?? 0)}ms, Wall: ${wallMs}ms`,
  );
  return result.text;
};

/**
 * Cancel any in-progress completion.
 * Call this before retrying to avoid queueing behind a timed-out generation.
 */
export const stopGeneration = (): void => {
  if (llamaContext) {
    try {
      llamaContext.stopCompletion();
    } catch { /* ignore */ }
  }
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
  if (modelReady && llamaContext) return;
  if (preparePromise) return; // already in progress
  if (backgroundStarted) return;

  const runtimeAvailable = isNativeRuntimeAvailable();
  if (!runtimeAvailable) {
    nativeUnavailable = true;
    prepareError = NATIVE_RUNTIME_UNAVAILABLE_ERROR;
    if (!backgroundSkipLogged) {
      log("background", "Skipping preparation because native runtime is unavailable.");
      backgroundSkipLogged = true;
    }
    return;
  }

  nativeUnavailable = false;
  backgroundSkipLogged = false;

  backgroundStarted = true;
  log("background", "Starting background model preparation...");
  prepareModel().then((success) => {
    log("background", success ? "Model ready for inference" : "Model preparation failed");
    if (!success) {
      backgroundStarted = false;
    }
  }).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    prepareError = msg;
    backgroundStarted = false;
    log("background", "Model preparation crashed", msg);
  });
};

// ── Exported adapter object ──────────────────────────────────────────
// Shape matches OfflineLlmNativeModule so offlineLlmEnhancer can use it directly.

export const musikaLlmAdapter = {
  isModelReady,
  prepareModel,
  generateJson,
  generateText,
  waitForIdle,
} as const;
