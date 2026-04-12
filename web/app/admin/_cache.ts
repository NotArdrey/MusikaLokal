type AdminCacheEnvelope<T> = {
  timestamp: number;
  data: T;
};

const CACHE_PREFIX = 'admin-page-cache:v1:';
const memoryCache = new Map<string, AdminCacheEnvelope<unknown>>();

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