import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ProfileAvatar from "./ProfileAvatar";
import { isActiveApplication } from "../utils/gigApplicantFilters";

type Colors = {
  background: string;
  surface: string;
  inputBackground: string;
  border: string;
  primary: string;
  text: string;
  textSecondary: string;
};

type Props = {
  visible: boolean;
  summary: any | null;
  details: any | null;
  loading: boolean;
  error: string | null;
  colors: Colors;
  readOnly?: boolean;
  onClose: () => void;
  onRetry: () => void;
  onOpenMedia: (url: string, title: string) => void;
  onAccept: (applicationId: string) => void;
  onDecline: (applicationId: string) => void;
  onFire?: (applicationId: string) => void;
};

const titleCase = (value: unknown) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const criterionLabel = (value: unknown) => {
  const labels: Record<string, string> = {
    instrument_requirement: "Required instruments or roles",
    genre_requirement: "Required music genres",
    location_requirement: "Preferred performance location",
    portfolio_requirement: "Relevant performance experience",
  };
  const key = String(value || "").trim();
  return labels[key] || titleCase(key);
};

const normalizeGenre = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmusic\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^r and b$/, "rnb")
    .replace(/^rhythm and blues$/, "rnb")
    .replace(/^hip hop$/, "hiphop")
    .replace(/^electronic dance(?: music)?$/, "edm")
    .replace(/^original pilipino(?: music)?$/, "opm");

const genresMatch = (expected: unknown, actual: unknown) => {
  const normalizedExpected = normalizeGenre(expected);
  const normalizedActual = normalizeGenre(actual);
  if (!normalizedExpected || !normalizedActual) return false;
  if (normalizedExpected === normalizedActual) return true;
  const expectedTokens = normalizedExpected.split(" ");
  return expectedTokens.length === 1 && normalizedExpected.length >= 3 && normalizedActual.split(" ").includes(normalizedExpected);
};

const friendlyRecommendationSummary = (recommendation: any, matchPercentage: number | null) => {
  const status = String(recommendation?.recommendation_status || "").toLowerCase();
  if (status === "recommended") {
    return "This applicant appears to be a strong match. Review the submitted files before making your final decision.";
  }
  if (status === "possible_match") {
    return "This applicant meets some of the gig requirements. Review the items that still need confirmation before deciding.";
  }
  if (status === "not_eligible" && matchPercentage !== null && matchPercentage >= 70) {
    return "This applicant matches many preferences, but at least one required item could not be confirmed. Review the checks below before deciding.";
  }
  if (status === "not_eligible") {
    return "One or more required items could not be confirmed. Review the checks below before deciding.";
  }
  if (status === "insufficient_data") {
    return "There is not enough configured information to calculate a reliable match. Review the application manually.";
  }
  return recommendation?.explanation || "Review the application details below before deciding.";
};

const faceMatchLabel = (value: unknown) => {
  const status = String(value || "").toLowerCase();
  if (status === "likely_same_person") return "Possible match";
  if (status === "likely_different_person") return "Possible mismatch";
  return status === "not_run" ? "Not checked" : "Needs review";
};

const faceMatchColor = (value: unknown, fallback: string) => {
  const status = String(value || "").toLowerCase();
  if (status === "likely_same_person") return "#10B981";
  if (status === "likely_different_person") return "#EF4444";
  return fallback;
};

const faceMatchIcon = (value: unknown): keyof typeof Ionicons.glyphMap => {
  const status = String(value || "").toLowerCase();
  if (status === "likely_same_person") return "checkmark-circle-outline";
  if (status === "likely_different_person") return "alert-circle-outline";
  return "warning-outline";
};

const effectiveFaceMatchStatus = (result: any) => {
  const storedStatus = String(result?.status || "").toLowerCase();
  const usableFrames = Math.max(0, Number(result?.usable_frames ?? result?.frames_compared) || 0);
  const matchedFrames = Math.max(0, Number(result?.matched_frames) || 0);
  if (storedStatus === "unclear" && usableFrames === 1 && matchedFrames === 1) {
    return "likely_same_person";
  }
  return storedStatus;
};

const faceMatchSummary = (result: any) => {
  const status = effectiveFaceMatchStatus(result);
  if (status === "likely_same_person") return "The applicant may appear in the performance video.";
  if (status === "likely_different_person") return "The applicant may not appear in the performance video.";
  return "There wasn't enough clear information to confirm a match.";
};

const faceMatchDetails = (result: any) => {
  const usable = Math.max(0, Number(result?.usable_frames ?? result?.frames_compared) || 0);
  const matched = Math.max(0, Number(result?.matched_frames) || 0);
  if (usable === 0) return null;
  if (usable === 1) return "Only one clear frame was found. Please verify manually.";
  return `${matched} of ${usable} clear frames appeared to match.`;
};

const unavailableFaceMatchMessage = (result: any) => {
  const error = String(result?.error || "").toLowerCase();
  const summary = String(result?.summary || "").toLowerCase();
  if (["missing_face_service_url", "missing_facepp_credentials"].includes(error) || summary.includes("not configured")) {
    return "Profile and video comparison is temporarily unavailable.";
  }
  return "The profile photo and performance video could not be compared.";
};

const shortLocation = (value: unknown) => {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  return parts.slice(-3, -1).join(", ");
};

const screeningMeta = (statusValue: unknown) => {
  const status = String(statusValue || "not_screened").toLowerCase();
  if (status === "not_required") return { label: "Genre not identified", color: "#F59E0B", message: "We couldn't identify the song or genre." };
  if (status === "pending_review") return { label: "Song may have been recognized", color: "#F59E0B", message: "The possible song match still needs to be checked." };
  if (status === "approved") return { label: "Song match checked", color: "#10B981", message: "The possible song match and permission details were checked." };
  if (status === "declined") return { label: "Permission concern found", color: "#EF4444", message: "The possible song match was checked and the permission claim was not accepted." };
  if (status === "pending" || status === "processing") return { label: "Still checking", color: "#F59E0B", message: "The sound in the video is still being checked." };
  if (status === "unavailable") return { label: "Could not check the audio", color: "#6B7280", message: "No audio result is available. Check the video yourself." };
  if (status === "failed") return { label: "Audio check did not finish", color: "#EF4444", message: "The audio could not be checked. Check the video yourself." };
  return { label: "Audio not checked yet", color: "#6B7280", message: "The sound in this video has not been checked yet." };
};

function Section({
  title,
  icon,
  colors,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: Colors;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.sectionHeader}
      >
        <View style={[styles.sectionIcon, { backgroundColor: `${colors.primary}12` }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {open ? <View style={[styles.sectionBody, { borderTopColor: colors.border }]}>{children}</View> : null}
    </View>
  );
}

function EmptyState({ children, colors }: { children: React.ReactNode; colors: Colors }) {
  return <Text style={[styles.body, { color: colors.textSecondary }]}>{children}</Text>;
}

function StatusRow({
  icon,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statusRow}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statusRowText, { color }]}>{label}</Text>
    </View>
  );
}

function ReviewDetails({ children, colors }: { children: React.ReactNode; colors: Colors }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.reviewDetails}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.reviewDetailsButton}
      >
        <Text style={[styles.reviewDetailsButtonText, { color: colors.primary }]}>
          {open ? "Hide details" : "View details"}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.primary} />
      </TouchableOpacity>
      {open ? <View style={[styles.reviewDetailsBody, { borderLeftColor: colors.border }]}>{children}</View> : null}
    </View>
  );
}

function Subsection({
  title,
  icon,
  colors,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.subsection}>
      <View style={styles.subsectionHeader}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={[styles.subsectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={styles.subsectionBody}>{children}</View>
    </View>
  );
}

function BulletList({ values, colors, empty }: { values: unknown[]; colors: Colors; empty: string }) {
  if (values.length === 0) return <EmptyState colors={colors}>{empty}</EmptyState>;
  return (
    <View style={styles.stackSmall}>
      {values.map((value, index) => (
        <View key={`${String(value)}-${index}`} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.body, styles.bulletText, { color: colors.textSecondary }]}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: React.ReactNode;
  colors: Colors;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={17} color={colors.primary} />
      <View style={styles.flexOne}>
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function TagList({ values, colors, empty }: { values: unknown[]; colors: Colors; empty: string }) {
  if (values.length === 0) return <EmptyState colors={colors}>{empty}</EmptyState>;

  return (
    <View style={styles.tagList}>
      {values.map((value, index) => (
        <View
          key={`${String(value)}-${index}`}
          style={[styles.tag, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}2E` }]}
        >
          <Text style={[styles.tagText, { color: colors.primary }]}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ApplicantDetailsModal({
  visible,
  summary,
  details,
  loading,
  error,
  colors,
  readOnly = false,
  onClose,
  onRetry,
  onOpenMedia,
  onAccept,
  onDecline,
  onFire,
}: Props) {
  const router = useRouter();
  const application = details || summary || {};
  const rosterProfile = application.production_roster?.roster_profile;
  const rosterGroup = application.production_roster?.roster_group;
  const profile = rosterProfile || application.applicant || {};
  const group = application.group || rosterGroup;
  const snapshot = application.performer_snapshot || {};
  const name = group?.name || snapshot.display_name || profile.full_name || "Applicant";
  const avatar = group?.images?.[0] || profile.avatar_url || snapshot.avatar_url || null;
  const fullLocation = group?.location || profile.location || "Location not provided";
  const genres = list(profile.genres).length ? list(profile.genres) : String(group?.genre || "").split(",").filter(Boolean);
  const groupMemberDetails = list(group?.members);
  const instruments = list(profile.skills).length
    ? list(profile.skills)
    : groupMemberDetails.flatMap((member) =>
        [member?.instrument, member?.role, ...list(member?.instruments), ...list(member?.skills)].filter(Boolean),
      );
  const recommendation = application.ai_recommendation || null;
  const aiReview = application.ai_portfolio_review || null;
  const aiReviewStatus = String(aiReview?.status || "").toLowerCase();
  const retryRef = useRef(onRetry);
  const refreshAttemptsRef = useRef(0);
  const refreshingApplicationIdRef = useRef<string | null>(null);

  useEffect(() => {
    retryRef.current = onRetry;
  }, [onRetry]);

  useEffect(() => {
    const applicationId = String(application.id || "") || null;
    if (!visible || refreshingApplicationIdRef.current !== applicationId) {
      refreshingApplicationIdRef.current = applicationId;
      refreshAttemptsRef.current = 0;
    }

    if (
      !visible ||
      loading ||
      refreshAttemptsRef.current >= 12 ||
      !["queued", "processing"].includes(aiReviewStatus)
    ) return;

    const refreshTimer = setTimeout(() => {
      refreshAttemptsRef.current += 1;
      retryRef.current();
    }, 3500);
    return () => clearTimeout(refreshTimer);
  }, [aiReviewStatus, application.id, loading, visible]);

  const evidence = list(aiReview?.evidence);
  const storedCvReview = list(aiReview?.source_summary?.cv_requirement_review);
  const cvDocumentClassification = aiReview?.source_summary?.cv_document_classification || null;
  const cvDocumentStatus = String(cvDocumentClassification?.status || "").toLowerCase();
  const cvTextExtracted = aiReview?.source_summary?.cv_text_extracted === true;
  const cvExtractionMethod = String(aiReview?.source_summary?.cv_extraction_method || "");
  const cvNameCheck = aiReview?.source_summary?.cv_name_check || null;
  const cvNameCheckStatus = String(cvNameCheck?.status || "not_run").toLowerCase();
  const cvEvidence = storedCvReview.length
    ? storedCvReview
    : evidence.filter((item) => list(item?.evidence).some((entry) => entry?.source === "cv"));
  const recognizedAudioGenres = application.video_copyright_metadata?.genre_evidence_receipt
    ? list(application.video_copyright_metadata?.recognized_audio_genres)
    : [];
  const hasRecognizedRecording = recognizedAudioGenres.length > 0;
  const requiredGenres = list(recommendation?.criteria_snapshot?.requirements?.genres);
  const recognizedGenreMatchesRequirement = requiredGenres.length > 0 && requiredGenres.some((expected) =>
    recognizedAudioGenres.some((actual) => genresMatch(expected, actual)),
  );
  const screening = hasRecognizedRecording
    ? {
        label: "Song identified",
        color: "#10B981",
        message: "A song was identified, but the genre result still needs review.",
      }
    : screeningMeta(application.video_copyright_status);
  const portfolio = list(profile.portfolio_urls);
  const faceSimilarity = aiReview?.face_similarity || null;
  const groupFaceSimilarity = list(aiReview?.group_face_similarity);
  const isPending = String(application.status || "pending").toLowerCase() === "pending";
  const priorApplicationCounts = application.prior_application_counts || null;
  const hasPriorApplicationCounts =
    Number.isInteger(priorApplicationCounts?.this_gig) &&
    Number.isInteger(priorApplicationCounts?.owner_gigs);
  const rawMatchScore = recommendation?.score;
  const matchPercentage =
    rawMatchScore !== null && rawMatchScore !== undefined && Number.isFinite(Number(rawMatchScore))
      ? Math.max(0, Math.min(100, Math.round(Number(rawMatchScore))))
      : null;
  const appliedRole = titleCase(application.slot_type || (group ? group.group_type || "band" : "solo artist"));
  const isVerified =
    recommendation?.is_verified === true ||
    (profile?.is_verified === true &&
      String(profile?.verification_status || "").toUpperCase() === "APPROVED");
  const applicationStatus = titleCase(application.status || "pending");
  const matchedCriteriaCount = list(recommendation?.matched_criteria).length;
  const viewedProfileId = profile?.id || application.applicant_id || application.submitted_by_user_id;
  const audioGenreStatus = hasRecognizedRecording
    ? requiredGenres.length === 0
      ? {
          label: "Song identified",
          color: "#F59E0B",
          message: "A song genre was identified, but this gig has no genre requirement to compare it with.",
        }
      : recognizedGenreMatchesRequirement
        ? {
            label: "Song genre matches the gig",
            color: "#10B981",
            message: `The detected genre (${recognizedAudioGenres.join(", ")}) fits the gig's requested genre (${requiredGenres.join(", ")}).`,
          }
        : {
            label: "Song genre does not match the gig",
            color: "#EF4444",
            message: `The detected genre (${recognizedAudioGenres.join(", ")}) does not match the gig's requested genre (${requiredGenres.join(", ")}).`,
          }
    : screening;

  const openApplicantProfile = () => {
    if (!viewedProfileId) return;
    onClose();
    router.push({ pathname: "/profile", params: { userId: String(viewedProfileId) } });
  };

  const cvResult = (() => {
    const matched = cvEvidence.filter((item) => item?.result === "supported");
    const missing = cvEvidence.filter((item) => item?.result === "not_supported");
    const unclear = cvEvidence.filter((item) => !["supported", "not_supported"].includes(item?.result));
    const fitPercent = cvEvidence.length > 0 ? Math.round((matched.length / cvEvidence.length) * 100) : null;
    return { matched, missing, unclear, fitPercent };
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity testID="close-applicant-details" accessibilityLabel="Close applicant details" onPress={onClose} style={[styles.closeButton, { borderColor: colors.border }]}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>APPLICANT REVIEW</Text>
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.modalTitle, { color: colors.text }]}>{name}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.body, { color: colors.textSecondary }]}>Loading applicant details…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={30} color="#EF4444" />
            <Text style={[styles.body, { color: colors.textSecondary, textAlign: "center" }]}>{error}</Text>
            <TouchableOpacity onPress={onRetry} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
          <ScrollView
            key={`applicant-review-${application.id || "unknown"}-${visible ? "open" : "closed"}`}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.matchPanel, { backgroundColor: `${colors.primary}0D` }]}>
                <View style={styles.matchPanelHeader}>
                  <View style={styles.matchPanelLabelRow}>
                    <Ionicons name="sparkles" size={17} color={colors.primary} />
                    <Text style={[styles.matchPanelLabel, { color: colors.text }]}>AI Match Review</Text>
                  </View>
                  <Text style={[styles.matchPanelScore, { color: colors.primary }]}>
                    {matchPercentage === null ? "Match unavailable" : `${matchPercentage}% Match`}
                  </Text>
                </View>
                {matchPercentage !== null ? (
                  <View style={[styles.progressTrack, { backgroundColor: `${colors.primary}1A` }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: colors.primary, width: `${matchPercentage}%` },
                      ]}
                    />
                  </View>
                ) : null}
                {!recommendation ? (
                  <EmptyState colors={colors}>AI Match Review result unavailable. The applicant remains manually reviewable.</EmptyState>
                ) : (
                  <>
                    <Text style={[styles.matchSummary, { color: colors.textSecondary }]}>
                      {friendlyRecommendationSummary(recommendation, matchPercentage)}
                    </Text>
                    <Text style={[styles.label, { color: "#10B981" }]}>Requirements met</Text>
                    <BulletList values={list(recommendation.matched_criteria)} colors={colors} empty="No matched requirements were recorded." />
                    <Text style={[styles.label, { color: "#F59E0B" }]}>Missing or unclear requirements</Text>
                    <BulletList values={list(recommendation.missing_criteria)} colors={colors} empty="No missing requirements were recorded." />
                  </>
                )}
                <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Advisory only. All applicants remain accessible and require an organizer decision.</Text>
              </View>

              <View style={styles.heroProfileRow}>
                <ProfileAvatar
                  uri={avatar}
                  size={72}
                  backgroundColor={`${colors.primary}14`}
                  iconColor={colors.primary}
                />
                <View style={styles.heroIdentity}>
                  <View style={styles.nameRow}>
                    <Text numberOfLines={2} style={[styles.heroName, { color: colors.text }]}>{name}</Text>
                    {isVerified ? <Ionicons name="shield-checkmark" size={17} color="#10B981" /> : null}
                  </View>
                  <Text style={[styles.heroRole, { color: colors.primary }]}>{appliedRole}</Text>
                  <View style={styles.heroLocationRow}>
                    <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                    <Text numberOfLines={1} style={[styles.heroLocation, { color: colors.textSecondary }]}>
                      {shortLocation(fullLocation) || "Location not provided"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.quickStats, { borderTopColor: colors.border }]}>
                <View style={styles.quickStat}>
                  <Text style={[styles.quickStatValue, { color: colors.text }]}>{matchedCriteriaCount}</Text>
                  <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Requirements</Text>
                </View>
                <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.quickStat}>
                  <Text style={[styles.quickStatValue, { color: colors.text }]}>
                    {(application.cv_url ? 1 : 0) + (application.video_url ? 1 : 0) + portfolio.length}
                  </Text>
                  <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Files</Text>
                </View>
                <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.quickStat}>
                  <Text style={[styles.quickStatValue, { color: colors.text }]}>
                    {hasPriorApplicationCounts ? priorApplicationCounts.owner_gigs + 1 : "—"}
                  </Text>
                  <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Applications</Text>
                </View>
              </View>
            </View>

            <Section title="Applicant Overview" icon="person-outline" colors={colors}>
              <Subsection title="Profile Details" icon="person-outline" colors={colors}>
              <DetailRow icon="musical-notes-outline" label="Applied role or slot" value={appliedRole} colors={colors} />
              <DetailRow
                icon={isVerified ? "shield-checkmark-outline" : "shield-outline"}
                label="Verification"
                value={isVerified ? "Verified profile" : "Not verified"}
                colors={colors}
              />
              {viewedProfileId ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`View ${name}'s profile`}
                  onPress={openApplicantProfile}
                  style={[styles.outlineButton, { borderColor: colors.primary }]}
                >
                  <Ionicons name="person-outline" size={17} color={colors.primary} />
                  <Text style={[styles.outlineButtonText, { color: colors.primary }]}>View Profile</Text>
                </TouchableOpacity>
              ) : null}
              {application.production_team?.name ? (
                <DetailRow icon="people-outline" label="Production team" value={application.production_team.name} colors={colors} />
              ) : null}
              {group?.group_type ? (
                <DetailRow icon="people-circle-outline" label="Group type" value={titleCase(group.group_type)} colors={colors} />
              ) : null}
              {group?.rate !== null && group?.rate !== undefined ? (
                <DetailRow icon="cash-outline" label="Listed rate" value={`₱${Number(group.rate).toLocaleString()}`} colors={colors} />
              ) : null}
              <Text style={[styles.label, { color: colors.text }]}>About</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {group?.description || profile.bio || "No bio or group description was provided."}
              </Text>
              <Text style={[styles.label, { color: colors.text }]}>Instruments and skills</Text>
              <TagList values={instruments} colors={colors} empty="No instruments or skills were provided." />
              <Text style={[styles.label, { color: colors.text }]}>Genres</Text>
              <TagList values={genres} colors={colors} empty="No genres were provided." />
              {groupMemberDetails.length > 0 ? (
                <>
                  <Text style={[styles.label, { color: colors.text }]}>Group members</Text>
                  <BulletList
                    values={groupMemberDetails.map((member, index) =>
                      typeof member === "string"
                        ? member
                        : member?.name || member?.display_name || `Member ${index + 1}`,
                    )}
                    colors={colors}
                    empty="No group members were provided."
                  />
                </>
              ) : null}
              </Subsection>

              <Subsection title="Application Details" icon="information-circle-outline" colors={colors}>
              <DetailRow
                icon="calendar-outline"
                label="Submitted"
                value={application.created_at ? new Date(application.created_at).toLocaleString() : "Date unavailable"}
                colors={colors}
              />
              <DetailRow icon="flag-outline" label="Status" value={applicationStatus} colors={colors} />
              {application.submitter?.full_name ? (
                <DetailRow icon="person-add-outline" label="Submitted by" value={application.submitter.full_name} colors={colors} />
              ) : null}
              <Text style={[styles.label, { color: colors.text }]}>Application message</Text>
              <View style={[styles.messageCard, { backgroundColor: colors.inputBackground }]}>
                <Text style={[styles.body, { color: colors.text }]}>
                  {application.pitch_message || "No application message was supplied."}
                </Text>
              </View>
              </Subsection>
            </Section>

            <Section title="Qualification Review" icon="checkmark-done-outline" colors={colors}>
              <Subsection title="CV Check" icon="document-text-outline" colors={colors}>
              {!application.cv_url ? (
                <EmptyState colors={colors}>No CV was uploaded.</EmptyState>
              ) : (
                <>
                  {application.ai_portfolio_review_consent !== true ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Manual review needed" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>The applicant did not authorize optional AI file review. Review the CV manually.</Text>
                    </View>
                  ) : !aiReview ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Manual review needed" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{"The CV couldn't be reviewed automatically."}</Text>
                    </View>
                  ) : ["queued", "processing"].includes(String(aiReview.status)) ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="time-outline" label="Check in progress" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>The CV is still being checked.</Text>
                    </View>
                  ) : cvDocumentStatus === "not_a_cv" ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Manual review needed" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{"The file couldn't be reviewed as a CV."}</Text>
                      <ReviewDetails colors={colors}>
                        <Text style={[styles.body, { color: colors.textSecondary }]}>{cvDocumentClassification?.summary || "The uploaded file did not contain enough CV or resume content."}</Text>
                      </ReviewDetails>
                    </View>
                  ) : cvDocumentStatus === "uncertain" ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Manual review needed" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{"The file type couldn't be confirmed. Review the CV manually."}</Text>
                      <ReviewDetails colors={colors}>
                        <Text style={[styles.body, { color: colors.textSecondary }]}>{cvDocumentClassification?.summary || "The file could not be confidently identified as a CV."}</Text>
                      </ReviewDetails>
                    </View>
                  ) : cvDocumentStatus === "not_run" || ["failed", "consent_revoked"].includes(String(aiReview.status)) || cvEvidence.length === 0 ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Manual review needed" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{"The CV couldn't be reviewed automatically."}</Text>
                      {cvDocumentClassification?.summary ? (
                        <ReviewDetails colors={colors}>
                          <Text style={[styles.body, { color: colors.textSecondary }]}>{cvDocumentClassification.summary}</Text>
                        </ReviewDetails>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="checkmark-circle-outline" label="CV check complete" color="#10B981" />
                      {cvTextExtracted ? (
                        <Text style={[styles.body, { color: colors.textSecondary }]}>The text in the uploaded {cvExtractionMethod === "pdf_text" ? "PDF" : cvExtractionMethod === "docx_text" || cvExtractionMethod === "doc_text" ? "Word document" : "document"} was read successfully.</Text>
                      ) : null}
                       <Text style={[styles.body, { color: colors.textSecondary }]}>CV match: {cvResult.fitPercent}% ({cvResult.matched.length} of {cvEvidence.length} requirements confirmed)</Text>
                       <ReviewDetails colors={colors}>
                         <Text style={[styles.label, { color: "#10B981" }]}>Confirmed from the CV</Text>
                         <BulletList values={cvResult.matched.map((item) => criterionLabel(item.criterion))} colors={colors} empty="Nothing was confirmed from the CV." />
                         <Text style={[styles.label, { color: "#EF4444" }]}>Not found in the CV</Text>
                         <BulletList values={cvResult.missing.map((item) => criterionLabel(item.criterion))} colors={colors} empty="No required items were clearly missing." />
                         <Text style={[styles.label, { color: "#F59E0B" }]}>Could not confirm from the CV</Text>
                         <BulletList values={cvResult.unclear.map((item) => criterionLabel(item.criterion))} colors={colors} empty="No items were left unclear." />
                        {cvEvidence.flatMap((item) => list(item.evidence)).slice(0, 4).map((entry, index) => (
                          <Text key={index} style={[styles.body, { color: colors.textSecondary }]}>{entry?.observation || "Evidence unavailable"}</Text>
                        ))}
                      </ReviewDetails>
                    </View>
                  )}
                  {application.ai_portfolio_review_consent === true &&
                  cvDocumentStatus === "cv" &&
                  !["queued", "processing", "failed", "consent_revoked"].includes(String(aiReview?.status)) ? (
                    <View style={styles.stackMedium}>
                      <StatusRow
                        icon={cvNameCheckStatus === "match" ? "checkmark-circle-outline" : cvNameCheckStatus === "mismatch" ? "alert-circle-outline" : "warning-outline"}
                        label={cvNameCheckStatus === "match" ? "Name matches" : cvNameCheckStatus === "mismatch" ? "Name does not match" : "Name not confirmed"}
                        color={cvNameCheckStatus === "match" ? "#10B981" : cvNameCheckStatus === "mismatch" ? "#EF4444" : "#F59E0B"}
                      />
                       <Text style={[styles.body, { color: colors.textSecondary }]}>
                         {cvNameCheck?.summary || "We couldn't confirm the name on the CV. Verify it manually."}
                       </Text>
                       {cvNameCheck?.extracted_name ? (
                         <ReviewDetails colors={colors}>
                           <Text style={[styles.body, { color: colors.textSecondary }]}>Name read from CV: {cvNameCheck.extracted_name}</Text>
                           <Text style={[styles.body, { color: colors.textSecondary }]}>Applicant name: {name}</Text>
                         </ReviewDetails>
                       ) : null}
                    </View>
                  ) : null}
                  <TouchableOpacity onPress={() => onOpenMedia(application.cv_url, "Applicant CV")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                    <Ionicons name="open-outline" size={17} color={colors.primary} />
                    <Text style={[styles.outlineButtonText, { color: colors.primary }]}>View CV</Text>
                  </TouchableOpacity>
                  <Text style={[styles.advisory, { color: colors.textSecondary }]}>Advisory only · Review before deciding</Text>
                </>
              )}
              </Subsection>

              <Subsection title="Performance Video" icon="videocam-outline" colors={colors}>
              {application.video_url ? (
                <TouchableOpacity onPress={() => onOpenMedia(application.video_url, "Performance Video")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                  <Ionicons name="play-outline" size={18} color={colors.primary} />
                  <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Watch performance</Text>
                </TouchableOpacity>
              ) : <EmptyState colors={colors}>No performance video was uploaded.</EmptyState>}
              </Subsection>

              <View style={[styles.reviewDivider, { backgroundColor: colors.border }]} />

              <Subsection title="Profile & Video Check" icon="person-circle-outline" colors={colors}>
              {!application.ai_portfolio_review_consent ? (
                <View style={styles.stackMedium}>
                  <StatusRow icon="information-circle-outline" label="Not checked" color={colors.textSecondary} />
                  <Text style={[styles.body, { color: colors.textSecondary }]}>The applicant did not authorize this optional check.</Text>
                </View>
              ) : groupFaceSimilarity.length > 0 ? (
                <View style={styles.stackMedium}>
                  {groupFaceSimilarity.map((member, index) => (
                    <View key={member?.profile_id || index} style={[styles.memberSignal, { borderColor: colors.border }]}>
                      <Text style={[styles.label, { color: colors.text }]}>{member?.display_name || `Group member ${index + 1}`}</Text>
                      <StatusRow
                        icon={faceMatchIcon(effectiveFaceMatchStatus(member))}
                        label={faceMatchLabel(effectiveFaceMatchStatus(member))}
                        color={faceMatchColor(effectiveFaceMatchStatus(member), colors.textSecondary)}
                      />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{faceMatchSummary(member)}</Text>
                      {Math.max(0, Number(member?.usable_frames ?? member?.frames_compared) || 0) === 1 ? (
                        <Text style={[styles.manualPrompt, { color: colors.text }]}>{faceMatchDetails(member)}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : ["queued", "processing"].includes(aiReviewStatus) ? (
                <View style={styles.stackMedium}>
                  <StatusRow icon="time-outline" label="Check in progress" color="#F59E0B" />
                  <Text style={[styles.body, { color: colors.textSecondary }]}>Profile and video comparison is still processing.</Text>
                </View>
              ) : !faceSimilarity?.status || faceSimilarity.status === "not_run" ? (
                <View style={styles.stackMedium}>
                  <StatusRow icon="warning-outline" label="Manual review needed" color="#F59E0B" />
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{unavailableFaceMatchMessage(faceSimilarity)}</Text>
                </View>
              ) : (
                <View style={styles.stackMedium}>
                  <StatusRow
                    icon={faceMatchIcon(effectiveFaceMatchStatus(faceSimilarity))}
                    label={faceMatchLabel(effectiveFaceMatchStatus(faceSimilarity))}
                    color={faceMatchColor(effectiveFaceMatchStatus(faceSimilarity), colors.textSecondary)}
                  />
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{faceMatchSummary(faceSimilarity)}</Text>
                  {Math.max(0, Number(faceSimilarity?.usable_frames ?? faceSimilarity?.frames_compared) || 0) === 1 ? (
                    <Text style={[styles.manualPrompt, { color: colors.text }]}>{faceMatchDetails(faceSimilarity)}</Text>
                  ) : null}
                </View>
              )}
              </Subsection>

              <View style={[styles.reviewDivider, { backgroundColor: colors.border }]} />

              <Subsection title="Song & Genre Check" icon="radio-outline" colors={colors}>
              <StatusRow
                icon={audioGenreStatus.color === "#10B981" ? "checkmark-circle-outline" : audioGenreStatus.color === "#EF4444" ? "alert-circle-outline" : "warning-outline"}
                label={audioGenreStatus.label}
                color={audioGenreStatus.color}
              />
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {audioGenreStatus.message}
              </Text>
              <Text style={[styles.manualPrompt, { color: colors.text }]}>Review the performance video if needed.</Text>
              {application.video_copyright_metadata?.copyright_title ||
              application.video_copyright_metadata?.internal_match_playlist_title ||
              recognizedAudioGenres.length > 0 ? (
                <ReviewDetails colors={colors}>
                  {application.video_copyright_metadata?.copyright_title ? <Text style={[styles.body, { color: colors.textSecondary }]}>Song found: {application.video_copyright_metadata.copyright_title}{application.video_copyright_metadata.copyright_artist_label ? ` by ${application.video_copyright_metadata.copyright_artist_label}` : ""}</Text> : null}
                  {recognizedAudioGenres.length > 0 ? <Text style={[styles.body, { color: colors.textSecondary }]}>Song genres: {recognizedAudioGenres.join(", ")}</Text> : null}
                  {requiredGenres.length > 0 ? <Text style={[styles.body, { color: colors.textSecondary }]}>Gig genres: {requiredGenres.join(", ")}</Text> : null}
                  {application.video_copyright_metadata?.internal_match_playlist_title ? <Text style={[styles.body, { color: colors.textSecondary }]}>Possible song: {application.video_copyright_metadata.internal_match_playlist_title}{application.video_copyright_metadata.internal_match_playlist_artist ? ` by ${application.video_copyright_metadata.internal_match_playlist_artist}` : ""}</Text> : null}
                </ReviewDetails>
              ) : null}
              </Subsection>

            </Section>

            <Section title="Application History" icon="time-outline" colors={colors}>
              {hasPriorApplicationCounts ? (
                <View
                  testID="prior-application-counts"
                  style={[styles.historySummary, { backgroundColor: colors.inputBackground }]}
                >
                  <Text style={[styles.label, { color: colors.text }]}>
                    Applied {priorApplicationCounts.owner_gigs + 1}{" "}
                    {priorApplicationCounts.owner_gigs === 0 ? "time" : "times"} to your gigs
                  </Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>
                    Total applications to this gig: {priorApplicationCounts.this_gig + 1}
                  </Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>
                    Earlier applications before this one: {priorApplicationCounts.owner_gigs}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.body, { color: colors.textSecondary }]}>• Application submitted {application.created_at ? new Date(application.created_at).toLocaleString() : "date unavailable"}</Text>
              {application.updated_at ? <Text style={[styles.body, { color: colors.textSecondary }]}>• Last updated {new Date(application.updated_at).toLocaleString()}</Text> : null}
              <Text style={[styles.body, { color: colors.textSecondary }]}>• Current status: {titleCase(application.status || "pending")}</Text>
            </Section>

          </ScrollView>
          {readOnly ? (
            <View style={[styles.actionFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={[styles.readOnlyNotice, { backgroundColor: colors.inputBackground }]}>
                <Ionicons name="eye-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.readOnlyText, { color: colors.textSecondary }]}>View-only applicant review</Text>
              </View>
            </View>
          ) : isPending ? (
            <View style={[styles.actionFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TouchableOpacity
                testID="decline-applicant-details"
                accessibilityRole="button"
                onPress={() => onDecline(application.id)}
                style={[styles.footerSecondaryButton, { borderColor: "#FCA5A5" }]}
              >
                <Text style={[styles.actionButtonText, { color: "#EF4444" }]}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="accept-applicant-details"
                accessibilityRole="button"
                onPress={() => onAccept(application.id)}
                style={[styles.footerPrimaryButton, { backgroundColor: "#10B981" }]}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={[styles.actionButtonText, { color: "#FFF" }]}>Accept Applicant</Text>
              </TouchableOpacity>
            </View>
          ) : isActiveApplication(application.status) && onFire ? (
            <View style={[styles.actionFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TouchableOpacity
                testID="fire-applicant-details"
                accessibilityRole="button"
                onPress={() => onFire(application.id)}
                style={[styles.footerDangerButton, { borderColor: "#EF4444" }]}
              >
                <Text style={[styles.actionButtonText, { color: "#EF4444" }]}>End Contract</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  closeButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  eyebrow: { fontFamily: "Poppins_600SemiBold", fontSize: 9, lineHeight: 13, letterSpacing: 1.25 },
  modalTitle: { flexShrink: 1, fontFamily: "Poppins_700Bold", fontSize: 15, lineHeight: 20 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 12 },
  centerState: { flex: 1, padding: 32, alignItems: "center", justifyContent: "center", gap: 14 },
  heroCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 },
  heroProfileRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  heroIdentity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroName: { flexShrink: 1, fontFamily: "Poppins_700Bold", fontSize: 18, lineHeight: 24 },
  heroRole: { marginTop: 2, fontFamily: "Poppins_600SemiBold", fontSize: 12, lineHeight: 17 },
  heroLocationRow: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 4 },
  heroLocation: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 15 },
  matchPanel: { borderRadius: 14, padding: 12, gap: 8 },
  matchPanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  matchPanelLabelRow: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  matchPanelLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12, lineHeight: 17 },
  matchPanelScore: { fontFamily: "Poppins_700Bold", fontSize: 14, lineHeight: 19 },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  matchSummary: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15 },
  quickStats: { borderTopWidth: 1, paddingTop: 13, flexDirection: "row", alignItems: "center" },
  quickStat: { flex: 1, alignItems: "center" },
  quickStatValue: { fontFamily: "Poppins_700Bold", fontSize: 16, lineHeight: 21 },
  quickStatLabel: { marginTop: 1, fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 13 },
  quickStatDivider: { width: 1, height: 28 },
  section: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  sectionHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 13, lineHeight: 18 },
  sectionBody: { borderTopWidth: 1, padding: 14, gap: 10 },
  subsection: { gap: 10 },
  subsectionHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 8 },
  subsectionTitle: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 12, lineHeight: 17 },
  subsectionBody: { gap: 10 },
  reviewDivider: { height: 1, marginVertical: 4 },
  flexOne: { flex: 1 },
  body: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 19 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 12, marginTop: 4 },
  disclaimer: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 16, marginTop: 5 },
  advisory: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15 },
  manualPrompt: { fontFamily: "Poppins_600SemiBold", fontSize: 11, lineHeight: 17 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusRowText: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 12, lineHeight: 18 },
  reviewDetails: { alignItems: "flex-start" },
  reviewDetailsButton: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 4 },
  reviewDetailsButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, lineHeight: 15 },
  reviewDetailsBody: { width: "100%", borderLeftWidth: 2, paddingLeft: 10, gap: 7 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  detailLabel: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 13 },
  detailValue: { marginTop: 1, fontFamily: "Poppins_500Medium", fontSize: 12, lineHeight: 17 },
  messageCard: { borderRadius: 11, padding: 12 },
  tagList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontFamily: "Poppins_500Medium", fontSize: 10, lineHeight: 14 },
  stackSmall: { gap: 6 },
  stackMedium: { gap: 7 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1 },
  memberSignal: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 3 },
  historySummary: { borderRadius: 11, padding: 12, gap: 3, marginBottom: 3 },
  outlineButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  outlineButtonText: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  primaryButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#FFF", fontFamily: "Poppins_600SemiBold" },
  actionFooter: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, flexDirection: "row", gap: 10 },
  footerSecondaryButton: { flex: 0.8, minHeight: 48, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footerPrimaryButton: { flex: 1.2, minHeight: 48, borderRadius: 999, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  footerDangerButton: { flex: 1, minHeight: 48, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  readOnlyNotice: { flex: 1, minHeight: 46, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  readOnlyText: { fontFamily: "Poppins_500Medium", fontSize: 12 },
});
