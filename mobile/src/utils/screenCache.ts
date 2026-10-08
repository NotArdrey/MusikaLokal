import AsyncStorage from '@react-native-async-storage/async-storage';
import { BoundedCache } from './BoundedCache';

type CacheEnvelope<T> = {
  timestamp: number;
  data: T;
};

const CACHE_PREFIX = 'mobile-screen-cache:v1:';
const CACHE_MAX_AGE_MS = 5 * 60_000;
const MAX_STORED_ENTRIES = 80;
const MAX_ENTRY_CHARACTERS = 256_000;
const memoryCache = new BoundedCache<string, CacheEnvelope<unknown>>(40, CACHE_MAX_AGE_MS);
const storedEntries = new Map<string, number>();
let storageInitialized = false;
let storageQueue: Promise<void> = Promise.resolve();
let invalidationRevision = 0;

const queueStorage = <T>(task: () => Promise<T>, fallback: T): Promise<T> => {
  const result = storageQueue.then(task);
  storageQueue = result.then(() => undefined, () => undefined);
  return result.catch(() => fallback);
};

const pruneStoredEntries = async () => {
  const now = Date.now();
  const remove = [...storedEntries].filter(([, timestamp]) => now - timestamp >= CACHE_MAX_AGE_MS)
    .map(([key]) => key);
  remove.forEach(key => storedEntries.delete(key));
  while (storedEntries.size > MAX_STORED_ENTRIES) {
    const oldest = storedEntries.keys().next();
    if (oldest.done) break;
    storedEntries.delete(oldest.value);
    remove.push(oldest.value);
  }
  if (remove.length) await AsyncStorage.multiRemove(remove);
};

const initializeStorage = async () => {
  if (storageInitialized) return;
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(CACHE_PREFIX));
  const timestamps: [string, number][] = [];
  const invalid: string[] = [];
  // Process old caches in batches instead of materializing their full payloads together.
  for (let offset = 0; offset < keys.length; offset += 20) {
    const batch = await AsyncStorage.multiGet(keys.slice(offset, offset + 20));
    for (const [key, raw] of batch) {
      try {
        const parsed = raw && raw.length <= MAX_ENTRY_CHARACTERS ? JSON.parse(raw) : null;
        if (!parsed || !Number.isFinite(parsed.timestamp)) invalid.push(key);
        else timestamps.push([key, parsed.timestamp]);
      } catch { invalid.push(key); }
    }
  }
  timestamps.sort((left, right) => left[1] - right[1]);
  timestamps.forEach(([key, timestamp]) => storedEntries.set(key, timestamp));
  if (invalid.length) await AsyncStorage.multiRemove(invalid);
  await pruneStoredEntries();
  storageInitialized = true;
};

const getStorageKey = (key: string) => `${CACHE_PREFIX}${key}`;

const isFresh = (timestamp: number, maxAgeMs: number) => {
  return Date.now() - timestamp <= maxAgeMs;
};

export const getScreenCacheKey = (scope: string, params?: unknown) => {
  if (params === undefined) {
    return scope;
  }

  return `${scope}:${JSON.stringify(params)}`;
};

export const peekScreenCache = <T>(key: string, maxAgeMs: number): T | null => {
  const storageKey = getStorageKey(key);
  const inMemory = memoryCache.get(storageKey);

  if (!inMemory) {
    return null;
  }

  if (!isFresh(inMemory.timestamp, maxAgeMs)) {
    memoryCache.delete(storageKey);
    return null;
  }

  return inMemory.data as T;
};

export const readScreenCache = async <T>(
  key: string,
  maxAgeMs: number,
): Promise<T | null> => {
  const storageKey = getStorageKey(key);
  const revision = invalidationRevision;
  const inMemory = memoryCache.get(storageKey);

  if (inMemory) {
    if (isFresh(inMemory.timestamp, maxAgeMs)) {
      return inMemory.data as T;
    }

    memoryCache.delete(storageKey);
  }

  return queueStorage(async () => {
    if (revision !== invalidationRevision) return null;
    await initializeStorage();
    await pruneStoredEntries();
    const rawValue = await AsyncStorage.getItem(storageKey);
    if (revision !== invalidationRevision) return null;
    if (!rawValue) return null;
    if (rawValue.length > MAX_ENTRY_CHARACTERS) {
      await AsyncStorage.removeItem(storageKey);
      storedEntries.delete(storageKey);
      return null;
    }

    const parsed = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (!parsed || !Number.isFinite(parsed.timestamp)) {
      await AsyncStorage.removeItem(storageKey);
      storedEntries.delete(storageKey);
      return null;
    }

    if (!isFresh(parsed.timestamp, maxAgeMs)) {
      await AsyncStorage.removeItem(storageKey);
      storedEntries.delete(storageKey);
      return null;
    }

    const current = memoryCache.get(storageKey);
    if (current && current.timestamp >= parsed.timestamp && isFresh(current.timestamp, maxAgeMs)) {
      return current.data as T;
    }
    memoryCache.set(storageKey, parsed as CacheEnvelope<unknown>);
    return parsed.data;
  }, null);
};

export const writeScreenCache = async <T>(key: string, data: T): Promise<void> => {
  const storageKey = getStorageKey(key);
  const envelope: CacheEnvelope<T> = {
    timestamp: Date.now(),
    data,
  };

  try {
    const serialized = JSON.stringify(envelope);
    if (serialized.length > MAX_ENTRY_CHARACTERS) {
      memoryCache.delete(storageKey);
      await queueStorage(async () => {
        await initializeStorage();
        storedEntries.delete(storageKey);
        await AsyncStorage.removeItem(storageKey);
      }, undefined);
      return;
    }
    memoryCache.set(storageKey, envelope as CacheEnvelope<unknown>);
    await queueStorage(async () => {
      await initializeStorage();
      await AsyncStorage.setItem(storageKey, serialized);
      storedEntries.delete(storageKey);
      storedEntries.set(storageKey, envelope.timestamp);
      await pruneStoredEntries();
    }, undefined);
  } catch {
    // Cache write failures should never block the UI.
  }
};

export const invalidateScreenCache = async (prefix?: string): Promise<void> => {
  ++invalidationRevision;
  const storagePrefix = getStorageKey(prefix || '');

  Array.from(memoryCache.keys()).forEach((key) => {
    if (key.startsWith(storagePrefix)) {
      memoryCache.delete(key);
    }
  });

  await queueStorage(async () => {
    await initializeStorage();
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter((key) => key.startsWith(storagePrefix));
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
      keysToRemove.forEach(key => storedEntries.delete(key));
    }
  }, undefined);
};
