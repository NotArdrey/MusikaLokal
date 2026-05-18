import { submitListingRequest } from "./listingRequests";
import { ProductionInviteTarget } from "./productionTeamInvites";

type SendVenueGigInvitesParams = {
  currentUserId: string;
  gigId: string;
  gigName: string;
  gigImage?: string | null;
  inviteMessage?: string | null;
  inviteTargets: ProductionInviteTarget[];
};

const DEFAULT_INVITE_ROUTE_PARAMS = { tab: "Pending" };

const normalizeText = (value: unknown) => String(value ?? "").trim();

export async function sendVenueGigInvites({
  currentUserId,
  gigId,
  gigName,
  gigImage,
  inviteMessage,
  inviteTargets,
}: SendVenueGigInvitesParams) {
  const normalizedGigName = normalizeText(gigName) || "Gig";
  const normalizedInviteMessage =
    normalizeText(inviteMessage) ||
    `${normalizedGigName} invited you to perform on MusikaLokal.`;

  const failures: { target: ProductionInviteTarget; error: string }[] = [];
  let sentCount = 0;

  for (const target of inviteTargets) {
    try {
      await submitListingRequest({
        currentUserId,
        receiverUserId: target.receiverUserId,
        message: normalizedInviteMessage,
        senderEntityType: "venue",
        senderEntityName: normalizedGigName,
        senderEntityId: gigId,
        receiverEntityType: target.receiverType,
        receiverEntityName: target.displayName,
        receiverEntityId: target.receiverEntityId,
        groupId: target.groupId,
        notificationTitle: "New gig invite",
        notificationMessage:
          target.kind === "musician"
            ? `${normalizedGigName} invited you to perform.`
            : `${normalizedGigName} invited ${target.displayName} to perform.`,
        notificationImage: gigImage || null,
        routePath: "/bookings",
        routeParams: DEFAULT_INVITE_ROUTE_PARAMS,
        extraMeta: {
          source: "manage_gig",
          request_kind: "invite",
          listing_id: gigId,
          listing_type: "gig",
          request_details: {
            pitch_message: normalizedInviteMessage,
            context_label: "Gig Invite",
            request_kind: "invite",
            gig_id: gigId,
            gig_name: normalizedGigName,
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
