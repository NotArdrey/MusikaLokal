import { Ionicons } from "@expo/vector-icons";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as ExpoLinking from "expo-linking";
import { router } from "expo-router";
import React, {
    forwardRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    BackHandler,
    Dimensions,
    Image,
    Linking,
    Modal as RNModal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useProfileCompletion } from "../hooks/useProfileCompletion";
import CustomAlert from "./CustomAlert";
import DocumentUploader from "./DocumentUploader";
import Modal from "./modal";
import VideoUploader from "./VideoUploader";

const { width, height } = Dimensions.get("window");
const IMG_HEIGHT = height < 700 ? height * 0.3 : height * 0.35;

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scale = (size: number) => {
  const newSize = (width / 375) * size;
  return Math.max(newSize, size * 0.85);
};
const verticalScale = (size: number) => {
  const baseHeight = 812;
  const ratio = height / baseHeight;
  const clampedRatio = Math.max(0.8, Math.min(1.2, ratio));
  return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

interface ListingDetailsSheetProps {
  listingId: string | null;
}

const formatTime12 = (time24: string) => {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":");
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${suffix}`;
};

const ListingDetailsSheet = forwardRef<
  BottomSheetModal,
  ListingDetailsSheetProps
>(({ listingId }, ref) => {
  const { colors, isDark } = useTheme();
  const { userId, isSystemLocked, showLockAlert } = useAuth();
  const { isProfileComplete } = useProfileCompletion();
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [bookingNotes, setBookingNotes] = useState("");

  // Application State (for Gig applications)
  const [pitchMessage, setPitchMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [cvFile, setCvFile] = useState<any>(null); // File object from picker
  const [cvUrl, setCvUrl] = useState(""); // Uploaded URL (optional if we just upload on submit)
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const [hasExistingApplication, setHasExistingApplication] = useState(false);
  const [existingApplicationStatus, setExistingApplicationStatus] = useState<
    string | null
  >(null);

  // Studio Booking State (prevent spam)
  const [hasExistingStudioBooking, setHasExistingStudioBooking] =
    useState(false);
  const [existingStudioBookingStatus, setExistingStudioBookingStatus] =
    useState<string | null>(null);

  // Group Selection State (for gig applications)
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Group Deduplication State (prevent same group applying twice)
  const [groupAlreadyApplied, setGroupAlreadyApplied] = useState(false);
  const [groupApplicationBy, setGroupApplicationBy] = useState<string | null>(
    null,
  );

  // Spam Block State
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
    buttons?: any[];
  }>({ type: "info", title: "", message: "" });

  // Booking Request State (Invites)
  const [requestMessage, setRequestMessage] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Venue Selection State (for venue owners sending invites)
  const [userVenues, setUserVenues] = useState<any[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  // Review State
  const [reviews, setReviews] = useState<any[]>([]);
  const [existingBookings, setExistingBookings] = useState<any[]>([]); // Bookings from DB
  const [relatedListings, setRelatedListings] = useState<any[]>([]);

  // Tab State
  const [activeTab, setActiveTab] = useState("About");

  // Booking State
  const [date, setDate] = useState(new Date());
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 4);
    return d;
  });
  const [duration, setDuration] = useState(4);

  // New Calendar and Slot State
  const [selectedDate, setSelectedDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [validEndTimes, setValidEndTimes] = useState<string[]>([]);
  const [markedDates, setMarkedDates] = useState<any>({});

  // Multiple time slots state for multi-slot bookings (same day)
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<
    { start: string; end: string }[]
  >([]);

  // Multiple bookings state with pricing (different days)
  const [bookings, setBookings] = useState<
    {
      date: Date;
      startTime: Date;
      endTime: Date;
      timeSlots?: { start: string; end: string }[];
      pricing?: any;
    }[]
  >([]);
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  // Payment Option Modal State
  const [showPaymentOptionModal, setShowPaymentOptionModal] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<
    "full" | "downpayment"
  >("full");
  const [paymentBookingData, setPaymentBookingData] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Auto-calculate duration (only if validEndTimes is empty to avoid overwrite loop)
  useEffect(() => {
    if (!date || !endTime) {
      setDuration(0);
      return;
    }

    const start = new Date(date).getTime();
    const end = new Date(endTime).getTime();

    // Calculate diff in hours
    let diff = (end - start) / (1000 * 60 * 60);

    // Handle next day wraps if needed, but for now we assume same-day or flexible
    if (diff < 0) diff += 24;

    // Round to 1 decimal
    setDuration(Math.max(1, parseFloat(diff.toFixed(1))));
  }, [date, endTime]);

  // Confirmation State (reusing modal props logic or simple alerts)
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");

  // BackHandler Logic
  const [sheetIndex, setSheetIndex] = useState(-1);
  const previousSheetIndex = useRef(-1);

  const handleSheetChanges = useCallback(
    async (index: number) => {
      const wasHidden = previousSheetIndex.current < 0;
      const isNowVisible = index >= 0;
      previousSheetIndex.current = index;
      setSheetIndex(index);

      // Refresh studio bookings when sheet becomes visible (reopened or returned from payment)
      // This ensures calendar availability is up-to-date with newly created bookings
      if (
        wasHidden &&
        isNowVisible &&
        listingId &&
        group &&
        (group.type === "Studio" || group.type === "Venue")
      ) {
        console.log(
          "📅 Sheet opened - refreshing studio bookings for availability...",
        );
        try {
          const { data: bookingData } = await supabase.functions.invoke(
            "manage-listings",
            {
              body: { action: "fetch_studio_bookings", studioId: listingId },
            },
          );
          const fetchedBookings = bookingData || [];
          setExistingBookings(fetchedBookings);

          // Re-process availability with fresh booking data
          if (group.availability) {
            processAvailability(
              group.availability,
              fetchedBookings,
              group.dateOverrides,
              bookings,
            );
          }
        } catch (e) {
          console.error("Error refreshing studio bookings:", e);
        }
      }
    },
    [listingId, group, bookings],
  );

  useEffect(() => {
    const backAction = () => {
      if (sheetIndex >= 0) {
        (ref as any)?.current?.dismiss();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction,
    );
    return () => backHandler.remove();
  }, [sheetIndex, ref]);

  const handleConfirm = (
    action: () => void,
    title: string,
    message: string,
  ) => {
    console.log("🔵 handleConfirm called");

    // System Lock Check - Block if user has unpaid balance
    if (isSystemLocked) {
      showLockAlert();
      return;
    }

    // Profile Check Gate
    // Profile Check Gate
    if (!isProfileComplete) {
      setAlertConfig({
        type: "warning",
        title: "Profile Incomplete",
        message:
          "You need to complete your profile details (contact & address) before you can proceed.",
        buttons: [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setAlertVisible(false),
          },
          {
            text: "Complete Now",
            onPress: () => {
              setAlertVisible(false);
              router.push("/edit_profile");
            },
          },
        ],
      });
      setAlertVisible(true);
      return;
    }

    console.log("Title:", title);
    console.log("Message:", message);
    console.log("Action function:", action.name || "anonymous");
    setConfirmAction(() => action);
    setConfirmTitle(title);
    setConfirmMessage(message);
    setModalVisible(true);
    console.log("Modal should now be visible");
  };

  // Process payment with selected payment type (full or downpayment)
  const processPaymentWithType = async (
    paymentType: "full" | "downpayment",
  ) => {
    if (!paymentBookingData) return;

    const { booking, studioName, totalAmount } = paymentBookingData;
    const payAmount =
      paymentType === "downpayment" ? Math.round(totalAmount / 2) : totalAmount;
    const remainingBalance =
      paymentType === "downpayment" ? Math.round(totalAmount / 2) : 0;

    try {
      setIsProcessingPayment(true);
      console.log("💳 Creating PayMongo checkout session...", {
        paymentType,
        payAmount,
        remainingBalance,
      });

      // Generate environment-aware redirect URLs
      const redirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "success", booking_id: booking.id },
      });
      const cancelRedirectUrl = ExpoLinking.createURL("payment-result", {
        queryParams: { status: "cancelled", booking_id: booking.id },
      });

      const { data: paymentData, error: paymentError } =
        await supabase.functions.invoke("paymongo", {
          body: {
            action: "create_checkout",
            booking_id: booking.id,
            user_id: userId,
            amount: payAmount,
            total_amount: totalAmount,
            payment_type: paymentType,
            remaining_balance: remainingBalance,
            studio_name: studioName,
            booking_date: booking.booking_date,
            description:
              paymentType === "downpayment"
                ? `Downpayment (50%) for studio booking at ${studioName}`
                : `Studio booking at ${studioName}`,
            redirect_url: redirectUrl,
            cancel_redirect_url: cancelRedirectUrl,
          },
        });

      if (paymentError) {
        console.error("❌ Payment error:", paymentError);
        setIsProcessingPayment(false);
        setShowPaymentOptionModal(false);
        alert(
          "Booking created! However, payment setup failed. Please go to Pending bookings to complete payment.",
        );

        // Clear form and close
        setBookings([]);
        setSelectedTimeSlots([]);
        setBookingNotes("");
        setModalVisible(false);
        (ref as any)?.current?.dismiss();

        setTimeout(() => {
          router.push("/bookings" as any);
        }, 100);
        return;
      }

      if (paymentData?.checkout_url) {
        console.log("✅ Checkout URL:", paymentData.checkout_url);

        // Clear form
        setBookings([]);
        setSelectedTimeSlots([]);
        setBookingNotes("");
        setModalVisible(false);
        setShowPaymentOptionModal(false);
        setPaymentBookingData(null);
        (ref as any)?.current?.dismiss();

        // Open PayMongo checkout in browser
        const canOpen = await Linking.canOpenURL(paymentData.checkout_url);
        if (canOpen) {
          await Linking.openURL(paymentData.checkout_url);
        } else {
          alert(
            "Booking created! Please complete payment from your Pending bookings.",
          );
          setTimeout(() => {
            router.push("/bookings" as any);
          }, 100);
        }
      } else {
        setShowPaymentOptionModal(false);
        alert(
          "Booking created! Please complete payment from your Pending bookings.",
        );

        // Clear form and close
        setBookings([]);
        setSelectedTimeSlots([]);
        setBookingNotes("");
        setModalVisible(false);
        (ref as any)?.current?.dismiss();

        setTimeout(() => {
          router.push("/bookings" as any);
        }, 100);
      }
    } catch (payErr: any) {
      console.error("❌ Payment initiation error:", payErr);
      alert(
        "Booking created! Please complete payment from your Pending bookings to confirm.",
      );

      // Clear form and close
      setBookings([]);
      setSelectedTimeSlots([]);
      setBookingNotes("");
      setModalVisible(false);
      setShowPaymentOptionModal(false);
      (ref as any)?.current?.dismiss();

      setTimeout(() => {
        router.push("/bookings" as any);
      }, 100);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Check if user has already applied to this gig
  const checkExistingApplication = async () => {
    if (!userId || !listingId || !group || group.type !== "Gig") return;

    try {
      // Check for any existing application to this specific gig
      // Once rejected, musician cannot re-apply to the same gig
      const { data, error } = await supabase
        .from("gig_applications")
        .select("id, status, group_id, cv_url")
        .eq("applicant_id", userId)
        .eq("gig_id", listingId)
        .maybeSingle();

      if (error) {
        console.error("Error checking existing application:", error);
        return;
      }

      if (data) {
        console.log("📋 User has already applied to this gig:", data);
        setHasExistingApplication(true);
        setExistingApplicationStatus(data.status);
        if (data.cv_url) setCvUrl(data.cv_url);
      } else {
        setHasExistingApplication(false);
        setExistingApplicationStatus(null);
        setCvUrl("");
      }
    } catch (err) {
      console.error("Error checking application:", err);
    }
  };

  // Fetch user's groups for gig application (owned OR member of)
  const fetchUserGroups = async () => {
    if (!userId || !group || group.type !== "Gig") return;

    setLoadingGroups(true);
    try {
      // Fetch groups where user is owner
      const { data: ownedGroups, error: ownedError } = await supabase
        .from("groups")
        .select("id, name, images, genre")
        .eq("owner_id", userId);

      // Fetch groups where user is a member (from group_members table)
      const { data: memberGroups, error: memberError } = await supabase
        .from("group_members")
        .select("group_id, groups:group_id(id, name, images, genre)")
        .eq("user_id", userId);

      if (ownedError) {
        console.error("Error fetching owned groups:", ownedError);
      }
      if (memberError) {
        console.error("Error fetching member groups:", memberError);
        // If group_members table doesn't exist yet, just use owned groups
      }

      // Combine and deduplicate
      const allGroups = [
        ...(ownedGroups || []),
        ...(memberGroups || []).map((m: any) => m.groups).filter(Boolean),
      ];

      // Remove duplicates by id
      const uniqueGroups = allGroups.filter(
        (g, idx, arr) => arr.findIndex((x) => x.id === g.id) === idx,
      );

      console.log("📋 Fetched groups (owned + member):", uniqueGroups.length);
      setUserGroups(uniqueGroups);
    } catch (err) {
      console.error("Error fetching groups:", err);
    } finally {
      setLoadingGroups(false);
    }
  };

  // Check if selected group has already applied to this gig
  const checkGroupApplication = async (groupId: string) => {
    if (!groupId || !listingId) {
      setGroupAlreadyApplied(false);
      setGroupApplicationBy(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("gig_applications")
        .select("id, applicant_id, status, profiles:applicant_id(full_name)")
        .eq("gig_id", listingId)
        .eq("group_id", groupId)
        .neq("status", "rejected")
        .maybeSingle();

      if (error) {
        console.error("Error checking group application:", error);
        return;
      }

      if (data && data.applicant_id !== userId) {
        console.log("⚠️ Group already applied by another member:", data);
        setGroupAlreadyApplied(true);
        setGroupApplicationBy(
          (data.profiles as any)?.full_name || "Another member",
        );
      } else {
        setGroupAlreadyApplied(false);
        setGroupApplicationBy(null);
      }
    } catch (err) {
      console.error("Error checking group application:", err);
    }
  };

  // Check if user has an unpaid booking for this studio (blocks new bookings until paid)
  const checkExistingStudioBooking = async () => {
    if (
      !userId ||
      !listingId ||
      !group ||
      (group.type !== "Studio" && group.type !== "Venue")
    )
      return;

    try {
      // Only check for confirmed bookings with unpaid/pending payment (need to pay before booking again)
      // Pending bookings (awaiting owner response) no longer block new bookings
      const { data, error } = await supabase
        .from("studio_bookings")
        .select(
          "id, status, booking_date, payment_status, payment_amount, remaining_balance",
        )
        .eq("user_id", userId)
        .eq("studio_id", listingId)
        .eq("status", "confirmed")
        .in("payment_status", ["unpaid", "pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error checking existing studio booking:", error);
        return;
      }

      if (data) {
        console.log("📋 User has an unpaid booking for this studio:", data);
        setHasExistingStudioBooking(true);
        setExistingStudioBookingStatus("unpaid");
      } else {
        setHasExistingStudioBooking(false);
        setExistingStudioBookingStatus(null);
      }
    } catch (err) {
      console.error("Error checking studio booking:", err);
    }
  };

  // Check Eligibility (Spam Block)
  const checkEligibility = async (targetGigId: string) => {
    if (!userId || !targetGigId) return;
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-listings",
        {
          body: { action: "check_eligibility", userId, gigId: targetGigId },
        },
      );

      // Handle error gracefully - don't block user on eligibility check failure
      if (error) {
        console.warn(
          "Eligibility check failed, allowing access:",
          error.message,
        );
        setIsBlocked(false);
        setBlockReason(null);
        return;
      }

      if (data && data.blocked) {
        setIsBlocked(true);
        setBlockReason(data.reason);
      } else {
        setIsBlocked(false);
        setBlockReason(null);
      }
    } catch (err: any) {
      // Fail-open: Allow user to proceed if eligibility check fails
      console.warn(
        "Eligibility check error, allowing access:",
        err?.message || err,
      );
      setIsBlocked(false);
      setBlockReason(null);
    }
  };

  // Helper to upload CV
  const uploadDocument = async (file: any) => {
    try {
      console.log("📤 Uploading CV:", file.name);

      // 1. Read file
      const response = await fetch(file.uri);
      const arrayBuffer = await response.arrayBuffer();

      // 2. Prepare path
      const fileExt = file.name.split(".").pop() || "pdf";
      const fileName = `${userId}/cvs/${Date.now()}_cv.${fileExt}`;

      // 3. Upload
      const { data, error } = await supabase.storage
        .from("documents") // Ensure this bucket exists or use 'applications'
        .upload(fileName, arrayBuffer, {
          contentType: file.mimeType || "application/pdf",
          upsert: false,
        });

      if (error) throw error;

      // 4. Get Public URL
      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading CV:", error);
      throw error;
    }
  };

  // Handle Submit Application for Gigs
  const handleSubmitApplication = async () => {
    // ... (validation checks same as before) ...
    console.log("=== handleSubmitApplication CALLED ===");

    if (!userId || !listingId || !group) {
      console.error("Missing required data for application:", {
        userId,
        listingId,
        group,
      });
      return;
    }

    // 24-hour advance booking check for gig applications
    if (group.event_date) {
      const eventDate = new Date(group.event_date);
      // If event has start time, use it; otherwise assume start of day
      const eventStartTime = group.requirements?.event_start_time;
      if (eventStartTime) {
        // Parse time like "06:00 PM"
        const [time, period] = eventStartTime.split(" ");
        const [hours, minutes] = time.split(":").map(Number);
        let hour24 = hours;
        if (period === "PM" && hours !== 12) hour24 += 12;
        if (period === "AM" && hours === 12) hour24 = 0;
        eventDate.setHours(hour24, minutes, 0, 0);
      }

      const now = new Date();
      const hoursUntilEvent =
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilEvent < 24) {
        setAlertConfig({
          type: "error",
          title: "Application Deadline Passed",
          message:
            "Applications must be submitted at least 24 hours before the event. This gig is no longer accepting applications.",
        });
        setAlertVisible(true);
        return;
      }
    }

    // Check if group already applied (by another member)
    if (groupAlreadyApplied) {
      setAlertConfig({
        type: "warning",
        title: "Group Already Applied",
        message: `This group has already applied via ${groupApplicationBy}. Only one application per group is allowed.`,
      });
      setAlertVisible(true);
      return;
    }

    // Validate group selection for group-only gigs
    const musicianTypeRequired = group.requirements?.musician_type || "both";
    if (musicianTypeRequired === "group" && !selectedGroupId) {
      setAlertConfig({
        type: "error",
        title: "Group Required",
        message:
          "This gig requires applications from groups. Please select a group to apply.",
      });
      setAlertVisible(true);
      return;
    }

    // Validate CV
    if (!cvFile && !cvUrl) {
      // Check if new file selected OR existing CV exists (though logic resets cvUrl on load, but good to be safe)
      setAlertConfig({
        type: "error",
        title: "CV Required",
        message: "Please upload your CV/Resume to apply.",
      });
      setAlertVisible(true);
      return;
    }

    // Validate Video (required for venue gig applications)
    if (!videoUrl) {
      setAlertConfig({
        type: "error",
        title: "Video Required",
        message: "Please upload a performance video to apply. This helps venue owners evaluate your talent.",
      });
      setAlertVisible(true);
      return;
    }

    // CONFIRMATION STEP
    setConfirmTitle("Submit Application?");
    setConfirmMessage(
      "Are you sure you want to submit this application? This action cannot be undone.",
    );
    setConfirmAction(() => processApplicationSubmission); // Delegate to actual submission function
    setModalVisible(true);
  };

  const processApplicationSubmission = async () => {
    setIsSubmittingApplication(true);
    console.log("Inserting application into database...");

    try {
      // Upload CV first
      let uploadedCvUrl = null;
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

      const { data, error } = await supabase
        .from("gig_applications")
        .insert({
          applicant_id: userId,
          gig_id: listingId,
          group_id: selectedGroupId || null,
          is_solo_application: !selectedGroupId, // Flag to distinguish solo vs group
          pitch_message: pitchMessage,
          video_url: videoUrl || null,
          cv_url: uploadedCvUrl,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Error submitting application:", error);

        // Check for unique constraint violation (group already applied)
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

      // ... (rest of notification logic same as before) ...
      if (group?.organizer_id && data) {
        try {
          if (group.organizer_id !== userId) {
            await supabase.functions.invoke("manage-listings", {
              body: {
                action: "create_notification",
                userId,
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
              },
            });
          }
        } catch (notifyErr) {
          console.error("Failed to notify gig organizer:", notifyErr);
        }
      }

      // Notify group members if this is a group application
      if (selectedGroupId && data) {
        try {
          // Fetch group members (excluding the applicant)
          const { data: members } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", selectedGroupId)
            .neq("user_id", userId);

          if (members && members.length > 0) {
            // Get group name for notification
            const selectedGroup = userGroups.find(
              (g) => g.id === selectedGroupId,
            );

            // Create notifications for all members
            const notifications = members.map((m) => ({
              user_id: m.user_id,
              type: "info",
              title: "Group Gig Application",
              message: `${selectedGroup?.name || "Your group"} has applied for "${group.name}". Check the gig details for more info.`,
              meta: { gig_id: listingId, application_id: data.id },
            }));

            await supabase.functions.invoke("manage-listings", {
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

      // AI LEARNING: Strong signal from applying to a gig
      if (group && group.embedding) {
        try {
          await supabase.rpc("update_user_interest", {
            p_user_id: userId,
            p_item_vector: group.embedding,
            p_weight: 0.4, // Strong learning signal for applying
          });
          console.log("🤖 AI learned from gig application:", group.name);
        } catch (e) {
          console.log("Error updating AI interest from application:", e);
        }
      }

      // Update application status
      setHasExistingApplication(true);
      setExistingApplicationStatus("pending");

      // Show success alert
      setAlertConfig({
        type: "success",
        title: "Application Submitted!",
        message: selectedGroupId
          ? "Your group application has been submitted successfully. Group members have been notified. The venue owner will review it and get back to you soon."
          : "Your application has been submitted successfully. The venue owner will review it and get back to you soon.",
      });
      setAlertVisible(true);

      // Clear form
      setPitchMessage("");
      setVideoUrl("");
      setCvFile(null);
      setCvUrl("");

      // Close the bottom sheet after alert is dismissed
      setTimeout(() => {
        if (ref && "current" in ref && ref.current) {
          ref.current.dismiss();
        }
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
  };

  // Snap points
  const snapPoints = useMemo(() => ["50%", "95%"], []);

  useEffect(() => {
    console.log("=== ListingDetailsSheet useEffect triggered ===");
    console.log("listingId:", listingId);
    if (listingId) {
      console.log("Fetching group details for:", listingId);
      fetchGroupDetails();
      setActiveTab("About");
      // Reset booking state
      setDate(null as any);
      setEndTime(null as any);
      setBookings([]);
      setBookingNotes("");
      // Reset application state
      setPitchMessage("");
      setVideoUrl("");
      setHasExistingApplication(false);
      setExistingApplicationStatus(null);
      // Reset studio booking state
      setHasExistingStudioBooking(false);
      setExistingStudioBookingStatus(null);
      // Reset group selection state
      setSelectedGroupId(null);
      setUserGroups([]);
      // Reset venue selection state
      setSelectedVenueId(null);
      setUserVenues([]);

      console.log("Application form reset");
      setShowAddBooking(false);
    }
  }, [listingId]);

  // Check for existing application when group data is loaded
  useEffect(() => {
    if (group && userId && group.type === "Gig") {
      checkExistingApplication();
      fetchUserGroups();
    }
  }, [group, userId]);

  // Check for existing studio booking when group data is loaded
  useEffect(() => {
    if (
      group &&
      userId &&
      (group.type === "Studio" || group.type === "Venue")
    ) {
      checkExistingStudioBooking();
    }
    // Check eligibility if Gig (uses gig_id)
    if (group && userId && group.type === "Gig") {
      checkEligibility(group.id);
    }
  }, [group, userId]);

  // Check if selected group has already applied (group-level deduplication)
  useEffect(() => {
    if (selectedGroupId) {
      checkGroupApplication(selectedGroupId);
    } else {
      setGroupAlreadyApplied(false);
      setGroupApplicationBy(null);
    }
  }, [selectedGroupId, listingId]);

  // Debug effect to monitor application state changes
  useEffect(() => {
    console.log("📝 Application State Updated:");
    console.log("  - pitchMessage:", pitchMessage);
    console.log("  - videoUrl:", videoUrl);
    console.log("  - isSubmittingApplication:", isSubmittingApplication);
  }, [pitchMessage, videoUrl, isSubmittingApplication]);

  // Debug effect to monitor userId changes
  useEffect(() => {
    console.log("👤 userId changed:", userId);
  }, [userId]);

  const fetchGroupDetails = async () => {
    console.log("=== fetchGroupDetails called ===");
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log("User:", user?.id);

      let data = null;
      let type = "Group";
      let ownerId = null;

      // Try Group
      const { data: groupData } = await supabase
        .from("groups_with_stats")
        .select("*")
        .eq("id", listingId)
        .single();

      if (groupData) {
        data = groupData;
        type = "Group";
        ownerId = groupData.owner_id;
      } else {
        // Try Studio
        const { data: studioData } = await supabase
          .from("studios_with_stats")
          .select("*")
          .eq("id", listingId)
          .single();

        if (studioData) {
          data = studioData;
          type = "Studio";
          ownerId = studioData.owner_id;
          if (studioData.amenities?.includes("Stage")) type = "Venue";
        } else {
          // Try Gig
          const { data: gigData } = await supabase
            .from("gigs_with_stats")
            .select("*")
            .eq("id", listingId)
            .single();

          if (gigData) {
            data = gigData;
            type = "Gig";
            ownerId = gigData.organizer_id;
          } else {
            // Try Profile (Solo Artist)
            const { data: profileData } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", listingId)
              .single();

            if (profileData && profileData.role === "musician") {
              data = profileData;
              type = "Artist";
              ownerId = profileData.id; // Self-managed
            }
          }
        }
      }

      if (data && ownerId) {
        console.log("Found data:", {
          type,
          id: data.id,
          name: data.name || data.full_name,
        });
        // Fetch owner profile separately
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, role")
          .eq("id", ownerId)
          .single();
        console.log("Owner profile:", ownerProfile);

        const normalizedData = {
          ...data,
          type,
          name: data.name || data.full_name, // Handle profile name
          description: data.description || data.bio, // Handle profile bio
          image: data.image || data.avatar_url, // Handle profile avatar
          images: data.images || (data.avatar_url ? [data.avatar_url] : []),
          location: data.location || data.address, // Handle profile address
          genre: data.genre || (data.genres ? data.genres.join(", ") : ""),
          owner_name:
            ownerProfile?.full_name || data.name || data.full_name || "Unknown", // Use data.full_name if ownerProfile fails (self-managed)
          owner_avatar: ownerProfile?.avatar_url || data.avatar_url,
          role: ownerProfile?.role || data.role,
          rate:
            data.hourly_rate?.toString() ||
            data.budget?.toString() ||
            data.rate ||
            "0",
          review_count: data.review_count || 0,
          rating: data.rating || 0,
        };

        // If studio or venue, fetch availability from operating hours
        if (type === "Studio" || type === "Venue") {
          console.log("📅 Fetching studio operating hours...");
          const { data: operatingHours, error: hoursError } = await supabase
            .from("studio_operating_hours")
            .select("*")
            .eq("studio_id", data.id)
            .order("slot_order", { ascending: true });

          // Also fetch date overrides (specific dates)
          console.log("📅 Fetching studio date overrides...");
          const { data: dateOverrides, error: overridesError } = await supabase
            .from("studio_date_overrides")
            .select("*")
            .eq("studio_id", data.id);

          if (!hoursError && operatingHours) {
            console.log("📅 Operating hours fetched:", operatingHours);
            // Convert operating hours to availability format - now supports multiple slots per day
            const dayNames = [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ];
            const availability = dayNames.map((dayName, index) => {
              const dayHours = operatingHours.filter(
                (h: any) => h.day_of_week === index && h.is_open,
              );
              return {
                day: dayName,
                slots: dayHours.map((h: any) => ({
                  start: h.open_time,
                  end: h.close_time,
                })),
              };
            });
            normalizedData.availability = availability;
            console.log("📅 Converted availability:", availability);
          } else if (!data.availability) {
            console.log(
              "⚠️ No operating hours found, checking availability column...",
            );
            // Fallback: check if availability exists in the data (JSONB column)
            if (data.availability) {
              normalizedData.availability = data.availability;
              console.log(
                "📅 Using availability from JSONB column:",
                data.availability,
              );
            }
          }

          // Store date overrides for use in availability processing
          if (!overridesError && dateOverrides && dateOverrides.length > 0) {
            console.log("📅 Date overrides fetched:", dateOverrides);
            normalizedData.dateOverrides = dateOverrides;
          }

          // Fetch studio settings (booking rules, pricing multipliers)
          console.log("⚙️ Fetching studio settings...");
          const { data: studioSettings, error: settingsError } = await supabase
            .from("studio_settings")
            .select("*")
            .eq("studio_id", data.id)
            .single();

          if (!settingsError && studioSettings) {
            console.log("⚙️ Studio settings fetched:", studioSettings);
            normalizedData.settings = studioSettings;
          } else {
            console.log("⚠️ No studio settings found, using defaults");
            normalizedData.settings = {
              lead_time_hours: 24,
              weekend_multiplier: 1.0,
              peak_season_multiplier: 1.0,
              peak_season_dates: [],
              off_peak_multiplier: 1.0,
              off_peak_dates: [],
            };
          }
        }

        console.log("Setting group data:", normalizedData);
        setGroup(normalizedData);

        // Fetch existing bookings for availability calculation
        const { data: bookingData } = await supabase.functions.invoke(
          "manage-listings",
          {
            body: { action: "fetch_studio_bookings", studioId: data.id },
          },
        );
        const fetchedBookings = bookingData || [];
        setExistingBookings(fetchedBookings);

        // Process availability (Availability + Bookings + Date Overrides)
        if (normalizedData.availability) {
          console.log("📅 Processing availability for calendar...");
          processAvailability(
            normalizedData.availability,
            fetchedBookings,
            normalizedData.dateOverrides,
          );
        } else {
          console.log("⚠️ No availability data to process");
        }
      } else {
        console.log("No data found for listingId:", listingId);
      }
    } catch (e) {
      console.log("Error fetching details:", e);
    } finally {
      setLoading(false);
      console.log("fetchGroupDetails complete, loading:", false);
    }
  };

  const processAvailability = (
    availability: any[],
    dbBookings: any[],
    dateOverrides?: any[],
    cartBookings?: any[],
  ) => {
    console.log("📅 processAvailability called with:", {
      availability,
      dbBookingsCount: dbBookings.length,
      dateOverridesCount: dateOverrides?.length || 0,
      cartBookingsCount: cartBookings?.length || 0,
    });
    const marked: any = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get lead time for filtering slots that are too soon
    const leadTimeHours = group?.settings?.lead_time_hours || 0;
    const minBookingTime = new Date();
    minBookingTime.setHours(minBookingTime.getHours() + leadTimeHours);

    // Map availability for easier lookup (weekly schedule)
    const availabilityMap: { [key: number]: any } = {};
    availability.forEach((daySchedule: any) => {
      const dayIndex = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ].indexOf(daySchedule.day.toLowerCase());
      if (dayIndex !== -1) {
        availabilityMap[dayIndex] = daySchedule;
        console.log(
          `📅 Mapped ${daySchedule.day} (index ${dayIndex}) with ${daySchedule.slots?.length || 0} slots`,
        );
      }
    });

    // Map date overrides for easier lookup (specific dates override weekly schedule)
    const dateOverrideMap: { [key: string]: any } = {};
    if (dateOverrides && Array.isArray(dateOverrides)) {
      dateOverrides.forEach((override: any) => {
        const dateStr = override.override_date;
        dateOverrideMap[dateStr] = override;
        console.log(
          `📅 Mapped date override for ${dateStr}: open=${override.is_open}, ${override.open_time} - ${override.close_time}`,
        );
      });
    }

    console.log("📅 Availability map:", availabilityMap);
    console.log("📅 Date override map:", dateOverrideMap);

    // Loop next 90 days to ensure coverage
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      // Use local date string to avoid timezone issues
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const dayIndex = date.getDay();

      // Check if there's a specific date override for this date (priority over weekly schedule)
      const dateOverride = dateOverrideMap[dateStr];
      let daySchedule: any = null;

      if (dateOverride) {
        // Use date override instead of weekly schedule
        if (
          dateOverride.is_open &&
          dateOverride.open_time &&
          dateOverride.close_time
        ) {
          daySchedule = {
            day: date.toLocaleDateString("en-US", { weekday: "long" }),
            slots: [
              { start: dateOverride.open_time, end: dateOverride.close_time },
            ],
            isOverride: true,
          };
          console.log(`📅 Using date override for ${dateStr}:`, daySchedule);
        } else {
          // Date is closed via override
          daySchedule = null;
        }
      } else {
        // Use weekly schedule
        daySchedule = availabilityMap[dayIndex];
      }

      // Check if Open
      if (daySchedule && daySchedule.slots && daySchedule.slots.length > 0) {
        // Calculate if Fully Booked
        // 1. Generate all potential slots for this day (considering lead time)
        const potentialSlots: string[] = [];
        daySchedule.slots.forEach((slot: any) => {
          const start = new Date(`${dateStr}T${slot.start}`);
          const end = new Date(`${dateStr}T${slot.end}`);
          const current = new Date(start);
          while (current < end) {
            // Only count slot if it passes lead time check
            if (current >= minBookingTime) {
              potentialSlots.push(current.toTimeString().slice(0, 5));
            }
            current.setHours(current.getHours() + 1);
          }
        });

        // If no potential slots available after lead time check, mark as unavailable
        if (potentialSlots.length === 0) {
          marked[dateStr] = {
            disabled: true,
            disableTouchEvent: true,
            textColor: isDark ? "#4B5563" : "#D1D5DB",
          };
          continue;
        }

        // 2. Check database bookings for this day (Confirmed OR Pending should block)
        // Studio bookings have separate booking_date (DATE), start_time (TIME), end_time (TIME) columns
        const dayDbBookings = dbBookings.filter((b: any) => {
          if (b.status === "cancelled" || b.status === "rejected") return false;
          // Match booking_date directly with the selected date string
          return b.booking_date === dateStr;
        });

        // 3. Mark slots as taken
        const blockedTimes = new Set<string>();

        // Block times from database bookings
        dayDbBookings.forEach((b: any) => {
          // Combine booking_date with start_time and end_time to create proper Date objects
          const bStart = new Date(`${b.booking_date}T${b.start_time}`);
          const bEnd = new Date(`${b.booking_date}T${b.end_time}`);

          if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) {
            console.log("⚠️ Invalid booking times in processAvailability:", b);
            return;
          }

          const current = new Date(bStart);
          while (current < bEnd) {
            blockedTimes.add(current.toTimeString().slice(0, 5));
            current.setHours(current.getHours() + 1);
          }
        });

        // Also block times from cart bookings (same date)
        if (cartBookings && cartBookings.length > 0) {
          const cartBookingsForDate = cartBookings.filter((b) => {
            const cartDateStr = b.date.toISOString().split("T")[0];
            return cartDateStr === dateStr;
          });

          cartBookingsForDate.forEach((b) => {
            // If booking has timeSlots array, use that (multi-slot booking)
            if (b.timeSlots && b.timeSlots.length > 0) {
              b.timeSlots.forEach((slot: any) => {
                const slotStart = new Date(`${dateStr}T${slot.start}`);
                const slotEnd = new Date(`${dateStr}T${slot.end}`);
                const current = new Date(slotStart);
                while (current < slotEnd) {
                  blockedTimes.add(current.toTimeString().slice(0, 5));
                  current.setHours(current.getHours() + 1);
                }
              });
            } else if (b.startTime && b.endTime) {
              // Single slot booking - use startTime and endTime
              const current = new Date(b.startTime);
              while (current < b.endTime) {
                blockedTimes.add(current.toTimeString().slice(0, 5));
                current.setHours(current.getHours() + 1);
              }
            }
          });
        }

        const availableCount = potentialSlots.filter(
          (s) => !blockedTimes.has(s),
        ).length;

        if (availableCount > 0) {
          marked[dateStr] = {
            marked: true,
            dotColor: daySchedule.isOverride ? "#F59E0B" : colors.primary, // Orange for overrides
          };
        } else {
          // Fully Booked
          marked[dateStr] = {
            disabled: true,
            disableTouchEvent: true,
            textColor: isDark ? "#4B5563" : "#D1D5DB",
          };
        }
      } else {
        // Close / Unavailable
        marked[dateStr] = {
          disabled: true,
          disableTouchEvent: true,
          textColor: isDark ? "#4B5563" : "#D1D5DB", // Gray out
        };
      }
    }

    console.log("📅 Marked dates count:", Object.keys(marked).length);
    console.log("📅 Sample marked dates:", Object.keys(marked).slice(0, 5));
    setMarkedDates(marked);
  };

  const fetchAvailableSlots = async (dateStr: string) => {
    console.log("🕐 fetchAvailableSlots called for date:", dateStr);
    console.log("🕐 group.availability:", group?.availability);
    console.log("🕐 group.dateOverrides:", group?.dateOverrides);

    if (!group?.availability) {
      console.log("⚠️ No availability data in group");
      return;
    }

    const selectedDate = new Date(dateStr);
    const dayName = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][selectedDate.getDay()];
    console.log("🕐 Looking for day:", dayName);

    // Check if there's a specific date override for this date
    let daySchedule: any = null;

    if (group.dateOverrides && Array.isArray(group.dateOverrides)) {
      const dateOverride = group.dateOverrides.find(
        (o: any) => o.override_date === dateStr,
      );
      if (dateOverride) {
        console.log("🕐 Found date override:", dateOverride);
        if (
          dateOverride.is_open &&
          dateOverride.open_time &&
          dateOverride.close_time
        ) {
          daySchedule = {
            day: dayName,
            slots: [
              { start: dateOverride.open_time, end: dateOverride.close_time },
            ],
            isOverride: true,
          };
        } else {
          // Date is closed
          console.log("⚠️ Date override marks this date as closed");
          setAvailableSlots([]);
          return;
        }
      }
    }

    // Fall back to weekly schedule if no override
    if (!daySchedule) {
      daySchedule = group.availability.find(
        (a: any) => a.day.toLowerCase() === dayName,
      );
    }

    console.log("🕐 Found day schedule:", daySchedule);

    if (!daySchedule || !daySchedule.slots) {
      console.log("⚠️ No slots for this day");
      setAvailableSlots([]);
      return;
    }

    // Generate time slots from the availability
    // Use Set to prevent duplicates
    const slotsSet = new Set<string>();

    // Identify blocked times from existing bookings (Confirmed OR Pending)
    // Studio bookings have separate booking_date (DATE), start_time (TIME), end_time (TIME) columns
    const dayBookings = existingBookings.filter((b: any) => {
      if (b.status === "cancelled" || b.status === "rejected") return false;
      // Match booking_date directly with the selected date string
      const bookingDateStr = b.booking_date;
      return bookingDateStr === dateStr;
    });
    console.log(
      "🕐 Day bookings:",
      dayBookings.length,
      dayBookings.map((b: any) => ({
        date: b.booking_date,
        start: b.start_time,
        end: b.end_time,
        status: b.status,
      })),
    );

    const blockedTimes = new Set<string>();

    // Block times from existing database bookings
    dayBookings.forEach((b: any) => {
      // start_time and end_time are TIME columns (e.g., "09:00:00" or "09:00")
      // Combine with booking_date to create proper Date objects
      const bStart = new Date(`${b.booking_date}T${b.start_time}`);
      const bEnd = new Date(`${b.booking_date}T${b.end_time}`);

      if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) {
        console.log("⚠️ Invalid booking times:", b);
        return;
      }

      const current = new Date(bStart);
      while (current < bEnd) {
        blockedTimes.add(current.toTimeString().slice(0, 5));
        current.setHours(current.getHours() + 1);
      }
    });

    // Also block times from bookings already added to cart (same date)
    const cartBookingsForDate = bookings.filter((b) => {
      const cartDateStr = b.date.toISOString().split("T")[0];
      return cartDateStr === dateStr;
    });

    cartBookingsForDate.forEach((b) => {
      // If booking has timeSlots array, use that (multi-slot booking)
      if (b.timeSlots && b.timeSlots.length > 0) {
        b.timeSlots.forEach((slot) => {
          const slotStart = new Date(`${dateStr}T${slot.start}`);
          const slotEnd = new Date(`${dateStr}T${slot.end}`);
          const current = new Date(slotStart);
          while (current < slotEnd) {
            blockedTimes.add(current.toTimeString().slice(0, 5));
            current.setHours(current.getHours() + 1);
          }
        });
      } else {
        // Single slot booking - use startTime and endTime
        const current = new Date(b.startTime);
        while (current < b.endTime) {
          blockedTimes.add(current.toTimeString().slice(0, 5));
          current.setHours(current.getHours() + 1);
        }
      }
    });

    // Also block times from currently selected time slots (for multi-slot selection on same day)
    selectedTimeSlots.forEach((slot) => {
      const slotStart = new Date(`${dateStr}T${slot.start}`);
      const slotEnd = new Date(`${dateStr}T${slot.end}`);
      const current = new Date(slotStart);
      while (current < slotEnd) {
        blockedTimes.add(current.toTimeString().slice(0, 5));
        current.setHours(current.getHours() + 1);
      }
    });

    console.log("🕐 Blocked times (including cart):", Array.from(blockedTimes));

    daySchedule.slots.forEach((slot: any) => {
      console.log("🕐 Processing slot:", slot);
      const start = new Date(`${dateStr}T${slot.start}`);
      const end = new Date(`${dateStr}T${slot.end}`);

      // Get lead time for filtering slots that are too soon
      const leadTimeHours = group?.settings?.lead_time_hours || 0;
      const minBookingTime = new Date();
      minBookingTime.setHours(minBookingTime.getHours() + leadTimeHours);

      // Generate hourly slots or based on duration
      const current = new Date(start);
      while (current < end) {
        const timeStr = current.toTimeString().slice(0, 5); // HH:MM

        // Check if this slot is past the lead time requirement
        const slotDateTime = new Date(`${dateStr}T${timeStr}`);
        const passesLeadTime = slotDateTime >= minBookingTime;

        // Only add if not blocked AND passes lead time check
        if (!blockedTimes.has(timeStr) && passesLeadTime) {
          slotsSet.add(timeStr);
        }
        current.setHours(current.getHours() + 1); // Assuming 1-hour slots
      }
    });

    const uniqueSlots = Array.from(slotsSet).sort();
    console.log("🕐 Generated slots:", uniqueSlots);
    setAvailableSlots(uniqueSlots);
  };

  // Refresh available slots and calendar when bookings cart changes (to block already-selected times)
  useEffect(() => {
    if (group?.availability) {
      // Re-process calendar marked dates to reflect cart changes
      processAvailability(
        group.availability,
        existingBookings,
        group.dateOverrides,
        bookings,
      );

      // Also refresh available slots if a date is selected
      if (selectedDate) {
        fetchAvailableSlots(selectedDate);
      }
    }
  }, [bookings.length, selectedTimeSlots.length]);

  const toggleFavorite = async () => {
    const nextState = !isFavorited;
    setIsFavorited(nextState);

    // AI LEARNING: If favoriting, update user interest profile
    if (nextState && group && group.embedding) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.rpc("update_user_interest", {
            p_user_id: user.id,
            p_item_vector: group.embedding,
            p_weight: 0.3, // Strong learning signal for explicit favorite
          });
          // console.log('AI Learned from Favorite!');
        }
      } catch (e) {
        console.log("Error updating interest:", e);
      }
    }
  };

  // Track View History (AI Signal) - Learn from views with weak weight
  useEffect(() => {
    const trackView = async () => {
      if (group && group.embedding) {
        try {
          // Save to local storage for history
          await AsyncStorage.setItem(
            "last_viewed_item",
            JSON.stringify({
              id: listingId,
              embedding: group.embedding,
              type: group.type,
              timestamp: Date.now(),
            }),
          );

          // AI LEARNING: Update user interest from view (weak signal)
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase.rpc("update_user_interest", {
              p_user_id: user.id,
              p_item_vector: group.embedding,
              p_weight: 0.05, // Weak learning signal for just viewing
            });
            console.log("🤖 AI learned from view:", group.name);
          }
        } catch (e) {
          console.log("Error tracking view:", e);
        }
      }
    };
    trackView();
  }, [listingId, group]);

  // Fetch Reviews
  useEffect(() => {
    const fetchDetails = async () => {
      if (!listingId) return;
      try {
        // Determine filter column based on type
        // Note: type might not be set yet if group is null, but we can try common logic or wait for group
        // Better: fetch all reviews linked to this ID if we assume ID is unique across tables?
        // Actually schema has separate columns. We need to know the type or check all cols.
        // However, listingId comes from props.
        // Let's use the `group` type if available or try to infer.
        if (!group) return;

        let col = "group_id";
        if (group.type === "Studio" || group.type === "Venue")
          col = "studio_id";
        if (group.type === "Gig") col = "gig_id";

        const { data: rData } = await supabase
          .from("reviews")
          .select("*, author:author_id(full_name, avatar_url)")
          .eq(col, listingId)
          .order("created_at", { ascending: false })
          .limit(5);

        if (rData) setReviews(rData);
      } catch (e) {
        console.log("Error reviews:", e);
      }

      // 2. Fetch Related Listings (AI Recommendation)
      if (group.embedding) {
        try {
          const { data: relatedData, error } = await supabase.rpc(
            "match_listings",
            {
              query_embedding: group.embedding,
              match_threshold: 0.5, // 50% similarity
              match_count: 5,
              listing_type: group.type,
            },
          );

          if (relatedData && relatedData.length > 0) {
            // Filter out self
            const relatedIds = relatedData
              .map((r: any) => r.id)
              .filter((id: string) => id !== listingId);

            if (relatedIds.length > 0) {
              // Fetch full details for these IDs from the respective view
              let viewName = "groups_with_stats";
              if (group.type === "Studio" || group.type === "Venue")
                viewName = "studios_with_stats";
              if (group.type === "Gig") viewName = "gigs_with_stats";

              const { data: fullRelated } = await supabase
                .from(viewName)
                .select("*")
                .in("id", relatedIds);

              if (fullRelated) setRelatedListings(fullRelated);
            }
          }
        } catch (e) {
          console.log("Error fetching related:", e);
        }
      }
    };
    fetchDetails();
  }, [listingId, group]);

  const renderBackdrop = React.useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    [],
  );

  // Dynamic Labels based on Type
  const getTypeLabels = (type: string) => {
    switch (type) {
      case "Studio":
        return {
          aboutTitle: "About this studio",
          tabs: ["About", "Setup", "Book", "Review"],
          unit: "hour",
        };
      case "Venue":
        return {
          aboutTitle: "About this venue",
          tabs: ["About", "Specs", "Book", "Review"],
          unit: "hour",
        };
      case "Gig":
        return {
          aboutTitle: "About this gig",
          tabs: ["About", "Info", "Apply", "Review"],
          unit: "project",
        };
      case "Artist":
        return {
          aboutTitle: "About this artist",
          tabs: ["About", "Timeline", "Review"],
          unit: "event",
        };
      default: // Group
        return {
          aboutTitle: "About this artist",
          tabs: ["About", "Timeline", "Review"],
          unit: "night",
        };
    }
  };

  const labels = group ? getTypeLabels(group.type) : getTypeLabels("Group");

  // Handle dual pricing for studios
  const rehearsalRate = group?.rehearsal_rate
    ? parseInt(group.rehearsal_rate).toLocaleString()
    : null;
  const recordingRate = group?.recording_rate
    ? parseInt(group.recording_rate).toLocaleString()
    : null;
  const hasDualPricing =
    group?.type === "Studio" &&
    rehearsalRate &&
    recordingRate &&
    rehearsalRate !== "0" &&
    recordingRate !== "0";
  const displayRate = group?.rate
    ? parseInt(group.rate).toLocaleString()
    : rehearsalRate || recordingRate || group?.hourly_rate
      ? parseInt(group?.hourly_rate || "0").toLocaleString()
      : "0";
  const showTabs = labels.tabs.length > 0;

  const renderTabs = () => (
    <View style={[styles.tabsContainer, { borderBottomColor: colors.border }]}>
      {labels.tabs.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[
            styles.tab,
            activeTab === tab && {
              borderBottomColor: colors.primary,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === tab
                ? { color: colors.primary, fontFamily: "Poppins_600SemiBold" }
                : { color: colors.textSecondary },
            ]}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderBookingControls = () => (
    <View
      style={[
        styles.bookingContainer,
        {
          backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 16,
          overflow: "hidden",
          padding: 16,
          marginBottom: 24,
        },
      ]}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.text, fontSize: 16, marginBottom: 0 },
          ]}
        >
          Select Date & Time
        </Text>
        {duration > 0 && (
          <View
            style={[
              styles.durationBadge,
              {
                backgroundColor: isDark
                  ? "rgba(124, 58, 237, 0.15)"
                  : "rgba(124, 58, 237, 0.1)",
              },
            ]}
          >
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Text
              style={{
                fontFamily: "Poppins_600SemiBold",
                color: colors.primary,
                marginLeft: 4,
                fontSize: 12,
              }}
            >
              {`${duration}h Session`}
            </Text>
          </View>
        )}
      </View>

      {/* Show lead time notice if applicable */}
      {group?.settings?.lead_time_hours &&
        group.settings.lead_time_hours > 0 && (
          <View
            style={{
              backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#FEF3C7",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="time" size={16} color="#F59E0B" />
            <Text
              style={{
                color: "#D97706",
                fontSize: 12,
                fontFamily: "Poppins_500Medium",
                flex: 1,
              }}
            >
              Advance booking required: {group.settings.lead_time_hours} hours
              before session
            </Text>
          </View>
        )}

      {/* 1. The Calendar (The Anchor) */}
      <Calendar
        current={new Date().toISOString().split("T")[0]}
        minDate={(() => {
          // Calculate minimum date based on lead_time_hours
          const leadTimeHours = group?.settings?.lead_time_hours || 0;
          const minDate = new Date();
          minDate.setHours(minDate.getHours() + leadTimeHours);
          // If lead time pushes us past today, use that date
          return minDate.toISOString().split("T")[0];
        })()}
        markedDates={{
          ...markedDates,
          [selectedDate]: {
            selected: true,
            selectedColor: colors.primary,
            selectedTextColor: "#FFFFFF",
            customStyles: {
              container: {
                backgroundColor: colors.primary,
                elevation: 2,
              },
              text: {
                fontWeight: "bold",
              },
            },
          },
        }}
        onDayPress={(day) => {
          setSelectedDate(day.dateString);
          setSelectedSlot(null);
          setValidEndTimes([]);
          setEndTime(null as any); // Reset endTime to prevent stale booking state
          fetchAvailableSlots(day.dateString);
          // Update date state
          const selectedDateObj = new Date(day.dateString);
          setDate(selectedDateObj);
        }}
        theme={{
          backgroundColor: "transparent",
          calendarBackground: "transparent",
          textSectionTitleColor: colors.textSecondary,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: "#FFFFFF",
          todayTextColor: colors.primary,
          dayTextColor: colors.text,
          textDisabledColor: isDark ? "#4B5563" : "#D1D5DB",
          dotColor: colors.primary,
          selectedDotColor: "#FFFFFF",
          arrowColor: colors.primary,
          monthTextColor: colors.text,
          indicatorColor: colors.primary,
          textDayFontFamily: "Poppins_500Medium",
          textMonthFontFamily: "Poppins_600SemiBold",
          textDayHeaderFontFamily: "Poppins_500Medium",
          textDayFontSize: 14,
          textMonthFontSize: 16,
          textDayHeaderFontSize: 12,
        }}
        enableSwipeMonths={true}
        style={{
          marginBottom: selectedDate ? 16 : 0,
        }}
      />

      {/* 2. The Slot Grid (The Action) - Reveals on Date Selection */}
      {selectedDate && (
        <View
          style={[
            styles.slotGridContainer,
            {
              borderTopWidth: 1,
              borderTopColor: isDark ? "#374151" : "#F3F4F6",
              paddingTop: 16,
            },
          ]}
        >
          <Text
            style={{
              fontFamily: "Poppins_500Medium",
              color: colors.textSecondary,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            Available Slots for{" "}
            {new Date(selectedDate).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Text>

          {availableSlots.length > 0 ? (
            <View>
              {/* Helper to group slots */}
              {(() => {
                const grouped = {
                  Morning: [] as string[],
                  Afternoon: [] as string[],
                  Evening: [] as string[],
                };
                availableSlots.forEach((slot) => {
                  const hour = parseInt(slot.split(":")[0]);
                  if (hour < 12) grouped.Morning.push(slot);
                  else if (hour < 18) grouped.Afternoon.push(slot);
                  else grouped.Evening.push(slot);
                });

                return (
                  Object.keys(grouped) as Array<keyof typeof grouped>
                ).map((period) => {
                  if (grouped[period].length === 0) return null;
                  return (
                    <View key={period} style={{ marginBottom: 16 }}>
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.textSecondary,
                          fontSize: 12,
                          marginBottom: 8,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {period}
                      </Text>
                      <View style={styles.slotGrid}>
                        {grouped[period].map((slot) => {
                          const isSelected = selectedSlot === slot;
                          // Check if this slot is part of the selected duration range
                          const slotHour = parseInt(slot.split(":")[0]);
                          const startHour = selectedSlot
                            ? parseInt(selectedSlot.split(":")[0])
                            : -1;
                          const endHour = endTime ? endTime.getHours() : -1;
                          const isInRange =
                            selectedSlot &&
                            endTime &&
                            slotHour >= startHour &&
                            slotHour < endHour;

                          return (
                            <TouchableOpacity
                              key={slot}
                              style={[
                                styles.slotButton,
                                {
                                  backgroundColor: isSelected
                                    ? isDark
                                      ? "rgba(124, 58, 237, 0.15)"
                                      : "rgba(124, 58, 237, 0.1)"
                                    : isInRange
                                      ? isDark
                                        ? "rgba(124, 58, 237, 0.05)"
                                        : "rgba(124, 58, 237, 0.05)"
                                      : isDark
                                        ? "#374151"
                                        : "#F3F4F6",
                                  borderColor: isSelected
                                    ? colors.primary
                                    : "transparent",
                                  borderWidth: isSelected ? 2 : 0,
                                },
                              ]}
                              onPress={() => {
                                setSelectedSlot(slot);

                                // 1. Update start date/time
                                const [hours, minutes] = slot.split(":");
                                const startDate = new Date(selectedDate);
                                startDate.setHours(
                                  parseInt(hours),
                                  parseInt(minutes),
                                );
                                setDate(startDate);

                                // 2. Calculate Valid Max Duration
                                const availableHours = new Set(
                                  availableSlots.map((s) =>
                                    parseInt(s.split(":")[0]),
                                  ),
                                );
                                let maxDur = 0;
                                let currentH = parseInt(hours);

                                // Check up to 12 hours ahead
                                for (let i = 0; i < 12; i++) {
                                  // Check if the slot *starts* at this hour is available
                                  // (Except the first one, which we know is available since we clicked it)
                                  if (i > 0 && !availableHours.has(currentH))
                                    break;
                                  maxDur++;
                                  currentH++;
                                  if (currentH >= 24) break;
                                }

                                // Store max available duration for this start time
                                // We can re-use validEndTimes state to store valid DURATIONS (numbers) as strings if we want,
                                // or just calculate valid durations on the fly.
                                // Let's store valid duration HOURS in validEndTimes as strings like "1", "2", "3" to reuse state.
                                const validDurs = [];
                                for (let i = 1; i <= maxDur; i++)
                                  validDurs.push(i.toString());
                                setValidEndTimes(validDurs);

                                // 3. Auto-select 1 hour if available
                                if (maxDur >= 1) {
                                  const endDate = new Date(startDate);
                                  endDate.setHours(startDate.getHours() + 1);
                                  setEndTime(endDate);
                                }
                              }}
                            >
                              <Text
                                style={{
                                  color: isSelected
                                    ? colors.primary
                                    : colors.text,
                                  fontFamily: isSelected
                                    ? "Poppins_600SemiBold"
                                    : "Poppins_500Medium",
                                  fontSize: 13,
                                }}
                              >
                                {formatTime12(slot)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: "Poppins_400Regular",
                  fontSize: 13,
                }}
              >
                No available slots for this date.
              </Text>
            </View>
          )}

          {/* Duration Selection (Chips) */}
          {selectedSlot && validEndTimes.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  fontFamily: "Poppins_500Medium",
                  color: colors.textSecondary,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                Duration
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {validEndTimes.map((durStr) => {
                  const dur = parseInt(durStr);
                  // Calculate if selected - safely check if date and endTime exist
                  let currentDur = 0;
                  if (date && endTime && date.getTime && endTime.getTime) {
                    currentDur =
                      (endTime.getTime() - date.getTime()) / (1000 * 60 * 60);
                  }
                  const isSelected = Math.abs(currentDur - dur) < 0.1;

                  return (
                    <TouchableOpacity
                      key={durStr}
                      style={[
                        {
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 100,
                          backgroundColor: isSelected
                            ? colors.primary
                            : isDark
                              ? "#374151"
                              : "#F3F4F6",
                        },
                      ]}
                      onPress={() => {
                        if (date) {
                          const newEnd = new Date(date);
                          newEnd.setHours(newEnd.getHours() + dur);
                          setEndTime(newEnd);
                        }
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? "#FFFFFF" : colors.text,
                          fontFamily: isSelected
                            ? "Poppins_600SemiBold"
                            : "Poppins_500Medium",
                          fontSize: 13,
                        }}
                      >
                        {`${dur} hr${dur > 1 ? "s" : ""}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderDurationControl = () => null; // Removed in favor of computed duration

  // --- SUB-SECTIONS ---

  const renderGallery = () => {
    if (!group.images || group.images.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Gallery
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.galleryContainer}
        >
          {group.images.map((img: string, i: number) => (
            <Image key={i} source={{ uri: img }} style={styles.galleryImage} />
          ))}
        </ScrollView>
      </View>
    );
  };

  // Responsive Review Card Width
  const CARD_WIDTH = width * 0.85;

  const renderReviews = () => (
    <View style={[styles.tabContent, { paddingHorizontal: 0 }]}>
      <View style={[styles.reviewHeader, { paddingHorizontal: 24 }]}>
        <Text style={[styles.ratingBig, { color: colors.text }]}>
          {group.rating ? group.rating.toFixed(1) : "0.0"}
        </Text>
        <View>
          <View style={{ flexDirection: "row" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons
                key={i}
                name={
                  i <= Math.round(group.rating || 0) ? "star" : "star-outline"
                }
                size={14}
                color={colors.primary}
              />
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {group.review_count || 0} reviews
          </Text>
        </View>
      </View>

      <View style={[styles.reviewsScroll, { paddingHorizontal: 24 }]}>
        {reviews.length > 0 ? (
          reviews.map((review) => (
            <View
              key={review.id}
              style={[
                styles.reviewCard,
                { borderColor: colors.border, width: "100%" },
              ]}
            >
              <View style={styles.reviewUser}>
                <Image
                  source={{
                    uri:
                      review.author?.avatar_url ||
                      "https://via.placeholder.com/100",
                  }}
                  style={styles.reviewAvatar}
                />
                <View>
                  <Text style={[styles.reviewName, { color: colors.text }]}>
                    {review.author?.full_name || "Anonymous"}
                  </Text>
                  <Text
                    style={[styles.reviewDate, { color: colors.textSecondary }]}
                  >
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <Text style={[styles.reviewBody, { color: colors.text }]}>
                {review.content}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>
            No reviews yet.
          </Text>
        )}
      </View>

      {/* Related Listings Section (AI Recommendations) */}
      {relatedListings.length > 0 && (
        <View style={[styles.section, { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            You Might Also Like
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingLeft: 24,
              paddingRight: 8,
              gap: 12,
            }}
          >
            {relatedListings.map((item) => {
              // Normalize item for ListingCard
              const normalizedItem = {
                ...item,
                type: group.type, // Assume same type for now or use item.type if available from view
                image: item.images?.[0] || "https://via.placeholder.com/300",
                rate:
                  item.hourly_rate?.toString() ||
                  item.budget?.toString() ||
                  item.rate ||
                  "0",
                location: item.location || item.address || "",
              };

              // We need to import ListingCard or render a mini version
              // Since ListingCard might not be imported, let's render a mini card inline/simple for now to avoid circular deps or complex imports if not already there.
              // Actually, let's reuse the logic but render simple.
              return (
                <TouchableOpacity
                  key={item.id}
                  style={{ width: 160, marginRight: 0 }}
                  onPress={() => {
                    // Close current and open new? Or just push new?
                    // Ideally we just update the listingId prop if possible, but that's controlled by parent.
                    // For now, let's just log or try to navigate if we had navigation.
                    console.log("Open related:", item.id);
                    // In a real app we'd call a prop onListingPress(item.id)
                  }}
                >
                  <Image
                    source={{ uri: normalizedItem.image }}
                    style={{
                      width: 160,
                      height: 100,
                      borderRadius: 8,
                      backgroundColor: colors.border,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.text,
                      marginTop: 8,
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Poppins_400Regular",
                      color: colors.textSecondary,
                      fontSize: 11,
                    }}
                  >
                    {normalizedItem.location}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <Ionicons name="star" size={12} color={colors.primary} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.text,
                        marginLeft: 4,
                        fontFamily: "Poppins_500Medium",
                      }}
                    >
                      {item.rating ? item.rating.toFixed(1) : "New"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // Studio: Setup Tab (also used for Venue Specs)
  const renderStudioSetup = () => {
    const amenities = group.amenities || [];
    const studioEquipment = group.instruments || []; // New equipment field with full details
    const legacyEquipment: string[] = [];

    // Categorize amenities as equipment (legacy support)
    if (amenities.length > 0 && studioEquipment.length === 0) {
      amenities.forEach((item: string) => {
        const lower = item.toLowerCase();
        if (
          lower.includes("mic") ||
          lower.includes("drum") ||
          lower.includes("guitar") ||
          lower.includes("bass") ||
          lower.includes("keyboard") ||
          lower.includes("amp") ||
          lower.includes("console") ||
          lower.includes("interface")
        ) {
          legacyEquipment.push(item);
        }
      });
    }

    const title = group.type === "Venue" ? "Venue Specs" : "Studio Amenities";

    return (
      <View style={styles.tabContent}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {title}
          </Text>
          <View style={styles.tagsContainer}>
            {amenities.length > 0 ? (
              amenities.map((tag: string, index: number) => (
                <View
                  key={`${tag}-${index}`}
                  style={[
                    styles.tag,
                    {
                      borderColor: colors.primary,
                      backgroundColor: isDark
                        ? "rgba(124, 58, 237, 0.1)"
                        : "rgba(124, 58, 237, 0.05)",
                    },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={colors.primary}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontFamily: "Poppins_500Medium",
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))
            ) : (
              <Text
                style={{ color: colors.textSecondary, fontStyle: "italic" }}
              >
                No specs listed for this{" "}
                {group.type === "Venue" ? "venue" : "studio"}.
              </Text>
            )}
          </View>
        </View>

        {/* New Equipment Section with full details */}
        {studioEquipment.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Studio Equipment
            </Text>
            <View style={{ gap: 16 }}>
              {studioEquipment.map(
                (
                  item: {
                    name: string;
                    quantity?: number;
                    description?: string;
                    image?: string;
                  },
                  i: number,
                ) => (
                  <View
                    key={i}
                    style={[
                      styles.equipmentCard,
                      {
                        backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      {item.image ? (
                        <Image
                          source={{ uri: item.image }}
                          style={styles.equipmentImage}
                        />
                      ) : (
                        <View
                          style={[
                            styles.equipmentIcon,
                            {
                              backgroundColor: isDark
                                ? "rgba(124, 58, 237, 0.15)"
                                : "rgba(124, 58, 237, 0.1)",
                            },
                          ]}
                        >
                          <Ionicons
                            name="musical-notes"
                            size={18}
                            color={colors.primary}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontFamily: "Poppins_600SemiBold",
                            fontSize: 14,
                          }}
                        >
                          {item.name}
                        </Text>
                        {item.quantity && item.quantity > 1 && (
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontFamily: "Poppins_400Regular",
                              fontSize: 12,
                            }}
                          >
                            Quantity: {item.quantity}
                          </Text>
                        )}
                      </View>
                    </View>
                    {item.description && (
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontFamily: "Poppins_400Regular",
                          fontSize: 13,
                          marginTop: 8,
                        }}
                      >
                        {item.description}
                      </Text>
                    )}
                  </View>
                ),
              )}
            </View>
          </View>
        )}

        {/* Legacy Equipment Support */}
        {legacyEquipment.length > 0 && studioEquipment.length === 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Available Equipment
            </Text>
            <View style={{ gap: 12 }}>
              {legacyEquipment.map((item: string, i: number) => (
                <View key={i} style={styles.checkRow}>
                  <View
                    style={[
                      styles.equipmentIcon,
                      {
                        backgroundColor: isDark
                          ? "rgba(124, 58, 237, 0.15)"
                          : "rgba(124, 58, 237, 0.1)",
                      },
                    ]}
                  >
                    <Ionicons
                      name="musical-notes"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <Text
                    style={{
                      color: colors.text,
                      marginLeft: 12,
                      fontFamily: "Poppins_400Regular",
                    }}
                  >
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {group.description && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              About the Space
            </Text>
            <Text
              style={{
                color: colors.text,
                lineHeight: 24,
                fontFamily: "Poppins_400Regular",
              }}
            >
              {group.description}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Studio: Book Tab
  const renderStudioBook = () => {
    const availability = group.availability || [];
    const totalBookingsCost = bookings.reduce((sum, booking) => {
      // Use calculated pricing if available, otherwise fallback to simple calculation
      if (booking.pricing?.final_price) {
        return sum + booking.pricing.final_price;
      }
      const start = new Date(booking.startTime).getTime();
      const end = new Date(booking.endTime).getTime();
      let hours = (end - start) / (1000 * 60 * 60);
      if (hours < 0) hours += 24;
      return sum + parseInt(displayRate.replace(/,/g, "")) * hours;
    }, 0);

    return (
      <View style={styles.tabContent}>
        {/* Unpaid Booking Warning - blocks new bookings until paid */}
        {hasExistingStudioBooking &&
          existingStudioBookingStatus === "unpaid" && (
            <View
              style={{
                backgroundColor: isDark ? "#1F2937" : "#FFF7ED", // Very subtle orange tint in light mode
                borderLeftWidth: 4,
                borderLeftColor: "#F59700",
                borderRadius: 8, // Slightly sharper corners for "card" feel
                marginBottom: 20,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                // elevate slightly
                shadowColor: "#000",
                shadowOffset: {
                  width: 0,
                  height: 1,
                },
                shadowOpacity: 0.05,
                shadowRadius: 2,
                elevation: 2,
              }}
            >
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Ionicons
                    name="alert-circle"
                    size={16}
                    color="#F59700"
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      fontFamily: "Poppins_600SemiBold",
                      fontSize: 14,
                      color: isDark ? "#F59700" : "#D97706",
                    }}
                  >
                    Payment Pending
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: "Poppins_400Regular",
                    fontSize: 12,
                    color: colors.textSecondary,
                    lineHeight: 18,
                  }}
                >
                  Complete payment for your existing booking to unlock new
                  sessions.
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: "#F59700",
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 100, // Pill shape
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  shadowColor: "#F59700",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 3,
                  elevation: 3,
                }}
                onPress={() => {
                  (ref as any)?.current?.dismiss();
                  router.push("/bookings" as any);
                }}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontFamily: "Poppins_600SemiBold",
                    fontSize: 12,
                  }}
                >
                  Pay Now
                </Text>
                <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

        {/* Bookings List */}
        {bookings.length > 0 && (
          <View style={[styles.section, { marginBottom: 16 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Your Bookings ({bookings.length})
            </Text>
            {bookings.map((booking, index) => {
              const start = new Date(booking.startTime).getTime();
              const end = new Date(booking.endTime).getTime();
              let hours = (end - start) / (1000 * 60 * 60);
              if (hours < 0) hours += 24;

              // Use calculated pricing or fallback
              const cost =
                booking.pricing?.final_price ||
                parseInt(displayRate.replace(/,/g, "")) * hours;
              const hasModifiers =
                booking.pricing?.modifiers &&
                Object.keys(booking.pricing.modifiers).length > 0;
              const slots = booking.timeSlots || [
                {
                  start: booking.startTime.toTimeString().slice(0, 5),
                  end: booking.endTime.toTimeString().slice(0, 5),
                },
              ];
              const isMultiSlot = slots.length > 1;

              return (
                <View
                  key={index}
                  style={[
                    styles.bookingCard,
                    {
                      backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      borderColor: colors.border,
                      marginBottom: 8,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <Ionicons
                        name="calendar"
                        size={14}
                        color={colors.primary}
                      />
                      <Text
                        style={{
                          color: colors.text,
                          fontFamily: "Poppins_600SemiBold",
                          marginLeft: 6,
                          fontSize: 13,
                        }}
                      >
                        {booking.date.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                      {isMultiSlot && (
                        <View
                          style={{
                            marginLeft: 8,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: "#10B98120",
                            borderRadius: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: "#10B981",
                              fontSize: 10,
                              fontFamily: "Poppins_600SemiBold",
                            }}
                          >
                            {slots.length} slots
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* Show all time slots */}
                    {slots.map((slot, slotIndex) => (
                      <View
                        key={slotIndex}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: slotIndex < slots.length - 1 ? 2 : 0,
                        }}
                      >
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color={colors.textSecondary}
                        />
                        <Text
                          style={{
                            color: colors.textSecondary,
                            marginLeft: 6,
                            fontSize: 12,
                          }}
                        >
                          {slot.start} - {slot.end}
                        </Text>
                      </View>
                    ))}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.primary,
                          fontFamily: "Poppins_600SemiBold",
                        }}
                      >
                        ₱{cost.toLocaleString()}
                      </Text>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 11,
                          marginLeft: 8,
                        }}
                      >
                        (
                        {booking.pricing?.hours?.toFixed(1) || hours.toFixed(1)}
                        h total)
                      </Text>
                      {hasModifiers && (
                        <View
                          style={{
                            marginLeft: 8,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: colors.primary + "20",
                            borderRadius: 4,
                          }}
                        >
                          <Text style={{ color: colors.primary, fontSize: 10 }}>
                            Promo Applied
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const newBookings = [...bookings];
                      newBookings.splice(index, 1);
                      setBookings(newBookings);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Add Booking Section - Hidden if user has unpaid booking */}
        {!(
          hasExistingStudioBooking && existingStudioBookingStatus === "unpaid"
        ) &&
        (showAddBooking || bookings.length === 0) ? (
          <>
            {renderBookingControls()}

            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                {
                  borderColor:
                    !selectedSlot || !endTime ? colors.border : colors.primary,
                  backgroundColor: "transparent",
                  marginBottom: 16,
                  opacity:
                    !selectedSlot || !endTime || isCheckingAvailability
                      ? 0.5
                      : 1,
                },
              ]}
              disabled={!selectedSlot || !endTime || isCheckingAvailability}
              activeOpacity={0.8}
              onPress={async () => {
                if (date && endTime) {
                  setIsCheckingAvailability(true);
                  try {
                    const bookingDate = date.toISOString().split("T")[0];
                    const startTime = date.toTimeString().slice(0, 5);
                    const endTime2 = endTime.toTimeString().slice(0, 5);

                    // Build time slots array - current slot + any previously selected slots for same day
                    const currentSlot = { start: startTime, end: endTime2 };
                    const allSlots = [...selectedTimeSlots, currentSlot];

                    // Check if we already have a booking for this date (merge slots)
                    const existingBookingIndex = bookings.findIndex(
                      (b) => b.date.toISOString().split("T")[0] === bookingDate,
                    );

                    // Check availability for the new slot
                    const { data: isAvailable, error: availError } =
                      await supabase.rpc("is_slot_available", {
                        p_studio_id: group.id,
                        p_booking_date: bookingDate,
                        p_start_time: startTime,
                        p_end_time: endTime2,
                        p_user_id: userId,
                      });

                    if (availError) {
                      console.error("Availability check error:", availError);
                      alert("Failed to check availability. Please try again.");
                      setIsCheckingAvailability(false);
                      return;
                    }

                    if (!isAvailable) {
                      alert(
                        "This time slot is not available. Please choose a different time.",
                      );
                      setIsCheckingAvailability(false);
                      return;
                    }

                    // Calculate accurate pricing for all slots
                    const { data: pricing, error: pricingError } =
                      await supabase.rpc("calculate_booking_price", {
                        p_studio_id: group.id,
                        p_booking_date: bookingDate,
                        p_start_time: startTime,
                        p_end_time: endTime2,
                      });

                    if (pricingError || !pricing || pricing.length === 0) {
                      console.error("Pricing error:", pricingError);
                      alert("Failed to calculate price. Please try again.");
                      setIsCheckingAvailability(false);
                      return;
                    }

                    if (existingBookingIndex >= 0) {
                      // Merge with existing booking for this date
                      const existingBooking = bookings[existingBookingIndex];
                      const mergedSlots = [
                        ...(existingBooking.timeSlots || [
                          {
                            start: existingBooking.startTime
                              .toTimeString()
                              .slice(0, 5),
                            end: existingBooking.endTime
                              .toTimeString()
                              .slice(0, 5),
                          },
                        ]),
                        currentSlot,
                      ];

                      // Sort slots by start time
                      mergedSlots.sort((a, b) =>
                        a.start.localeCompare(b.start),
                      );

                      // Calculate total pricing for all merged slots
                      const existingPrice =
                        existingBooking.pricing?.final_price || 0;
                      const newPrice = pricing[0]?.final_price || 0;
                      const totalHours =
                        (existingBooking.pricing?.hours || 0) +
                        (pricing[0]?.hours || 0);

                      const updatedBookings = [...bookings];
                      updatedBookings[existingBookingIndex] = {
                        ...existingBooking,
                        timeSlots: mergedSlots,
                        pricing: {
                          ...pricing[0],
                          final_price: existingPrice + newPrice,
                          hours: totalHours,
                        },
                      };
                      setBookings(updatedBookings);
                      alert(
                        `Added time slot to your booking for ${new Date(bookingDate).toLocaleDateString()}. You now have ${mergedSlots.length} slot(s) for this day.`,
                      );
                    } else {
                      // Add as new booking with single slot
                      setBookings([
                        ...bookings,
                        {
                          date: new Date(date),
                          startTime: new Date(date),
                          endTime: new Date(endTime),
                          timeSlots: [currentSlot],
                          pricing: pricing[0],
                        },
                      ]);
                    }

                    setShowAddBooking(false);
                    setSelectedTimeSlots([]);
                    // Reset form
                    setDate(null as any);
                    setEndTime(null as any);
                    setSelectedSlot(null);
                  } catch (e: any) {
                    console.error("Error adding booking:", e);
                    alert("An error occurred. Please try again.");
                  } finally {
                    setIsCheckingAvailability(false);
                  }
                }
              }}
            >
              {isCheckingAvailability ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.secondaryBtnText,
                      { color: colors.primary, marginLeft: 8 },
                    ]}
                  >
                    {bookings.length > 0 ? "Add Session" : "Add Booking"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : !(
            hasExistingStudioBooking && existingStudioBookingStatus === "unpaid"
          ) ? (
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              {
                borderColor: colors.primary,
                backgroundColor: "transparent",
                marginBottom: 16,
              },
            ]}
            onPress={() => setShowAddBooking(true)}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={colors.primary}
            />
            <Text
              style={[
                styles.secondaryBtnText,
                { color: colors.primary, marginLeft: 8 },
              ]}
            >
              Add Another Session
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Notes */}
        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Notes (Optional)
          </Text>
          <View
            style={[
              styles.inputWrapper,
              { backgroundColor: isDark ? "#374151" : "#F9FAFB", height: 80 },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text, height: "100%" }]}
              placeholder="Tell us about your sessions..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              value={bookingNotes}
              onChangeText={setBookingNotes}
            />
          </View>
        </View>

        {/* Payment Summary */}
        {bookings.length > 0 &&
          !(
            hasExistingStudioBooking && existingStudioBookingStatus === "unpaid"
          ) && (
            <View
              style={[
                styles.paymentSummary,
                { backgroundColor: isDark ? "#1F2937" : "#F9FAFB" },
              ]}
            >
              <View style={styles.summaryRow}>
                <Text style={{ color: colors.textSecondary }}>Rate</Text>
                <Text
                  style={{ color: colors.text }}
                >{`₱${displayRate} / hr`}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={{ color: colors.textSecondary }}>
                  Total Sessions
                </Text>
                <Text style={{ color: colors.text }}>
                  {String(bookings.length)}
                </Text>
              </View>
              <View style={[styles.divider, { marginVertical: 12 }]} />
              <View style={styles.summaryRow}>
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  Total
                </Text>
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: "Poppins_600SemiBold",
                    fontSize: 18,
                  }}
                >
                  ₱{totalBookingsCost.toLocaleString()}
                </Text>
              </View>
            </View>
          )}

        {!(
          hasExistingStudioBooking && existingStudioBookingStatus === "unpaid"
        ) && (
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor:
                  bookings.length > 0 ? colors.primary : colors.border,
                opacity: loading ? 0.6 : 1,
              },
            ]}
            disabled={bookings.length === 0 || loading}
            activeOpacity={0.8}
            onPress={() =>
              bookings.length > 0 &&
              handleConfirm(
                async () => {
                  // Double check profile just in case, though handleConfirm handles it
                  if (!userId) {
                    alert("Please sign in to book a studio");
                    return;
                  }

                  try {
                    setLoading(true);
                    const results = [];
                    const errors = [];

                    console.log(
                      "🛒 Total bookings to create:",
                      bookings.length,
                    );
                    console.log("📋 Bookings array:", bookings);

                    // Create each booking (now supports multi-slot per booking)
                    for (const booking of bookings) {
                      const bookingDate = booking.date
                        .toISOString()
                        .split("T")[0];

                      // Use time_slots if available (multi-slot booking), otherwise fallback to single slot
                      const timeSlots =
                        booking.timeSlots && booking.timeSlots.length > 0
                          ? booking.timeSlots
                          : [
                              {
                                start: booking.startTime
                                  .toTimeString()
                                  .slice(0, 5),
                                end: booking.endTime.toTimeString().slice(0, 5),
                              },
                            ];

                      console.log("📤 Creating multi-slot booking:", {
                        studio_id: group.id,
                        user_id: userId,
                        date: bookingDate,
                        time_slots: timeSlots,
                        notes: bookingNotes,
                      });

                      const { data, error } = await supabase.functions.invoke(
                        "manage-bookings",
                        {
                          body: {
                            action: "create",
                            studio_id: group.id,
                            user_id: userId,
                            date: bookingDate,
                            time_slots: timeSlots, // Send multi-slot array
                            notes: bookingNotes,
                          },
                        },
                      );

                      console.log("📥 Booking response:", { data, error });

                      if (error) {
                        // Try to extract actual error message
                        let errorMessage = error.message || "Unknown error";
                        let serverError: any = null;

                        // Check if error has context with response body
                        if (
                          error.context &&
                          typeof error.context === "object"
                        ) {
                          try {
                            // Try to read response body
                            const response = error.context;
                            console.log(
                              "📥 Error response status:",
                              response.status,
                            );
                            console.log("📥 Error response (raw):", response);

                            // If it's a Response object, try to parse body
                            if (
                              response.json &&
                              typeof response.json === "function"
                            ) {
                              serverError = await response.json();
                              console.log(
                                "📥 Parsed server error:",
                                serverError,
                              );
                              if (serverError?.error) {
                                errorMessage = serverError.error;
                              }
                              if (serverError?.debug) {
                                console.log(
                                  "📥 Debug info:",
                                  serverError.debug,
                                );
                              }
                            } else if (
                              response.text &&
                              typeof response.text === "function"
                            ) {
                              const textBody = await response.text();
                              console.log("📥 Error body (text):", textBody);
                              try {
                                serverError = JSON.parse(textBody);
                                if (serverError?.error) {
                                  errorMessage = serverError.error;
                                }
                              } catch (e) {
                                console.log("📥 Could not parse as JSON");
                              }
                            }
                          } catch (e) {
                            console.error("Failed to parse error response:", e);
                          }
                        }

                        errors.push({
                          booking,
                          error: { message: errorMessage, serverError },
                        });
                        console.error("❌ Booking error:", errorMessage);
                        if (serverError) {
                          console.error(
                            "❌ Full server error:",
                            JSON.stringify(serverError, null, 2),
                          );
                        }
                      } else {
                        results.push(data);
                        console.log("✅ Booking created successfully");
                      }
                    }

                    setLoading(false);

                    if (errors.length > 0 && results.length === 0) {
                      // All failed
                      const errorMsg =
                        errors[0].error?.message || "Failed to create bookings";
                      alert(`Error: ${errorMsg}`);
                    } else if (errors.length > 0) {
                      // Partial success
                      alert(
                        `${results.length} booking(s) created successfully, but ${errors.length} failed. Please check the Bookings page.`,
                      );
                      // Clear form and close
                      setBookings([]);
                      setSelectedTimeSlots([]);
                      setBookingNotes("");
                      setModalVisible(false);
                      (ref as any)?.current?.dismiss();
                    } else {
                      // All success - AI LEARNING: Strong signal from booking
                      if (group && group.embedding && userId) {
                        try {
                          await supabase.rpc("update_user_interest", {
                            p_user_id: userId,
                            p_item_vector: group.embedding,
                            p_weight: 0.5, // Strongest learning signal for booking
                          });
                          console.log(
                            "🤖 AI learned from studio booking:",
                            group.name,
                          );
                        } catch (e) {
                          console.log(
                            "Error updating AI interest from booking:",
                            e,
                          );
                        }
                      }

                      // All success - show payment option modal before PayMongo
                      console.log(
                        "✅ All bookings created, showing payment options...",
                      );

                      // For now, we process payment for the first booking
                      const firstBooking = results[0];

                      if (firstBooking?.requires_payment && firstBooking?.id) {
                        // Store booking data and show payment option modal
                        setPaymentBookingData({
                          booking: firstBooking,
                          studioName: group.name,
                          totalAmount:
                            firstBooking.payment_amount ||
                            firstBooking.final_price,
                        });
                        setSelectedPaymentType("full"); // Reset to full payment
                        setShowPaymentOptionModal(true);
                      } else {
                        alert(
                          `Successfully created ${results.length} booking(s)! Please complete payment to confirm.`,
                        );
                        // Clear form and close
                        setBookings([]);
                        setSelectedTimeSlots([]);
                        setBookingNotes("");
                        setModalVisible(false);
                        (ref as any)?.current?.dismiss();

                        // Navigate to bookings page
                        setTimeout(() => {
                          router.push("/bookings" as any);
                        }, 100);
                      }
                    }
                  } catch (e: any) {
                    setLoading(false);
                    console.error("Booking creation error:", e);
                    alert("An unexpected error occurred. Please try again.");
                  }
                },
                "Confirm Session Booking",
                `Book ${bookings.length} session(s) at ${group.name}\nTotal: ₱${totalBookingsCost.toLocaleString()}\n\nThe studio owner will review and approve your booking request.`,
              )
            }
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.primaryBtnText,
                  {
                    color:
                      bookings.length > 0 ? "#FFFFFF" : colors.textSecondary,
                  },
                ]}
              >
                {bookings.length > 0
                  ? `Book ${bookings.length} Session${bookings.length > 1 ? "s" : ""}`
                  : "Add at least one session"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Gig: Info Tab
  const renderGigInfo = () => {
    // Extract requirements data
    const requirements = group.requirements || {};
    const capacity = requirements.capacity || "Not specified";
    const audioSetup =
      requirements.audio || requirements.sound_system || "Standard PA";

    // Get tech specs from requirements or amenities
    const techSpecs = [];
    if (requirements.lighting)
      techSpecs.push(`Lighting: ${requirements.lighting}`);
    if (requirements.stage_size)
      techSpecs.push(`Stage Size: ${requirements.stage_size}`);
    if (requirements.backline)
      techSpecs.push(`Backline: ${requirements.backline}`);
    if (requirements.sound_check) techSpecs.push("Sound Check Available");
    if (requirements.green_room) techSpecs.push("Green Room Available");

    // If no specific requirements, use amenities or generic items
    if (techSpecs.length === 0 && group.amenities?.length > 0) {
      group.amenities.forEach((amenity: string) => techSpecs.push(amenity));
    }

    return (
      <View style={styles.tabContent}>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
            ]}
          >
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              Capacity
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {capacity}
            </Text>
          </View>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
            ]}
          >
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              Audio
            </Text>
            <Text
              style={[styles.infoValue, { color: colors.text, fontSize: 13 }]}
              numberOfLines={2}
            >
              {audioSetup}
            </Text>
          </View>
        </View>

        {requirements.experience_level && (
          <View style={[styles.section, { marginTop: 16 }]}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Ionicons
                name="ribbon-outline"
                size={20}
                color={colors.primary}
              />
              <Text
                style={{
                  fontFamily: "Poppins_600SemiBold",
                  color: colors.text,
                  fontSize: 14,
                }}
              >
                Experience Level:{" "}
                <Text style={{ color: colors.primary }}>
                  {requirements.experience_level}
                </Text>
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Event Details
          </Text>
          {group.event_date && (
            <View style={styles.checkRow}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, marginLeft: 12 }}>
                {new Date(group.event_date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </View>
          )}
          {group.location && (
            <View style={styles.checkRow}>
              <Ionicons name="location" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, marginLeft: 12 }}>
                {group.location}
              </Text>
            </View>
          )}
        </View>

        {techSpecs.length > 0 && (
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Tech Specs & Amenities
            </Text>
            {techSpecs.map((spec: string, i: number) => (
              <View key={i} style={styles.checkRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary}
                />
                <Text style={{ color: colors.text, marginLeft: 12 }}>
                  {spec}
                </Text>
              </View>
            ))}
          </View>
        )}

        {techSpecs.length === 0 && !group.event_date && (
          <View style={{ marginTop: 24 }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              No additional specifications provided.
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Gig: Apply Tab
  const renderGigApply = () => {
    console.log("🎨 renderGigApply called");
    console.log("Current state:", {
      pitchMessage,
      videoUrl,
      isSubmittingApplication,
      userId,
      listingId,
    });

    // Calculate application deadline (24hrs before event)
    const getApplicationDeadline = () => {
      if (!group.event_date) return null;
      const eventDate = new Date(group.event_date);
      const eventStartTime = group.requirements?.event_start_time;
      if (eventStartTime) {
        const [time, period] = eventStartTime.split(" ");
        const [hours, minutes] = time.split(":").map(Number);
        let hour24 = hours;
        if (period === "PM" && hours !== 12) hour24 += 12;
        if (period === "AM" && hours === 12) hour24 = 0;
        eventDate.setHours(hour24, minutes, 0, 0);
      }
      const deadline = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
      return deadline;
    };

    const deadline = getApplicationDeadline();
    const now = new Date();
    const isDeadlinePassed = deadline && now >= deadline;
    const hoursUntilDeadline = deadline
      ? Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60))
      : null;

    return (
      <View style={styles.tabContent}>
        {/* Application Deadline Notice */}
        {deadline && (
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: isDeadlinePassed
                  ? "#EF444420"
                  : hoursUntilDeadline && hoursUntilDeadline < 48
                    ? "#F59E0B20"
                    : "#10B98120",
                borderColor: isDeadlinePassed
                  ? "#EF4444"
                  : hoursUntilDeadline && hoursUntilDeadline < 48
                    ? "#F59E0B"
                    : "#10B981",
                marginBottom: 16,
              },
            ]}
          >
            <Ionicons
              name={isDeadlinePassed ? "close-circle" : "time"}
              size={20}
              color={
                isDeadlinePassed
                  ? "#EF4444"
                  : hoursUntilDeadline && hoursUntilDeadline < 48
                    ? "#F59E0B"
                    : "#10B981"
              }
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.infoText,
                  { color: colors.text, fontFamily: "Poppins_600SemiBold" },
                ]}
              >
                {isDeadlinePassed
                  ? "Application Deadline Passed"
                  : "Application Deadline"}
              </Text>
              <Text style={[styles.infoText, { color: colors.text }]}>
                {isDeadlinePassed
                  ? "This gig is no longer accepting applications."
                  : `Apply by ${deadline.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${deadline.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`}
              </Text>
              {!isDeadlinePassed &&
                hoursUntilDeadline &&
                hoursUntilDeadline < 48 && (
                  <Text
                    style={[
                      styles.infoText,
                      {
                        color: "#F59E0B",
                        fontFamily: "Poppins_600SemiBold",
                        marginTop: 4,
                      },
                    ]}
                  >
                    ⏰ Only {Math.floor(hoursUntilDeadline)} hours left!
                  </Text>
                )}
            </View>
          </View>
        )}

        {/* SPAM BLOCK WARNING */}
        {isBlocked && (
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: "#EF444420",
                borderColor: "#EF4444",
                marginBottom: 32,
              },
            ]}
          >
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.infoText,
                  { color: colors.text, fontFamily: "Poppins_600SemiBold" },
                ]}
              >
                Action Restricted
              </Text>
              <Text style={[styles.infoText, { color: colors.text }]}>
                {blockReason ||
                  "You are temporarily blocked from applying to this organizer."}
              </Text>
            </View>
          </View>
        )}

        {/* Group Selection (if user has groups) - Conditional based on musician_type */}
        {(() => {
          const musicianTypeRequired =
            group.requirements?.musician_type || "both";
          const canApplyAsSolo =
            musicianTypeRequired === "solo" || musicianTypeRequired === "both";
          const canApplyAsGroup =
            musicianTypeRequired === "group" || musicianTypeRequired === "both";
          const hasGroups = userGroups.length > 0;

          // Show restriction message if user can't apply
          if (!canApplyAsSolo && !hasGroups) {
            return (
              <View
                style={[
                  styles.infoBox,
                  {
                    backgroundColor: "#F59E0B20",
                    borderColor: "#F59E0B",
                    marginBottom: 16,
                  },
                ]}
              >
                <Ionicons name="information-circle" size={20} color="#F59E0B" />
                <Text style={[styles.infoText, { color: colors.text }]}>
                  This gig is looking for{" "}
                  <Text style={{ fontFamily: "Poppins_600SemiBold" }}>
                    bands/groups only
                  </Text>
                  . Create a group first to apply.
                </Text>
              </View>
            );
          }

          // Don't show selection if only one valid option and no groups
          if (canApplyAsSolo && !canApplyAsGroup && !hasGroups) {
            return null; // Will apply as individual by default
          }

          // Show type indicator if restricted
          if (musicianTypeRequired !== "both" && !hasExistingApplication) {
            return (
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Apply as
                </Text>
                {musicianTypeRequired === "solo" && (
                  <View
                    style={[
                      styles.infoBox,
                      {
                        backgroundColor: colors.primary + "20",
                        borderColor: colors.primary,
                        marginBottom: 8,
                      },
                    ]}
                  >
                    <Ionicons name="person" size={16} color={colors.primary} />
                    <Text style={[styles.infoText, { color: colors.text }]}>
                      This gig is for{" "}
                      <Text style={{ fontFamily: "Poppins_600SemiBold" }}>
                        solo artists only
                      </Text>
                    </Text>
                  </View>
                )}
                {musicianTypeRequired === "group" && hasGroups && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 8 }}
                  >
                    {userGroups.map((g) => (
                      <TouchableOpacity
                        key={g.id}
                        style={[
                          styles.groupSelectChip,
                          {
                            backgroundColor:
                              selectedGroupId === g.id
                                ? colors.primary
                                : isDark
                                  ? "#374151"
                                  : "#F3F4F6",
                            borderColor:
                              selectedGroupId === g.id
                                ? colors.primary
                                : colors.border,
                            marginRight: 8,
                          },
                        ]}
                        onPress={() => setSelectedGroupId(g.id)}
                      >
                        <Ionicons
                          name="people"
                          size={16}
                          color={
                            selectedGroupId === g.id ? "#FFF" : colors.text
                          }
                        />
                        <Text
                          style={{
                            color:
                              selectedGroupId === g.id ? "#FFF" : colors.text,
                            marginLeft: 8,
                            fontFamily: "Poppins_500Medium",
                          }}
                        >
                          {g.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            );
          }

          // Show full selection (both options available)
          if (hasGroups && !hasExistingApplication) {
            return (
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Apply as
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 8 }}
                >
                  <TouchableOpacity
                    style={[
                      styles.groupSelectChip,
                      {
                        backgroundColor:
                          selectedGroupId === null
                            ? colors.primary
                            : isDark
                              ? "#374151"
                              : "#F3F4F6",
                        borderColor:
                          selectedGroupId === null
                            ? colors.primary
                            : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedGroupId(null)}
                  >
                    <Ionicons
                      name="person"
                      size={16}
                      color={selectedGroupId === null ? "#FFF" : colors.text}
                    />
                    <Text
                      style={{
                        color: selectedGroupId === null ? "#FFF" : colors.text,
                        marginLeft: 8,
                        fontFamily: "Poppins_500Medium",
                      }}
                    >
                      Individual
                    </Text>
                  </TouchableOpacity>
                  {userGroups.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.groupSelectChip,
                        {
                          backgroundColor:
                            selectedGroupId === g.id
                              ? colors.primary
                              : isDark
                                ? "#374151"
                                : "#F3F4F6",
                          borderColor:
                            selectedGroupId === g.id
                              ? colors.primary
                              : colors.border,
                          marginLeft: 8,
                        },
                      ]}
                      onPress={() => setSelectedGroupId(g.id)}
                    >
                      <Ionicons
                        name="people"
                        size={16}
                        color={selectedGroupId === g.id ? "#FFF" : colors.text}
                      />
                      <Text
                        style={{
                          color:
                            selectedGroupId === g.id ? "#FFF" : colors.text,
                          marginLeft: 8,
                          fontFamily: "Poppins_500Medium",
                        }}
                      >
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          }

          return null;
        })()}

        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Pitch Message
          </Text>
          <View
            style={[
              styles.inputWrapper,
              { backgroundColor: isDark ? "#374151" : "#F9FAFB", height: 100 },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text, height: "100%" }]}
              placeholder="Why are you a good fit for this gig?"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              value={pitchMessage}
              onChangeText={(text) => {
                console.log("📝 Pitch message changed to:", text);
                setPitchMessage(text);
              }}
            />
          </View>
        </View>

        <DocumentUploader
          label="Upload CV/Resume"
          onFileSelect={(file) => setCvFile(file)}
          existingUrl={cvUrl || undefined}
        />

        <VideoUploader
          videoUrl={videoUrl}
          onVideoChange={(url) => setVideoUrl(url || "")}
          userId={userId || ""}
          bucketName="documents"
          folder="performance-videos"
          maxSizeMB={50}
        />

        {group?.contract_url ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(group.contract_url)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 24,
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="document-text-outline"
              size={18}
              color={colors.primary}
            />
            <Text
              style={{
                color: colors.primary,
                marginLeft: 8,
                textDecorationLine: "underline",
                fontFamily: "Poppins_500Medium",
              }}
            >
              Review Terms & Conditions
            </Text>
            <Ionicons
              name="open-outline"
              size={14}
              color={colors.primary}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
        ) : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 24,
              opacity: 0.5,
            }}
          >
            <Ionicons
              name="document-text-outline"
              size={18}
              color={colors.textSecondary}
            />
            <Text
              style={{
                color: colors.textSecondary,
                marginLeft: 8,
                fontFamily: "Poppins_400Regular",
              }}
            >
              No Terms & Conditions uploaded
            </Text>
          </View>
        )}

        {/* Warning: Group Already Applied by Another Member */}
        {groupAlreadyApplied && selectedGroupId && (
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: "#F59E0B20",
                borderColor: "#F59E0B",
                marginBottom: 16,
              },
            ]}
          >
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <Text style={[styles.infoText, { color: colors.text }]}>
              This group has already applied via{" "}
              <Text style={{ fontFamily: "Poppins_600SemiBold" }}>
                {groupApplicationBy}
              </Text>
              . Only one application per group is allowed.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.primary },
            (isSubmittingApplication ||
              !pitchMessage.trim() ||
              !videoUrl ||
              groupAlreadyApplied ||
              (group.requirements?.musician_type === "group" &&
                !selectedGroupId)) && { opacity: 0.5 },
          ]}
          onPress={() => {
            console.log("🟡 SUBMIT APPLICATION BUTTON PRESSED");
            console.log("pitchMessage:", pitchMessage);
            console.log("pitchMessage.trim():", pitchMessage.trim());
            console.log("isSubmittingApplication:", isSubmittingApplication);
            console.log("hasExistingApplication:", hasExistingApplication);
            console.log("groupAlreadyApplied:", groupAlreadyApplied);
            console.log("selectedGroupId:", selectedGroupId);
            console.log("userId:", userId);
            console.log("listingId:", listingId);

            if (groupAlreadyApplied) {
              setAlertConfig({
                type: "warning",
                title: "Group Already Applied",
                message: `This group has already applied via ${groupApplicationBy}. Only one application per group is allowed.`,
              });
              setAlertVisible(true);
              return;
            }

            if (isBlocked) {
              setAlertConfig({
                type: "error",
                title: "Restricted",
                message: blockReason || "You are blocked from applying.",
              });
              setAlertVisible(true);
              return;
            }

            if (!pitchMessage.trim()) {
              console.log("❌ Pitch message is empty, returning");
              return;
            }

            console.log("✅ Validation passed, calling handleConfirm...");
            handleConfirm(
              handleSubmitApplication,
              "Confirm Application",
              "Are you sure you want to submit this application?",
            );
          }}
          disabled={
            isSubmittingApplication ||
            !pitchMessage.trim() ||
            !videoUrl ||
            hasExistingApplication ||
            isBlocked ||
            groupAlreadyApplied ||
            (group.requirements?.musician_type === "group" && !selectedGroupId)
          }
          activeOpacity={0.8}
        >
          {isSubmittingApplication ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {hasExistingApplication
                ? existingApplicationStatus === "rejected"
                  ? "Application Declined"
                  : existingApplicationStatus === "accepted" ||
                      existingApplicationStatus === "approved"
                    ? "Application Accepted"
                    : "Already Applied"
                : groupAlreadyApplied
                  ? "Group Already Applied"
                  : group.requirements?.musician_type === "group" &&
                      !selectedGroupId
                    ? "Select a Group to Apply"
                    : "Submit Application"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // --- GROUP TABS ---

  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasExistingVenue, setHasExistingVenue] = useState(false);
  const [checkingVenue, setCheckingVenue] = useState(false);

  // Fetch current user role and ID
  useEffect(() => {
    const fetchUserRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (data) {
          setCurrentUserRole(data.role);
          // If venue-owner, check if they have any gigs uploaded
          if (data.role === "venue-owner") {
            checkForExistingVenue(user.id);
          }
        }
      }
    };
    fetchUserRole();
  }, []);

  // Check if venue-owner has any gigs/venues uploaded
  const checkForExistingVenue = async (userId: string) => {
    setCheckingVenue(true);
    try {
      const { data, error } = await supabase
        .from("gigs")
        .select("id")
        .eq("organizer_id", userId)
        .limit(1);

      if (!error && data && data.length > 0) {
        setHasExistingVenue(true);
      } else {
        setHasExistingVenue(false);
      }
    } catch (e) {
      console.log("Error checking venue:", e);
      setHasExistingVenue(false);
    } finally {
      setCheckingVenue(false);
    }
  };

  const handleProfileNavigation = () => {
    // Implementation for navigation
    // If owner -> Edit/Manage
    // If visitor -> View Profile
    // For now, we'll just log the action as the routes might need to be confirmed
    if (group.owner_id === currentUserId) {
      console.log("Navigate to Manage Profile/Edit Listing");
      // router.push('/profile/manage');
    } else {
      console.log("Navigate to Public Profile", group.owner_id);
      // router.push(`/profile/${group.owner_id}`);
    }
  };

  // Helper to calculate profile completion
  const calculateCompletion = () => {
    let score = 0;
    let total = 5;
    if (group.name) score++;
    if (group.owner_avatar || group.image) score++;
    if (group.description && group.description.length > 20) score++;
    if (group.location) score++;
    if (group.images && group.images.length > 1) score++;

    return Math.round((score / total) * 100);
  };

  // Group: About Tab
  const renderGroupAbout = () => {
    const completionRate = calculateCompletion();

    return (
      <View style={styles.tabContent}>
        {/* Bio Card */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Bio</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {group.description || "No description provided."}
          </Text>
        </View>

        {/* Stats Row */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
          <View
            style={[
              styles.statCard,
              { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Genre
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {group.genre || "Multi-Genre"}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Rating
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {group.rating ? group.rating.toFixed(1) : "-"}
            </Text>
          </View>
        </View>

        {/* Band Members Section */}
        {group.members && group.members.length > 0 && (
          <View style={[styles.section, { marginBottom: 24 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Band Members ({group.members.length})
            </Text>
            <View style={{ gap: 12 }}>
              {group.members.map((member: any, index: number) => {
                const isLeader = member.role === "Leader" || index === 0;
                const memberName =
                  typeof member === "string" ? member : member.name;
                const memberInstrument =
                  typeof member === "string" ? member : member.instrument;
                return (
                  <View
                    key={index}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      padding: 12,
                      borderRadius: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: isLeader ? colors.primary : "#E0E7FF",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {member.avatar_url ? (
                        <Image
                          source={{ uri: member.avatar_url }}
                          style={{ width: 44, height: 44, borderRadius: 22 }}
                        />
                      ) : (
                        <Text
                          style={{
                            color: isLeader ? "#fff" : "#4F46E5",
                            fontWeight: "bold",
                            fontSize: 16,
                          }}
                        >
                          {memberName?.charAt(0)}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontFamily: "Poppins_500Medium",
                          fontSize: 14,
                        }}
                      >
                        {memberName}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ionicons
                          name="musical-note"
                          size={12}
                          color={colors.primary}
                        />
                        <Text
                          style={{ color: colors.textSecondary, fontSize: 12 }}
                        >
                          {memberInstrument}
                        </Text>
                        {isLeader && (
                          <Text
                            style={{
                              color: colors.primary,
                              fontSize: 10,
                              marginLeft: 4,
                            }}
                          >
                            • Leader
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Managed By & Completion Rate */}
        <View
          style={[
            styles.managerCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
            },
          ]}
        >
          <View style={{ marginBottom: 16 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Image
                source={{ uri: group.owner_avatar || null }}
                style={[styles.hostAvatar, { backgroundColor: colors.border }]}
              />
              <View>
                <Text
                  style={[styles.managerLabel, { color: colors.textSecondary }]}
                >
                  Managed by
                </Text>
                <Text style={[styles.managerName, { color: colors.text }]}>
                  {group.owner_name || "Unknown User"}
                </Text>
              </View>
            </View>

            {/* Completion Rate Indicator */}
            <View
              style={{
                marginTop: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <View
                style={{
                  flex: 1,
                  height: 6,
                  backgroundColor: isDark ? "#374151" : "#E5E7EB",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${completionRate}%`,
                    height: "100%",
                    backgroundColor:
                      completionRate === 100 ? "#10B981" : colors.primary,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "Poppins_600SemiBold",
                  color:
                    completionRate === 100 ? "#10B981" : colors.textSecondary,
                }}
              >
                {`${completionRate}% Complete`}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.visitBtn, { borderColor: colors.primary }]}
            onPress={handleProfileNavigation}
          >
            <Text
              style={{
                color: colors.primary,
                fontSize: 12,
                fontFamily: "Poppins_600SemiBold",
              }}
            >
              {group.owner_id === currentUserId
                ? "Manage Profile"
                : "Visit Profile"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Group: Timeline Tab - Shows pictures like Instagram
  const renderGroupTimeline = () => {
    const mediaItems = group.images || [];

    // Show all images except the first one (cover photo)
    const timelineItems = mediaItems.slice(1);

    return (
      <View style={styles.tabContent}>
        {/* Photos Grid */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Posts
          </Text>

          {timelineItems.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {timelineItems.map((url: string, idx: number) => (
                <View
                  key={idx}
                  style={{
                    width: (width - 56) / 3,
                    aspectRatio: 1,
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                  }}
                >
                  <Image
                    source={{ uri: url }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{
                padding: 40,
                alignItems: "center",
                backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                borderStyle: "dashed",
              }}
            >
              <Ionicons
                name="images-outline"
                size={48}
                color={colors.textSecondary}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  marginTop: 12,
                  fontFamily: "Poppins_500Medium",
                  fontSize: 14,
                }}
              >
                No posts yet
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginTop: 4,
                  fontFamily: "Poppins_400Regular",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                This artist hasn't shared any photos
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Group: Setup Tab (legacy - keeping for reference)
  const renderGroupSetup = () => (
    <View style={styles.tabContent}>
      {/* Stage Plot Placeholder */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Stage Plot
        </Text>
        <View
          style={[
            styles.stagePlotPlaceholder,
            {
              borderColor: colors.border,
              backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
            },
          ]}
        >
          <Ionicons
            name="image-outline"
            size={32}
            color={colors.textSecondary}
          />
          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
            Stage Layout Visual
          </Text>
        </View>
      </View>

      {/* Input List - Placeholder for now until DB field exists */}
      {/* <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Input List</Text>
             <Text style={{ color: colors.textSecondary }}>No input list available.</Text>
        </View> */}

      {/* Hospitality */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Hospitality Rider
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          No specific hospitality requirements listed.
        </Text>
      </View>
    </View>
  );

  // Handler for Send Request button with venue check
  const handleSendBookingRequest = () => {
    // Check if venue-owner has a venue uploaded
    if (currentUserRole === "venue-owner" && userVenues.length === 0) {
      handleConfirm(
        () => {
          // Navigate to add gig/venue page
          const router = require("expo-router").router;
          router.push("/add_studio"); // Assuming add_studio handles venues
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

    // Proceed with normal booking request
    handleConfirm(
      async () => {
        setIsSendingRequest(true);
        try {
          const receiverId =
            group.type === "Artist" ? group.id : group.owner_id;
          const groupId = group.type === "Group" ? group.id : null;

          const { error } = await supabase.from("booking_requests").insert({
            sender_id: currentUserId,
            receiver_id: receiverId,
            group_id: groupId,
            studio_id: selectedVenueId, // Include selected venue
            message: requestMessage,
            status: "pending",
            event_details: {}, // Can be expanded later
          });

          if (error) throw error;

          setAlertConfig({
            type: "success",
            title: "Request Sent",
            message: "Your booking request has been sent successfully!",
          });
          setAlertVisible(true);
          setRequestMessage("");

          // Close sheet after delay
          setTimeout(() => {
            if (ref && "current" in ref && ref.current) {
              (ref as any).current.dismiss();
            }
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
  };

  // Group: Connect Tab
  const renderGroupConnect = () => (
    <View style={styles.tabContent}>
      {/* Show Booking Request for Venues/Organizers OR if role is unknown/not logged in (fallback) */}
      {(!currentUserRole || currentUserRole === "venue-owner") && (
        <View style={styles.section}>
          <View style={{ marginTop: 0 }}>
            {renderBookingControls()}

            {/* Venue Selection for Owners with Multiple Venues */}
            {currentUserRole === "venue-owner" && userVenues.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Select Venue
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {userVenues.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.groupSelectChip,
                        {
                          backgroundColor:
                            selectedVenueId === v.id
                              ? colors.primary
                              : isDark
                                ? "#374151"
                                : "#F3F4F6",
                          borderColor:
                            selectedVenueId === v.id
                              ? colors.primary
                              : colors.border,
                          marginRight: 8,
                        },
                      ]}
                      onPress={() => setSelectedVenueId(v.id)}
                    >
                      <Ionicons
                        name="business"
                        size={16}
                        color={selectedVenueId === v.id ? "#FFF" : colors.text}
                      />
                      <Text
                        style={{
                          color:
                            selectedVenueId === v.id ? "#FFF" : colors.text,
                          marginLeft: 8,
                          fontFamily: "Poppins_500Medium",
                        }}
                      >
                        {v.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {currentUserRole === "venue-owner" &&
              userVenues.length === 0 &&
              !checkingVenue && (
                <View
                  style={[
                    styles.infoBox,
                    {
                      backgroundColor: "#FEE2E2",
                      borderColor: "#EF4444",
                      marginBottom: 16,
                    },
                  ]}
                >
                  <Text style={[styles.infoText, { color: "#B91C1C" }]}>
                    You don't have any venues listed. Please create a venue to
                    send invites.
                  </Text>
                </View>
              )}

            <Text style={[styles.label, { color: colors.text }]}>
              Send Booking Request
            </Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: isDark ? "#374151" : "#F9FAFB",
                  height: 100,
                  marginBottom: 16,
                },
              ]}
            >
              <TextInput
                style={[styles.input, { color: colors.text, height: "100%" }]}
                placeholder="Describe your event..."
                placeholderTextColor={colors.textSecondary}
                multiline
                textAlignVertical="top"
                value={requestMessage}
                onChangeText={setRequestMessage}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.uploadBox,
                { borderColor: colors.border, height: 80, marginBottom: 16 },
              ]}
            >
              <Ionicons
                name="attach-outline"
                size={24}
                color={colors.primary}
              />
              <Text
                style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}
              >
                Attach Event Proposal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleSendBookingRequest}
              disabled={checkingVenue || isSendingRequest}
              activeOpacity={0.8}
            >
              {isSendingRequest ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {checkingVenue ? "Checking..." : "Send Request"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Show Audition for Musicians OR if role is unknown */}
      {(!currentUserRole || currentUserRole === "musician") &&
        group.requirements?.audition && (
          <View
            style={[
              styles.section,
              (!currentUserRole || currentUserRole === "venue-owner") && {
                marginTop: 32,
              },
            ]}
          >
            {currentUserRole === "musician" && (
              <>
                <View
                  style={[
                    styles.auditionBanner,
                    { borderColor: isDark ? "#065F46" : "#86EFAC" },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: "Poppins_600SemiBold",
                      color: colors.text,
                    }}
                  >
                    Active Audition:{" "}
                    {group.requirements.audition_role || "Musician"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 4,
                    }}
                  >
                    {group.requirements.audition_desc ||
                      "Open audition for this project."}
                  </Text>
                </View>

                <View style={{ marginTop: 16 }}>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      {
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() =>
                      handleConfirm(
                        () => console.log("Applied for Audition"),
                        "Apply for Audition",
                        `Confirm your application for the ${group.requirements.audition_role || "Musician"} position?`,
                      )
                    }
                  >
                    <Text
                      style={[styles.primaryBtnText, { color: colors.primary }]}
                    >
                      Apply for Audition
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
    </View>
  );

  const scrollRef = useRef<any>(null);

  return (
    <>
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? "#4B5563" : "#E5E7EB",
          width: 40,
        }}
        enablePanDownToClose={true}
        onChange={handleSheetChanges}
      >
        {loading ? (
          <View
            style={[
              styles.loadingContainer,
              { backgroundColor: colors.background },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : group ? (
          <BottomSheetScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            {/* Immersive Hero Image */}
            <View style={styles.imageContainer}>
              <Image
                source={{
                  uri: (group.images && group.images[0]) || group.image || null,
                }}
                style={[styles.image, { backgroundColor: colors.border }]}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.6)"]}
                style={styles.gradient}
              />

              {/* Header Actions */}
              <View style={[styles.headerActions, { paddingTop: 20 }]}>
                <TouchableOpacity
                  onPress={() => (ref as any)?.current?.dismiss()}
                  style={styles.roundBtn}
                >
                  <Ionicons name="close" size={22} color="#000" />
                </TouchableOpacity>

                <View style={styles.rightActions}>
                  <TouchableOpacity style={styles.roundBtn}>
                    <Ionicons name="share-outline" size={22} color="#000" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={toggleFavorite}
                    style={styles.roundBtn}
                  >
                    <Ionicons
                      name={isFavorited ? "heart" : "heart-outline"}
                      size={22}
                      color={isFavorited ? "#EF4444" : "#000"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hero Identity (Bottom Left of Image) */}
              <View style={styles.heroIdentity}>
                {/* Status Tags */}
                <View style={styles.statusRow}>
                  {/* Report button could be here */}
                </View>
                <Text style={styles.heroTitle}>{group.name}</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <Ionicons name="location" size={14} color="#FFF" />
                  <Text style={styles.heroLocation}>
                    {group.location || "Manila"}
                  </Text>
                  <Text style={[styles.heroLocation, { marginLeft: 12 }]}>
                    • {group.genre || "Music"}
                  </Text>
                </View>
              </View>
            </View>

            {/* TABS SELECTOR */}
            {showTabs && renderTabs()}

            {/* CONTENT BODY */}
            <View
              style={[
                styles.contentBody,
                { backgroundColor: colors.background },
              ]}
            >
              {/* GENERAL RENDERLOGIC */}

              {/* Group/Artist Specific Tabs */}
              {(group.type === "Group" ||
                group.type === "Artist" ||
                !group.type) && (
                <>
                  {(activeTab === "About" || !showTabs) && renderGroupAbout()}
                  {activeTab === "Timeline" && renderGroupTimeline()}
                  {activeTab === "Review" && renderReviews()}
                </>
              )}

              {/* Existing Tabs for Studio/Gig */}
              {(group.type === "Studio" ||
                group.type === "Gig" ||
                group.type === "Venue") && (
                <>
                  {activeTab === "About" && (
                    <View style={styles.tabContent}>
                      {/* Stats Row (Gig) */}
                      {group.type === "Gig" && (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 12,
                            marginBottom: 24,
                          }}
                        >
                          <View
                            style={[
                              styles.statCard,
                              {
                                backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statLabel,
                                { color: colors.textSecondary },
                              ]}
                            >
                              Budget
                            </Text>
                            <Text
                              style={[styles.statValue, { color: colors.text }]}
                            >
                              ₱{group.budget || "5,000"}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.statCard,
                              {
                                backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statLabel,
                                { color: colors.textSecondary },
                              ]}
                            >
                              Event Date
                            </Text>
                            <Text
                              style={[styles.statValue, { color: colors.text }]}
                            >
                              {group.event_date
                                ? new Date(group.event_date).toLocaleDateString(
                                    undefined,
                                    {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )
                                : "TBA"}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Stats Row (Studio/Venue) */}
                      {(group.type === "Studio" || group.type === "Venue") && (
                        <View
                          style={{
                            flexDirection: "column",
                            gap: 12,
                            marginBottom: 24,
                          }}
                        >
                          {/* Pricing Row */}
                          <View style={{ flexDirection: "row", gap: 12 }}>
                            {hasDualPricing ? (
                              <>
                                <View
                                  style={[
                                    styles.statCard,
                                    {
                                      backgroundColor: isDark
                                        ? "#1F2937"
                                        : "#F3F4F6",
                                      flex: 1,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.statLabel,
                                      { color: colors.textSecondary },
                                    ]}
                                  >
                                    Rehearsal Rate
                                  </Text>
                                  <Text
                                    style={[
                                      styles.statValue,
                                      { color: colors.text },
                                    ]}
                                  >{`₱${rehearsalRate}/hr`}</Text>
                                </View>
                                <View
                                  style={[
                                    styles.statCard,
                                    {
                                      backgroundColor: isDark
                                        ? "#1F2937"
                                        : "#F3F4F6",
                                      flex: 1,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.statLabel,
                                      { color: colors.textSecondary },
                                    ]}
                                  >
                                    Recording Rate
                                  </Text>
                                  <Text
                                    style={[
                                      styles.statValue,
                                      { color: colors.text },
                                    ]}
                                  >{`₱${recordingRate}/song`}</Text>
                                </View>
                              </>
                            ) : (
                              <View
                                style={[
                                  styles.statCard,
                                  {
                                    backgroundColor: isDark
                                      ? "#1F2937"
                                      : "#F3F4F6",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statLabel,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  {recordingRate && !rehearsalRate
                                    ? "Recording Rate"
                                    : rehearsalRate && !recordingRate
                                      ? "Rehearsal Rate"
                                      : "Hourly Rate"}
                                </Text>
                                <Text
                                  style={[
                                    styles.statValue,
                                    { color: colors.text },
                                  ]}
                                >
                                  {recordingRate && !rehearsalRate
                                    ? `₱${recordingRate}/song`
                                    : `₱${displayRate}/hr`}
                                </Text>
                              </View>
                            )}
                          </View>
                          {/* Stats Row */}
                          <View style={{ flexDirection: "row", gap: 12 }}>
                            <View
                              style={[
                                styles.statCard,
                                {
                                  backgroundColor: isDark
                                    ? "#1F2937"
                                    : "#F3F4F6",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statLabel,
                                  { color: colors.textSecondary },
                                ]}
                              >
                                Rating
                              </Text>
                              <Text
                                style={[
                                  styles.statValue,
                                  { color: colors.text },
                                ]}
                              >
                                {group.rating ? group.rating.toFixed(1) : "-"}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.statCard,
                                {
                                  backgroundColor: isDark
                                    ? "#1F2937"
                                    : "#F3F4F6",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statLabel,
                                  { color: colors.textSecondary },
                                ]}
                              >
                                Completion
                              </Text>
                              <Text
                                style={[
                                  styles.statValue,
                                  { color: colors.text },
                                ]}
                              >
                                {group.completion_rate !== undefined
                                  ? `${group.completion_rate}%`
                                  : "--"}
                              </Text>
                            </View>
                            {group.type === "Studio" && group.studio_type && (
                              <View
                                style={[
                                  styles.statCard,
                                  {
                                    backgroundColor: isDark
                                      ? "#1F2937"
                                      : "#F3F4F6",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statLabel,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  Type
                                </Text>
                                <Text
                                  style={[
                                    styles.statValue,
                                    { color: colors.text },
                                  ]}
                                >
                                  {group.studio_type === "Both"
                                    ? "Rehearsal & Recording"
                                    : group.studio_type}
                                </Text>
                              </View>
                            )}
                            {group.type === "Studio" && group.pax && (
                              <View
                                style={[
                                  styles.statCard,
                                  {
                                    backgroundColor: isDark
                                      ? "#1F2937"
                                      : "#F3F4F6",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statLabel,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  Capacity
                                </Text>
                                <Text
                                  style={[
                                    styles.statValue,
                                    { color: colors.text },
                                  ]}
                                >
                                  {group.pax} pax
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      )}

                      {/* Description */}
                      <View style={styles.section}>
                        <Text
                          style={[styles.sectionTitle, { color: colors.text }]}
                        >
                          {labels.aboutTitle}
                        </Text>
                        <Text
                          style={[
                            styles.description,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {group.description || "No description provided."}
                        </Text>
                      </View>

                      {/* Managed By & Completion Rate (Shared-like Component) */}
                      <View
                        style={[
                          styles.managerCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            borderWidth: 1,
                            marginBottom: 24,
                          },
                        ]}
                      >
                        <View style={{ marginBottom: 16 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <Image
                              source={{ uri: group.owner_avatar || undefined }}
                              style={[
                                styles.hostAvatar,
                                { backgroundColor: colors.border },
                              ]}
                            />
                            <View>
                              <Text
                                style={[
                                  styles.managerLabel,
                                  { color: colors.textSecondary },
                                ]}
                              >
                                {group.type === "Gig"
                                  ? "Organized by"
                                  : "Managed by"}
                              </Text>
                              <Text
                                style={[
                                  styles.managerName,
                                  { color: colors.text },
                                ]}
                              >
                                {group.owner_name || "Unknown User"}
                              </Text>
                            </View>
                          </View>

                          {/* Completion Rate Indicator - Unified */}
                          <View
                            style={{
                              marginTop: 12,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <View
                              style={{
                                flex: 1,
                                height: 6,
                                backgroundColor: isDark ? "#374151" : "#E5E7EB",
                                borderRadius: 3,
                                overflow: "hidden",
                              }}
                            >
                              <View
                                style={{
                                  width: `${group.completion_rate !== undefined ? group.completion_rate : calculateCompletion()}%`,
                                  height: "100%",
                                  backgroundColor:
                                    (group.completion_rate !== undefined
                                      ? group.completion_rate
                                      : calculateCompletion()) >= 90
                                      ? "#10B981"
                                      : colors.primary,
                                }}
                              />
                            </View>
                            <Text
                              style={{
                                fontSize: 11,
                                fontFamily: "Poppins_600SemiBold",
                                color:
                                  (group.completion_rate !== undefined
                                    ? group.completion_rate
                                    : calculateCompletion()) >= 90
                                    ? "#10B981"
                                    : colors.textSecondary,
                              }}
                            >
                              {`${group.completion_rate !== undefined ? group.completion_rate : calculateCompletion()}% Complete`}
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.visitBtn,
                            { borderColor: colors.primary },
                          ]}
                          onPress={handleProfileNavigation}
                        >
                          <Text
                            style={{
                              color: colors.primary,
                              fontSize: 12,
                              fontFamily: "Poppins_600SemiBold",
                            }}
                          >
                            {group.owner_id === currentUserId
                              ? "Manage Profile"
                              : "Visit Profile"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Deal Card (Gig) */}
                      {group.type === "Gig" && (
                        <View
                          style={[
                            styles.dealCard,
                            {
                              backgroundColor: isDark ? "#1e293b" : "#ECFDF5",
                              borderColor: isDark ? "#064e3b" : "#10B981",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontFamily: "Poppins_600SemiBold",
                              color: isDark ? "#6ee7b7" : "#047857",
                              marginBottom: 8,
                            }}
                          >
                            The Deal
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Poppins_500Medium",
                              color: isDark ? "#d1fae5" : "#065F46",
                            }}
                          >
                            Guarantee + Door Split
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Poppins_400Regular",
                              color: isDark ? "#d1fae5" : "#065F46",
                              fontSize: 13,
                              marginTop: 4,
                            }}
                          >
                            45 min set • Meal Included
                          </Text>
                        </View>
                      )}

                      {/* Gallery */}
                      <View style={{ marginTop: 24 }}>{renderGallery()}</View>
                    </View>
                  )}
                  {activeTab === "Setup" && renderStudioSetup()}
                  {activeTab === "Specs" && renderStudioSetup()}
                  {activeTab === "Book" && renderStudioBook()}
                  {activeTab === "Info" && renderGigInfo()}
                  {activeTab === "Apply" && renderGigApply()}
                  {activeTab === "Review" && renderReviews()}
                </>
              )}
            </View>

            {/* Bottom Bar for GROUP/Default only - Tabs have their own CTAs */}
            {!showTabs && (
              <View
                style={[
                  styles.bottomBar,
                  {
                    backgroundColor: colors.background,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View style={styles.priceContainer}>
                  <Text style={[styles.priceText, { color: colors.text }]}>
                    {`₱${displayRate} `}
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "400",
                        color: colors.textSecondary,
                      }}
                    >
                      {labels.unit}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.bookBtn, { backgroundColor: colors.primary }]}
                  onPress={() =>
                    handleConfirm(
                      () => console.log("Group Reserved"),
                      "Reserve Artist",
                      "Confirm reservation request?",
                    )
                  }
                >
                  <Text style={styles.bookBtnText}>Reserve</Text>
                </TouchableOpacity>
              </View>
            )}
          </BottomSheetScrollView>
        ) : null}
      </BottomSheetModal>

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={[
          {
            text: "OK",
            style: "default",
            onPress: () => setAlertVisible(false),
          },
        ]}
        onClose={() => setAlertVisible(false)}
      />

      <Modal
        visible={modalVisible}
        onClose={() => {
          console.log("🔴 Modal closed without confirmation");
          setModalVisible(false);
        }}
        onConfirm={() => {
          console.log("🟢 Modal CONFIRMED - executing action");
          console.log("confirmAction:", confirmAction);
          setModalVisible(false);
          try {
            confirmAction();
            console.log("✅ confirmAction executed successfully");
          } catch (error) {
            console.error("❌ Error executing confirmAction:", error);
          }
        }}
        title={confirmTitle}
        message={confirmMessage}
        buttonText="Confirm"
      />

      {/* Payment Option Modal */}
      <RNModal
        visible={showPaymentOptionModal}
        transparent
        animationType="fade"
        onRequestClose={() =>
          !isProcessingPayment && setShowPaymentOptionModal(false)
        }
      >
        <View style={styles.paymentModalOverlay}>
          {isProcessingPayment ? (
            // Loading Screen while PayMongo processes
            <View
              style={[
                styles.paymentLoadingContainer,
                { backgroundColor: colors.card },
              ]}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={[styles.paymentLoadingTitle, { color: colors.text }]}
              >
                Processing Payment
              </Text>
              <Text
                style={[
                  styles.paymentLoadingSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                Please wait while we set up your payment...
              </Text>
            </View>
          ) : (
            // Payment Option Selection
            <View
              style={[
                styles.paymentOptionContainer,
                { backgroundColor: colors.card },
              ]}
            >
              <Text style={[styles.paymentOptionTitle, { color: colors.text }]}>
                Choose Payment Option
              </Text>
              <Text
                style={[
                  styles.paymentOptionSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                Total Amount: ₱
                {(paymentBookingData?.totalAmount || 0).toLocaleString()}
              </Text>

              {/* Full Payment Option */}
              <TouchableOpacity
                onPress={() => setSelectedPaymentType("full")}
                style={[
                  styles.paymentOptionCard,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                    borderColor:
                      selectedPaymentType === "full"
                        ? colors.primary
                        : colors.border,
                    borderWidth: selectedPaymentType === "full" ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.paymentOptionRow}>
                  <View
                    style={[
                      styles.paymentOptionRadio,
                      {
                        borderColor:
                          selectedPaymentType === "full"
                            ? colors.primary
                            : colors.border,
                        backgroundColor:
                          selectedPaymentType === "full"
                            ? colors.primary
                            : "transparent",
                      },
                    ]}
                  >
                    {selectedPaymentType === "full" && (
                      <View style={styles.paymentOptionRadioInner} />
                    )}
                  </View>
                  <View style={styles.paymentOptionInfo}>
                    <Text
                      style={[
                        styles.paymentOptionLabel,
                        { color: colors.text },
                      ]}
                    >
                      Full Payment
                    </Text>
                    <Text
                      style={[
                        styles.paymentOptionAmount,
                        { color: colors.primary },
                      ]}
                    >
                      ₱{(paymentBookingData?.totalAmount || 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.paymentOptionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  Pay the full amount now and complete your booking
                </Text>
              </TouchableOpacity>

              {/* Downpayment Option */}
              <TouchableOpacity
                onPress={() => setSelectedPaymentType("downpayment")}
                style={[
                  styles.paymentOptionCard,
                  {
                    backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                    borderColor:
                      selectedPaymentType === "downpayment"
                        ? colors.primary
                        : colors.border,
                    borderWidth: selectedPaymentType === "downpayment" ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.paymentOptionRow}>
                  <View
                    style={[
                      styles.paymentOptionRadio,
                      {
                        borderColor:
                          selectedPaymentType === "downpayment"
                            ? colors.primary
                            : colors.border,
                        backgroundColor:
                          selectedPaymentType === "downpayment"
                            ? colors.primary
                            : "transparent",
                      },
                    ]}
                  >
                    {selectedPaymentType === "downpayment" && (
                      <View style={styles.paymentOptionRadioInner} />
                    )}
                  </View>
                  <View style={styles.paymentOptionInfo}>
                    <Text
                      style={[
                        styles.paymentOptionLabel,
                        { color: colors.text },
                      ]}
                    >
                      Downpayment (50%)
                    </Text>
                    <Text
                      style={[
                        styles.paymentOptionAmount,
                        { color: colors.primary },
                      ]}
                    >
                      ₱
                      {Math.round(
                        (paymentBookingData?.totalAmount || 0) / 2,
                      ).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.paymentOptionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  Pay half now, remaining ₱
                  {Math.round(
                    (paymentBookingData?.totalAmount || 0) / 2,
                  ).toLocaleString()}{" "}
                  due before session
                </Text>
              </TouchableOpacity>

              {/* Action Buttons */}
              <View style={styles.paymentOptionButtons}>
                <TouchableOpacity
                  onPress={() => {
                    setShowPaymentOptionModal(false);
                    // Clear form and navigate to bookings
                    setBookings([]);
                    setSelectedTimeSlots([]);
                    setBookingNotes("");
                    setModalVisible(false);
                    (ref as any)?.current?.dismiss();
                    setTimeout(() => {
                      router.push("/bookings" as any);
                    }, 100);
                  }}
                  style={[
                    styles.paymentOptionCancelBtn,
                    { borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentOptionCancelText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Pay Later
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => processPaymentWithType(selectedPaymentType)}
                  style={[
                    styles.paymentOptionConfirmBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons
                    name="card-outline"
                    size={18}
                    color="white"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.paymentOptionConfirmText}>
                    Pay ₱
                    {selectedPaymentType === "downpayment"
                      ? Math.round(
                          (paymentBookingData?.totalAmount || 0) / 2,
                        ).toLocaleString()
                      : (paymentBookingData?.totalAmount || 0).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </RNModal>
    </>
  );
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    height: 300,
  },
  scrollContent: {
    paddingBottom: 100,
    minHeight: "100%",
  },
  imageContainer: {
    height: IMG_HEIGHT,
    width: "100%",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerActions: {
    position: "absolute",
    top: moderateScale(16),
    left: scale(20),
    right: scale(20),
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  rightActions: {
    flexDirection: "row",
    gap: scale(12),
  },
  roundBtn: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  heroIdentity: {
    position: "absolute",
    bottom: moderateScale(24),
    left: scale(24),
    right: scale(24),
  },
  heroTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: height < 700 ? moderateScale(24) : moderateScale(28),
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroLocation: {
    color: "#FFF",
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(14),
    marginLeft: scale(4),
  },
  statusRow: {
    flexDirection: "row",
    gap: scale(8),
    marginBottom: moderateScale(8),
  },
  // Tabs
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: moderateScale(16),
  },
  tabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: moderateScale(14),
  },
  contentBody: {
    flex: 1,
    minHeight: verticalScale(500),
  },
  tabContent: {
    padding: height < 700 ? scale(16) : scale(24),
  },
  // Sections
  section: {
    marginBottom: height < 700 ? moderateScale(16) : moderateScale(24),
  },
  sectionTitle: {
    fontSize: height < 700 ? moderateScale(16) : moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
    marginBottom: moderateScale(12),
  },
  description: {
    fontSize: moderateScale(14),
    lineHeight: moderateScale(22),
  },
  // Stats
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  dealCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  // Gallery
  galleryContainer: {
    gap: 12,
  },
  galleryImage: {
    width: 160,
    height: 112,
    borderRadius: 12,
    marginRight: 12,
  },
  // Picker / Booking Widgets
  pickerSection: {
    marginBottom: 24,
  },
  dateTimeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dateIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTimeLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  timeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  timeIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pickerContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  nativePickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  pickerLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  pickerValue: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  durationWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  durationBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  durationVal: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },

  // Reviews
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
  },
  ratingBig: {
    fontSize: 56,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 64,
    letterSpacing: -1,
  },
  reviewsScroll: {
    gap: 16,
    paddingRight: 24,
  },
  reviewCard: {
    width: "100%",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  reviewUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  reviewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  reviewName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  reviewDate: {
    fontSize: 12,
    opacity: 0.7,
  },
  reviewBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
  // Setup / Tags
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  // Forms
  inputContainer: {
    marginBottom: moderateScale(16),
  },
  label: {
    fontFamily: "Poppins_500Medium",
    marginBottom: moderateScale(8),
  },
  inputWrapper: {
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(12),
    justifyContent: "center",
  },
  input: {
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(14),
    padding: 0,
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  paymentSummary: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    width: "100%",
  },
  primaryBtn: {
    paddingVertical: moderateScale(16),
    borderRadius: moderateScale(16),
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(16),
  },
  secondaryBtn: {
    paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12),
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(14),
  },
  groupSelectChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  bookingCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  timeSlotChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  // Info Box (for warnings/notices)
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  // Gig Info
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  equipmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  equipmentCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  equipmentImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  // Upload Box
  uploadBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  // Bottom Bar (Group)
  bottomBar: {
    paddingHorizontal: scale(24),
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(32),
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceContainer: {
    justifyContent: "center",
  },
  priceText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(18),
  },
  bookBtn: {
    paddingHorizontal: scale(24),
    paddingVertical: moderateScale(12),
    borderRadius: moderateScale(12),
  },
  bookBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(15),
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Manager Card
  managerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  managerLabel: {
    fontSize: 10,
    textTransform: "uppercase",
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  managerName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  visitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  // Stage Plot
  stagePlotPlaceholder: {
    height: 200,
    width: "100%",
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  // Connect Tab
  roleHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  roleTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  auditionBanner: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
  },
  // Integrated Picker Styles
  integratedCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    justifyContent: "space-between",
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  timeContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  timeButton: {
    alignItems: "center",
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  durationText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginLeft: 4,
  },
  bookingContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    marginBottom: 24,
  },
  slotGridContainer: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 8,
  },
  // Payment Option Modal Styles
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  paymentLoadingContainer: {
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  paymentLoadingTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    marginTop: 20,
    textAlign: "center",
  },
  paymentLoadingSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  paymentOptionContainer: {
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  paymentOptionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 22,
    marginBottom: 6,
    textAlign: "center",
  },
  paymentOptionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
  },
  paymentOptionCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  paymentOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  paymentOptionRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  paymentOptionRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  paymentOptionInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentOptionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  paymentOptionAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  paymentOptionDesc: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 34,
  },
  paymentOptionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  paymentOptionCancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentOptionCancelText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  paymentOptionConfirmBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  paymentOptionConfirmText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
});

export default ListingDetailsSheet;
