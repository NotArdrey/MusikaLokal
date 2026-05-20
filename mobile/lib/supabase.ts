import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import { getStoredPushInstallationId } from '../src/notifications/pushInstallation';

const readEnv = (...candidates: (string | undefined)[]): string => {
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

// Avoid hard crashes on import when local environment variables are missing.
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

const getAuthErrorText = (rawError: unknown): string => {
    if (rawError instanceof Error) {
        return `${rawError.name}: ${rawError.message} ${rawError.stack || ''}`;
    }

    if (typeof rawError === 'string') {
        return rawError;
    }

    if (rawError && typeof rawError === 'object') {
        const errorRecord = rawError as Record<string, unknown>;
        return [
            errorRecord.name,
            errorRecord.message,
            errorRecord.error,
            errorRecord.error_description,
            errorRecord.code,
            errorRecord.error_code,
            errorRecord.details,
        ]
            .filter((value): value is string | number => (
                typeof value === 'string' || typeof value === 'number'
            ))
            .join(' ');
    }

    return '';
};

export const isInvalidRefreshTokenError = (rawError: unknown): boolean => {
    const message = getAuthErrorText(rawError).toLowerCase();

    return (
        message.includes('invalid refresh token') ||
        message.includes('refresh token not found') ||
        message.includes('refresh_token_not_found')
    );
};

const installInvalidRefreshTokenConsoleFilter = () => {
    const consoleRef = console as typeof console & {
        __musikaInvalidRefreshTokenFilterInstalled?: boolean;
    };

    if (consoleRef.__musikaInvalidRefreshTokenFilterInstalled) {
        return;
    }

    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        if (args.some(isInvalidRefreshTokenError)) {
            return;
        }

        originalError(...args);
    };

    consoleRef.__musikaInvalidRefreshTokenFilterInstalled = true;
};

installInvalidRefreshTokenConsoleFilter();

if (!hasSupabaseConfig) {
    console.warn('Supabase URL or Anon Key is missing! Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the repository root .env file, then restart Expo.');
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
    await Promise.all([
        ExpoSecureStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY),
        ExpoSecureStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`),
        ExpoSecureStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`),
    ]);
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
const _authInstance = supabase.auth;
const originalGetSession = _authInstance.getSession.bind(_authInstance);
const originalRefreshSession = _authInstance.refreshSession.bind(_authInstance);
const originalSignOut = _authInstance.signOut.bind(_authInstance);
type InvokeOptions = { body?: any; headers?: Record<string, string> };
type NormalizedFunctionsError = Error & {
    context?: unknown;
    code?: string | number;
    details?: string;
    hint?: string;
    status?: number;
    responseBody?: unknown;
};

const FUNCTIONS_INVOKE_DEBUG_LOGS = false;
const TRANSIENT_FUNCTION_STATUS_CODES = new Set([502, 503, 504]);
const TRANSIENT_FUNCTION_RETRY_DELAY_MS = 350;

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

const isJwtExpiredOrNearExpiry = (
    token?: string | null,
    safetyWindowMs = 0,
): boolean => {
    const expMs = getJwtExpiryMs(token);
    if (!expMs) return false;
    return expMs - Date.now() <= Math.max(0, safetyWindowMs);
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

const clearAuthStorageForInvalidRefreshToken = async (error: unknown): Promise<boolean> => {
    if (!isInvalidRefreshTokenError(error)) {
        return false;
    }

    await clearSupabaseAuthStorage();
    return true;
};

(_authInstance as any).getSession = async function(
    ...args: Parameters<typeof _authInstance.getSession>
) {
    try {
        const result = await originalGetSession(...args);
        if (result.error) {
            await clearAuthStorageForInvalidRefreshToken(result.error);
        }
        return result;
    } catch (error) {
        if (await clearAuthStorageForInvalidRefreshToken(error)) {
            return {
                data: { session: null },
                error,
            } as Awaited<ReturnType<typeof _authInstance.getSession>>;
        }

        throw error;
    }
};

(_authInstance as any).refreshSession = async function(
    ...args: Parameters<typeof _authInstance.refreshSession>
) {
    try {
        const result = await originalRefreshSession(...args);
        if (result.error) {
            await clearAuthStorageForInvalidRefreshToken(result.error);
        }
        return result;
    } catch (error) {
        if (await clearAuthStorageForInvalidRefreshToken(error)) {
            return {
                data: { user: null, session: null },
                error,
            } as Awaited<ReturnType<typeof _authInstance.refreshSession>>;
        }

        throw error;
    }
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

// Ensure Realtime subscriptions use a current user JWT before connecting.
export const prepareRealtimeAuth = async (): Promise<boolean> => {
    if (!hasSupabaseConfig) {
        return false;
    }

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
    responseBody?: unknown,
): NormalizedFunctionsError => {
    const responseMessage =
        responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
            ? String((responseBody as any).error || (responseBody as any).message || '').trim()
            : typeof responseBody === 'string'
                ? responseBody.trim()
                : '';
    const message =
        responseMessage ||
        (typeof rawError?.message === 'string' && rawError.message.trim().length > 0
            ? rawError.message
            : fallbackMessage);

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

    if (responseBody !== undefined) {
        normalizedError.responseBody = responseBody;

        if (!normalizedError.details) {
            normalizedError.details =
                typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
        }
    }

    return normalizedError;
};

const readFunctionsErrorBody = async (rawError: any): Promise<unknown> => {
    const response = rawError?.context;
    if (!response || typeof response !== 'object') {
        return undefined;
    }

    try {
        const clone = typeof response.clone === 'function' ? response.clone() : response;
        if (typeof clone.json === 'function') {
            return await clone.json();
        }
    } catch {
        // Fall back to text below.
    }

    try {
        const clone = typeof response.clone === 'function' ? response.clone() : response;
        if (typeof clone.text === 'function') {
            const text = await clone.text();
            return text || undefined;
        }
    } catch {
        // The React Native response body may already be consumed by functions-js.
    }

    return undefined;
};

const isInvalidJwtError = (rawError: any): boolean => {
    const message = String(rawError?.message || '').toLowerCase();
    const details = String(rawError?.details || '').toLowerCase();
    const hint = String(rawError?.hint || '').toLowerCase();
    const contextMessage = String(rawError?.context?.message || '').toLowerCase();
    const contextError = String(rawError?.context?.error || '').toLowerCase();
    const contextDetails = String(rawError?.context?.details || '').toLowerCase();

    return (
        message.includes('invalid jwt') ||
        details.includes('invalid jwt') ||
        hint.includes('invalid jwt') ||
        contextMessage.includes('invalid jwt') ||
        contextError.includes('invalid jwt') ||
        contextDetails.includes('invalid jwt') ||
        message.includes('invalid token') ||
        details.includes('invalid token') ||
        hint.includes('invalid token') ||
        contextMessage.includes('invalid token') ||
        contextError.includes('invalid token') ||
        contextDetails.includes('invalid token') ||
        message.includes('token is expired') ||
        details.includes('token is expired') ||
        hint.includes('token is expired') ||
        contextMessage.includes('token is expired') ||
        contextError.includes('token is expired') ||
        contextDetails.includes('token is expired') ||
        message.includes('jwt') ||
        details.includes('jwt') ||
        hint.includes('jwt') ||
        contextMessage.includes('jwt') ||
        contextError.includes('jwt') ||
        contextDetails.includes('jwt')
    );
};

const isAuthUnauthorizedError = (rawError: any): boolean => {
    const message = String(rawError?.message || '').toLowerCase();
    const details = String(rawError?.details || '').toLowerCase();
    const hint = String(rawError?.hint || '').toLowerCase();
    const contextMessage = String(rawError?.context?.message || '').toLowerCase();
    const status = getFunctionsErrorStatus(rawError);

    return (
        status === 401 ||
        message.includes('unauthorized') ||
        details.includes('unauthorized') ||
        hint.includes('unauthorized') ||
        contextMessage.includes('unauthorized') ||
        isInvalidJwtError(rawError)
    );
};

const getFunctionsErrorStatus = (rawError: any): number | null => {
    const normalized = Number(rawError?.status || rawError?.context?.status || 0);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};

const isTransientFunctionsError = (rawError: any): boolean => {
    const status = getFunctionsErrorStatus(rawError);
    if (status && TRANSIENT_FUNCTION_STATUS_CODES.has(status)) {
        return true;
    }

    const message = String(rawError?.message || '').toLowerCase();
    return (
        !status &&
        (message.includes('network request failed') ||
            message.includes('failed to fetch') ||
            message.includes('fetch failed'))
    );
};

const delay = async (ms: number) => {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
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

const getInvokeBodySummary = (options?: InvokeOptions) => {
    const body = options?.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return undefined;
    }

    const action = typeof body.action === 'string' ? body.action : undefined;
    const summary: Record<string, unknown> = {};

    if (action) {
        summary.action = action;
    }

    for (const [key, value] of Object.entries(body)) {
        if (key === 'action' || value === null || value === undefined) {
            continue;
        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            summary[key] = value;
        }
    }

    return Object.keys(summary).length > 0 ? summary : undefined;
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
            } else if (__DEV__ && FUNCTIONS_INVOKE_DEBUG_LOGS) {
                console.warn('[supabase.functions.invoke] No access token available; invoke will continue without user Authorization header');
            }
        } catch {
            // ignore auth header hydration failures and let invoke proceed
        }
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

const unregisterCurrentPushDevice = async () => {
    if (Platform.OS === 'web' || !hasSupabaseConfig) {
        return;
    }

    const installationId = await getStoredPushInstallationId();
    if (!installationId) {
        return;
    }

    try {
        const { error } = await supabase.rpc('unregister_push_device', {
            p_installation_id: installationId,
            p_reason: 'signed_out',
        });

        if (error && __DEV__) {
            console.warn('[push] Failed to unregister push device during sign-out', error);
        }
    } catch (error) {
        if (__DEV__) {
            console.warn('[push] Unexpected sign-out cleanup error', error);
        }
    }
};

(_functionsInstance as any).invoke = async function<T = any>(
    functionName: string,
    options?: InvokeOptions,
): Promise<{ data: T | null; error: Error | null }> {
    if (!hasSupabaseConfig) {
        return {
            data: null,
            error: new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the repository root .env file, then restart Expo.'),
        };
    }

    try {
        const skipSessionAuthorization = shouldSkipSessionAuthorization(functionName, options);
        let invokeOptions = skipSessionAuthorization ? options : await withSessionAuthorization(options);
        const firstAttemptHadAuthorization = hasAuthorizationHeader(invokeOptions);
        let result = (await originalInvoke(functionName, invokeOptions)) as {
            data: T | null;
            error: any;
        };

        if (result.error && !skipSessionAuthorization && isAuthUnauthorizedError(result.error)) {
            console.warn('[supabase.functions.invoke] Authorization failed, retrying once with refreshed session', {
                functionName,
                message: result.error?.message,
                status: result.error?.status,
                code: result.error?.code,
                hadUserAuthorizationHeader: firstAttemptHadAuthorization,
            });

            invalidateTokenCache();

            await refreshAccessToken();

            invokeOptions = await withSessionAuthorization(withoutAuthorizationHeader(options));
            result = (await originalInvoke(functionName, invokeOptions)) as {
                data: T | null;
                error: any;
            };
        }

        if (result.error && isTransientFunctionsError(result.error)) {
            if (__DEV__) {
                const status = getFunctionsErrorStatus(result.error);
                console.warn('[supabase.functions.invoke] Transient function invoke error, retrying once', {
                    functionName,
                    status,
                    message: result.error?.message,
                    body: getInvokeBodySummary(invokeOptions || options),
                });
            }

            await delay(TRANSIENT_FUNCTION_RETRY_DELAY_MS);
            invokeOptions = skipSessionAuthorization
                ? withoutAuthorizationHeader(invokeOptions || options)
                : await withSessionAuthorization(withoutAuthorizationHeader(invokeOptions || options));
            result = (await originalInvoke(functionName, invokeOptions)) as {
                data: T | null;
                error: any;
            };
        }

        if (result.error) {
            const responseBody = await readFunctionsErrorBody(result.error);

            if (__DEV__) {
                console.warn('[supabase.functions.invoke] Function invoke failed after retries', {
                    functionName,
                    status: getFunctionsErrorStatus(result.error),
                    message: result.error?.message,
                    code: result.error?.code,
                    details: result.error?.details,
                    hint: result.error?.hint,
                    responseBody,
                    context: result.error?.context,
                    body: getInvokeBodySummary(invokeOptions || options),
                });
            }

            // Convert FunctionsError to plain Error for Hermes compatibility
            return {
                data: null,
                error: normalizeFunctionsError(result.error, 'Function invocation failed', responseBody),
            };
        }
        return { data: result.data ?? null, error: null };
    } catch (err) {
        // Catch any instantiation errors from functions-js error classes
        const responseBody = await readFunctionsErrorBody(err);
        return {
            data: null,
            error: normalizeFunctionsError(err, 'Unknown error invoking function', responseBody),
        };
    }
};

(_authInstance as any).signOut = async function(
    ...args: Parameters<typeof _authInstance.signOut>
) {
    await unregisterCurrentPushDevice();
    return originalSignOut(...args);
};

// Bust token cache on auth changes so subsequent invokes hydrate from
// the latest persisted session state.
supabase.auth.onAuthStateChange((_event, session) => {
    invalidateTokenCache();

    const token = session?.access_token;
    if (token && isJwtLike(token) && !isJwtExpiredOrNearExpiry(token, 0)) {
        _cachedToken = token;
        _cachedTokenAt = Date.now();

        try {
            supabase.realtime.setAuth(token);
        } catch {
            // ignore realtime auth hydration failures; channel-specific retries handle recovery
        }
    }
});

// Replace the getter with a stable property returning our patched instance.
// This ensures `supabase.functions.invoke(...)` always uses the monkey-patched
// version instead of creating a new un-patched FunctionsClient each time.
Object.defineProperty(supabase, 'functions', {
    get: () => _functionsInstance,
    configurable: true,
});
