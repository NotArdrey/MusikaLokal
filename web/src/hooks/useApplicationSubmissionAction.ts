import { useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { buildNotificationRouteMeta } from "../utils/notificationNavigation";

interface AlertConfig {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
}

interface UseApplicationSubmissionActionParams {
  userId: string | null;
  listingId: string | null;
  group: any;
  groupAlreadyApplied: boolean;
  groupApplicationBy: string | null;
  selectedGroupId: string | null;
  selectedSlotType: "solo" | "duo" | "band" | null;
  pitchMessage: string;
  cvFile: any;
  cvUrl: string;
  videoUrl: string;
  userGroups: any[];
  setAlertConfig: (config: AlertConfig) => void;
  setAlertVisible: (visible: boolean) => void;
  setConfirmTitle: (value: string) => void;
  setConfirmMessage: (value: string) => void;
  setConfirmAction: (action: () => void) => void;
  setConfirmRequireTerms: (value: boolean) => void;
  setModalVisible: (visible: boolean) => void;
  setIsSubmittingApplication: (value: boolean) => void;
  setHasExistingApplication: (value: boolean) => void;
  setExistingApplicationStatus: (value: string | null) => void;
  setPitchMessage: (value: string) => void;
  setVideoUrl: (value: string) => void;
  setCvFile: (value: any) => void;
  setCvUrl: (value: string) => void;
  closeSheet: () => void;
}

export const useApplicationSubmissionAction = ({
  userId,
  listingId,
  group,
  groupAlreadyApplied,
  groupApplicationBy,
  selectedGroupId,
  selectedSlotType,
  pitchMessage,
  cvFile,
  cvUrl,
  videoUrl,
  userGroups,
  setAlertConfig,
  setAlertVisible,
  setConfirmTitle,
  setConfirmMessage,
  setConfirmAction,
  setConfirmRequireTerms,
  setModalVisible,
  setIsSubmittingApplication,
  setHasExistingApplication,
  setExistingApplicationStatus,
  setPitchMessage,
  setVideoUrl,
  setCvFile,
  setCvUrl,
  closeSheet,
}: UseApplicationSubmissionActionParams) => {
  const submissionInFlightRef = useRef(false);

  const uploadDocument = useCallback(async (file: any) => {
    try {
      console.log("📤 Uploading CV:", file.name);

      const response = await fetch(file.uri);
      const arrayBuffer = await response.arrayBuffer();

      const fileExt = file.name.split(".").pop() || "pdf";
      const fileName = `${userId}/cvs/${Date.now()}_cv.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("documents")
        .upload(fileName, arrayBuffer, {
          contentType: file.mimeType || "application/pdf",
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading CV:", error);
      throw error;
    }
  }, [userId]);

  const processApplicationSubmission = useCallback(async () => {
    if (submissionInFlightRef.current) {
      return;
    }

    submissionInFlightRef.current = true;
    setIsSubmittingApplication(true);
    console.log("Inserting application into database...");

    try {
      let uploadedCvUrl = null;
      const selectedGroup = selectedGroupId
        ? userGroups.find((g) => g.id === selectedGroupId)
        : null;
      const needsLeaderApproval =
        !!selectedGroupId && !!selectedGroup && selectedGroup.owner_id !== userId;

      if (cvFile) {
        try {
          uploadedCvUrl = await uploadDocument(cvFile);
          console.log("✅ CV Uploaded:", uploadedCvUrl);
        } catch (e) {
          console.error("Failed to upload CV", e);
          setAlertConfig({
            type: "error",
            title: "Upload Failed",
            message: "Failed to upload CV. Please try again.",
          });
          setAlertVisible(true);
          setIsSubmittingApplication(false);
          return;
        }
      } else if (cvUrl) {
        uploadedCvUrl = cvUrl;
      }

      const applicationPayload = {
        applicant_id: userId,
        gig_id: listingId,
        group_id: selectedGroupId || null,
        is_solo_application: !selectedGroupId,
        slot_type: selectedSlotType || null,
        submitted_by_user_id: userId,
        leader_approval_status: (() => {
          if (!selectedGroupId) return null;
          const selectedGroup = userGroups.find((g) => g.id === selectedGroupId);
          return selectedGroup?.owner_id === userId ? "approved" : "pending";
        })(),
        pitch_message: pitchMessage,
        video_url: videoUrl || null,
        cv_url: uploadedCvUrl,
        status: "pending",
      };

      let data: any = null;
      let error: any = null;

      ({ data, error } = await supabase
        .from("gig_applications")
        .insert(applicationPayload)
        .select()
        .single());

      if (
        (error?.code === "42703" || error?.code === "PGRST204") &&
        String(error?.message || "").includes("leader_approval_status")
      ) {
        const { leader_approval_status: _unusedStatus, ...legacyPayload } = applicationPayload;

        ({ data, error } = await supabase
          .from("gig_applications")
          .insert(legacyPayload)
          .select()
          .single());
      }

      if (error) {
        console.error("Error submitting application:", error);

        if (error.code === "23505") {
          setAlertConfig({
            type: "error",
            title: "Duplicate Application",
            message: "This group has already applied to this gig.",
          });
        } else {
          setAlertConfig({
            type: "error",
            title: "Submission Failed",
            message:
              error.message ||
              "Failed to submit application. Please try again.",
          });
        }
        setAlertVisible(true);
        return;
      }

      console.log("✅ Application submitted successfully!", data);

      if (group?.organizer_id && data && !needsLeaderApproval) {
        try {
          if (group.organizer_id !== userId) {
            await supabase.functions.invoke("listings-crud", {
              body: {
                action: "create_notification",
                userId,
                targetUserId: group.organizer_id,
                type: "info",
                title: "New Gig Application",
                message: `You have a new application for "${group.name}".`,
                meta: buildNotificationRouteMeta("/manage_gig", { id: listingId }, {
                  gig_id: listingId,
                  application_id: data.id,
                  applicant_id: userId,
                  group_id: selectedGroupId || null,
                }),
              },
            });
          }
        } catch (notifyErr) {
          console.error("Failed to notify gig organizer:", notifyErr);
        }
      }

      if (selectedGroupId && data) {
        try {
          const { data: members } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", selectedGroupId)
            .neq("user_id", userId);

          if (members && members.length > 0) {
            const selectedGroup = userGroups.find((g) => g.id === selectedGroupId);

            const notifications = members.map((m) => ({
              user_id: m.user_id,
              type: "info",
              title: "Group Gig Application",
              message: `${selectedGroup?.name || "Your group"} has applied for "${group.name}". Check the gig details for more info.`,
              meta: buildNotificationRouteMeta("/bookings", undefined, {
                gig_id: listingId,
                application_id: data.id,
              }),
            }));

            await supabase.functions.invoke("listings-crud", {
              body: {
                action: "create_notifications",
                userId,
                notifications,
              },
            });
            console.log("📬 Notified group members:", members.length);
          }
        } catch (notifyErr) {
          console.error("Failed to notify group members:", notifyErr);
        }
      }

      if (group && group.embedding) {
        try {
          await supabase.rpc("update_user_interest", {
            p_user_id: userId,
            p_item_vector: group.embedding,
            p_weight: 0.4,
          });
          console.log("🤖 AI learned from gig application:", group.name);
        } catch (e) {
          console.log("Error updating AI interest from application:", e);
        }
      }

      setHasExistingApplication(true);
      setExistingApplicationStatus("pending");

      setAlertConfig({
        type: "success",
        title: "Application Sent",
        message: selectedGroupId
          ? needsLeaderApproval
            ? "Your group application was sent to your group leader for approval. Once approved, it will be visible to the venue owner."
            : "Your group application has been sent. Group members have been notified. The venue owner will review it and get back to you soon."
          : "Your application has been sent to the venue owner. They'll review it and get back to you soon.",
      });
      setAlertVisible(true);

      setPitchMessage("");
      setVideoUrl("");
      setCvFile(null);
      setCvUrl("");

      setTimeout(() => {
        closeSheet();
      }, 2500);
    } catch (err) {
      console.error("Unexpected error:", err);
      setAlertConfig({
        type: "error",
        title: "Error",
        message: "An unexpected error occurred. Please try again.",
      });
      setAlertVisible(true);
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmittingApplication(false);
    }
  }, [
    closeSheet,
    cvFile,
    cvUrl,
    group,
    listingId,
    pitchMessage,
    selectedGroupId,
    setAlertConfig,
    setAlertVisible,
    setCvFile,
    setCvUrl,
    setExistingApplicationStatus,
    setHasExistingApplication,
    setIsSubmittingApplication,
    setPitchMessage,
    setVideoUrl,
    uploadDocument,
    userGroups,
    userId,
    videoUrl,
  ]);

  const handleSubmitApplication = useCallback(async () => {
    if (submissionInFlightRef.current) {
      return;
    }

    console.log("=== handleSubmitApplication CALLED ===");

    if (!userId || !listingId || !group) {
      console.error("Missing required data for application:", {
        userId,
        listingId,
        group,
      });
      return;
    }

    if (groupAlreadyApplied) {
      setAlertConfig({
        type: "warning",
        title: "Group Already Applied",
        message: `This group has already applied via ${groupApplicationBy}. Only one application per group is allowed.`,
      });
      setAlertVisible(true);
      return;
    }

    const musicianTypeRequired = group.requirements?.musician_type || "both";
    const isGroupApplication = !!selectedGroupId;

    if (musicianTypeRequired === "group" && !isGroupApplication) {
      setAlertConfig({
        type: "error",
        title: "Group Required",
        message:
          "This gig requires applications from groups. Please select a group to apply.",
      });
      setAlertVisible(true);
      return;
    }

    if (musicianTypeRequired === "solo" && isGroupApplication) {
      setAlertConfig({
        type: "error",
        title: "Solo Required",
        message:
          "This gig only accepts individual applications. Please apply as Individual.",
      });
      setAlertVisible(true);
      return;
    }

    const slots = group.requirements?.slots || {};
    const requiredSlotTypes = (["solo", "duo", "band"] as const).filter(
      (slotType) => (slots?.[slotType]?.needed || 0) > 0,
    );

    if (requiredSlotTypes.length > 0) {
      if (!selectedSlotType || !requiredSlotTypes.includes(selectedSlotType)) {
        setAlertConfig({
          type: "error",
          title: "Select Category",
          message:
            "Please select a valid category (Individual, Duo, or Group) based on the venue requirements.",
        });
        setAlertVisible(true);
        return;
      }

      if (selectedSlotType !== "solo" && !isGroupApplication) {
        setAlertConfig({
          type: "error",
          title: "Group Needed",
          message:
            "Duo/Group applications require selecting a group before submitting.",
        });
        setAlertVisible(true);
        return;
      }

      if (selectedSlotType === "duo" || selectedSlotType === "band") {
        const selectedGroup = userGroups.find((g) => g.id === selectedGroupId);
        const requiredGroupType = selectedSlotType === "duo" ? "duo" : "band";
        const selectedGroupType = selectedGroup?.group_type || "band";

        if (!selectedGroup || selectedGroupType !== requiredGroupType) {
          setAlertConfig({
            type: "error",
            title: "Category Mismatch",
            message:
              selectedSlotType === "duo"
                ? "This slot requires a Duo profile. Please select a Duo."
                : "This slot requires a Band profile. Please select a Band.",
          });
          setAlertVisible(true);
          return;
        }
      }

      if (musicianTypeRequired === "group" && selectedSlotType === "solo") {
        setAlertConfig({
          type: "error",
          title: "Invalid Category",
          message:
            "This gig requires group-type musicians. Please choose Duo or Group.",
        });
        setAlertVisible(true);
        return;
      }

      if (musicianTypeRequired === "solo" && selectedSlotType !== "solo") {
        setAlertConfig({
          type: "error",
          title: "Invalid Category",
          message:
            "This gig requires individual musicians only. Please choose Individual.",
        });
        setAlertVisible(true);
        return;
      }
    }

    if (!pitchMessage.trim()) {
      setAlertConfig({
        type: "error",
        title: "Pitch Required",
        message: "Please tell the organizer why you are a good fit for this gig.",
      });
      setAlertVisible(true);
      return;
    }

    if (!cvFile && !cvUrl) {
      setAlertConfig({
        type: "error",
        title: "CV Required",
        message: "Please upload your CV/Resume to apply.",
      });
      setAlertVisible(true);
      return;
    }

    if (!videoUrl) {
      setAlertConfig({
        type: "error",
        title: "Video Required",
        message:
          "Please upload a performance video to apply. This helps venue owners evaluate your talent.",
      });
      setAlertVisible(true);
      return;
    }

    if (group.requirements?.total_slots_needed) {
      try {
        const { data: acceptedApps, error: countError } = await supabase
          .from("gig_applications")
          .select("id")
          .eq("gig_id", listingId)
          .eq("status", "accepted");

        if (!countError && acceptedApps) {
          const acceptedCount = acceptedApps.length;
          const totalSlots = group.requirements.total_slots_needed;

          if (acceptedCount >= totalSlots) {
            setAlertConfig({
              type: "error",
              title: "Slots Full",
              message: `All ${totalSlots} performer slot${totalSlots > 1 ? "s have" : " has"} been filled for this gig. No more applications can be accepted.`,
            });
            setAlertVisible(true);
            return;
          }
        }
      } catch (e) {
        console.error("Error checking slot availability:", e);
      }
    }

    setConfirmTitle("Submit Application?");
    setConfirmMessage(
      "Are you sure you want to submit this application? This action cannot be undone.",
    );
    setConfirmAction(() => processApplicationSubmission);
    setConfirmRequireTerms(true);
    setModalVisible(true);
  }, [
    cvFile,
    cvUrl,
    group,
    groupAlreadyApplied,
    groupApplicationBy,
    listingId,
    pitchMessage,
    processApplicationSubmission,
    selectedGroupId,
    selectedSlotType,
    setAlertConfig,
    setAlertVisible,
    setConfirmAction,
    setConfirmRequireTerms,
    setConfirmMessage,
    setConfirmTitle,
    setModalVisible,
    userId,
    videoUrl,
  ]);

  return {
    handleSubmitApplication,
  };
};
