import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
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

const faceMatchLabel = (value: unknown) => {
  const status = String(value || "").toLowerCase();
  if (status === "likely_same_person") return "Match";
  if (status === "likely_different_person") return "No Match";
  return status === "not_run" ? "Not Run" : "Unclear";
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

const isLegacySingleFrameMatch = (result: any) =>
  String(result?.status || "").toLowerCase() === "unclear" &&
  effectiveFaceMatchStatus(result) === "likely_same_person";

const faceMatchSummary = (result: any) =>
  isLegacySingleFrameMatch(result)
    ? "ArcFace found a match in the only clear representative video frame."
    : result?.summary || "No comparison explanation was stored.";

const faceMatchLimitation = (result: any) =>
  isLegacySingleFrameMatch(result)
    ? "Only one clear frame was available, so this result has limited evidence and must be checked against the original profile photo and video."
    : result?.limitation;

const faceMatchMetrics = (result: any) => {
  const usable = Math.max(0, Number(result?.usable_frames ?? result?.frames_compared) || 0);
  const matched = Math.max(0, Number(result?.matched_frames) || 0);
  const sampled = Math.max(usable, Number(result?.sampled_frames) || 0);
  const rate = Math.max(0, Math.min(1, Number(result?.match_rate) || 0));
  const distance = Number(result?.distance);
  const threshold = Number(result?.threshold);
  const distanceDetail = result?.distance != null && result?.threshold != null && Number.isFinite(distance) && Number.isFinite(threshold)
    ? ` | median distance ${distance.toFixed(3)} (threshold ${threshold.toFixed(3)})`
    : "";
  return `Match rate ${Math.round(rate * 100)}% | ${matched}/${usable} matched usable frames | ${sampled} sampled${distanceDetail}`;
};

const shortLocation = (value: unknown) => {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  return parts.slice(-3, -1).join(", ");
};

const documentType = (url: unknown) => {
  const clean = String(url || "").split("?")[0];
  const extension = clean.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
  return extension && ["PDF", "DOC", "DOCX"].includes(extension) ? extension : "Document";
};

const screeningMeta = (statusValue: unknown) => {
  const status = String(statusValue || "not_screened").toLowerCase();
  if (status === "not_required") return { label: "No released-recording match", color: "#10B981", message: "No released-recording match was returned by the configured screening service." };
  if (status === "pending_review") return { label: "Possible released-recording match", color: "#F59E0B", message: "A possible match requires ownership or permission review." };
  if (status === "approved") return { label: "Possible match · permission approved", color: "#10B981", message: "A possible match was reviewed and the ownership or permission claim was approved." };
  if (status === "declined") return { label: "Possible match · permission declined", color: "#EF4444", message: "A possible match was reviewed and the ownership or permission claim was declined." };
  if (status === "pending" || status === "processing") return { label: "Screening pending", color: "#F59E0B", message: "Released-recording screening is still processing." };
  if (status === "unavailable") return { label: "Screening unavailable", color: "#6B7280", message: "Released-recording screening is unavailable. No conclusion was produced." };
  if (status === "failed") return { label: "Screening failed", color: "#EF4444", message: "Screening could not be completed. No conclusion was produced." };
  return { label: "Not yet screened", color: "#6B7280", message: "This video has no completed released-recording screening result." };
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
  const evidence = list(aiReview?.evidence);
  const storedCvReview = list(aiReview?.source_summary?.cv_requirement_review);
  const cvDocumentClassification = aiReview?.source_summary?.cv_document_classification || null;
  const cvDocumentStatus = String(cvDocumentClassification?.status || "").toLowerCase();
  const cvEvidence = storedCvReview.length
    ? storedCvReview
    : evidence.filter((item) => list(item?.evidence).some((entry) => entry?.source === "cv"));
  const recognizedAudioGenres = application.video_copyright_metadata?.genre_evidence_receipt
    ? list(application.video_copyright_metadata?.recognized_audio_genres)
    : [];
  const hasRecognizedRecording = recognizedAudioGenres.length > 0;
  const screening = hasRecognizedRecording
    ? {
        label: "Recording recognized for genre",
        color: "#10B981",
        message: "The catalog genres below are advisory evidence only and do not block this application.",
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

  const cvResult = useMemo(() => {
    const matched = cvEvidence.filter((item) => item?.result === "supported");
    const missing = cvEvidence.filter((item) => item?.result === "not_supported");
    const unclear = cvEvidence.filter((item) => !["supported", "not_supported"].includes(item?.result));
    const fitPercent = cvEvidence.length > 0 ? Math.round((matched.length / cvEvidence.length) * 100) : null;
    return { matched, missing, unclear, fitPercent };
  }, [cvEvidence]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity testID="close-applicant-details" accessibilityLabel="Close applicant details" onPress={onClose} style={[styles.closeButton, { borderColor: colors.border }]}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>APPLICANT REVIEW</Text>
            <Text numberOfLines={1} style={[styles.modalTitle, { color: colors.text }]}>{name}</Text>
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
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.matchPanel, { backgroundColor: `${colors.primary}0D` }]}>
                <View style={styles.matchPanelHeader}>
                  <View style={styles.matchPanelLabelRow}>
                    <Ionicons name="sparkles" size={17} color={colors.primary} />
                    <Text style={[styles.matchPanelLabel, { color: colors.text }]}>AI Match Review</Text>
                  </View>
                  <Text style={[styles.matchPanelScore, { color: colors.primary }]}>
                    {matchPercentage === null ? "Not scored" : `${matchPercentage}% Match`}
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
                      {recommendation.explanation || "No explanation was stored."}
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

            <Section title="Profile Details" icon="person-outline" colors={colors} defaultOpen>
              <DetailRow icon="musical-notes-outline" label="Applied role or slot" value={appliedRole} colors={colors} />
              <DetailRow icon="location-outline" label="Full location" value={fullLocation} colors={colors} />
              <DetailRow
                icon={isVerified ? "shield-checkmark-outline" : "shield-outline"}
                label="Verification"
                value={isVerified ? "Verified profile" : "Not verified"}
                colors={colors}
              />
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
            </Section>

            <Section title="Application Details" icon="information-circle-outline" colors={colors} defaultOpen>
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
            </Section>

            <Section title="CV Requirement Review" icon="document-text-outline" colors={colors}>
              {application.cv_url ? (
                <TouchableOpacity onPress={() => onOpenMedia(application.cv_url, "Applicant CV")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                  <Ionicons name="open-outline" size={17} color={colors.primary} />
                  <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Open original {documentType(application.cv_url)}</Text>
                </TouchableOpacity>
              ) : <EmptyState colors={colors}>Missing source file: no CV or resume was uploaded.</EmptyState>}
              {!application.cv_url ? null : !aiReview ? (
                <EmptyState colors={colors}>Resume analysis is unavailable. Review the original document manually.</EmptyState>
              ) : ["queued", "processing"].includes(String(aiReview.status)) ? (
                <EmptyState colors={colors}>Resume analysis is still processing.</EmptyState>
              ) : cvDocumentStatus === "not_a_cv" ? (
                <View style={styles.stackMedium}>
                  <Text style={[styles.label, { color: "#EF4444" }]}>Not detected as a CV or resume</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{cvDocumentClassification?.summary || "The uploaded document does not contain sufficient CV or resume content."}</Text>
                  <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>CV requirement scoring was skipped. Open the original file for manual review.</Text>
                </View>
              ) : cvDocumentStatus === "uncertain" ? (
                <View style={styles.stackMedium}>
                  <Text style={[styles.label, { color: "#F59E0B" }]}>Document type is uncertain</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{cvDocumentClassification?.summary || "The document could not be confidently identified as a CV or resume."}</Text>
                  <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>CV requirement scoring was skipped to avoid a misleading result.</Text>
                </View>
              ) : ["failed", "consent_revoked"].includes(String(aiReview.status)) || cvEvidence.length === 0 ? (
                <EmptyState colors={colors}>Resume could not be analyzed. Review the original document manually.</EmptyState>
              ) : (
                <View style={styles.stackMedium}>
                  <Text style={[styles.score, { color: colors.primary }]}>Overall job-related fit: {cvResult.fitPercent}%</Text>
                  <Text style={[styles.label, { color: "#10B981" }]}>Matched requirements</Text>
                  <BulletList values={cvResult.matched.map((item) => item.criterion)} colors={colors} empty="No requirements were confirmed from the resume." />
                  <Text style={[styles.label, { color: "#EF4444" }]}>Missing requirements</Text>
                  <BulletList values={cvResult.missing.map((item) => item.criterion)} colors={colors} empty="No directly contradicted requirements were found." />
                  <Text style={[styles.label, { color: "#F59E0B" }]}>Unclear requirements</Text>
                  <BulletList values={cvResult.unclear.map((item) => item.criterion)} colors={colors} empty="No unclear requirements were recorded." />
                  {cvEvidence.flatMap((item) => list(item.evidence)).slice(0, 4).map((entry, index) => (
                    <Text key={index} style={[styles.body, { color: colors.textSecondary }]}>Resume evidence: {entry?.observation || "Evidence unavailable"}</Text>
                  ))}
                </View>
              )}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Manual review required. This advisory result must not automatically accept or decline an applicant.</Text>
            </Section>

            <Section title="Performance Video" icon="videocam-outline" colors={colors}>
              {application.video_url ? (
                <TouchableOpacity onPress={() => onOpenMedia(application.video_url, "Performance Video")} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                  <Ionicons name="play-outline" size={18} color={colors.primary} />
                  <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Open performance video</Text>
                </TouchableOpacity>
              ) : <EmptyState colors={colors}>Missing source file: no performance video was uploaded.</EmptyState>}
            </Section>

            <Section title="Audio & Genre Evidence" icon="radio-outline" colors={colors}>
              <Text style={[styles.body, { color: colors.textSecondary }]}>Checks whether the performance video contains a recognized released recording, then uses its catalog genres as supporting evidence for the requested genre.</Text>
              <View style={[styles.statusPill, { borderColor: screening.color }]}>
                <Text style={[styles.statusPillText, { color: screening.color }]}>{screening.label}</Text>
              </View>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{screening.message}</Text>
              {application.video_copyright_metadata?.copyright_title ? <Text style={[styles.body, { color: colors.textSecondary }]}>Recognized recording: {application.video_copyright_metadata.copyright_title}{application.video_copyright_metadata.copyright_artist_label ? ` by ${application.video_copyright_metadata.copyright_artist_label}` : ""}</Text> : null}
              {recognizedAudioGenres.length > 0 ? <Text style={[styles.body, { color: colors.textSecondary }]}>Recognized recording genres: {recognizedAudioGenres.join(", ")}</Text> : null}
              {application.video_copyright_metadata?.internal_match_playlist_title ? <Text style={[styles.body, { color: colors.textSecondary }]}>Playlist recording: {application.video_copyright_metadata.internal_match_playlist_title}{application.video_copyright_metadata.internal_match_playlist_artist ? ` by ${application.video_copyright_metadata.internal_match_playlist_artist}` : ""} ({String(application.video_copyright_metadata.internal_match_similarity_score || "strong")} match)</Text> : null}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>This evidence can support genre matching and flag a possible permission review. It is not a legal copyright decision and does not automatically accept or reject an applicant.</Text>
            </Section>

            <Section title="Optional Profile-Video Face Match" icon="person-circle-outline" colors={colors}>
              {!application.ai_portfolio_review_consent ? <EmptyState colors={colors}>Applicant consent for this optional review is not recorded.</EmptyState> : groupFaceSimilarity.length > 0 ? (
                <View style={styles.stackMedium}>
                  {groupFaceSimilarity.map((member, index) => (
                    <View key={member?.profile_id || index} style={[styles.memberSignal, { borderColor: colors.border }]}>
                      <Text style={[styles.label, { color: colors.text }]}>{member?.display_name || `Group member ${index + 1}`}</Text>
                      <Text style={[styles.body, { color: effectiveFaceMatchStatus(member) === "likely_same_person" ? "#10B981" : effectiveFaceMatchStatus(member) === "likely_different_person" ? "#EF4444" : colors.textSecondary }]}>{faceMatchLabel(effectiveFaceMatchStatus(member))}</Text>
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{faceMatchSummary(member)}</Text>
                      {faceMatchLimitation(member) ? <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{faceMatchLimitation(member)}</Text> : null}
                      {member?.provider === "deepface_arcface" ? <Text style={[styles.body, { color: colors.textSecondary }]}>{faceMatchMetrics(member)}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : !faceSimilarity?.status || faceSimilarity.status === "not_run" ? <EmptyState colors={colors}>{faceSimilarity?.summary || "Processing unavailable. Manually compare the original profile photo and video."}</EmptyState> : <>
                <Text style={[styles.body, { color: effectiveFaceMatchStatus(faceSimilarity) === "likely_same_person" ? "#10B981" : effectiveFaceMatchStatus(faceSimilarity) === "likely_different_person" ? "#EF4444" : colors.textSecondary }]}>{faceMatchLabel(effectiveFaceMatchStatus(faceSimilarity))}</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{faceMatchSummary(faceSimilarity)}</Text>
                {faceMatchLimitation(faceSimilarity) ? <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{faceMatchLimitation(faceSimilarity)}</Text> : null}
                {faceSimilarity?.provider === "deepface_arcface" ? <Text style={[styles.body, { color: colors.textSecondary }]}>{faceMatchMetrics(faceSimilarity)}</Text> : null}
              </>}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>DeepFace with ArcFace compares the profile photo with representative frames from the performance video. A single clear frame can now produce a limited advisory result; unclear frames stay inconclusive. This is not identity verification and is excluded from the AI Match Review score.</Text>
            </Section>

            <Section title="Portfolio Evidence" icon="images-outline" colors={colors}>
              {portfolio.length ? portfolio.map((url, index) => (
                <TouchableOpacity key={`${url}-${index}`} onPress={() => onOpenMedia(String(url), `Portfolio ${index + 1}`)} style={[styles.outlineButton, { borderColor: colors.border }]}>
                  <Ionicons name="open-outline" size={16} color={colors.primary} />
                  <Text numberOfLines={1} style={[styles.outlineButtonText, { color: colors.primary }]}>Open portfolio file {index + 1}</Text>
                </TouchableOpacity>
              )) : <EmptyState colors={colors}>No uploaded portfolio files were found. Manual review may be required.</EmptyState>}
              <Text style={[styles.body, { color: colors.textSecondary }]}>Analysis state: {aiReview ? titleCase(aiReview.status) : "Unavailable"}</Text>
              {aiReview?.overall_summary ? <Text style={[styles.body, { color: colors.textSecondary }]}>{aiReview.overall_summary}</Text> : null}
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
  headerCopy: { flex: 1, marginLeft: 12 },
  eyebrow: { fontFamily: "Poppins_600SemiBold", fontSize: 9, lineHeight: 13, letterSpacing: 1.25 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, lineHeight: 23 },
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
  flexOne: { flex: 1 },
  body: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 19 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 12, marginTop: 4 },
  disclaimer: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 16, marginTop: 5 },
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
  statusPill: { alignSelf: "flex-start", maxWidth: "100%", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, flexShrink: 1 },
  score: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  actionFooter: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, flexDirection: "row", gap: 10 },
  footerSecondaryButton: { flex: 0.8, minHeight: 48, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footerPrimaryButton: { flex: 1.2, minHeight: 48, borderRadius: 999, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  footerDangerButton: { flex: 1, minHeight: 48, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  readOnlyNotice: { flex: 1, minHeight: 46, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  readOnlyText: { fontFamily: "Poppins_500Medium", fontSize: 12 },
});
