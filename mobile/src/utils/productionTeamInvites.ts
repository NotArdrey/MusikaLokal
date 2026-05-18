import { supabase } from "../../lib/supabase";
import { submitListingRequest } from "./listingRequests";

export type ProductionInviteFilter = "all" | "musician" | "duo" | "group";
export type ProductionInviteKind = "musician" | "duo" | "group";

export type ProductionInviteTarget = {
  key: string;
  id: string;
  kind: ProductionInviteKind;
  receiverType: "musician" | "group";
  receiverEntityId: string;
  receiverUserId: string;
  groupId: string | null;
  displayName: string;
  subtitle: string;
  image: string | null;
};

type SearchInviteTargetsParams = {
  currentUserId?: string | null;
  searchQuery: string;
  filter: ProductionInviteFilter;
};

type SendProductionInvitesParams = {
  currentUserId: string;
  teamId: string;
  teamName: string;
  teamLogoUrl?: string | null;
  inviteMessage?: string | null;
  inviteTargets: ProductionInviteTarget[];
};

const DEFAULT_INVITE_ROUTE_PARAMS = { tab: "Pending" };

const normalizeText = (value: unknown) => String(value ?? "").trim();

const buildTargetSubtitle = (parts: (string | null | undefined)[]) =>
  parts.map((part) => normalizeText(part)).filter(Boolean).join(" • ");

export async function searchProductionInviteTargets({
  currentUserId,
  searchQuery,
  filter,
}: SearchInviteTargetsParams): Promise<ProductionInviteTarget[]> {
  const normalizedQuery = normalizeText(searchQuery);
  if (normalizedQuery.length < 2) {
    return [];
  }

  const shouldSearchProfiles = filter === "all" || filter === "musician";
  const shouldSearchGroups = filter === "all" || filter === "duo" || filter === "group";

  const profilePromise = shouldSearchProfiles
    ? (() => {
        let query = supabase
          .from("profiles")
          .select("id, full_name, avatar_url, address, role")
          .eq("role", "musician")
          .or(`full_name.ilike.%${normalizedQuery}%,address.ilike.%${normalizedQuery}%`)
          .limit(10);

        if (currentUserId) {
          query = query.neq("id", currentUserId);
        }

        return query;
      })()
    : Promise.resolve({ data: [], error: null } as any);

  const groupPromise = shouldSearchGroups
    ? (() => {
        const allowedGroupTypes =
          filter === "duo" ? ["duo"] : filter === "group" ? ["band"] : ["duo", "band"];

        let query = supabase
          .from("groups_with_stats")
          .select("id, owner_id, name, images, group_type, genre, location")
          .in("group_type", allowedGroupTypes)
          .or(`name.ilike.%${normalizedQuery}%,genre.ilike.%${normalizedQuery}%,location.ilike.%${normalizedQuery}%`)
          .limit(10);

        if (currentUserId) {
          query = query.neq("owner_id", currentUserId);
        }

        return query;
      })()
    : Promise.resolve({ data: [], error: null } as any);

  const [profileResponse, groupResponse] = await Promise.all([profilePromise, groupPromise]);

  if (profileResponse.error) {
    throw profileResponse.error;
  }

  if (groupResponse.error) {
    throw groupResponse.error;
  }

  const profileTargets = ((profileResponse.data || []) as any[]).map((profile) => ({
    key: `musician:${profile.id}`,
    id: profile.id,
    kind: "musician" as const,
    receiverType: "musician" as const,
    receiverEntityId: profile.id,
    receiverUserId: profile.id,
    groupId: null,
    displayName: profile.full_name || "Musician",
    subtitle: buildTargetSubtitle(["Musician", profile.address || null]),
    image: profile.avatar_url || null,
  }));

  const groupTargets = ((groupResponse.data || []) as any[]).map((group) => {
    const kind: ProductionInviteKind = group.group_type === "duo" ? "duo" : "group";
    return {
      key: `${kind}:${group.id}`,
      id: group.id,
      kind,
      receiverType: "group" as const,
      receiverEntityId: group.id,
      receiverUserId: group.owner_id,
      groupId: group.id,
      displayName: group.name || (kind === "duo" ? "Duo" : "Group"),
      subtitle: buildTargetSubtitle([
        kind === "duo" ? "Duo" : "Group",
        group.genre || null,
        group.location || null,
      ]),
      image: Array.isArray(group.images) ? group.images[0] || null : null,
    };
  });

  return [...profileTargets, ...groupTargets];
}

export async function sendProductionTeamInvites({
  currentUserId,
  teamId,
  teamName,
  teamLogoUrl,
  inviteMessage,
  inviteTargets,
}: SendProductionInvitesParams) {
  const normalizedTeamName = normalizeText(teamName) || "Production Team";
  const normalizedInviteMessage =
    normalizeText(inviteMessage) ||
    `${normalizedTeamName} invited you to join their production team on MusikaLokal.`;

  const failures: { target: ProductionInviteTarget; error: string }[] = [];
  let sentCount = 0;

  for (const target of inviteTargets) {
    try {
      await submitListingRequest({
        currentUserId,
        receiverUserId: target.receiverUserId,
        message: normalizedInviteMessage,
        senderEntityType: "production_team",
        senderEntityName: normalizedTeamName,
        senderEntityId: teamId,
        receiverEntityType: target.receiverType,
        receiverEntityName: target.displayName,
        receiverEntityId: target.receiverEntityId,
        groupId: target.groupId,
        productionTeamId: teamId,
        notificationTitle: "New production team invite",
        notificationMessage:
          target.kind === "musician"
            ? `${normalizedTeamName} invited you to join their production team.`
            : `${normalizedTeamName} invited ${target.displayName} to join their production team.`,
        notificationImage: teamLogoUrl || null,
        routePath: "/bookings",
        routeParams: DEFAULT_INVITE_ROUTE_PARAMS,
        extraMeta: {
          source: "production_team_editor",
          request_kind: "invite",
          team_logo_url: teamLogoUrl || null,
          production_team_logo_url: teamLogoUrl || null,
          request_details: {
            pitch_message: normalizedInviteMessage,
            context_label: "Invite Context",
            request_kind: "invite",
            team_logo_url: teamLogoUrl || null,
            roster_entry_name: target.displayName,
            roster_entry_kind: target.kind,
          },
        },
      });
      sentCount += 1;
    } catch (error: any) {
      failures.push({
        target,
        error: error?.message || "Failed to send invite.",
      });
    }
  }

  return {
    sentCount,
    failedCount: failures.length,
    failures,
  };
}
