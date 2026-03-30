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
const originalInvoke = supabase.functions.invoke.bind(supabase.functions) as any;
type InvokeOptions = { body?: any; headers?: Record<string, string> };
type NormalizedFunctionsError = Error & {
    context?: unknown;
    code?: string | number;
    details?: string;
    hint?: string;
    status?: number;
};

const isJwtLike = (token?: string | null): token is string => {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
};

// In-memory token cache so we don't call refreshSession() on every invoke.
// Token is considered stale after TOKEN_CACHE_TTL_MS and re-refreshed.
const TOKEN_CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60 * 1000; // 1 minute
let _cachedToken: string | null = null;
let _cachedTokenAt = 0;

// Invalidate the cache (e.g. on sign-out or auth change)
export const invalidateTokenCache = () => {
    _cachedToken = null;
    _cachedTokenAt = 0;
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
    try {
        const {
            data: { session: refreshedSession },
            error: refreshError,
        } = await supabase.auth.refreshSession();

        if (!refreshError && refreshedSession?.access_token && isJwtLike(refreshedSession.access_token)) {
            _cachedToken = refreshedSession.access_token;
            _cachedTokenAt = Date.now();
            return _cachedToken;
        }
    } catch {
        // ignore — return null below
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
    const status = Number(rawError?.status || rawError?.code || 0);
    const contextStatus = Number(rawError?.context?.status || 0);

    return (
        message.includes('invalid jwt') ||
        details.includes('invalid jwt') ||
        hint.includes('invalid jwt') ||
        contextMessage.includes('invalid jwt') ||
        status === 401 ||
        contextStatus === 401
    );
};

const withSessionAuthorization = async (
    options?: InvokeOptions,
): Promise<InvokeOptions | undefined> => {
    const mergedHeaders: Record<string, string> = {
        ...(options?.headers || {}),
    };

    const hasAuthorizationHeader = Object.keys(mergedHeaders).some(
        (header) => header.toLowerCase() === 'authorization',
    );

    if (!hasAuthorizationHeader) {
        try {
            const token = await getFreshAccessToken();
            if (token) {
                mergedHeaders.Authorization = `Bearer ${token}`;
                if (__DEV__) {
                    console.log('[supabase.functions.invoke] Attached access token', {
                        tokenLength: token.length,
                        tokenPrefix: token.slice(0, 16),
                        isJwtLike: isJwtLike(token),
                    });
                }
            } else if (__DEV__) {
                console.warn('[supabase.functions.invoke] No access token available; invoke will continue without user Authorization header');
            }
        } catch {
            // ignore auth header hydration failures and let invoke proceed
        }
    } else if (__DEV__) {
        console.log('[supabase.functions.invoke] Using caller-supplied Authorization header');
    }

    return {
        ...(options || {}),
        headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
    };
};

(supabase.functions as any).invoke = async function<T = any>(
    functionName: string,
    options?: InvokeOptions,
): Promise<{ data: T | null; error: Error | null }> {
    try {
        const invokeOptions = await withSessionAuthorization(options);
        let result = (await originalInvoke(functionName, invokeOptions)) as {
            data: T | null;
            error: any;
        };

        if (result.error && isInvalidJwtError(result.error)) {
            console.warn('[supabase.functions.invoke] Invalid JWT detected, retrying once with refreshed session', {
                functionName,
                message: result.error?.message,
                status: result.error?.status,
                code: result.error?.code,
            });

            invalidateTokenCache();

            try {
                await supabase.auth.refreshSession();
            } catch {
                // ignore refresh errors; retry invoke anyway so caller receives final error context
            }

            const retryOptions = await withSessionAuthorization(options);
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

// Bust the token cache on every auth state change so the next invoke
// always calls refreshSession() for a gateway-verified fresh token.
supabase.auth.onAuthStateChange(() => {
    invalidateTokenCache();
});
