// @ts-nocheck

const DEFAULT_LIMITS: Record<string, Record<string, number>> = {
  create_didit_session: {
    hourlyEmail: 12,
    dailyEmail: 24,
    hourlyIp: 40,
    dailyIp: 120,
    hourlyDevice: 24,
    dailyDevice: 60,
  },
  create_unverified_user: {
    hourlyEmail: 12,
    dailyEmail: 24,
    hourlyIp: 40,
    dailyIp: 120,
    hourlyDevice: 24,
    dailyDevice: 60,
  },
  manual_identity_review: {
    hourlyEmail: 3,
    dailyEmail: 5,
    hourlyIp: 8,
    dailyIp: 20,
    hourlyDevice: 5,
    dailyDevice: 12,
  },
};

export class RegistrationRateLimitError extends Error {
  status = 429;
  retryAfterSeconds = 3600;

  constructor(message = "Too many registration attempts. Please wait before trying again.") {
    super(message);
    this.name = "RegistrationRateLimitError";
  }
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function getRateLimitSecret() {
  const secret =
    Deno.env.get("REGISTRATION_RATE_LIMIT_SECRET") ||
    Deno.env.get("IDENTITY_DOCUMENT_HASH_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!secret) {
    throw new Error("REGISTRATION_RATE_LIMIT_SECRET or fallback secret is required");
  }

  return secret;
}

async function hmacSha256Hex(message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getRateLimitSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashSignal(kind: string, value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  return `v1:${await hmacSha256Hex(`${kind}:${normalized}`)}`;
}

function getClientIp(req: Request) {
  const forwardedFor = normalizeText(req.headers.get("x-forwarded-for"));
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "";

  return (
    normalizeText(req.headers.get("cf-connecting-ip")) ||
    normalizeText(req.headers.get("x-real-ip")) ||
    normalizeText(req.headers.get("fly-client-ip"))
  );
}

function getDeviceSignal(req: Request, explicitDeviceId?: unknown) {
  return (
    normalizeText(explicitDeviceId) ||
    normalizeText(req.headers.get("x-device-id")) ||
    normalizeText(req.headers.get("x-installation-id")) ||
    normalizeText(req.headers.get("user-agent"))
  );
}

async function countAttempts(client: any, action: string, column: string, value: string, sinceIso: string) {
  const { count, error } = await client
    .from("registration_attempts")
    .select("id", { count: "exact", head: true })
    .eq("action", action)
    .eq(column, value)
    .gte("created_at", sinceIso);

  if (error) {
    console.error("registration_rate_limit_count_failed", {
      action,
      column,
      message: error.message,
      code: error.code,
    });
    return 0;
  }

  return count || 0;
}

async function recordAttempt(client: any, payload: Record<string, unknown>) {
  const { data, error } = await client
    .from("registration_attempts")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("registration_attempt_record_failed", {
      action: payload.action,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  return data?.id || null;
}

export async function enforceRegistrationRateLimit(
  client: any,
  req: Request,
  {
    action,
    email,
    userId = null,
    diditSessionId = null,
    deviceId = null,
    metadata = {},
    limits = {},
  }: Record<string, unknown>,
) {
  const normalizedAction = normalizeText(action);
  const resolvedLimits = { ...(DEFAULT_LIMITS[normalizedAction] || {}), ...(limits || {}) };
  const [emailHash, ipHash, deviceHash] = await Promise.all([
    hashSignal("email", email),
    hashSignal("ip", getClientIp(req)),
    hashSignal("device", getDeviceSignal(req, deviceId)),
  ]);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const checks: Array<Promise<{ exceeded: boolean; reason: string }>> = [];

  function addCheck(hashValue: string | null, column: string, hourlyKey: string, dailyKey: string) {
    if (!hashValue) return;

    checks.push((async () => {
      const [hourlyCount, dailyCount] = await Promise.all([
        countAttempts(client, normalizedAction, column, hashValue, oneHourAgo),
        countAttempts(client, normalizedAction, column, hashValue, oneDayAgo),
      ]);

      if (resolvedLimits[hourlyKey] && hourlyCount >= resolvedLimits[hourlyKey]) {
        return { exceeded: true, reason: `${column}_hourly_limit` };
      }

      if (resolvedLimits[dailyKey] && dailyCount >= resolvedLimits[dailyKey]) {
        return { exceeded: true, reason: `${column}_daily_limit` };
      }

      return { exceeded: false, reason: "" };
    })());
  }

  addCheck(emailHash, "email_hash", "hourlyEmail", "dailyEmail");
  addCheck(ipHash, "ip_hash", "hourlyIp", "dailyIp");
  addCheck(deviceHash, "device_hash", "hourlyDevice", "dailyDevice");

  const results = await Promise.all(checks);
  const exceeded = results.find((result) => result.exceeded);
  const basePayload = {
    action: normalizedAction,
    email_hash: emailHash,
    ip_hash: ipHash,
    device_hash: deviceHash,
    user_id: userId || null,
    didit_session_id: diditSessionId || null,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };

  if (exceeded) {
    await recordAttempt(client, {
      ...basePayload,
      blocked: true,
      success: false,
      reason: exceeded.reason,
    });
    throw new RegistrationRateLimitError();
  }

  const attemptId = await recordAttempt(client, {
    ...basePayload,
    blocked: false,
    success: false,
    reason: null,
  });

  return {
    attemptId,
    emailHash,
    ipHash,
    deviceHash,
  };
}

export async function markRegistrationAttempt(client: any, attemptId: unknown, updates: Record<string, unknown> = {}) {
  const id = normalizeText(attemptId);
  if (!id) return;

  const payload: Record<string, unknown> = {};
  for (const key of ["success", "reason", "user_id", "didit_session_id", "metadata"]) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      payload[key] = updates[key];
    }
  }

  if (Object.keys(payload).length === 0) return;

  const { error } = await client
    .from("registration_attempts")
    .update(payload)
    .eq("id", id);

  if (error) {
    console.error("registration_attempt_update_failed", {
      message: error.message,
      code: error.code,
    });
  }
}

export function getRegistrationRateLimitStatus(error: unknown) {
  return error instanceof RegistrationRateLimitError || (error as any)?.status === 429 ? 429 : null;
}
