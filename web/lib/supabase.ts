import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const readEnv = (...candidates: Array<string | undefined>): string => {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }

    return '';
};

const configuredSupabaseUrl = readEnv(
    Constants.expoConfig?.extra?.supabaseUrl,
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
);

const configuredSupabaseAnonKey = readEnv(
    Constants.expoConfig?.extra?.supabaseAnonKey,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
);

const hasSupabaseConfig = Boolean(configuredSupabaseUrl && configuredSupabaseAnonKey);

// Avoid hard crashes on import when environment variables are missing.
export const supabaseUrl = configuredSupabaseUrl || 'https://placeholder.supabase.co';
export const supabaseAnonKey = configuredSupabaseAnonKey || 'missing-anon-key';

const projectRef = (() => {
    try {
        return new URL(supabaseUrl).hostname.split('.')[0];
    } catch {
        return 'musika-lokal';
    }
})();

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

if (!hasSupabaseConfig) {
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

const isJwtLike = (token?: string | null): token is string => {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
};

const parseJwtPayload = (token?: string | null): Record<string, unknown> | null => {
    if (!isJwtLike(token)) return null;

    try {
        const payloadPart = token.split('.')[1];
        const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const atobFn = (globalThis as { atob?: (value: string) => string }).atob;
        if (typeof atobFn !== 'function') return null;

        const parsed = JSON.parse(atobFn(padded));
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
};

const getJwtExpiryMs = (token?: string | null): number | null => {
    const payload = parseJwtPayload(token);
    if (!payload) return null;

    const rawExp = payload.exp;
    const expSeconds =
        typeof rawExp === 'number'
            ? rawExp
            : typeof rawExp === 'string'
                ? Number(rawExp)
                : NaN;

    if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
        return null;
    }

    return expSeconds * 1000;
};

const getJwtExpiresInSeconds = (token?: string | null): number | null => {
    const expMs = getJwtExpiryMs(token);
    if (!expMs) return null;
    return Math.floor((expMs - Date.now()) / 1000);
};

const isJwtExpiredOrNearExpiry = (
    token?: string | null,
    safetyWindowMs = 0,
): boolean => {
    const expMs = getJwtExpiryMs(token);
    if (!expMs) return false;
    return expMs - Date.now() <= Math.max(0, safetyWindowMs);
};

const getJwtStringClaim = (token: string, key: string): string | null => {
    const payload = parseJwtPayload(token);
    if (!payload) return null;

    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }

    return null;
};

const getJwtAudienceClaim = (token: string): string | null => {
    const payload = parseJwtPayload(token);
    if (!payload) return null;

    const value = payload.aud;
    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }

    if (Array.isArray(value)) {
        const normalized = value
            .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => String(entry).trim());
        return normalized.length > 0 ? normalized.join(',') : null;
    }

    return null;
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

const isInvalidRefreshTokenError = (rawError: any): boolean => {
    const message = String(rawError?.message || '').toLowerCase();
    const errorCode = String(rawError?.code || rawError?.error_code || '').toLowerCase();

    return (
        message.includes('invalid refresh token') ||
        message.includes('refresh token not found') ||
        errorCode === 'refresh_token_not_found'
    );
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

            if (
                !refreshError &&
                refreshedSession?.access_token &&
                isJwtLike(refreshedSession.access_token) &&
                !isJwtExpiredOrNearExpiry(refreshedSession.access_token, 0)
            ) {
                _cachedToken = refreshedSession.access_token;
                _cachedTokenAt = Date.now();
                _refreshCooldownUntil = 0;
                return _cachedToken;
            }

            const refreshStatus = Number((refreshError as any)?.status || 0);

            if (isInvalidRefreshTokenError(refreshError)) {
                await clearSupabaseAuthStorage();
                _refreshCooldownUntil = Date.now() + REFRESH_FAILURE_COOLDOWN_MS;
                return null;
            }

            _refreshCooldownUntil =
                Date.now() +
                (refreshStatus === 429 ? REFRESH_RATE_LIMIT_COOLDOWN_MS : REFRESH_FAILURE_COOLDOWN_MS);

            if (__DEV__ && refreshStatus === 429) {
                console.warn('[supabase.functions.invoke] refreshSession rate-limited; temporarily skipping token refresh attempts');
            }

            return null;
        } catch (refreshException) {
            if (isInvalidRefreshTokenError(refreshException)) {
                await clearSupabaseAuthStorage();
            }
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
    if (
        _cachedToken &&
        isJwtLike(_cachedToken) &&
        now - _cachedTokenAt < TOKEN_CACHE_TTL_MS &&
        !isJwtExpiredOrNearExpiry(_cachedToken, TOKEN_REFRESH_SAFETY_WINDOW_MS)
    ) {
        return _cachedToken;
    }

    if (_cachedToken && isJwtExpiredOrNearExpiry(_cachedToken, TOKEN_REFRESH_SAFETY_WINDOW_MS)) {
        _cachedToken = null;
        _cachedTokenAt = 0;
    }

    // 2. Prefer currently persisted session token first to avoid unnecessary
    // refresh-token rotation races across concurrent callers.
    try {
        const {
            data: { session: currentSession },
            error: currentSessionError,
        } = await supabase.auth.getSession();

        if (!currentSessionError && currentSession?.access_token && isJwtLike(currentSession.access_token)) {
            const tokenIsNearExpiry = isJwtExpiredOrNearExpiry(
                currentSession.access_token,
                TOKEN_REFRESH_SAFETY_WINDOW_MS,
            );
            const expiresAtMs = (currentSession.expires_at || 0) * 1000;
            const isNearExpiry = expiresAtMs > 0 && expiresAtMs - now <= TOKEN_REFRESH_SAFETY_WINDOW_MS;

            if (!isNearExpiry && !tokenIsNearExpiry) {
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

        if (
            fallbackSession?.access_token &&
            isJwtLike(fallbackSession.access_token) &&
            !isJwtExpiredOrNearExpiry(fallbackSession.access_token, 0)
        ) {
            _cachedToken = fallbackSession.access_token;
            _cachedTokenAt = Date.now();
            return _cachedToken;
        }
    } catch {
        // ignore
    }

    return null;
};

export const prepareRealtimeAuth = async (): Promise<boolean> => {
    try {
        const token = await getFreshAccessToken();
        if (!token) {
            return false;
        }

        supabase.realtime.setAuth(token);
        return true;
    } catch {
        return false;
    }
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
        } else if (rawError?.context?.status) {
            normalizedError.status = rawError.context.status;
        }
    }

    return normalizedError;
};

const getFunctionsErrorStatus = (rawError: any): number | undefined => {
    const status = Number(rawError?.status || rawError?.context?.status || 0);
    return Number.isFinite(status) && status > 0 ? status : undefined;
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

const isAuthUnauthorizedError = (rawError: any): boolean => {
    const message = String(rawError?.message || '').toLowerCase();
    const details = String(rawError?.details || '').toLowerCase();
    const hint = String(rawError?.hint || '').toLowerCase();
    const contextMessage = String(rawError?.context?.message || '').toLowerCase();
    const status = Number(rawError?.status || rawError?.context?.status || 0);

    return (
        status === 401 ||
        message.includes('unauthorized') ||
        details.includes('unauthorized') ||
        hint.includes('unauthorized') ||
        contextMessage.includes('unauthorized') ||
        isInvalidJwtError(rawError)
    );
};

const hasAuthorizationHeader = (options?: InvokeOptions): boolean => {
    if (!options?.headers) {
        return false;
    }

    return Object.keys(options.headers).some((header) => header.toLowerCase() === 'authorization');
};

const shouldSkipSessionAuthorization = (functionName: string, options?: InvokeOptions): boolean => {
    const action = typeof options?.body?.action === 'string' ? options.body.action : '';

    return (
        (functionName === 'manage-profile' && action === 'create') ||
        (functionName === 'manual-identity-review' && action === 'submit_manual_review_signup')
    );
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

const getAuthorizationToken = (options?: InvokeOptions): string | null => {
    if (!options?.headers) return null;

    for (const [header, value] of Object.entries(options.headers)) {
        if (header.toLowerCase() !== 'authorization') continue;
        const token = String(value || '').replace(/^Bearer\s+/i, '').trim();
        return token || null;
    }

    return null;
};

const withSessionAuthorization = async (
    options?: InvokeOptions,
): Promise<InvokeOptions | undefined> => {
    if (!hasSupabaseConfig) {
        return options;
    }

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
                if (__DEV__) {
                    console.log('[supabase.functions.invoke] Attached access token', {
                        tokenLength: token.length,
                        tokenPrefix: token.slice(0, 16),
                        isJwtLike: isJwtLike(token),
                        expiresInSeconds: getJwtExpiresInSeconds(token),
                        tokenIssuer: getJwtStringClaim(token, 'iss'),
                        tokenAudience: getJwtAudienceClaim(token),
                        tokenRef: getJwtStringClaim(token, 'ref'),
                        configuredProjectRef: projectRef,
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

(_functionsInstance as any).invoke = async function<T = any>(
    functionName: string,
    options?: InvokeOptions,
): Promise<{ data: T | null; error: Error | null }> {
    if (!hasSupabaseConfig) {
        return {
            data: null,
            error: new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in web/.env, then restart Expo.'),
        };
    }

    try {
        const skipSessionAuthorization = shouldSkipSessionAuthorization(functionName, options);
        const invokeOptions = skipSessionAuthorization ? options : await withSessionAuthorization(options);
        const firstAttemptHadAuthorization = hasAuthorizationHeader(invokeOptions);
        let result = (await originalInvoke(functionName, invokeOptions)) as {
            data: T | null;
            error: any;
        };

        if (result.error && !skipSessionAuthorization && isAuthUnauthorizedError(result.error)) {
            const firstAttemptToken = getAuthorizationToken(invokeOptions);
            const errorStatus = getFunctionsErrorStatus(result.error);
            console.warn('[supabase.functions.invoke] Authorization failed, retrying once with refreshed session', {
                functionName,
                message: result.error?.message,
                status: errorStatus,
                code: result.error?.code,
                contextUrl: result.error?.context?.url,
                hadUserAuthorizationHeader: firstAttemptHadAuthorization,
                tokenExpiresInSeconds: getJwtExpiresInSeconds(firstAttemptToken),
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
