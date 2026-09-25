import { supabase, supabaseUrl } from "../../../lib/supabase";
import { screenUploadsWithAiDecisions, type UploadSafetyFileDecision } from "../../../src/services/uploadSafetyScreen";
import { screenVisualUpload } from "../../../src/services/visualUploadScreen";
import { createCopyrightVideoSample, removeCopyrightVideoTemporaryFile } from "../../../src/utils/videoCopyrightSample";
import { getGigApplicationDeadlineInfo } from "../../../src/utils/gigApplication";
import { getGigReapplicationCooldownInfo } from "../../../src/utils/gigReapplicationCooldown";
import { cleanupRemovedStorageObjects } from "../../../src/utils/storageCleanup";
import {
  aggregateSpecificSlotRequirements,
  normalizeSpecificSlotRequirements,
} from "../../../src/utils/gigSlotRequirements";
import type {
  ApplicationFormValue,
  DebugStage,
  EventSchedule,
  GigFormValue,
  LoadedGig,
  PortalResult,
  RecommendationSettings,
  StageState,
} from "./_types";
import { DEFAULT_RECOMMENDATION_SETTINGS, EMPTY_GIG_FORM } from "./_types";

// MOBILE PARITY:
// Mirrors the mobile implementation from:
// mobile/app/add_gig.tsx, mobile/app/edit_gig.tsx,
// mobile/src/hooks/useApplicationSubmissionAction.ts, and
// mobile/src/components/VideoUploader.tsx.
//
// If the mobile flow changes, review this test implementation too.

export type StageReporter = (stage: DebugStage) => void;

export type SessionContext = {
  userId: string;
  profile: any;
  groups: any[];
};

export type ApplicationFiles = {
  cv: File | null;
  video: File | null;
};

type UploadedVideo = {
  url: string;
  path: string;
  frameUrls: string[];
  decision: UploadSafetyFileDecision;
};

const DATE_ONLY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SECRET_PATTERN = /\b(?:Bearer\s+)?(?:sk-|gsk_|sb_secret_)[A-Za-z0-9._-]+\b/gi;
const SECRET_QUERY_PATTERN = /([?&](?:access_token|apikey|api_key|token|jwt|secret|password)=)[^&#\s]+/gi;

export const safeMessage = (error: unknown): string => {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : String((error as any)?.message || "Unknown error");
  return raw
    .replace(JWT_PATTERN, "[redacted token]")
    .replace(SECRET_PATTERN, "[redacted secret]")
    .replace(SECRET_QUERY_PATTERN, "$1[redacted]");
};

const now = () => new Date().toISOString();

const stage = (
  reporter: StageReporter,
  input: Omit<DebugStage, "startedAt"> & { startedAt?: string },
) => reporter({ startedAt: input.startedAt || now(), ...input });

const finishStage = (
  reporter: StageReporter,
  input: Omit<DebugStage, "startedAt" | "finishedAt" | "durationMs"> & { startedAt: string },
) => {
  const finishedAt = now();
  reporter({
    ...input,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(input.startedAt).getTime()),
  });
};

const splitList = (value: string): string[] => Array.from(new Set(
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
));

const splitCountedList = (value: string): string[] => value
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const toCalendarDateString = (value: unknown): string => {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(DATE_ONLY_PREFIX);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLocalCalendarDate = () => toCalendarDateString(new Date());

const toDisplayTimeString = (value: unknown): string => {
  if (!value) return "";
  const raw = String(value).trim();
  const display = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (display) return `${display[1].padStart(2, "0")}:${display[2]} ${display[3].toUpperCase()}`;
  const database = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!database) return raw;
  const hour24 = Number(database[1]);
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return raw;
  return `${String(hour24 % 12 || 12).padStart(2, "0")}:${database[2]} ${hour24 >= 12 ? "PM" : "AM"}`;
};

const normalizeSchedules = (items: any[]): EventSchedule[] => items
  .map((item) => ({
    date: toCalendarDateString(item?.date || item?.slot_date),
    start_time: toDisplayTimeString(item?.start_time),
    end_time: toDisplayTimeString(item?.end_time),
  }))
  .filter((item) => item.date && item.start_time && item.end_time);

export const getGigSchedules = (form: GigFormValue): EventSchedule[] => {
  const schedules = normalizeSchedules(form.schedules);
  if (schedules.length > 0) return schedules;
  if (form.eventDate.trim() && form.eventStartTime && form.eventEndTime) {
    return [{
      date: form.eventDate.trim(),
      start_time: form.eventStartTime,
      end_time: form.eventEndTime,
    }];
  }
  return [];
};

export const validateGigForm = (form: GigFormValue): string | null => {
  if (!form.name.trim()) return "Please enter a gig name";
  if (form.name.length > 120) return "Gig name must be 120 characters or fewer";
  if (!form.description.trim()) return "Please enter a description";
  if (form.description.length > 1000) return "Description must be 1000 characters or fewer";
  if (!form.location.trim()) return "Please enter a gig address";
  if (!form.budget.trim() || Number.parseFloat(form.budget) <= 0) return "Please enter a valid payout amount";
  if (form.imageUrls.length === 0) return "Please upload at least one event photo";
  const schedules = getGigSchedules(form);
  if (schedules.length === 0) return "Please add at least one event date and time condition";
  if (schedules.some((item) => item.date < getLocalCalendarDate())) {
    return "Event dates cannot be yesterday or any past date.";
  }
  const validDisplayTime = /^(0?[1-9]|1[0-2]):[0-5]\d\s(?:AM|PM)$/i;
  if (schedules.some((item) => !validDisplayTime.test(item.start_time) || !validDisplayTime.test(item.end_time))) {
    return "Event times must use the mobile format, such as 06:00 PM.";
  }
  if (splitCountedList(form.bandGroupTypes).length > count(form.bandSlots)) {
    return "Preferred group types cannot exceed the number of group slots.";
  }
  return null;
};

const normalizeRecommendationSettings = (value: any): RecommendationSettings => {
  const mode = (candidate: unknown, fallback: "required" | "ignore") =>
    candidate === "ignore" ? "ignore" : candidate === "required" || candidate === "preferred" ? "required" : fallback;
  const score = Number(value?.minimum_score);
  const radius = Number(value?.location_radius_km);
  return {
    enabled: value?.enabled === true,
    minimum_score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 75,
    location_radius_km: value?.location_radius_km === null || value?.location_radius_km === "any"
      ? null
      : [5, 10, 25, 50, 100].includes(radius) ? radius : null,
    criteria: {
      genres: mode(value?.criteria?.genres, DEFAULT_RECOMMENDATION_SETTINGS.criteria.genres),
      instruments: mode(value?.criteria?.instruments, DEFAULT_RECOMMENDATION_SETTINGS.criteria.instruments),
      location: mode(value?.criteria?.location, DEFAULT_RECOMMENDATION_SETTINGS.criteria.location),
      portfolio: mode(value?.criteria?.portfolio, DEFAULT_RECOMMENDATION_SETTINGS.criteria.portfolio),
    },
  };
};

const count = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

export const buildRequirements = (form: GigFormValue) => {
  const schedules = getGigSchedules(form);
  const primary = schedules[0];
  const solo = count(form.soloSlots);
  const duo = count(form.duoSlots);
  const groupTypes = splitCountedList(form.bandGroupTypes);
  const band = count(form.bandSlots);
  const soloSpecificRequirements = normalizeSpecificSlotRequirements(form.soloSpecificRequirements, solo, "solo");
  const duoSpecificRequirements = normalizeSpecificSlotRequirements(form.duoSpecificRequirements, duo, "duo");
  const soloAggregate = aggregateSpecificSlotRequirements(soloSpecificRequirements, {
    roles: splitList(form.soloRoles),
    preferred_genres: splitList(form.soloGenres),
    preferred_instruments: splitList(form.soloInstruments),
  });
  const duoAggregate = aggregateSpecificSlotRequirements(duoSpecificRequirements, {
    roles: splitList(form.duoRoles),
    preferred_genres: splitList(form.duoGenres),
    preferred_instruments: splitList(form.duoInstruments),
  });
  const musicianType = solo > 0 && (duo > 0 || band > 0)
    ? "both"
    : solo > 0 ? "solo" : duo > 0 || band > 0 ? "group" : "both";

  return {
    genres: splitList(form.genres),
    instruments: splitList(form.instruments),
    event_start_time: primary?.start_time || form.eventStartTime,
    event_end_time: primary?.end_time || form.eventEndTime,
    event_schedules: schedules,
    musician_type: musicianType,
    slots: {
      solo: {
        needed: solo,
        ...soloAggregate,
        specific_requirements: soloSpecificRequirements,
      },
      duo: {
        needed: duo,
        ...duoAggregate,
        specific_requirements: duoSpecificRequirements,
      },
      band: {
        needed: band,
        roles: splitList(form.bandRoles),
        preferred_group_types: groupTypes,
        preferred_genres: splitList(form.bandGenres),
        preferred_instruments: splitList(form.bandInstruments),
      },
    },
    total_slots_needed: solo + duo + band,
    ai_recommendation_settings: normalizeRecommendationSettings(form.recommendation),
  };
};

const requireSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) throw new Error("Session expired. Please log in again.");
  return session;
};

export const loadSessionContext = async (): Promise<SessionContext> => {
  const session = await requireSession();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
  if (error) throw error;

  const [{ data: ownedGroups }, { data: memberships }] = await Promise.all([
    supabase.from("groups").select("id, name, owner_id, group_type").eq("owner_id", session.user.id),
    supabase.from("group_members").select("group_id").eq("user_id", session.user.id),
  ]);
  const memberIds = (memberships || []).map((item: any) => item.group_id).filter(Boolean);
  let memberGroups: any[] = [];
  if (memberIds.length > 0) {
    const { data } = await supabase.from("groups").select("id, name, owner_id, group_type").in("id", memberIds);
    memberGroups = data || [];
  }
  const groups = Array.from(new Map([...(ownedGroups || []), ...memberGroups].map((item: any) => [item.id, item])).values());
  return { userId: session.user.id, profile, groups };
};

const fileExtension = (file: File, fallback: string) => {
  const raw = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return raw || fallback;
};

const sanitizeFileName = (name: string, fallback = "upload") => name
  .normalize("NFKD")
  .replace(/[^\w.\-]+/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "") || fallback;

const fileToDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Unable to read the selected file."));
  reader.onload = () => resolve(String(reader.result || ""));
  reader.readAsDataURL(file);
});

const uploadPublicFile = async (bucket: string, path: string, file: Blob, contentType: string) => {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return {
    path: data.path,
    url: supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl,
  };
};

export const uploadGigImages = async (
  files: File[],
  userId: string,
  reporter: StageReporter,
): Promise<{ urls: string[]; paths: string[] }> => {
  if (files.length === 0) return { urls: [], paths: [] };
  if (files.length > 10) throw new Error("You can only upload up to 10 images.");
  const startedAt = now();
  stage(reporter, { id: "gig-images", group: "UPLOADS", label: "Gig image safety and upload", state: "processing", startedAt });
  try {
    const decisions = await screenUploadsWithAiDecisions(await Promise.all(files.map(async (file) => ({
      name: file.name,
      mimeType: file.type || "image/jpeg",
      size: file.size,
      uri: URL.createObjectURL(file),
      originalUri: URL.createObjectURL(file),
      contentDataUrl: await fileToDataUrl(file),
      kind: "photo" as const,
    }))), "add_edit_upload");
    const blocked = decisions.find((decision) => decision.allowed !== true);
    if (blocked) throw new Error(blocked.reason || "This image did not pass safety screening.");

    const uploaded = await Promise.all(files.map((file) => {
      const path = `${userId}/general/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${fileExtension(file, "jpg")}`;
      return uploadPublicFile("listings", path, file, file.type || "image/jpeg");
    }));
    finishStage(reporter, {
      id: "gig-images", group: "UPLOADS", label: "Gig image safety and upload", state: "success", startedAt,
      message: `${uploaded.length} image(s) screened and uploaded.`,
      edgeFunction: "upload-safety-screen", httpStatus: 200,
      storagePath: uploaded.map((item) => `listings/${item.path}`).join(", "),
    });
    return { urls: uploaded.map((item) => item.url), paths: uploaded.map((item) => item.path) };
  } catch (error) {
    finishStage(reporter, { id: "gig-images", group: "UPLOADS", label: "Gig image safety and upload", state: "failed", startedAt, message: safeMessage(error) });
    throw error;
  }
};

export const uploadContract = async (file: File, userId: string, reporter: StageReporter) => {
  const startedAt = now();
  stage(reporter, { id: "contract", group: "UPLOADS", label: "Custom contract upload", state: "processing", startedAt });
  try {
    if (file.type && file.type !== "application/pdf") throw new Error("The mobile flow accepts a PDF contract.");
    const path = `contracts/${userId}/${Date.now()}_${sanitizeFileName(file.name, "contract.pdf")}`;
    const uploaded = await uploadPublicFile("documents", path, file, file.type || "application/pdf");
    finishStage(reporter, { id: "contract", group: "UPLOADS", label: "Custom contract upload", state: "success", startedAt, storagePath: `documents/${path}`, message: "Contract uploaded." });
    return uploaded;
  } catch (error) {
    finishStage(reporter, { id: "contract", group: "UPLOADS", label: "Custom contract upload", state: "failed", startedAt, message: safeMessage(error) });
    throw error;
  }
};

export const createGig = async (form: GigFormValue, reporter: StageReporter): Promise<PortalResult> => {
  const validation = validateGigForm(form);
  if (validation) throw new Error(validation);
  const session = await requireSession();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (profileError) throw profileError;
  if (profile?.role !== "venue-owner") throw new Error("Only gig owners can create gigs.");

  const requirements = buildRequirements(form);
  const schedules = getGigSchedules(form);
  let createdGigId: string | null = null;
  const stages: DebugStage[] = [];
  const collect: StageReporter = (next) => {
    const index = stages.findIndex((item) => item.id === next.id);
    if (index >= 0) stages.splice(index, 1);
    stages.push(next);
    reporter(next);
  };
  const insertStart = now();
  stage(collect, { id: "create-base", group: "APPLICATION", label: "Create base gig", state: "processing", startedAt: insertStart, databaseOperation: "INSERT gigs" });
  try {
    const { data, error } = await supabase.from("gigs").insert({
      organizer_id: session.user.id,
      name: form.name,
      description: form.description,
      location: form.location,
      budget: Number.parseFloat(form.budget) || 0,
      status: "open",
      contract_url: form.contractUrl || null,
      business_permit_url: null,
      latitude: form.latitude.trim() ? Number(form.latitude) : null,
      longitude: form.longitude.trim() ? Number(form.longitude) : null,
      event_date: schedules[0]?.date || form.eventDate,
      reapplication_cooldown_days: (Number(form.reapplicationCooldownHours) || 0) / 24,
      permit_status: "approved",
    }).select().single();
    if (error) throw error;
    createdGigId = data.id;
    finishStage(collect, { id: "create-base", group: "APPLICATION", label: "Create base gig", state: "success", startedAt: insertStart, databaseOperation: "INSERT gigs", message: `Gig ${data.id} created with status open.` });

    const requirementsStart = now();
    stage(collect, { id: "create-requirements", group: "APPLICATION", label: "Save normalized requirements", state: "processing", startedAt: requirementsStart, databaseOperation: "INSERT gig_requirements" });
    const rows = Object.entries(requirements).map(([requirement_key, requirement_value]) => ({ gig_id: data.id, requirement_key, requirement_value }));
    const { error: requirementsError } = await supabase.from("gig_requirements").insert(rows);
    if (requirementsError) throw requirementsError;
    finishStage(collect, { id: "create-requirements", group: "APPLICATION", label: "Save normalized requirements", state: "success", startedAt: requirementsStart, databaseOperation: `INSERT gig_requirements (${rows.length} rows)` });

    const mediaStart = now();
    stage(collect, { id: "create-media", group: "APPLICATION", label: "Save gig media", state: "processing", startedAt: mediaStart, databaseOperation: "INSERT gig_media" });
    const mediaRows = form.imageUrls.map((media_url, index) => ({ gig_id: data.id, media_type: "image", media_url, sort_order: index }));
    if (mediaRows.length > 0) {
      const { error: mediaError } = await supabase.from("gig_media").insert(mediaRows);
      if (mediaError) throw mediaError;
    }
    finishStage(collect, { id: "create-media", group: "APPLICATION", label: "Save gig media", state: "success", startedAt: mediaStart, databaseOperation: `INSERT gig_media (${mediaRows.length} rows)` });

    return {
      operation: "create_gig", success: true, gigId: data.id, organizerId: session.user.id,
      createdStatus: data.status, backendResult: data, stages, completedAt: now(),
    };
  } catch (error) {
    if (createdGigId) {
      await supabase.from("gigs").delete().eq("id", createdGigId).eq("organizer_id", session.user.id);
      stage(collect, { id: "create-rollback", group: "APPLICATION", label: "Rollback partial create", state: "warning", databaseOperation: "DELETE gigs", message: `Rolled back ${createdGigId}.` });
    }
    throw error;
  }
};

export const loadGig = async (gigId: string): Promise<{ gig: LoadedGig; form: GigFormValue }> => {
  if (!gigId.trim()) throw new Error("Gig ID is required.");
  const [{ data: base, error: baseError }, requirementsResult, mediaResult, availabilityResult] = await Promise.all([
    supabase.from("gigs").select("*").eq("id", gigId.trim()).single(),
    supabase.from("gig_requirements").select("requirement_key, requirement_value").eq("gig_id", gigId.trim()),
    supabase.from("gig_media").select("media_type, media_url, sort_order, created_at").eq("gig_id", gigId.trim()).order("sort_order").order("created_at"),
    supabase.from("gig_availability_slots").select("slot_date, start_time, end_time, is_available, created_at").eq("gig_id", gigId.trim()).order("slot_date").order("start_time"),
  ]);
  if (baseError) throw baseError;
  if (requirementsResult.error) throw requirementsResult.error;
  if (mediaResult.error) throw mediaResult.error;
  if (availabilityResult.error) throw availabilityResult.error;
  const requirements = (requirementsResult.data || []).reduce((acc: Record<string, any>, row: any) => {
    if (row?.requirement_key) acc[row.requirement_key] = row.requirement_value;
    return acc;
  }, {});
  const images = (mediaResult.data || []).filter((row: any) => row.media_type === "image").map((row: any) => row.media_url).filter(Boolean);
  const documents = (mediaResult.data || []).filter((row: any) => row.media_type === "document").map((row: any) => row.media_url).filter(Boolean);
  let schedules = normalizeSchedules(Array.isArray(requirements.event_schedules) ? requirements.event_schedules : []);
  if (schedules.length === 0) schedules = normalizeSchedules((availabilityResult.data || []).filter((item: any) => item.is_available !== false));
  const fallbackDate = toCalendarDateString(base.event_date);
  if (schedules.length === 0 && fallbackDate) schedules = [{
    date: fallbackDate,
    start_time: toDisplayTimeString(requirements.event_start_time) || "06:00 PM",
    end_time: toDisplayTimeString(requirements.event_end_time) || "11:00 PM",
  }];
  const slots = requirements.slots || {};
  const form: GigFormValue = {
    ...EMPTY_GIG_FORM,
    name: base.name || "", description: base.description || "", location: base.location || "",
    latitude: base.latitude == null ? "" : String(base.latitude), longitude: base.longitude == null ? "" : String(base.longitude),
    budget: base.budget == null ? "" : String(base.budget), eventDate: schedules[0]?.date || fallbackDate,
    eventStartTime: schedules[0]?.start_time || toDisplayTimeString(requirements.event_start_time) || "06:00 PM",
    eventEndTime: schedules[0]?.end_time || toDisplayTimeString(requirements.event_end_time) || "11:00 PM", schedules,
    genres: (requirements.genres || []).join(", "), instruments: (requirements.instruments || []).join(", "),
    soloSlots: String(slots.solo?.needed || 0), duoSlots: String(slots.duo?.needed || 0), bandSlots: String(slots.band?.needed || 0),
    soloRoles: (slots.solo?.roles || []).join(", "), soloGenres: (slots.solo?.preferred_genres || []).join(", "), soloInstruments: (slots.solo?.preferred_instruments || []).join(", "),
    soloSpecificRequirements: normalizeSpecificSlotRequirements(slots.solo?.specific_requirements, Number(slots.solo?.needed || 0), "solo", {
      roles: slots.solo?.roles || [], preferred_genres: slots.solo?.preferred_genres || [], preferred_instruments: slots.solo?.preferred_instruments || [],
    }),
    duoRoles: (slots.duo?.roles || []).join(", "), duoGenres: (slots.duo?.preferred_genres || []).join(", "), duoInstruments: (slots.duo?.preferred_instruments || []).join(", "),
    duoSpecificRequirements: normalizeSpecificSlotRequirements(slots.duo?.specific_requirements, Number(slots.duo?.needed || 0), "duo", {
      roles: slots.duo?.roles || [], preferred_genres: slots.duo?.preferred_genres || [], preferred_instruments: slots.duo?.preferred_instruments || [],
    }),
    bandRoles: (slots.band?.roles || []).join(", "), bandGroupTypes: (slots.band?.preferred_group_types || []).join(", "), bandGenres: (slots.band?.preferred_genres || []).join(", "), bandInstruments: (slots.band?.preferred_instruments || []).join(", "),
    reapplicationCooldownHours: String(Math.round(Number(base.reapplication_cooldown_days ?? 30) * 24)),
    recommendation: normalizeRecommendationSettings(requirements.ai_recommendation_settings), imageUrls: images,
    contractUrl: base.contract_url || "", businessPermitUrl: base.business_permit_url || "",
  };
  return { gig: { ...base, requirements, images, documents } as LoadedGig, form };
};

const changedPaths = (before: unknown, after: unknown, prefix = ""): string[] => {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [prefix || "value"];
  const keys = new Set([...Object.keys(before as any), ...Object.keys(after as any)]);
  return Array.from(keys).flatMap((key) => changedPaths((before as any)[key], (after as any)[key], prefix ? `${prefix}.${key}` : key));
};

export const updateGig = async (loaded: LoadedGig, form: GigFormValue, reporter: StageReporter): Promise<PortalResult> => {
  const validation = validateGigForm(form);
  if (validation) throw new Error(validation);
  const session = await requireSession();
  const requirements = buildRequirements(form);
  const schedules = getGigSchedules(form);
  const payload = {
    name: form.name, description: form.description, location: form.location,
    budget: Number.parseFloat(form.budget) || 0, images: form.imageUrls,
    contract_url: form.contractUrl || null, business_permit_url: form.businessPermitUrl || null,
    latitude: form.latitude.trim() ? Number(form.latitude) : null,
    longitude: form.longitude.trim() ? Number(form.longitude) : null,
    event_date: schedules[0]?.date || form.eventDate, requirements,
  };
  const before = {
    name: loaded.name, description: loaded.description, location: loaded.location, budget: loaded.budget,
    images: loaded.images, contract_url: loaded.contract_url, business_permit_url: loaded.business_permit_url,
    latitude: loaded.latitude, longitude: loaded.longitude, event_date: toCalendarDateString(loaded.event_date),
    requirements: loaded.requirements,
  };
  const stages: DebugStage[] = [];
  const collect: StageReporter = (next) => {
    const index = stages.findIndex((item) => item.id === next.id);
    if (index >= 0) stages.splice(index, 1);
    stages.push(next);
    reporter(next);
  };
  const startedAt = now();
  stage(collect, { id: "edit-rpc", group: "APPLICATION", label: "Safe gig update", state: "processing", startedAt, databaseOperation: "RPC update_gig_with_cooldown_safely" });
  const { data, error } = await supabase.rpc("update_gig_with_cooldown_safely", {
    p_gig_id: loaded.id,
    p_cooldown_hours: Number(form.reapplicationCooldownHours) || 0,
    p_payload: payload,
    p_reason: "Updated from Edit Gig screen by organizer",
  });
  if (error) {
    finishStage(collect, { id: "edit-rpc", group: "APPLICATION", label: "Safe gig update", state: "failed", startedAt, databaseOperation: "RPC update_gig_with_cooldown_safely", message: safeMessage(error) });
    throw error;
  }
  if (!(data as any)?.success) throw new Error((data as any)?.message || "Failed to update gig");
  finishStage(collect, { id: "edit-rpc", group: "APPLICATION", label: "Safe gig update", state: "success", startedAt, databaseOperation: "RPC update_gig_with_cooldown_safely", details: data });

  const permitChanged = Boolean(form.businessPermitUrl && form.businessPermitUrl !== loaded.business_permit_url);
  if (permitChanged && !(String(loaded.permit_status || "").toLowerCase() === "rejected" && Number(loaded.permit_resubmissions_used || 0) >= 1)) {
    const nextPermitStatus = String(loaded.permit_status || "").toLowerCase() === "rejected" ? "resubmitted" : "pending_review";
    const permitStart = now();
    stage(collect, { id: "edit-permit", group: "APPLICATION", label: "Reset permit review", state: "processing", startedAt: permitStart, databaseOperation: "UPDATE gigs permit review fields" });
    const { error: permitError } = await supabase.from("gigs").update({
      permit_status: nextPermitStatus, permit_rejection_reason: null, permit_admin_notes: null,
      permit_reviewed_by: null, permit_reviewed_at: null,
    }).eq("id", loaded.id);
    if (permitError) throw permitError;
    finishStage(collect, { id: "edit-permit", group: "APPLICATION", label: "Reset permit review", state: "success", startedAt: permitStart, databaseOperation: "UPDATE gigs permit review fields", message: `Permit state: ${nextPermitStatus}` });
  }
  return {
    operation: "edit_gig", success: true, gigId: loaded.id, organizerId: loaded.organizer_id || session.user.id,
    previousValues: before, newValues: payload, changedFields: changedPaths(before, payload), backendResult: data,
    stages, completedAt: now(),
  };
};

export const deleteGig = async (gigId: string, reason: string, reporter: StageReporter): Promise<PortalResult> => {
  const normalizedGigId = gigId.trim();
  const normalizedReason = reason.trim();
  if (!normalizedGigId) throw new Error("Gig ID is required.");
  if (!normalizedReason) throw new Error("Please enter a cancellation reason.");

  const session = await requireSession();
  const stages: DebugStage[] = [];
  const collect: StageReporter = (next) => {
    const index = stages.findIndex((item) => item.id === next.id);
    if (index >= 0) stages.splice(index, 1);
    stages.push(next);
    reporter(next);
  };

  const startedAt = now();
  stage(collect, {
    id: "delete-rpc",
    group: "APPLICATION",
    label: "Safe gig deletion",
    state: "processing",
    startedAt,
    databaseOperation: "RPC delete_gig_safely",
  });
  const { data, error } = await supabase.rpc("delete_gig_safely", {
    p_gig_id: normalizedGigId,
    p_reason: normalizedReason,
  });
  if (error) {
    finishStage(collect, {
      id: "delete-rpc",
      group: "APPLICATION",
      label: "Safe gig deletion",
      state: "failed",
      startedAt,
      databaseOperation: "RPC delete_gig_safely",
      message: safeMessage(error),
    });
    throw error;
  }
  if (!(data as any)?.success) {
    const code = String((data as any)?.code || "");
    if (code === "ACTIVE_ACCEPTED_APPLICATIONS_EXIST") {
      throw new Error("This gig has active accepted applicants and cannot be deleted.");
    }
    if (code === "CANCELLATION_REASON_REQUIRED") {
      throw new Error("Please enter a cancellation reason.");
    }
    if (code === "GIG_NOT_FOUND") {
      throw new Error("Gig not found or you do not have permission to delete it.");
    }
    throw new Error((data as any)?.message || "Failed to delete gig.");
  }
  finishStage(collect, {
    id: "delete-rpc",
    group: "APPLICATION",
    label: "Safe gig deletion",
    state: "success",
    startedAt,
    databaseOperation: "RPC delete_gig_safely",
    details: data,
  });

  const storageUrls = Array.isArray((data as any)?.storage_cleanup?.removed_urls)
    ? (data as any).storage_cleanup.removed_urls.filter((url: unknown): url is string => typeof url === "string")
    : [];
  if (storageUrls.length > 0) {
    const cleanupStartedAt = now();
    stage(collect, {
      id: "delete-storage",
      group: "UPLOADS",
      label: "Remove deleted gig files",
      state: "processing",
      startedAt: cleanupStartedAt,
    });
    const cleanup = await cleanupRemovedStorageObjects(supabase, supabaseUrl, storageUrls);
    finishStage(collect, {
      id: "delete-storage",
      group: "UPLOADS",
      label: "Remove deleted gig files",
      state: cleanup.errors.length > 0 ? "warning" : "success",
      startedAt: cleanupStartedAt,
      message: cleanup.errors.length > 0
        ? `Gig deleted. Some files could not be removed: ${cleanup.errors.join("; ")}`
        : `${cleanup.deletedObjects} file${cleanup.deletedObjects === 1 ? "" : "s"} removed.`,
      details: cleanup,
    });
  }

  return {
    operation: "delete_gig",
    success: true,
    gigId: normalizedGigId,
    organizerId: session.user.id,
    backendResult: data,
    stages,
    completedAt: now(),
  };
};

const getVideoFrameBlob = (url: string, timeSeconds: number): Promise<Blob> => new Promise((resolve, reject) => {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  const cleanup = () => { video.removeAttribute("src"); video.load(); };
  video.onerror = () => { cleanup(); reject(new Error("Unable to read a representative video frame.")); };
  video.onloadedmetadata = () => { video.currentTime = Math.min(Math.max(0, timeSeconds), Math.max(0, video.duration - 0.05)); };
  video.onseeked = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, video.videoWidth);
    canvas.height = Math.max(1, video.videoHeight);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      cleanup();
      if (blob) resolve(blob); else reject(new Error("Unable to encode a representative video frame."));
    }, "image/jpeg", 0.82);
  };
});

const uploadReviewFrames = async (fileUrl: string, userId: string) => {
  const frameUrls: string[] = [];
  for (const [index, seconds] of [0, 5, 10].entries()) {
    try {
      const blob = await getVideoFrameBlob(fileUrl, seconds);
      const path = `${userId}/performance-videos/${Date.now()}_ai-review-frame-${index}.jpg`;
      const uploaded = await uploadPublicFile("documents", path, blob, "image/jpeg");
      frameUrls.push(uploaded.url);
    } catch {
      // Mobile treats individual frame extraction failures as non-fatal.
    }
  }
  return frameUrls;
};

export const uploadApplicationCv = async (file: File, userId: string, reporter: StageReporter) => {
  const startedAt = now();
  stage(reporter, { id: "cv-upload", group: "UPLOADS", label: "CV upload", state: "processing", startedAt });
  const extension = fileExtension(file, "pdf");
  const path = `${userId}/cvs/${Date.now()}_${sanitizeFileName(file.name || `cv.${extension}`, `cv.${extension}`)}`;
  try {
    const uploaded = await uploadPublicFile("documents", path, file, file.type || "application/pdf");
    finishStage(reporter, { id: "cv-upload", group: "UPLOADS", label: "CV upload", state: "success", startedAt, storagePath: `documents/${path}`, message: "CV uploaded." });
    return uploaded;
  } catch (error) {
    finishStage(reporter, { id: "cv-upload", group: "UPLOADS", label: "CV upload", state: "failed", startedAt, storagePath: `documents/${path}`, message: safeMessage(error) });
    throw error;
  }
};

export const uploadApplicationVideo = async (file: File, userId: string, consent: boolean, reporter: StageReporter): Promise<UploadedVideo> => {
  if (file.size > 50 * 1024 * 1024) throw new Error(`Video must be under 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
  const objectUrl = URL.createObjectURL(file);
  let sample: Awaited<ReturnType<typeof createCopyrightVideoSample>> | null = null;
  try {
    const visualStart = now();
    stage(reporter, { id: "video-validation", group: "UPLOADS", label: "Visual upload safety validation", state: "processing", startedAt: visualStart, edgeFunction: "upload-safety-screen" });
    await screenVisualUpload({ uri: objectUrl, name: file.name, mimeType: file.type || "video/mp4", size: file.size, kind: "video" }, "gig_video_content");
    finishStage(reporter, { id: "video-validation", group: "UPLOADS", label: "Visual upload safety validation", state: "success", startedAt: visualStart, edgeFunction: "upload-safety-screen", httpStatus: 200, message: "Video content passed safety screening." });

    const acrStart = now();
    stage(reporter, { id: "acrcloud", group: "ACRCLOUD", label: "Recording recognition", state: "processing", startedAt: acrStart, edgeFunction: "upload-safety-screen" });
    sample = await createCopyrightVideoSample({ uri: objectUrl, fileName: file.name, mimeType: file.type || "video/mp4", webFile: file });
    const [decision] = await screenUploadsWithAiDecisions([{
      name: file.name, mimeType: file.type || "video/mp4", size: file.size,
      uri: objectUrl, kind: "video", contentDataUrl: sample.contentDataUrl,
    }], "gig_application_performance_video");
    if (!decision?.allowed) throw new Error(decision?.reason || "The performance video could not pass copyright screening.");
    finishStage(reporter, {
      id: "acrcloud", group: "ACRCLOUD", label: "Recording recognition", state: decision.requiresAdminReview ? "warning" : "success",
      startedAt: acrStart, edgeFunction: "upload-safety-screen", httpStatus: 200,
      message: decision.reason || "Recording recognition completed.", details: decision.copyrightMetadata,
    });

    const uploadStart = now();
    const extension = fileExtension(file, "mp4");
    const path = `${userId}/performance-videos/${Date.now()}_video.${extension}`;
    stage(reporter, { id: "video-upload", group: "UPLOADS", label: "Performance video upload", state: "processing", startedAt: uploadStart, storagePath: `documents/${path}` });
    const uploaded = await uploadPublicFile("documents", path, file, file.type || "video/mp4");
    if (decision.copyrightReviewId) {
      await supabase.functions.invoke("upload-safety-screen", { body: { action: "link_copyright_review_media", reviewId: decision.copyrightReviewId, mediaUrl: uploaded.url } });
    }
    finishStage(reporter, { id: "video-upload", group: "UPLOADS", label: "Performance video upload", state: "success", startedAt: uploadStart, storagePath: `documents/${path}`, message: "Video uploaded." });

    let frameUrls: string[] = [];
    if (consent) {
      const frameStart = now();
      stage(reporter, { id: "review-frames", group: "PORTFOLIO / VISION", label: "Representative frame extraction", state: "processing", startedAt: frameStart });
      frameUrls = await uploadReviewFrames(objectUrl, userId);
      finishStage(reporter, {
        id: "review-frames", group: "PORTFOLIO / VISION", label: "Representative frame extraction",
        state: frameUrls.length > 0 ? "success" : "warning", startedAt: frameStart,
        message: `${frameUrls.length} representative frame(s) uploaded.`, details: { frameUrls },
      });
    }
    return { url: uploaded.url, path, frameUrls, decision };
  } finally {
    await removeCopyrightVideoTemporaryFile(sample);
    URL.revokeObjectURL(objectUrl);
  }
};

const ensureApplicationEligibility = async (context: SessionContext, gig: LoadedGig, form: ApplicationFormValue) => {
  if (context.profile?.role !== "musician") throw new Error("Only musician accounts may apply to gigs as a solo artist, duo, or group.");
  if (String(gig.status || "").toLowerCase() !== "open") throw new Error("This gig is no longer accepting applications.");
  const deadline = getGigApplicationDeadlineInfo(gig);
  if (deadline?.isPassed) throw new Error("Applications for this gig are already closed because the event has already started.");

  const selectedGroup = form.selectedGroupId ? context.groups.find((item) => item.id === form.selectedGroupId) : null;
  const isGroup = Boolean(selectedGroup);
  const requiredType = gig.requirements?.musician_type || "both";
  if (requiredType === "group" && !isGroup) throw new Error("This gig requires applications from groups. Please select a group to apply.");
  if (requiredType === "solo" && isGroup) throw new Error("This gig only accepts individual applications.");
  const slots = gig.requirements?.slots || {};
  const requiredSlots = (["solo", "duo", "band"] as const).filter((item) => Number(slots?.[item]?.needed || 0) > 0);
  if (requiredSlots.length > 0 && (!form.slotType || !requiredSlots.includes(form.slotType as any))) {
    throw new Error("Please select a valid category (Individual, Duo, or Group) based on the gig requirements.");
  }
  if (form.slotType && form.slotType !== "solo" && !isGroup) throw new Error("Duo/Group applications require selecting a group before submitting.");
  if ((form.slotType === "duo" || form.slotType === "band") && selectedGroup?.group_type !== form.slotType) {
    throw new Error(form.slotType === "duo" ? "This slot requires a Duo profile." : "This slot requires a Band profile.");
  }
  if (!form.pitchMessage.trim()) throw new Error("Please tell the organizer why you are a good fit for this gig.");

  const cooldownDays = Number(gig.reapplication_cooldown_days ?? 30);
  if (cooldownDays > 0) {
    let query = supabase.from("gig_applications").select("id, rejected_at, created_at").eq("gig_id", gig.id).eq("status", "rejected").order("rejected_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1);
    query = form.selectedGroupId ? query.eq("group_id", form.selectedGroupId) : query.eq("applicant_id", context.userId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    const cooldown = getGigReapplicationCooldownInfo({
      cooldownDays, rejectedAt: data?.rejected_at, createdAt: data?.created_at,
      eventDate: gig.event_date, eventStartTime: gig.requirements?.event_start_time,
    });
    if (cooldown.isActive) throw new Error(cooldown.message || "Your last application was declined. Please wait before applying again.");
  }
  if (gig.requirements?.total_slots_needed) {
    const { count: acceptedCount, error } = await supabase.from("gig_applications").select("id", { count: "exact", head: true }).eq("gig_id", gig.id).eq("status", "accepted");
    if (!error && Number(acceptedCount || 0) >= Number(gig.requirements.total_slots_needed)) throw new Error("All performer slots have been filled for this gig.");
  }
  return selectedGroup;
};

export const submitApplication = async (
  context: SessionContext,
  gig: LoadedGig,
  form: ApplicationFormValue,
  files: ApplicationFiles,
  reporter: StageReporter,
): Promise<PortalResult> => {
  if (!files.cv) throw new Error("Please upload your CV/Resume to apply.");
  if (!files.video) throw new Error("Please upload a performance video to apply.");
  const stages: DebugStage[] = [];
  const collect: StageReporter = (next) => { const index = stages.findIndex((item) => item.id === next.id); if (index >= 0) stages.splice(index, 1); stages.push(next); reporter(next); };
  const validationStart = now();
  stage(collect, { id: "application-validation", group: "APPLICATION", label: "Application validation", state: "processing", startedAt: validationStart });
  const selectedGroup = await ensureApplicationEligibility(context, gig, form);
  finishStage(collect, { id: "application-validation", group: "APPLICATION", label: "Application validation", state: "success", startedAt: validationStart, message: "Mobile eligibility, deadline, cooldown, category, and capacity checks passed." });

  const cv = await uploadApplicationCv(files.cv, context.userId, collect);
  const video = await uploadApplicationVideo(files.video, context.userId, form.aiPortfolioReviewConsent, collect);
  if (video.decision.allowed !== true) throw new Error("Upload the performance video again so its audio can be checked for advisory genre evidence.");

  if (selectedGroup) {
    const { data: duplicate, error: duplicateError } = await supabase.from("gig_applications").select("id, status").eq("gig_id", gig.id).eq("group_id", selectedGroup.id).in("status", ["pending", "accepted", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new Error("This group has already applied to this gig.");
  }

  const applicationStart = now();
  stage(collect, { id: "application-save", group: "APPLICATION", label: "Save application", state: "processing", startedAt: applicationStart, databaseOperation: "INSERT gig_applications" });
  const payload = {
    applicant_id: context.userId,
    gig_id: gig.id,
    group_id: selectedGroup?.id || null,
    is_solo_application: !selectedGroup,
    slot_type: form.slotType || null,
    submitted_by_user_id: context.userId,
    leader_approval_status: selectedGroup ? (selectedGroup.owner_id === context.userId ? "approved" : "pending") : null,
    pitch_message: form.pitchMessage,
    video_url: video.url,
    cv_url: cv.url,
    ai_portfolio_review_consent: form.aiPortfolioReviewConsent,
    ai_review_frame_url: form.aiPortfolioReviewConsent ? video.frameUrls[0] || null : null,
    ai_review_frame_urls: form.aiPortfolioReviewConsent ? video.frameUrls.slice(0, 3) : [],
    video_copyright_acknowledged: false,
    video_copyright_status: video.decision.copyrightStatus || "not_required",
    video_copyright_review_id: video.decision.copyrightReviewId || null,
    video_copyright_metadata: video.decision.copyrightMetadata || {},
    status: "pending",
  };
  let { data: application, error } = await supabase.from("gig_applications").insert(payload).select().single();
  if ((error?.code === "42703" || error?.code === "PGRST204") && String(error.message || "").includes("leader_approval_status")) {
    const { leader_approval_status: _legacyOmit, ...legacyPayload } = payload;
    ({ data: application, error } = await supabase.from("gig_applications").insert(legacyPayload).select().single());
  }
  if (error) {
    finishStage(collect, { id: "application-save", group: "APPLICATION", label: "Save application", state: "failed", startedAt: applicationStart, databaseOperation: "INSERT gig_applications", message: safeMessage(error) });
    throw error;
  }
  finishStage(collect, { id: "application-save", group: "APPLICATION", label: "Save application", state: "success", startedAt: applicationStart, databaseOperation: "INSERT gig_applications", message: `Application ${application.id} saved.` });

  if (gig.organizer_id && gig.organizer_id !== context.userId && (!selectedGroup || selectedGroup.owner_id === context.userId)) {
    void supabase.functions.invoke("listings-crud", { body: {
      action: "create_notification", userId: context.userId, targetUserId: gig.organizer_id,
      type: "info", title: "New Gig Application", message: `You have a new application for "${gig.name}".`,
      meta: { gig_id: gig.id, application_id: application.id, applicant_id: context.userId, group_id: selectedGroup?.id || null },
    } });
  }
  if (gig.embedding) void supabase.rpc("update_user_interest", { p_user_id: context.userId, p_item_vector: gig.embedding, p_weight: 0.4 });

  let queueResult: unknown = null;
  if (form.aiPortfolioReviewConsent && (!selectedGroup || selectedGroup.owner_id === context.userId)) {
    const queueStart = now();
    stage(collect, { id: "ai-queue", group: "APPLICATION", label: "Queue consented AI review", state: "processing", startedAt: queueStart, edgeFunction: "gig-applications" });
    const { data, error: queueError } = await supabase.functions.invoke("gig-applications", { body: { action: "request_ai_portfolio_review", applicationId: application.id, userId: context.userId } });
    if (queueError) {
      finishStage(collect, { id: "ai-queue", group: "APPLICATION", label: "Queue consented AI review", state: "warning", startedAt: queueStart, edgeFunction: "gig-applications", message: safeMessage(queueError) });
    } else {
      queueResult = data;
      finishStage(collect, { id: "ai-queue", group: "APPLICATION", label: "Queue consented AI review", state: "success", startedAt: queueStart, edgeFunction: "gig-applications", httpStatus: 202, message: `Review state: ${(data as any)?.status || "queued"}` });
    }
  }

  return {
    operation: "submit_application", success: true, gigId: gig.id, applicationId: application.id,
    organizerId: gig.organizer_id, profileId: context.userId, createdStatus: application.status,
    backendResult: { application, queueResult }, stages, completedAt: now(),
  };
};

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const pollApplicationDebug = async (
  applicationId: string,
  reporter: StageReporter,
  maxAttempts = 30,
): Promise<{ aiReview: any; recommendation: any }> => {
  let aiReview: any = null;
  let recommendation: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [reviewResult, recommendationResult] = await Promise.all([
      supabase.from("gig_application_ai_reviews").select("*").eq("application_id", applicationId).maybeSingle(),
      supabase.from("gig_application_recommendations").select("*").eq("application_id", applicationId).maybeSingle(),
    ]);
    if (!reviewResult.error) aiReview = reviewResult.data;
    if (!recommendationResult.error) recommendation = recommendationResult.data;
    if (aiReview) {
      const state: StageState = aiReview.status === "failed" ? "failed" : ["completed", "partial"].includes(aiReview.status) ? (aiReview.status === "partial" ? "warning" : "success") : "processing";
      reporter({ id: "ai-review", group: "TRANSCRIPTION / CV / VISION / FACE", label: "Consent-gated portfolio review", state, startedAt: aiReview.started_at || aiReview.created_at, finishedAt: aiReview.completed_at || undefined, message: aiReview.error_message || aiReview.overall_summary || `Review is ${aiReview.status}.`, details: aiReview });
      if (["completed", "partial", "failed", "consent_revoked"].includes(aiReview.status)) {
        const source = aiReview.source_summary || {};
        const reviewFailed = aiReview.status === "failed";
        reporter({
          id: "transcription", group: "TRANSCRIPTION", label: "Groq / Whisper transcription",
          state: reviewFailed ? "failed" : source.video_transcribed ? "success" : "warning",
          message: reviewFailed ? "The review failed before transcription completed." : source.video_transcribed
            ? "Completed. The backend stores derived evidence rather than exposing the raw transcript."
            : "No usable transcript was produced.",
        });
        const classification = source.cv_document_classification || {};
        reporter({
          id: "cv-analysis", group: "CV ANALYSIS", label: "CV extraction and classification",
          state: reviewFailed ? "failed" : classification.status === "cv" ? "success" : "warning",
          message: classification.summary || "No CV classification summary was stored.", details: {
            text_extracted: source.cv_text_extracted,
            classification,
            criteria: source.cv_requirement_review || [],
          },
        });
        const visualCount = Number(source.video_frames_reviewed || 0) + Number(source.portfolio_images_reviewed || 0);
        reporter({
          id: "vision-analysis", group: "PORTFOLIO / VISION", label: "Groq Vision portfolio analysis",
          state: reviewFailed ? "failed" : visualCount > 0 ? "success" : "warning",
          message: `${Number(source.video_frames_reviewed || 0)} video frame(s) and ${Number(source.portfolio_images_reviewed || 0)} portfolio image(s) produced stored observations.`,
        });
        const face = aiReview.face_similarity || {};
        reporter({
          id: "face-verification", group: "FACE VERIFICATION", label: "Face++ Compare similarity",
          state: reviewFailed ? "failed" : face.status && face.status !== "not_run" ? "success" : "warning",
          message: face.summary || "Face similarity was not run.", details: { solo: face, group: aiReview.group_face_similarity || [] },
        });
        reporter({
          id: "evidence-store", group: "APPLICATION", label: "Evidence stored",
          state: reviewFailed ? "failed" : "success", databaseOperation: "UPDATE gig_application_ai_reviews",
          message: `${Array.isArray(aiReview.evidence) ? aiReview.evidence.length : 0} criterion evidence record(s) stored.`,
        });
        break;
      }
    }
    await delay(2000);
  }
  if (!aiReview) reporter({ id: "ai-review", group: "TRANSCRIPTION / CV / VISION / FACE", label: "Consent-gated portfolio review", state: "warning", message: "No AI review row is visible yet. Consent may be off, group-leader approval may be pending, or RLS may hide it." });
  if (!recommendation) reporter({ id: "recommendation", group: "RECOMMENDATION", label: "Stored recommendation", state: "warning", message: "No stored recommendation is visible. Mobile materializes recommendations through organizer fetch actions; applicant RLS does not expose manager-only recommendation data." });
  else reporter({ id: "recommendation", group: "RECOMMENDATION", label: "Stored recommendation", state: "success", message: `${recommendation.recommendation_status || "Generated"} · score ${recommendation.score ?? "n/a"}`, details: recommendation });
  return { aiReview, recommendation };
};

export const loadApplicationDebug = async (applicationId: string) => {
  if (!applicationId.trim()) throw new Error("Application ID is required.");
  const [{ data: application, error }, reviewResult, recommendationResult] = await Promise.all([
    supabase.from("gig_applications").select("*").eq("id", applicationId.trim()).single(),
    supabase.from("gig_application_ai_reviews").select("*").eq("application_id", applicationId.trim()).maybeSingle(),
    supabase.from("gig_application_recommendations").select("*").eq("application_id", applicationId.trim()).maybeSingle(),
  ]);
  if (error) throw error;
  return { application, aiReview: reviewResult.data || null, recommendation: recommendationResult.data || null };
};
