import { useCallback } from "react";
import { supabase } from "../../lib/supabase";

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

    handleConfirm(
      async () => {
        setIsSendingRequest(true);
        try {
          const receiverId = group.type === "Artist" ? group.id : group.owner_id;
          const groupId = group.type === "Group" ? group.id : null;

          const { error } = await supabase.from("booking_requests").insert({
            sender_id: currentUserId,
            receiver_id: receiverId,
            group_id: groupId,
            studio_id: selectedVenueId,
            message: requestMessage,
            status: "pending",
            event_details: {},
          });

          if (error) throw error;

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
          setAlertConfig({
            type: "error",
            title: "Error",
            message: "Failed to send request. Please try again.",
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
