// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const allowedRoles = new Set([
  "musician",
  "studio-owner",
  "venue-owner",
  "producer",
  "admin",
]);

const roleAliases: Record<string, string> = {
  manager: "musician",
  "musician-member": "musician",
};

const allowedSubscriptionStatuses = new Set([
  "active",
  "cancelled",
  "expired",
]);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractUserIdFromJwt(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const normalizedPayload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const paddedPayload = normalizedPayload + "=".repeat((4 - (normalizedPayload.length % 4)) % 4);
    const payload = JSON.parse(atob(paddedPayload));
    const sub = String(payload?.sub || "").trim();
    return sub || null;
  } catch {
    return null;
  }
}

async function getAuthenticatedUserId(
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
) {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const userIdFromJwt = extractUserIdFromJwt(authHeader);
  if (userIdFromJwt) return userIdFromJwt;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.id) return null;
  return user.id;
}

async function assertAdmin(client: any, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || data.role !== "admin") {
    return false;
  }

  return true;
}

function parseRole(rawRole: unknown) {
  const role = String(rawRole || "").trim().toLowerCase();
  const normalizedRole = roleAliases[role] || role;
  if (!allowedRoles.has(normalizedRole)) return null;
  return normalizedRole;
}

function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

async function sendDecisionEmail(
  client: any,
  userEmail: string,
  decision: "APPROVED" | "DECLINED",
  reviewNotes: string | null,
) {
  if (!userEmail) return false;

  const normalizedDecision = decision === "APPROVED" ? "approved" : "declined";
  const subject = decision === "APPROVED"
    ? "Identity Verification Approved - MusikaLokal"
    : "Identity Verification Update - MusikaLokal";

  const notesHtml = reviewNotes
    ? `<p style=\"margin:16px 0 0;\"><strong>Admin notes:</strong> ${reviewNotes}</p>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 12px;">Identity Verification ${decision === "APPROVED" ? "Approved" : "Updated"}</h2>
      <p style="margin: 0 0 12px;">Your manual identity verification has been <strong>${normalizedDecision}</strong>.</p>
      ${decision === "APPROVED"
        ? "<p style=\"margin: 0 0 12px;\">You can now continue using verified-only features in MusikaLokal.</p>"
        : "<p style=\"margin: 0 0 12px;\">You may submit a new valid government ID if you want to retry verification.</p>"
      }
      ${notesHtml}
      <p style="margin: 16px 0 0;">Thank you,<br/>MusikaLokal Team</p>
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
      // Fallback to DB queue below.
    }
  }

  const { error } = await client.from("email_notifications").insert({
    recipient_email: userEmail,
    recipient_name: "User",
    subject,
    html_content: html,
    template_type: "manual_identity_review_decision",
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
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const actorId = await getAuthenticatedUserId(authHeader, supabaseUrl, anonKey);
    if (!actorId) {
      return jsonResponse({ error: "Invalid JWT" }, 401);
    }

    const client = createClient(supabaseUrl, serviceRoleKey);

    const isAdmin = await assertAdmin(client, actorId);
    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403);
    }

    const body = await req.json();
    const action = String(body?.action || "").trim();

    if (action === "fetch_users") {
      const limit = Math.max(1, Math.min(300, Number(body?.limit || 200)));

      const { data, error } = await client
        .from("profiles")
        .select(
          "id, full_name, email, role, is_verified, verification_status, created_at, subscription_status, subscription_expires_at, subscription_plan_id",
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return jsonResponse({ items: data || [] });
    }

    if (action === "fetch_manual_identity_reviews") {
      const limit = Math.max(1, Math.min(300, Number(body?.limit || 100)));
      const requestedStatus = String(body?.status || "PENDING_REVIEW").trim().toUpperCase();

      let reviewQuery = client
        .from("manual_identity_reviews")
        .select(
          "id, user_id, submitted_by_email, document_type, document_type_key, document_country, source, status, front_image_path, back_image_path, selfie_image_path, review_notes, reviewed_by, reviewed_at, expected_decision_by, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (requestedStatus && requestedStatus !== "ALL") {
        reviewQuery = reviewQuery.eq("status", requestedStatus);
      }

      const { data: reviews, error: reviewsError } = await reviewQuery;
      if (reviewsError) {
        return jsonResponse({ error: reviewsError.message }, 400);
      }

      const userIds = Array.from(new Set((reviews || []).map((item: any) => String(item.user_id || "")).filter(Boolean)));
      let profilesById = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: linkedProfiles, error: linkedProfilesError } = await client
          .from("profiles")
          .select("id, full_name, email, verification_status")
          .in("id", userIds);

        if (!linkedProfilesError && linkedProfiles) {
          profilesById = new Map(linkedProfiles.map((item: any) => [String(item.id), item]));
        }
      }

      const items = await Promise.all((reviews || []).map(async (review: any) => {
        const item = {
          ...review,
          profile: profilesById.get(String(review.user_id)) || null,
          front_image_url: null,
          back_image_url: null,
          selfie_image_url: null,
        } as Record<string, any>;

        if (review.front_image_path) {
          const { data: signed } = await client.storage
            .from("identity-manual")
            .createSignedUrl(String(review.front_image_path), 60 * 30);
          item.front_image_url = signed?.signedUrl || null;
        }

        if (review.back_image_path) {
          const { data: signed } = await client.storage
            .from("identity-manual")
            .createSignedUrl(String(review.back_image_path), 60 * 30);
          item.back_image_url = signed?.signedUrl || null;
        }

        if (review.selfie_image_path) {
          const { data: signed } = await client.storage
            .from("identity-manual")
            .createSignedUrl(String(review.selfie_image_path), 60 * 30);
          item.selfie_image_url = signed?.signedUrl || null;
        }

        return item;
      }));

      return jsonResponse({ items });
    }

    if (action === "review_manual_identity") {
      const reviewId = String(body?.reviewId || "").trim();
      const decision = String(body?.decision || "").trim().toUpperCase();
      const reviewNotesRaw = String(body?.reviewNotes || "").trim();
      const reviewNotes = reviewNotesRaw ? reviewNotesRaw : null;

      if (!reviewId) {
        return jsonResponse({ error: "Missing reviewId" }, 400);
      }

      if (decision !== "APPROVED" && decision !== "DECLINED") {
        return jsonResponse({ error: "Invalid decision. Use APPROVED or DECLINED." }, 400);
      }

      const { data: review, error: reviewError } = await client
        .from("manual_identity_reviews")
        .select("*")
        .eq("id", reviewId)
        .maybeSingle();

      if (reviewError) {
        return jsonResponse({ error: reviewError.message }, 400);
      }

      if (!review) {
        return jsonResponse({ error: "Manual identity review not found" }, 404);
      }

      if (String(review.status || "").toUpperCase() !== "PENDING_REVIEW") {
        return jsonResponse({ error: "This review is already finalized" }, 400);
      }

      const profileVerificationStatus = decision === "APPROVED" ? "APPROVED" : "DECLINED";
      const isVerified = decision === "APPROVED";
      const nowIso = new Date().toISOString();

      const { data: updatedReview, error: updateReviewError } = await client
        .from("manual_identity_reviews")
        .update({
          status: profileVerificationStatus,
          review_notes: reviewNotes,
          reviewed_by: actorId,
          reviewed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", reviewId)
        .select("*")
        .maybeSingle();

      if (updateReviewError) {
        return jsonResponse({ error: updateReviewError.message }, 400);
      }

      const { error: profileUpdateError } = await client
        .from("profiles")
        .update({
          is_verified: isVerified,
          verification_status: profileVerificationStatus,
          id_verified_at: isVerified ? nowIso : null,
        })
        .eq("id", review.user_id);

      if (profileUpdateError) {
        return jsonResponse({ error: profileUpdateError.message }, 400);
      }

      const { data: authUserData, error: authUserError } = await client.auth.admin.getUserById(String(review.user_id));
      if (authUserError || !authUserData?.user) {
        return jsonResponse({ error: "User not found for review" }, 404);
      }

      const existingMetadata = (authUserData.user.user_metadata || {}) as Record<string, unknown>;
      const { error: authUpdateError } = await client.auth.admin.updateUserById(String(review.user_id), {
        user_metadata: {
          ...existingMetadata,
          is_verified: isVerified,
          verification_status: profileVerificationStatus,
        },
      });

      if (authUpdateError) {
        return jsonResponse({ error: authUpdateError.message }, 400);
      }

      await client.from("notifications").insert({
        user_id: review.user_id,
        type: decision === "APPROVED" ? "success" : "warning",
        title: decision === "APPROVED" ? "Identity Verification Approved" : "Identity Verification Declined",
        message: decision === "APPROVED"
          ? "Your manual identity verification was approved."
          : "Your manual identity verification was declined. Please submit a new valid government ID.",
        meta: {
          manual_identity_review_id: reviewId,
          decision: profileVerificationStatus,
          review_notes: reviewNotes,
        },
      });

      const fallbackEmail = String(review.submitted_by_email || "").trim();
      const targetEmail = String(authUserData.user.email || fallbackEmail).trim().toLowerCase();
      const emailSent = await sendDecisionEmail(client, targetEmail, decision as "APPROVED" | "DECLINED", reviewNotes);

      if (emailSent) {
        await client
          .from("manual_identity_reviews")
          .update({ decision_email_sent_at: nowIso, updated_at: nowIso })
          .eq("id", reviewId);
      }

      return jsonResponse({
        item: {
          ...(updatedReview || review),
          decision_email_sent: emailSent,
        },
      });
    }

    if (action === "fetch_user_details") {
      const userId = String(body?.userId || "").trim();

      if (!userId) {
        return jsonResponse({ error: "Missing userId" }, 400);
      }

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      return jsonResponse({
        item: profile || null,
      });
    }

    if (action === "create_user") {
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const fullName = String(body?.fullName || "").trim();
      const role = parseRole(body?.role);
      const emailConfirmed = parseBoolean(body?.emailConfirmed) ?? false;
      const isVerified = parseBoolean(body?.isVerified) ?? false;

      if (!email || !password || !role) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      if (password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters" }, 400);
      }

      const { data: createdUser, error: createUserError } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: emailConfirmed,
        user_metadata: {
          role,
          is_verified: isVerified,
          full_name: fullName || null,
        },
      });

      if (createUserError) {
        return jsonResponse({ error: createUserError.message }, 400);
      }

      const userId = createdUser?.user?.id;
      if (!userId) {
        return jsonResponse({ error: "Unable to create user" }, 500);
      }

      const profilePayload = {
        id: userId,
        email,
        full_name: fullName || null,
        role,
        is_verified: isVerified,
      };

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" })
        .select("id, full_name, email, role, is_verified, created_at")
        .maybeSingle();

      if (profileError) {
        await client.auth.admin.deleteUser(userId);
        return jsonResponse({ error: profileError.message }, 400);
      }

      return jsonResponse({ item: profile || profilePayload }, 200);
    }

    if (action === "update_user") {
      const userId = String(body?.userId || "").trim();
      const maybeRole = body?.role;
      const maybeFullName = body?.fullName;
      const maybeEmail = body?.email;
      const maybeIsVerified = body?.isVerified;
      const maybeSubscriptionStatus = body?.subscriptionStatus;
      const maybeSubscriptionExpiresAt = body?.subscriptionExpiresAt;
      const maybeSubscriptionPlanId = body?.subscriptionPlanId;

      if (!userId) {
        return jsonResponse({ error: "Missing userId" }, 400);
      }

      const profileUpdates: Record<string, unknown> = {};

      if (maybeRole !== undefined) {
        const parsedRole = parseRole(maybeRole);
        if (!parsedRole) {
          return jsonResponse({ error: "Invalid role" }, 400);
        }
        profileUpdates.role = parsedRole;
      }

      if (maybeFullName !== undefined) {
        profileUpdates.full_name = String(maybeFullName || "").trim() || null;
      }

      if (maybeEmail !== undefined) {
        const email = String(maybeEmail || "").trim().toLowerCase();
        if (!email) {
          return jsonResponse({ error: "Email cannot be empty" }, 400);
        }
        profileUpdates.email = email;
      }

      if (maybeIsVerified !== undefined) {
        const parsed = parseBoolean(maybeIsVerified);
        if (parsed === null) {
          return jsonResponse({ error: "Invalid isVerified value" }, 400);
        }
        profileUpdates.is_verified = parsed;
      }

      if (maybeSubscriptionStatus !== undefined) {
        const status = String(maybeSubscriptionStatus ?? "").trim().toLowerCase();

        if (!status || status === "none" || status === "null") {
          profileUpdates.subscription_status = null;
        } else if (allowedSubscriptionStatuses.has(status)) {
          profileUpdates.subscription_status = status;
        } else {
          return jsonResponse({ error: "Invalid subscriptionStatus value" }, 400);
        }
      }

      if (maybeSubscriptionExpiresAt !== undefined) {
        const rawDate = String(maybeSubscriptionExpiresAt ?? "").trim();

        if (!rawDate || rawDate.toLowerCase() === "none" || rawDate.toLowerCase() === "null") {
          profileUpdates.subscription_expires_at = null;
        } else {
          const parsedDate = new Date(rawDate);
          if (Number.isNaN(parsedDate.getTime())) {
            return jsonResponse({ error: "Invalid subscriptionExpiresAt value" }, 400);
          }

          profileUpdates.subscription_expires_at = parsedDate.toISOString();
        }
      }

      if (maybeSubscriptionPlanId !== undefined) {
        const planId = String(maybeSubscriptionPlanId ?? "").trim();
        profileUpdates.subscription_plan_id = planId || null;
      }

      if (profileUpdates.subscription_status === null) {
        if (maybeSubscriptionExpiresAt === undefined) {
          profileUpdates.subscription_expires_at = null;
        }
        if (maybeSubscriptionPlanId === undefined) {
          profileUpdates.subscription_plan_id = null;
        }
      }

      if (Object.keys(profileUpdates).length === 0) {
        return jsonResponse({ error: "No updates provided" }, 400);
      }

      const { data: existingAuth, error: existingAuthError } = await client.auth.admin.getUserById(userId);
      if (existingAuthError || !existingAuth?.user) {
        return jsonResponse({ error: "User not found" }, 404);
      }

      const existingMetadata = (existingAuth.user.user_metadata || {}) as Record<string, unknown>;
      const nextMetadata = {
        ...existingMetadata,
      } as Record<string, unknown>;

      if (profileUpdates.role !== undefined) {
        nextMetadata.role = profileUpdates.role;
      }
      if (profileUpdates.is_verified !== undefined) {
        nextMetadata.is_verified = profileUpdates.is_verified;
      }
      if (profileUpdates.full_name !== undefined) {
        nextMetadata.full_name = profileUpdates.full_name;
      }

      const authUpdatePayload: Record<string, unknown> = {
        user_metadata: nextMetadata,
      };

      if (profileUpdates.email !== undefined) {
        authUpdatePayload.email = String(profileUpdates.email);
      }

      const { error: authUpdateError } = await client.auth.admin.updateUserById(userId, authUpdatePayload);
      if (authUpdateError) {
        return jsonResponse({ error: authUpdateError.message }, 400);
      }

      const { data: updatedProfile, error: profileUpdateError } = await client
        .from("profiles")
        .update(profileUpdates)
        .eq("id", userId)
        .select(
          "id, full_name, email, role, is_verified, created_at, subscription_status, subscription_expires_at, subscription_plan_id",
        )
        .maybeSingle();

      if (profileUpdateError) {
        return jsonResponse({ error: profileUpdateError.message }, 400);
      }

      if (!updatedProfile) {
        return jsonResponse({ error: "Profile not found" }, 404);
      }

      return jsonResponse({ item: updatedProfile }, 200);
    }

    if (action === "delete_user") {
      const userId = String(body?.userId || "").trim();

      if (!userId) {
        return jsonResponse({ error: "Missing userId" }, 400);
      }

      if (userId === actorId) {
        return jsonResponse({ error: "You cannot delete your own account" }, 400);
      }

      const { data: existingAuth, error: existingAuthError } = await client.auth.admin.getUserById(userId);
      if (existingAuthError || !existingAuth?.user) {
        return jsonResponse({ error: "User not found" }, 404);
      }

      const { error: deleteError } = await client.auth.admin.deleteUser(userId);
      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 400);
      }

      return jsonResponse({ success: true }, 200);
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
