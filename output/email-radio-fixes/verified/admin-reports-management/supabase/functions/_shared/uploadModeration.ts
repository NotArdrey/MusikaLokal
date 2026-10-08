export type VisualDecision = {
  allowed: boolean;
  reason?: string;
  categories?: string[];
  confidence?: number | null;
  provider?: string;
};
const BUCKET = "moderation-quarantine";
const pendingReason =
  "This media is unpublished while an administrator reviews it. You will be notified of the decision.";

const MODERATION_CATEGORY_LABELS: Record<string, string> = {
  sexual: "sexual content",
  "sexual/minors": "sexual content involving minors",
  nudity: "nudity",
  violence: "violence",
  "violence/graphic": "graphic violence or gore",
  gore: "graphic violence or gore",
  hate: "hate or extremist content",
  "hate/threatening": "threatening hate content",
  hate_symbols: "hate symbols or extremist imagery",
  illicit: "illegal content",
  "illicit/violent": "violent illegal content",
  illegal: "illegal content",
};

function formatDetectedCategories(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  const categories = new Set(
    value
      .filter((category): category is string => typeof category === "string")
      .map((category) => category.trim().toLowerCase()),
  );
  if (categories.has("sexual/minors")) categories.delete("sexual");
  if (categories.has("violence/graphic")) categories.delete("violence");
  if (categories.has("hate/threatening")) categories.delete("hate");
  if (categories.has("illicit/violent")) categories.delete("illicit");

  const labels = Array.from(new Set(
    Array.from(categories)
      .map((category) => MODERATION_CATEGORY_LABELS[category])
      .filter((label): label is string => Boolean(label)),
  ));

  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function buildModerationStatusReason(entry: any): string {
  const detectedCategories = formatDetectedCategories(entry.categories);

  if (entry.status === "rejected") {
    return detectedCategories
      ? `This media was rejected after review for ${detectedCategories}. It remains unpublished.`
      : "An administrator rejected this media. It remains unpublished.";
  }

  return detectedCategories
    ? `Safety screening flagged this media for possible ${detectedCategories} under Musika Lokal's safety guidelines. ${pendingReason}`
    : `Safety screening flagged this media under Musika Lokal's safety guidelines. ${pendingReason}`;
}

export async function findUploadModerationCase(
  client: any,
  userId: string,
  context: string,
  file: any,
) {
  // Only server-computed evidence hashes can match an approval. Client cache IDs
  // and filenames must never grant an exception for different content.
  const evidence = file.contentDataUrl || "";
  if (!evidence) return { existing: null, hash: null };
  const bytes = new TextEncoder().encode(`${file.kind || "photo"}|${evidence}`);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const { data, error } = await client
    .from("upload_moderation_cases")
    .select("id,status,media_path,categories,reason")
    .eq("user_id", userId)
    .eq("content_hash", hash)
    .eq("context", context)
    .maybeSingle();
  if (error) throw error;
  return { existing: data, hash };
}

export function moderationCaseDecision(entry: any) {
  const approved = entry.status === "approved";
  return {
    allowed: approved,
    publiclyAvailable: approved,
    requiresAdminReview: entry.status === "pending_review",
    moderationCaseId: entry.id,
    moderationStatus: entry.status,
    moderationEvidenceAttached: Boolean(entry.media_path),
    reason: approved ? undefined : buildModerationStatusReason(entry),
  };
}

export async function createUploadModerationCase(
  client: any,
  userId: string,
  context: string,
  file: any,
  decision: VisualDecision,
  hash: string | null,
) {
  if (!client)
    throw new Error(
      "Moderation case storage is unavailable. Upload remains blocked.",
    );
  const id = crypto.randomUUID();
  let previewPath: string | null = null;
  const match =
    /^data:(image\/(?:jpeg|png|webp|gif|heic|heif|avif));base64,([A-Za-z0-9+/=\s]+)$/.exec(
      file.contentDataUrl || "",
    );
  if (match) {
    const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, "")), (ch) =>
      ch.charCodeAt(0),
    );
    if (bytes.length > 4 * 1024 * 1024)
      throw new Error("Moderation evidence exceeds the supported size.");
    previewPath = `${userId}/${id}/preview.${match[1].split("/")[1]}`;
    const { error } = await client.storage
      .from(BUCKET)
      .upload(previewPath, bytes, { contentType: match[1], upsert: false });
    if (error) throw error;
  }
  const payload = {
    id,
    user_id: userId,
    content_hash: hash || crypto.randomUUID(),
    context: context.slice(0, 160),
    related_type:
      typeof file.relatedType === "string"
        ? file.relatedType.slice(0, 60)
        : null,
    related_id: /^[0-9a-f-]{36}$/i.test(file.relatedId || "")
      ? file.relatedId
      : null,
    file_name: String(file.fileName || "Upload").slice(0, 255),
    media_kind:
      file.kind === "video"
        ? "video"
        : file.kind === "document"
          ? "document"
          : "photo",
    preview_path: previewPath,
    mime_type: file.mimeType || null,
    categories: decision.categories || [],
    confidence: decision.confidence ?? null,
    provider: decision.provider || null,
    reason: decision.reason || "AI detected potentially prohibited content.",
  };
  const { data, error } = await client
    .from("upload_moderation_cases")
    .insert(payload)
    .select("id,status,media_path,categories,reason")
    .single();
  if (error) {
    if (previewPath) await client.storage.from(BUCKET).remove([previewPath]);
    if (error.code === "23505" && hash) {
      const { existing } = await findUploadModerationCase(
        client,
        userId,
        context,
        file,
      );
      if (existing) return moderationCaseDecision(existing);
    }
    throw error;
  }
  return moderationCaseDecision(data);
}

export async function handleUploadModerationAdmin(
  client: any,
  adminId: string,
  action: string,
  params: any,
) {
  if (action === "fetch_upload_moderation_cases") {
    const { data: expired, error: expiryError } = await client
      .from("upload_moderation_cases")
      .select("id,preview_path,media_path")
      .in("status", ["approved", "rejected"])
      .lt("evidence_delete_after", new Date().toISOString())
      .limit(5);
    if (expiryError) throw expiryError;
    await Promise.all(
      (expired || []).map(async (entry: any) => {
        const paths = [entry.preview_path, entry.media_path].filter(Boolean);
        const { error } = paths.length
          ? await client.storage.from(BUCKET).remove(paths)
          : { error: null };
        if (error) {
          console.error("Moderation evidence cleanup failed", entry.id);
          return;
        }
        const { error: finalizeError } = await client.rpc(
          "finalize_moderation_evidence_cleanup",
          { p_case_id: entry.id },
        );
        if (finalizeError)
          console.error("Moderation evidence cleanup audit failed", entry.id);
      }),
    );
    const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
    let query = client
      .from("upload_moderation_cases")
      .select(
        "*, uploader:profiles!user_id(id,full_name,email), reviewer:profiles!reviewed_by(id,full_name)",
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 20);
    if (params.status === "reviewed")
      query = query.in("status", ["approved", "rejected"]);
    else if (["pending_review", "approved", "rejected"].includes(params.status))
      query = query.eq("status", params.status);
    const { data, error } = await query;
    if (error) throw error;
    return { cases: data.slice(0, 20), hasMore: data.length > 20 };
  }
  if (action === "fetch_upload_moderation_details") {
    const { data: entry, error } = await client
      .from("upload_moderation_cases")
      .select("*")
      .eq("id", params.caseId)
      .single();
    if (error) throw error;
    const sign = async (path: string | null) => {
      if (!path) return null;
      const { data, error } = await client.storage
        .from(BUCKET)
        .createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    };
    const [
      previewUrl,
      mediaUrl,
      historyResult,
      previousResult,
      restrictionResult,
    ] = await Promise.all([
      sign(entry.preview_path),
      sign(entry.media_path),
      client
        .from("upload_moderation_history")
        .select("*, actor:profiles!actor_id(full_name)")
        .eq("case_id", entry.id)
        .order("created_at", { ascending: false }),
      client
        .from("upload_moderation_cases")
        .select("id", { count: "exact", head: true })
        .eq("user_id", entry.user_id)
        .eq("status", "rejected"),
      client
        .from("upload_moderation_restrictions")
        .select("restricted_until,restriction_scopes")
        .eq("user_id", entry.user_id)
        .gt("restricted_until", new Date().toISOString())
        .maybeSingle(),
    ]);
    for (const result of [historyResult, previousResult, restrictionResult])
      if (result.error) throw result.error;
    return {
      case: entry,
      previewUrl,
      mediaUrl,
      history: historyResult.data,
      previousRejections: previousResult.count,
      restrictedUntil: restrictionResult.data?.restricted_until || null,
      restrictionScopes: Array.isArray(restrictionResult.data?.restriction_scopes)
        ? restrictionResult.data.restriction_scopes
        : [],
    };
  }
  if (action === "review_upload_moderation_case") {
    const { data, error } = await client.rpc("review_upload_moderation_case", {
      p_case_id: params.caseId,
      p_actor_id: adminId,
      p_action: params.decision,
      p_notes: String(params.notes || "").slice(0, 4000),
      p_version: params.version,
    });
    if (error) throw error;
    return { case: data };
  }
  throw new Error("Unsupported upload moderation action");
}
