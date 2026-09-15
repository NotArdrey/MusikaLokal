export const ACTIVITY_PREVIEW_ENABLED =
  process.env.EXPO_PUBLIC_ACTIVITY_PREVIEW === "1";

export type ActivityPreviewEntity = {
  kind: "gig" | "production" | "group";
  id: string;
  name: string;
  image?: string | null;
  date?: string | null;
  location?: string | null;
};

export type ActivityPreviewStatus = "pending" | "accepted" | "declined" | "completed";
export type ActivityPreviewStatusMap = Record<string, ActivityPreviewStatus>;

const APPLICANT_IMAGES = [
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&fit=crop",
  "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&fit=crop",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&fit=crop",
];

const getCreatedAt = () => new Date().toISOString();

const toDisplayStatus = (status: ActivityPreviewStatus) => {
  if (status === "accepted") return "Accepted";
  if (status === "declined") return "Declined";
  if (status === "completed") return "Completed";
  return "Pending";
};

const buildGigApplicationPreview = ({
  applicantName,
  applicantNumber,
  entity,
  status,
}: {
  applicantName: string;
  applicantNumber: number;
  entity: ActivityPreviewEntity;
  status: ActivityPreviewStatus;
}) => {
  const id = `preview-gig-application-${applicantNumber}`;

  return {
    id,
    application_id: id,
    type_id: "gig_application",
    type: "Gig Application",
    gig_id: entity.id,
    gig_name: entity.name,
    gig_title: entity.name,
    gig_image: entity.image || null,
    name: `${entity.name} - ${applicantName}`,
    customer_name: applicantName,
    customer_avatar: APPLICANT_IMAGES[(applicantNumber - 1) % APPLICANT_IMAGES.length],
    application_type: applicantNumber === 2 ? "group" : "solo",
    slot_type: applicantNumber === 1 ? "vocalist" : applicantNumber === 2 ? "full_band" : "guitarist",
    note: applicantNumber === 1
      ? "Soul-pop vocalist available for the full event."
      : applicantNumber === 2
        ? "Five-piece OPM band with a complete live setup."
        : "Lead guitarist available for rehearsals and the live set.",
    raw_date: entity.date || null,
    date: entity.date || "TBA",
    start_time: entity.date || null,
    location: entity.location || null,
    raw_status: status === "declined" ? "rejected" : status,
    status: status === "pending" ? "Applied" : toDisplayStatus(status),
    created_at: getCreatedAt(),
    received_at: getCreatedAt(),
    viewer_can_act: true,
    viewer_access: "organizer",
    is_preview: true,
  };
};

const buildConnectionApplicationPreview = ({
  applicantName,
  applicantNumber,
  entity,
  status,
  userId,
}: {
  applicantName: string;
  applicantNumber: number;
  entity: ActivityPreviewEntity;
  status: ActivityPreviewStatus;
  userId: string;
}) => {
  const id = `preview-${entity.kind}-application-${applicantNumber}`;
  const isProduction = entity.kind === "production";

  return {
    id,
    request_id: id,
    type_id: "booking_request",
    type: isProduction ? "Production Team Application" : "Group Application",
    name: applicantName,
    display_name: applicantName,
    counterparty_name: applicantName,
    image: APPLICANT_IMAGES[(applicantNumber - 1) % APPLICANT_IMAGES.length],
    status: toDisplayStatus(status),
    raw_status: status,
    request_kind: "application",
    request_direction: "incoming",
    application_scope: isProduction ? "production_roster" : "group_member",
    request_application_context: isProduction
      ? "Applied to join the production roster"
      : "Applied to join the group",
    request_context_title: entity.name,
    sender_id: `preview-applicant-${applicantNumber}`,
    sender_entity_id: `preview-applicant-${applicantNumber}`,
    sender_entity_name: applicantName,
    sender_entity_type: "musician",
    receiver_id: userId,
    receiver_entity_id: entity.id,
    receiver_entity_name: entity.name,
    receiver_entity_type: isProduction ? "production_team" : "group",
    production_team_id: isProduction ? entity.id : null,
    production_team_name: isProduction ? entity.name : null,
    production_team_image: isProduction ? entity.image || null : null,
    group_id: isProduction ? null : entity.id,
    group_name: isProduction ? null : entity.name,
    group_image: isProduction ? null : entity.image || null,
    viewer_is_group_owner: !isProduction,
    message: isProduction
      ? "I would love to support your upcoming live productions."
      : "I would like to audition and join the group.",
    created_at: getCreatedAt(),
    received_at: getCreatedAt(),
    is_preview: true,
  };
};

type PreviewBookingsData = {
  Applicants: any[];
  ActiveMusicians: any[];
  Pending: any[];
  Upcoming: any[];
  Ongoing: any[];
  Review: any[];
  History: any[];
};

const addGigPreviewData = <T extends PreviewBookingsData>(
  data: T,
  entity: ActivityPreviewEntity,
  statuses: ActivityPreviewStatusMap,
): T => {
  const applicants = [
    buildGigApplicationPreview({ applicantName: "Mika Santos", applicantNumber: 1, entity, status: statuses["preview-gig-application-1"] || "pending" }),
    buildGigApplicationPreview({ applicantName: "The Northbound", applicantNumber: 2, entity, status: statuses["preview-gig-application-2"] || "pending" }),
    buildGigApplicationPreview({ applicantName: "Luna Cruz", applicantNumber: 3, entity, status: statuses["preview-gig-application-3"] || "accepted" }),
  ];

  return {
    ...data,
    Applicants: [...applicants.filter((item) => item.raw_status === "pending"), ...data.Applicants],
    ActiveMusicians: [...applicants.filter((item) => item.raw_status === "accepted"), ...data.ActiveMusicians],
    Review: [...applicants.filter((item) => item.raw_status === "completed"), ...data.Review],
    History: [...applicants.filter((item) => item.raw_status === "rejected"), ...data.History],
  };
};

const addConnectionPreviewData = <T extends PreviewBookingsData>(
  data: T,
  entity: ActivityPreviewEntity,
  statuses: ActivityPreviewStatusMap,
  userId: string,
): T => {
  const applications = [1, 2].map((applicantNumber) => {
    const id = `preview-${entity.kind}-application-${applicantNumber}`;
    return buildConnectionApplicationPreview({
      applicantName: applicantNumber === 1 ? "Paolo Reyes" : "Ina Villanueva",
      applicantNumber,
      entity,
      status: statuses[id] || "pending",
      userId,
    });
  });

  return {
    ...data,
    Pending: [...applications.filter((item) => item.raw_status === "pending"), ...data.Pending],
    History: [...applications.filter((item) => item.raw_status !== "pending"), ...data.History],
  };
};

export const withActivityPreviewData = <T extends PreviewBookingsData>(
  data: T,
  role: unknown,
  options: {
    entity: ActivityPreviewEntity | null;
    statuses: ActivityPreviewStatusMap;
    userId: string | null;
  },
): T => {
  if (!ACTIVITY_PREVIEW_ENABLED || !options.entity || !options.userId) return data;

  const normalizedRole = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (normalizedRole === "venue-owner" && options.entity.kind === "gig") {
    return addGigPreviewData(data, options.entity, options.statuses);
  }

  if (
    ["producer", "production", "production-user"].includes(normalizedRole) &&
    options.entity.kind === "production"
  ) {
    return addConnectionPreviewData(data, options.entity, options.statuses, options.userId);
  }

  if (normalizedRole === "musician" && options.entity.kind === "group") {
    return addConnectionPreviewData(data, options.entity, options.statuses, options.userId);
  }

  return data;
};
