import { useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { getGigApplicationDeadlineInfo } from "../utils/gigApplication";

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
  requestConfirmation: (
    action: () => void,
    title: string,
    message: string,
    options?: { requireTerms?: boolean },
  ) => void;
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
  requestConfirmation,
  setIsSubmittingApplication,
  setHasExistingApplication,
  setExistingApplicationStatus,
  setPitchMessage,
  setVideoUrl,
  setCvFile,
  setCvUrl,
  closeSheet,
}: UseApplicationSubmissionActionParams) => {
  const invokeListingsCrudAction = useCallback(
    async (body: Record<string, unknown>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const sessionUserId = user?.id;

      if (!sessionUserId) {
        throw new Error("Session expired. Please log in again.");
      }

      const payload = {
        ...body,
        userId: sessionUserId,
      };

      return supabase.functions.invoke("listings-crud", {
        body: payload,
      });
    },
    [],
  );

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
    setIsSubmittingApplication(true);
    console.log("Inserting application into database...");

    try {
      const isGroupListing = group?.type === "Group";
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

      console.log("[AppSubmit] isGroupListing:", isGroupListing, "group.type:", group?.type);

      if (isGroupListing) {
        if (!group?.owner_id) {
          setAlertConfig({
            type: "error",
            title: "Application Failed",
            message: "This group cannot receive applications right now.",
          });
          setAlertVisible(true);
          return;
        }

        console.log("[AppSubmit] Sending notification to group owner:", group.owner_id);

        const applicationMeta = {
          application_scope: "group_member",
          group_listing_id: listingId,
          group_listing_name: group?.name || "Group",
          target_group_type: group?.group_type || null,
          applicant_id: userId,
          selected_group_id: selectedGroupId || null,
          pitch_message: pitchMessage,
          video_url: videoUrl || null,
          cv_url: uploadedCvUrl,
          submitted_at: new Date().toISOString(),
          status: "pending",
        };

        const { error: ownerNotificationError } = await invokeListingsCrudAction(
          {
            action: "create_notification",
            targetUserId: group.owner_id,
            type: "info",
            title: "New Group Application",
            message: `You have a new application for "${group.name}".`,
            meta: applicationMeta,
          },
        );

        console.log("[AppSubmit] invokeListingsCrudAction returned.", {
          hasError: !!ownerNotificationError,
          errorMessage: ownerNotificationError?.message,
        });

        if (ownerNotificationError) {
          console.error("Failed to notify group owner:", ownerNotificationError);
          setAlertConfig({
            type: "error",
            title: "Submission Failed",
            message:
              ownerNotificationError.message ||
              "Failed to send your application. Please try again.",
          });
          setAlertVisible(true);
          return;
        }

        console.log("[AppSubmit] Owner notification sent OK. Inserting self-notification (non-blocking)...");

        // Non-blocking: self-notification should not stall the success flow.
        void (async () => {
          try {
            const { error: selfNotificationError } = await supabase
              .from("notifications")
              .insert({
                user_id: userId,
                type: "info",
                title: "Group Application Submitted",
                message: `You applied to join "${group.name}".`,
                meta: applicationMeta,
              });

            if (selfNotificationError) {
              console.error("Failed to persist group application receipt:", selfNotificationError);
            } else {
              console.log("[AppSubmit] Self-notification inserted OK.");
            }
          } catch (err: unknown) {
            console.error("[AppSubmit] Self-notification insert crashed:", err);
          }
        })();

        if (group && group.embedding) {
          try {
            await supabase.rpc("update_user_interest", {
              p_user_id: userId,
              p_item_vector: group.embedding,
              p_weight: 0.4,
            });
            console.log("🤖 AI learned from group application:", group.name);
          } catch (e) {
            console.log("Error updating AI interest from group application:", e);
          }
        }

        console.log("[AppSubmit] Showing success alert for group application.");

        setHasExistingApplication(true);
        setExistingApplicationStatus("pending");

        setAlertConfig({
          type: "success",
          title: "Application Submitted!",
          message:
            "Your application has been sent to the group leader. They can review your pitch, CV, and video.",
        });
        setAlertVisible(true);

        setPitchMessage("");
        setVideoUrl("");
        setCvFile(null);
        setCvUrl("");

        setTimeout(() => {
          closeSheet();
        }, 2500);

        return;
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
            await invokeListingsCrudAction({
              action: "create_notification",
              targetUserId: group.organizer_id,
              type: "info",
              title: "New Gig Application",
              message: `You have a new application for "${group.name}".`,
              meta: {
                gig_id: listingId,
                application_id: data.id,
                applicant_id: userId,
                group_id: selectedGroupId || null,
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
              meta: { gig_id: listingId, application_id: data.id },
            }));

            await invokeListingsCrudAction({
              action: "create_notifications",
              notifications,
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
        title: "Application Submitted!",
        message: selectedGroupId
          ? needsLeaderApproval
            ? "Your group application was sent to your group leader for approval. Once approved, it will be visible to the venue owner."
            : "Your group application has been submitted successfully. Group members have been notified. The venue owner will review it and get back to you soon."
          : "Your application has been submitted successfully. The venue owner will review it and get back to you soon.",
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
    invokeListingsCrudAction,
    userGroups,
    userId,
    videoUrl,
  ]);

  const handleSubmitApplication = useCallback(async () => {
    console.log("=== handleSubmitApplication CALLED ===");

    if (!userId || !listingId || !group) {
      console.error("Missing required data for application:", {
        userId,
        listingId,
        group,
      });
      return;
    }

    const isGroupListing = group.type === "Group";

    if (isGroupListing) {
      if (group.owner_id === userId) {
        setAlertConfig({
          type: "warning",
          title: "Action Not Allowed",
          message: "You cannot apply to your own group listing.",
        });
        setAlertVisible(true);
        return;
      }

      if (group.open_group_applications !== true) {
        setAlertConfig({
          type: "error",
          title: "Applications Closed",
          message: "This group is not accepting applications right now.",
        });
        setAlertVisible(true);
        return;
      }

      if (!pitchMessage.trim()) {
        setAlertConfig({
          type: "error",
          title: "Pitch Required",
          message: "Please tell the group leader why you are a good fit.",
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
            "Please upload a performance video before submitting your application.",
        });
        setAlertVisible(true);
        return;
      }

      requestConfirmation(
        () => {
          void processApplicationSubmission();
        },
        "Submit Application?",
        "Are you sure you want to submit this group application? This action cannot be undone.",
        { requireTerms: true },
      );
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

    const gigDeadlineInfo = getGigApplicationDeadlineInfo(group);
    if (gigDeadlineInfo?.isPassed) {
      setAlertConfig({
        type: "error",
        title: "Applications Closed",
        message:
          "Applications for this gig are already closed (deadline is 24 hours before the event).",
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

    requestConfirmation(
      () => {
        void processApplicationSubmission();
      },
      "Submit Application?",
      "Are you sure you want to submit this application? This action cannot be undone.",
      { requireTerms: true },
    );
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
    requestConfirmation,
    userId,
    videoUrl,
  ]);

  return {
    handleSubmitApplication,
  };
};
