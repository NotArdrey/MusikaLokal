// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const IDENTITY_BUCKET = "identity-manual";
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

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
  if (!userEmail) return false;

  const subject = "Identity Verification Received - MusikaLokal";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 12px;">Manual Verification Submitted</h2>
      <p style="margin: 0 0 12px;">We received your ${documentType} submission for manual identity verification.</p>
      <p style="margin: 0 0 12px;">Our admin team will review this within <strong>5-7 business days</strong>.</p>
      <p style="margin: 0;">We will automatically email you once a decision is made.</p>
    </div>
  `;

  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (resendApiKey) {
    try {
      const resendFrom = Deno.env.get("RESEND_FROM") || "MusikaLokal <noreply@musikalokal.com>";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [userEmail],
          subject,
          html,
        }),
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Fall through to DB queue.
    }
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

  return !error;
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

    const userId = String(body?.userId || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const documentType = String(body?.documentType || "").trim();
    const documentTypeKey = String(body?.documentTypeKey || "").trim() || null;
    const documentCountry = String(body?.documentCountry || "PHL").trim().toUpperCase();

    if (!userId || !email || !documentType) {
      return jsonResponse({ error: "Missing required fields: userId, email, documentType" }, 400);
    }

    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserError || !authUserData?.user) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    const authEmail = String(authUserData.user.email || "").trim().toLowerCase();
    if (authEmail && authEmail !== email) {
      return jsonResponse({ error: "Email mismatch for this user" }, 400);
    }

    const frontImage = normalizeImagePayload(body?.frontImage, "front");
    if (!frontImage) {
      return jsonResponse({ error: "frontImage is required" }, 400);
    }

    const backImage = normalizeImagePayload(body?.backImage, "back");
    const selfieImage = normalizeImagePayload(body?.selfieImage, "selfie");

    const frontPath = await uploadImage(supabaseAdmin, userId, "front", frontImage);
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
      .eq("source", "MANUAL_UPLOAD")
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
          front_image_path: frontPath,
          back_image_path: backPath,
          selfie_image_path: selfiePath,
          review_notes: null,
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
          source: "MANUAL_UPLOAD",
          status: "PENDING_REVIEW",
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
        id_verified_at: null,
      })
      .eq("id", userId);

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "info",
      title: "Identity Review Submitted",
      message: "Your ID is now under manual review. We will email you within 5-7 business days.",
      meta: {
        manual_identity_review_id: reviewId,
        document_type: documentType,
        verification_status: "PENDING_REVIEW",
      },
    });

    await sendSubmissionEmail(supabaseAdmin, email, documentType);

    return jsonResponse({
      success: true,
      reviewId,
      status: "PENDING_REVIEW",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
