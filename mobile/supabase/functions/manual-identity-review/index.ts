// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailWithGmail } from "../_shared/gmailEmail.ts";
import {
  buildIdentityDocumentFingerprint,
  findSameRoleIdentityDuplicate,
  getDuplicateIdentityReviewReason,
  recordIdentityDocumentClaim,
} from "../_shared/identityDuplicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const IDENTITY_BUCKET = "identity-manual";
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const allowedSignupRoles = new Set(["fan", "musician"]);

function getDefaultDisplayNameForRole(role: unknown) {
  return String(role || "").trim().toLowerCase() === "fan" ? "Fan" : "Musician";
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeBase64(input: string) {
  const withNoPrefix = input.includes(",") ? input.split(",").pop() || "" : input;
  return withNoPrefix.replace(/\s/g, "");
}

function estimateBase64Bytes(base64Value: string) {
  const normalized = normalizeBase64(base64Value);
  const padding = (normalized.match(/=/g) || []).length;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function decodeBase64(base64Value: string) {
  const normalized = normalizeBase64(base64Value);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sanitizeFileSegment(raw: string, fallback: string) {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function escapeHtml(raw: unknown) {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPhilippineDateInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function normalizeDateInput(raw: unknown, label: string, required = false) {
  const value = String(raw || "").trim();
  if (!value) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is invalid`);
  }

  const today = getPhilippineDateInputValue();
  if (value < today) {
    throw new Error(`${label} cannot be in the past`);
  }

  return value;
}

function buildMusikaLokalEmail({
  title,
  subtitle,
  bodyHtml,
}: {
  title: string;
  subtitle: string;
  bodyHtml: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - MusikaLokal</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #6366f1; margin: 0; font-size: 30px; font-weight: 800;">MusikaLokal</h1>
  </div>

  <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 30px;">
    <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; margin-bottom: 10px;">Identity Verification</div>
    <h2 style="margin: 0 0 10px 0; font-size: 24px; line-height: 1.3;">${escapeHtml(title)}</h2>
    <p style="margin: 0; opacity: 0.9;">${escapeHtml(subtitle)}</p>
  </div>

  ${bodyHtml}

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

  <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
    This email was sent by MusikaLokal. If you did not create an account, please ignore this email.<br>
    &copy; ${new Date().getFullYear()} MusikaLokal. All rights reserved.
  </p>
</body>
</html>`;
}

function extensionFromPayload(payload: any) {
  const mimeType = String(payload?.mimeType || "").toLowerCase();
  const ext = String(payload?.extension || "").toLowerCase();

  if (ext) return ext.replace(/^\./, "");
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

function normalizeImagePayload(raw: any, label: string) {
  if (!raw) return null;

  const base64 = String(raw?.base64 || "").trim();
  if (!base64) {
    throw new Error(`${label} image is missing base64 content`);
  }

  const estimatedBytes = estimateBase64Bytes(base64);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_IMAGE_BYTES) {
    throw new Error(`${label} image exceeds the size limit (max 7MB)`);
  }

  const mimeType = String(raw?.mimeType || "").toLowerCase();
  if (mimeType && !mimeType.startsWith("image/")) {
    throw new Error(`${label} file must be an image`);
  }

  const extension = extensionFromPayload(raw);
  const fileName = String(raw?.fileName || `${label}.${extension}`);

  return {
    base64,
    mimeType: mimeType || `image/${extension === "jpg" ? "jpeg" : extension}`,
    extension,
    fileName,
  };
}

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to resolve existing signup user: ${error.message}`);
    }

    const users = data?.users || [];
    const matchedUser = users.find((user: any) => String(user?.email || "").trim().toLowerCase() === normalizedEmail);
    if (matchedUser) {
      return matchedUser;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
}

async function ensurePendingReviewProfile(
  supabaseAdmin: any,
  authUser: any,
  email: string,
  diditSessionId: string | null = null,
  submittedFullName: string | null = null,
  idDocumentExpiry: string | null = null,
  role = "musician",
) {
  const metadata = authUser?.user_metadata || {};
  const normalizedRole = String(role || metadata.role || "musician").trim().toLowerCase();
  if (!allowedSignupRoles.has(normalizedRole)) {
    throw new Error("Invalid signup role.");
  }

  const fallbackName =
    String(submittedFullName || metadata.full_name || metadata.display_name || metadata.name || "").trim() ||
    email.split("@")[0] ||
    getDefaultDisplayNameForRole(normalizedRole);

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: authUser.id,
      email,
      full_name: fallbackName,
      role: normalizedRole,
      is_verified: false,
      verification_status: "PENDING_REVIEW",
      didit_session_id: diditSessionId,
      id_document_expiry: idDocumentExpiry,
      id_verified_at: null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to prepare profile for manual review: ${error.message}`);
  }
}

async function ensurePendingReviewAuthUser(
  supabaseAdmin: any,
  payload: {
    userId: string;
    email: string;
    password: string;
    role: string;
    fullName: string;
    documentType: string;
    documentTypeKey: string | null;
    verificationMode: string;
    diditSessionId: string | null;
    idDocumentExpiry: string | null;
  },
) {
  const role = String(payload.role || "musician").trim().toLowerCase();
  if (!allowedSignupRoles.has(role)) {
    throw new Error("Only fan or musician accounts can submit manual identity review during signup.");
  }

  if (payload.userId) {
    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(payload.userId);
    if (authUserError || !authUserData?.user) {
      throw new Error("User not found");
    }

    return authUserData.user;
  }

  const existingUser = await findAuthUserByEmail(supabaseAdmin, payload.email);
  if (existingUser) {
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, is_verified, verification_status")
      .eq("id", existingUser.id)
      .maybeSingle();

    const existingRole = String(existingProfile?.role || existingUser.user_metadata?.role || "").trim().toLowerCase();
    const existingStatus = String(existingProfile?.verification_status || existingUser.user_metadata?.verification_status || "").trim().toUpperCase();

    if (existingRole && existingRole !== role) {
      throw new Error("This email is already registered with another account type. Please log in to continue.");
    }

    if (existingProfile?.is_verified || existingStatus === "APPROVED") {
      throw new Error("This email is already registered and verified. Please log in.");
    }

    const fallbackName = payload.fullName || payload.email.split("@")[0] || getDefaultDisplayNameForRole(role);
    const updatePayload: Record<string, unknown> = {
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        role,
        verification_status: "PENDING_REVIEW",
        is_verified: false,
        full_name: fallbackName,
        display_name: fallbackName,
        name: fallbackName,
        selected_document_type: payload.documentType,
        selected_document_type_key: payload.documentTypeKey,
        verification_mode: payload.verificationMode,
        didit_session_id: payload.diditSessionId,
      },
    };

    if (payload.password && payload.password.length >= 6) {
      updatePayload.password = payload.password;
    }

    const { data: updatedUserData, error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
      existingUser.id,
      updatePayload,
    );

    if (updateUserError || !updatedUserData?.user) {
      throw new Error(updateUserError?.message || "Unable to update existing signup user for review.");
    }

    return updatedUserData.user;
  }

  if (!payload.password || payload.password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const fallbackName = payload.fullName || payload.email.split("@")[0] || getDefaultDisplayNameForRole(role);
  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: false,
    user_metadata: {
      role,
      verification_status: "PENDING_REVIEW",
      is_verified: false,
      full_name: fallbackName,
      display_name: fallbackName,
      name: fallbackName,
      selected_document_type: payload.documentType,
      selected_document_type_key: payload.documentTypeKey,
      verification_mode: payload.verificationMode,
      didit_session_id: payload.diditSessionId,
      id_document_expiry: payload.idDocumentExpiry,
    },
  });

  if (createUserError || !createdUser?.user) {
    throw new Error(createUserError?.message || "Unable to create manual review account.");
  }

  return createdUser.user;
}

async function uploadImage(
  supabaseAdmin: any,
  userId: string,
  slot: "front" | "back" | "selfie",
  payload: { base64: string; mimeType: string; extension: string; fileName: string },
) {
  const fileBytes = decodeBase64(payload.base64);
  const cleanUserId = sanitizeFileSegment(userId, "user");
  const timePrefix = Date.now();
  const extension = sanitizeFileSegment(payload.extension, "jpg");
  const fileName = sanitizeFileSegment(payload.fileName, `${slot}_${timePrefix}`);
  const path = `${cleanUserId}/${timePrefix}_${slot}_${fileName}.${extension}`;

  const { error } = await supabaseAdmin.storage
    .from(IDENTITY_BUCKET)
    .upload(path, fileBytes, {
      contentType: payload.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload ${slot} image: ${error.message}`);
  }

  return path;
}

async function sendSubmissionEmail(
  supabaseAdmin: any,
  userEmail: string,
  documentType: string,
) {
  if (!userEmail) return { sent: false, queued: false, provider: "none", error: "Missing recipient email" };

  const subject = "Identity Verification Received - MusikaLokal";
  const safeDocumentType = escapeHtml(documentType);
  const html = buildMusikaLokalEmail({
    title: "Manual Verification Submitted",
    subtitle: "Your document is now queued for admin review",
    bodyHtml: `
  <p style="margin: 0 0 12px;">We received your ${safeDocumentType} submission for manual identity verification.</p>
  <ul style="background: #f8fafc; padding: 20px 20px 20px 40px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 24px 0;">
    <li>Our admin team will review this within <strong>5-7 business days</strong></li>
    <li>We will automatically email you once a decision is made</li>
    <li>No additional action is needed while your review is pending</li>
  </ul>
  <p style="margin: 0;">Thank you,<br>MusikaLokal Team</p>`,
  });

  const gmailDelivery = await sendEmailWithGmail({
    to: userEmail,
    subject,
    html,
    recipientName: "User",
    source: "manual-identity-review",
  });
  if (gmailDelivery.sent) {
    return { sent: true, queued: false, provider: gmailDelivery.provider };
  }
  if (gmailDelivery.error) {
    console.error("manual_identity_review_submission_email_gmail_failed", {
      provider: gmailDelivery.provider,
      message: gmailDelivery.error,
    });
  }

  const { error } = await supabaseAdmin.from("email_notifications").insert({
    recipient_email: userEmail,
    recipient_name: "User",
    subject,
    html_content: html,
    template_type: "manual_identity_review_submitted",
    status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("manual_identity_review_submission_email_queue_failed", { message: error.message });
    return { sent: false, queued: false, provider: "email_notifications", error: error.message };
  }

  return { sent: false, queued: true, provider: "email_notifications" };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action !== "submit_manual_review_signup") {
      return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
    }

    let userId = String(body?.userId || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = String(body?.role || "musician").trim().toLowerCase();
    const fullName = String(body?.fullName || body?.displayName || "").trim();
    const source = String(body?.source || "MANUAL_UPLOAD").trim().toUpperCase();
    const idDocumentExpiry = normalizeDateInput(
      body?.idDocumentExpiry || body?.id_document_expiry,
      "ID expiration date",
      source === "MANUAL_UPLOAD",
    );
    const identityDocumentNumber = String(
      body?.identityDocumentNumber || body?.idDocumentNumber || body?.documentNumber || "",
    ).trim();
    const documentType = String(body?.documentType || "").trim();
    const documentTypeKey = String(body?.documentTypeKey || "").trim() || null;
    const documentCountry = String(body?.documentCountry || "PHL").trim().toUpperCase();
    const diditSessionId = String(body?.diditSessionId || body?.didit_session_id || "").trim() || null;
    const verificationMode = source === "DIDIT_PENDING" ? "didit" : "manual_upload";

    if (!email || !documentType) {
      return jsonResponse({ error: "Missing required fields: email, documentType" }, 400);
    }

    if (source !== "MANUAL_UPLOAD" && source !== "DIDIT_PENDING") {
      return jsonResponse({ error: "Invalid manual identity review source" }, 400);
    }

    if (source === "MANUAL_UPLOAD" && !fullName) {
      return jsonResponse({ error: "Full name on ID is required" }, 400);
    }

    if (source === "MANUAL_UPLOAD" && !identityDocumentNumber) {
      return jsonResponse({ error: "ID number is required" }, 400);
    }

    const documentFingerprint = await buildIdentityDocumentFingerprint(null, {
      documentNumber: identityDocumentNumber,
      documentType,
      documentTypeKey,
      documentCountry,
    });

    const duplicateIdentity = documentFingerprint
      ? await findSameRoleIdentityDuplicate(supabaseAdmin, {
        documentFingerprint,
        role,
        email,
      })
      : { hasDuplicate: false, matches: [] };

    const duplicateReason = duplicateIdentity.hasDuplicate ? getDuplicateIdentityReviewReason(role) : null;

    const authUser = await ensurePendingReviewAuthUser(supabaseAdmin, {
      userId,
      email,
      password,
      role,
      fullName,
      documentType,
      documentTypeKey,
      verificationMode,
      diditSessionId,
      idDocumentExpiry,
    });

    userId = String(authUser.id || "").trim();
    const authEmail = String(authUser.email || "").trim().toLowerCase();
    if (authEmail && authEmail !== email) {
      return jsonResponse({ error: "Email mismatch for this user" }, 400);
    }

    await ensurePendingReviewProfile(supabaseAdmin, authUser, authEmail || email, diditSessionId, fullName || null, idDocumentExpiry, role);

    const frontImage = normalizeImagePayload(body?.frontImage, "front");
    if (!frontImage && source === "MANUAL_UPLOAD") {
      return jsonResponse({ error: "frontImage is required" }, 400);
    }

    const backImage = normalizeImagePayload(body?.backImage, "back");
    const selfieImage = normalizeImagePayload(body?.selfieImage, "selfie");
    if (!backImage && source === "MANUAL_UPLOAD") {
      return jsonResponse({ error: "backImage is required" }, 400);
    }

    if (!selfieImage && source === "MANUAL_UPLOAD") {
      return jsonResponse({ error: "selfieImage is required" }, 400);
    }

    const frontPath = frontImage
      ? await uploadImage(supabaseAdmin, userId, "front", frontImage)
      : null;
    const backPath = backImage
      ? await uploadImage(supabaseAdmin, userId, "back", backImage)
      : null;
    const selfiePath = selfieImage
      ? await uploadImage(supabaseAdmin, userId, "selfie", selfieImage)
      : null;

    const { data: existingPending } = await supabaseAdmin
      .from("manual_identity_reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "PENDING_REVIEW")
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let reviewId = String(existingPending?.id || "").trim();
    const nowIso = new Date().toISOString();

    if (reviewId) {
      const { error: updateReviewError } = await supabaseAdmin
        .from("manual_identity_reviews")
        .update({
          submitted_by_email: email,
          document_type: documentType,
          document_type_key: documentTypeKey,
          document_country: documentCountry,
          source,
          front_image_path: frontPath,
          back_image_path: backPath,
          selfie_image_path: selfiePath,
          submitted_role: role,
          document_fingerprint: documentFingerprint,
          duplicate_reason: duplicateReason,
          duplicate_match_count: duplicateIdentity.matches?.length || 0,
          review_notes: duplicateReason,
          reviewed_by: null,
          reviewed_at: null,
          decision_email_sent_at: null,
          expected_decision_by: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: nowIso,
        })
        .eq("id", reviewId);

      if (updateReviewError) {
        throw new Error(updateReviewError.message);
      }
    } else {
      const { data: insertedReview, error: insertReviewError } = await supabaseAdmin
        .from("manual_identity_reviews")
        .insert({
          user_id: userId,
          submitted_by_email: email,
          document_type: documentType,
          document_type_key: documentTypeKey,
          document_country: documentCountry,
          source,
          status: "PENDING_REVIEW",
          submitted_role: role,
          document_fingerprint: documentFingerprint,
          duplicate_reason: duplicateReason,
          duplicate_match_count: duplicateIdentity.matches?.length || 0,
          review_notes: duplicateReason,
          front_image_path: frontPath,
          back_image_path: backPath,
          selfie_image_path: selfiePath,
          expected_decision_by: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();

      if (insertReviewError || !insertedReview?.id) {
        throw new Error(insertReviewError?.message || "Unable to create manual review record");
      }

      reviewId = String(insertedReview.id);
    }

    await supabaseAdmin
      .from("profiles")
      .update({
        verification_status: "PENDING_REVIEW",
        is_verified: false,
        full_name: fullName || undefined,
        id_document_expiry: idDocumentExpiry,
        id_verified_at: null,
      })
      .eq("id", userId);

    await recordIdentityDocumentClaim(supabaseAdmin, {
      userId,
      role,
      documentFingerprint,
      documentType,
      documentTypeKey,
      documentCountry,
      source,
      status: "PENDING_REVIEW",
      manualReviewId: reviewId,
    });

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "info",
      title: "Identity Review Submitted",
      message: "Your ID is now under manual review. We will email you within 5-7 business days.",
      meta: {
        manual_identity_review_id: reviewId,
        document_type: documentType,
        verification_status: "PENDING_REVIEW",
        duplicate_identity_review: duplicateIdentity.hasDuplicate,
      },
    });

    const submissionEmail = await sendSubmissionEmail(supabaseAdmin, email, documentType);

    return jsonResponse({
      success: true,
      reviewId,
      status: "PENDING_REVIEW",
      duplicateIdentityReview: duplicateIdentity.hasDuplicate,
      submissionEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
