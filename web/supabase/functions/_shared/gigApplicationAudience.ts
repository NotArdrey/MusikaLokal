export type GigApplicationViewerAccess =
  | "applicant"
  | "production_manager"
  | "selected_performer"
  | "group_member"
  | "organizer";

export type GigApplicationAudienceMember = {
  user_id: string;
  viewer_access: GigApplicationViewerAccess;
  viewer_can_act: boolean;
  viewer_read_only_reason?: string | null;
};

type AudienceOptions = {
  includeApplicant?: boolean;
  includeOrganizer?: boolean;
  includeProductionManagers?: boolean;
  includeReadOnlyPerformers?: boolean;
};

const APPLICATION_AUDIENCE_SELECT = `
  id,
  applicant_id,
  submitted_by_user_id,
  group_id,
  gig_id,
  production_team_id,
  production_roster_id,
  gig:gig_id(id, name, organizer_id),
  group:group_id(id, name, owner_id, group_type),
  production_team:production_team_id(id, name),
  production_roster:production_roster_id(
    id,
    entity_kind,
    profile_id,
    group_id,
    roster_profile:profile_id(id, full_name),
    roster_group:group_id(id, name, owner_id, group_type)
  )
`;

const ACCESS_PRIORITY: Record<GigApplicationViewerAccess, number> = {
  organizer: 50,
  production_manager: 40,
  applicant: 30,
  selected_performer: 20,
  group_member: 10,
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addAudienceMember(
  membersByUserId: Map<string, GigApplicationAudienceMember>,
  member: GigApplicationAudienceMember | null,
) {
  if (!member?.user_id) return;

  const existing = membersByUserId.get(member.user_id);
  if (
    existing &&
    ACCESS_PRIORITY[existing.viewer_access] >= ACCESS_PRIORITY[member.viewer_access]
  ) {
    return;
  }

  membersByUserId.set(member.user_id, member);
}

async function loadApplication(supabaseAdmin: any, applicationOrId: any) {
  if (applicationOrId && typeof applicationOrId === "object") {
    return applicationOrId;
  }

  const applicationId = readString(applicationOrId);
  if (!applicationId) return null;

  const { data, error } = await supabaseAdmin
    .from("gig_applications")
    .select(APPLICATION_AUDIENCE_SELECT)
    .eq("id", applicationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadGroupAudienceMembers(
  supabaseAdmin: any,
  groupId: string | null,
): Promise<string[]> {
  if (!groupId) return [];

  const userIds = new Set<string>();

  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups")
    .select("owner_id")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (group?.owner_id) userIds.add(group.owner_id);

  const { data: members, error: membersError } = await supabaseAdmin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  if (membersError) throw membersError;

  (members || []).forEach((member: any) => {
    if (member?.user_id) userIds.add(member.user_id);
  });

  return Array.from(userIds);
}

async function loadProductionManagerIds(
  supabaseAdmin: any,
  teamId: string | null,
) {
  if (!teamId) return [];

  const { data, error } = await supabaseAdmin
    .from("production_team_members")
    .select("user_id, role")
    .eq("team_id", teamId)
    .in("role", ["owner", "manager"]);

  if (error) throw error;

  return (data || [])
    .map((member: any) => readString(member?.user_id))
    .filter((userId: string | null): userId is string => !!userId);
}

export async function resolveGigApplicationAudience(
  supabaseAdmin: any,
  applicationOrId: any,
  options: AudienceOptions = {},
): Promise<{
  application: any | null;
  audience: GigApplicationAudienceMember[];
}> {
  const application = await loadApplication(supabaseAdmin, applicationOrId);
  const membersByUserId = new Map<string, GigApplicationAudienceMember>();

  if (!application) {
    return { application: null, audience: [] };
  }

  const includeApplicant = options.includeApplicant !== false;
  const includeOrganizer = options.includeOrganizer === true;
  const includeProductionManagers = options.includeProductionManagers !== false;
  const includeReadOnlyPerformers = options.includeReadOnlyPerformers !== false;

  if (includeOrganizer && application.gig?.organizer_id) {
    addAudienceMember(membersByUserId, {
      user_id: application.gig.organizer_id,
      viewer_access: "organizer",
      viewer_can_act: true,
      viewer_read_only_reason: null,
    });
  }

  if (application.production_team_id) {
    if (includeProductionManagers) {
      const managerIds = await loadProductionManagerIds(
        supabaseAdmin,
        application.production_team_id,
      );

      managerIds.forEach((userId) => {
        addAudienceMember(membersByUserId, {
          user_id: userId,
          viewer_access: "production_manager",
          viewer_can_act: true,
          viewer_read_only_reason: null,
        });
      });
    }

    const submitterId =
      readString(application.submitted_by_user_id) ||
      readString(application.applicant_id);

    if (submitterId) {
      addAudienceMember(membersByUserId, {
        user_id: submitterId,
        viewer_access: "production_manager",
        viewer_can_act: true,
        viewer_read_only_reason: null,
      });
    }
  } else if (includeApplicant && application.applicant_id) {
    addAudienceMember(membersByUserId, {
      user_id: application.applicant_id,
      viewer_access: "applicant",
      viewer_can_act: true,
      viewer_read_only_reason: null,
    });
  }

  if (includeReadOnlyPerformers) {
    const rosterProfileId = readString(
      application.production_roster?.profile_id ||
        application.production_roster?.roster_profile?.id,
    );
    const rosterGroupId = readString(
      application.production_roster?.group_id ||
        application.production_roster?.roster_group?.id,
    );
    const directGroupId = readString(application.group_id);

    if (application.production_team_id && rosterProfileId) {
      addAudienceMember(membersByUserId, {
        user_id: rosterProfileId,
        viewer_access: "selected_performer",
        viewer_can_act: false,
        viewer_read_only_reason:
          "This application was submitted by a production team on your behalf.",
      });
    }

    const visibleGroupId = rosterGroupId || directGroupId;
    if (visibleGroupId) {
      const groupMemberIds = await loadGroupAudienceMembers(
        supabaseAdmin,
        visibleGroupId,
      );

      groupMemberIds.forEach((userId) => {
        addAudienceMember(membersByUserId, {
          user_id: userId,
          viewer_access: "group_member",
          viewer_can_act: false,
          viewer_read_only_reason:
            "You can view this application because you are a member of the selected group or duo.",
        });
      });
    }
  }

  return {
    application,
    audience: Array.from(membersByUserId.values()),
  };
}

export async function getGigApplicationAudienceMemberForUser(
  supabaseAdmin: any,
  applicationOrId: any,
  userId: string,
) {
  const { audience } = await resolveGigApplicationAudience(
    supabaseAdmin,
    applicationOrId,
  );

  return audience.find((member) => member.user_id === userId) || null;
}

export function buildGigApplicationAudienceMeta(
  application: any,
  member: GigApplicationAudienceMember,
  extraMeta: Record<string, unknown> = {},
) {
  return {
    ...extraMeta,
    application_id: application?.id || extraMeta.application_id || null,
    gig_id: application?.gig_id || extraMeta.gig_id || null,
    group_id: application?.group_id || extraMeta.group_id || null,
    production_team_id:
      application?.production_team_id || extraMeta.production_team_id || null,
    production_roster_id:
      application?.production_roster_id ||
      extraMeta.production_roster_id ||
      null,
    viewer_access: member.viewer_access,
    viewer_can_act: member.viewer_can_act,
  };
}
