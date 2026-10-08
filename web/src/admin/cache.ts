import { BoundedCache } from '../utils/BoundedCache';

type AdminCacheEnvelope<T> = {
  timestamp: number;
  data: T;
};

const CACHE_PREFIX = 'admin-page-cache:v1:';
const CACHE_MAX_AGE_MS = 5 * 60_000;
const memoryCache = new BoundedCache<string, AdminCacheEnvelope<unknown>>(40, CACHE_MAX_AGE_MS);

const isBrowserSessionStorageAvailable = () => {
  try {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
  } catch {
    return false;
  }
};

const getStorageKey = (key: string) => `${CACHE_PREFIX}${key}`;

const isFresh = (timestamp: number, maxAgeMs: number) => {
  return Date.now() - timestamp <= maxAgeMs;
};

export const getAdminPageCacheKey = (scope: string, params?: unknown) => {
  if (params === undefined) {
    return scope;
  }

  return `${scope}:${JSON.stringify(params)}`;
};

export const readAdminPageCache = <T>(key: string, maxAgeMs: number): T | null => {
  const storageKey = getStorageKey(key);
  const inMemory = memoryCache.get(storageKey);

  if (inMemory) {
    if (isFresh(inMemory.timestamp, maxAgeMs)) {
      return inMemory.data as T;
    }

    memoryCache.delete(storageKey);
  }

  if (!isBrowserSessionStorageAvailable()) {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as AdminCacheEnvelope<T>;
    if (!parsed || typeof parsed.timestamp !== 'number') {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    if (!isFresh(parsed.timestamp, maxAgeMs)) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    memoryCache.set(storageKey, parsed as AdminCacheEnvelope<unknown>);
    return parsed.data;
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }

    return null;
  }
};

export const writeAdminPageCache = <T>(key: string, data: T) => {
  const storageKey = getStorageKey(key);
  const envelope: AdminCacheEnvelope<T> = {
    timestamp: Date.now(),
    data,
  };

  memoryCache.set(storageKey, envelope as AdminCacheEnvelope<unknown>);

  if (!isBrowserSessionStorageAvailable()) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(envelope));
    const entries: { key: string; timestamp: number }[] = [];
    const remove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index++) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      try {
        const cached = JSON.parse(window.sessionStorage.getItem(key) || 'null');
        if (!cached || !Number.isFinite(cached.timestamp) || Date.now() - cached.timestamp >= CACHE_MAX_AGE_MS) remove.push(key);
        else entries.push({ key, timestamp: cached.timestamp });
      } catch { remove.push(key); }
    }
    entries.sort((left, right) => right.timestamp - left.timestamp);
    remove.push(...entries.slice(40).map(entry => entry.key));
    remove.forEach(key => window.sessionStorage.removeItem(key));
  } catch {
    // Ignore storage write failures and keep the in-memory cache.
  }
};

export const invalidateAdminPageCache = (prefix?: string) => {
  const storagePrefix = getStorageKey(prefix || '');

  Array.from(memoryCache.keys()).forEach((key) => {
    if (key.startsWith(storagePrefix)) {
      memoryCache.delete(key);
    }
  });

  if (!isBrowserSessionStorageAvailable()) {
    return;
  }

  try {
    const keysToDelete: string[] = [];

    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const sessionKey = window.sessionStorage.key(index);
      if (sessionKey && sessionKey.startsWith(storagePrefix)) {
        keysToDelete.push(sessionKey);
      }
    }

    keysToDelete.forEach((sessionKey) => {
      window.sessionStorage.removeItem(sessionKey);
    });
  } catch {
    // Ignore storage cleanup failures.
  }
};
