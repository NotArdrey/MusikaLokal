// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailWithGmail } from "../_shared/gmailEmail.ts";
import {
  claimApprovedIdentityDocument,
  getDuplicateIdentityReviewReason,
  prepareIdentityNameBirthDateDuplicateInput,
  recordIdentityDocumentClaim,
  queueIdentityReview,
} from "../_shared/identityDuplicate.ts";
import {
  MUSICIAN_VIDEO_BUCKET,
  MUSICIAN_VIDEO_REVIEW_SOURCE,
  publishMusicianVideoToProfilePortfolio,
} from "../_shared/musicianVideoProof.ts";

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
  "staff",
]);

const roleAliases: Record<string, string> = {
  manager: "musician",
  "musician-member": "musician",
};

const hiddenUserManagementVerificationStatuses = [
  "DECLINED",
  "PENDING_REVIEW",
];
const COPYRIGHT_OWNERSHIP_REVIEW_SOURCE = "COPYRIGHT_OWNERSHIP";

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

function normalizeDateOnly(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function getApprovalClaimReviewReason(approvalClaim: any, role: string) {
  return String(approvalClaim?.review_reason || approvalClaim?.reason || "").trim() || getDuplicateIdentityReviewReason(role);
}

function getApprovalClaimMatchedOn(approvalClaim: any, fallback = "DOCUMENT_FINGERPRINT") {
  return String(approvalClaim?.matched_on || approvalClaim?.match_type || fallback).trim().toUpperCase();
}

function normalizeApprovalClaimResult(rawClaim: any): any {
  if (Array.isArray(rawClaim)) {
    return normalizeApprovalClaimResult(rawClaim[0]);
  }

  if (typeof rawClaim === "string") {
    try {
      return normalizeApprovalClaimResult(JSON.parse(rawClaim));
    } catch {
      return { decision: rawClaim };
    }
  }

  return rawClaim;
}

function getIdentityMatchLabel(matchType: unknown) {
  const normalized = String(matchType || "").trim().toUpperCase();
  if (normalized === "NAME_BIRTHDATE") return "Same name + birthdate";
  if (normalized === "DOCUMENT_FINGERPRINT") return "Same verified ID";
  return "Possible identity match";
}

function normalizeIdentityMatchType(matchType: unknown, fallback = "DOCUMENT_FINGERPRINT") {
  const normalized = String(matchType || fallback || "").trim().toUpperCase();
  return normalized || "DOCUMENT_FINGERPRINT";
}

function getReviewMetadataObject(review: any) {
  return review?.metadata && typeof review.metadata === "object" ? review.metadata : {};
}

function isCopyrightOwnershipReview(review: any) {
  return String(review?.source || "").trim().toUpperCase() === COPYRIGHT_OWNERSHIP_REVIEW_SOURCE;
}

function hasDiditSession(review: any) {
  return Boolean(String(review?.didit_session_id || "").trim());
}

function getCopyrightOwnershipTrackLabel(review: any) {
  const metadata = getReviewMetadataObject(review);
  const title = String(metadata.copyright_title || "released recording").trim();
  const artistLabel = String(metadata.copyright_artist_label || "").trim();
  return artistLabel ? `${title} by ${artistLabel}` : title;
}

function metadataMatchSources(metadata: any) {
  return [
    metadata?.duplicate_matches,
    metadata?.matches,
    metadata?.approval_claim_result?.matches,
    metadata?.claim_result?.matches,
  ].filter(Array.isArray);
}

function mapMetadataIdentityMatch(rawMatch: any, fallbackMatchedOn: unknown) {
  if (!rawMatch || typeof rawMatch !== "object") return null;
  const matchedOn = normalizeIdentityMatchType(rawMatch.matched_on || rawMatch.match_type || fallbackMatchedOn);
  const userId = String(rawMatch.user_id || rawMatch.original_user_id || rawMatch.matched_existing_user_id || "").trim();
  const originalUserId = String(rawMatch.original_user_id || "").trim();
  const email = String(rawMatch.email || rawMatch.normalized_email || rawMatch.profiles?.email || "").trim().toLowerCase();
  if (!userId && !email) return null;

  return {
    claim_id: String(rawMatch.claim_id || rawMatch.identity_document_claim_id || rawMatch.id || "").trim() || null,
    didit_session_id: String(rawMatch.didit_session_id || rawMatch.diditSessionId || rawMatch.session_id || "").trim() || null,
    manual_review_id: String(rawMatch.manual_review_id || rawMatch.manualReviewId || "").trim() || null,
    user_id: userId || null,
    original_user_id: originalUserId || null,
    email: email || null,
    full_name: rawMatch.full_name || rawMatch.verified_full_legal_name || rawMatch.profiles?.full_name || null,
    role: rawMatch.role || null,
    source: rawMatch.source || null,
    claim_status: rawMatch.claim_status || rawMatch.status || null,
    verified_at: rawMatch.verified_at || rawMatch.created_at || null,
    birth_date: normalizeDateOnly(rawMatch.birth_date),
    matched_on: matchedOn,
    match_type: matchedOn,
    match_label: getIdentityMatchLabel(matchedOn),
    front_image_url: rawMatch.front_image_url || null,
    back_image_url: rawMatch.back_image_url || null,
    selfie_image_url: rawMatch.selfie_image_url || null,
  };
}

function getReviewMetadataIdentityMatches(review: any, fallbackMatchedOn: unknown) {
  const metadata = getReviewMetadataObject(review);
  const matches: any[] = [];

  for (const source of metadataMatchSources(metadata)) {
    for (const rawMatch of source) {
      const match = mapMetadataIdentityMatch(rawMatch, fallbackMatchedOn);
      if (match) matches.push(match);
    }
  }

  const matchedExistingUserId =
    metadata?.matched_existing_user_id ||
    metadata?.approval_claim_result?.matched_existing_user_id ||
    metadata?.claim_result?.matched_existing_user_id;
  if (matchedExistingUserId) {
    const matchedOn = normalizeIdentityMatchType(metadata?.matched_on || metadata?.approval_claim_result?.matched_on || fallbackMatchedOn);
    matches.push({
      user_id: String(matchedExistingUserId),
      email: null,
      full_name: null,
      role: null,
      source: metadata?.source || null,
      verified_at: null,
      birth_date: null,
      matched_on: matchedOn,
      match_type: matchedOn,
      match_label: getIdentityMatchLabel(matchedOn),
    });
  }

  return matches.filter((match, index, all) => (
    index === all.findIndex((other) => (
      String(other.user_id || other.email || "") === String(match.user_id || match.email || "") &&
      String(other.matched_on || "") === String(match.matched_on || "")
    ))
  ));
}

function getEmbeddedProfile(rawProfile: any) {
  if (Array.isArray(rawProfile)) return rawProfile[0] || null;
  return rawProfile && typeof rawProfile === "object" ? rawProfile : null;
}

function getClaimProfile(claim: any, profilesById?: Map<string, any>) {
  const embeddedProfile = getEmbeddedProfile(claim?.profiles);
  if (embeddedProfile?.id || embeddedProfile?.email) return embeddedProfile;

  const userId = String(claim?.user_id || "").trim();
  return userId && profilesById ? profilesById.get(userId) || null : null;
}

function claimHasCurrentProfile(claim: any, profilesById?: Map<string, any>) {
  const userId = String(claim?.user_id || "").trim();
  const profile = getClaimProfile(claim, profilesById);
  return Boolean(userId && profile);
}

async function hydrateProfilesById(client: any, profilesById: Map<string, any>, ids: unknown[]) {
  const missingIds = Array.from(new Set(
    ids
      .map((id) => String(id || "").trim())
      .filter((id) => id && !profilesById.has(id)),
  ));

  if (missingIds.length === 0) return;

  const { data: profiles } = await client
    .from("profiles")
    .select("id, full_name, email, role, verification_status, id_document_expiry")
    .in("id", missingIds);

  for (const profile of profiles || []) {
    profilesById.set(String(profile.id), profile);
  }
}

async function hydrateProfilesByEmail(client: any, profilesById: Map<string, any>, emails: unknown[]) {
  const knownEmails = new Set(
    Array.from(profilesById.values())
      .map((profile: any) => String(profile?.email || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const missingEmails = Array.from(new Set(
    emails
      .map((email) => String(email || "").trim().toLowerCase())
      .filter((email) => email && !knownEmails.has(email)),
  ));

  if (missingEmails.length === 0) return;

  const { data: profiles } = await client
    .from("profiles")
    .select("id, full_name, email, role, verification_status, id_document_expiry")
    .in("email", missingEmails);

  for (const profile of profiles || []) {
    profilesById.set(String(profile.id), profile);
  }
}

function getProfileByEmail(profilesById: Map<string, any>, email: unknown) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  return Array.from(profilesById.values()).find((profile: any) => (
    String(profile?.email || "").trim().toLowerCase() === normalizedEmail
  )) || null;
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

async function loadTargetNames(
  client: any,
  table: string,
  ids: string[],
) {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
  const names = new Map<string, string>();
  if (uniqueIds.length === 0) return names;

  const { data, error } = await client
    .from(table)
    .select("id, name")
    .in("id", uniqueIds);

  if (error) throw error;

  for (const row of data || []) {
    if (row?.id) names.set(String(row.id), String(row.name || ""));
  }

  return names;
}

async function attachStaffAssignments(client: any, profiles: any[]) {
  const items = Array.isArray(profiles) ? profiles : [];
  const staffIds = items
    .filter((profile) => String(profile?.role || "").trim().toLowerCase() === "staff")
    .map((profile) => String(profile?.id || "").trim())
    .filter(Boolean);

  if (staffIds.length === 0) return items;

  const { data, error } = await client
    .from("staff_listing_access")
    .select("id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level, created_at, updated_at")
    .in("staff_user_id", staffIds)
    .is("revoked_at", null);

  if (error) {
    if (isMissingTableError(error, "staff_listing_access")) return items;
    throw error;
  }

  const assignments = data || [];
  const studioNames = await loadTargetNames(client, "studios", assignments.map((item: any) => item?.studio_id));
  const gigNames = await loadTargetNames(client, "gigs", assignments.map((item: any) => item?.gig_id));
  const productionNames = await loadTargetNames(client, "production_teams", assignments.map((item: any) => item?.production_team_id));

  const assignmentsByUser = new Map<string, any>();
  for (const assignment of assignments) {
    const staffUserId = String(assignment?.staff_user_id || "");
    const entityType = normalizeStaffEntityType(assignment?.entity_type);
    const targetId = getStaffAssignmentTargetId(assignment);
    const targetName =
      entityType === "studio"
        ? studioNames.get(String(targetId || ""))
        : entityType === "venue"
          ? gigNames.get(String(targetId || ""))
          : entityType === "production"
            ? productionNames.get(String(targetId || ""))
            : null;

    const hydratedAssignment = {
      ...assignment,
      target_id: targetId,
      target_name: targetName || null,
    };

    assignmentsByUser.set(staffUserId, hydratedAssignment);
  }

  return items.map((profile) => {
    const assignment = assignmentsByUser.get(String(profile?.id || "")) || null;
    return {
      ...profile,
      staff_assignment: assignment,
      staff_assignment_label: getStaffAssignmentLabel(assignment),
      staff_access_level_label: assignment?.access_level ? `Level ${assignment.access_level}` : null,
    };
  });
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

  const hydratedProfiles = items.map((profile) => ({
    ...profile,
    skills: skillsByProfile.get(String(profile?.id || "")) || [],
    genres: genresByProfile.get(String(profile?.id || "")) || [],
  }));

  return attachStaffAssignments(client, hydratedProfiles);
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

function isMissingTableError(error: any, tableName: string) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const normalizedTable = tableName.toLowerCase();

  return (
    (code === "42P01" && message.includes(normalizedTable)) ||
    (code === "PGRST205" && message.includes(normalizedTable))
  );
}

type StaffEntityType = "studio" | "venue" | "production";
type StaffAccessLevel = 1 | 2 | 3;

type NormalizedStaffAssignment = {
  entity_type: StaffEntityType;
  access_level: StaffAccessLevel;
  studio_id: string | null;
  gig_id: string | null;
  production_team_id: string | null;
};

const staffEntityTypes = new Set(["studio", "venue", "production"]);

function normalizeStaffEntityType(raw: unknown): StaffEntityType | null {
  const entityType = String(raw || "").trim().toLowerCase();
  return staffEntityTypes.has(entityType) ? entityType as StaffEntityType : null;
}

function normalizeStaffAccessLevel(raw: unknown): StaffAccessLevel | null {
  const level = Number(raw);
  return level === 1 || level === 2 || level === 3 ? level as StaffAccessLevel : null;
}

function normalizeStaffAssignment(raw: any): NormalizedStaffAssignment | null {
  if (!raw || typeof raw !== "object") return null;

  const entityType = normalizeStaffEntityType(raw.entity_type || raw.entityType);
  const accessLevel = normalizeStaffAccessLevel(raw.access_level || raw.accessLevel);
  const targetId = String(raw.target_id || raw.targetId || "").trim();

  if (!entityType || !accessLevel) return null;

  const studioId = String(raw.studio_id || raw.studioId || "").trim();
  const gigId = String(raw.gig_id || raw.gigId || "").trim();
  const productionTeamId = String(raw.production_team_id || raw.productionTeamId || "").trim();

  if (entityType === "studio") {
    const id = studioId || targetId;
    return id ? { entity_type: entityType, access_level: accessLevel, studio_id: id, gig_id: null, production_team_id: null } : null;
  }

  if (entityType === "venue") {
    const id = gigId || targetId;
    return id ? { entity_type: entityType, access_level: accessLevel, studio_id: null, gig_id: id, production_team_id: null } : null;
  }

  const id = productionTeamId || targetId;
  return id ? { entity_type: entityType, access_level: accessLevel, studio_id: null, gig_id: null, production_team_id: id } : null;
}

function getStaffAssignmentTargetId(assignment: any): string | null {
  const entityType = normalizeStaffEntityType(assignment?.entity_type);
  if (entityType === "studio") return assignment?.studio_id || null;
  if (entityType === "venue") return assignment?.gig_id || null;
  if (entityType === "production") return assignment?.production_team_id || null;
  return null;
}

function getStaffAssignmentLabel(assignment: any) {
  const entityType = normalizeStaffEntityType(assignment?.entity_type);
  const targetName = String(assignment?.target_name || "").trim();
  const targetId = getStaffAssignmentTargetId(assignment);
  const level = normalizeStaffAccessLevel(assignment?.access_level);

  if (!entityType || !targetId || !level) return null;

  const entityLabel = entityType === "venue" ? "Gig" : entityType === "production" ? "Production" : "Studio";
  return `${entityLabel}: ${targetName || targetId} (Level ${level})`;
}

async function assertStaffAccessTableReady(client: any) {
  const { error } = await client
    .from("staff_listing_access")
    .select("id")
    .limit(1);

  if (!error) return;
  if (isMissingTableError(error, "staff_listing_access")) {
    throw new Error("Staff access migration is not applied yet.");
  }
  throw error;
}

async function validateStaffAssignmentTarget(
  client: any,
  assignment: NormalizedStaffAssignment,
) {
  const target =
    assignment.entity_type === "studio"
      ? { table: "studios", id: assignment.studio_id, label: "studio" }
      : assignment.entity_type === "venue"
        ? { table: "gigs", id: assignment.gig_id, label: "gig" }
        : { table: "production_teams", id: assignment.production_team_id, label: "production team" };

  if (!target.id) {
    throw new Error(`Select a ${target.label} for this staff user.`);
  }

  const { data, error } = await client
    .from(target.table)
    .select("id, name")
    .eq("id", target.id)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error(`The selected ${target.label} no longer exists.`);
  }

  return data;
}

async function revokeStaffAssignments(client: any, staffUserId: string) {
  await assertStaffAccessTableReady(client);

  const { error } = await client
    .from("staff_listing_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("staff_user_id", staffUserId)
    .is("revoked_at", null);

  if (error) throw error;
}

async function replaceStaffAssignment(
  client: any,
  staffUserId: string,
  assignment: NormalizedStaffAssignment,
  actorId: string,
) {
  await assertStaffAccessTableReady(client);
  const target = await validateStaffAssignmentTarget(client, assignment);
  await revokeStaffAssignments(client, staffUserId);

  const { data, error } = await client
    .from("staff_listing_access")
    .insert({
      staff_user_id: staffUserId,
      entity_type: assignment.entity_type,
      studio_id: assignment.studio_id,
      gig_id: assignment.gig_id,
      production_team_id: assignment.production_team_id,
      access_level: assignment.access_level,
      created_by: actorId,
    })
    .select("id, staff_user_id, entity_type, studio_id, gig_id, production_team_id, access_level, created_at, updated_at")
    .maybeSingle();

  if (error) throw error;

  return {
    ...data,
    target_id: getStaffAssignmentTargetId(data),
    target_name: target?.name || null,
  };
}

async function deleteRowsByIds(client: any, table: string, column: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const { error } = await client.from(table).delete().in(column, uniqueIds);
  if (error) throw error;
}

async function nullProfileReference(client: any, table: string, column: string, userId: string) {
  const { error } = await client.from(table).update({ [column]: null }).eq(column, userId);
  if (error) throw error;
}

function isAuthUserNotFoundError(error: any) {
  if (!error) return false;
  const status = Number(error?.status || error?.code || 0);
  const message = String(error?.message || error?.error_description || error || "").toLowerCase();
  return message.includes("user not found") || (status === 404 && message.includes("not found"));
}

async function deleteIdentityClaimsForRemovedUser(client: any, userId: string) {
  const { error: userIdError } = await client
    .from("identity_document_claims")
    .delete()
    .eq("user_id", userId);

  if (userIdError) throw userIdError;

  const { error: originalUserIdError } = await client
    .from("identity_document_claims")
    .delete()
    .eq("original_user_id", userId);

  if (originalUserIdError) throw originalUserIdError;
}

async function cleanupProfileDeleteBlockers(client: any, userId: string) {
  const [
    { data: ownedGroups, error: ownedGroupsError },
    { data: ownedStudios, error: ownedStudiosError },
  ] = await Promise.all([
    client.from("groups").select("id").eq("owner_id", userId),
    client.from("studios").select("id").eq("owner_id", userId),
  ]);

  if (ownedGroupsError) throw ownedGroupsError;
  if (ownedStudiosError) throw ownedStudiosError;

  const ownedGroupIds = (ownedGroups || []).map((item: any) => String(item?.id || "")).filter(Boolean);
  const ownedStudioIds = (ownedStudios || []).map((item: any) => String(item?.id || "")).filter(Boolean);

  await Promise.all([
    deleteRowsByIds(client, "booking_requests", "group_id", ownedGroupIds),
    deleteRowsByIds(client, "booking_requests", "studio_id", ownedStudioIds),
  ]);

  const bookingRequestDeletes = [
    client.from("booking_requests").delete().eq("sender_id", userId),
    client.from("booking_requests").delete().eq("receiver_id", userId),
  ];

  const cleanupUpdates = [
    nullProfileReference(client, "gigs", "permit_reviewed_by", userId),
    nullProfileReference(client, "studios", "permit_reviewed_by", userId),
    nullProfileReference(client, "withdrawal_requests", "processed_by", userId),
  ];

  const results = await Promise.all([
    ...bookingRequestDeletes,
    ...cleanupUpdates,
  ]);
  for (const result of results.slice(0, bookingRequestDeletes.length)) {
    if (result?.error) throw result.error;
  }
}

async function deleteReviewedIdentityAccount(client: any, userId: string) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("Missing userId for account deletion");
  }

  const { data: existingAuth, error: existingAuthError } = await client.auth.admin.getUserById(normalizedUserId);
  const { data: existingProfile, error: existingProfileError } = await client
    .from("profiles")
    .select("id")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (existingAuthError && !isAuthUserNotFoundError(existingAuthError)) {
    throw existingAuthError;
  }

  if (existingProfileError) throw existingProfileError;

  if ((existingAuthError || !existingAuth?.user) && !existingProfile) {
    return {
      deleted: false,
      auth_deleted: false,
      profile_deleted: false,
      already_removed: true,
    };
  }

  await deleteIdentityClaimsForRemovedUser(client, normalizedUserId);

  let profileDeleted = false;
  if (existingProfile) {
    await cleanupProfileDeleteBlockers(client, normalizedUserId);

    const { error: profileDeleteError } = await client
      .from("profiles")
      .delete()
      .eq("id", normalizedUserId);

    if (profileDeleteError) throw profileDeleteError;
    profileDeleted = true;
  }

  let authDeleted = false;
  if (existingAuth?.user) {
    const { error: authDeleteError } = await client.auth.admin.deleteUser(normalizedUserId);
    if (authDeleteError && !isAuthUserNotFoundError(authDeleteError)) throw authDeleteError;
    authDeleted = true;
  }

  return {
    deleted: profileDeleted || authDeleted,
    auth_deleted: authDeleted,
    profile_deleted: profileDeleted,
    already_removed: false,
  };
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
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const redirectPageUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/login-redirect` : "musikalokal://?verified=true";
  return Deno.env.get("EMAIL_CONFIRM_REDIRECT_TO") || redirectPageUrl;
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
        is_verified: false,
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
    : "Identity Verification Declined - MusikaLokal";

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
    title: decision === "APPROVED" ? "Identity Verification Approved!" : "Identity Verification Declined",
    subtitle: decision === "APPROVED"
      ? hasConfirmationStep
        ? "Your account is now ready for the final email confirmation step"
        : "Your account is ready to use"
      : "This unverified account will be removed so you can start fresh",
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
  <p style="margin: 0 0 12px;">Because this account could not pass identity verification, the unverified MusikaLokal account tied to this submission will be removed.</p>
  <ul style="background: #f8fafc; padding: 20px 20px 20px 40px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 24px 0;">
    <li>Use a clear photo of a valid government ID</li>
    <li>Make sure the name and document details are readable</li>
    <li>Create a new account only when you are ready to submit valid verification details</li>
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

function normalizeDiditReviewStatus(rawStatus: unknown) {
  const value = String(rawStatus || "").trim();
  const upperValue = value.replace(/[\s-]+/g, "_").toUpperCase();

  if (upperValue === "PENDING_REVIEW" || upperValue === "IN_REVIEW") return "In Review";
  if (upperValue === "APPROVED") return "Approved";
  if (upperValue === "DECLINED") return "Declined";
  if (upperValue === "RESUBMITTED") return "Resubmitted";
  if (upperValue === "IN_PROGRESS") return "In Progress";
  if (upperValue === "NOT_STARTED") return "Not Started";
  if (upperValue === "ABANDONED") return "Abandoned";
  if (upperValue === "EXPIRED") return "Expired";
  if (upperValue === "KYC_EXPIRED") return "Kyc Expired";

  return value || null;
}

function isDiditBackedReview(review: any) {
  const source = String(review?.source || "").trim().toUpperCase();
  return hasDiditSession(review) && source !== COPYRIGHT_OWNERSHIP_REVIEW_SOURCE;
}

function isDiditPendingReview(review: any) {
  return String(review?.source || "").trim().toUpperCase() === "DIDIT_PENDING";
}

function getDiditSourceReviewStatus(review: any) {
  const metadata = review?.metadata && typeof review.metadata === "object" ? review.metadata : {};
  return normalizeDiditReviewStatus(metadata.didit_status || metadata.source_session_status || null);
}

function shouldSyncDiditManualReviewStatus(review: any) {
  if (!isDiditPendingReview(review)) return false;

  const sourceStatus = getDiditSourceReviewStatus(review);
  if (!sourceStatus) return true;

  return sourceStatus === "In Review" || sourceStatus === "Resubmitted";
}

function getDiditReviewInfo(review: any) {
  if (!isDiditBackedReview(review)) return null;

  const metadata = review?.metadata && typeof review.metadata === "object" ? review.metadata : {};
  const rawStatus = metadata.didit_status || metadata.source_session_status || review.status || "PENDING_REVIEW";

  return {
    status: normalizeDiditReviewStatus(rawStatus) || "In Review",
    session_id: review.didit_session_id || null,
    action_available: shouldSyncDiditManualReviewStatus(review) && Boolean(review.didit_session_id),
    last_synced_at: metadata.didit_status_synced_at || null,
  };
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }

  return null;
}

function firstArrayItem(value: unknown) {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

function firstObject(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === "object") {
      return value[0];
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function normalizeDocumentTypeKey(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return "";
  if (normalized === "passport") return "passport";
  if (["driver_license", "drivers_license", "driving_license", "driver_s_license"].includes(normalized)) return "drivers_license";
  if (["id_card", "identity_card", "national_id", "national_id_card", "government_id"].includes(normalized)) return "national_id";

  return normalized;
}

function formatDocumentTypeLabel(rawType: unknown, fallbackType: unknown) {
  const raw = String(rawType || "").trim();
  const key = normalizeDocumentTypeKey(raw || fallbackType);

  if (key === "passport") return "Passport";
  if (key === "drivers_license") return "Driver's license";
  if (key === "national_id") return "National ID card";

  const label = raw || String(fallbackType || "").trim();
  if (!label) return "";

  return label
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getDiditDocumentInfoFromVerificationData(verificationData: any) {
  if (!verificationData || typeof verificationData !== "object") return null;

  const decision = findDiditDecisionPayload(verificationData);
  const idVerification = firstObject(
    decision?.id_verifications,
    decision?.id_verification,
    decision?.idVerification,
    verificationData?.raw_data,
    verificationData,
  );
  const rawDocumentType = firstNonEmptyString(
    verificationData?.document_type,
    verificationData?.documentType,
    verificationData?.didit_document_type,
    idVerification?.document_type,
    idVerification?.documentType,
    idVerification?.type,
    idVerification?.document?.type,
    idVerification?.document_details?.type,
  );
  const documentTypeKey = normalizeDocumentTypeKey(rawDocumentType);
  const documentType = formatDocumentTypeLabel(rawDocumentType, documentTypeKey);

  if (!rawDocumentType || !documentTypeKey || !documentType) return null;

  return {
    document_type: documentType,
    document_type_key: documentTypeKey,
    didit_document_type: rawDocumentType,
  };
}

function findDiditDecisionPayload(source: any) {
  const candidates = [
    source?.decision,
    source?.verification_data?.decision,
    source?.details?.decision,
    source,
  ];

  return candidates.find((candidate) => (
    candidate &&
    typeof candidate === "object" &&
    (
      Array.isArray(candidate.id_verifications) ||
      Array.isArray(candidate.face_matches) ||
      candidate.id_verification ||
      candidate.face_match ||
      candidate.liveness_check
    )
  )) || source;
}

function extractDiditReviewAssetUrls(sessionDecision: any) {
  const decision = findDiditDecisionPayload(sessionDecision);
  const idVerification = firstObject(
    decision?.id_verifications,
    decision?.id_verification,
    decision?.idVerification,
  );
  const livenessCheck = firstObject(
    decision?.liveness_checks,
    decision?.liveness_check,
    decision?.liveness,
  );
  const faceMatch = firstObject(
    decision?.face_matches,
    decision?.face_match,
    decision?.faceMatch,
  );
  const nfcVerification = firstObject(
    decision?.nfc_verifications,
    decision?.nfc_verification,
    decision?.nfcVerification,
  );

  const frontImageUrl = firstNonEmptyString(
    decision?.full_front_image,
    decision?.full_front_image_url,
    decision?.front_image,
    decision?.front_image_url,
    decision?.front_image_camera_front,
    decision?.front_image_camera_front_url,
    decision?.document_front_image,
    decision?.document_front_image_url,
    decision?.raw_data?.full_front_image,
    decision?.raw_data?.full_front_image_url,
    decision?.raw_data?.front_image,
    decision?.raw_data?.front_image_url,
    decision?.raw_data?.front_image_camera_front,
    decision?.raw_data?.front_image_camera_front_url,
    decision?.verification_data?.raw_data?.full_front_image,
    decision?.verification_data?.raw_data?.full_front_image_url,
    decision?.verification_data?.raw_data?.front_image,
    decision?.verification_data?.raw_data?.front_image_url,
    decision?.verification_data?.raw_data?.front_image_camera_front,
    decision?.verification_data?.raw_data?.front_image_camera_front_url,
    idVerification?.full_front_image,
    idVerification?.full_front_image_url,
    idVerification?.front_image,
    idVerification?.front_image_url,
    idVerification?.front_image_camera_front,
    idVerification?.front_image_camera_front_url,
    idVerification?.document_front_image,
    idVerification?.document_front_image_url,
    idVerification?.images?.front,
    idVerification?.images?.front_image,
    idVerification?.document?.front_image,
  );
  const backImageUrl = firstNonEmptyString(
    decision?.full_back_image,
    decision?.full_back_image_url,
    decision?.back_image,
    decision?.back_image_url,
    decision?.back_image_camera_front,
    decision?.back_image_camera_front_url,
    decision?.document_back_image,
    decision?.document_back_image_url,
    decision?.raw_data?.full_back_image,
    decision?.raw_data?.full_back_image_url,
    decision?.raw_data?.back_image,
    decision?.raw_data?.back_image_url,
    decision?.raw_data?.back_image_camera_front,
    decision?.raw_data?.back_image_camera_front_url,
    decision?.verification_data?.raw_data?.full_back_image,
    decision?.verification_data?.raw_data?.full_back_image_url,
    decision?.verification_data?.raw_data?.back_image,
    decision?.verification_data?.raw_data?.back_image_url,
    decision?.verification_data?.raw_data?.back_image_camera_front,
    decision?.verification_data?.raw_data?.back_image_camera_front_url,
    idVerification?.full_back_image,
    idVerification?.full_back_image_url,
    idVerification?.back_image,
    idVerification?.back_image_url,
    idVerification?.back_image_camera_front,
    idVerification?.back_image_camera_front_url,
    idVerification?.document_back_image,
    idVerification?.document_back_image_url,
    idVerification?.images?.back,
    idVerification?.images?.back_image,
    idVerification?.document?.back_image,
  );
  const selfieImageUrl = firstNonEmptyString(
    decision?.portrait_image,
    decision?.portrait_image_url,
    decision?.selfie_image,
    decision?.selfie_image_url,
    decision?.reference_image,
    decision?.reference_image_url,
    decision?.raw_data?.portrait_image,
    decision?.raw_data?.portrait_image_url,
    decision?.raw_data?.selfie_image,
    decision?.raw_data?.selfie_image_url,
    decision?.raw_data?.reference_image,
    decision?.raw_data?.reference_image_url,
    decision?.verification_data?.raw_data?.portrait_image,
    decision?.verification_data?.raw_data?.portrait_image_url,
    decision?.verification_data?.raw_data?.selfie_image,
    decision?.verification_data?.raw_data?.selfie_image_url,
    decision?.verification_data?.raw_data?.reference_image,
    decision?.verification_data?.raw_data?.reference_image_url,
    livenessCheck?.reference_image,
    livenessCheck?.reference_image_url,
    livenessCheck?.image,
    livenessCheck?.image_url,
    livenessCheck?.selfie_image,
    livenessCheck?.selfie_image_url,
    faceMatch?.source_image,
    faceMatch?.source_image_url,
    faceMatch?.target_image,
    faceMatch?.target_image_url,
    faceMatch?.selfie_image,
    faceMatch?.selfie_image_url,
    nfcVerification?.portrait_image,
    nfcVerification?.portrait_image_url,
    idVerification?.portrait_image,
    idVerification?.portrait_image_url,
  );

  return {
    front_image_url: frontImageUrl,
    back_image_url: backImageUrl,
    selfie_image_url: selfieImageUrl,
    source_status: decision?.status || decision?.source_session_status || sessionDecision?.status || null,
    available: Boolean(frontImageUrl || backImageUrl || selfieImageUrl),
  };
}

async function fetchDiditReviewAssetUrls(sessionId: string) {
  const diditApiKey = Deno.env.get("DIDIT_API_KEY") || "";
  if (!diditApiKey) {
    return {
      front_image_url: null,
      back_image_url: null,
      selfie_image_url: null,
      source_status: null,
      available: false,
      error: "DIDIT_API_KEY is not configured.",
    };
  }

  const endpoint = `https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/decision/`;
  const diditResponse = await fetch(endpoint, {
    method: "GET",
    headers: {
      "x-api-key": diditApiKey,
    },
  });

  const responseText = await diditResponse.text();
  let responsePayload: any = null;
  if (responseText) {
    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      responsePayload = { raw: responseText.slice(0, 500) };
    }
  }

  if (!diditResponse.ok) {
    const diditMessage = String(
      responsePayload?.message ||
        responsePayload?.detail ||
        responsePayload?.error ||
        responsePayload?.raw ||
        "",
    ).trim();

    console.error("didit_manual_review_assets_fetch_failed", {
      sessionId,
      status: diditResponse.status,
      endpoint,
      message: diditMessage || null,
    });

    return {
      front_image_url: null,
      back_image_url: null,
      selfie_image_url: null,
      source_status: null,
      available: false,
      error: diditMessage || `Didit asset fetch failed with HTTP ${diditResponse.status}.`,
    };
  }

  return { ...extractDiditReviewAssetUrls(responsePayload), error: null };
}

function mergeDiditReviewAssets(primary: any, fallback: any) {
  return {
    front_image_url: primary?.front_image_url || fallback?.front_image_url || null,
    back_image_url: primary?.back_image_url || fallback?.back_image_url || null,
    selfie_image_url: primary?.selfie_image_url || fallback?.selfie_image_url || null,
    source_status: primary?.source_status || fallback?.source_status || null,
    available: Boolean(
      primary?.front_image_url ||
        primary?.back_image_url ||
        primary?.selfie_image_url ||
        fallback?.front_image_url ||
        fallback?.back_image_url ||
        fallback?.selfie_image_url
    ),
    error: primary?.error || fallback?.error || null,
  };
}

async function fetchDiditSessionAssetBundle(client: any, sessionId: string) {
  const diditSessionId = String(sessionId || "").trim();

  if (!diditSessionId) {
    return {
      session_id: null,
      front_image_url: null,
      back_image_url: null,
      selfie_image_url: null,
      didit_review: {
        session_id: null,
        status: null,
        assets_available: false,
        assets_error: "Missing Didit session ID.",
      },
    };
  }

  const { data: storedSession } = await client
    .from("verification_sessions")
    .select("status, verification_data")
    .eq("session_ref", diditSessionId)
    .maybeSingle();

  const storedAssets = extractDiditReviewAssetUrls(storedSession?.verification_data || {});
  const liveAssets = await fetchDiditReviewAssetUrls(diditSessionId);
  const diditAssets = mergeDiditReviewAssets(liveAssets, storedAssets);

  return {
    session_id: diditSessionId,
    front_image_url: diditAssets.front_image_url || null,
    back_image_url: diditAssets.back_image_url || null,
    selfie_image_url: diditAssets.selfie_image_url || null,
    didit_review: {
      session_id: diditSessionId,
      status: normalizeDiditReviewStatus(diditAssets.source_status || storedSession?.status) || "In Review",
      assets_available: Boolean(diditAssets.available),
      assets_error: diditAssets.error || null,
    },
  };
}

function isPendingDiditStatus(rawStatus: unknown) {
  const value = String(rawStatus || "").trim().replace(/[\s-]+/g, "_").toUpperCase();
  return value === "PENDING_REVIEW" || value === "IN_REVIEW";
}

async function queueMissingDiditPendingReviews(client: any) {
  const { data: pendingProfiles, error: profilesError } = await client
    .from("profiles")
    .select("id, email, role, verification_status, didit_session_id, created_at")
    .eq("verification_status", "PENDING_REVIEW")
    .not("didit_session_id", "is", null)
    .limit(300);

  if (profilesError) {
    throw new Error(`Unable to load pending Didit profiles: ${profilesError.message}`);
  }

  const profiles = (pendingProfiles || []).filter((profile: any) => {
    return String(profile?.id || "").trim() && String(profile?.didit_session_id || "").trim();
  });

  if (profiles.length === 0) {
    return { created: 0, checked: 0 };
  }

  const profileIds = profiles.map((profile: any) => String(profile.id));
  const sessionIds = Array.from(new Set(profiles.map((profile: any) => String(profile.didit_session_id || "").trim()).filter(Boolean)));

  const [{ data: existingReviews, error: reviewsError }, { data: sessions, error: sessionsError }] = await Promise.all([
    client
      .from("manual_identity_reviews")
      .select("id, user_id, didit_session_id, source, status")
      .in("user_id", profileIds)
      .eq("status", "PENDING_REVIEW"),
    client
      .from("verification_sessions")
      .select("session_ref, status, verification_data, created_at")
      .in("session_ref", sessionIds),
  ]);

  if (reviewsError) {
    throw new Error(`Unable to load pending Didit identity reviews: ${reviewsError.message}`);
  }

  if (sessionsError) {
    throw new Error(`Unable to load pending Didit verification sessions: ${sessionsError.message}`);
  }

  const existingByUser = new Set((existingReviews || []).map((review: any) => String(review.user_id || "")));
  const sessionByRef = new Map<string, any>(
    (sessions || []).map((session: any) => [String(session.session_ref || ""), session]),
  );
  let created = 0;

  for (const profile of profiles) {
    const userId = String(profile.id || "");
    const diditSessionId = String(profile.didit_session_id || "").trim();
    if (!userId || !diditSessionId || existingByUser.has(userId)) continue;

    const session = sessionByRef.get(diditSessionId);
    if (session && !isPendingDiditStatus(session.status)) continue;

    const verificationData = session?.verification_data && typeof session.verification_data === "object"
      ? session.verification_data
      : {};
    const identityNameBirthDate = prepareIdentityNameBirthDateDuplicateInput(verificationData.raw_data || verificationData, {
      fullLegalName: verificationData.verified_full_legal_name || verificationData.full_legal_name || verificationData.full_name,
      normalizedFullLegalName: verificationData.normalized_full_legal_name,
      birthDate: verificationData.birth_date || verificationData.date_of_birth,
    });

    const queued = await queueIdentityReview(client, {
      userId,
      email: profile.email || verificationData.email || "",
      role: profile.role || verificationData.role || "musician",
      documentType: verificationData.document_type || verificationData.documentType || "Government ID",
      documentTypeKey: verificationData.document_type_key || verificationData.documentTypeKey || null,
      documentCountry: verificationData.document_country || verificationData.issuing_country || verificationData.country || "PHL",
      source: "DIDIT_PENDING",
      diditSessionId,
      documentFingerprint: verificationData.document_fingerprint || null,
      verifiedFullLegalName: identityNameBirthDate.fullLegalName,
      normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
      birthDate: identityNameBirthDate.birthDate,
      reviewReason: verificationData.review_reason || null,
      matchedOn: verificationData.matched_on || null,
      metadata: {
        didit_status: normalizeDiditReviewStatus(session?.status || profile.verification_status || "PENDING_REVIEW"),
        source_session_status: session?.status || profile.verification_status || "PENDING_REVIEW",
        verification_session_user_ref: verificationData.user_ref || null,
        review_started_at: verificationData.review_started_at || session?.created_at || profile.created_at || null,
        hydrated_from_pending_profile: true,
      },
    });

    if (queued?.id) {
      created += 1;
      existingByUser.add(userId);
    }
  }

  return { created, checked: profiles.length };
}

function mapDiditManualDecision(decision: string) {
  return decision === "APPROVED" ? "Approved" : "Declined";
}

async function updateDiditManualReviewStatus(
  sessionId: string,
  decision: "APPROVED" | "DECLINED",
  reviewNotes: string | null,
) {
  const diditApiKey = Deno.env.get("DIDIT_API_KEY") || "";
  if (!diditApiKey) {
    throw new Error("DIDIT_API_KEY is not configured, so this Didit review cannot be updated from MusikaLokal.");
  }

  const nextStatus = mapDiditManualDecision(decision);
  const diditResponse = await fetch(
    `https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/update-status/`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": diditApiKey,
      },
      body: JSON.stringify({
        new_status: nextStatus,
        comment: reviewNotes || `MusikaLokal admin marked this identity review as ${nextStatus}.`,
        send_email: false,
      }),
    },
  );

  const responseText = await diditResponse.text();
  let responsePayload: any = null;
  if (responseText) {
    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      responsePayload = { raw: responseText.slice(0, 500) };
    }
  }

  if (!diditResponse.ok) {
    const diditMessage = String(
      responsePayload?.message ||
        responsePayload?.detail ||
        responsePayload?.error ||
        responsePayload?.raw ||
        "",
    ).trim();

    console.error("didit_manual_review_status_update_failed", {
      sessionId,
      status: diditResponse.status,
      message: diditMessage || null,
    });

    throw new Error(
      diditMessage
        ? `Didit status update failed: ${diditMessage}`
        : `Didit status update failed with HTTP ${diditResponse.status}.`,
    );
  }

  return {
    synced: true,
    session_id: responsePayload?.session_id || sessionId,
    session_kind: responsePayload?.session_kind || null,
    status: nextStatus,
    synced_at: new Date().toISOString(),
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
        .or(`verification_status.is.null,verification_status.not.in.(${hiddenUserManagementVerificationStatuses.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const items = await attachProfileLists(client, data || []);

      return jsonResponse({ items });
    }

    if (action === "fetch_manual_identity_reviews") {
      const limit = Math.max(1, Math.min(300, Number(body?.limit || 100)));
      const requestedStatus = String(body?.status || "PENDING_REVIEW").trim().toUpperCase();
      let diditQueueHydration = { created: 0, checked: 0 };

      if (!requestedStatus || requestedStatus === "ALL" || requestedStatus === "PENDING_REVIEW") {
        diditQueueHydration = await queueMissingDiditPendingReviews(client);
      }

      let reviewQuery = client
        .from("manual_identity_reviews")
        .select(
          "id, user_id, submitted_by_email, submitted_role, document_type, document_type_key, document_country, source, status, didit_session_id, document_fingerprint, verified_full_legal_name, normalized_full_legal_name, birth_date, review_reason, matched_on, duplicate_reason, duplicate_match_count, metadata, front_image_path, back_image_path, selfie_image_path, music_video_path, music_video_original_name, music_video_mime_type, music_video_size_bytes, music_video_uploaded_at, review_notes, reviewed_by, reviewed_at, expected_decision_by, created_at, updated_at",
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
      const diditSessionIds = Array.from(new Set((reviews || []).map((item: any) => String(item.didit_session_id || "").trim()).filter(Boolean)));
      let profilesById = new Map<string, any>();
      let verificationSessionsByRef = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: linkedProfiles, error: linkedProfilesError } = await client
          .from("profiles")
          .select("id, full_name, email, role, verification_status, id_document_expiry")
          .in("id", userIds);

        if (!linkedProfilesError && linkedProfiles) {
          profilesById = new Map<string, any>(linkedProfiles.map((item: any) => [String(item.id), item]));
        }
      }

      if (diditSessionIds.length > 0) {
        const { data: linkedSessions, error: linkedSessionsError } = await client
          .from("verification_sessions")
          .select("session_ref, verification_data")
          .in("session_ref", diditSessionIds);

        if (!linkedSessionsError && linkedSessions) {
          verificationSessionsByRef = new Map<string, any>(linkedSessions.map((item: any) => [String(item.session_ref), item]));
        }
      }

      const metadataMatchUserIds = Array.from(new Set<string>(
        (reviews || [])
          .flatMap((review: any) => getReviewMetadataIdentityMatches(review, review?.matched_on || "DOCUMENT_FINGERPRINT"))
          .map((match: any) => String(match.user_id || "").trim())
          .filter(Boolean),
      ));
      const metadataMatchEmails = Array.from(new Set<string>(
        (reviews || [])
          .flatMap((review: any) => getReviewMetadataIdentityMatches(review, review?.matched_on || "DOCUMENT_FINGERPRINT"))
          .map((match: any) => String(match.email || "").trim().toLowerCase())
          .filter(Boolean),
      ));
      const missingMetadataProfileIds = metadataMatchUserIds.filter((id) => !profilesById.has(id));

      await hydrateProfilesById(client, profilesById, missingMetadataProfileIds);
      await hydrateProfilesByEmail(client, profilesById, metadataMatchEmails);

      const reviewFingerprints = Array.from(new Set(
        (reviews || [])
          .map((item: any) => String(item.document_fingerprint || "").trim())
          .filter(Boolean),
      ));
      const reviewRoles = Array.from(new Set(
        (reviews || [])
          .map((item: any) => {
            const profile = profilesById.get(String(item.user_id));
            return String(item.submitted_role || profile?.role || "").trim().toLowerCase();
          })
          .filter(Boolean),
      ));
      let approvedClaimsByFingerprintRole = new Map<string, any[]>();

      if (reviewFingerprints.length > 0 && reviewRoles.length > 0) {
        const { data: approvedClaims, error: approvedClaimsError } = await client
          .from("identity_document_claims")
          .select("id, user_id, original_user_id, normalized_email, role, source, status, created_at, document_fingerprint, verified_full_legal_name, normalized_full_legal_name, birth_date, didit_session_id, manual_review_id, profiles:user_id(id, full_name, email, role)")
          .in("document_fingerprint", reviewFingerprints)
          .in("role", reviewRoles)
          .in("status", ["APPROVED", "PENDING_REVIEW"]);

        if (approvedClaimsError) {
          return jsonResponse({ error: approvedClaimsError.message }, 400);
        }

        await hydrateProfilesById(client, profilesById, (approvedClaims || []).map((claim: any) => claim.user_id));

        approvedClaimsByFingerprintRole = new Map<string, any[]>();
        for (const claim of approvedClaims || []) {
          const key = `${String(claim.document_fingerprint || "")}:${String(claim.role || "").trim().toLowerCase()}`;
          const existing = approvedClaimsByFingerprintRole.get(key) || [];
          existing.push(claim);
          approvedClaimsByFingerprintRole.set(key, existing);
        }
      }

      const reviewNameBirthInputs = (reviews || [])
        .map((review: any) => {
          const profile = profilesById.get(String(review.user_id));
          const role = String(review.submitted_role || profile?.role || "").trim().toLowerCase();
          const input = prepareIdentityNameBirthDateDuplicateInput(null, {
            fullLegalName: review.verified_full_legal_name,
            normalizedFullLegalName: review.normalized_full_legal_name,
            birthDate: review.birth_date,
          });
          return {
            role,
            normalizedFullLegalName: input.normalizedFullLegalName,
            birthDate: input.birthDate,
          };
        })
        .filter((item: any) => item.role && item.normalizedFullLegalName && item.birthDate);
      const reviewNormalizedNames = Array.from(new Set(reviewNameBirthInputs.map((item: any) => item.normalizedFullLegalName)));
      const reviewBirthDates = Array.from(new Set(reviewNameBirthInputs.map((item: any) => item.birthDate)));
      let approvedClaimsByNameBirthRole = new Map<string, any[]>();

      if (reviewRoles.length > 0 && reviewNormalizedNames.length > 0 && reviewBirthDates.length > 0) {
        const { data: approvedNameBirthClaims, error: approvedNameBirthClaimsError } = await client
          .from("identity_document_claims")
          .select("id, user_id, original_user_id, normalized_email, role, source, status, created_at, verified_full_legal_name, normalized_full_legal_name, birth_date, didit_session_id, manual_review_id, profiles:user_id(id, full_name, email, role)")
          .in("role", reviewRoles)
          .in("normalized_full_legal_name", reviewNormalizedNames)
          .in("birth_date", reviewBirthDates)
          .eq("status", "APPROVED");

        if (approvedNameBirthClaimsError) {
          return jsonResponse({ error: approvedNameBirthClaimsError.message }, 400);
        }

        await hydrateProfilesById(client, profilesById, (approvedNameBirthClaims || []).map((claim: any) => claim.user_id));

        approvedClaimsByNameBirthRole = new Map<string, any[]>();
        for (const claim of approvedNameBirthClaims || []) {
          const key = [
            String(claim.role || "").trim().toLowerCase(),
            String(claim.normalized_full_legal_name || "").trim(),
            normalizeDateOnly(claim.birth_date) || "",
          ].join(":");
          const existing = approvedClaimsByNameBirthRole.get(key) || [];
          existing.push(claim);
          approvedClaimsByNameBirthRole.set(key, existing);
        }
      }

      const items = await Promise.all((reviews || []).map(async (review: any) => {
        const profile = profilesById.get(String(review.user_id)) || null;
        const reviewEmail = String(profile?.email || review.submitted_by_email || "").trim().toLowerCase();
        const reviewRole = String(review.submitted_role || profile?.role || "").trim().toLowerCase();
        const duplicateWarningKey = `${String(review.document_fingerprint || "").trim()}:${reviewRole}`;
        const duplicateMatches = (approvedClaimsByFingerprintRole.get(duplicateWarningKey) || [])
          .filter((claim: any) => {
            const linkedProfile = getClaimProfile(claim, profilesById);
            const matchUserId = String(claim.user_id || "").trim();
            const matchEmail = String(linkedProfile?.email || "").trim().toLowerCase();
            return matchUserId &&
              linkedProfile &&
              matchUserId !== String(review.user_id) &&
              (!reviewEmail || !matchEmail || matchEmail !== reviewEmail);
          })
          .map((claim: any) => ({
            claim_id: claim.id || null,
            didit_session_id: claim.didit_session_id || null,
            manual_review_id: claim.manual_review_id || null,
            user_id: claim.user_id || null,
            original_user_id: claim.original_user_id || null,
            email: getClaimProfile(claim, profilesById)?.email || null,
            full_name: getClaimProfile(claim, profilesById)?.full_name || null,
            role: getClaimProfile(claim, profilesById)?.role || claim.role,
            source: claim.source,
            claim_status: claim.status,
            verified_at: claim.created_at,
            birth_date: normalizeDateOnly(claim.birth_date),
            matched_on: "DOCUMENT_FINGERPRINT",
            match_type: "DOCUMENT_FINGERPRINT",
            match_label: getIdentityMatchLabel("DOCUMENT_FINGERPRINT"),
          }));
        const reviewNameBirth = prepareIdentityNameBirthDateDuplicateInput(null, {
          fullLegalName: review.verified_full_legal_name,
          normalizedFullLegalName: review.normalized_full_legal_name,
          birthDate: review.birth_date,
        });
        const nameBirthWarningKey = [
          reviewRole,
          String(reviewNameBirth.normalizedFullLegalName || "").trim(),
          String(reviewNameBirth.birthDate || "").trim(),
        ].join(":");
        const nameBirthMatches = reviewNameBirth.hasNameBirthDate
          ? (approvedClaimsByNameBirthRole.get(nameBirthWarningKey) || [])
            .filter((claim: any) => {
              const linkedProfile = getClaimProfile(claim, profilesById);
              const matchUserId = String(claim.user_id || "").trim();
              const matchEmail = String(linkedProfile?.email || "").trim().toLowerCase();
              return matchUserId &&
                linkedProfile &&
                matchUserId !== String(review.user_id) &&
                (!reviewEmail || !matchEmail || matchEmail !== reviewEmail);
            })
            .map((claim: any) => ({
              claim_id: claim.id || null,
              didit_session_id: claim.didit_session_id || null,
              manual_review_id: claim.manual_review_id || null,
              user_id: claim.user_id || null,
              original_user_id: claim.original_user_id || null,
              email: getClaimProfile(claim, profilesById)?.email || null,
              full_name: getClaimProfile(claim, profilesById)?.full_name || null,
              role: getClaimProfile(claim, profilesById)?.role || claim.role,
              source: claim.source,
              claim_status: claim.status,
              verified_at: claim.created_at,
              birth_date: normalizeDateOnly(claim.birth_date),
              matched_on: "NAME_BIRTHDATE",
              match_type: "NAME_BIRTHDATE",
              match_label: getIdentityMatchLabel("NAME_BIRTHDATE"),
            }))
          : [];
        const reviewMetadata = getReviewMetadataObject(review);
        const fallbackMatchedOn = review.matched_on || reviewMetadata?.matched_on || reviewMetadata?.approval_claim_result?.matched_on || "DOCUMENT_FINGERPRINT";
        const rawMetadataMatches = getReviewMetadataIdentityMatches(review, fallbackMatchedOn);
        const metadataMatches = rawMetadataMatches
          .map((match: any) => {
            const matchUserId = String(match.user_id || "").trim();
            const linkedProfile = matchUserId ? profilesById.get(matchUserId) : getProfileByEmail(profilesById, match.email);
            return linkedProfile
              ? {
                  ...match,
                  user_id: linkedProfile.id,
                  email: linkedProfile.email || null,
                  full_name: linkedProfile.full_name || null,
                  role: linkedProfile.role || match.role || null,
                }
              : null;
          })
          .filter((match: any) => {
            if (!match) return false;
            const matchUserId = String(match.user_id || "").trim();
            const matchEmail = String(match.email || "").trim().toLowerCase();
            return matchUserId &&
              matchUserId !== String(review.user_id) &&
              (!reviewEmail || !matchEmail || matchEmail !== reviewEmail);
          });
        const allIdentityMatches = [
          ...duplicateMatches,
          ...nameBirthMatches.filter((nameMatch: any) => !duplicateMatches.some((docMatch: any) => (
            String(docMatch.user_id || "") === String(nameMatch.user_id || "")
          ))),
          ...metadataMatches.filter((metadataMatch: any) => ![...duplicateMatches, ...nameBirthMatches].some((match: any) => (
            String(match.user_id || match.email || "") === String(metadataMatch.user_id || metadataMatch.email || "") &&
            String(match.matched_on || match.match_type || "") === String(metadataMatch.matched_on || metadataMatch.match_type || "")
          ))),
        ];
        const matchTypes = Array.from(new Set(allIdentityMatches.map((match: any) => String(match.matched_on || match.match_type || "").trim()).filter(Boolean)));
        const identityMatchWarning = allIdentityMatches.length > 0
          ? {
              same_role: true,
              match_count: allIdentityMatches.length,
              match_types: matchTypes.length > 0 ? matchTypes : [normalizeIdentityMatchType(fallbackMatchedOn)],
              has_document_match: duplicateMatches.length > 0,
              has_name_birthdate_match: nameBirthMatches.length > 0,
              review_reason: review.review_reason || reviewMetadata?.review_reason || review.duplicate_reason || null,
              matched_on: review.matched_on || reviewMetadata?.matched_on || matchTypes[0] || normalizeIdentityMatchType(fallbackMatchedOn),
              matched_accounts: allIdentityMatches.slice(0, 5),
              stale_matched_accounts: [],
            }
          : null;

        const diditSession = verificationSessionsByRef.get(String(review.didit_session_id || ""));
        const diditDocumentInfo = getDiditDocumentInfoFromVerificationData(diditSession?.verification_data);
        const displayReview = diditDocumentInfo
          ? {
              ...review,
              document_type: diditDocumentInfo.document_type,
              document_type_key: diditDocumentInfo.document_type_key || review.document_type_key,
              metadata: {
                ...reviewMetadata,
                selected_document_type: reviewMetadata.selected_document_type || review.document_type || null,
                selected_document_type_key: reviewMetadata.selected_document_type_key || review.document_type_key || null,
                didit_document_type: reviewMetadata.didit_document_type || diditDocumentInfo.didit_document_type,
                didit_document_type_key: reviewMetadata.didit_document_type_key || diditDocumentInfo.document_type_key,
              },
            }
          : review;

        const item = {
          ...displayReview,
          profile,
          didit_review: getDiditReviewInfo(displayReview),
          duplicate_verified_identity_warning: duplicateMatches.length > 0
            ? {
                same_verified_id_fingerprint: true,
                same_role: true,
                different_email_or_account: true,
                match_count: duplicateMatches.length,
                matched_accounts: duplicateMatches.slice(0, 5),
              }
            : null,
          identity_match_warning: identityMatchWarning,
          front_image_url: null,
          back_image_url: null,
          selfie_image_url: null,
          music_video_url: null,
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

        if (review.music_video_path) {
          const { data: signed } = await client.storage
            .from(MUSICIAN_VIDEO_BUCKET)
            .createSignedUrl(String(review.music_video_path), 60 * 30);
          item.music_video_url = signed?.signedUrl || null;
        }

        return item;
      }));

      return jsonResponse({ items, didit_queue_hydration: diditQueueHydration });
    }

    if (action === "fetch_manual_identity_review_assets") {
      const reviewId = String(body?.reviewId || "").trim();

      if (!reviewId) {
        return jsonResponse({ error: "Missing reviewId" }, 400);
      }

      const { data: review, error: reviewError } = await client
        .from("manual_identity_reviews")
        .select("id, source, status, didit_session_id, metadata, front_image_path, back_image_path, selfie_image_path, music_video_path")
        .eq("id", reviewId)
        .maybeSingle();

      if (reviewError) {
        return jsonResponse({ error: reviewError.message }, 400);
      }

      if (!review) {
        return jsonResponse({ error: "Identity review not found." }, 404);
      }

      const item = {
        id: review.id,
        didit_review: getDiditReviewInfo(review),
        front_image_url: null,
        back_image_url: null,
        selfie_image_url: null,
        music_video_url: null,
      } as Record<string, any>;

      if (isDiditBackedReview(review)) {
        const diditSessionId = String(review.didit_session_id || "").trim();
        const diditAssets = await fetchDiditSessionAssetBundle(client, diditSessionId);
        item.didit_review = {
          ...(item.didit_review || {}),
          ...(diditAssets.didit_review || {}),
          status: diditAssets.didit_review?.status || item.didit_review?.status || "In Review",
        };
        item.front_image_url = diditAssets.front_image_url || null;
        item.back_image_url = diditAssets.back_image_url || null;
        item.selfie_image_url = diditAssets.selfie_image_url || null;
      } else {
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
      }

      if (review.music_video_path) {
        const { data: signed } = await client.storage
          .from(MUSICIAN_VIDEO_BUCKET)
          .createSignedUrl(String(review.music_video_path), 60 * 30);
        item.music_video_url = signed?.signedUrl || null;
      }

      return jsonResponse({ item });
    }

    if (action === "fetch_identity_match_assets") {
      const claimId = String(body?.claimId || body?.claim_id || "").trim();
      let diditSessionId = String(body?.diditSessionId || body?.didit_session_id || "").trim();
      let manualReviewId = String(body?.manualReviewId || body?.manual_review_id || "").trim();
      let claim: any = null;

      if (claimId) {
        const { data: claimData, error: claimError } = await client
          .from("identity_document_claims")
          .select("id, didit_session_id, manual_review_id, source, status")
          .eq("id", claimId)
          .maybeSingle();

        if (claimError) {
          return jsonResponse({ error: claimError.message }, 400);
        }

        claim = claimData || null;
        diditSessionId = diditSessionId || String(claim?.didit_session_id || "").trim();
        manualReviewId = manualReviewId || String(claim?.manual_review_id || "").trim();
      }

      if (claimId && !claim && !diditSessionId && !manualReviewId) {
        return jsonResponse({ error: "Identity claim not found." }, 404);
      }

      const item = {
        claim_id: claim?.id || claimId || null,
        didit_session_id: diditSessionId || null,
        manual_review_id: manualReviewId || null,
        front_image_url: null,
        back_image_url: null,
        selfie_image_url: null,
        music_video_url: null,
        didit_review: null,
      } as Record<string, any>;

      if (diditSessionId) {
        const diditAssets = await fetchDiditSessionAssetBundle(client, diditSessionId);
        return jsonResponse({
          item: {
            ...item,
            didit_session_id: diditAssets.session_id || diditSessionId,
            front_image_url: diditAssets.front_image_url || null,
            back_image_url: diditAssets.back_image_url || null,
            selfie_image_url: diditAssets.selfie_image_url || null,
            didit_review: diditAssets.didit_review || null,
          },
        });
      }

      if (manualReviewId) {
        const { data: review, error: reviewError } = await client
          .from("manual_identity_reviews")
          .select("id, source, status, didit_session_id, metadata, front_image_path, back_image_path, selfie_image_path, music_video_path")
          .eq("id", manualReviewId)
          .maybeSingle();

        if (reviewError) {
          return jsonResponse({ error: reviewError.message }, 400);
        }

        if (!review) {
          return jsonResponse({ error: "Linked identity review not found." }, 404);
        }

        item.manual_review_id = review.id;
        item.didit_session_id = review.didit_session_id || null;

        if (isDiditBackedReview(review)) {
          const diditAssets = await fetchDiditSessionAssetBundle(client, String(review.didit_session_id || "").trim());
          return jsonResponse({
            item: {
              ...item,
              didit_session_id: diditAssets.session_id || review.didit_session_id || null,
              front_image_url: diditAssets.front_image_url || null,
              back_image_url: diditAssets.back_image_url || null,
              selfie_image_url: diditAssets.selfie_image_url || null,
              didit_review: diditAssets.didit_review || null,
            },
          });
        }

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

        if (review.music_video_path) {
          const { data: signed } = await client.storage
            .from(MUSICIAN_VIDEO_BUCKET)
            .createSignedUrl(String(review.music_video_path), 60 * 30);
          item.music_video_url = signed?.signedUrl || null;
        }

        return jsonResponse({ item });
      }

      return jsonResponse({ error: "No Didit session or linked review was found for this matched account." }, 404);
    }

    if (action === "review_manual_identity") {
      const reviewId = String(body?.reviewId || "").trim();
      const decision = String(body?.decision || "").trim().toUpperCase();
      const reviewNotesRaw = String(body?.reviewNotes || "").trim();
      const reviewNotes = reviewNotesRaw ? reviewNotesRaw : null;
      const duplicateOverrideConfirmed = Boolean(body?.duplicateOverrideConfirmed);

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

      if (isCopyrightOwnershipReview(review)) {
        const nowIso = new Date().toISOString();
        const existingReviewMetadata = getReviewMetadataObject(review);
        const nextReviewMetadata = {
          ...existingReviewMetadata,
          copyright_ownership_decision: decision,
          copyright_ownership_reviewed_by: actorId,
          copyright_ownership_reviewed_at: nowIso,
        };
        const trackLabel = getCopyrightOwnershipTrackLabel(review);

        const { data: updatedReview, error: updateReviewError } = await client
          .from("manual_identity_reviews")
          .update({
            status: decision,
            review_notes: reviewNotes,
            reviewed_by: actorId,
            reviewed_at: nowIso,
            metadata: nextReviewMetadata,
            updated_at: nowIso,
          })
          .eq("id", reviewId)
          .select("*")
          .maybeSingle();

        if (updateReviewError) {
          return jsonResponse({ error: updateReviewError.message }, 400);
        }

        const nextPlaylistItemCopyrightStatus = decision === "APPROVED" ? "approved" : "declined";
        const { error: updatePlaylistItemsError } = await client
          .from("playlist_items")
          .update({
            copyright_status: nextPlaylistItemCopyrightStatus,
          })
          .eq("copyright_review_id", reviewId);

        if (updatePlaylistItemsError) {
          return jsonResponse({ error: updatePlaylistItemsError.message }, 400);
        }

        await client.from("notifications").insert({
          user_id: review.user_id,
          type: decision === "APPROVED" ? "success" : "warning",
          title: decision === "APPROVED" ? "Track Ownership Approved" : "Track Ownership Declined",
          message: decision === "APPROVED"
            ? `Your ownership review for ${trackLabel} was approved. The track is now available in your playlist.`
            : `Your ownership review for ${trackLabel} was declined.`,
          meta: {
            manual_identity_review_id: reviewId,
            source: COPYRIGHT_OWNERSHIP_REVIEW_SOURCE,
            decision,
            review_notes: reviewNotes,
            copyright_track_key: existingReviewMetadata.copyright_track_key || null,
          },
        });

        return jsonResponse({
          item: {
            ...(updatedReview || review),
            copyright_ownership_review: true,
            decision_email_sent: false,
            decision_email_queued: false,
            decision_email_provider: "none",
            decision_email_error: null,
            declined_account_delete_attempted: false,
            declined_account_deleted: false,
            playlist_item_copyright_status: nextPlaylistItemCopyrightStatus,
          },
        });
      }

      const { data: preDecisionProfile } = await client
        .from("profiles")
        .select("role, email")
        .eq("id", review.user_id)
        .maybeSingle();

      const reviewRoleForClaim = String(review.submitted_role || preDecisionProfile?.role || "musician").trim().toLowerCase();
      let duplicateMatchesForApproval: any[] = [];
      const documentFingerprintForDecision = String(review.document_fingerprint || "").trim() || null;
      const reviewSourceForDecision = String(review.source || "").trim().toUpperCase();
      const isMusicianVideoOnlyReview = reviewSourceForDecision === MUSICIAN_VIDEO_REVIEW_SOURCE;
      const isMusicianSignupReview = reviewRoleForClaim === "musician" || Boolean(review.music_video_path) || isMusicianVideoOnlyReview;

      if (decision === "APPROVED") {
        if (isMusicianSignupReview && !review.music_video_path) {
          return jsonResponse({
            error: "Musician signup cannot be approved without a music video proof upload.",
          }, 400);
        }

        if (isMusicianVideoOnlyReview) {
          const { data: approvedIdentityClaim, error: approvedIdentityClaimError } = await client
            .from("identity_document_claims")
            .select("id")
            .eq("user_id", review.user_id)
            .eq("role", reviewRoleForClaim)
            .eq("status", "APPROVED")
            .limit(1)
            .maybeSingle();

          if (approvedIdentityClaimError) {
            return jsonResponse({ error: approvedIdentityClaimError.message }, 400);
          }

          if (!approvedIdentityClaim?.id) {
            return jsonResponse({
              error: "Identity must be approved before approving this musician video proof.",
            }, 400);
          }
        }

        const reviewEmail = String(preDecisionProfile?.email || review.submitted_by_email || "").trim().toLowerCase();
        const approvalProfilesById = new Map<string, any>();
        if (!isMusicianVideoOnlyReview && documentFingerprintForDecision) {
          const { data: duplicateClaims, error: duplicateClaimsError } = await client
            .from("identity_document_claims")
            .select("id, user_id, normalized_email, profiles:user_id(id, email, role)")
            .eq("document_fingerprint", documentFingerprintForDecision)
            .eq("role", reviewRoleForClaim)
            .eq("status", "APPROVED");

          if (duplicateClaimsError) {
            return jsonResponse({ error: duplicateClaimsError.message }, 400);
          }

          await hydrateProfilesById(client, approvalProfilesById, (duplicateClaims || []).map((claim: any) => claim.user_id));

          duplicateMatchesForApproval.push(
            ...(duplicateClaims || [])
              .filter((claim: any) => {
                const linkedProfile = getClaimProfile(claim, approvalProfilesById);
                const matchUserId = String(claim.user_id || "").trim();
                const matchEmail = String(linkedProfile?.email || "").trim().toLowerCase();
                return matchUserId &&
                  linkedProfile &&
                  matchUserId !== String(review.user_id) &&
                  (!reviewEmail || !matchEmail || matchEmail !== reviewEmail);
              })
              .map((claim: any) => ({ ...claim, matched_on: "DOCUMENT_FINGERPRINT" })),
          );
        }

        const reviewNameBirth = prepareIdentityNameBirthDateDuplicateInput(null, {
          fullLegalName: review.verified_full_legal_name,
          normalizedFullLegalName: review.normalized_full_legal_name,
          birthDate: review.birth_date,
        });
        if (!isMusicianVideoOnlyReview && reviewNameBirth.hasNameBirthDate) {
          const { data: nameBirthClaims, error: nameBirthClaimsError } = await client
            .from("identity_document_claims")
            .select("id, user_id, normalized_email, profiles:user_id(id, email, role)")
            .eq("normalized_full_legal_name", reviewNameBirth.normalizedFullLegalName)
            .eq("birth_date", reviewNameBirth.birthDate)
            .eq("role", reviewRoleForClaim)
            .eq("status", "APPROVED");

          if (nameBirthClaimsError) {
            return jsonResponse({ error: nameBirthClaimsError.message }, 400);
          }

          await hydrateProfilesById(client, approvalProfilesById, (nameBirthClaims || []).map((claim: any) => claim.user_id));

          duplicateMatchesForApproval.push(
            ...(nameBirthClaims || [])
              .filter((claim: any) => {
                const linkedProfile = getClaimProfile(claim, approvalProfilesById);
                const matchUserId = String(claim.user_id || "").trim();
                const matchEmail = String(linkedProfile?.email || "").trim().toLowerCase();
                return matchUserId &&
                  linkedProfile &&
                  matchUserId !== String(review.user_id) &&
                  (!reviewEmail || !matchEmail || matchEmail !== reviewEmail);
              })
              .map((claim: any) => ({ ...claim, matched_on: "NAME_BIRTHDATE" })),
          );
        }

        duplicateMatchesForApproval = duplicateMatchesForApproval.filter((claim: any, index: number, all: any[]) => (
          index === all.findIndex((other: any) => (
            String(other.user_id || "") === String(claim.user_id || "") &&
            String(other.matched_on || "") === String(claim.matched_on || "")
          ))
        ));

        if (duplicateMatchesForApproval.length > 0 && (!duplicateOverrideConfirmed || !reviewNotes)) {
          return jsonResponse({
            error: "This identity matches another approved same-role account. Confirm the duplicate override and add admin notes before approval.",
          }, 400);
        }

        if (!isMusicianVideoOnlyReview && !documentFingerprintForDecision && !reviewNameBirth.hasNameBirthDate) {
          return jsonResponse({
            error: "This review is missing both document fingerprint and name/birthdate data, so duplicate identity checks cannot run. Require the user to repeat identity verification instead.",
          }, 400);
        }
      }

      const profileVerificationStatus = decision === "APPROVED" ? "APPROVED" : "DECLINED";
      const nowIso = new Date().toISOString();
      let diditStatusSync: Record<string, any> | null = null;
      let diditStatusSyncSkipped: Record<string, any> | null = null;
      let musicianVideoPortfolio: Record<string, any> | null = null;

      if (shouldSyncDiditManualReviewStatus(review)) {
        const diditSessionId = String(review.didit_session_id || "").trim();
        if (!diditSessionId) {
          return jsonResponse({
            error: "This Didit review is missing a Didit session ID, so MusikaLokal cannot update Didit.",
          }, 400);
        }

        try {
          diditStatusSync = await updateDiditManualReviewStatus(
            diditSessionId,
            decision as "APPROVED" | "DECLINED",
            reviewNotes,
          );
        } catch (diditError: any) {
          return jsonResponse({
            error: diditError?.message || "Unable to update the Didit review status.",
          }, 502);
        }
      } else if (isDiditPendingReview(review) && String(review.didit_session_id || "").trim()) {
        const sourceStatus = getDiditSourceReviewStatus(review);
        diditStatusSyncSkipped = {
          status: sourceStatus || null,
          skipped_at: nowIso,
          reason: sourceStatus
            ? `Didit source session is already ${sourceStatus}; MusikaLokal review decision is local only.`
            : "Didit source session is not in an actionable manual-review status.",
        };
      }

      if (decision === "APPROVED" && isMusicianSignupReview && review.music_video_path) {
        musicianVideoPortfolio = await publishMusicianVideoToProfilePortfolio(client, {
          userId: review.user_id,
          reviewId,
          objectPath: review.music_video_path,
          mimeType: review.music_video_mime_type || "video/mp4",
          originalName: review.music_video_original_name || "music-video",
        });
      }

      const existingReviewMetadata = review.metadata && typeof review.metadata === "object" ? review.metadata : {};
      const nextReviewMetadata = {
        ...existingReviewMetadata,
        ...(diditStatusSync
          ? {
              didit_status: diditStatusSync.status,
              didit_status_synced_at: diditStatusSync.synced_at,
              didit_status_sync_session_kind: diditStatusSync.session_kind || null,
            }
          : {}),
        ...(diditStatusSyncSkipped
          ? {
              didit_status_sync_skipped: true,
              didit_status_sync_skipped_at: diditStatusSyncSkipped.skipped_at,
              didit_status_sync_skipped_reason: diditStatusSyncSkipped.reason,
              didit_status: diditStatusSyncSkipped.status || existingReviewMetadata.didit_status || existingReviewMetadata.source_session_status || null,
            }
          : {}),
        ...(duplicateOverrideConfirmed && duplicateMatchesForApproval.length > 0
          ? {
              duplicate_override_confirmed: true,
              duplicate_override_confirmed_by: actorId,
              duplicate_override_confirmed_at: nowIso,
              duplicate_override_match_count: duplicateMatchesForApproval.length,
              duplicate_override_matched_on: Array.from(new Set(duplicateMatchesForApproval.map((match: any) => match.matched_on).filter(Boolean))),
            }
          : {}),
        ...(musicianVideoPortfolio
          ? {
              musician_video_portfolio_bucket: musicianVideoPortfolio.bucketName,
              musician_video_portfolio_path: musicianVideoPortfolio.path,
              musician_video_portfolio_url: musicianVideoPortfolio.publicUrl,
              musician_video_published_to_gallery_at: nowIso,
            }
          : {}),
      };

      const reviewUpdatePayload: Record<string, unknown> = {
        status: profileVerificationStatus,
        review_notes: reviewNotes,
        reviewed_by: actorId,
        reviewed_at: nowIso,
        metadata: nextReviewMetadata,
        updated_at: nowIso,
      };

      const { data: updatedReview, error: updateReviewError } = await client
        .from("manual_identity_reviews")
        .update(reviewUpdatePayload)
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

      const { data: reviewProfile } = await client
        .from("profiles")
        .select("role, email")
        .eq("id", review.user_id)
        .maybeSingle();

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

      const reviewNameBirthForClaim = prepareIdentityNameBirthDateDuplicateInput(null, {
        fullLegalName: review.verified_full_legal_name,
        normalizedFullLegalName: review.normalized_full_legal_name,
        birthDate: review.birth_date,
      });

      if (!isMusicianVideoOnlyReview && documentFingerprintForDecision) {
        if (decision === "APPROVED") {
          const approvalClaim = normalizeApprovalClaimResult(await claimApprovedIdentityDocument(client, {
            userId: review.user_id,
            role: reviewRoleForClaim,
            documentFingerprint: documentFingerprintForDecision,
            documentType: review.document_type,
            documentTypeKey: review.document_type_key,
            documentCountry: review.document_country || "PHL",
            source: review.source || "MANUAL_UPLOAD",
            status: "APPROVED",
            diditSessionId: review.didit_session_id || null,
            manualReviewId: reviewId,
            email: reviewProfile?.email || review.submitted_by_email || null,
            duplicateOverride: duplicateOverrideConfirmed,
            verifiedFullLegalName: reviewNameBirthForClaim.fullLegalName,
            normalizedFullLegalName: reviewNameBirthForClaim.normalizedFullLegalName,
            birthDate: reviewNameBirthForClaim.birthDate,
            metadata: {
              approved_by: actorId,
              review_notes: reviewNotes,
              duplicate_override_confirmed: duplicateOverrideConfirmed,
              duplicate_override_matched_on: duplicateOverrideConfirmed
                ? Array.from(new Set(duplicateMatchesForApproval.map((match: any) => match.matched_on).filter(Boolean)))
                : [],
            },
          }));

          if (approvalClaim?.decision !== "APPROVED") {
            return jsonResponse({
              error: "This identity could not be approved because an approved same-role claim already exists.",
              claim: approvalClaim,
            }, 409);
          }
        } else {
          await recordIdentityDocumentClaim(client, {
            userId: review.user_id,
            role: reviewRoleForClaim,
            documentFingerprint: documentFingerprintForDecision,
            documentType: review.document_type,
            documentTypeKey: review.document_type_key,
            documentCountry: review.document_country || "PHL",
            source: review.source || "MANUAL_UPLOAD",
            status: "DECLINED",
            diditSessionId: review.didit_session_id || null,
            manualReviewId: reviewId,
            email: reviewProfile?.email || review.submitted_by_email || null,
            verifiedFullLegalName: reviewNameBirthForClaim.fullLegalName,
            normalizedFullLegalName: reviewNameBirthForClaim.normalizedFullLegalName,
            birthDate: reviewNameBirthForClaim.birthDate,
          });
        }
      }

      await client.from("notifications").insert({
        user_id: review.user_id,
        type: decision === "APPROVED" ? "success" : "warning",
        title: isMusicianVideoOnlyReview
          ? (decision === "APPROVED" ? "Musician Verification Approved" : "Musician Verification Declined")
          : (decision === "APPROVED" ? "Identity Verification Approved" : "Identity Verification Declined"),
        message: decision === "APPROVED"
          ? (isMusicianVideoOnlyReview ? "Your musician video proof was approved." : "Your manual identity verification was approved.")
          : (isMusicianVideoOnlyReview ? "Your musician video proof was declined." : "Your manual identity verification was declined. Please submit a new valid government ID."),
        meta: {
          manual_identity_review_id: reviewId,
          decision: profileVerificationStatus,
          review_notes: reviewNotes,
          didit_status_sync: diditStatusSync,
        },
      });

      const fallbackEmail = String(review.submitted_by_email || "").trim();
      const targetEmail = String(authUserData.user.email || fallbackEmail).trim().toLowerCase();
      let confirmationLinkResult = { link: null as string | null, error: null as string | null };
      let decisionEmail;
      const declinedAccountDeletion: Record<string, any> = {
        attempted: false,
        deleted: false,
        auth_deleted: false,
        profile_deleted: false,
        already_removed: false,
        skipped_reason: null,
        error: null,
      };

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

      if (decision === "DECLINED") {
        if (String(review.user_id) === actorId) {
          declinedAccountDeletion.skipped_reason = "Refused to delete the signed-in admin account.";
          console.error("manual_identity_review_declined_account_delete_skipped", {
            reviewId,
            userId: review.user_id,
            reason: declinedAccountDeletion.skipped_reason,
          });
        } else {
          declinedAccountDeletion.attempted = true;

          try {
            const deleteResult = await deleteReviewedIdentityAccount(client, String(review.user_id));
            declinedAccountDeletion.deleted = Boolean(deleteResult.deleted || deleteResult.already_removed);
            declinedAccountDeletion.auth_deleted = Boolean(deleteResult.auth_deleted);
            declinedAccountDeletion.profile_deleted = Boolean(deleteResult.profile_deleted);
            declinedAccountDeletion.already_removed = Boolean(deleteResult.already_removed);

            console.log("manual_identity_review_declined_account_deleted", {
              reviewId,
              userId: review.user_id,
              authDeleted: declinedAccountDeletion.auth_deleted,
              profileDeleted: declinedAccountDeletion.profile_deleted,
              alreadyRemoved: declinedAccountDeletion.already_removed,
              emailSent: decisionEmail.sent,
              emailQueued: decisionEmail.queued,
              emailError: decisionEmail.error || null,
            });
          } catch (deleteError: any) {
            declinedAccountDeletion.error = deleteError?.message || "Unable to delete declined account.";
            console.error("manual_identity_review_declined_account_delete_failed", {
              reviewId,
              userId: review.user_id,
              message: declinedAccountDeletion.error,
              emailSent: decisionEmail.sent,
              emailQueued: decisionEmail.queued,
              emailError: decisionEmail.error || null,
            });
          }
        }
      }

      return jsonResponse({
        item: {
          ...(updatedReview || review),
          decision_email_sent: decisionEmail.sent,
          decision_email_queued: decisionEmail.queued,
          decision_email_provider: decisionEmail.provider,
          decision_email_error: decisionEmail.error || null,
          declined_account_delete_attempted: declinedAccountDeletion.attempted,
          declined_account_deleted: declinedAccountDeletion.deleted,
          declined_account_auth_deleted: declinedAccountDeletion.auth_deleted,
          declined_account_profile_deleted: declinedAccountDeletion.profile_deleted,
          declined_account_already_removed: declinedAccountDeletion.already_removed,
          declined_account_delete_skipped_reason: declinedAccountDeletion.skipped_reason,
          declined_account_delete_error: declinedAccountDeletion.error,
          didit_status_sync: diditStatusSync,
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

      const { data: authUserData, error: authUserError } = await client.auth.admin.getUserById(userId);
      if (authUserError && !profile) {
        return jsonResponse({ error: "User not found" }, 404);
      }

      const authUser = authUserData?.user || null;
      const authDetails = authUser
        ? {
            email: profile?.email || authUser.email || null,
            auth_email: authUser.email || null,
            phone: authUser.phone || null,
            email_confirmed: Boolean(authUser.email_confirmed_at),
            email_confirmed_at: authUser.email_confirmed_at || null,
            last_sign_in_at: authUser.last_sign_in_at || null,
            auth_created_at: authUser.created_at || null,
            auth_updated_at: authUser.updated_at || null,
            banned_until: authUser.banned_until || null,
          }
        : {};

      const detailProfile = profile
        ? { ...profile, ...authDetails }
        : {
            id: userId,
            ...authDetails,
          };

      const [item] = await attachProfileLists(client, [detailProfile]);

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
      const staffAssignment = role === "staff" ? normalizeStaffAssignment(body?.staffAssignment) : null;

      if (!email || !password || !role) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      if (role === "staff" && !staffAssignment) {
        return jsonResponse({ error: "Select a staff target and access level." }, 400);
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

        if (staffAssignment) {
          await replaceStaffAssignment(client, userId, staffAssignment, actorId);
        }
      } catch (listError) {
        if (role === "staff") {
          try {
            await client.from("staff_listing_access").delete().eq("staff_user_id", userId);
          } catch {
            // The profile/auth cleanup below is the important rollback path.
          }
        }
        await client.from("profiles").delete().eq("id", userId);
        await client.auth.admin.deleteUser(userId);
        const message = listError instanceof Error ? listError.message : "Unable to save profile details";
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
      const maybePassword = body?.password;
      const hasStaffAssignmentUpdate = Object.prototype.hasOwnProperty.call(body || {}, "staffAssignment");
      const normalizedStaffAssignment = hasStaffAssignmentUpdate
        ? normalizeStaffAssignment(body?.staffAssignment)
        : null;

      if (!userId) {
        return jsonResponse({ error: "Missing userId" }, 400);
      }

      const nextPassword = String(maybePassword ?? "").trim();
      const hasPasswordUpdate = maybePassword !== undefined && nextPassword.length > 0;

      if (hasPasswordUpdate && nextPassword.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
      }

      let existingProfileForUpdate: Record<string, unknown> | null = null;
      if (maybeIsVerified !== undefined || maybeRole !== undefined || hasStaffAssignmentUpdate) {
        const { data: existingProfile, error: existingProfileError } = await client
          .from("profiles")
          .select("role, email, is_verified, verification_status")
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

      let roleChangeReviewId: string | null = null;
      if (
        profileUpdates.role !== undefined &&
        existingProfileForUpdate?.["role"] &&
        String(existingProfileForUpdate["role"]).trim().toLowerCase() !== String(profileUpdates.role).trim().toLowerCase()
      ) {
        const previousRole = String(existingProfileForUpdate["role"] || "").trim().toLowerCase();
        const nextRole = String(profileUpdates.role || "").trim().toLowerCase();
        const existingStatus = String(existingProfileForUpdate["verification_status"] || "").trim().toUpperCase();
        const wasVerified = existingProfileForUpdate["is_verified"] === true || existingStatus === "APPROVED";

        if (wasVerified) {
          const { data: latestApprovedClaim } = await client
            .from("identity_document_claims")
            .select("document_fingerprint, document_type, document_type_key, document_country, didit_session_id, verified_full_legal_name, normalized_full_legal_name, birth_date")
            .eq("user_id", userId)
            .eq("role", previousRole)
            .eq("status", "APPROVED")
            .order("last_seen_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestApprovedClaim?.document_fingerprint) {
            const roleClaim = await claimApprovedIdentityDocument(client, {
              userId,
              role: nextRole,
              documentFingerprint: latestApprovedClaim.document_fingerprint,
              documentType: latestApprovedClaim.document_type,
              documentTypeKey: latestApprovedClaim.document_type_key,
              documentCountry: latestApprovedClaim.document_country || "PHL",
              source: "DIDIT",
              diditSessionId: latestApprovedClaim.didit_session_id || null,
              email: existingProfileForUpdate["email"] || null,
              verifiedFullLegalName: latestApprovedClaim.verified_full_legal_name || null,
              normalizedFullLegalName: latestApprovedClaim.normalized_full_legal_name || null,
              birthDate: latestApprovedClaim.birth_date || null,
              metadata: {
                claimed_due_to_admin_role_change: true,
                previous_role: previousRole,
                next_role: nextRole,
                changed_by: actorId,
              },
            });

            if (roleClaim?.decision !== "APPROVED") {
              const reviewRecord = await queueIdentityReview(client, {
                userId,
                email: existingProfileForUpdate["email"] || "",
                role: nextRole,
                documentType: latestApprovedClaim.document_type || "Government ID",
                documentTypeKey: latestApprovedClaim.document_type_key || null,
                documentCountry: latestApprovedClaim.document_country || "PHL",
                source: "DIDIT_DUPLICATE",
                diditSessionId: latestApprovedClaim.didit_session_id || null,
                documentFingerprint: latestApprovedClaim.document_fingerprint,
                duplicateReason: getApprovalClaimReviewReason(roleClaim, nextRole),
                duplicateMatchCount: roleClaim?.duplicate_count || roleClaim?.matches?.length || 1,
                verifiedFullLegalName: latestApprovedClaim.verified_full_legal_name || null,
                normalizedFullLegalName: latestApprovedClaim.normalized_full_legal_name || null,
                birthDate: latestApprovedClaim.birth_date || null,
                reviewReason: getApprovalClaimReviewReason(roleClaim, nextRole),
                matchedOn: getApprovalClaimMatchedOn(roleClaim),
                metadata: {
                  created_due_to_admin_role_change: true,
                  previous_role: previousRole,
                  next_role: nextRole,
                  matched_on: getApprovalClaimMatchedOn(roleClaim),
                  claim_result: roleClaim,
                },
              });
              roleChangeReviewId = reviewRecord?.id || null;
              profileUpdates.is_verified = false;
              profileUpdates.verification_status = "PENDING_REVIEW";
              profileUpdates.id_verified_at = null;
            }
          } else {
            profileUpdates.is_verified = false;
            profileUpdates.verification_status = "PENDING_REVIEW";
            profileUpdates.id_verified_at = null;
          }
        }
      }

      const hasListUpdates = maybeSkills !== undefined || maybeGenres !== undefined;
      const targetRole = String(profileUpdates.role ?? existingProfileForUpdate?.["role"] ?? "").trim().toLowerCase();

      if (targetRole === "staff" && (maybeRole !== undefined || hasStaffAssignmentUpdate) && !normalizedStaffAssignment) {
        return jsonResponse({ error: "Select a staff target and access level." }, 400);
      }

      if (Object.keys(profileUpdates).length === 0 && !hasListUpdates && !hasPasswordUpdate && !hasStaffAssignmentUpdate) {
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

      if (hasPasswordUpdate) {
        authUpdatePayload.password = nextPassword;
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

        if (targetRole === "staff" && hasStaffAssignmentUpdate && normalizedStaffAssignment) {
          await replaceStaffAssignment(client, userId, normalizedStaffAssignment, actorId);
        } else if (targetRole !== "staff" && (hasStaffAssignmentUpdate || profileUpdates.role !== undefined)) {
          await revokeStaffAssignments(client, userId);
        }
      } catch (listError) {
        const message = listError instanceof Error ? listError.message : "Unable to save profile details";
        return jsonResponse({ error: message }, 400);
      }

      const [item] = await attachProfileLists(client, [updatedProfile]);

      return jsonResponse({ item: item || updatedProfile, role_change_review_id: roleChangeReviewId }, 200);
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

      try {
        await deleteIdentityClaimsForRemovedUser(client, userId);
      } catch (claimDeleteError) {
        const message = claimDeleteError instanceof Error ? claimDeleteError.message : "Unable to remove identity claims for this user";
        return jsonResponse({ error: message }, 400);
      }

      if (existingProfile) {
        try {
          await cleanupProfileDeleteBlockers(client, userId);
        } catch (cleanupError) {
          const message = cleanupError instanceof Error ? cleanupError.message : "Unable to prepare related records for deletion";
          return jsonResponse({ error: message }, 400);
        }

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
