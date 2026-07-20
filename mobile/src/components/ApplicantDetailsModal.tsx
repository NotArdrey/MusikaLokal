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
  onClose: () => void;
  onRetry: () => void;
  onOpenMedia: (url: string, title: string) => void;
  onAccept: (applicationId: string) => void;
  onDecline: (applicationId: string) => void;
};

const titleCase = (value: unknown) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);

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
        <Ionicons name={icon} size={19} color={colors.primary} />
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
        <Text key={`${String(value)}-${index}`} style={[styles.body, { color: colors.textSecondary }]}>• {String(value)}</Text>
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
  onClose,
  onRetry,
  onOpenMedia,
  onAccept,
  onDecline,
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
  const instruments = list(profile.skills);
  const recommendation = application.ai_recommendation || null;
  const aiReview = application.ai_portfolio_review || null;
  const evidence = list(aiReview?.evidence);
  const storedCvReview = list(aiReview?.source_summary?.cv_requirement_review);
  const cvDocumentClassification = aiReview?.source_summary?.cv_document_classification || null;
  const cvDocumentStatus = String(cvDocumentClassification?.status || "").toLowerCase();
  const cvEvidence = storedCvReview.length
    ? storedCvReview
    : evidence.filter((item) => list(item?.evidence).some((entry) => entry?.source === "cv"));
  const screening = screeningMeta(application.video_copyright_status);
  const portfolio = list(profile.portfolio_urls);
  const faceSimilarity = aiReview?.face_similarity || null;
  const groupFaceSimilarity = list(aiReview?.group_face_similarity);
  const isPending = String(application.status || "pending").toLowerCase() === "pending";

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
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Section title="Applicant Summary" icon="person-outline" colors={colors} defaultOpen>
              <View style={styles.profileRow}>
                <ProfileAvatar uri={avatar} size={58} />
                <View style={styles.flexOne}>
                  <Text style={[styles.profileName, { color: colors.text }]}>{name}</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{shortLocation(fullLocation)}</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>Full location: {fullLocation}</Text>
                </View>
              </View>
              <Text style={[styles.label, { color: colors.text }]}>Applied role or slot</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{titleCase(application.slot_type || (group ? "band" : "solo artist"))}</Text>
              <Text style={[styles.label, { color: colors.text }]}>Instruments</Text>
              <BulletList values={instruments} colors={colors} empty="No instruments were provided." />
              <Text style={[styles.label, { color: colors.text }]}>Genres</Text>
              <BulletList values={genres} colors={colors} empty="No genres were provided." />
              {profile.bio ? <Text style={[styles.body, { color: colors.textSecondary }]}>{profile.bio}</Text> : null}
            </Section>

            <Section title="Application Details" icon="information-circle-outline" colors={colors} defaultOpen>
              <Text style={[styles.body, { color: colors.textSecondary }]}>Applied {application.created_at ? new Date(application.created_at).toLocaleString() : "date unavailable"}</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>Status: {titleCase(application.status || "pending")}</Text>
              {application.pitch_message ? <Text style={[styles.body, { color: colors.textSecondary }]}>Message: {application.pitch_message}</Text> : <EmptyState colors={colors}>No application message was supplied.</EmptyState>}
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

            <Section title="Performance Video Rights" icon="shield-checkmark-outline" colors={colors}>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{application.video_copyright_acknowledged ? "Applicant confirmed ownership, license, or permission." : "No current rights declaration is recorded."}</Text>
            </Section>

            <Section title="Released-Recording Screening" icon="radio-outline" colors={colors}>
              <View style={[styles.statusPill, { borderColor: screening.color }]}>
                <Text style={[styles.statusPillText, { color: screening.color }]}>{screening.label}</Text>
              </View>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{screening.message}</Text>
              {application.video_copyright_metadata?.copyright_title ? <Text style={[styles.body, { color: colors.textSecondary }]}>Possible match: {application.video_copyright_metadata.copyright_title}{application.video_copyright_metadata.copyright_artist_label ? ` by ${application.video_copyright_metadata.copyright_artist_label}` : ""}</Text> : null}
              {application.video_copyright_metadata?.internal_match_playlist_title ? <Text style={[styles.body, { color: colors.textSecondary }]}>Playlist recording: {application.video_copyright_metadata.internal_match_playlist_title}{application.video_copyright_metadata.internal_match_playlist_artist ? ` by ${application.video_copyright_metadata.internal_match_playlist_artist}` : ""} ({String(application.video_copyright_metadata.internal_match_similarity_score || "strong")} match)</Text> : null}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Content-match screening is a review signal, not a legal copyright decision.</Text>
            </Section>

            <Section title="Optional Profile-Video Similarity" icon="person-circle-outline" colors={colors}>
              {!application.ai_portfolio_review_consent ? <EmptyState colors={colors}>Applicant consent for this optional review is not recorded.</EmptyState> : groupFaceSimilarity.length > 0 ? (
                <View style={styles.stackMedium}>
                  {groupFaceSimilarity.map((member, index) => (
                    <View key={member?.profile_id || index} style={[styles.memberSignal, { borderColor: colors.border }]}>
                      <Text style={[styles.label, { color: colors.text }]}>{member?.display_name || `Group member ${index + 1}`}</Text>
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{titleCase(member?.status || "unclear")}</Text>
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{member?.summary || "No comparison explanation was stored."}</Text>
                    </View>
                  ))}
                </View>
              ) : !faceSimilarity?.status || faceSimilarity.status === "not_run" ? <EmptyState colors={colors}>{faceSimilarity?.summary || "Processing unavailable. Manually compare the original profile photo and video."}</EmptyState> : <>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{titleCase(faceSimilarity.status)}</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{faceSimilarity.summary || "No explanation was stored."}</Text>
              </>}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Optional identity-consistency signal only. It is not identity verification and is excluded from the AI Filter score.</Text>
            </Section>

            <Section title="AI Filter Review" icon="sparkles-outline" colors={colors}>
              {!recommendation ? <EmptyState colors={colors}>AI Filter result unavailable. The applicant remains manually reviewable.</EmptyState> : <>
                <Text style={[styles.score, { color: colors.primary }]}>{recommendation.score == null ? "Score unavailable" : `${Number(recommendation.score)}%`}</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{recommendation.explanation || "No explanation was stored."}</Text>
                <Text style={[styles.label, { color: "#10B981" }]}>Requirements met</Text>
                <BulletList values={list(recommendation.matched_criteria)} colors={colors} empty="No matched requirements were recorded." />
                <Text style={[styles.label, { color: "#F59E0B" }]}>Missing or unclear requirements</Text>
                <BulletList values={list(recommendation.missing_criteria)} colors={colors} empty="No missing requirements were recorded." />
              </>}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Advisory only. All applicants remain accessible and require an organizer decision.</Text>
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
              <Text style={[styles.body, { color: colors.textSecondary }]}>• Application submitted {application.created_at ? new Date(application.created_at).toLocaleString() : "date unavailable"}</Text>
              {application.updated_at ? <Text style={[styles.body, { color: colors.textSecondary }]}>• Last updated {new Date(application.updated_at).toLocaleString()}</Text> : null}
              <Text style={[styles.body, { color: colors.textSecondary }]}>• Current status: {titleCase(application.status || "pending")}</Text>
            </Section>

            <Section title="Organizer Actions" icon="checkmark-done-outline" colors={colors} defaultOpen>
              {isPending ? <View style={styles.actionRow}>
                <TouchableOpacity testID="decline-applicant-details" onPress={() => onDecline(application.id)} style={[styles.actionButton, { borderColor: colors.border }]}>
                  <Text style={[styles.actionButtonText, { color: colors.text }]}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="accept-applicant-details" onPress={() => onAccept(application.id)} style={[styles.actionButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={[styles.actionButtonText, { color: "#FFF" }]}>Accept</Text>
                </TouchableOpacity>
              </View> : <EmptyState colors={colors}>Actions are unavailable for an application with status {titleCase(application.status)}.</EmptyState>}
            </Section>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  closeButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, marginLeft: 12 },
  eyebrow: { fontFamily: "Poppins_600SemiBold", fontSize: 10, letterSpacing: 1.2 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  scrollContent: { padding: 16, paddingBottom: 48, gap: 12 },
  centerState: { flex: 1, padding: 32, alignItems: "center", justifyContent: "center", gap: 14 },
  section: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  sectionHeader: { minHeight: 54, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  sectionTitle: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  sectionBody: { borderTopWidth: 1, padding: 14, gap: 9 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flexOne: { flex: 1 },
  profileName: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  body: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 19 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 12, marginTop: 4 },
  disclaimer: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 16, marginTop: 5 },
  stackSmall: { gap: 2 },
  stackMedium: { gap: 7 },
  memberSignal: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 3 },
  outlineButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  outlineButtonText: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  primaryButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#FFF", fontFamily: "Poppins_600SemiBold" },
  statusPill: { alignSelf: "flex-start", maxWidth: "100%", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, flexShrink: 1 },
  score: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionButton: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});
