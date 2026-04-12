import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEnvelope<T> = {
  timestamp: number;
  data: T;
};

const CACHE_PREFIX = 'mobile-screen-cache:v1:';
const memoryCache = new Map<string, CacheEnvelope<unknown>>();

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

export const readScreenCache = async <T>(
  key: string,
  maxAgeMs: number,
): Promise<T | null> => {
  const storageKey = getStorageKey(key);
  const inMemory = memoryCache.get(storageKey);

  if (inMemory) {
    if (isFresh(inMemory.timestamp, maxAgeMs)) {
      return inMemory.data as T;
    }

    memoryCache.delete(storageKey);
  }

  try {
    const rawValue = await AsyncStorage.getItem(storageKey);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.timestamp !== 'number') {
      await AsyncStorage.removeItem(storageKey);
      return null;
    }

    if (!isFresh(parsed.timestamp, maxAgeMs)) {
      await AsyncStorage.removeItem(storageKey);
      return null;
    }

    memoryCache.set(storageKey, parsed as CacheEnvelope<unknown>);
    return parsed.data;
  } catch {
    try {
      await AsyncStorage.removeItem(storageKey);
    } catch {
      // Ignore cache cleanup failures.
    }

    return null;
  }
};

export const writeScreenCache = async <T>(key: string, data: T): Promise<void> => {
  const storageKey = getStorageKey(key);
  const envelope: CacheEnvelope<T> = {
    timestamp: Date.now(),
    data,
  };

  memoryCache.set(storageKey, envelope as CacheEnvelope<unknown>);

  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // Cache write failures should never block the UI.
  }
};

export const invalidateScreenCache = async (prefix?: string): Promise<void> => {
  const storagePrefix = getStorageKey(prefix || '');

  Array.from(memoryCache.keys()).forEach((key) => {
    if (key.startsWith(storagePrefix)) {
      memoryCache.delete(key);
    }
  });

  try {
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter((key) => key.startsWith(storagePrefix));
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch {
    // Ignore cache cleanup failures.
  }
};