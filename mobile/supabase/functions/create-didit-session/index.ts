// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  enforceRegistrationRateLimit,
  getRegistrationRateLimitStatus,
  markRegistrationAttempt,
} from "../_shared/registrationRateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function firstNonEmptyString(values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function maskEmailForDiditLog(value: unknown) {
  const email = String(value || "").trim();
  if (!email || !email.includes("@")) return email ? "***" : "";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function sha256Hex(value: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveDiditVendorData(
  userId: unknown,
  normalizedEmail: string,
  options: { forceNew?: boolean } = {},
) {
  const rawUserId = String(userId || "").trim();
  if (options.forceNew && rawUserId.startsWith("TEMP_")) {
    return rawUserId;
  }
  if (rawUserId.startsWith("TEMP_") && normalizedEmail) {
    const emailHash = await sha256Hex(normalizedEmail);
    return `TEMP_SIGNUP_${emailHash.slice(0, 32)}`;
  }
  return rawUserId;
}

function firstArray(values: any[]) {
  return values.find((value) => Array.isArray(value)) || [];
}

function summarizeDiditFeatureNames(features: any) {
  if (Array.isArray(features)) {
    return features
      .map((feature) => {
        if (typeof feature === "string") return feature;
        if (!feature || typeof feature !== "object") return "";
        return feature.feature || feature.name || feature.type || feature.key || "";
      })
      .filter(Boolean)
      .slice(0, 20);
  }

  if (features && typeof features === "object") {
    return Object.entries(features)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
      .slice(0, 20);
  }

  return [];
}

function summarizeDiditWarningCodes(warnings: any) {
  if (!Array.isArray(warnings)) return [];
  return warnings
    .map((warning) => {
      if (typeof warning === "string") return warning;
      if (!warning || typeof warning !== "object") return "";
      return warning.code || warning.type || warning.warning || warning.name || "";
    })
    .filter(Boolean)
    .slice(0, 20);
}

function getDiditDecisionDebug(sessionId: unknown, ...sources: any[]) {
  const decision = sources.map(findDecisionObject).find(Boolean) || {};
  const featureSource = sources.find((source) => source?.features)?.features || decision?.features;
  const idVerifications = firstArray([
    decision?.id_verifications,
    ...sources.map((source) => source?.id_verifications),
  ]);
  const livenessChecks = firstArray([
    decision?.liveness_checks,
    ...sources.map((source) => source?.liveness_checks),
  ]);
  const faceMatches = firstArray([
    decision?.face_matches,
    ...sources.map((source) => source?.face_matches),
  ]);
  const reviews = firstArray([
    decision?.reviews,
    ...sources.map((source) => source?.reviews),
  ]);
  const idVerification = idVerifications[0];
  const livenessCheck = livenessChecks[0];
  const faceMatch = faceMatches[0];
  const summarizeWarnings = (warnings: any) => Array.isArray(warnings)
    ? warnings.slice(0, 10).map((warning) => {
      if (typeof warning === "string") return warning;
      if (!warning || typeof warning !== "object") return warning;
      return {
        code: warning.code || warning.type || warning.warning || warning.name || null,
        message: warning.message || warning.description || null,
      };
    })
    : [];

  return {
    sessionId,
    status: firstNonEmptyString([
      decision?.status,
      ...sources.map((source) => source?.status || source?.verification_status),
    ]) || null,
    workflowId: firstNonEmptyString([
      decision?.workflow_id,
      decision?.workflowId,
      ...sources.map((source) => source?.workflow_id || source?.workflowId),
    ]) || null,
    features: summarizeDiditFeatureNames(featureSource),
    idStatus: idVerification?.status || null,
    idWarningCodes: summarizeDiditWarningCodes(idVerification?.warnings),
    idVerifications: idVerifications.slice(0, 5).map((id: any) => ({
      nodeId: id?.node_id || id?.nodeId || null,
      status: id?.status || null,
      documentType: id?.document_type || id?.documentType || null,
      issuingState: id?.issuing_state || id?.issuingState || null,
      warningCodes: summarizeDiditWarningCodes(id?.warnings),
      warnings: summarizeWarnings(id?.warnings),
      rejectionTags: Array.isArray(id?.rejection_tags) ? id.rejection_tags.slice(0, 10) : [],
    })),
    livenessCount: livenessChecks.length,
    livenessStatus: livenessCheck?.status || null,
    liveness: livenessChecks.slice(0, 5).map((liveness: any) => ({
      nodeId: liveness?.node_id || liveness?.nodeId || null,
      status: liveness?.status || null,
      warningCodes: summarizeDiditWarningCodes(liveness?.warnings),
      warnings: summarizeWarnings(liveness?.warnings),
    })),
    faceMatchCount: faceMatches.length,
    faceMatchStatus: faceMatch?.status || null,
    faceMatchScore: faceMatch?.score ?? faceMatch?.similarity_percentage ?? faceMatch?.similarityPercentage ?? null,
    faceMatches: faceMatches.slice(0, 5).map((match: any) => ({
      nodeId: match?.node_id || match?.nodeId || null,
      status: match?.status || null,
      score: match?.score ?? match?.similarity_percentage ?? match?.similarityPercentage ?? null,
      warningCodes: summarizeDiditWarningCodes(match?.warnings),
      warnings: summarizeWarnings(match?.warnings),
    })),
    reviewCount: reviews.length,
    reviewStatuses: reviews
      .map((review: any) => review?.status || review?.decision || review?.result)
      .filter(Boolean)
      .slice(0, 10),
    reviews: reviews.slice(0, 10).map((review: any) => {
      if (!review || typeof review !== "object") return review;
      return {
        nodeId: review.node_id || review.nodeId || null,
        status: review.status || null,
        decision: review.decision || review.result || null,
        reason: review.reason || review.review_reason || review.reviewReason || null,
      };
    }),
  };
}

function logDiditDecisionDebug(sessionId: unknown, ...sources: any[]) {
  console.log("[didit] get_session raw summary", JSON.stringify(getDiditDecisionDebug(sessionId, ...sources), null, 2));
}

function isPublicHttpUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function resolveDiditVerificationUrl(diditData: any) {
  const explicitUrl = firstNonEmptyString([
    diditData?.verificationUrl,
    diditData?.verification_url,
    diditData?.url,
    diditData?.sessionUrl,
    diditData?.session_url,
    diditData?.session?.verificationUrl,
    diditData?.session?.verification_url,
    diditData?.session?.url,
    diditData?.links?.verificationUrl,
    diditData?.links?.verification_url,
    diditData?.links?.url,
  ]);

  if (isPublicHttpUrl(explicitUrl)) return explicitUrl.trim();

  const sessionToken = firstNonEmptyString([
    diditData?.session_token,
    diditData?.sessionToken,
    diditData?.token,
    diditData?.session?.session_token,
    diditData?.session?.sessionToken,
    diditData?.session?.token,
  ]);

  return sessionToken ? `https://verify.didit.me/session/${encodeURIComponent(sessionToken)}` : "";
}

const FINAL_SESSION_STATUSES = new Set([
  "APPROVED",
  "DECLINED",
  "ABANDONED",
  "PENDING_REVIEW",
  "SUPERSEDED",
  "SUPERSEDED_APPROVED",
]);

const FAILED_SESSION_STATUSES = new Set([
  "DECLINED",
  "ABANDONED",
  "SUPERSEDED",
  "SUPERSEDED_APPROVED",
]);

function normalizeDiditStatus(value: unknown) {
  const normalized = String(value || "").trim().replace(/[\s-]+/g, "_").toUpperCase();
  if (!normalized) return "";

  if (normalized === "APPROVED") return "APPROVED";
  if (["DECLINED", "REJECTED", "DENIED"].includes(normalized)) return "DECLINED";
  if (["ABANDONED", "EXPIRED", "CANCELLED", "CANCELED"].includes(normalized)) return "ABANDONED";
  if (normalized === "IN_REVIEW") return "PENDING";
  if ([
    "PENDING_REVIEW",
    "PENDING_REVIEW_REQUIRED",
    "REVIEW",
    "MANUAL_REVIEW",
    "PENDING_MANUAL_REVIEW",
  ].includes(normalized)) return "PENDING_REVIEW";
  if (["NOT_STARTED", "IN_PROGRESS", "PENDING", "PROCESSING", "SUBMITTED", "CREATED", "STARTED"].includes(normalized)) {
    return "PENDING";
  }

  return normalized;
}

function isFinalSessionStatus(value: unknown) {
  return FINAL_SESSION_STATUSES.has(normalizeDiditStatus(value));
}

function isFailedDiditStatus(value: unknown) {
  return FAILED_SESSION_STATUSES.has(normalizeDiditStatus(value));
}

function findDecisionObject(source: any) {
  const candidates = [
    source?.decision,
    source?.verification_data?.decision,
    source?.details?.decision,
    source,
  ];

  return candidates.find((candidate) => (
    candidate &&
    typeof candidate === "object" &&
    (Array.isArray(candidate.id_verifications) || Array.isArray(candidate.face_matches))
  )) || null;
}

function resolveSourceStatus(source: any) {
  if (!source || typeof source !== "object") return "";

  return normalizeDiditStatus(
    source.status ||
    source.verification_status ||
    source.verification_data?.status ||
    source.session?.status ||
    source.result?.status ||
    source.decision?.status,
  );
}

function shouldReviewMissingFaceMatch(sourceStatus: unknown) {
  const normalized = normalizeDiditStatus(sourceStatus);
  return normalized === "PENDING_REVIEW";
}

function resolveDecisionStatus(decision: any, sourceStatus: unknown = "") {
  if (!decision) return "";

  const idVerification = decision.id_verifications?.[0];
  const faceMatch = decision.face_matches?.[0];
  const idStatus = normalizeDiditStatus(idVerification?.status);
  const faceStatus = normalizeDiditStatus(faceMatch?.status);

  if (idStatus === "DECLINED" || faceStatus === "DECLINED") return "DECLINED";
  if (idStatus === "ABANDONED" || faceStatus === "ABANDONED") return "ABANDONED";
  if (idStatus === "APPROVED" && !faceMatch) {
    return shouldReviewMissingFaceMatch(sourceStatus) ? "PENDING_REVIEW" : "PENDING";
  }
  if (idStatus === "PENDING_REVIEW" || faceStatus === "PENDING_REVIEW") return "PENDING_REVIEW";
  if (idStatus === "APPROVED" && faceStatus === "APPROVED") return "APPROVED";

  return normalizeDiditStatus(decision.status);
}

function resolveDiditStatusFromSource(source: any) {
  if (!source || typeof source !== "object") return "";

  const fallbackStatus = resolveSourceStatus(source);
  const decisionStatus = resolveDecisionStatus(findDecisionObject(source), fallbackStatus);
  if (decisionStatus) return decisionStatus;

  return fallbackStatus === "APPROVED" ? "PENDING" : fallbackStatus;
}

function resolveDiditSessionStatus(...sources: any[]) {
  const statuses = sources.map(resolveDiditStatusFromSource).filter(Boolean);
  return (
    statuses.find(isFailedDiditStatus) ||
    statuses.find((status) => normalizeDiditStatus(status) === "PENDING_REVIEW") ||
    statuses.find(isFinalSessionStatus) ||
    statuses[0] ||
    ""
  );
}

function isReusableDiditSessionStatus(value: unknown) {
  const normalized = normalizeDiditStatus(value);
  return !normalized || normalized === "PENDING";
}

async function resolveReusableDiditSession(
  supabaseAdmin: any,
  {
    normalizedEmail,
    existingSessionId,
  }: Record<string, unknown>,
) {
  const sessionRef = String(existingSessionId || "").trim();
  if (!sessionRef) return null;

  const { data: localSessionData, error } = await supabaseAdmin
    .from("verification_sessions")
    .select("status, verification_data")
    .eq("session_ref", sessionRef)
    .maybeSingle();

  if (error) {
    console.warn("didit_reuse_session_lookup_failed", {
      sessionId: sessionRef,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  const storedEmail = String(localSessionData?.verification_data?.email || "").trim().toLowerCase();
  if (!localSessionData || (normalizedEmail && storedEmail && storedEmail !== normalizedEmail)) {
    return null;
  }

  const status = normalizeDiditStatus(localSessionData.status) || "PENDING";
  if (!isReusableDiditSessionStatus(status)) return null;

  const verificationUrl = firstNonEmptyString([
    localSessionData?.verification_data?.session_url,
    localSessionData?.verification_data?.verification_url,
    localSessionData?.verification_data?.url,
  ]);
  if (!isPublicHttpUrl(verificationUrl)) return null;

  return {
    success: true,
    reused: true,
    sessionId: sessionRef,
    verificationUrl,
    workflowId: firstNonEmptyString([
      localSessionData?.verification_data?.workflow_id,
      localSessionData?.verification_data?.workflowId,
    ]) || null,
    status,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const DIDIT_API_KEY = Deno.env.get("DIDIT_API_KEY");
    const DIDIT_WORKFLOW_ID = Deno.env.get("DIDIT_WORKFLOW_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!DIDIT_API_KEY) {
      console.error("Missing DIDIT_API_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing API key", success: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!DIDIT_WORKFLOW_ID) {
      console.error("Missing DIDIT_WORKFLOW_ID");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing workflow ID", success: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const {
      userId,
      email,
      role,
      callback,
      redirect_url,
      action,
      session_id,
      document_type,
      existing_session_id,
      force_new,
    } = await req.json();
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';

    // HANDLE GET SESSION ACTION
    if (action === 'get_session' && session_id) {

      let sessionData = {};
      let rawDecisionData = null;
      let rawBaseData = null;

      // Try /decision/ first (contains verification results)
      try {
        const decisionResponse = await fetch(`https://verification.didit.me/v3/session/${session_id}/decision/`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-api-key": DIDIT_API_KEY }
        });
        if (decisionResponse.ok) {
          rawDecisionData = await decisionResponse.json();
          sessionData = { ...sessionData, ...rawDecisionData };
        } else {
          console.warn(`Decision endpoint failed: ${decisionResponse.status}`);
        }
      } catch (err) {
        console.error('Error fetching decision:', err);
      }

      // Try base /session/ endpoint (contains metadata)
      try {
        const baseResponse = await fetch(`https://verification.didit.me/v3/session/${session_id}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-api-key": DIDIT_API_KEY }
        });
        if (baseResponse.ok) {
          rawBaseData = await baseResponse.json();
          // Merge, but don't overwrite decision data if it exists
          sessionData = { ...rawBaseData, ...sessionData };
        } else {
          console.warn(`Base session endpoint failed: ${baseResponse.status}`);
        }
      } catch (err) {
        console.error('Error fetching base session:', err);
      }

      logDiditDecisionDebug(session_id, rawDecisionData, rawBaseData, sessionData);

      // FALLBACK: Check local 'verification_sessions' table
      // This is crucial if we are using a TEMP_ ref that the Webhook has processed
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

          // 1. Try lookup by Session Reference (UUID)
          let { data: localData, error } = await supabaseAdmin
            .from('verification_sessions')
            .select('status, verification_data')
            .eq('session_ref', session_id)
            .maybeSingle();

          // 2. If not found, and session_id looks like a TEMP ref, try lookup by user_ref inside JSON
          if (!localData && session_id && session_id.startsWith('TEMP_')) {
            for (const refField of ['user_ref', 'vendor_data', 'signup_attempt_ref']) {
              const { data: refData } = await supabaseAdmin
                .from('verification_sessions')
                .select('status, verification_data')
                // Use JSON arrow operator to filter by field inside verification_data.
                .eq(`verification_data->>${refField}`, session_id)
                .maybeSingle();

              if (refData) {
                localData = refData;
                break;
              }
            }
          }

          if (localData) {
            // Read the ACTUAL status from the database - DO NOT hardcode 'Approved'
            // The webhook now stores all statuses: APPROVED, DECLINED, ABANDONED, PENDING_REVIEW
            const localStatus = normalizeDiditStatus(localData.status) || 'PENDING';
            const rawDecisionStatus = resolveSourceStatus(rawDecisionData);
            const rawBaseStatus = resolveSourceStatus(rawBaseData);
            const diditResolvedStatus = resolveDiditSessionStatus(rawDecisionData, rawBaseData, sessionData);
            const diditFailureOverridesLocal = isFailedDiditStatus(diditResolvedStatus);
            const diditRequiresReview = diditResolvedStatus === 'PENDING_REVIEW' && localStatus === 'APPROVED';
            const localStatusIsFinal = isFinalSessionStatus(localStatus);
            const diditStatusIsFinal = isFinalSessionStatus(diditResolvedStatus);
            const effectiveStatus = diditFailureOverridesLocal
              ? diditResolvedStatus
              : diditRequiresReview
                ? diditResolvedStatus
                : localStatusIsFinal
                  ? localStatus
                  : diditStatusIsFinal
                    ? diditResolvedStatus
                    : (localStatus || diditResolvedStatus || 'PENDING');
            console.log("[didit] get_session status resolved", {
              sessionId: session_id,
              storedStatus: localStatus,
              rawDecisionStatus: rawDecisionStatus || null,
              rawBaseStatus: rawBaseStatus || null,
              diditResolvedStatus: diditResolvedStatus || null,
              effectiveStatus,
              diditFailureOverridesLocal,
              diditRequiresReview,
            });

            if ((diditFailureOverridesLocal || diditRequiresReview || (!localStatusIsFinal && diditStatusIsFinal)) && diditResolvedStatus && diditResolvedStatus !== localStatus) {
              const { error: statusSyncError } = await supabaseAdmin
                .from('verification_sessions')
                .update({ status: diditResolvedStatus })
                .eq('session_ref', String(session_id));

              if (statusSyncError) {
                console.error('Failed to sync Didit final status:', statusSyncError.message);
              }
            }

            // Merge local data (extracted by webhook) into sessionData
            sessionData = {
              ...sessionData,
              status: effectiveStatus, // Use the ACTUAL status from database/live Didit
              rawDiditStatus: rawBaseStatus || rawDecisionStatus || null,
              businessStatus: effectiveStatus,
              diditResolvedStatus: diditResolvedStatus || null,
              verification_data: {
                status: effectiveStatus, // Also include in verification_data for frontend compatibility
                rawDiditStatus: rawBaseStatus || rawDecisionStatus || null,
                businessStatus: effectiveStatus,
                diditResolvedStatus: diditResolvedStatus || null,
              },
              extracted_data: {
                ...sessionData.extracted_data,
                ...(localData.verification_data || {}),
                firstName: localData.verification_data?.first_name,
                lastName: localData.verification_data?.last_name,
                fullName: localData.verification_data?.full_name
              }
            };
          }
        } catch (dbErr) {
          console.error('Database fallback error:', dbErr);
        }
      }

      // --- NORMALIZATION STEP ---
      // Dig through the messy Didit response to find the Name and Status reliably
      const findIn = (obj: any, keys: string[]) => {
        if (!obj) return undefined;
        for (const k of keys) {
          if (obj[k]) return obj[k];
        }
        return undefined;
      };

      const candidates = [
        sessionData,
        sessionData?.features?.extracted_data,
        sessionData?.extracted_data,
        sessionData?.verification_data,
        sessionData?.details?.extracted_data,
        sessionData?.decision?.details?.extracted_data,
        sessionData?.ocr,
        sessionData?.mrz
      ];

      let foundFull = '';
      let foundFirst = '';
      let foundMiddle = '';
      let foundLast = '';

      for (const src of candidates) {
        if (!src) continue;
        if (!foundFull) foundFull = findIn(src, ['fullName', 'full_name', 'name']);
        if (!foundFirst) foundFirst = findIn(src, ['firstName', 'first_name']);
        if (!foundMiddle) foundMiddle = findIn(src, ['middleName', 'middle_name']);
        if (!foundLast) foundLast = findIn(src, ['lastName', 'last_name']);
      }

      let derivedName = foundFull;
      if (!derivedName && (foundFirst && foundLast)) {
        derivedName = [foundFirst, foundMiddle, foundLast].filter(Boolean).join(' ');
      }


      // Return normalized data along with raw
      return new Response(JSON.stringify({
        ...sessionData,
        derived: {
          fullName: derivedName,
          firstName: foundFirst,
          lastName: foundLast
        }
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required", success: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const shouldForceNewSession = force_new === true || force_new === "true";
    const signupAttemptRef = String(userId || "").trim();
    const diditVendorData = await resolveDiditVendorData(signupAttemptRef, normalizedEmail, {
      forceNew: shouldForceNewSession,
    });
    const isPreAuthSignup = signupAttemptRef.startsWith("TEMP_");

    const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    if (supabaseAdmin && !shouldForceNewSession) {
      const reusableSession = await resolveReusableDiditSession(supabaseAdmin, {
        normalizedEmail,
        existingSessionId: existing_session_id,
      });

      if (reusableSession) {
        console.log("[didit] reusing active session", {
          sessionId: reusableSession.sessionId,
          status: reusableSession.status,
        });
        return jsonResponse(reusableSession);
      }
    }

    let registrationAttemptId: string | null = null;
    if (supabaseAdmin) {
      try {
        const registrationAttempt = await enforceRegistrationRateLimit(supabaseAdmin, req, {
          action: "create_didit_session",
          email: normalizedEmail,
          limits: {
            hourlyEmail: 12,
            dailyEmail: 24,
            hourlyIp: 40,
            dailyIp: 120,
            hourlyDevice: 24,
            dailyDevice: 60,
          },
          metadata: {
            role: normalizedRole || null,
            stable_presignup_vendor_data: isPreAuthSignup && diditVendorData !== signupAttemptRef,
            user_ref_kind: diditVendorData.startsWith("TEMP_") ? "temp" : "auth_user",
          },
        });
        registrationAttemptId = registrationAttempt?.attemptId || null;
      } catch (rateLimitError) {
        const status = getRegistrationRateLimitStatus(rateLimitError);
        if (status) {
          return new Response(JSON.stringify({ error: rateLimitError.message, success: false }), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw rateLimitError;
      }
    }

    if (supabaseAdmin && normalizedEmail) {
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [{ count: hourlyCount }, { count: dailyCount }] = await Promise.all([
          supabaseAdmin
            .from("verification_sessions")
            .select("session_ref", { count: "exact", head: true })
            .eq("verification_data->>email", normalizedEmail)
            .not("verification_data->>session_url", "is", null)
            .gte("created_at", oneHourAgo),
          supabaseAdmin
            .from("verification_sessions")
            .select("session_ref", { count: "exact", head: true })
            .eq("verification_data->>email", normalizedEmail)
            .not("verification_data->>session_url", "is", null)
            .gte("created_at", oneDayAgo),
        ]);

        if ((hourlyCount || 0) >= 3 || (dailyCount || 0) >= 8) {
          return jsonResponse({
            error: "Too many verification attempts. Please wait before trying again.",
            success: false,
          }, 429);
        }
      } catch (sessionRateLimitError) {
        console.error("didit_rate_limit_lookup_failed", sessionRateLimitError);
      }
    }

    // Fallback anon key if not in env
    const anonKey = SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZmxkeGVnc3Z6ZWNzaGxheXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTgyOTUsImV4cCI6MjA4NDIzNDI5NX0._BKyxjyqHKHaheMWkBk8mMalzSPy_gm1ImsT_RQaOB0';

    // Build the redirect URL that Didit will use after verification
    // This is where the user's browser goes after completing verification
    // Include the client's redirect_url (e.g., exp://... or musikalokal://...)
    // so verification-redirect can send them back to the right place
    let finalRedirectUrl = `${SUPABASE_URL}/functions/v1/verification-redirect?vendor_data=${diditVendorData}&apikey=${anonKey}`;

    if (redirect_url) {
      finalRedirectUrl += `&redirect_to=${encodeURIComponent(redirect_url)}`;
    } else if (callback) {
      // Fallback to callback if provided, though we prefer distinct redirect_url
      finalRedirectUrl += `&redirect_to=${encodeURIComponent(callback)}`;
    }
    // Else, verification-redirect will fallback to static default


    console.log("[didit] creating session", {
      workflowId: DIDIT_WORKFLOW_ID,
      email: maskEmailForDiditLog(normalizedEmail),
      role: normalizedRole || null,
      documentType: document_type || null,
      vendorData: diditVendorData,
      vendorDataKind: diditVendorData.startsWith("TEMP_") ? "temp" : "auth_user",
      stablePreSignupVendorData: isPreAuthSignup && diditVendorData !== signupAttemptRef,
    });

    // Create session with Didit API v3
    const diditResponse = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": DIDIT_API_KEY,
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: diditVendorData, // Stable per pre-signup email so Didit does not treat each retry as a different user.
        callback: finalRedirectUrl, // Browser redirect URL after verification completes
        metadata: {
          signup_role: normalizedRole || undefined,
          signup_attempt_ref: isPreAuthSignup ? signupAttemptRef : undefined,
        },
        contact_details: normalizedEmail
          ? {
            email: normalizedEmail,
            send_notification_emails: false,
          }
          : undefined,
      }),
    });

    if (!diditResponse.ok) {
      const errorText = await diditResponse.text();
      console.error(`Didit API error: ${diditResponse.status} - ${errorText}`);
      if (supabaseAdmin) {
        await markRegistrationAttempt(supabaseAdmin, registrationAttemptId, {
          success: false,
          reason: `didit_create_failed_${diditResponse.status}`,
        });
      }
      return new Response(
        JSON.stringify({
          error: "Failed to create verification session",
          details: errorText,
          success: false
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const diditData = await diditResponse.json();
    const verificationUrl = resolveDiditVerificationUrl(diditData);
    const createdSessionId = diditData.session_id || diditData.id;
    if (!createdSessionId) {
      throw new Error("Didit did not return a session ID");
    }
    const returnedWorkflowId = firstNonEmptyString([
      diditData?.workflow_id,
      diditData?.workflowId,
      diditData?.session?.workflow_id,
      diditData?.session?.workflowId,
      DIDIT_WORKFLOW_ID,
    ]);
    console.log("[didit] created session response", {
      sessionId: createdSessionId,
      workflowIdConfigured: DIDIT_WORKFLOW_ID,
      workflowIdReturned: returnedWorkflowId || null,
      urlPresent: Boolean(verificationUrl),
      responseKeys: typeof diditData === "object" && diditData ? Object.keys(diditData).slice(0, 30) : [],
    });
    if (!verificationUrl) {
      if (supabaseAdmin) {
        await markRegistrationAttempt(supabaseAdmin, registrationAttemptId, {
          success: false,
          reason: "didit_create_missing_verification_url",
          didit_session_id: createdSessionId,
        });
      }
      return jsonResponse({
        error: "Didit created a session but did not return a verification URL.",
        success: false,
        sessionId: createdSessionId,
        diditResponseKeys: typeof diditData === "object" && diditData ? Object.keys(diditData).slice(0, 30) : [],
      });
    }

    /*
    Expected response:
    {
      "session_id": "11111111-2222-3333-4444-555555555555",
      "session_number": 1234,
      "session_token": "abcdef123456",
      "vendor_data": "user-123",
      "status": "Not Started",
      "workflow_id": "...",
      "callback": "...",
      "url": "https://verify.didit.me/session/abcdef123456"
    }
    */

    if (supabaseAdmin) {
      const supabase = supabaseAdmin;

      if (normalizedEmail) {
        const { error: supersedeError } = await supabase
          .from('verification_sessions')
          .update({ status: 'SUPERSEDED' })
          .eq('verification_data->>email', normalizedEmail)
          .in('status', ['PENDING', 'Not Started', 'In Progress'])
          .neq('session_ref', createdSessionId);

        if (supersedeError) {
          console.error('Failed to supersede older Didit sessions:', supersedeError);
        }
      }

      const { error: sessionStoreError } = await supabase
        .from('verification_sessions')
        .upsert({
          session_ref: createdSessionId,
          status: 'PENDING',
          verification_data: {
            user_ref: diditVendorData,
            vendor_data: diditVendorData,
            signup_attempt_ref: isPreAuthSignup ? signupAttemptRef : null,
            email: normalizedEmail || null,
            signup_role: normalizedRole || null,
            session_url: verificationUrl || null,
            workflow_id: returnedWorkflowId || DIDIT_WORKFLOW_ID,
            started_at: new Date().toISOString(),
          },
        });

      if (sessionStoreError) {
        console.error('Failed to store pending Didit session:', sessionStoreError);
      }

      // Update user profile with the session ID.
      // SKIP if it's a temp ID (user not created yet).
      if (userId && !userId.startsWith('TEMP_')) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            didit_session_id: createdSessionId,
            verification_status: "PENDING",
          })
          .eq("id", userId);

        if (updateError) {
          console.error("Failed to update profile:", updateError);
          // Don't fail the request, just log the error
        } else {
        }
      }
    }

    if (supabaseAdmin) {
      await markRegistrationAttempt(supabaseAdmin, registrationAttemptId, {
        success: true,
        didit_session_id: createdSessionId,
        metadata: {
          role: normalizedRole || null,
          workflow_id: returnedWorkflowId || DIDIT_WORKFLOW_ID,
          stable_presignup_vendor_data: isPreAuthSignup && diditVendorData !== signupAttemptRef,
          user_ref_kind: diditVendorData.startsWith("TEMP_") ? "temp" : "auth_user",
        },
      });
    }

    // Return the verification URL to the client
    return new Response(
      JSON.stringify({
        success: true,
        sessionId: createdSessionId,
        workflowId: returnedWorkflowId || DIDIT_WORKFLOW_ID,
        verificationUrl, // This is the URL to redirect the user to
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error creating Didit session:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message, success: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
