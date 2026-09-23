export type PortalTab = "create" | "edit" | "delete" | "application" | "results";

export type StageState = "idle" | "processing" | "success" | "warning" | "failed";

export type DebugStage = {
  id: string;
  group: string;
  label: string;
  state: StageState;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  edgeFunction?: string;
  databaseOperation?: string;
  storagePath?: string;
  httpStatus?: number;
  details?: unknown;
};

export type EventSchedule = {
  date: string;
  start_time: string;
  end_time: string;
};

export type RecommendationCriterionMode = "required" | "ignore";

export type RecommendationSettings = {
  enabled: boolean;
  minimum_score: number;
  location_radius_km: number | null;
  criteria: {
    genres: RecommendationCriterionMode;
    instruments: RecommendationCriterionMode;
    location: RecommendationCriterionMode;
    portfolio: RecommendationCriterionMode;
  };
};

export type GigFormValue = {
  name: string;
  description: string;
  location: string;
  latitude: string;
  longitude: string;
  budget: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  schedules: EventSchedule[];
  genres: string;
  instruments: string;
  soloSlots: string;
  duoSlots: string;
  bandSlots: string;
  soloRoles: string;
  soloGenres: string;
  soloInstruments: string;
  soloSpecificRequirements: GigSpecificSlotRequirement[];
  duoRoles: string;
  duoGenres: string;
  duoInstruments: string;
  duoSpecificRequirements: GigSpecificSlotRequirement[];
  bandRoles: string;
  bandGroupTypes: string;
  bandGenres: string;
  bandInstruments: string;
  reapplicationCooldownHours: string;
  recommendation: RecommendationSettings;
  imageUrls: string[];
  contractUrl: string;
  businessPermitUrl: string;
};

export type LoadedGig = {
  id: string;
  organizer_id: string;
  status: string;
  permit_status?: string | null;
  permit_resubmissions_used?: number | null;
  requirements: Record<string, any>;
  images: string[];
  documents: string[];
  [key: string]: any;
};

export type PortalResult = {
  operation: "create_gig" | "edit_gig" | "delete_gig" | "submit_application" | "load_debug";
  success: boolean;
  gigId?: string;
  applicationId?: string;
  organizerId?: string;
  profileId?: string;
  createdStatus?: string;
  previousValues?: unknown;
  newValues?: unknown;
  changedFields?: string[];
  backendResult?: unknown;
  aiReview?: any;
  recommendation?: any;
  stages: DebugStage[];
  completedAt: string;
};

export type ApplicationFormValue = {
  gigId: string;
  selectedGroupId: string;
  slotType: "" | "solo" | "duo" | "band";
  pitchMessage: string;
  aiPortfolioReviewConsent: boolean;
};

export const DEFAULT_RECOMMENDATION_SETTINGS: RecommendationSettings = {
  enabled: false,
  minimum_score: 75,
  location_radius_km: null,
  criteria: {
    genres: "required",
    instruments: "required",
    location: "required",
    portfolio: "required",
  },
};

export const EMPTY_GIG_FORM: GigFormValue = {
  name: "",
  description: "",
  location: "",
  latitude: "",
  longitude: "",
  budget: "",
  eventDate: "",
  eventStartTime: "06:00 PM",
  eventEndTime: "11:00 PM",
  schedules: [],
  genres: "",
  instruments: "",
  soloSlots: "0",
  duoSlots: "0",
  bandSlots: "0",
  soloRoles: "",
  soloGenres: "",
  soloInstruments: "",
  soloSpecificRequirements: [],
  duoRoles: "",
  duoGenres: "",
  duoInstruments: "",
  duoSpecificRequirements: [],
  bandRoles: "",
  bandGroupTypes: "",
  bandGenres: "",
  bandInstruments: "",
  reapplicationCooldownHours: String(30 * 24),
  recommendation: {
    ...DEFAULT_RECOMMENDATION_SETTINGS,
    criteria: { ...DEFAULT_RECOMMENDATION_SETTINGS.criteria },
  },
  imageUrls: [],
  contractUrl: "",
  businessPermitUrl: "",
};
import type { GigSpecificSlotRequirement } from "../../../src/utils/gigSlotRequirements";
