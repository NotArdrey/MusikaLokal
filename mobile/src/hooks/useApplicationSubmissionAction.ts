import { useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";
import type { UploadSafetyFileDecision } from "../services/uploadSafetyScreen";
import { getGigApplicationDeadlineInfo } from "../utils/gigApplication";
import { getGigReapplicationCooldownInfo } from "../utils/gigReapplicationCooldown";
import { submitListingRequest } from "../utils/listingRequests";
import { buildNotificationRouteMeta } from "../utils/notificationNavigation";
import { sanitizeStorageFileName, uploadStorageObject } from "../utils/storageUpload";

interface AlertConfig {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
}

interface UseApplicationSubmissionActionParams {
  userId: string | null;
  userRole?: string | null;
  listingId: string | null;
  group: any;
  groupAlreadyApplied: boolean;
  groupApplicationBy: string | null;
  selectedGroupId: string | null;
  selectedProductionTeamId: string | null;
  selectedProductionRosterId: string | null;
  productionRoster: any[];
  selectedSlotType: "solo" | "duo" | "band" | null;
  pitchMessage: string;
  cvFile: any;
  cvUrl: string;
  videoUrl: string;
  aiPortfolioReviewConsent: boolean;
  videoReviewFrameUrl: string;
  videoReviewFrameUrls: string[];
  videoCopyrightAcknowledged: boolean;
  videoCopyrightDecision: UploadSafetyFileDecision | null;
  userGroups: any[];
  setAlertConfig: (config: AlertConfig) => void;
  setAlertVisible: (visible: boolean) => void;
  isReapplicationCooldownActive?: boolean;
  reapplicationCooldownReason?: string | null;
  requestConfirmation: (
    action: () => void,
    title: string,
    message: string,
    options?: {
      requireTerms?: boolean;
      summaryItems?: { label: string; value: string | number | null | undefined; icon?: any }[];
    },
  ) => void;
  setIsSubmittingApplication: (value: boolean) => void;
  setHasExistingApplication: (value: boolean) => void;
  setExistingApplicationStatus: (value: string | null) => void;
  setPitchMessage: (value: string) => void;
  setVideoUrl: (value: string) => void;
  setAiPortfolioReviewConsent: (value: boolean) => void;
  setVideoReviewFrameUrl: (value: string) => void;
  setVideoReviewFrameUrls: (value: string[]) => void;
  setVideoCopyrightAcknowledged: (value: boolean) => void;
  setVideoCopyrightDecision: (value: UploadSafetyFileDecision | null) => void;
  setCvFile: (value: any) => void;
  setCvUrl: (value: string) => void;
  closeSheet: () => void;
}

const GIG_UNAVAILABLE_MESSAGE =
  "This gig is no longer available. It may have been deleted or closed by the gig owner. Please refresh and choose another gig.";
const GROUP_UNAVAILABLE_MESSAGE =
  "This group is no longer available. It may have been deleted by the owner. Please refresh and choose another group.";

const isDeletedGigApplicationError = (error: any) => {
  const errorText = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
    error?.constraint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    error?.code === "23503" &&
    errorText.includes("gig_applications") &&
    errorText.includes("gig_id")
  );
};

export const useApplicationSubmissionAction = ({
  userId,
  userRole,
  listingId,
  group,
  groupAlreadyApplied,
  groupApplicationBy,
  selectedGroupId,
  selectedProductionTeamId,
  selectedProductionRosterId,
  productionRoster,
  selectedSlotType,
  pitchMessage,
  cvFile,
  cvUrl,
  videoUrl,
  aiPortfolioReviewConsent,
  videoReviewFrameUrl,
  videoReviewFrameUrls,
  videoCopyrightAcknowledged,
  videoCopyrightDecision,
  userGroups,
  setAlertConfig,
  setAlertVisible,
  requestConfirmation,
  setIsSubmittingApplication,
  setHasExistingApplication,
  setExistingApplicationStatus,
  setPitchMessage,
  setVideoUrl,
  setAiPortfolioReviewConsent,
  setVideoReviewFrameUrl,
  setVideoReviewFrameUrls,
  setVideoCopyrightAcknowledged,
  setVideoCopyrightDecision,
  setCvFile,
  setCvUrl,
  closeSheet,
}: UseApplicationSubmissionActionParams) => {
  const submissionInFlightRef = useRef(false);

  const showGigUnavailableAlert = useCallback(() => {
    setHasExistingApplication(false);
    setExistingApplicationStatus(null);
    setAlertConfig({
      type: "warning",
      title: "Gig Unavailable",
      message: GIG_UNAVAILABLE_MESSAGE,
    });
    setAlertVisible(true);
    setTimeout(() => {
      closeSheet();
    }, 600);
  }, [
    closeSheet,
    setAlertConfig,
    setAlertVisible,
    setExistingApplicationStatus,
    setHasExistingApplication,
  ]);

  const ensureGigIsStillAvailable = useCallback(async () => {
    if (group?.type !== "Gig" || !listingId) {
      return true;
    }

    const { data, error } = await supabase
      .from("gigs")
      .select("id, status")
      .eq("id", listingId)
      .maybeSingle();

    if (error) {
      console.error("Error checking gig availability:", error);
      return true;
    }

    if (!data) {
      showGigUnavailableAlert();
      return false;
    }

    if (data.status && String(data.status).toLowerCase() !== "open") {
      setAlertConfig({
        type: "error",
        title: "Applications Closed",
        message: "This gig is no longer accepting applications.",
      });
      setAlertVisible(true);
      return false;
    }

    return true;
  }, [
    group?.type,
    listingId,
    setAlertConfig,
    setAlertVisible,
    showGigUnavailableAlert,
  ]);

  const ensureGroupListingIsStillAvailable = useCallback(async () => {
    if (group?.type !== "Group" || !listingId) {
      return true;
    }

    const { data, error } = await supabase
      .from("groups")
      .select("id, open_group_applications")
      .eq("id", listingId)
      .maybeSingle();

    if (error) {
      console.error("Error checking group availability:", error);
      return true;
    }

    if (!data) {
      setAlertConfig({
        type: "warning",
        title: "Group Unavailable",
        message: GROUP_UNAVAILABLE_MESSAGE,
      });
      setAlertVisible(true);
      setTimeout(() => {
        closeSheet();
      }, 600);
      return false;
    }

    if (data.open_group_applications !== true) {
      setAlertConfig({
        type: "error",
        title: "Applications Closed",
        message: "This group is not accepting applications right now.",
      });
      setAlertVisible(true);
      return false;
    }

    return true;
  }, [
    closeSheet,
    group?.type,
    listingId,
    setAlertConfig,
    setAlertVisible,
  ]);

  const fetchCurrentReapplicationCooldown = useCallback(async () => {
    const inactive = {
      isActive: false,
      daysRemaining: 0,
      cooldownEndsAt: null,
      message: null,
    };

    if (group?.type !== "Gig" || !listingId || !userId) {
      return inactive;
    }

    let cooldownDays = group.reapplication_cooldown_days;
    if (cooldownDays === null || cooldownDays === undefined) {
      const { data: gigSettings, error: gigSettingsError } = await supabase
        .from("gigs")
        .select("reapplication_cooldown_days")
        .eq("id", listingId)
        .maybeSingle();

      if (gigSettingsError) throw gigSettingsError;
      cooldownDays = gigSettings?.reapplication_cooldown_days ?? 30;
    }

    if (Number(cooldownDays) <= 0) {
      return inactive;
    }

    let query = supabase
      .from("gig_applications")
      .select("id, rejected_at, created_at")
      .eq("gig_id", listingId)
      .eq("status", "rejected")
      .order("rejected_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (userRole === "producer") {
      if (!selectedProductionTeamId) {
        return inactive;
      }
      query = query.eq("production_team_id", selectedProductionTeamId);
    } else {
      query = query.eq("applicant_id", userId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    return getGigReapplicationCooldownInfo({
      cooldownDays,
      rejectedAt: data?.rejected_at,
      createdAt: data?.created_at,
      eventDate: group.event_date,
      eventStartTime: group.requirements?.event_start_time,
    });
  }, [
    group?.event_date,
    group?.reapplication_cooldown_days,
    group?.requirements?.event_start_time,
    group?.type,
    listingId,
    selectedProductionTeamId,
    userId,
    userRole,
  ]);

  const ensureReapplicationCooldownHasPassed = useCallback(async () => {
    try {
      const cooldownInfo = await fetchCurrentReapplicationCooldown();

      if (cooldownInfo.isActive) {
        setAlertConfig({
          type: "warning",
          title: "Reapplication Cooldown",
          message:
            cooldownInfo.message ||
            "Your last application was declined. Please wait before applying again.",
        });
        setAlertVisible(true);
        return false;
      }
    } catch (error) {
      console.error("Error checking reapplication cooldown:", error);
      setAlertConfig({
        type: "error",
        title: "Eligibility Check Failed",
        message: "We could not verify whether you can reapply yet. Please try again.",
      });
      setAlertVisible(true);
      return false;
    }

    return true;
  }, [
    fetchCurrentReapplicationCooldown,
    setAlertConfig,
    setAlertVisible,
  ]);

  const formatSlotLabel = (slotType: "solo" | "duo" | "band" | null) => {
    if (slotType === "solo") return "Solo";
    if (slotType === "duo") return "Duo";
    if (slotType === "band") return "Group";
    return "Not selected";
  };

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
      const fileExt = file.name.split(".").pop() || "pdf";
      const safeFileName = sanitizeStorageFileName(file.name || `cv.${fileExt}`, `cv.${fileExt}`);
      const fileName = `${userId}/cvs/${Date.now()}_${safeFileName}`;

      const { data, error } = await uploadStorageObject({
        bucket: "documents",
        path: fileName,
        uri: file.uri,
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

    try {
      const isGroupListing = group?.type === "Group";
      const isProducerGigFlow =
        group?.type === "Gig" &&
        userRole === "producer" &&
        !!selectedProductionTeamId &&
        !!selectedProductionRosterId;
      let uploadedCvUrl = null;
      const selectedGroup = selectedGroupId
        ? userGroups.find((g) => g.id === selectedGroupId)
        : null;
      const selectedProductionRoster = selectedProductionRosterId
        ? productionRoster.find((entry) => entry.id === selectedProductionRosterId)
        : null;
      const needsLeaderApproval =
        !!selectedGroupId && !!selectedGroup && selectedGroup.owner_id !== userId;

      if (isGroupListing) {
        const groupIsStillAvailable = await ensureGroupListingIsStillAvailable();
        if (!groupIsStillAvailable) {
          return;
        }
      } else {
        const gigIsStillAvailable = await ensureGigIsStillAvailable();
        if (!gigIsStillAvailable) {
          return;
        }

        const cooldownHasPassed = await ensureReapplicationCooldownHasPassed();
        if (!cooldownHasPassed) {
          return;
        }
      }

      if (cvFile) {
        try {
          uploadedCvUrl = await uploadDocument(cvFile);
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


      if (isGroupListing) {
        if (!userId || !listingId) {
          setAlertConfig({
            type: "error",
            title: "Application Failed",
            message: "Please sign in and try again.",
          });
          setAlertVisible(true);
          return;
        }

        if (!group?.owner_id) {
          setAlertConfig({
            type: "error",
            title: "Application Failed",
            message: "This group cannot receive applications right now.",
          });
          setAlertVisible(true);
          return;
        }


        const submittedAt = new Date().toISOString();
        const { data: applicantProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .maybeSingle();
        const applicantName =
          typeof applicantProfile?.full_name === "string" &&
          applicantProfile.full_name.trim().length > 0
            ? applicantProfile.full_name.trim()
            : "Musician";
        const applicationMeta = {
          request_kind: "application",
          application_scope: "group_member",
          group_listing_id: listingId,
          group_listing_name: group?.name || "Group",
          target_group_type: group?.group_type || null,
          applicant_id: userId,
          selected_group_id: selectedGroupId || null,
          listing_type: "Group",
          listing_id: listingId,
          pitch_message: pitchMessage,
          video_url: videoUrl || null,
          cv_url: uploadedCvUrl,
          submitted_at: submittedAt,
          status: "pending",
          request_details: {
            pitch_message: pitchMessage,
            application_context: pitchMessage,
            context_label: "Application Context",
            request_kind: "application",
            cv_url: uploadedCvUrl,
            video_url: videoUrl || null,
          },
        };
        const selfApplicationMeta = listingId
          ? buildNotificationRouteMeta("/bookings", { tab: "Pending" }, applicationMeta)
          : applicationMeta;

        try {
          await submitListingRequest({
            currentUserId: userId,
            receiverUserId: group.owner_id,
            message: pitchMessage,
            senderEntityType: "musician",
            senderEntityName: applicantName,
            senderEntityId: userId,
            receiverEntityType: "group",
            receiverEntityName: group?.name || "Group",
            receiverEntityId: listingId,
            groupId: listingId,
            studioId: null,
            productionTeamId: null,
            notificationTitle: "New Group Application",
            notificationMessage: `You have a new application for "${group.name}".`,
            notificationImage: null,
            attachmentUrl: uploadedCvUrl,
            routePath: "/bookings",
            routeParams: { tab: "Pending" },
            extraMeta: applicationMeta,
          });
        } catch (requestError: any) {
          console.error("Failed to create group application request:", requestError);
          setAlertConfig({
            type: "error",
            title: "Submission Failed",
            message:
              requestError?.message ||
              "Failed to send your application. Please try again.",
          });
          setAlertVisible(true);
          return;
        }


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
                meta: selfApplicationMeta,
              });

            if (selfNotificationError) {
              console.error("Failed to persist group application receipt:", selfNotificationError);
            } else {
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
          } catch {
          }
        }


        setHasExistingApplication(true);
        setExistingApplicationStatus("pending");

        setAlertConfig({
          type: "success",
          title: "Application Sent",
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

      if (isProducerGigFlow) {
        const { error } = await supabase.functions.invoke("gig-applications", {
          body: {
            action: "submit_production_gig_application",
            userId,
            gigId: listingId,
            teamId: selectedProductionTeamId,
            rosterId: selectedProductionRosterId,
            pitchMessage,
            videoUrl: videoUrl || null,
            cvUrl: uploadedCvUrl,
            slotType: selectedSlotType || null,
            aiPortfolioReviewConsent,
            aiReviewFrameUrl: aiPortfolioReviewConsent ? videoReviewFrameUrl || null : null,
            aiReviewFrameUrls: aiPortfolioReviewConsent ? videoReviewFrameUrls.slice(0, 3) : [],
            videoCopyrightAcknowledged,
            videoCopyrightStatus: videoCopyrightDecision?.copyrightStatus || "not_required",
            videoCopyrightReviewId: videoCopyrightDecision?.copyrightReviewId || null,
            videoCopyrightMetadata: videoCopyrightDecision?.copyrightMetadata || {},
          },
        });

        if (error) {
          console.error("Error submitting production application:", error);
          setAlertConfig({
            type: "error",
            title: "Submission Failed",
            message:
              String(error.message || "").toLowerCase().includes("gig not found")
                ? GIG_UNAVAILABLE_MESSAGE
                : error.message ||
                  "Failed to submit production application. Please try again.",
          });
          setAlertVisible(true);
          return;
        }

        setHasExistingApplication(true);
        setExistingApplicationStatus("pending");

        if (group && group.embedding) {
          try {
            await supabase.rpc("update_user_interest", {
              p_user_id: userId,
              p_item_vector: group.embedding,
              p_weight: 0.4,
            });
          } catch {
          }
        }

        setAlertConfig({
          type: "success",
          title: "Application Sent",
          message: `${selectedProductionRoster?.display_name || "Your selected performer"} was sent to the gig owner from your production team. We'll let you know when they respond.`,
        });
        setAlertVisible(true);

        setPitchMessage("");
        setVideoUrl("");
        setAiPortfolioReviewConsent(false);
        setVideoReviewFrameUrl("");
        setVideoReviewFrameUrls([]);
        setVideoCopyrightAcknowledged(false);
        setVideoCopyrightDecision(null);
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
        ai_portfolio_review_consent: aiPortfolioReviewConsent,
        ai_review_frame_url: aiPortfolioReviewConsent ? videoReviewFrameUrl || null : null,
        ai_review_frame_urls: aiPortfolioReviewConsent ? videoReviewFrameUrls.slice(0, 3) : [],
        video_copyright_acknowledged: videoCopyrightAcknowledged,
        video_copyright_status: videoCopyrightDecision?.copyrightStatus || "not_required",
        video_copyright_review_id: videoCopyrightDecision?.copyrightReviewId || null,
        video_copyright_metadata: videoCopyrightDecision?.copyrightMetadata || {},
        status: "pending",
      };

      if (selectedGroupId) {
        const { data: existingGroupApplication, error: existingGroupApplicationError } =
          await supabase
            .from("gig_applications")
            .select("id, status")
            .eq("gig_id", listingId)
            .eq("group_id", selectedGroupId)
            .in("status", ["pending", "accepted", "approved"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingGroupApplicationError) {
          console.error("Error checking group application duplicate:", existingGroupApplicationError);
        }

        if (existingGroupApplication) {
          setAlertConfig({
            type: "error",
            title: "Duplicate Application",
            message: "This group has already applied to this gig.",
          });
          setAlertVisible(true);
          return;
        }
      }

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
            message: selectedGroupId
              ? "This group has already applied to this gig."
              : "You already have an active application for this gig.",
          });
        } else if (isDeletedGigApplicationError(error)) {
          showGigUnavailableAlert();
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

      if (data?.id && aiPortfolioReviewConsent) {
        try {
          const { error: reviewQueueError } = await supabase.functions.invoke("gig-applications", {
            body: { action: "request_ai_portfolio_review", applicationId: data.id, userId },
          });
          if (reviewQueueError) {
            console.warn("Application saved, but AI portfolio review could not be queued:", reviewQueueError.message);
          }
        } catch (reviewQueueError) {
          console.warn("Application saved, but AI portfolio review queue failed:", reviewQueueError);
        }
      }


      if (group?.organizer_id && data && !needsLeaderApproval) {
        try {
          if (group.organizer_id !== userId) {
            const organizerNotificationMeta = listingId
              ? buildNotificationRouteMeta("/manage_gig", { id: listingId }, {
                  gig_id: listingId,
                  application_id: data.id,
                  applicant_id: userId,
                  group_id: selectedGroupId || null,
                })
              : {
                  gig_id: listingId,
                  application_id: data.id,
                  applicant_id: userId,
                  group_id: selectedGroupId || null,
                };

            await invokeListingsCrudAction({
              action: "create_notification",
              targetUserId: group.organizer_id,
              type: "info",
              title: "New Gig Application",
              message: `You have a new application for "${group.name}".`,
              meta: organizerNotificationMeta,
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

          const selectedGroup = userGroups.find((g) => g.id === selectedGroupId);
          const recipientIds = new Set(
            (members || [])
              .map((m) => m.user_id)
              .filter(Boolean)
              .filter((memberId) => memberId !== userId),
          );

          if (selectedGroup?.owner_id && selectedGroup.owner_id !== userId) {
            recipientIds.add(selectedGroup.owner_id);
          }

          if (recipientIds.size > 0) {
            const notifications = Array.from(recipientIds).map((recipientId) => ({
              user_id: recipientId,
              type: "info",
              title: "Group Gig Application",
              message: `${selectedGroup?.name || "Your group"} has applied for "${group.name}". Check the gig details for more info.`,
              meta: buildNotificationRouteMeta("/bookings", undefined, {
                gig_id: listingId,
                application_id: data.id,
                group_id: selectedGroupId,
                status: "pending",
                viewer_access: "group_member",
                viewer_can_act: false,
                event_type: "group_gig_application_submitted",
              }),
            }));

            await invokeListingsCrudAction({
              action: "create_notifications",
              notifications,
            });
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
        } catch {
        }
      }

      setHasExistingApplication(true);
      setExistingApplicationStatus("pending");

      setAlertConfig({
        type: "success",
        title: "Application Sent",
        message: selectedGroupId
          ? needsLeaderApproval
            ? "Your group application was sent to your group leader for approval. Once approved, it will be visible to the gig owner."
            : "Your group application has been sent. Group members have been notified. The gig owner will review it and get back to you soon."
          : "Your application has been sent to the gig owner. They'll review it and get back to you soon.",
      });
      setAlertVisible(true);

      setPitchMessage("");
      setVideoUrl("");
      setAiPortfolioReviewConsent(false);
      setVideoReviewFrameUrl("");
      setVideoReviewFrameUrls([]);
      setVideoCopyrightAcknowledged(false);
      setVideoCopyrightDecision(null);
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
    aiPortfolioReviewConsent,
    ensureGigIsStillAvailable,
    ensureGroupListingIsStillAvailable,
    ensureReapplicationCooldownHasPassed,
    group,
    listingId,
    pitchMessage,
    productionRoster,
    selectedGroupId,
    selectedProductionRosterId,
    selectedProductionTeamId,
    selectedSlotType,
    setAlertConfig,
    setAlertVisible,
    setAiPortfolioReviewConsent,
    setCvFile,
    setCvUrl,
    setExistingApplicationStatus,
    setHasExistingApplication,
    setIsSubmittingApplication,
    setPitchMessage,
    setVideoUrl,
    uploadDocument,
    showGigUnavailableAlert,
    invokeListingsCrudAction,
    userGroups,
    userId,
    userRole,
    videoUrl,
    videoReviewFrameUrl,
    videoReviewFrameUrls,
    videoCopyrightAcknowledged,
    videoCopyrightDecision,
    setVideoReviewFrameUrl,
    setVideoReviewFrameUrls,
    setVideoCopyrightAcknowledged,
    setVideoCopyrightDecision,
  ]);

  const handleSubmitApplication = useCallback(async () => {
    if (submissionInFlightRef.current) {
      return;
    }

    if (!userId || !listingId || !group) {
      console.error("Missing required data for application:", {
        userId,
        listingId,
        group,
      });
      return;
    }

    if (group.type === "Gig" && userRole !== "musician") {
      setAlertConfig({
        type: "warning",
        title: "Musician Account Required",
        message: "Only musician accounts may apply to gigs as a solo artist, duo, or group.",
      });
      setAlertVisible(true);
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

      const groupIsStillAvailable = await ensureGroupListingIsStillAvailable();
      if (!groupIsStillAvailable) {
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
        {
          summaryItems: [
            { label: "Group", value: group?.name || "Group", icon: "people-outline" },
            { label: "Applicant", value: "Solo musician", icon: "person-outline" },
            { label: "Attachments", value: `${cvFile || cvUrl ? "CV" : "No CV"} + ${videoUrl ? "Video" : "No video"}`, icon: "document-text-outline" },
          ],
        },
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

    const gigIsStillAvailable = await ensureGigIsStillAvailable();
    if (!gigIsStillAvailable) {
      return;
    }

    const cooldownHasPassed = await ensureReapplicationCooldownHasPassed();
    if (!cooldownHasPassed) {
      return;
    }

    const gigDeadlineInfo = getGigApplicationDeadlineInfo(group);
    if (gigDeadlineInfo?.isPassed) {
      setAlertConfig({
        type: "error",
        title: "Applications Closed",
        message:
          "Applications for this gig are already closed because the event has already started.",
      });
      setAlertVisible(true);
      return;
    }

    const musicianTypeRequired = group.requirements?.musician_type || "both";
    const isProducerGigFlow = group.type === "Gig" && userRole === "producer";
    const isGroupApplication = !!selectedGroupId;
    const selectedGroup = selectedGroupId
      ? userGroups.find((g) => g.id === selectedGroupId)
      : null;
    const selectedProductionRoster = selectedProductionRosterId
      ? productionRoster.find((entry) => entry.id === selectedProductionRosterId)
      : null;

    if (isProducerGigFlow) {
      if (!selectedProductionTeamId) {
        setAlertConfig({
          type: "error",
          title: "Production Team Required",
          message: "Select the production team that will manage this application.",
        });
        setAlertVisible(true);
        return;
      }

      if (!selectedProductionRosterId || !selectedProductionRoster) {
        setAlertConfig({
          type: "error",
          title: "Performer Required",
          message: "Select the musician, duo, or group from your production roster that will apply to this gig.",
        });
        setAlertVisible(true);
        return;
      }
    }

    if (musicianTypeRequired === "group" && !isGroupApplication && !isProducerGigFlow) {
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
            "Please select a valid category (Individual, Duo, or Group) based on the gig requirements.",
        });
        setAlertVisible(true);
        return;
      }

      if (
        selectedSlotType !== "solo" &&
        !isGroupApplication &&
        !isProducerGigFlow
      ) {
        setAlertConfig({
          type: "error",
          title: "Group Needed",
          message:
            "Duo/Group applications require selecting a group before submitting.",
        });
        setAlertVisible(true);
        return;
      }

      if (isProducerGigFlow && selectedSlotType === "solo" && selectedProductionRoster?.entity_kind !== "musician") {
        setAlertConfig({
          type: "error",
          title: "Category Mismatch",
          message: "Solo slots require a musician profile from your production roster.",
        });
        setAlertVisible(true);
        return;
      }

      if (selectedSlotType === "duo" || selectedSlotType === "band") {
        const requiredGroupType = selectedSlotType === "duo" ? "duo" : "band";
        const selectedEntityGroupType = isProducerGigFlow
          ? selectedProductionRoster?.group_type || selectedProductionRoster?.group?.group_type || null
          : userGroups.find((g) => g.id === selectedGroupId)?.group_type || "band";

        if (selectedEntityGroupType !== requiredGroupType) {
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
          "Please upload a performance video to apply. This helps gig owners evaluate your talent.",
      });
      setAlertVisible(true);
      return;
    }

    if (!videoCopyrightAcknowledged || videoCopyrightDecision?.allowed !== true) {
      setAlertConfig({
        type: "warning",
        title: "Video Rights Check Required",
        message: "Confirm your rights and upload the performance video again so its released-recording fingerprint can be checked.",
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
      {
        summaryItems: [
          { label: "Gig", value: group?.name || "Gig", icon: "musical-notes-outline" },
          {
            label: "Apply as",
            value: isProducerGigFlow
              ? selectedProductionRoster?.display_name || "Production roster"
              : selectedGroup?.name || "Solo musician",
            icon: isGroupApplication || isProducerGigFlow ? "people-outline" : "person-outline",
          },
          { label: "Slot", value: formatSlotLabel(selectedSlotType), icon: "albums-outline" },
          { label: "Attachments", value: `${cvFile || cvUrl ? "CV" : "No CV"} + ${videoUrl ? "Video" : "No video"}`, icon: "document-text-outline" },
        ],
      },
    );
  }, [
    cvFile,
    cvUrl,
    group,
    groupAlreadyApplied,
    groupApplicationBy,
    ensureGigIsStillAvailable,
    ensureGroupListingIsStillAvailable,
    ensureReapplicationCooldownHasPassed,
    listingId,
    pitchMessage,
    processApplicationSubmission,
    productionRoster,
    selectedGroupId,
    selectedProductionRosterId,
    selectedProductionTeamId,
    selectedSlotType,
    setAlertConfig,
    setAlertVisible,
    requestConfirmation,
    userGroups,
    userId,
    userRole,
    videoUrl,
    videoCopyrightAcknowledged,
    videoCopyrightDecision,
  ]);

  return {
    handleSubmitApplication,
  };
};
