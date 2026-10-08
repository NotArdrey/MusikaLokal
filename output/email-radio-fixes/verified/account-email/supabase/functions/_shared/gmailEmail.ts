type GmailEmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  recipientName?: string;
  source?: string;
};

type GmailEmailResult = {
  sent: boolean;
  provider: "gmail_http" | "gmail_smtp" | "none";
  error?: string | null;
};

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  connectTls: (options: { hostname: string; port: number }) => Promise<{
    read: (p: Uint8Array) => Promise<number | null>;
    write: (p: Uint8Array) => Promise<number>;
    close: () => void;
  }>;
};

function stripHtml(html: string) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRecipients(to: string | string[]) {
  return (Array.isArray(to) ? to : [to])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function getGmailFrom() {
  const explicitFrom = Deno.env.get("GMAIL_FROM") || Deno.env.get("SMTP_FROM") || "";
  if (explicitFrom.trim()) return explicitFrom.trim();

  const user = Deno.env.get("GMAIL_SMTP_USER") || Deno.env.get("SMTP_USER") || "";
  const name = Deno.env.get("GMAIL_FROM_NAME") || "MusikaLokal";
  return user ? `${name} <${user}>` : "";
}

async function sendViaHttpMailer(payload: GmailEmailPayload, from: string): Promise<GmailEmailResult> {
  const mailerUrl = Deno.env.get("GMAIL_MAILER_URL") || "";
  if (!mailerUrl.trim()) {
    return { sent: false, provider: "none", error: "GMAIL_MAILER_URL is not configured" };
  }

  const secret = Deno.env.get("GMAIL_MAILER_SECRET") || "";
  const recipients = normalizeRecipients(payload.to);

  try {
    const response = await fetch(mailerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret
          ? {
              Authorization: `Bearer ${secret}`,
              "x-mailer-secret": secret,
            }
          : {}),
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: payload.subject,
        html: payload.html,
        text: payload.text || stripHtml(payload.html),
        recipientName: payload.recipientName || null,
        source: payload.source || "supabase_edge",
      }),
    });

    if (response.ok) {
      return { sent: true, provider: "gmail_http", error: null };
    }

    const errorText = await response.text().catch(() => "");
    return {
      sent: false,
      provider: "gmail_http",
      error: `Gmail mailer ${response.status}: ${errorText.slice(0, 500)}`,
    };
  } catch (error) {
    return {
      sent: false,
      provider: "gmail_http",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendViaGmailSmtp(payload: GmailEmailPayload, from: string): Promise<GmailEmailResult> {
  const username = Deno.env.get("GMAIL_SMTP_USER") || Deno.env.get("SMTP_USER") || "";
  const password =
    Deno.env.get("GMAIL_SMTP_APP_PASSWORD") ||
    Deno.env.get("GMAIL_SMTP_PASSWORD") ||
    Deno.env.get("SMTP_PASSWORD") ||
    "";

  if (!username || !password) {
    return { sent: false, provider: "none", error: "GMAIL_SMTP_USER or GMAIL_SMTP_APP_PASSWORD is not configured" };
  }

  const hostname = Deno.env.get("GMAIL_SMTP_HOST") || "smtp.gmail.com";
  const port = Number(Deno.env.get("GMAIL_SMTP_PORT") || 465);
  const recipients = normalizeRecipients(payload.to);
  const fromEmail = extractEmailAddress(from) || username;

  let conn: Awaited<ReturnType<typeof Deno.connectTls>> | null = null;
  try {
    conn = await Deno.connectTls({ hostname, port });
    const reader = createSmtpReader(conn);

    await expectSmtp(reader, 220);
    await smtpCommand(conn, reader, `EHLO musikalokal.local`, 250);
    await smtpCommand(conn, reader, "AUTH LOGIN", 334);
    await smtpCommand(conn, reader, encodeBase64(username), 334);
    await smtpCommand(conn, reader, encodeBase64(password), 235);
    await smtpCommand(conn, reader, `MAIL FROM:<${fromEmail}>`, 250);

    for (const recipient of recipients) {
      await smtpCommand(conn, reader, `RCPT TO:<${recipient}>`, 250);
      await smtpCommand(conn, reader, "DATA", 354);
      await writeSmtp(conn, buildMimeMessage({
        from,
        to: recipient,
        subject: payload.subject,
        html: payload.html,
        text: payload.text || stripHtml(payload.html),
      }) + "\r\n.\r\n");
      await expectSmtp(reader, 250);
    }

    await smtpCommand(conn, reader, "QUIT", 221);
    return { sent: true, provider: "gmail_smtp", error: null };
  } catch (error) {
    return {
      sent: false,
      provider: "gmail_smtp",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      conn?.close();
    } catch {
      // Ignore close failures.
    }
  }
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeHeader(value: string) {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${encodeBase64(value)}?=`;
}

function extractEmailAddress(value: string) {
  const angleMatch = String(value || "").match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim();
  const directMatch = String(value || "").match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);
  return directMatch?.[0]?.trim() || "";
}

function dotStuff(value: string) {
  return String(value || "").replace(/\r?\n\./g, "\r\n..");
}

function buildMimeMessage({
  from,
  to,
  subject,
  html,
  text,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(html || text),
  ].join("\r\n");
}

function createSmtpReader(conn: Awaited<ReturnType<typeof Deno.connectTls>>) {
  let buffer = "";
  return async () => {
    const decoder = new TextDecoder();
    const chunk = new Uint8Array(4096);

    while (true) {
      const complete = buffer.match(/(?:^|\r?\n)(\d{3}) [^\r\n]*(?:\r?\n|$)/);
      if (complete) {
        const end = complete.index! + complete[0].length;
        const response = buffer.slice(0, end).trimEnd();
        buffer = buffer.slice(end);
        return response;
      }

      const read = await conn.read(chunk);
      if (read === null) {
        const response = buffer.trimEnd();
        buffer = "";
        return response;
      }
      buffer += decoder.decode(chunk.subarray(0, read), { stream: true });
    }
  };
}

async function writeSmtp(conn: Awaited<ReturnType<typeof Deno.connectTls>>, value: string) {
  await conn.write(new TextEncoder().encode(value));
}

async function expectSmtp(reader: () => Promise<string>, expectedCode: number) {
  const response = await reader();
  const code = Number(response.slice(0, 3));
  if (code !== expectedCode) {
    throw new Error(`SMTP expected ${expectedCode}, got ${response}`);
  }
  return response;
}

async function smtpCommand(
  conn: Awaited<ReturnType<typeof Deno.connectTls>>,
  reader: () => Promise<string>,
  command: string,
  expectedCode: number,
) {
  await writeSmtp(conn, `${command}\r\n`);
  return await expectSmtp(reader, expectedCode);
}

export async function sendEmailWithGmail(payload: GmailEmailPayload): Promise<GmailEmailResult> {
  const recipients = normalizeRecipients(payload.to);
  if (recipients.length === 0) {
    return { sent: false, provider: "none", error: "Missing recipient email" };
  }

  const from = getGmailFrom();
  if (!from) {
    return { sent: false, provider: "none", error: "GMAIL_FROM or GMAIL_SMTP_USER is not configured" };
  }

  if ((Deno.env.get("GMAIL_MAILER_URL") || "").trim()) {
    const httpResult = await sendViaHttpMailer(payload, from);
    if (httpResult.sent) return httpResult;
    console.error("gmail_http_email_failed", { message: httpResult.error });
  }

  return await sendViaGmailSmtp(payload, from);
}
