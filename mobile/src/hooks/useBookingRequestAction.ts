import { useCallback } from "react";
import { submitListingRequest } from "../utils/listingRequests";

interface AlertConfig {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
}

interface UseBookingRequestActionParams {
  currentUserRole: string | null;
  userVenues: any[];
  selectedVenueId: string | null;
  requestMessage: string;
  currentUserId: string | null;
  group: any;
  setAlertConfig: (config: AlertConfig) => void;
  setAlertVisible: (visible: boolean) => void;
  handleConfirm: (action: () => void | Promise<void>, title: string, message: string) => void;
  setIsSendingRequest: (value: boolean) => void;
  setRequestMessage: (value: string) => void;
  closeSheet: () => void;
}

export const useBookingRequestAction = ({
  currentUserRole,
  userVenues,
  selectedVenueId,
  requestMessage,
  currentUserId,
  group,
  setAlertConfig,
  setAlertVisible,
  handleConfirm,
  setIsSendingRequest,
  setRequestMessage,
  closeSheet,
}: UseBookingRequestActionParams) => {
  return useCallback(() => {
    if (currentUserRole === "venue-owner" && userVenues.length === 0) {
      handleConfirm(
        () => {
          const router = require("expo-router").router;
          router.push("/add_studio");
        },
        "No Venue Found",
        "You need to create a venue first before sending booking requests. Would you like to create one now?",
      );
      return;
    }

    if (currentUserRole === "venue-owner" && !selectedVenueId) {
      setAlertConfig({
        type: "error",
        title: "Select Venue",
        message: "Please select which venue you are inviting the artist to.",
      });
      setAlertVisible(true);
      return;
    }

    if (!requestMessage.trim()) {
      setAlertConfig({
        type: "error",
        title: "Message Required",
        message: "Please describe your event or offer.",
      });
      setAlertVisible(true);
      return;
    }

    if (!currentUserId) {
      setAlertConfig({
        type: "error",
        title: "Sign In Required",
        message: "Please sign in before sending a booking request.",
      });
      setAlertVisible(true);
      return;
    }

    handleConfirm(
      async () => {
        setIsSendingRequest(true);
        try {
          const receiverId = group.type === "Artist" ? group.id : group.owner_id;
          const groupId = group.type === "Group" ? group.id : null;
          const selectedVenue = userVenues.find((venue: any) => venue?.id === selectedVenueId);

          if (!receiverId) {
            throw new Error("We couldn't identify who should receive this request.");
          }

          await submitListingRequest({
            currentUserId,
            receiverUserId: receiverId,
            message: requestMessage,
            senderEntityType: "venue",
            senderEntityName: selectedVenue?.name || "Venue",
            senderEntityId: selectedVenueId,
            receiverEntityType: group.type === "Artist" ? "musician" : "group",
            receiverEntityName: group?.name || (group.type === "Artist" ? "Musician" : "Group"),
            receiverEntityId: group?.id || receiverId,
            groupId,
            studioId: selectedVenueId,
            notificationTitle: "New booking request",
            notificationMessage: `${selectedVenue?.name || "A venue"} sent you a booking request on MusikaLokal.`,
            routePath: "/bookings",
            routeParams: { tab: "Pending" },
            extraMeta: { source: "listing_details_booking_request" },
          });

          setAlertConfig({
            type: "success",
            title: "Request Sent",
            message: "Your booking request has been sent successfully!",
          });
          setAlertVisible(true);
          setRequestMessage("");

          setTimeout(() => {
            closeSheet();
          }, 2000);
        } catch (e) {
          console.error("Error sending request:", e);
          const errorMessage =
            e instanceof Error && e.message.trim().length > 0
              ? e.message
              : "Failed to send request. Please try again.";
          setAlertConfig({
            type: "error",
            title: "Error",
            message: errorMessage,
          });
          setAlertVisible(true);
        } finally {
          setIsSendingRequest(false);
        }
      },
      "Send Booking Request",
      "Are you sure you want to send this booking request?",
    );
  }, [
    closeSheet,
    currentUserId,
    currentUserRole,
    group,
    handleConfirm,
    requestMessage,
    selectedVenueId,
    setAlertConfig,
    setAlertVisible,
    setIsSendingRequest,
    setRequestMessage,
    userVenues,
  ]);
};
