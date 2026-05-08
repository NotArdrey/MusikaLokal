// @ts-nocheck

const DUPLICATE_REVIEW_SOURCE = "DIDIT_DUPLICATE";
const DIDIT_PENDING_SOURCE = "DIDIT_PENDING";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function normalizeIdentityEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
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

function firstNonEmptyText(paths: string[][], source: any) {
  for (const path of paths) {
    const value = normalizeText(readPath(source, path));
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

  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

export function extractIdentityDocumentCountry(rawDocument: any, fallback?: unknown) {
  const value =
    normalizeText(fallback) ||
    normalizeText(rawDocument?.issuing_country) ||
    normalizeText(rawDocument?.issuingCountry) ||
    normalizeText(rawDocument?.country) ||
    normalizeText(rawDocument?.document?.country) ||
    normalizeText(rawDocument?.document_details?.country);

  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

export function normalizeFullLegalName(value: unknown) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

export function normalizeBirthDate(value: unknown) {
  const rawValue = normalizeText(value);
  if (!rawValue) return null;

  const isoMatch = rawValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const normalized = `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
    const parsed = new Date(`${normalized}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
      ? normalized
      : null;
  }

  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function extractIdentityFullName(rawDocument: any) {
  const direct =
    normalizeText(rawDocument?.full_name) ||
    normalizeText(rawDocument?.fullName) ||
    normalizeText(rawDocument?.name) ||
    normalizeText(rawDocument?.document?.full_name) ||
    normalizeText(rawDocument?.document_details?.full_name) ||
    normalizeText(rawDocument?.ocr_data?.full_name) ||
    normalizeText(rawDocument?.extracted_data?.full_name);

  if (direct) return direct;

  const firstName = normalizeText(rawDocument?.first_name || rawDocument?.firstName || rawDocument?.given_name || rawDocument?.givenName);
  const middleName = normalizeText(rawDocument?.middle_name || rawDocument?.middleName || rawDocument?.extra_fields?.middle_name);
  const lastName = normalizeText(rawDocument?.last_name || rawDocument?.lastName || rawDocument?.surname || rawDocument?.extra_fields?.first_surname);
  const secondSurname = normalizeText(rawDocument?.second_surname || rawDocument?.extra_fields?.second_surname);

  return [firstName, middleName, lastName, secondSurname].filter(Boolean).join(" ");
}

function extractIdentityBirthDate(rawDocument: any) {
  return firstNonEmptyText(
    [
      ["date_of_birth"],
      ["dateOfBirth"],
      ["birth_date"],
      ["birthDate"],
      ["dob"],
      ["personal", "date_of_birth"],
      ["document", "date_of_birth"],
      ["document_details", "date_of_birth"],
      ["ocr_data", "date_of_birth"],
      ["extracted_data", "date_of_birth"],
      ["extra_fields", "date_of_birth"],
      ["extra_fields", "dob"],
    ],
    rawDocument,
  );
}

export function prepareIdentityNameBirthDateDuplicateInput(rawDocument: any, options: Record<string, unknown> = {}) {
  const fullLegalName = normalizeText(options.fullLegalName || extractIdentityFullName(rawDocument));
  const normalizedFullLegalName = normalizeFullLegalName(options.normalizedFullLegalName || fullLegalName);
  const birthDate = normalizeBirthDate(options.birthDate || extractIdentityBirthDate(rawDocument));

  return {
    fullLegalName: fullLegalName || null,
    normalizedFullLegalName,
    birthDate,
    hasNameBirthDate: Boolean(normalizedFullLegalName && birthDate),
  };
}

async function hmacSha256Hex(message: string) {
  const encoder = new TextEncoder();
  const secret = Deno.env.get("IDENTITY_DOCUMENT_HASH_SECRET");
  if (!secret) {
    throw new Error("IDENTITY_DOCUMENT_HASH_SECRET is required for identity document fingerprinting");
  }

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

async function hmacSha256HexWithSecret(message: string, secret: string) {
  const encoder = new TextEncoder();
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

function getSessionNonceSecret() {
  const secret =
    Deno.env.get("DIDIT_SESSION_NONCE_SECRET") ||
    Deno.env.get("IDENTITY_DOCUMENT_HASH_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!secret) {
    throw new Error("DIDIT_SESSION_NONCE_SECRET or IDENTITY_DOCUMENT_HASH_SECRET is required for Didit session nonce hashing");
  }

  return secret;
}

function getSessionNonceSecretCandidates() {
  return [
    Deno.env.get("DIDIT_SESSION_NONCE_SECRET"),
    Deno.env.get("IDENTITY_DOCUMENT_HASH_SECRET"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  ].map(normalizeText).filter(Boolean);
}

export function createSessionNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashSessionNonce(sessionRef: unknown, nonce: unknown) {
  const normalizedSessionRef = normalizeText(sessionRef);
  const normalizedNonce = normalizeText(nonce);
  if (!normalizedSessionRef || !normalizedNonce) return "";
  return hmacSha256HexWithSecret(`${normalizedSessionRef}:${normalizedNonce}`, getSessionNonceSecret());
}

export async function verifySessionNonce(sessionRef: unknown, nonce: unknown, expectedHash: unknown) {
  const normalizedExpected = normalizeText(expectedHash).toLowerCase();
  if (!normalizedExpected) return false;

  const normalizedSessionRef = normalizeText(sessionRef);
  const normalizedNonce = normalizeText(nonce);
  if (!normalizedSessionRef || !normalizedNonce) return false;

  for (const secret of getSessionNonceSecretCandidates()) {
    const actual = await hmacSha256HexWithSecret(`${normalizedSessionRef}:${normalizedNonce}`, secret);
    if (actual.length === normalizedExpected.length && constantTimeEqual(actual, normalizedExpected)) {
      return true;
    }
  }

  return false;
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const RAW_ID_KEY_RE = /(^|_)(document|doc|id|identity|identification|personal|passport|license|licence|national|tax|tin|ssn|mrz)(_|$).*?(number|no|num|code|value|identifier|id)$|^(mrz|raw_mrz|document_number|documentnumber|id_number|idnumber|personal_number|personalnumber|passport_number|passportnumber|license_number|licensenumber|national_id_number|nationalidnumber)$/i;

export function sanitizeIdentityVerificationData(value: any, depth = 0): any {
  if (depth > 12) return null;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeIdentityVerificationData(item, depth + 1));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (RAW_ID_KEY_RE.test(key)) {
      sanitized[key] = "[redacted]";
      continue;
    }
    sanitized[key] = sanitizeIdentityVerificationData(nestedValue, depth + 1);
  }
  return sanitized;
}

export function stripPrivateSessionFields(value: any) {
  if (!value || typeof value !== "object") return value;
  const { session_nonce_hash: _sessionNonceHash, ...rest } = value;
  return rest;
}

export async function buildIdentityDocumentFingerprint(rawDocument: any, options: Record<string, unknown> = {}) {
  const normalizedNumber = normalizeDocumentToken(
    options.documentNumber || extractIdentityDocumentNumber(rawDocument),
  );
  const documentType = extractIdentityDocumentType(rawDocument, options.documentTypeKey || options.documentType);
  const documentCountry = extractIdentityDocumentCountry(rawDocument, options.documentCountry);

  if (!normalizedNumber || !documentType || !documentCountry) return null;

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
    .select("id, user_id, role, status, source, created_at, normalized_email, profiles:user_id(email)")
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
    const claimEmail = normalizeText(item?.normalized_email).toLowerCase();
    return (!matchEmail || matchEmail !== normalizedEmail) && (!claimEmail || claimEmail !== normalizedEmail);
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
    email = null,
    metadata = {},
    verifiedFullLegalName = null,
    normalizedFullLegalName = null,
    birthDate = null,
    reviewReason = null,
    matchedOn = null,
  }: Record<string, unknown>,
) {
  if (!isUuid(userId)) return null;

  const nameBirthDateInput = prepareIdentityNameBirthDateDuplicateInput(null, {
    fullLegalName: verifiedFullLegalName,
    normalizedFullLegalName,
    birthDate,
  });

  if (status === "APPROVED") {
    return claimApprovedIdentityDocument(client, {
      userId,
      role,
      documentFingerprint,
      documentType,
      documentTypeKey,
      documentCountry,
      source,
      diditSessionId,
      manualReviewId,
      email,
      metadata,
      verifiedFullLegalName: nameBirthDateInput.fullLegalName,
      normalizedFullLegalName: nameBirthDateInput.normalizedFullLegalName,
      birthDate: nameBirthDateInput.birthDate,
    });
  }

  if (!documentFingerprint) return null;

  const nowIso = new Date().toISOString();
  const claimMetadata = {
    ...(metadata && typeof metadata === "object" ? metadata : {}),
    ...(reviewReason ? { review_reason: reviewReason } : {}),
    ...(matchedOn ? { matched_on: matchedOn } : {}),
  };
  const { data, error } = await client
    .from("identity_document_claims")
    .upsert(
      {
        user_id: userId,
        role: normalizeIdentityRole(role),
        document_fingerprint: documentFingerprint,
        original_user_id: userId,
        normalized_email: normalizeIdentityEmail(email),
        document_type: documentType || null,
        document_type_key: documentTypeKey || null,
        document_country: normalizeText(documentCountry).toUpperCase() || "PHL",
        verified_full_legal_name: nameBirthDateInput.fullLegalName,
        normalized_full_legal_name: nameBirthDateInput.normalizedFullLegalName,
        birth_date: nameBirthDateInput.birthDate,
        source: source || "DIDIT",
        status,
        didit_session_id: diditSessionId || null,
        manual_review_id: manualReviewId || null,
        claim_metadata: claimMetadata,
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

export async function claimApprovedIdentityDocument(
  client: any,
  {
    userId,
    role,
    documentFingerprint,
    documentType,
    documentTypeKey,
    documentCountry = "PHL",
    source,
    diditSessionId = null,
    manualReviewId = null,
    email = null,
    metadata = {},
    duplicateOverride = false,
    verifiedFullLegalName = null,
    normalizedFullLegalName = null,
    birthDate = null,
  }: Record<string, unknown>,
) {
  if (!isUuid(userId)) return null;

  const nameBirthDateInput = prepareIdentityNameBirthDateDuplicateInput(null, {
    fullLegalName: verifiedFullLegalName,
    normalizedFullLegalName,
    birthDate,
  });

  const { data, error } = await client.rpc("claim_identity_document_approval_v2", {
    p_user_id: userId,
    p_role: normalizeIdentityRole(role),
    p_document_fingerprint: documentFingerprint || null,
    p_normalized_email: normalizeIdentityEmail(email),
    p_document_type: documentType || null,
    p_document_type_key: documentTypeKey || null,
    p_document_country: normalizeText(documentCountry).toUpperCase() || "PHL",
    p_full_legal_name: nameBirthDateInput.fullLegalName,
    p_normalized_full_legal_name: nameBirthDateInput.normalizedFullLegalName,
    p_birth_date: nameBirthDateInput.birthDate,
    p_source: source || "DIDIT",
    p_didit_session_id: diditSessionId || null,
    p_manual_review_id: manualReviewId || null,
    p_claim_metadata: metadata && typeof metadata === "object" ? metadata : {},
    p_duplicate_override: Boolean(duplicateOverride),
  });

  if (error) {
    throw new Error(dbErrorMessage("identity document approval claim failed", error));
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
    verifiedFullLegalName = null,
    normalizedFullLegalName = null,
    birthDate = null,
    reviewReason = null,
    matchedOn = null,
  }: Record<string, unknown>,
) {
  if (!isUuid(userId)) return null;

  const nowIso = new Date().toISOString();
  const reviewSource = normalizeText(source).toUpperCase() || DIDIT_PENDING_SOURCE;
  const normalizedRole = normalizeIdentityRole(role);
  const reason = duplicateReason || (reviewSource === DUPLICATE_REVIEW_SOURCE ? getDuplicateIdentityReviewReason(normalizedRole) : null);
  const nameBirthDateInput = prepareIdentityNameBirthDateDuplicateInput(null, {
    fullLegalName: verifiedFullLegalName,
    normalizedFullLegalName,
    birthDate,
  });

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
    verified_full_legal_name: nameBirthDateInput.fullLegalName,
    normalized_full_legal_name: nameBirthDateInput.normalizedFullLegalName,
    birth_date: nameBirthDateInput.birthDate,
    review_reason: reviewReason || null,
    matched_on: matchedOn || null,
    duplicate_reason: reason,
    duplicate_match_count: Number(duplicateMatchCount || 0),
    review_notes: reason,
    metadata: {
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      duplicate_identity_review: reviewSource === DUPLICATE_REVIEW_SOURCE,
      ...(reviewReason ? { review_reason: reviewReason } : {}),
      ...(matchedOn ? { matched_on: matchedOn } : {}),
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
