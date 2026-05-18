// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailWithGmail } from "../_shared/gmailEmail.ts";

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

function escapeHtml(raw: unknown) {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRedirect(rawRedirectTo: unknown, envName: string, fallback: string) {
  const redirectTo = String(rawRedirectTo || "").trim();
  return redirectTo || Deno.env.get(envName) || fallback;
}

function getActionLink(data: any) {
  return String(data?.properties?.action_link || data?.action_link || "").trim();
}

function displayNameForUser(user: any, email: string) {
  return String(
    user?.user_metadata?.full_name ||
      user?.user_metadata?.display_name ||
      user?.user_metadata?.name ||
      email.split("@")[0] ||
      "User",
  ).trim();
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
    <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; margin-bottom: 10px;">Account Security</div>
    <h2 style="margin: 0 0 10px 0; font-size: 24px; line-height: 1.3;">${escapeHtml(title)}</h2>
    <p style="margin: 0; opacity: 0.9;">${escapeHtml(subtitle)}</p>
  </div>

  ${bodyHtml}

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

  <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
    This email was sent by MusikaLokal. If you did not request this, you can ignore this email.<br>
    &copy; ${new Date().getFullYear()} MusikaLokal. All rights reserved.
  </p>
</body>
</html>`;
}

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const matchedUser = users.find((user: any) => String(user?.email || "").trim().toLowerCase() === normalizedEmail);
    if (matchedUser) return matchedUser;
    if (users.length < perPage) break;
  }

  return null;
}

async function queueEmail(
  supabaseAdmin: any,
  {
    to,
    recipientName,
    subject,
    html,
    templateType,
    fallbackReason,
  }: {
    to: string;
    recipientName: string;
    subject: string;
    html: string;
    templateType: string;
    fallbackReason?: string | null;
  },
) {
  const { error } = await supabaseAdmin.from("email_notifications").insert({
    recipient_email: to,
    recipient_name: recipientName || "User",
    subject,
    html_content: html,
    template_type: templateType,
    status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) {
    return {
      sent: false,
      queued: false,
      provider: "email_notifications",
      error: fallbackReason ? `${fallbackReason}; ${error.message}` : error.message,
    };
  }

  return {
    sent: false,
    queued: true,
    provider: "email_notifications",
    error: fallbackReason ? `${fallbackReason}; queued in email_notifications` : null,
  };
}

async function deliverEmail(
  supabaseAdmin: any,
  {
    to,
    recipientName,
    subject,
    html,
    templateType,
    source,
  }: {
    to: string;
    recipientName: string;
    subject: string;
    html: string;
    templateType: string;
    source: string;
  },
) {
  const gmailDelivery = await sendEmailWithGmail({
    to,
    subject,
    html,
    recipientName,
    source,
  });

  if (gmailDelivery.sent) {
    return { sent: true, queued: false, provider: gmailDelivery.provider, error: null };
  }

  const fallbackReason = gmailDelivery.error || "Gmail sender is not configured";
  console.error(`${source}_gmail_failed`, {
    provider: gmailDelivery.provider,
    message: fallbackReason,
  });

  return await queueEmail(supabaseAdmin, {
    to,
    recipientName,
    subject,
    html,
    templateType,
    fallbackReason,
  });
}

async function handlePasswordReset(supabaseAdmin: any, body: any) {
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return jsonResponse({ error: "Email is required" }, 400);

  const redirectTo = getRedirect(body?.redirectTo, "PASSWORD_RESET_REDIRECT_TO", "musikalokal://change_password");
  const authUser = await findAuthUserByEmail(supabaseAdmin, email);

  if (!authUser) {
    console.log("password_reset_email_skipped_unknown_account", { email });
    return jsonResponse({
      success: true,
      emailDelivery: { sent: false, queued: false, provider: "account_lookup", skipped: true, error: null },
    });
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) {
    console.error("password_reset_link_failed", { email, message: error.message });
    return jsonResponse({ error: "Unable to prepare password reset link" }, 500);
  }

  const actionLink = getActionLink(data);
  if (!actionLink) {
    return jsonResponse({ error: "Generated password reset link was empty" }, 500);
  }

  const recipientName = displayNameForUser(authUser, email);
  const safeName = escapeHtml(recipientName || "there");
  const safeLink = escapeHtml(actionLink);
  const subject = "Reset your password - MusikaLokal";
  const html = buildMusikaLokalEmail({
    title: "Reset Your Password",
    subtitle: "Use this secure link to choose a new password",
    bodyHtml: `
  <p style="margin: 0 0 12px;">Hi ${safeName},</p>
  <p style="margin: 0 0 12px;">We received a request to reset your MusikaLokal password.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${safeLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700;">Reset Password</a>
  </div>
  <p style="margin: 0 0 12px;">If the button does not work, open this link:</p>
  <p style="word-break: break-all; margin: 0 0 12px;"><a href="${safeLink}">${safeLink}</a></p>
  <p style="margin: 0;">This link is single-use. If you did not request a reset, no action is needed.</p>`,
  });

  const emailDelivery = await deliverEmail(supabaseAdmin, {
    to: email,
    recipientName,
    subject,
    html,
    templateType: "password_reset",
    source: "account-email-password-reset",
  });

  const accepted = emailDelivery.sent || emailDelivery.queued;
  return jsonResponse({ success: accepted, emailDelivery }, accepted ? 200 : 500);
}

async function getAuthenticatedUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { user: null, error: "Missing authorization header" };

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null, error: error?.message || "Invalid session" };
  }

  return { user: data.user, error: null };
}

async function generateEmailChangeLink(
  supabaseAdmin: any,
  type: "email_change_current" | "email_change_new",
  currentEmail: string,
  newEmail: string,
  redirectTo: string,
) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type,
    email: currentEmail,
    newEmail,
    options: { redirectTo },
  });

  if (error) return { link: null, error: error.message };
  const link = getActionLink(data);
  return { link: link || null, error: link ? null : "Generated email change link was empty" };
}

async function sendEmailChangeNotice(
  supabaseAdmin: any,
  {
    to,
    recipientName,
    link,
    title,
    subtitle,
    intro,
    buttonText,
    templateType,
    source,
  }: {
    to: string;
    recipientName: string;
    link: string;
    title: string;
    subtitle: string;
    intro: string;
    buttonText: string;
    templateType: string;
    source: string;
  },
) {
  const safeName = escapeHtml(recipientName || "there");
  const safeLink = escapeHtml(link);
  const subject = `${title} - MusikaLokal`;
  const html = buildMusikaLokalEmail({
    title,
    subtitle,
    bodyHtml: `
  <p style="margin: 0 0 12px;">Hi ${safeName},</p>
  <p style="margin: 0 0 12px;">${escapeHtml(intro)}</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${safeLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700;">${escapeHtml(buttonText)}</a>
  </div>
  <p style="margin: 0 0 12px;">If the button does not work, open this link:</p>
  <p style="word-break: break-all; margin: 0;"><a href="${safeLink}">${safeLink}</a></p>`,
  });

  return await deliverEmail(supabaseAdmin, {
    to,
    recipientName,
    subject,
    html,
    templateType,
    source,
  });
}

async function handleEmailChange(req: Request, supabaseAdmin: any, body: any, supabaseUrl: string, anonKey: string) {
  const { user, error: authError } = await getAuthenticatedUser(req, supabaseUrl, anonKey);
  if (authError || !user) return jsonResponse({ error: authError || "Invalid session" }, 401);

  const newEmail = String(body?.newEmail || body?.email || "").trim().toLowerCase();
  if (!newEmail) return jsonResponse({ error: "New email is required" }, 400);

  const currentEmail = String(user.email || "").trim().toLowerCase();
  if (!currentEmail) return jsonResponse({ error: "Current account email was not found" }, 400);
  if (newEmail === currentEmail) return jsonResponse({ error: "New email must be different from your current email" }, 400);

  const redirectTo = getRedirect(body?.redirectTo, "EMAIL_CHANGE_REDIRECT_TO", "musikalokal://account_details");
  const recipientName = displayNameForUser(user, currentEmail);

  const currentLink = await generateEmailChangeLink(
    supabaseAdmin,
    "email_change_current",
    currentEmail,
    newEmail,
    redirectTo,
  );
  const newLink = await generateEmailChangeLink(
    supabaseAdmin,
    "email_change_new",
    currentEmail,
    newEmail,
    redirectTo,
  );

  let currentEmailDelivery = {
    sent: false,
    queued: false,
    provider: "supabase_auth",
    error: currentLink.error,
  };
  let newEmailDelivery = {
    sent: false,
    queued: false,
    provider: "supabase_auth",
    error: newLink.error,
  };

  if (currentLink.link) {
    currentEmailDelivery = await sendEmailChangeNotice(supabaseAdmin, {
      to: currentEmail,
      recipientName,
      link: currentLink.link,
      title: "Confirm Email Change",
      subtitle: "Approve this change from your current email address",
      intro: `You requested to change your MusikaLokal email address to ${newEmail}. Confirm this change from your current email address.`,
      buttonText: "Approve Email Change",
      templateType: "email_change_current",
      source: "account-email-change-current",
    });
  } else {
    console.error("email_change_current_link_failed", { message: currentLink.error });
  }

  if (newLink.link) {
    newEmailDelivery = await sendEmailChangeNotice(supabaseAdmin, {
      to: newEmail,
      recipientName,
      link: newLink.link,
      title: "Confirm New Email",
      subtitle: "Verify this new address for MusikaLokal",
      intro: `You requested to use this email address for your MusikaLokal account. Confirm this new address to continue.`,
      buttonText: "Confirm New Email",
      templateType: "email_change_new",
      source: "account-email-change-new",
    });
  } else {
    console.error("email_change_new_link_failed", { message: newLink.error });
  }

  const accepted =
    currentEmailDelivery.sent ||
    currentEmailDelivery.queued ||
    newEmailDelivery.sent ||
    newEmailDelivery.queued;

  return jsonResponse(
    {
      success: accepted,
      currentEmailDelivery,
      newEmailDelivery,
    },
    accepted ? 200 : 500,
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action === "send_password_reset") {
      return await handlePasswordReset(supabaseAdmin, body);
    }

    if (action === "send_email_change") {
      return await handleEmailChange(req, supabaseAdmin, body, supabaseUrl, anonKey);
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("account_email_error", { message });
    return jsonResponse({ error: message }, 500);
  }
});
