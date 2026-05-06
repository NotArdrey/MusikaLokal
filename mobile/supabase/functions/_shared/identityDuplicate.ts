// @ts-nocheck

const DUPLICATE_REVIEW_SOURCE = "DIDIT_DUPLICATE";
const DIDIT_PENDING_SOURCE = "DIDIT_PENDING";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function normalizeIdentityRole(role: unknown) {
  return normalizeText(role).toLowerCase() || "musician";
}

export function isUuid(value: unknown) {
  return UUID_RE.test(normalizeText(value));
}

function normalizeDocumentToken(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function readPath(source: any, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = current[key];
  }
  return typeof current === "string" || typeof current === "number" ? String(current) : null;
}

function firstNonEmpty(paths: string[][], source: any) {
  for (const path of paths) {
    const value = normalizeDocumentToken(readPath(source, path));
    if (value) return value;
  }
  return "";
}

function findLikelyDocumentNumber(source: any, depth = 0): string {
  if (!source || typeof source !== "object" || depth > 5) return "";

  const preferredKeys = [
    "document_number",
    "documentNumber",
    "document_no",
    "documentNo",
    "id_number",
    "idNumber",
    "identification_number",
    "identificationNumber",
    "personal_number",
    "personalNumber",
    "national_id_number",
    "nationalIdNumber",
    "passport_number",
    "passportNumber",
    "license_number",
    "licenseNumber",
    "tax_number",
    "taxNumber",
  ];

  for (const key of preferredKeys) {
    const value = normalizeDocumentToken(source[key]);
    if (value) return value;
  }

  for (const value of Object.values(source)) {
    const nested = findLikelyDocumentNumber(value, depth + 1);
    if (nested) return nested;
  }

  return "";
}

export function extractIdentityDocumentNumber(rawDocument: any) {
  const direct = firstNonEmpty(
    [
      ["document_number"],
      ["documentNumber"],
      ["document_no"],
      ["documentNo"],
      ["id_number"],
      ["idNumber"],
      ["identification_number"],
      ["identificationNumber"],
      ["personal_number"],
      ["personalNumber"],
      ["national_id_number"],
      ["nationalIdNumber"],
      ["passport_number"],
      ["passportNumber"],
      ["license_number"],
      ["licenseNumber"],
      ["tax_number"],
      ["taxNumber"],
      ["document", "document_number"],
      ["document", "documentNumber"],
      ["document_details", "document_number"],
      ["ocr_data", "document_number"],
      ["ocr_data", "id_number"],
      ["extracted_data", "document_number"],
      ["extra_fields", "document_number"],
      ["extra_fields", "id_number"],
      ["extra_fields", "personal_number"],
      ["extra_fields", "passport_number"],
      ["extra_fields", "license_number"],
    ],
    rawDocument,
  );

  return direct || findLikelyDocumentNumber(rawDocument);
}

export function extractIdentityDocumentType(rawDocument: any, fallback?: unknown) {
  const value =
    normalizeText(fallback) ||
    normalizeText(rawDocument?.document_type) ||
    normalizeText(rawDocument?.documentType) ||
    normalizeText(rawDocument?.type) ||
    normalizeText(rawDocument?.document?.type) ||
    normalizeText(rawDocument?.document_details?.type);

  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "unknown";
}

export function extractIdentityDocumentCountry(rawDocument: any, fallback?: unknown) {
  const value =
    normalizeText(fallback) ||
    normalizeText(rawDocument?.issuing_country) ||
    normalizeText(rawDocument?.issuingCountry) ||
    normalizeText(rawDocument?.country) ||
    normalizeText(rawDocument?.document?.country) ||
    normalizeText(rawDocument?.document_details?.country) ||
    "PHL";

  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "PHL";
}

async function hmacSha256Hex(message: string) {
  const encoder = new TextEncoder();
  const secret =
    Deno.env.get("IDENTITY_DOCUMENT_HASH_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "musikalokal-identity-document-fingerprint";
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function dbErrorMessage(context: string, error: any) {
  const message = error?.message || "Unknown Supabase error";
  return `${context}: ${message}`;
}

function isUniqueViolation(error: any) {
  return error?.code === "23505" || /duplicate key value/i.test(error?.message || "");
}

export async function buildIdentityDocumentFingerprint(rawDocument: any, options: Record<string, unknown> = {}) {
  const normalizedNumber = normalizeDocumentToken(
    options.documentNumber || extractIdentityDocumentNumber(rawDocument),
  );
  if (!normalizedNumber) return null;

  const documentType = extractIdentityDocumentType(rawDocument, options.documentTypeKey || options.documentType);
  const documentCountry = extractIdentityDocumentCountry(rawDocument, options.documentCountry);
  const canonical = `${documentCountry}|${documentType}|${normalizedNumber}`;
  return `v1:${await hmacSha256Hex(canonical)}`;
}

export async function findSameRoleIdentityDuplicate(
  client: any,
  {
    documentFingerprint,
    role,
    userId,
    email,
  }: {
    documentFingerprint?: string | null;
    role: string;
    userId?: string | null;
    email?: string | null;
  },
) {
  if (!documentFingerprint) return { hasDuplicate: false, matches: [] };

  let query = client
    .from("identity_document_claims")
    .select("id, user_id, role, status, source, created_at, profiles:user_id(email)")
    .eq("document_fingerprint", documentFingerprint)
    .eq("role", normalizeIdentityRole(role))
    .in("status", ["APPROVED", "PENDING_REVIEW"])
    .limit(10);

  if (isUuid(userId)) {
    query = query.neq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(dbErrorMessage("identity duplicate lookup failed", error));
  }

  const normalizedEmail = normalizeText(email).toLowerCase();
  const matches = (Array.isArray(data) ? data : []).filter((item: any) => {
    if (!normalizedEmail) return true;
    const matchEmail = normalizeText(item?.profiles?.email).toLowerCase();
    return !matchEmail || matchEmail !== normalizedEmail;
  });
  return { hasDuplicate: matches.length > 0, matches };
}

export function getDuplicateIdentityReviewReason(role: string) {
  const label = normalizeIdentityRole(role) === "fan" ? "fan" : "musician";
  return `This ID appears to match another ${label} account. We will review it manually so the account is handled correctly.`;
}

export async function recordIdentityDocumentClaim(
  client: any,
  {
    userId,
    role,
    documentFingerprint,
    documentType,
    documentTypeKey,
    documentCountry = "PHL",
    source,
    status = "APPROVED",
    diditSessionId = null,
    manualReviewId = null,
  }: Record<string, unknown>,
) {
  if (!isUuid(userId) || !documentFingerprint) return null;

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("identity_document_claims")
    .upsert(
      {
        user_id: userId,
        role: normalizeIdentityRole(role),
        document_fingerprint: documentFingerprint,
        document_type: documentType || null,
        document_type_key: documentTypeKey || null,
        document_country: normalizeText(documentCountry).toUpperCase() || "PHL",
        source: source || "DIDIT",
        status,
        didit_session_id: diditSessionId || null,
        manual_review_id: manualReviewId || null,
        updated_at: nowIso,
        last_seen_at: nowIso,
      },
      { onConflict: "user_id,document_fingerprint,role" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(dbErrorMessage("identity document claim record failed", error));
  }

  return data;
}

export async function queueIdentityReview(
  client: any,
  {
    userId,
    email,
    role,
    documentType,
    documentTypeKey,
    documentCountry = "PHL",
    source = DIDIT_PENDING_SOURCE,
    diditSessionId = null,
    documentFingerprint = null,
    duplicateReason = null,
    duplicateMatchCount = 0,
    metadata = {},
  }: Record<string, unknown>,
) {
  if (!isUuid(userId)) return null;

  const nowIso = new Date().toISOString();
  const reviewSource = normalizeText(source).toUpperCase() || DIDIT_PENDING_SOURCE;
  const normalizedRole = normalizeIdentityRole(role);
  const reason = duplicateReason || (reviewSource === DUPLICATE_REVIEW_SOURCE ? getDuplicateIdentityReviewReason(normalizedRole) : null);

  const payload = {
    user_id: userId,
    submitted_by_email: normalizeText(email),
    submitted_role: normalizedRole,
    document_type: normalizeText(documentType) || "Government ID",
    document_type_key: normalizeText(documentTypeKey) || null,
    document_country: normalizeText(documentCountry).toUpperCase() || "PHL",
    source: reviewSource,
    status: "PENDING_REVIEW",
    didit_session_id: diditSessionId || null,
    document_fingerprint: documentFingerprint || null,
    duplicate_reason: reason,
    duplicate_match_count: Number(duplicateMatchCount || 0),
    review_notes: reason,
    metadata: {
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      duplicate_identity_review: reviewSource === DUPLICATE_REVIEW_SOURCE,
    },
    expected_decision_by: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: nowIso,
  };

  const { data: existing, error: existingError } = await client
    .from("manual_identity_reviews")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "PENDING_REVIEW")
    .eq("source", reviewSource)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(dbErrorMessage("identity review lookup failed", existingError));
  }

  if (existing?.id) {
    const { data, error } = await client
      .from("manual_identity_reviews")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(dbErrorMessage("identity review update failed", error));
    }
    return data;
  }

  const { data, error } = await client
    .from("manual_identity_reviews")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      const { data: current, error: currentError } = await client
        .from("manual_identity_reviews")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "PENDING_REVIEW")
        .eq("source", reviewSource)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (currentError) {
        throw new Error(dbErrorMessage("identity review conflict lookup failed", currentError));
      }

      if (current?.id) {
        const { data: updated, error: updateError } = await client
          .from("manual_identity_reviews")
          .update(payload)
          .eq("id", current.id)
          .select("id")
          .maybeSingle();

        if (updateError) {
          throw new Error(dbErrorMessage("identity review conflict update failed", updateError));
        }
        return updated;
      }
    }

    throw new Error(dbErrorMessage("identity review insert failed", error));
  }

  return data;
}

export { DIDIT_PENDING_SOURCE, DUPLICATE_REVIEW_SOURCE };
