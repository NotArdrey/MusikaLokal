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
  onRetry: (options?: { silent?: boolean }) => void;
  onOpenMedia: (url: string, title: string) => void;
  onAccept: (applicationId: string) => void;
  onDecline: (applicationId: string) => void;
  onFire?: (applicationId: string) => void;
};

const titleCase = (value: unknown) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const profileVerificationMeta = (member: any) => {
  const issueCode = String(member?.profile_issue_code || "");
  if (issueCode === "matches_another_member") {
    return { label: "Mismatch - profile matches another registered member", color: "#DC2626" };
  }
  if (issueCode === "different_video_person") {
    return { label: "Mismatch - profile and ID match different people", color: "#DC2626" };
  }
  if (issueCode === "identity_not_confirmed") {
    return { label: "Could not correlate - ID person not confirmed", color: "#D97706" };
  }
  if (issueCode === "not_found_in_video") {
    return { label: "Profile photo not found in video", color: "#D97706" };
  }
  if (member?.profile_status === "verified") return { label: "Matched to the same person as the ID", color: "#059669" };
  if (member?.profile_status === "no_reference") return { label: "Profile photo unavailable", color: "#D97706" };
  if (member?.profile_status === "reference_unusable") return { label: "Profile photo unusable", color: "#D97706" };
  return { label: "Not confirmed", color: "#D97706" };
};

const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const criterionLabel = (value: unknown) => {
  const labels: Record<string, string> = {
    instrument_requirement: "Role & instruments",
    genre_requirement: "Music genres",
    location_requirement: "Performance location",
    portfolio_requirement: "Submitted performance evidence",
    performance_experience: "Performance experience",
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
  if (status === "needs_review") {
    return "The gig-fit score is unchanged, but an important document issue must be verified before deciding.";
  }
  if (status === "insufficient_data") {
    return "There is not enough configured information to calculate a reliable match. Review the application manually.";
  }
  return recommendation?.explanation || "Review the application details below before deciding.";
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
  if (status === "not_required") return { label: "Song or genre couldn't be confirmed", color: "#F59E0B", message: "We couldn't confirm the song or genre automatically." };
  if (status === "pending_review") return { label: "Song may have been recognized", color: "#F59E0B", message: "The possible song match still needs to be checked." };
  if (status === "approved") return { label: "Song match checked", color: "#10B981", message: "The possible song match and permission details were checked." };
  if (status === "declined") return { label: "Permission concern found", color: "#EF4444", message: "The possible song match was checked and the permission claim was not accepted." };
  if (status === "pending" || status === "processing") return { label: "Still checking", color: "#F59E0B", message: "The sound in the video is still being checked." };
  if (status === "unavailable") return { label: "Song or genre couldn't be confirmed", color: "#F59E0B", message: "We couldn't confirm the song or genre automatically." };
  if (status === "failed") return { label: "Song or genre couldn't be confirmed", color: "#F59E0B", message: "We couldn't confirm the song or genre automatically." };
  return { label: "Audio not checked yet", color: "#6B7280", message: "The sound in this video has not been checked yet." };
};

const evidenceSourceLabel = (value: unknown) => {
  const labels: Record<string, string> = {
    cv: "CV",
    video_transcript: "Performance video transcript",
    video_frame: "Performance video",
    profile: "Profile",
    group_roster: "Group roster",
    recognized_audio: "Song and genre check",
    portfolio_image: "Portfolio image",
    portfolio_document: "Portfolio document",
    stored_coordinates: "Stored map location",
    performance_video: "Submitted performance video",
    application_evidence: "Submitted application evidence",
  };
  return labels[String(value || "")] || "Application";
};

type ReviewTone = "confirmed" | "review" | "failed" | "neutral";

const toneMeta = (tone: ReviewTone) => {
  if (tone === "confirmed") return { color: "#059669", soft: "#ECFDF5", icon: "checkmark-circle" as const };
  if (tone === "failed") return { color: "#DC2626", soft: "#FEF2F2", icon: "close-circle" as const };
  if (tone === "review") return { color: "#D97706", soft: "#FFFBEB", icon: "warning" as const };
  return { color: "#7C3AED", soft: "#F5F3FF", icon: "information-circle" as const };
};

function SummaryMetric({ value, label, tone }: { value: number; label: string; tone: ReviewTone }) {
  const meta = toneMeta(tone);
  return (
    <View style={[styles.summaryMetric, { backgroundColor: meta.soft }]}>
      <Text style={[styles.summaryMetricValue, { color: meta.color }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.summaryMetricLabel, { color: meta.color }]}>{label}</Text>
    </View>
  );
}

function AttentionItem({
  title,
  detail,
  tone,
  children,
}: {
  title: string;
  detail: string;
  tone: ReviewTone;
  children?: React.ReactNode;
}) {
  const meta = toneMeta(tone);
  return (
    <View style={[styles.attentionItem, { borderLeftColor: meta.color, backgroundColor: meta.soft }]}>
      <View style={styles.attentionHeading}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
        <Text style={[styles.attentionTitle, { color: meta.color }]}>{title}</Text>
      </View>
      <Text style={styles.attentionDetail}>{detail}</Text>
      {children}
    </View>
  );
}

function ReviewGroup({
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
    <View style={[styles.reviewGroup, { borderTopColor: colors.border }]}>
      <View style={styles.reviewGroupHeader}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={[styles.reviewGroupTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={styles.reviewGroupBody}>{children}</View>
    </View>
  );
}

function ConfirmedRequirements({ rows, colors }: { rows: any[]; colors: Colors }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.confirmedGroup, { borderColor: "#A7F3D0", backgroundColor: "#F0FDF4" }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.confirmedGroupHeader}
      >
        <Ionicons name="checkmark-circle" size={19} color="#059669" />
        <Text style={styles.confirmedGroupTitle}>{rows.length} {rows.length === 1 ? "requirement" : "requirements"} confirmed</Text>
        <Text style={[styles.confirmedGroupAction, { color: colors.primary }]}>{open ? "Hide" : "Show"}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
      </TouchableOpacity>
      {open ? (
        <View style={[styles.confirmedGroupBody, { borderTopColor: "#A7F3D0" }]}>
          {rows.map((row, index) => (
            <RequirementRow key={`${row.key || row.label}-${index}`} row={row} colors={colors} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RequirementRow({ row, colors }: { row: any; colors: Colors }) {
  const [open, setOpen] = useState(false);
  const meta = toneMeta(row.tone);
  return (
    <View style={[styles.requirementRow, { borderColor: colors.border }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.requirementRowButton}
      >
        <Ionicons name={meta.icon} size={19} color={meta.color} />
        <View style={styles.requirementCopy}>
          <Text style={[styles.requirementTitle, { color: colors.text }]}>{row.label}</Text>
          <Text style={[styles.requirementStatus, { color: meta.color }]}>{row.statusLabel}</Text>
          <Text numberOfLines={open ? undefined : 2} style={[styles.requirementDetail, { color: colors.textSecondary }]}>{row.detail}</Text>
        </View>
        <View style={styles.evidenceAction}>
          <Text style={[styles.evidenceActionText, { color: colors.primary }]}>{open ? "Hide" : "View evidence"}</Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.primary} />
        </View>
      </TouchableOpacity>
      {open ? (
        <View style={[styles.requirementEvidence, { borderTopColor: colors.border, backgroundColor: colors.inputBackground }]}>
          <Text style={[styles.evidenceLabel, { color: colors.textSecondary }]}>EVIDENCE SOURCE</Text>
          <Text style={[styles.evidenceValue, { color: colors.text }]}>{row.sourceLabel}</Text>
          {row.evidenceEntries.length > 0 ? row.evidenceEntries.map((entry: any, index: number) => (
            <View key={`${entry?.source || "evidence"}-${index}`} style={styles.evidenceEntry}>
              <Text style={[styles.evidenceLabel, { color: colors.textSecondary }]}>RELEVANT EXTRACT</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{entry?.observation || row.detail}</Text>
            </View>
          )) : null}
          <Text style={[styles.evidenceLabel, { color: colors.textSecondary }]}>REVIEW ANALYSIS</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{row.analysis}</Text>
        </View>
      ) : null}
    </View>
  );
}

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

function EvidenceFinding({ item, colors, sourceContext }: { item: any; colors: Colors; sourceContext?: "cv" | "video" | "application" }) {
  const recordedResult = String(item?.result || "unclear").toLowerCase();
  const videoSources = ["performance_video", "video_transcript", "video_frame", "recognized_audio"];
  const hasVideoContradiction = list(item?.evidence).some((entry) =>
    videoSources.includes(String(entry?.source || "")) &&
    /\b(did not|does not|not demonstrated|no evidence|could not confirm|couldn't confirm)\b/i.test(String(entry?.observation || "")),
  );
  const result = sourceContext === "video" && recordedResult === "supported" && !videoSources.includes(String(item?.source || ""))
    ? hasVideoContradiction ? "not_supported" : "unclear"
    : recordedResult;
  const status = result === "supported"
    ? { label: sourceContext === "cv" ? "Confirmed from CV" : sourceContext === "video" ? "Confirmed from video" : "Confirmed", color: "#10B981", icon: "checkmark-circle-outline" as const }
    : result === "not_supported"
      ? { label: sourceContext === "video" ? "Not demonstrated in video" : "Requirement not met", color: "#EF4444", icon: "alert-circle-outline" as const }
      : { label: sourceContext === "cv" ? "Couldn't confirm from CV" : "Couldn't confirm", color: "#F59E0B", icon: "warning-outline" as const };
  const entries = list(item?.evidence);
  const reason = String(item?.short_reason || "").trim() || (
    result === "supported"
      ? "The reviewed source contains evidence for this item."
      : result === "not_supported"
        ? sourceContext === "video"
          ? "The submitted video did not demonstrate this requirement."
          : "The reviewed source contains evidence that does not satisfy this item."
        : "The reviewed source did not provide enough information to confirm this item."
  );

  return (
    <View style={[styles.findingCard, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
      <Text style={[styles.findingTitle, { color: colors.text }]}>{criterionLabel(item?.criterion)}</Text>
      <StatusRow icon={status.icon} label={status.label} color={status.color} />
      <Text style={[styles.body, { color: colors.textSecondary }]}>{reason}</Text>
      {entries.length > 0 ? (
        <ReviewDetails colors={colors}>
          {entries.slice(0, 4).map((entry, index) => (
            <View key={`${entry?.source || "source"}-${index}`} style={styles.stackSmall}>
              <Text style={[styles.evidenceSource, { color: colors.text }]}>
                Source: {evidenceSourceLabel(entry?.source || item?.source)}
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{entry?.observation}</Text>
            </View>
          ))}
        </ReviewDetails>
      ) : null}
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
          {open ? "Hide evidence" : "View evidence"}
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
  const memberVerification = application.member_verification || null;
  const usesVerifiedIdPortrait = ["verified_id_portrait", "verified_id_and_profile_photo"].includes(String(memberVerification?.reference_source || ""));
  const usesDualReference = memberVerification?.reference_source === "verified_id_and_profile_photo";
  const memberVerificationMembers = list(memberVerification?.members);
  const aiReviewStatus = String(aiReview?.status || "").toLowerCase();
  const retryRef = useRef(onRetry);
  const refreshAttemptsRef = useRef(0);
  const refreshingApplicationIdRef = useRef<string | null>(null);
  const [showAcceptConfirmation, setShowAcceptConfirmation] = useState(false);

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
      retryRef.current({ silent: true });
    }, 3500);
    return () => clearTimeout(refreshTimer);
  }, [aiReviewStatus, application.id, loading, visible]);

  const evidence = list(aiReview?.evidence);
  const storedCvReview = list(aiReview?.source_summary?.cv_requirement_review);
  const cvDocumentClassification = aiReview?.source_summary?.cv_document_classification || null;
  const cvDocumentStatus = String(cvDocumentClassification?.status || "").toLowerCase();
  const cvProcessingStatus = String(aiReview?.source_summary?.cv_processing_status || "").toLowerCase();
  const videoProcessingStatus = String(aiReview?.source_summary?.video_processing_status || (application.video_url ? "" : "no_media")).toLowerCase();
  const cvTextExtracted = aiReview?.source_summary?.cv_text_extracted === true;
  const cvExtractionLimitation = String(aiReview?.source_summary?.cv_extraction_limitation || "");
  const cvNameCheck = aiReview?.source_summary?.cv_name_check || null;
  const cvNameCheckStatus = String(cvNameCheck?.status || "not_run").toLowerCase();
  const cvEvidence = (storedCvReview.length ? storedCvReview : evidence)
    .filter((item) => String(item?.criterion || "") !== "portfolio_requirement")
    .map((item) => ({
      ...item,
      source: "cv",
      evidence: list(item?.evidence).filter((entry) => entry?.source === "cv"),
    }))
    .filter((item) => storedCvReview.length > 0 || item.evidence.length > 0);
  const videoEvidence = evidence
    .map((item) => ({
      ...item,
      evidence: list(item?.evidence).filter((entry) =>
        ["performance_video", "video_transcript", "video_frame", "recognized_audio"].includes(String(entry?.source || "")),
      ),
    }))
    .filter((item) => item.evidence.length > 0);
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
  const memberCvs = Array.isArray(application.member_cvs) ? application.member_cvs : [];
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
  const memberRequirementCoverage = recommendation?.criteria_snapshot?.member_requirement_coverage || null;
  const memberCoverageItems = list(memberRequirementCoverage?.members);
  const requirementResults = list(recommendation?.criteria_snapshot?.requirement_results);
  const metRequirementResults = requirementResults.filter((item) => item?.status === "met");
  const notMetRequirementResults = requirementResults.filter((item) => item?.status === "not_met");
  const unclearRequirementResults = requirementResults.filter((item) => item?.status === "unclear");
  const recommendationSettings = recommendation?.criteria_snapshot?.settings || {};
  const recommendationCriteria = recommendationSettings?.criteria || {};
  const recommendationRequirements = recommendation?.criteria_snapshot?.requirements || {};
  const matchedCriteria = list(recommendation?.matched_criteria).map(String);
  const requiredCriteriaChecks = [
    {
      required: recommendationCriteria.instruments === "required" &&
        (Number(memberRequirementCoverage?.total_count || 0) > 0 || list(recommendationRequirements?.instruments).length > 0),
      confirmed: Number(memberRequirementCoverage?.total_count || 0) > 0
        ? Number(memberRequirementCoverage?.matched_count || 0) === Number(memberRequirementCoverage?.total_count || 0)
        : matchedCriteria.includes("Instrument or role fit"),
    },
    {
      required: recommendationCriteria.genres === "required" && list(recommendationRequirements?.genres).length > 0,
      confirmed: matchedCriteria.includes("Genre fit"),
    },
    {
      required: recommendationCriteria.location === "required" && recommendationSettings?.location_radius_km != null,
      confirmed: matchedCriteria.some((item) => item.startsWith("Within ")),
    },
    {
      required: recommendationCriteria.portfolio === "required",
      confirmed: matchedCriteria.includes("Submitted performance evidence fits the gig"),
    },
  ].filter((item) => item.required);
  const confirmedRequiredCriteria = requiredCriteriaChecks.filter((item) => item.confirmed).length;
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

  const criterionByRequirementKey: Record<string, string[]> = {
    instruments: ["instrument_requirement"],
    genres: ["genre_requirement"],
    location: ["location_requirement"],
    portfolio: ["portfolio_requirement", "performance_experience"],
  };
  const requirementLabels: Record<string, string> = {
    instruments: "Role & instruments",
    genres: "Music genre",
    location: "Location",
    portfolio: "Performance evidence",
  };
  const requirementReviewRows = requirementResults.map((item: any) => {
    const key = String(item?.key || item?.criterion || "requirement");
    const expectedCriteria = criterionByRequirementKey[key] || [String(item?.criterion || "")];
    const evidenceItem = evidence.find((candidate) => expectedCriteria.includes(String(candidate?.criterion || "")));
    const evidenceEntries = list(evidenceItem?.evidence).slice(0, 4);
    const sourceKeys = Array.from(new Set([
      String(item?.source || ""),
      ...evidenceEntries.map((entry) => String(entry?.source || "")),
    ].filter(Boolean)));
    const confirmationSource = String(item?.source || evidenceItem?.source || "");
    const hasCvSource = confirmationSource === "cv";
    const hasVideoSource = ["performance_video", "video_transcript", "video_frame", "recognized_audio"].includes(confirmationSource);
    const sourceLabel = sourceKeys.map(evidenceSourceLabel).join(" + ") || "Application";
    const status = String(item?.status || "unclear");
    const tone: ReviewTone = status === "met" ? "confirmed" : status === "not_met" ? "failed" : "review";
    const statusLabel = status === "met"
      ? hasCvSource
          ? "Confirmed from CV"
          : hasVideoSource
            ? "Confirmed from video"
            : `Confirmed from ${sourceLabel}`
      : status === "not_met" && key === "portfolio" && hasVideoSource
        ? "Not demonstrated in video"
        : status === "not_met"
          ? "Requirement not met"
          : "Couldn't confirm — manual review needed";
    return {
      key,
      label: requirementLabels[key] || item?.label || criterionLabel(item?.criterion),
      tone,
      statusLabel,
      detail: String(item?.detail || evidenceItem?.short_reason || "Review the available evidence before deciding."),
      sourceLabel,
      evidenceEntries,
      analysis: String(evidenceItem?.short_reason || item?.detail || "No additional automated analysis was recorded."),
    };
  });
  const confirmedRequirementRows = requirementReviewRows.filter((item) => item.tone === "confirmed");
  const visibleRequirementRows = requirementReviewRows.filter((item) => item.tone !== "confirmed");
  const accountVerificationLabel = isVerified ? "Account verified" : "Account not verified";
  const memberVerificationStatus = String(memberVerification?.status || "").toLowerCase();
  const memberIdentityVerified = memberVerification?.result === "verified";
  const memberIdentityInProgress = ["queued", "processing"].includes(memberVerificationStatus);
  const memberIdentityLabel = memberIdentityVerified
    ? "Performance identity confirmed"
    : memberIdentityInProgress
      ? "Performance identity in progress"
      : memberVerification
        ? "Performance identity not confirmed"
        : "Performance identity not checked";
  const memberIdentityDetail = memberVerification
    ? usesVerifiedIdPortrait
      ? `${Number(memberVerification.verified_member_count || 0)} of ${Number(memberVerification.expected_member_count || 0)} registered members were confidently matched in the submitted performance video using approved government-ID holder portraits.${usesDualReference ? " Registered profile photos were also compared as a separate advisory check and are shown without cropping." : ""} Full ID documents are not shown; only the private ID-holder face crop may be viewed.`
      : `${Number(memberVerification.verified_member_count || 0)} of ${Number(memberVerification.expected_member_count || 0)} registered members were confidently matched in this historical check using registered profile photos. New checks use approved government-ID holder portraits.`
    : "No registered-member verification result is available for this application.";
  const cvIdentityMismatch = cvNameCheckStatus === "mismatch";
  const cvIdentityDetail = cvIdentityMismatch && cvNameCheck?.extracted_name
    ? `Major verification issue. The CV lists ${cvNameCheck.extracted_name}, while the application belongs to ${name}.`
    : cvNameCheck?.summary || "The CV name could not be confirmed against the applicant name.";
  const cvNeedsManualReview = Boolean(application.cv_url) && !cvIdentityMismatch && (
    application.ai_portfolio_review_consent !== true ||
    cvProcessingStatus === "processing_failed" ||
    ["not_a_cv", "uncertain", "not_run"].includes(cvDocumentStatus)
  );
  const attentionItems: { key: string; title: string; detail: string; tone: ReviewTone; category: "not_met" | "review" }[] = [
    ...visibleRequirementRows.map((row) => ({
      key: `requirement-${row.key}`,
      title: row.label,
      detail: row.detail,
      tone: row.tone,
      category: row.tone === "failed" ? "not_met" as const : "review" as const,
    })),
    ...(cvIdentityMismatch ? [{
      key: "cv-identity",
      title: "CV identity mismatch",
      detail: cvIdentityDetail,
      tone: "failed" as const,
      category: "review" as const,
    }] : []),
    ...(memberVerification && !memberIdentityVerified ? [{
      key: "performance-identity",
      title: "Performance identity",
      detail: memberIdentityDetail,
      tone: "review" as const,
      category: "review" as const,
    }] : []),
    ...(cvNeedsManualReview ? [{
      key: "cv-review",
      title: "CV review",
      detail: application.ai_portfolio_review_consent !== true
        ? "Automatic CV review was not authorized. Review the submitted CV manually."
        : "The CV could not be confirmed automatically. Review the document manually.",
      tone: "review" as const,
      category: "review" as const,
    }] : []),
    ...(videoProcessingStatus === "processing_failed" && !visibleRequirementRows.some((row) => row.key === "portfolio") ? [{
      key: "video-review",
      title: "Performance video",
      detail: "The automatic video review was unavailable. Review the submitted performance manually.",
      tone: "review" as const,
      category: "review" as const,
    }] : []),
  ].sort((left, right) => Number(right.tone === "failed") - Number(left.tone === "failed"));
  const requirementsNotMetCount = attentionItems.filter((item) => item.category === "not_met").length;
  const needsReviewCount = attentionItems.filter((item) => item.category === "review").length;
  const confirmedReviewCount = confirmedRequirementRows.length
    + Number(cvNameCheckStatus === "match")
    + Number(memberIdentityVerified);
  const requirementsCount = requirementResults.length || matchedCriteriaCount;
  const majorUnresolvedIssues = attentionItems;
  const acceptanceIssueNames = majorUnresolvedIssues.slice(0, 2).map((item) =>
    item.title === "CV identity mismatch" ? "CV identity" : item.title.toLowerCase(),
  );
  const acceptanceWarning = acceptanceIssueNames.length === 1
    ? `The ${acceptanceIssueNames[0]} still needs review.`
    : acceptanceIssueNames.length === 2
      ? `The ${acceptanceIssueNames[0]} and ${acceptanceIssueNames[1]} could not be confirmed.`
      : "Review the unresolved checks before making the final decision.";

  const openApplicantProfile = () => {
    if (!viewedProfileId) return;
    onClose();
    router.push({ pathname: "/profile", params: { userId: String(viewedProfileId) } });
  };

  const handleAcceptPress = () => {
    if (majorUnresolvedIssues.length > 0) {
      setShowAcceptConfirmation(true);
      return;
    }
    onAccept(application.id);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {
      setShowAcceptConfirmation(false);
      onClose();
    }}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity testID="close-applicant-details" accessibilityLabel="Close applicant details" onPress={() => {
            setShowAcceptConfirmation(false);
            onClose();
          }} style={[styles.closeButton, { borderColor: colors.border }]}>
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
            <TouchableOpacity onPress={() => onRetry()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
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
              <View style={styles.heroProfileRow}>
                <ProfileAvatar
                  uri={avatar}
                  size={68}
                  backgroundColor={`${colors.primary}14`}
                  iconColor={colors.primary}
                />
                <View style={styles.heroIdentity}>
                  <Text numberOfLines={2} style={[styles.heroName, { color: colors.text }]}>{name}</Text>
                  <Text style={[styles.heroRole, { color: colors.primary }]}>{appliedRole}</Text>
                  <View style={styles.heroLocationRow}>
                    <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                    <Text numberOfLines={1} style={[styles.heroLocation, { color: colors.textSecondary }]}>
                      {shortLocation(fullLocation) || "Location not provided"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.verificationBadges}>
                <View style={[styles.verificationBadge, { backgroundColor: isVerified ? "#ECFDF5" : colors.inputBackground }]}>
                  <Ionicons name={isVerified ? "shield-checkmark" : "shield-outline"} size={15} color={isVerified ? "#059669" : colors.textSecondary} />
                  <Text style={[styles.verificationBadgeText, { color: isVerified ? "#047857" : colors.textSecondary }]}>{accountVerificationLabel}</Text>
                </View>
                <View style={[styles.verificationBadge, { backgroundColor: memberIdentityVerified ? "#ECFDF5" : "#FFFBEB" }]}>
                  <Ionicons name={memberIdentityVerified ? "videocam" : "warning-outline"} size={15} color={memberIdentityVerified ? "#059669" : "#D97706"} />
                  <Text style={[styles.verificationBadgeText, { color: memberIdentityVerified ? "#047857" : "#B45309" }]}>{memberIdentityLabel}</Text>
                </View>
              </View>

              <View style={[styles.matchPanel, { backgroundColor: `${colors.primary}0D` }]}>
                <View accessibilityLabel="Match to gig requirements review summary" style={styles.matchPanelHeader}>
                  <View style={styles.matchPanelLabelRow}>
                    <Ionicons name="clipboard-outline" size={17} color={colors.primary} />
                    <Text style={[styles.matchPanelLabel, { color: colors.text }]}>Review Summary</Text>
                  </View>
                  <Text style={[styles.matchPanelScore, { color: colors.primary }]}>
                    {matchPercentage === null ? "Unavailable" : `${matchPercentage}%`}
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
                <View style={styles.summaryMetrics}>
                  <SummaryMetric value={confirmedReviewCount} label="Confirmed" tone="confirmed" />
                  <SummaryMetric value={requirementsNotMetCount} label="Requirement not met" tone="failed" />
                  <SummaryMetric value={needsReviewCount} label="Need review" tone="review" />
                </View>
                <Text style={[styles.attentionSectionTitle, { color: colors.text }]}>Needs attention</Text>
                {attentionItems.length > 0 ? attentionItems.map((item) => (
                  <AttentionItem key={item.key} title={item.title} detail={item.detail} tone={item.tone} />
                )) : (
                  <View style={styles.allClearRow}>
                    <Ionicons name="checkmark-circle" size={19} color="#059669" />
                    <Text style={styles.allClearText}>No unresolved checks were found.</Text>
                  </View>
                )}
                {!recommendation ? (
                  <EmptyState colors={colors}>The requirements match is unavailable. The applicant remains manually reviewable.</EmptyState>
                ) : (
                  <ReviewDetails colors={colors}>
                    <Text style={[styles.matchSummary, { color: colors.textSecondary }]}>
                      {friendlyRecommendationSummary(recommendation, matchPercentage)}
                    </Text>
                    {requiredCriteriaChecks.length > 0 ? (
                      <Text style={[styles.requiredSummary, { color: colors.text }]}>{confirmedRequiredCriteria} of {requiredCriteriaChecks.length} required criteria confirmed</Text>
                    ) : null}
                    <Text style={[styles.label, { color: "#10B981" }]}>Requirements met</Text>
                    <BulletList
                      values={requirementResults.length > 0
                        ? metRequirementResults.map((item) => `${item.label}: ${item.detail}`)
                        : list(recommendation.matched_criteria)}
                      colors={colors}
                      empty="No matched requirements were recorded."
                    />
                    <Text style={[styles.label, { color: "#EF4444" }]}>Requirements not met</Text>
                    <BulletList
                      values={notMetRequirementResults.map((item) => `${item.label}: ${item.detail}`)}
                      colors={colors}
                      empty="No definite requirement failures were recorded."
                    />
                    <Text style={[styles.label, { color: "#F59E0B" }]}>Couldn’t confirm</Text>
                    <BulletList
                      values={requirementResults.length > 0
                        ? unclearRequirementResults.map((item) => `${item.label}: ${item.detail}`)
                        : list(recommendation.missing_criteria)}
                      colors={colors}
                      empty="No requirements were left unconfirmed."
                    />
                    {memberCoverageItems.length > 0 ? (
                      <View style={[styles.memberCoverage, { borderTopColor: colors.border }]}>
                        <Text style={[styles.label, { color: colors.text }]}>Member requirement coverage</Text>
                        <Text style={[styles.memberCoverageSummary, { color: colors.textSecondary }]}>
                          {memberRequirementCoverage.slot_label || "Selected performer slot"}: {memberRequirementCoverage.matched_count || 0} of {memberRequirementCoverage.total_count || memberCoverageItems.length} roles covered by distinct members
                        </Text>
                        {memberCoverageItems.map((item, index) => {
                          const required = [...list(item?.required_roles), ...list(item?.required_instruments)].join(" + ") || "Configured role";
                          const memberSkills = [...list(item?.member_roles), ...list(item?.member_instruments)].join(", ");
                          const confirmed = item?.status === "confirmed" && item?.member_name;
                          return (
                            <View key={`${item?.requirement_label || "member"}-${index}`} style={styles.memberCoverageRow}>
                              <Ionicons
                                name={confirmed ? "checkmark-circle" : "alert-circle-outline"}
                                size={16}
                                color={confirmed ? "#10B981" : "#F59E0B"}
                              />
                              <View style={styles.memberCoverageCopy}>
                                <Text style={[styles.memberCoverageTitle, { color: colors.text }]}>
                                  {item?.requirement_label || `Member ${index + 1}`}: {required}
                                </Text>
                                <Text style={[styles.memberCoverageDetail, { color: colors.textSecondary }]}>
                                  {confirmed ? `${item.member_name}${memberSkills ? ` — ${memberSkills}` : ""}` : "No distinct roster member matched this requirement."}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </ReviewDetails>
                )}
                <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Advisory only. All applicants remain accessible and require an organizer decision.</Text>
              </View>

              <View style={[styles.quickStats, { borderTopColor: colors.border }]}>
                <View style={styles.quickStat}>
                  <Text style={[styles.quickStatValue, { color: colors.text }]}>{requirementsCount}</Text>
                  <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>Requirements</Text>
                </View>
                <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.quickStat}>
                  <Text style={[styles.quickStatValue, { color: colors.text }]}>
                    {(application.cv_url ? 1 : memberCvs.length) + (application.video_url ? 1 : 0) + portfolio.length}
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
                label="Account verification"
                value={accountVerificationLabel}
                colors={colors}
              />
              <DetailRow
                icon={memberIdentityVerified ? "videocam" : "videocam-outline"}
                label="Performance identity verification"
                value={memberIdentityLabel}
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
                <DetailRow icon="cash-outline" label="Listed rate" value={`PHP ${Number(group.rate).toLocaleString()}`} colors={colors} />
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

            <Section title="Qualification Review" icon="checkmark-done-outline" colors={colors} defaultOpen>
              <ReviewGroup title="Needs attention" icon="alert-circle-outline" colors={colors}>
                {visibleRequirementRows.length > 0 ? visibleRequirementRows.map((row, index) => (
                  <RequirementRow key={`${row.key}-${index}`} row={row} colors={colors} />
                )) : (
                  <Text style={[styles.body, { color: colors.textSecondary }]}>No requirement exceptions need review.</Text>
                )}
                {cvIdentityMismatch ? (
                  <View accessibilityLabel="Important verification needed">
                    <AttentionItem title="CV identity mismatch" detail={cvIdentityDetail} tone="failed" />
                  </View>
                ) : null}
                {memberVerification && !memberIdentityVerified ? <AttentionItem title="Performance identity" detail={memberIdentityDetail} tone="review" /> : null}
              </ReviewGroup>

              <ConfirmedRequirements rows={confirmedRequirementRows} colors={colors} />

              <ReviewGroup title="CV" icon="document-text-outline" colors={colors}>
                {!application.cv_url && memberCvs.length === 0 ? (
                  <EmptyState colors={colors}>No CV was uploaded.</EmptyState>
                ) : (
                  <>
                    <StatusRow
                      icon={cvIdentityMismatch ? "close-circle-outline" : cvNameCheckStatus === "match" ? "checkmark-circle-outline" : "warning-outline"}
                      label={cvIdentityMismatch ? "CV identity mismatch" : cvNameCheckStatus === "match" ? "CV identity confirmed" : "Manual review needed"}
                      color={cvIdentityMismatch ? "#DC2626" : cvNameCheckStatus === "match" ? "#059669" : "#D97706"}
                    />
                    <Text style={[styles.body, { color: colors.textSecondary }]}>{cvIdentityMismatch ? cvIdentityDetail : cvNameCheck?.summary || "Open the submitted CV when you need to verify its contents."}</Text>
                    {application.cv_url ? (
                      <TouchableOpacity onPress={() => onOpenMedia(application.cv_url, "Applicant CV")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                        <Ionicons name="open-outline" size={17} color={colors.primary} />
                        <Text style={[styles.outlineButtonText, { color: colors.primary }]}>View CV</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}
              </ReviewGroup>

              <ReviewGroup title="Performance video" icon="videocam-outline" colors={colors}>
                {application.video_url ? (
                  <>
                    <StatusRow
                      icon={videoProcessingStatus === "processing_failed" ? "warning-outline" : "checkmark-circle-outline"}
                      label={videoProcessingStatus === "processing_failed" ? "Automatic review unavailable" : "Performance video submitted"}
                      color={videoProcessingStatus === "processing_failed" ? "#D97706" : "#059669"}
                    />
                    <Text style={[styles.body, { color: colors.textSecondary }]}>{videoProcessingStatus === "processing_failed" ? "Review the submitted performance manually." : "Open the performance when you need to verify the evidence."}</Text>
                    <TouchableOpacity onPress={() => onOpenMedia(application.video_url, "Performance Video")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                      <Ionicons name="play-outline" size={18} color={colors.primary} />
                      <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Watch performance</Text>
                    </TouchableOpacity>
                  </>
                ) : <EmptyState colors={colors}>No performance video was submitted.</EmptyState>}
              </ReviewGroup>

              <ReviewGroup title="Registered member verification" icon="people-circle-outline" colors={colors}>
                <StatusRow
                  icon={memberIdentityVerified ? "checkmark-circle-outline" : memberIdentityInProgress ? "time-outline" : "warning-outline"}
                  label={memberIdentityLabel}
                  color={memberIdentityVerified ? "#059669" : "#D97706"}
                />
                <Text style={[styles.body, { color: colors.textSecondary }]}>{memberIdentityDetail}</Text>
                {memberVerificationMembers.map((member: any, index: number) => {
                  const verified = member.status === "verified";
                  const similarity = member.best_similarity === null || member.best_similarity === undefined ? Number.NaN : Number(member.best_similarity);
                  const profileMeta = profileVerificationMeta(member);
                  const profileSimilarity = member.profile_best_similarity === null || member.profile_best_similarity === undefined ? Number.NaN : Number(member.profile_best_similarity);
                  return (
                    <View key={`${member.member_id || "member-summary"}-${index}`} style={[styles.messageCard, { backgroundColor: colors.inputBackground }]}>
                      {member.reference_portrait_url ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`View government ID holder portrait for ${member.member_name_snapshot || `member ${index + 1}`}`}
                          onPress={() => onOpenMedia(member.reference_portrait_url, `${member.member_name_snapshot || `Member ${index + 1}`} - ID Holder Portrait`)}
                          style={styles.portraitPreviewRow}
                        >
                          <ProfileAvatar uri={member.reference_portrait_url} size={56} backgroundColor={colors.surface} iconColor={colors.primary} cachePolicy="none" />
                          <View style={styles.flexOne}>
                            <Text style={[styles.requirementTitle, { color: colors.text }]}>Government ID holder portrait</Text>
                            <Text style={[styles.advisory, { color: colors.primary }]}>Tap to view the face crop used for verification</Text>
                          </View>
                        </TouchableOpacity>
                      ) : null}
                      {usesDualReference && member.profile_photo_url ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`View registered profile photo for ${member.member_name_snapshot || `member ${index + 1}`}`}
                          onPress={() => onOpenMedia(member.profile_photo_url, `${member.member_name_snapshot || `Member ${index + 1}`} - Profile Photo`)}
                          style={styles.portraitPreviewRow}
                        >
                          <ProfileAvatar uri={member.profile_photo_url} size={56} backgroundColor={colors.surface} iconColor={colors.primary} />
                          <View style={styles.flexOne}>
                            <Text style={[styles.requirementTitle, { color: colors.text }]}>Registered profile photo</Text>
                            <Text style={[styles.advisory, { color: colors.primary }]}>Tap to view the profile photo used for the secondary check</Text>
                          </View>
                        </TouchableOpacity>
                      ) : null}
                      <Text style={[styles.requirementTitle, { color: colors.text }]}>{member.member_name_snapshot || `Member ${index + 1}`}</Text>
                      <Text style={[styles.advisory, { color: verified ? "#059669" : "#D97706" }]}>ID-to-video: {verified ? "identity confirmed" : "identity not confirmed"}</Text>
                      {Number.isFinite(similarity) ? <Text style={[styles.advisory, { color: colors.textSecondary }]}>ID similarity: {similarity.toFixed(1)}%</Text> : null}
                      {usesDualReference ? (
                        <>
                          <Text style={[styles.advisory, { color: profileMeta.color }]}>Profile-to-video: {profileMeta.label}</Text>
                          {Number.isFinite(profileSimilarity) ? <Text style={[styles.advisory, { color: colors.textSecondary }]}>Profile similarity: {profileSimilarity.toFixed(1)}%</Text> : null}
                          <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>The profile-photo result is secondary and never overrides the ID result.</Text>
                        </>
                      ) : null}
                      {!verified ? <Text style={[styles.advisory, { color: "#B45309" }]}>Manual review recommended</Text> : null}
                    </View>
                  );
                })}
                <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Advisory only. This check does not accept or decline an applicant.</Text>
              </ReviewGroup>

              <ReviewDetails colors={colors}>
              {memberVerification ? (
                <Subsection title="Registered Member Verification" icon="people-circle-outline" colors={colors}>
                  <StatusRow
                    icon={memberVerification.result === "verified" ? "checkmark-circle-outline" : ["queued", "processing"].includes(String(memberVerification.status)) ? "time-outline" : "warning-outline"}
                    label={
                      memberVerification.result === "verified"
                        ? "Performance identity confirmed"
                        : ["queued", "processing"].includes(String(memberVerification.status))
                          ? "Performance identity in progress"
                          : memberVerification.result === "no_video"
                            ? "No performance video to verify"
                            : memberVerification.status === "not_requested"
                              ? "Verification was not authorized"
                              : "Identity not confirmed"
                    }
                    color={memberVerification.result === "verified" ? "#10B981" : ["queued", "processing"].includes(String(memberVerification.status)) ? colors.primary : "#F59E0B"}
                  />
                  <Text style={[styles.body, { color: colors.textSecondary }]}>
                    {memberIdentityDetail} {"This is advisory and does not change the match score or make the organizer's decision."}
                  </Text>
                  {memberVerification.additional_people_detected ? (
                    <Text style={[styles.advisory, { color: "#B45309" }]}>Additional people may appear in the video. Review the performance manually.</Text>
                  ) : null}
                  {memberVerificationMembers.map((member: any, index: number) => {
                    const verified = member.status === "verified";
                    const similarity = member.best_similarity === null || member.best_similarity === undefined ? Number.NaN : Number(member.best_similarity);
                    const profileMeta = profileVerificationMeta(member);
                    const profileSimilarity = member.profile_best_similarity === null || member.profile_best_similarity === undefined ? Number.NaN : Number(member.profile_best_similarity);
                    return (
                      <View key={`${member.member_id || "member"}-${index}`} style={[styles.messageCard, { backgroundColor: colors.inputBackground }]}>
                        {member.reference_portrait_url ? (
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`View government ID holder portrait for ${member.member_name_snapshot || `member ${index + 1}`}`}
                            onPress={() => onOpenMedia(member.reference_portrait_url, `${member.member_name_snapshot || `Member ${index + 1}`} - ID Holder Portrait`)}
                            style={styles.portraitPreviewRow}
                          >
                            <ProfileAvatar uri={member.reference_portrait_url} size={56} backgroundColor={colors.surface} iconColor={colors.primary} cachePolicy="none" />
                            <View style={styles.flexOne}>
                              <Text style={[styles.requirementTitle, { color: colors.text }]}>Government ID holder portrait</Text>
                              <Text style={[styles.advisory, { color: colors.primary }]}>Tap to view the face crop used for verification</Text>
                            </View>
                          </TouchableOpacity>
                        ) : null}
                        {usesDualReference && member.profile_photo_url ? (
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`View registered profile photo for ${member.member_name_snapshot || `member ${index + 1}`}`}
                            onPress={() => onOpenMedia(member.profile_photo_url, `${member.member_name_snapshot || `Member ${index + 1}`} - Profile Photo`)}
                            style={styles.portraitPreviewRow}
                          >
                            <ProfileAvatar uri={member.profile_photo_url} size={56} backgroundColor={colors.surface} iconColor={colors.primary} />
                            <View style={styles.flexOne}>
                              <Text style={[styles.requirementTitle, { color: colors.text }]}>Registered profile photo</Text>
                              <Text style={[styles.advisory, { color: colors.primary }]}>Tap to view the profile photo used for the secondary check</Text>
                            </View>
                          </TouchableOpacity>
                        ) : null}
                        <StatusRow
                          icon={verified ? "checkmark-circle-outline" : "warning-outline"}
                          label={`${member.member_name_snapshot || `Member ${index + 1}`}: ID-to-video ${verified ? "confirmed" : "not confirmed"}`}
                          color={verified ? "#10B981" : "#F59E0B"}
                        />
                        {Number.isFinite(similarity) ? (
                          <Text style={[styles.advisory, { color: colors.textSecondary }]}>ID similarity: {similarity.toFixed(1)}%</Text>
                        ) : null}
                        {usesDualReference ? (
                          <>
                            <Text style={[styles.advisory, { color: profileMeta.color }]}>Profile-to-video: {profileMeta.label}</Text>
                            {Number.isFinite(profileSimilarity) ? <Text style={[styles.advisory, { color: colors.textSecondary }]}>Profile similarity: {profileSimilarity.toFixed(1)}%</Text> : null}
                            <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>The profile-photo result is secondary and never overrides the ID result.</Text>
                          </>
                        ) : null}
                        {!verified ? <Text style={[styles.advisory, { color: "#B45309" }]}>Manual review recommended</Text> : null}
                      </View>
                    );
                  })}
                </Subsection>
              ) : null}

              {application.cv_url &&
              application.ai_portfolio_review_consent === true &&
              cvDocumentStatus === "cv" &&
              cvProcessingStatus === "reviewed" ? (
                <Subsection title={cvNameCheckStatus === "mismatch" ? "CV identity mismatch" : "CV identity"} icon="person-circle-outline" colors={colors}>
                  <StatusRow
                    icon={cvNameCheckStatus === "match" ? "checkmark-circle-outline" : cvNameCheckStatus === "mismatch" ? "close-circle-outline" : "warning-outline"}
                    label={cvNameCheckStatus === "match" ? "CV identity confirmed" : cvNameCheckStatus === "mismatch" ? "CV identity mismatch" : "Please verify this CV"}
                    color={cvNameCheckStatus === "match" ? "#10B981" : cvNameCheckStatus === "mismatch" ? "#DC2626" : "#F59E0B"}
                  />
                  <Text style={[styles.body, { color: colors.textSecondary }]}>
                    {cvNameCheckStatus === "mismatch" && cvNameCheck?.extracted_name
                      ? `The CV lists ${cvNameCheck.extracted_name}, while the application belongs to ${name}.`
                      : cvNameCheck?.summary || "We couldn't confirm the name on the CV. Verify it manually."}
                  </Text>
                  <TouchableOpacity onPress={() => onOpenMedia(application.cv_url, "Applicant CV")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                    <Ionicons name="open-outline" size={17} color={colors.primary} />
                    <Text style={[styles.outlineButtonText, { color: colors.primary }]}>View CV</Text>
                  </TouchableOpacity>
                  {cvNameCheck?.extracted_name ? (
                    <ReviewDetails colors={colors}>
                      <Text style={[styles.body, { color: colors.textSecondary }]}>CV name: {cvNameCheck.extracted_name}</Text>
                      <Text style={[styles.body, { color: colors.textSecondary }]}>Application name: {name}</Text>
                    </ReviewDetails>
                  ) : null}
                  <Text style={[styles.advisory, { color: colors.textSecondary }]}>This issue does not change the match score, but it places the recommendation in Needs review until the document is verified.</Text>
                </Subsection>
              ) : null}

              {memberCvs.length > 0 ? (
                <Subsection title="Member CVs" icon="people-outline" colors={colors}>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>Each CV belongs to the named group member. The performance video is shared by the whole group.</Text>
                  {memberCvs.map((member: any) => {
                    const reviewStatus = String(member.ai_review_status || "not_requested");
                    const reviewSummary = member.ai_review_result?.classification?.summary
                      || member.ai_review_result?.reason
                      || (member.ai_review_consent ? "Automatic review is pending." : "AI review was not authorized by this member.");
                    return (
                      <View key={member.id} style={[styles.messageCard, { backgroundColor: colors.inputBackground }]}>
                        <Text style={[styles.label, { color: colors.text }]}>{member.member_name || "Group member"}</Text>
                        <Text style={[styles.body, { color: colors.textSecondary }]}>
                          {[member.role, member.instrument].filter(Boolean).join(" · ") || "Group member"}
                        </Text>
                        <StatusRow
                          icon={reviewStatus === "completed" ? "checkmark-circle-outline" : "information-circle-outline"}
                          label={reviewStatus === "completed" ? "CV reviewed" : reviewStatus === "failed" ? "Manual review needed" : reviewStatus === "skipped" ? "AI review not authorized" : "CV submitted"}
                          color={reviewStatus === "completed" ? "#10B981" : reviewStatus === "failed" ? "#F59E0B" : colors.primary}
                        />
                        <Text style={[styles.body, { color: colors.textSecondary }]}>{reviewSummary}</Text>
                        {member.cv_url ? (
                          <TouchableOpacity onPress={() => onOpenMedia(member.cv_url, `${member.member_name || "Member"} CV`)} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                            <Ionicons name="open-outline" size={17} color={colors.primary} />
                            <Text style={[styles.outlineButtonText, { color: colors.primary }]}>View {member.member_name || "Member"} CV</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })}
                </Subsection>
              ) : null}
              <Subsection title="CV Check" icon="document-text-outline" colors={colors}>
              {memberCvs.length > 0 ? (
                <Text style={[styles.body, { color: colors.textSecondary }]}>Individual findings and documents are listed under Member CVs above.</Text>
              ) : !application.cv_url ? (
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
                  ) : ["queued", "processing"].includes(cvProcessingStatus) ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="time-outline" label="Check in progress" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>The CV is still being checked.</Text>
                    </View>
                  ) : cvProcessingStatus === "processing_failed" ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Automatic review unavailable" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>The CV was submitted, but its automatic review could not be completed. Review it manually.</Text>
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
                  ) : cvDocumentStatus === "not_run" || cvProcessingStatus === "consent_revoked" || cvEvidence.length === 0 ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Manual review needed" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{"The CV couldn't be reviewed automatically."}</Text>
                      {cvDocumentClassification?.summary ? (
                        <ReviewDetails colors={colors}>
                          <Text style={[styles.body, { color: colors.textSecondary }]}>{cvExtractionLimitation || cvDocumentClassification.summary}</Text>
                        </ReviewDetails>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="checkmark-circle-outline" label="CV reviewed" color="#10B981" />
                      {cvTextExtracted ? (
                        <Text style={[styles.body, { color: colors.textSecondary }]}>The document was read successfully.</Text>
                      ) : null}
                      {cvEvidence.map((item, index) => (
                        <EvidenceFinding key={`${item?.criterion || "cv-finding"}-${index}`} item={item} colors={colors} sourceContext="cv" />
                      ))}
                    </View>
                  )}
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
                <View style={styles.stackMedium}>
                  <StatusRow icon="checkmark-circle-outline" label="Performance video submitted" color="#10B981" />
                  <TouchableOpacity onPress={() => onOpenMedia(application.video_url, "Performance Video")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                    <Ionicons name="play-outline" size={18} color={colors.primary} />
                    <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Watch performance</Text>
                  </TouchableOpacity>
                  {videoProcessingStatus === "processing_failed" ? (
                    <View style={styles.stackMedium}>
                      <StatusRow icon="warning-outline" label="Automatic review unavailable" color="#F59E0B" />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>The performance video was submitted successfully, but the automatic review could not be completed. Review the video manually.</Text>
                    </View>
                  ) : videoEvidence.map((item, index) => (
                      <EvidenceFinding key={`${item?.criterion || "video-finding"}-${index}`} item={item} colors={colors} sourceContext="video" />
                    ))}
                </View>
              ) : <EmptyState colors={colors}>No performance video was submitted.</EmptyState>}
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
              </ReviewDetails>
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
                onPress={handleAcceptPress}
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

        <Modal visible={showAcceptConfirmation} transparent animationType="fade" onRequestClose={() => setShowAcceptConfirmation(false)}>
          <View style={styles.confirmationBackdrop}>
            <View style={[styles.confirmationSheet, { backgroundColor: colors.surface }]}>
              <View style={styles.confirmationHandle} />
              <View style={styles.confirmationIcon}>
                <Ionicons name="warning" size={24} color="#D97706" />
              </View>
              <Text style={[styles.confirmationTitle, { color: colors.text }]}>
                {majorUnresolvedIssues.length} {majorUnresolvedIssues.length === 1 ? "issue" : "issues"} still need review
              </Text>
              <Text style={[styles.confirmationCopy, { color: colors.textSecondary }]}>{acceptanceWarning}</Text>
              <View style={styles.confirmationActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setShowAcceptConfirmation(false)}
                  style={[styles.confirmationSecondary, { borderColor: colors.border }]}
                >
                  <Text style={[styles.confirmationSecondaryText, { color: colors.text }]}>Continue reviewing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    setShowAcceptConfirmation(false);
                    onAccept(application.id);
                  }}
                  style={styles.confirmationPrimary}
                >
                  <Text style={styles.confirmationPrimaryText}>Accept anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  verificationBadges: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  verificationBadge: { maxWidth: "100%", minHeight: 30, borderRadius: 999, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  verificationBadgeText: { flexShrink: 1, fontFamily: "Poppins_600SemiBold", fontSize: 9, lineHeight: 13 },
  matchPanel: { borderRadius: 14, padding: 12, gap: 8 },
  matchPanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  matchPanelLabelRow: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  matchPanelLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12, lineHeight: 17 },
  matchPanelScore: { fontFamily: "Poppins_700Bold", fontSize: 14, lineHeight: 19 },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  summaryMetrics: { flexDirection: "row", gap: 6, marginTop: 3 },
  summaryMetric: { flex: 1, minHeight: 60, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 8, justifyContent: "center" },
  summaryMetricValue: { fontFamily: "Poppins_700Bold", fontSize: 17, lineHeight: 21 },
  summaryMetricLabel: { marginTop: 1, fontFamily: "Poppins_500Medium", fontSize: 8, lineHeight: 11 },
  attentionSectionTitle: { marginTop: 4, fontFamily: "Poppins_700Bold", fontSize: 11, lineHeight: 16 },
  attentionItem: { borderLeftWidth: 3, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, gap: 3 },
  attentionHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  attentionTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 10, lineHeight: 15 },
  attentionDetail: { color: "#4B5563", fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14, paddingLeft: 24 },
  allClearRow: { minHeight: 38, borderRadius: 9, backgroundColor: "#ECFDF5", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  allClearText: { flex: 1, color: "#047857", fontFamily: "Poppins_600SemiBold", fontSize: 10, lineHeight: 15 },
  matchSummary: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15 },
  requiredSummary: { fontFamily: "Poppins_600SemiBold", fontSize: 10, lineHeight: 15 },
  majorVerificationBanner: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderWidth: 1, borderColor: "#F59E0B", backgroundColor: "#FFFBEB", borderRadius: 11, padding: 10 },
  majorVerificationTitle: { color: "#92400E", fontFamily: "Poppins_700Bold", fontSize: 11, lineHeight: 16 },
  majorVerificationCopy: { color: "#92400E", fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15, marginTop: 2 },
  memberCoverage: { borderTopWidth: 1, marginTop: 3, paddingTop: 7, gap: 7 },
  memberCoverageSummary: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15 },
  memberCoverageRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  memberCoverageCopy: { flex: 1, minWidth: 0 },
  memberCoverageTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 10, lineHeight: 15 },
  memberCoverageDetail: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14 },
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
  reviewGroup: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  reviewGroupHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  reviewGroupTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 12, lineHeight: 17 },
  reviewGroupBody: { gap: 8 },
  confirmedGroup: { borderWidth: 1, borderRadius: 11, overflow: "hidden" },
  confirmedGroupHeader: { minHeight: 44, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7 },
  confirmedGroupTitle: { flex: 1, color: "#047857", fontFamily: "Poppins_600SemiBold", fontSize: 11, lineHeight: 16 },
  confirmedGroupAction: { fontFamily: "Poppins_600SemiBold", fontSize: 9, lineHeight: 13 },
  confirmedGroupBody: { borderTopWidth: 1, padding: 8, gap: 7 },
  requirementRow: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  requirementRowButton: { minHeight: 66, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  requirementCopy: { flex: 1, minWidth: 0 },
  requirementTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 11, lineHeight: 16 },
  requirementStatus: { marginTop: 1, fontFamily: "Poppins_600SemiBold", fontSize: 9, lineHeight: 13 },
  requirementDetail: { marginTop: 2, fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14 },
  evidenceAction: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: 1 },
  evidenceActionText: { fontFamily: "Poppins_600SemiBold", fontSize: 8, lineHeight: 12 },
  requirementEvidence: { borderTopWidth: 1, padding: 10, gap: 5 },
  evidenceLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 8, lineHeight: 12, letterSpacing: 0.5 },
  evidenceValue: { fontFamily: "Poppins_500Medium", fontSize: 10, lineHeight: 15 },
  evidenceEntry: { gap: 2, marginTop: 3 },
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
  findingCard: { borderWidth: 1, borderRadius: 11, padding: 11, gap: 6 },
  findingTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12, lineHeight: 17 },
  evidenceSource: { fontFamily: "Poppins_600SemiBold", fontSize: 10, lineHeight: 15 },
  reviewDetails: { alignItems: "flex-start" },
  reviewDetailsButton: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 4 },
  reviewDetailsButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, lineHeight: 15 },
  reviewDetailsBody: { width: "100%", borderLeftWidth: 2, paddingLeft: 10, gap: 7 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  detailLabel: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 13 },
  detailValue: { marginTop: 1, fontFamily: "Poppins_500Medium", fontSize: 12, lineHeight: 17 },
  messageCard: { borderRadius: 11, padding: 12, gap: 7 },
  portraitPreviewRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  tagList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontFamily: "Poppins_500Medium", fontSize: 10, lineHeight: 14 },
  stackSmall: { gap: 6 },
  stackMedium: { gap: 7 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1 },
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
  confirmationBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.52)", justifyContent: "flex-end" },
  confirmationSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, alignItems: "center" },
  confirmationHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", marginBottom: 18 },
  confirmationIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#FFFBEB", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  confirmationTitle: { textAlign: "center", fontFamily: "Poppins_700Bold", fontSize: 18, lineHeight: 25 },
  confirmationCopy: { marginTop: 6, textAlign: "center", fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 19 },
  confirmationActions: { width: "100%", marginTop: 20, gap: 9 },
  confirmationSecondary: { minHeight: 48, borderWidth: 1, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  confirmationSecondaryText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  confirmationPrimary: { minHeight: 48, borderRadius: 999, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  confirmationPrimaryText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
});
