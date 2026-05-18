import { supabase } from "../../lib/supabase";
import { submitListingRequest } from "./listingRequests";

export type GroupInviteTarget = {
  key: string;
  id: string;
  receiverUserId: string;
  displayName: string;
  subtitle: string;
  image: string | null;
};

type SearchGroupInviteTargetsParams = {
  currentUserId?: string | null;
  groupId?: string | null;
  searchQuery: string;
};

type SendGroupMemberInvitesParams = {
  currentUserId: string;
  groupId: string;
  groupName: string;
  groupImageUrl?: string | null;
  inviteMessage?: string | null;
  inviteTargets: GroupInviteTarget[];
};

const DEFAULT_INVITE_ROUTE_PARAMS = { tab: "Pending" };

const normalizeText = (value: unknown) => String(value ?? "").trim();

const buildTargetSubtitle = (parts: (string | null | undefined)[]) =>
  parts.map((part) => normalizeText(part)).filter(Boolean).join(" | ");

export async function searchGroupInviteTargets({
  currentUserId,
  groupId,
  searchQuery,
}: SearchGroupInviteTargetsParams): Promise<GroupInviteTarget[]> {
  const normalizedQuery = normalizeText(searchQuery);
  if (normalizedQuery.length < 2) {
    return [];
  }

  let profileQuery = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, address, role")
    .eq("role", "musician")
    .or(`full_name.ilike.%${normalizedQuery}%,address.ilike.%${normalizedQuery}%`)
    .limit(10);

  if (currentUserId) {
    profileQuery = profileQuery.neq("id", currentUserId);
  }

  const memberQuery = groupId
    ? supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
    : Promise.resolve({ data: [], error: null } as any);

  const [profileResponse, memberResponse] = await Promise.all([
    profileQuery,
    memberQuery,
  ]);

  if (profileResponse.error) {
    throw profileResponse.error;
  }

  if (memberResponse.error) {
    throw memberResponse.error;
  }

  const existingMemberIds = new Set(
    (memberResponse.data || [])
      .map((member: any) => normalizeText(member?.user_id))
      .filter(Boolean),
  );

  return ((profileResponse.data || []) as any[])
    .filter((profile) => !existingMemberIds.has(profile.id))
    .map((profile) => ({
      key: `musician:${profile.id}`,
      id: profile.id,
      receiverUserId: profile.id,
      displayName: profile.full_name || "Musician",
      subtitle: buildTargetSubtitle(["Musician", profile.address || null]),
      image: profile.avatar_url || null,
    }));
}

export async function sendGroupMemberInvites({
  currentUserId,
  groupId,
  groupName,
  groupImageUrl,
  inviteMessage,
  inviteTargets,
}: SendGroupMemberInvitesParams) {
  const normalizedGroupName = normalizeText(groupName) || "Group";
  const normalizedInviteMessage =
    normalizeText(inviteMessage) ||
    `${normalizedGroupName} invited you to join their group on MusikaLokal.`;

  const failures: { target: GroupInviteTarget; error: string }[] = [];
  let sentCount = 0;

  for (const target of inviteTargets) {
    try {
      await submitListingRequest({
        currentUserId,
        receiverUserId: target.receiverUserId,
        message: normalizedInviteMessage,
        senderEntityType: "group",
        senderEntityName: normalizedGroupName,
        senderEntityId: groupId,
        receiverEntityType: "musician",
        receiverEntityName: target.displayName,
        receiverEntityId: target.id,
        groupId,
        productionTeamId: null,
        notificationTitle: "New group invite",
        notificationMessage: `${normalizedGroupName} invited you to join their group.`,
        notificationImage: groupImageUrl || null,
        routePath: "/bookings",
        routeParams: DEFAULT_INVITE_ROUTE_PARAMS,
        extraMeta: {
          source: "group_editor",
          request_kind: "invite",
          application_scope: "group_member",
          group_id: groupId,
          request_details: {
            pitch_message: normalizedInviteMessage,
            context_label: "Invite Context",
            request_kind: "invite",
            application_scope: "group_member",
            roster_entry_name: target.displayName,
            roster_entry_kind: "musician",
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
