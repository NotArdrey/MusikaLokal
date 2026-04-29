import { createClient } from "@supabase/supabase-js";

const configuredSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const configuredSupabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const hasSupabaseConfig = Boolean(configuredSupabaseUrl && configuredSupabaseAnonKey);
const isDev = Boolean(import.meta.env.DEV);

// Avoid hard crashes when environment variables are missing.
const supabaseUrl = configuredSupabaseUrl || "https://placeholder.supabase.co";
const supabaseAnonKey = configuredSupabaseAnonKey || "missing-anon-key";
const configuredProjectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
})();

if (!hasSupabaseConfig) {
  console.warn(
    "Supabase URL or Anon Key is missing! Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      "x-client-info": "musika-lokal-web",
    },
  },
  db: {
    schema: "public",
  },
  realtime: {
    timeout: 30000,
  },
});

export const clearSupabaseAuthStorage = () => {
  invalidateTokenCache();

  const projectRef = (() => {
    try {
      return new URL(supabaseUrl).hostname.split(".")[0];
    } catch {
      return "musika-lokal";
    }
  })();
  localStorage.removeItem(`sb-${projectRef}-auth-token`);
};

type InvokeOptions = { body?: unknown; headers?: Record<string, string> };
type NormalizedFunctionsError = Error & {
  context?: unknown;
  code?: string | number;
  details?: string;
  hint?: string;
  status?: number;
};

const isJwtLike = (token?: string | null): token is string => {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
};

const parseJwtPayload = (token?: string | null): Record<string, unknown> | null => {
  if (!isJwtLike(token)) return null;

  try {
    const payloadPart = token.split(".")[1];
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const atobFn = (globalThis as { atob?: (value: string) => string }).atob;
    if (typeof atobFn !== "function") return null;

    const parsed = JSON.parse(atobFn(padded));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const getJwtExpiryMs = (token?: string | null): number | null => {
  const payload = parseJwtPayload(token);
  if (!payload) return null;

  const rawExp = payload.exp;
  const expSeconds =
    typeof rawExp === "number"
      ? rawExp
      : typeof rawExp === "string"
        ? Number(rawExp)
        : Number.NaN;

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
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return null;
};

const getJwtAudienceClaim = (token: string): string | null => {
  const payload = parseJwtPayload(token);
  if (!payload) return null;

  const value = payload.aud;
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => String(entry).trim());
    return normalized.length > 0 ? normalized.join(",") : null;
  }

  return null;
};

const TOKEN_CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60 * 1000; // 1 minute
const REFRESH_FAILURE_COOLDOWN_MS = 30 * 1000; // 30 seconds
const REFRESH_RATE_LIMIT_COOLDOWN_MS = 60 * 1000; // 1 minute
let cachedToken: string | null = null;
let cachedTokenAt = 0;
let refreshCooldownUntil = 0;
let refreshInFlight: Promise<string | null> | null = null;

export const invalidateTokenCache = () => {
  cachedToken = null;
  cachedTokenAt = 0;
  refreshCooldownUntil = 0;
  refreshInFlight = null;
};

const isInvalidRefreshTokenError = (rawError: any): boolean => {
  const message = String(rawError?.message || "").toLowerCase();
  const errorCode = String(rawError?.code || rawError?.error_code || "").toLowerCase();

  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    errorCode === "refresh_token_not_found"
  );
};

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  if (Date.now() < refreshCooldownUntil) {
    return null;
  }

  refreshInFlight = (async () => {
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
        cachedToken = refreshedSession.access_token;
        cachedTokenAt = Date.now();
        refreshCooldownUntil = 0;
        return cachedToken;
      }

      const refreshStatus = Number((refreshError as any)?.status || 0);

      if (isInvalidRefreshTokenError(refreshError)) {
        clearSupabaseAuthStorage();
        refreshCooldownUntil = Date.now() + REFRESH_FAILURE_COOLDOWN_MS;
        return null;
      }

      refreshCooldownUntil =
        Date.now() +
        (refreshStatus === 429 ? REFRESH_RATE_LIMIT_COOLDOWN_MS : REFRESH_FAILURE_COOLDOWN_MS);

      if (isDev && refreshStatus === 429) {
        console.warn("[supabase.functions.invoke] refreshSession rate-limited; temporarily skipping token refresh attempts");
      }

      return null;
    } catch (refreshException) {
      if (isInvalidRefreshTokenError(refreshException)) {
        clearSupabaseAuthStorage();
      }
      refreshCooldownUntil = Date.now() + REFRESH_FAILURE_COOLDOWN_MS;
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

const getFreshAccessToken = async (): Promise<string | null> => {
  const now = Date.now();
  if (
    cachedToken &&
    isJwtLike(cachedToken) &&
    now - cachedTokenAt < TOKEN_CACHE_TTL_MS &&
    !isJwtExpiredOrNearExpiry(cachedToken, TOKEN_REFRESH_SAFETY_WINDOW_MS)
  ) {
    return cachedToken;
  }

  if (cachedToken && isJwtExpiredOrNearExpiry(cachedToken, TOKEN_REFRESH_SAFETY_WINDOW_MS)) {
    cachedToken = null;
    cachedTokenAt = 0;
  }

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
        cachedToken = currentSession.access_token;
        cachedTokenAt = now;
        return cachedToken;
      }
    }
  } catch {
    // ignore and continue with refresh path
  }

  const refreshedToken = await refreshAccessToken();
  if (refreshedToken) {
    return refreshedToken;
  }

  try {
    const {
      data: { session: fallbackSession },
    } = await supabase.auth.getSession();

    if (
      fallbackSession?.access_token &&
      isJwtLike(fallbackSession.access_token) &&
      !isJwtExpiredOrNearExpiry(fallbackSession.access_token, 0)
    ) {
      cachedToken = fallbackSession.access_token;
      cachedTokenAt = Date.now();
      return cachedToken;
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
    typeof rawError?.message === "string" && rawError.message.trim().length > 0
      ? rawError.message
      : fallbackMessage;

  const normalizedError = new Error(message) as NormalizedFunctionsError;

  if (rawError && typeof rawError === "object") {
    if ("context" in rawError) {
      normalizedError.context = rawError.context;
    }
    if ("code" in rawError) {
      normalizedError.code = rawError.code;
    }
    if ("details" in rawError) {
      normalizedError.details = rawError.details;
    }
    if ("hint" in rawError) {
      normalizedError.hint = rawError.hint;
    }
    if ("status" in rawError) {
      normalizedError.status = rawError.status;
    }
  }

  return normalizedError;
};

const isInvalidJwtError = (rawError: any): boolean => {
  const message = String(rawError?.message || "").toLowerCase();
  const details = String(rawError?.details || "").toLowerCase();
  const hint = String(rawError?.hint || "").toLowerCase();
  const contextMessage = String(rawError?.context?.message || "").toLowerCase();

  return (
    message.includes("invalid jwt") ||
    details.includes("invalid jwt") ||
    hint.includes("invalid jwt") ||
    contextMessage.includes("invalid jwt") ||
    message.includes("jwt") ||
    details.includes("jwt") ||
    hint.includes("jwt") ||
    contextMessage.includes("jwt")
  );
};

const isAuthUnauthorizedError = (rawError: any): boolean => {
  const message = String(rawError?.message || "").toLowerCase();
  const details = String(rawError?.details || "").toLowerCase();
  const hint = String(rawError?.hint || "").toLowerCase();
  const contextMessage = String(rawError?.context?.message || "").toLowerCase();
  const status = Number(rawError?.status || rawError?.context?.status || 0);

  return (
    status === 401 ||
    message.includes("unauthorized") ||
    details.includes("unauthorized") ||
    hint.includes("unauthorized") ||
    contextMessage.includes("unauthorized") ||
    isInvalidJwtError(rawError)
  );
};

const hasAuthorizationHeader = (options?: InvokeOptions): boolean => {
  if (!options?.headers) {
    return false;
  }

  return Object.keys(options.headers).some((header) => header.toLowerCase() === "authorization");
};

const shouldSkipSessionAuthorization = (functionName: string, options?: InvokeOptions): boolean => {
  const body = options?.body;
  const action = body && typeof body === "object" && "action" in body ? String((body as any).action || "") : "";

  return (
    (functionName === "manage-profile" && action === "create") ||
    (functionName === "manual-identity-review" && action === "submit_manual_review_signup")
  );
};

const withoutAuthorizationHeader = (options?: InvokeOptions): InvokeOptions | undefined => {
  if (!options?.headers) {
    return options;
  }

  const filteredHeaders = Object.fromEntries(
    Object.entries(options.headers).filter(([header]) => header.toLowerCase() !== "authorization"),
  );

  return {
    ...options,
    headers: Object.keys(filteredHeaders).length > 0 ? filteredHeaders : undefined,
  };
};

const getAuthorizationToken = (options?: InvokeOptions): string | null => {
  if (!options?.headers) return null;

  for (const [header, value] of Object.entries(options.headers)) {
    if (header.toLowerCase() !== "authorization") continue;
    const token = String(value || "").replace(/^Bearer\s+/i, "").trim();
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
    (header) => header.toLowerCase() === "authorization",
  );

  if (!alreadyHasAuthorizationHeader) {
    try {
      const token = await getFreshAccessToken();
      if (token) {
        mergedHeaders.Authorization = `Bearer ${token}`;
        if (isDev) {
          console.log("[supabase.functions.invoke] Attached access token", {
            tokenLength: token.length,
            tokenPrefix: token.slice(0, 16),
            isJwtLike: isJwtLike(token),
            expiresInSeconds: getJwtExpiresInSeconds(token),
            tokenIssuer: getJwtStringClaim(token, "iss"),
            tokenAudience: getJwtAudienceClaim(token),
            tokenRef: getJwtStringClaim(token, "ref"),
            configuredProjectRef,
          });
        }
      } else if (isDev) {
        console.warn("[supabase.functions.invoke] No access token available; invoke will continue without user Authorization header");
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

// supabase-js v2.93+ exposes `functions` as a getter that returns a fresh
// FunctionsClient each access, so patch one stable instance and return it.
const functionsInstance = supabase.functions;
const originalInvoke = functionsInstance.invoke.bind(functionsInstance) as any;

(functionsInstance as any).invoke = async function<T = any>(
  functionName: string,
  options?: InvokeOptions,
): Promise<{ data: T | null; error: Error | null }> {
  if (!hasSupabaseConfig) {
    return {
      data: null,
      error: new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the app."),
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

    if (result.error && firstAttemptHadAuthorization && isAuthUnauthorizedError(result.error)) {
      const firstAttemptToken = getAuthorizationToken(invokeOptions);
      if (isDev) {
        console.warn("[supabase.functions.invoke] Authorization failed, retrying once with refreshed session", {
          functionName,
          message: result.error?.message,
          status: result.error?.status,
          code: result.error?.code,
          tokenExpiresInSeconds: getJwtExpiresInSeconds(firstAttemptToken),
        });
      }

      invalidateTokenCache();
      await refreshAccessToken();

      const retryOptions = await withSessionAuthorization(withoutAuthorizationHeader(options));
      result = (await originalInvoke(functionName, retryOptions)) as {
        data: T | null;
        error: any;
      };
    }

    if (result.error) {
      return {
        data: null,
        error: normalizeFunctionsError(result.error, "Function invocation failed"),
      };
    }

    return { data: result.data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: normalizeFunctionsError(err, "Unknown error invoking function"),
    };
  }
};

supabase.auth.onAuthStateChange(() => {
  invalidateTokenCache();
});

Object.defineProperty(supabase, "functions", {
  get: () => functionsInstance,
  configurable: true,
});
