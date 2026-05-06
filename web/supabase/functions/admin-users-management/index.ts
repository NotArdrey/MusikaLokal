// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailWithGmail } from "../_shared/gmailEmail.ts";

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
  "fan",
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

function normalizeTextField(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value.length > 0 ? value : null;
}

function normalizeStringList(raw: unknown): string[] {
  const source = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;\n]/);
  const seen = new Set<string>();
  const items: string[] = [];

  for (const item of source) {
    const value = String(item ?? "").trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    items.push(value);
  }

  return items;
}

async function attachProfileLists(client: any, profiles: any[]) {
  const items = Array.isArray(profiles) ? profiles : [];
  const profileIds = items
    .map((profile) => String(profile?.id || "").trim())
    .filter((id) => id.length > 0);

  if (profileIds.length === 0) return items;

  const [{ data: skillRows, error: skillsError }, { data: genreRows, error: genresError }] = await Promise.all([
    client.from("profile_skills").select("profile_id, skill").in("profile_id", profileIds),
    client.from("profile_genres").select("profile_id, genre").in("profile_id", profileIds),
  ]);

  if (skillsError) throw skillsError;
  if (genresError) throw genresError;

  const skillsByProfile = new Map<string, string[]>();
  const genresByProfile = new Map<string, string[]>();

  for (const row of skillRows || []) {
    const profileId = String(row?.profile_id || "");
    if (!skillsByProfile.has(profileId)) skillsByProfile.set(profileId, []);
    const skill = String(row?.skill || "").trim();
    if (skill) skillsByProfile.get(profileId)?.push(skill);
  }

  for (const row of genreRows || []) {
    const profileId = String(row?.profile_id || "");
    if (!genresByProfile.has(profileId)) genresByProfile.set(profileId, []);
    const genre = String(row?.genre || "").trim();
    if (genre) genresByProfile.get(profileId)?.push(genre);
  }

  return items.map((profile) => ({
    ...profile,
    skills: skillsByProfile.get(String(profile?.id || "")) || [],
    genres: genresByProfile.get(String(profile?.id || "")) || [],
  }));
}

async function replaceProfileList(
  client: any,
  table: string,
  valueColumn: string,
  userId: string,
  values: string[],
) {
  const { error: deleteError } = await client.from(table).delete().eq("profile_id", userId);
  if (deleteError) throw deleteError;

  if (values.length === 0) return;

  const payload = values.map((value) => ({
    profile_id: userId,
    [valueColumn]: value,
  }));

  const { error: insertError } = await client.from(table).insert(payload);
  if (insertError) throw insertError;
}

function maskEmailForLog(email: string) {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return "missing";
  return `${name.slice(0, 1)}***@${domain}`;
}

function escapeHtml(raw: unknown) {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function getManualApprovalConfirmationRedirect() {
  return Deno.env.get("EMAIL_CONFIRM_REDIRECT_TO") || "musikalokal://?verified=true";
}

async function generateManualApprovalConfirmationLink(client: any, userEmail: string) {
  if (!userEmail) return { link: null as string | null, error: "Missing recipient email" };

  const redirectTo = getManualApprovalConfirmationRedirect();
  const { data, error } = await client.auth.admin.generateLink({
    type: "magiclink",
    email: userEmail,
    options: {
      redirectTo,
      data: {
        is_verified: true,
        verification_status: "APPROVED",
      },
    },
  });

  if (error) {
    console.error("manual_identity_review_confirmation_link_failed", {
      recipient: maskEmailForLog(userEmail),
      message: error.message,
    });
    return { link: null, error: error.message };
  }

  const link = String(data?.properties?.action_link || "").trim();
  if (!link) {
    return { link: null, error: "Generated confirmation link was empty" };
  }

  return { link, error: null };
}

async function sendDecisionEmail(
  client: any,
  userEmail: string,
  decision: "APPROVED" | "DECLINED",
  reviewNotes: string | null,
  confirmationLink: string | null = null,
  confirmationLinkError: string | null = null,
) {
  if (!userEmail) return { sent: false, queued: false, provider: "none", error: "Missing recipient email" };

  let fallbackReason = "";
  const normalizedDecision = decision === "APPROVED" ? "approved" : "declined";
  const hasConfirmationStep = decision === "APPROVED" && Boolean(confirmationLink || confirmationLinkError);
  const subject = decision === "APPROVED"
    ? hasConfirmationStep
      ? "Identity Verified - Confirm Your Email - MusikaLokal"
      : "Identity Verified - MusikaLokal"
    : "Identity Verification Update - MusikaLokal";

  const notesHtml = reviewNotes
    ? `<div style="background: #f8fafc; padding: 16px 18px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;"><p style="margin: 0; color: #334155;"><strong>Admin notes:</strong> ${escapeHtml(reviewNotes)}</p></div>`
    : "";
  const confirmHtml = confirmationLink
    ? `<div style="text-align: center; margin: 30px 0;"><a href="${escapeHtml(confirmationLink)}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700;">Confirm Email and Continue</a></div>`
    : hasConfirmationStep
      ? `<p style="margin: 0 0 12px;">If you do not see a confirmation link, open MusikaLokal and use the resend confirmation option on the signup/login screen.</p>`
      : `<p style="margin: 0 0 12px;">Your email is already confirmed, so you can open MusikaLokal and sign in.</p>`;
  const confirmErrorHtml = confirmationLinkError
    ? `<p style="margin: 0 0 12px; color: #6B7280; font-size: 13px;">Confirmation link status: ${escapeHtml(confirmationLinkError)}</p>`
    : "";

  const html = buildMusikaLokalEmail({
    title: decision === "APPROVED" ? "Identity Verification Approved!" : "Identity Verification Updated",
    subtitle: decision === "APPROVED"
      ? hasConfirmationStep
        ? "Your account is now ready for the final email confirmation step"
        : "Your account is ready to use"
      : "You can submit a new valid government ID to retry verification",
    bodyHtml: decision === "APPROVED"
      ? `
  <p style="margin: 0 0 12px;">Good news: your manual identity review has been <strong>${normalizedDecision}</strong>, and your MusikaLokal identity is now verified.</p>
  <p style="margin: 0 0 12px;">${hasConfirmationStep ? "One step remains before you can sign in: please confirm your email address." : "You can now sign in and use your verified account."}</p>
  ${confirmHtml}
  ${confirmErrorHtml}
  <ul style="background: #f8fafc; padding: 20px 20px 20px 40px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 24px 0;">
    <li>Book musicians and studios</li>
    <li>List your services and earn</li>
    <li>Manage gigs and bookings</li>
    <li>Connect with the music community</li>
  </ul>
  ${notesHtml}
  <p style="margin: 16px 0 0;">Thank you,<br>MusikaLokal Team</p>`
      : `
  <p style="margin: 0 0 12px;">We reviewed your manual identity submission, but we could not approve it yet.</p>
  <ul style="background: #f8fafc; padding: 20px 20px 20px 40px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 24px 0;">
    <li>Use a clear photo of a valid government ID</li>
    <li>Make sure the name and document details are readable</li>
    <li>Submit a new document from the MusikaLokal app</li>
  </ul>
  ${notesHtml}
  <p style="margin: 16px 0 0;">Thank you,<br>MusikaLokal Team</p>`,
  });

  const gmailDelivery = await sendEmailWithGmail({
    to: userEmail,
    subject,
    html,
    recipientName: "User",
    source: "admin-users-management",
  });
  if (gmailDelivery.sent) {
    console.log("manual_identity_review_decision_email_sent", {
      decision,
      provider: gmailDelivery.provider,
      recipient: maskEmailForLog(userEmail),
    });
    return { sent: true, queued: false, provider: gmailDelivery.provider };
  }

  fallbackReason = gmailDelivery.error || "Gmail sender is not configured";
  console.error("manual_identity_review_decision_email_gmail_failed", {
    provider: gmailDelivery.provider,
    message: fallbackReason,
  });

  const { error } = await client.from("email_notifications").insert({
    recipient_email: userEmail,
    recipient_name: "User",
    subject,
    html_content: html,
    template_type: "manual_identity_review_decision",
    status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("manual_identity_review_decision_email_queue_failed", { message: error.message });
    return {
      sent: false,
      queued: false,
      provider: "email_notifications",
      error: fallbackReason ? `${fallbackReason}; ${error.message}` : error.message,
    };
  }

  console.log("manual_identity_review_decision_email_queued", {
    decision,
    provider: "email_notifications",
    recipient: maskEmailForLog(userEmail),
    reason: fallbackReason || "gmail sender unavailable",
  });

  return {
    sent: false,
    queued: true,
    provider: "email_notifications",
    error: fallbackReason ? `${fallbackReason}; queued in email_notifications` : null,
  };
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
          "id, full_name, email, role, is_verified, verification_status, created_at, contact_number, address, location, bio",
        )
        .or("verification_status.is.null,verification_status.neq.DECLINED")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const items = await attachProfileLists(client, data || []);

      return jsonResponse({ items });
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
          .select("id, full_name, email, verification_status, id_document_expiry")
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

      const { data: authUserData, error: authUserError } = await client.auth.admin.getUserById(String(review.user_id));
      if (authUserError || !authUserData?.user) {
        return jsonResponse({ error: "User not found for review" }, 404);
      }

      const emailAlreadyConfirmed = Boolean(authUserData.user.email_confirmed_at);
      const isVerified = decision === "APPROVED" && emailAlreadyConfirmed;

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

      const existingMetadata = (authUserData.user.user_metadata || {}) as Record<string, unknown>;
      const authUpdatePayload: Record<string, unknown> = {
        user_metadata: {
          ...existingMetadata,
          is_verified: decision === "APPROVED",
          verification_status: profileVerificationStatus,
        },
      };

      const { error: authUpdateError } = await client.auth.admin.updateUserById(String(review.user_id), authUpdatePayload);

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
      let confirmationLinkResult = { link: null as string | null, error: null as string | null };
      let decisionEmail;

      if (decision === "APPROVED") {
        if (!emailAlreadyConfirmed) {
          confirmationLinkResult = await generateManualApprovalConfirmationLink(client, targetEmail);
        }

        decisionEmail = await sendDecisionEmail(
          client,
          targetEmail,
          decision as "APPROVED",
          reviewNotes,
          confirmationLinkResult.link,
          confirmationLinkResult.error,
        );
      } else {
        decisionEmail = await sendDecisionEmail(
          client,
          targetEmail,
          decision as "APPROVED" | "DECLINED",
          reviewNotes,
          confirmationLinkResult.link,
          confirmationLinkResult.error,
        );
      }
      console.log("manual_identity_review_decision_email_result", {
        reviewId,
        decision,
        recipient: maskEmailForLog(targetEmail),
        sent: decisionEmail.sent,
        queued: decisionEmail.queued,
        provider: decisionEmail.provider,
        confirmationLinkGenerated: Boolean(confirmationLinkResult.link),
        emailAlreadyConfirmed,
        error: decisionEmail.error || null,
      });

      if (decisionEmail.sent) {
        await client
          .from("manual_identity_reviews")
          .update({ decision_email_sent_at: nowIso, updated_at: nowIso })
          .eq("id", reviewId);
      }

      return jsonResponse({
        item: {
          ...(updatedReview || review),
          decision_email_sent: decisionEmail.sent,
          decision_email_queued: decisionEmail.queued,
          decision_email_provider: decisionEmail.provider,
          decision_email_error: decisionEmail.error || null,
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

      const [item] = await attachProfileLists(client, profile ? [profile] : []);

      return jsonResponse({
        item: item || null,
      });
    }

    if (action === "create_user") {
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const fullName = String(body?.fullName || "").trim();
      const role = parseRole(body?.role);
      const emailConfirmed = parseBoolean(body?.emailConfirmed) ?? false;
      const isVerified = parseBoolean(body?.isVerified) ?? false;
      const verificationStatus = isVerified ? "APPROVED" : "PENDING";
      const verifiedAt = isVerified ? new Date().toISOString() : null;
      const contactNumber = normalizeTextField(body?.contactNumber);
      const address = normalizeTextField(body?.address);
      const bio = normalizeTextField(body?.bio);
      const skills = normalizeStringList(body?.skills);
      const genres = normalizeStringList(body?.genres);

      if (!email || !password || !role) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      if (!fullName) {
        return jsonResponse({ error: "Full name is required" }, 400);
      }

      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
      }

      const { data: createdUser, error: createUserError } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: emailConfirmed,
        user_metadata: {
          role,
          is_verified: isVerified,
          verification_status: verificationStatus,
          full_name: fullName,
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
        full_name: fullName,
        role,
        contact_number: contactNumber,
        address,
        location: address,
        bio,
        is_verified: isVerified,
        verification_status: verificationStatus,
        id_verified_at: verifiedAt,
      };

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" })
        .select("id, full_name, email, role, is_verified, verification_status, created_at, contact_number, address, location, bio")
        .maybeSingle();

      if (profileError) {
        await client.auth.admin.deleteUser(userId);
        return jsonResponse({ error: profileError.message }, 400);
      }

      try {
        await Promise.all([
          replaceProfileList(client, "profile_skills", "skill", userId, skills),
          replaceProfileList(client, "profile_genres", "genre", userId, genres),
        ]);
      } catch (listError) {
        await client.from("profiles").delete().eq("id", userId);
        await client.auth.admin.deleteUser(userId);
        const message = listError instanceof Error ? listError.message : "Unable to save profile lists";
        return jsonResponse({ error: message }, 400);
      }

      const [item] = await attachProfileLists(client, [profile || profilePayload]);

      return jsonResponse({ item: item || profile || profilePayload }, 200);
    }

    if (action === "update_user") {
      const userId = String(body?.userId || "").trim();
      const maybeRole = body?.role;
      const maybeFullName = body?.fullName;
      const maybeEmail = body?.email;
      const maybeIsVerified = body?.isVerified;
      const maybeContactNumber = body?.contactNumber;
      const maybeAddress = body?.address;
      const maybeBio = body?.bio;
      const maybeSkills = body?.skills;
      const maybeGenres = body?.genres;

      if (!userId) {
        return jsonResponse({ error: "Missing userId" }, 400);
      }

      let existingProfileForUpdate: Record<string, unknown> | null = null;
      if (maybeIsVerified !== undefined) {
        const { data: existingProfile, error: existingProfileError } = await client
          .from("profiles")
          .select("verification_status")
          .eq("id", userId)
          .maybeSingle();

        if (existingProfileError) {
          return jsonResponse({ error: existingProfileError.message }, 400);
        }

        existingProfileForUpdate = existingProfile || null;
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
        const nextFullName = String(maybeFullName || "").trim();
        if (!nextFullName) {
          return jsonResponse({ error: "Full name is required" }, 400);
        }
        profileUpdates.full_name = nextFullName;
      }

      if (maybeEmail !== undefined) {
        const email = String(maybeEmail || "").trim().toLowerCase();
        if (!email) {
          return jsonResponse({ error: "Email cannot be empty" }, 400);
        }
        profileUpdates.email = email;
      }

      if (maybeContactNumber !== undefined) {
        profileUpdates.contact_number = normalizeTextField(maybeContactNumber);
      }

      if (maybeAddress !== undefined) {
        const nextAddress = normalizeTextField(maybeAddress);
        profileUpdates.address = nextAddress;
        profileUpdates.location = nextAddress;
      }

      if (maybeBio !== undefined) {
        profileUpdates.bio = normalizeTextField(maybeBio);
      }

      if (maybeIsVerified !== undefined) {
        const parsed = parseBoolean(maybeIsVerified);
        if (parsed === null) {
          return jsonResponse({ error: "Invalid isVerified value" }, 400);
        }
        profileUpdates.is_verified = parsed;
        if (parsed) {
          profileUpdates.verification_status = "APPROVED";
          profileUpdates.id_verified_at = new Date().toISOString();
        } else {
          const existingStatus = String(existingProfileForUpdate?.["verification_status"] || "").trim().toUpperCase();
          profileUpdates.verification_status = ["PENDING_REVIEW", "DECLINED", "ABANDONED"].includes(existingStatus)
            ? existingStatus
            : "PENDING";
          profileUpdates.id_verified_at = null;
        }
      }

      const hasListUpdates = maybeSkills !== undefined || maybeGenres !== undefined;

      if (Object.keys(profileUpdates).length === 0 && !hasListUpdates) {
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
      if (profileUpdates.verification_status !== undefined) {
        nextMetadata.verification_status = profileUpdates.verification_status;
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

      let updatedProfile: any = null;

      if (Object.keys(profileUpdates).length > 0) {
        const { data, error: profileUpdateError } = await client
          .from("profiles")
          .update(profileUpdates)
          .eq("id", userId)
          .select(
            "id, full_name, email, role, is_verified, verification_status, created_at, contact_number, address, location, bio",
          )
          .maybeSingle();

        if (profileUpdateError) {
          return jsonResponse({ error: profileUpdateError.message }, 400);
        }

        updatedProfile = data;
      } else {
        const { data, error: profileFetchError } = await client
          .from("profiles")
          .select("id, full_name, email, role, is_verified, verification_status, created_at, contact_number, address, location, bio")
          .eq("id", userId)
          .maybeSingle();

        if (profileFetchError) {
          return jsonResponse({ error: profileFetchError.message }, 400);
        }

        updatedProfile = data;
      }

      if (!updatedProfile) {
        return jsonResponse({ error: "Profile not found" }, 404);
      }

      try {
        await Promise.all([
          maybeSkills !== undefined
            ? replaceProfileList(client, "profile_skills", "skill", userId, normalizeStringList(maybeSkills))
            : Promise.resolve(),
          maybeGenres !== undefined
            ? replaceProfileList(client, "profile_genres", "genre", userId, normalizeStringList(maybeGenres))
            : Promise.resolve(),
        ]);
      } catch (listError) {
        const message = listError instanceof Error ? listError.message : "Unable to save profile lists";
        return jsonResponse({ error: message }, 400);
      }

      const [item] = await attachProfileLists(client, [updatedProfile]);

      return jsonResponse({ item: item || updatedProfile }, 200);
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
      const { data: existingProfile, error: existingProfileError } = await client
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (existingProfileError) {
        return jsonResponse({ error: existingProfileError.message }, 400);
      }

      if ((existingAuthError || !existingAuth?.user) && !existingProfile) {
        return jsonResponse({ error: "User not found" }, 404);
      }

      if (existingProfile) {
        const { error: profileDeleteError } = await client
          .from("profiles")
          .delete()
          .eq("id", userId);

        if (profileDeleteError) {
          return jsonResponse({ error: profileDeleteError.message }, 400);
        }
      }

      if (existingAuth?.user) {
        const { error: deleteError } = await client.auth.admin.deleteUser(userId);
        if (deleteError) {
          return jsonResponse({ error: deleteError.message }, 400);
        }
      }

      return jsonResponse({ success: true }, 200);
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
