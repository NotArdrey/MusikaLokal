// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno environment
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

// ─── Configuration ────────────────────────────────────────────────────────────

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")?.trim() || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")?.trim() || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")?.trim() || "";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const MAX_FILES_PER_REQUEST = 10;

// ─── Blocked extensions / MIME types ─────────────────────────────────────────
// (rule-based pre-screen before AI)

const BLOCKED_EXTENSIONS = new Set([
  // Executables
  "exe", "bat", "cmd", "com", "vbs", "vbe", "js", "jse", "wsf", "wsh",
  "scr", "pif", "reg", "msi", "msp",
  // Scripts
  "sh", "bash", "zsh", "fish", "ps1", "psm1", "psd1",
  // Web threats
  "php", "php3", "php4", "php5", "phtml", "asp", "aspx", "cgi", "pl", "py",
  "rb", "htaccess", "htpasswd",
  // Archives that may auto-exec
  "jar", "jnlp",
]);

const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-executable",
  "application/x-shellscript",
  "application/x-sh",
  "application/x-bat",
  "application/x-msdos-program",
];

// Known-safe MIME categories for photos and documents
const SAFE_PHOTO_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);

const SAFE_DOCUMENT_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileCandidate {
  id?: string;
  fingerprint?: string;
  fileName?: string;
  mimeType?: string | null;
  fileSize?: number;
  kind?: "photo" | "document";
}

type ScreeningResult = {
  id: string;
  allowed: boolean;
  reason?: string;
};

// ─── Rule-based pre-screen ────────────────────────────────────────────────────

function extractExtension(fileName: string): string {
  const cleaned = (fileName || "").trim().toLowerCase().split("?")[0];
  const dotIndex = cleaned.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return cleaned.slice(dotIndex + 1);
}

function ruleBasedScreen(file: FileCandidate): { allowed: boolean; reason?: string } {
  const ext = extractExtension(file.fileName || "");

  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return {
      allowed: false,
      reason: `Files of type .${ext} are not allowed for upload.`,
    };
  }

  const mime = (file.mimeType || "").toLowerCase();
  for (const prefix of BLOCKED_MIME_PREFIXES) {
    if (mime.startsWith(prefix)) {
      return {
        allowed: false,
        reason: `Files with MIME type "${file.mimeType}" are not allowed for upload.`,
      };
    }
  }

  // Kind-specific MIME validation (only block if a conflicting MIME is explicitly set)
  if (file.kind === "photo" && mime && !mime.startsWith("image/")) {
    return {
      allowed: false,
      reason: "Photos must be valid image files (JPEG, PNG, WebP, etc.).",
    };
  }

  if (file.kind === "document" && mime && !SAFE_DOCUMENT_MIMES.has(mime)) {
    if (!mime.startsWith("image/") && mime !== "application/pdf") {
      return {
        allowed: false,
        reason: `Documents of type "${file.mimeType}" are not accepted. Please upload a PDF or image.`,
      };
    }
  }

  return { allowed: true };
}

// ─── AI screening ─────────────────────────────────────────────────────────────

function buildAiPrompt(context: string, files: FileCandidate[]): string {
  const fileDescriptions = files
    .map((f, i) => {
      const parts = [
        `File ${i + 1}:`,
        `  name: ${f.fileName || "(unknown)"}`,
        `  type: ${f.mimeType || "(unknown)"}`,
        `  size: ${typeof f.fileSize === "number" ? `${f.fileSize} bytes` : "(unknown)"}`,
        `  kind: ${f.kind || "photo"}`,
      ];
      return parts.join("\n");
    })
    .join("\n\n");

  return `You are a content safety reviewer for Musika Lokal, a musician platform in the Philippines. Your job is to review file metadata ONLY (no actual file content is provided) to determine if uploads seem appropriate for a music app.

Upload context: ${context}

Files to review:
${fileDescriptions}

Review guidelines:
- ALLOW music-related profile photos, gig photos, studio photos, event photos, and ID documents
- ALLOW PDF contracts, PDF permits, and document images
- BLOCK files with names suggesting adult content, violence, or illegal material
- BLOCK files whose size is unusually large for the stated type (e.g., a "photo" over 50 MB)
- When in doubt about legitimate music industry use, ALLOW the file

Return ONLY valid JSON. No markdown, no explanation.
Format: {"results": [{"index": 0, "allowed": true}, {"index": 1, "allowed": false, "reason": "..."}]}`;
}

async function callGroq(prompt: string): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callGemini(prompt: string): Promise<string> {
  const url = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAi(prompt: string): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callAi(prompt: string): Promise<string | null> {
  if (GROQ_API_KEY) {
    try {
      return await callGroq(prompt);
    } catch {
      // fall through
    }
  }

  if (GEMINI_API_KEY) {
    try {
      return await callGemini(prompt);
    } catch {
      // fall through
    }
  }

  if (OPENAI_API_KEY) {
    try {
      return await callOpenAi(prompt);
    } catch {
      // fall through
    }
  }

  return null;
}

function parseAiResults(
  raw: string | null,
  files: FileCandidate[],
): Array<{ index: number; allowed: boolean; reason?: string }> | null {
  if (!raw) return null;

  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return null;

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed?.results)) return null;

    return parsed.results.filter(
      (r: unknown) => r && typeof r === "object" && typeof (r as any).index === "number",
    );
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim() || "";

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const context = typeof body.context === "string" ? body.context : "add_edit_upload";
    const rawFiles = Array.isArray(body.files) ? (body.files as FileCandidate[]) : [];

    if (rawFiles.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const files = rawFiles.slice(0, MAX_FILES_PER_REQUEST);

    // Step 1: Rule-based pre-screen
    const ruleResults = files.map((file) => ruleBasedScreen(file));
    const blockedByRules = ruleResults.some((r) => !r.allowed);

    // If any file is blocked by rules, skip AI entirely and return immediately
    if (blockedByRules) {
      const results: ScreeningResult[] = files.map((file, i) => {
        const fileId =
          (typeof file.id === "string" ? file.id : null) ||
          (typeof file.fingerprint === "string" ? file.fingerprint : null) ||
          String(i);

        return {
          id: fileId,
          allowed: ruleResults[i].allowed,
          reason: ruleResults[i].reason,
        };
      });

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Step 2: AI screening for files that passed rule-based check
    const aiPrompt = buildAiPrompt(context, files);
    const aiRaw = await callAi(aiPrompt);
    const aiDecisions = parseAiResults(aiRaw, files);

    const results: ScreeningResult[] = files.map((file, i) => {
      const fileId =
        (typeof file.id === "string" ? file.id : null) ||
        (typeof file.fingerprint === "string" ? file.fingerprint : null) ||
        String(i);

      if (!aiDecisions) {
        // AI unavailable — allow files that passed rule-based check
        return { id: fileId, allowed: true };
      }

      const aiDecision = aiDecisions.find((d) => d.index === i);
      if (!aiDecision) {
        // AI gave no decision for this file — allow it
        return { id: fileId, allowed: true };
      }

      return {
        id: fileId,
        allowed: aiDecision.allowed !== false,
        reason: aiDecision.allowed === false ? aiDecision.reason : undefined,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("upload-safety-screen error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error while screening uploads." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
