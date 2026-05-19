import { sendEmailWithGmail } from "./gmailEmail.ts";

type CoreActionNotificationPayload = {
  user_id?: string | null;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  image?: string | null;
  meta?: Record<string, unknown> | null;
};

type CoreActionEmailOptions = {
  source?: string;
  templateType?: string;
};

type CoreActionEmailResult = {
  sent: boolean;
  queued: boolean;
  skipped?: boolean;
  provider: "gmail_http" | "gmail_smtp" | "email_notifications" | "none";
  error?: string | null;
};

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

declare const EdgeRuntime:
  | {
      waitUntil?: (promise: Promise<unknown>) => void;
    }
  | undefined;

function isDisabledFlag(value: string | undefined) {
  return ["0", "false", "off", "no", "disabled"].includes(String(value || "").trim().toLowerCase());
}

function isCoreActionEmailEnabled(payload: CoreActionNotificationPayload) {
  if (isDisabledFlag(Deno.env.get("CORE_ACTION_EMAILS_ENABLED"))) return false;

  const meta = payload.meta || {};
  return meta.email !== false && meta.send_email !== false && meta.email_notification !== false;
}

function escapeHtml(raw: unknown) {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTemplateType(value: unknown) {
  const normalized = String(value || "core_action_notification")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (normalized || "core_action_notification").slice(0, 80);
}

function buildCoreActionEmailHtml(payload: CoreActionNotificationPayload, recipientName: string) {
  const title = String(payload.title || "MusikaLokal Notification").trim();
  const message = String(payload.message || "There is an important update in your MusikaLokal account.").trim();
  const safeName = escapeHtml(recipientName || "there");
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const appUrl = Deno.env.get("CORE_ACTION_EMAIL_APP_URL") || "musikalokal://notifications";
  const safeAppUrl = escapeHtml(appUrl);

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle} - MusikaLokal</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
    <div style="background:#111827;color:#ffffff;padding:22px 24px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;font-size:24px;line-height:1.3;">MusikaLokal</h1>
    </div>
    <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;">
      <p style="margin:0 0 14px;">Hi ${safeName},</p>
      <h2 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#111827;">${safeTitle}</h2>
      <p style="margin:0 0 20px;line-height:1.6;color:#374151;">${safeMessage}</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${safeAppUrl}" style="display:inline-block;background:#5546ff;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">Open MusikaLokal</a>
      </div>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">This email was sent because there was an important update on your MusikaLokal account.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

async function resolveRecipientProfile(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const email = String(data?.email || "").trim();
  if (!email) return null;

  return {
    email,
    name: String(data?.full_name || "").trim() || "User",
  };
}

async function queueCoreActionEmail(
  supabaseAdmin: any,
  payload: CoreActionNotificationPayload,
  recipient: { email: string; name: string },
  html: string,
  fallbackReason: string,
  options: CoreActionEmailOptions,
): Promise<CoreActionEmailResult> {
  const templateType = normalizeTemplateType(
    options.templateType || payload.meta?.event_type || payload.meta?.type || payload.type || "core_action_notification",
  );

  const { error } = await supabaseAdmin.from("email_notifications").insert({
    recipient_email: recipient.email,
    recipient_name: recipient.name,
    subject: `${payload.title || "MusikaLokal Notification"} - MusikaLokal`,
    html_content: html,
    template_type: templateType,
    status: "pending",
    error_message: fallbackReason,
    created_at: new Date().toISOString(),
  });

  if (error) {
    return {
      sent: false,
      queued: false,
      provider: "email_notifications",
      error: `${fallbackReason}; ${error.message}`,
    };
  }

  return {
    sent: false,
    queued: true,
    provider: "email_notifications",
    error: `${fallbackReason}; queued in email_notifications`,
  };
}

export async function sendCoreActionEmailForNotification(
  supabaseAdmin: any,
  payload: CoreActionNotificationPayload,
  options: CoreActionEmailOptions = {},
): Promise<CoreActionEmailResult> {
  if (!isCoreActionEmailEnabled(payload)) {
    return { sent: false, queued: false, skipped: true, provider: "none", error: null };
  }

  const userId = String(payload.user_id || "").trim();
  if (!userId) {
    return { sent: false, queued: false, skipped: true, provider: "none", error: "Missing user_id" };
  }

  const recipient = await resolveRecipientProfile(supabaseAdmin, userId);
  if (!recipient) {
    return { sent: false, queued: false, skipped: true, provider: "none", error: "Recipient email was not found" };
  }

  const title = String(payload.title || "MusikaLokal Notification").trim();
  const html = buildCoreActionEmailHtml(payload, recipient.name);

  const gmailDelivery = await sendEmailWithGmail({
    to: recipient.email,
    subject: `${title} - MusikaLokal`,
    html,
    recipientName: recipient.name,
    source: options.source || "core-action-notification",
  });

  if (gmailDelivery.sent) {
    return { sent: true, queued: false, provider: gmailDelivery.provider, error: null };
  }

  const fallbackReason = gmailDelivery.error || "Gmail sender is not configured";
  console.error("core_action_email_gmail_failed", {
    provider: gmailDelivery.provider,
    message: fallbackReason,
    templateType: options.templateType || payload.meta?.event_type || payload.meta?.type || payload.type || null,
  });

  return await queueCoreActionEmail(supabaseAdmin, payload, recipient, html, fallbackReason, options);
}

export function scheduleCoreActionEmailForNotification(
  supabaseAdmin: any,
  payload: CoreActionNotificationPayload,
  options: CoreActionEmailOptions = {},
) {
  if (!isCoreActionEmailEnabled(payload)) return;

  const task = sendCoreActionEmailForNotification(supabaseAdmin, payload, options).catch((error) => {
    console.error("core_action_email_failed", {
      message: error instanceof Error ? error.message : String(error),
      userId: payload.user_id || null,
      title: payload.title || null,
    });
  });

  try {
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(task);
      return;
    }
  } catch {
    // Fall through to fire-and-forget for local runtimes without EdgeRuntime.
  }

  void task;
}
