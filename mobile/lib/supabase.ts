import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const projectRef = (() => {
    try {
        return new URL(supabaseUrl).hostname.split('.')[0];
    } catch {
        return 'musika-lokal';
    }
})();

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL or Anon Key is missing! Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.');
}

// Custom storage adapter that works on both web and native
const ExpoSecureStorage = {
    getItem: async (key: string) => {
        if (Platform.OS === 'web') {
            return localStorage.getItem(key);
        }
        return AsyncStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
        if (Platform.OS === 'web') {
            localStorage.setItem(key, value);
            return;
        }
        return AsyncStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
        if (Platform.OS === 'web') {
            localStorage.removeItem(key);
            return;
        }
        return AsyncStorage.removeItem(key);
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ExpoSecureStorage,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
    },
    global: {
        headers: {
            'x-client-info': 'musika-lokal',
        },
    },
    db: {
        schema: 'public',
    },
    realtime: {
        timeout: 30000,
    },
});

export const clearSupabaseAuthStorage = async () => {
    invalidateTokenCache();
    await ExpoSecureStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
};

// Monkey-patch functions.invoke for React Native/Hermes compatibility
// Workaround for @supabase/functions-js custom Error class instantiation issues
// See: https://github.com/supabase/functions-js/issues/16
//
// IMPORTANT: In supabase-js v2.93+, `supabase.functions` is a getter that
// creates a NEW FunctionsClient on every access.  We must capture a single
// instance, patch it, and then replace the getter with a stable reference
// so that every call to `supabase.functions.invoke(...)` uses our patched
// version (auto-token injection + retry-on-401).
const _functionsInstance = supabase.functions;               // capture one instance
const originalInvoke = _functionsInstance.invoke.bind(_functionsInstance) as any;
type InvokeOptions = { body?: any; headers?: Record<string, string> };
type NormalizedFunctionsError = Error & {
    context?: unknown;
    code?: string | number;
    details?: string;
    hint?: string;
    status?: number;
};

const FUNCTIONS_INVOKE_DEBUG_LOGS = false;

const isJwtLike = (token?: string | null): token is string => {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
};

// In-memory token cache so we don't call refreshSession() on every invoke.
// Token is considered stale after TOKEN_CACHE_TTL_MS and re-refreshed.
const TOKEN_CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60 * 1000; // 1 minute
const REFRESH_FAILURE_COOLDOWN_MS = 30 * 1000; // 30 seconds
const REFRESH_RATE_LIMIT_COOLDOWN_MS = 60 * 1000; // 1 minute
let _cachedToken: string | null = null;
let _cachedTokenAt = 0;
let _refreshCooldownUntil = 0;
let _refreshInFlight: Promise<string | null> | null = null;

// Invalidate the cache (e.g. on sign-out or auth change)
export const invalidateTokenCache = () => {
    _cachedToken = null;
    _cachedTokenAt = 0;
    _refreshCooldownUntil = 0;
    _refreshInFlight = null;
};

const refreshAccessToken = async (): Promise<string | null> => {
    if (_refreshInFlight) {
        return _refreshInFlight;
    }

    if (Date.now() < _refreshCooldownUntil) {
        return null;
    }

    _refreshInFlight = (async () => {
        try {
            const {
                data: { session: refreshedSession },
                error: refreshError,
            } = await supabase.auth.refreshSession();

            if (!refreshError && refreshedSession?.access_token && isJwtLike(refreshedSession.access_token)) {
                _cachedToken = refreshedSession.access_token;
                _cachedTokenAt = Date.now();
                _refreshCooldownUntil = 0;
                return _cachedToken;
            }

            const refreshStatus = Number((refreshError as any)?.status || 0);
            _refreshCooldownUntil =
                Date.now() +
                (refreshStatus === 429 ? REFRESH_RATE_LIMIT_COOLDOWN_MS : REFRESH_FAILURE_COOLDOWN_MS);

            if (__DEV__ && refreshStatus === 429) {
                console.warn('[supabase.functions.invoke] refreshSession rate-limited; temporarily skipping token refresh attempts');
            }

            return null;
        } catch {
            _refreshCooldownUntil = Date.now() + REFRESH_FAILURE_COOLDOWN_MS;
            return null;
        } finally {
            _refreshInFlight = null;
        }
    })();

    return _refreshInFlight;
};

/**
 * Resolve an access token safely for Edge Function auth.
 * Strategy: cache -> current session token -> refresh -> fallback session token.
 * This minimizes refresh-token rotation races while still recovering from
 * stale or near-expiry tokens.
 */
const getFreshAccessToken = async (): Promise<string | null> => {
    // 1. Return in-memory cached token if it's still young
    const now = Date.now();
    if (_cachedToken && isJwtLike(_cachedToken) && now - _cachedTokenAt < TOKEN_CACHE_TTL_MS) {
        return _cachedToken;
    }

    // 2. Prefer currently persisted session token first to avoid unnecessary
    // refresh-token rotation races across concurrent callers.
    try {
        const {
            data: { session: currentSession },
            error: currentSessionError,
        } = await supabase.auth.getSession();

        if (!currentSessionError && currentSession?.access_token && isJwtLike(currentSession.access_token)) {
            const expiresAtMs = (currentSession.expires_at || 0) * 1000;
            const isNearExpiry = expiresAtMs > 0 && expiresAtMs - now <= TOKEN_REFRESH_SAFETY_WINDOW_MS;

            if (!isNearExpiry) {
                _cachedToken = currentSession.access_token;
                _cachedTokenAt = now;
                return _cachedToken;
            }
        }
    } catch {
        // ignore and continue with refresh path
    }

    // 3. If token is missing/near expiry, refresh once.
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
        return refreshedToken;
    }

    // 4. Fallback to any persisted session token if refresh failed transiently.
    try {
        const {
            data: { session: fallbackSession },
        } = await supabase.auth.getSession();

        if (fallbackSession?.access_token && isJwtLike(fallbackSession.access_token)) {
            _cachedToken = fallbackSession.access_token;
            _cachedTokenAt = Date.now();
            return _cachedToken;
        }
    } catch {
        // ignore
    }

    return null;
};

const normalizeFunctionsError = (
    rawError: any,
    fallbackMessage: string,
): NormalizedFunctionsError => {
    const message =
        typeof rawError?.message === 'string' && rawError.message.trim().length > 0
            ? rawError.message
            : fallbackMessage;

    const normalizedError = new Error(message) as NormalizedFunctionsError;

    if (rawError && typeof rawError === 'object') {
        if ('context' in rawError) {
            normalizedError.context = rawError.context;
        }
        if ('code' in rawError) {
            normalizedError.code = rawError.code;
        }
        if ('details' in rawError) {
            normalizedError.details = rawError.details;
        }
        if ('hint' in rawError) {
            normalizedError.hint = rawError.hint;
        }
        if ('status' in rawError) {
            normalizedError.status = rawError.status;
        }
    }

    return normalizedError;
};

const isInvalidJwtError = (rawError: any): boolean => {
    const message = String(rawError?.message || '').toLowerCase();
    const details = String(rawError?.details || '').toLowerCase();
    const hint = String(rawError?.hint || '').toLowerCase();
    const contextMessage = String(rawError?.context?.message || '').toLowerCase();

    return (
        message.includes('invalid jwt') ||
        details.includes('invalid jwt') ||
        hint.includes('invalid jwt') ||
        contextMessage.includes('invalid jwt') ||
        message.includes('jwt') ||
        details.includes('jwt') ||
        hint.includes('jwt') ||
        contextMessage.includes('jwt')
    );
};

const hasAuthorizationHeader = (options?: InvokeOptions): boolean => {
    if (!options?.headers) {
        return false;
    }

    return Object.keys(options.headers).some((header) => header.toLowerCase() === 'authorization');
};

const withSessionAuthorization = async (
    options?: InvokeOptions,
): Promise<InvokeOptions | undefined> => {
    const mergedHeaders: Record<string, string> = {
        ...(options?.headers || {}),
    };

    const alreadyHasAuthorizationHeader = Object.keys(mergedHeaders).some(
        (header) => header.toLowerCase() === 'authorization',
    );

    if (!alreadyHasAuthorizationHeader) {
        try {
            const token = await getFreshAccessToken();
            if (token) {
                mergedHeaders.Authorization = `Bearer ${token}`;
                if (__DEV__ && FUNCTIONS_INVOKE_DEBUG_LOGS) {
                    console.log('[supabase.functions.invoke] Attached access token', {
                        tokenLength: token.length,
                        tokenPrefix: token.slice(0, 16),
                        isJwtLike: isJwtLike(token),
                    });
                }
            } else if (__DEV__ && FUNCTIONS_INVOKE_DEBUG_LOGS) {
                console.warn('[supabase.functions.invoke] No access token available; invoke will continue without user Authorization header');
            }
        } catch {
            // ignore auth header hydration failures and let invoke proceed
        }
    } else if (__DEV__ && FUNCTIONS_INVOKE_DEBUG_LOGS) {
        console.log('[supabase.functions.invoke] Using caller-supplied Authorization header');
    }

    return {
        ...(options || {}),
        headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
    };
};

const withoutAuthorizationHeader = (options?: InvokeOptions): InvokeOptions | undefined => {
    if (!options?.headers) {
        return options;
    }

    const filteredHeaders = Object.fromEntries(
        Object.entries(options.headers).filter(([header]) => header.toLowerCase() !== 'authorization'),
    );

    return {
        ...options,
        headers: Object.keys(filteredHeaders).length > 0 ? filteredHeaders : undefined,
    };
};

(_functionsInstance as any).invoke = async function<T = any>(
    functionName: string,
    options?: InvokeOptions,
): Promise<{ data: T | null; error: Error | null }> {
    try {
        const invokeOptions = await withSessionAuthorization(options);
        const firstAttemptHadAuthorization = hasAuthorizationHeader(invokeOptions);
        let result = (await originalInvoke(functionName, invokeOptions)) as {
            data: T | null;
            error: any;
        };

        if (result.error && firstAttemptHadAuthorization && isInvalidJwtError(result.error)) {
            console.warn('[supabase.functions.invoke] Invalid JWT detected, retrying once with refreshed session', {
                functionName,
                message: result.error?.message,
                status: result.error?.status,
                code: result.error?.code,
            });

            invalidateTokenCache();

            await refreshAccessToken();

            const retryOptions = await withSessionAuthorization(withoutAuthorizationHeader(options));
            result = (await originalInvoke(functionName, retryOptions)) as {
                data: T | null;
                error: any;
            };
        }

        if (result.error) {
            // Convert FunctionsError to plain Error for Hermes compatibility
            return {
                data: null,
                error: normalizeFunctionsError(result.error, 'Function invocation failed'),
            };
        }
        return { data: result.data ?? null, error: null };
    } catch (err) {
        // Catch any instantiation errors from functions-js error classes
        return {
            data: null,
            error: normalizeFunctionsError(err, 'Unknown error invoking function'),
        };
    }
};

// Bust token cache on auth changes so subsequent invokes hydrate from
// the latest persisted session state.
supabase.auth.onAuthStateChange(() => {
    invalidateTokenCache();
});

// Replace the getter with a stable property returning our patched instance.
// This ensures `supabase.functions.invoke(...)` always uses the monkey-patched
// version instead of creating a new un-patched FunctionsClient each time.
Object.defineProperty(supabase, 'functions', {
    get: () => _functionsInstance,
    configurable: true,
});
