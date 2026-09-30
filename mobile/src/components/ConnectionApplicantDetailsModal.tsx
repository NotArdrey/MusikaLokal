import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ProfileAvatar from "./ProfileAvatar";
import InAppMediaViewer from "./InAppMediaViewer";

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
  application: any | null;
  colors: Colors;
  entityLabel: "group" | "production team";
  busy?: boolean;
  onClose: () => void;
  onAccept: (application: any) => void;
  onDecline: (application: any) => void;
  onOpenMedia: (url: string, title: string) => void;
};

const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const titleCase = (value: unknown) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const recommendationMeta = (statusValue: unknown) => {
  const status = String(statusValue || "insufficient_data").toLowerCase();
  if (status === "recommended") return { label: "Recommended", color: "#059669", soft: "#ECFDF5", icon: "checkmark-circle" as const };
  if (status === "needs_review") return { label: "Needs review", color: "#D97706", soft: "#FFFBEB", icon: "warning" as const };
  if (status === "not_eligible") return { label: "Required item not confirmed", color: "#DC2626", soft: "#FEF2F2", icon: "close-circle" as const };
  return { label: "Match unavailable", color: "#6B7280", soft: "#F3F4F6", icon: "information-circle" as const };
};

export default function ConnectionApplicantDetailsModal({
  visible,
  application,
  colors,
  entityLabel,
  busy = false,
  onClose,
  onAccept,
  onDecline,
  onOpenMedia,
}: Props) {
  const [portraitViewer, setPortraitViewer] = React.useState<{ url: string; title: string } | null>(null);
  React.useEffect(() => {
    if (!visible) setPortraitViewer(null);
  }, [visible]);
  if (!application) return null;
  const details = application?.event_details?.request_details || {};
  const applicant = application?.applicant || {};
  const senderGroup = application?.sender_group || null;
  const recommendation = application?.ai_recommendation || null;
  const verification = application?.member_verification || null;
  const usesVerifiedIdPortrait = verification?.reference_source === "verified_id_portrait";
  const requirementResults = list(recommendation?.criteria_snapshot?.requirement_results);
  const matched = list(recommendation?.matched_criteria).map(String);
  const missing = list(recommendation?.missing_criteria).map(String);
  const confirmedCount = requirementResults.filter((row) => row?.status === "met").length || matched.length;
  const attentionCount = requirementResults.filter((row) => row?.status !== "met").length || missing.length;
  const score = recommendation?.score === null || recommendation?.score === undefined
    ? null
    : Math.max(0, Math.min(100, Math.round(Number(recommendation.score))));
  const meta = recommendationMeta(recommendation?.recommendation_status);
  const name = senderGroup?.name || applicant?.full_name || "Applicant";
  const avatar = senderGroup?.images?.[0] || applicant?.avatar_url || null;
  const status = String(application?.status || "pending").toLowerCase();
  const isPending = status === "pending";
  const cvUrl = details?.cv_url || application?.attachment_url;
  const videoUrl = details?.video_url;
  const skills = list(applicant?.skills);
  const genres = senderGroup?.genre
    ? String(senderGroup.genre).split(",").map((item) => item.trim()).filter(Boolean)
    : list(applicant?.genres);

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity accessibilityLabel="Close applicant details" onPress={onClose} style={[styles.closeButton, { borderColor: colors.border }]}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>APPLICANT REVIEW</Text>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>{name}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.profileRow}>
              <ProfileAvatar uri={avatar} size={64} backgroundColor={colors.inputBackground} iconColor={colors.primary} />
              <View style={styles.profileCopy}>
                <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>{name}</Text>
                <Text style={[styles.role, { color: colors.primary }]}>{senderGroup?.group_type || applicant?.location || "Musician"}</Text>
                <Text style={[styles.status, { color: colors.textSecondary }]}>Application status: {titleCase(status)}</Text>
              </View>
            </View>

            <View style={[styles.matchPanel, { backgroundColor: colors.primary + "0D" }]}>
              <View style={styles.matchHeader}>
                <View style={styles.matchTitleRow}>
                  <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
                  <Text style={[styles.matchTitle, { color: colors.text }]}>Review Summary</Text>
                </View>
                <Text style={[styles.score, { color: colors.primary }]}>{score === null ? "Unavailable" : `${score}%`}</Text>
              </View>
              {score !== null ? (
                <View style={[styles.progressTrack, { backgroundColor: colors.primary + "1A" }]}>
                  <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${score}%` }]} />
                </View>
              ) : null}
              <View style={[styles.recommendationBanner, { backgroundColor: meta.soft }]}>
                <Ionicons name={meta.icon} size={19} color={meta.color} />
                <Text style={[styles.recommendationLabel, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <View style={styles.metrics}>
                <View style={[styles.metric, { backgroundColor: "#ECFDF5" }]}>
                  <Text style={[styles.metricValue, { color: "#059669" }]}>{confirmedCount}</Text>
                  <Text style={[styles.metricLabel, { color: "#047857" }]}>Confirmed</Text>
                </View>
                <View style={[styles.metric, { backgroundColor: attentionCount > 0 ? "#FFFBEB" : "#F3F4F6" }]}>
                  <Text style={[styles.metricValue, { color: attentionCount > 0 ? "#D97706" : "#6B7280" }]}>{attentionCount}</Text>
                  <Text style={[styles.metricLabel, { color: attentionCount > 0 ? "#B45309" : "#6B7280" }]}>Need review</Text>
                </View>
              </View>
              <Text style={[styles.summary, { color: colors.textSecondary }]}>
                {recommendation?.explanation || `No server recommendation is available for this ${entityLabel} application.`}
              </Text>
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Advisory only. All applicants remain accessible and require an owner or manager decision.</Text>
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-circle-outline" size={19} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Registered Member Verification</Text>
            </View>
            {verification ? (
              <>
                <View style={[styles.verificationBanner, { backgroundColor: verification.result === "verified" ? "#ECFDF5" : "#FFFBEB" }]}>
                  <Ionicons
                    name={verification.result === "verified" ? "checkmark-circle" : verification.status === "processing" || verification.status === "queued" ? "time" : "warning"}
                    size={21}
                    color={verification.result === "verified" ? "#059669" : "#D97706"}
                  />
                  <View style={styles.requirementCopy}>
                    <Text style={[styles.requirementTitle, { color: verification.result === "verified" ? "#047857" : "#B45309" }]}>
                      {verification.result === "verified" ? "Applicant found in the submitted video" : verification.status === "processing" ? "Verification is processing" : verification.status === "queued" ? "Verification is queued" : verification.result === "no_reference" ? usesVerifiedIdPortrait ? "Verified ID portrait unavailable" : "Registered photo unavailable" : "Manual verification needed"}
                    </Text>
                    <Text style={[styles.requirementDetail, { color: colors.textSecondary }]}>{usesVerifiedIdPortrait ? "This consent-gated check compares the holder portrait from the applicant's approved government ID verification with faces in the submitted video. The full ID is not shown; only the face crop below may be viewed. The result does not change the match score." : "This historical result used the applicant's registered profile photo. New checks use the holder portrait from the approved government ID verification."}</Text>
                  </View>
                </View>
                {list(verification.members).map((member, index) => (
                  <View key={`${member?.member_id || "member"}-${index}`} style={[styles.memberVerificationCard, { backgroundColor: colors.inputBackground }]}>
                    {member?.reference_portrait_url ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`View government ID holder portrait for ${member?.member_name_snapshot || `registered member ${index + 1}`}`}
                        onPress={() => setPortraitViewer({
                          url: member.reference_portrait_url,
                          title: `${member?.member_name_snapshot || `Registered Member ${index + 1}`} - ID Holder Portrait`,
                        })}
                        style={styles.portraitRow}
                      >
                        <ProfileAvatar uri={member.reference_portrait_url} size={54} backgroundColor={colors.surface} iconColor={colors.primary} cachePolicy="none" />
                        <View style={styles.portraitCopy}>
                          <Text style={[styles.requirementTitle, { color: colors.text }]}>Government ID holder portrait</Text>
                          <Text style={[styles.requirementDetail, { color: colors.primary }]}>Tap to view the face crop used for verification</Text>
                        </View>
                      </TouchableOpacity>
                    ) : null}
                    <Text style={[styles.body, { color: colors.textSecondary }]}>
                      {member?.member_name_snapshot || `Registered member ${index + 1}`}: {member?.status === "verified" ? "verified" : "needs review"}. Best similarity: {member?.best_similarity === null || member?.best_similarity === undefined ? "Unavailable" : `${Number(member.best_similarity).toFixed(1)}%`}
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.body, { color: colors.textSecondary }]}>{application?.member_verification_consent === true ? "Registered member verification was requested, but a result is not available yet." : "The applicant did not request registered member verification for this application."}</Text>
            )}
          </View>

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="checkmark-done-outline" size={19} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Qualification Review</Text>
            </View>
            {requirementResults.length > 0 ? requirementResults.map((row, index) => {
              const met = row?.status === "met";
              const unclear = row?.status === "unclear";
              const color = met ? "#059669" : unclear ? "#D97706" : "#DC2626";
              return (
                <View key={`${row?.key || "requirement"}-${index}`} style={[styles.requirement, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                  <Ionicons name={met ? "checkmark-circle" : unclear ? "warning" : "close-circle"} size={20} color={color} />
                  <View style={styles.requirementCopy}>
                    <Text style={[styles.requirementTitle, { color: colors.text }]}>{row?.label || "Requirement"}</Text>
                    <Text style={[styles.requirementDetail, { color: colors.textSecondary }]}>{row?.detail || "No details recorded."}</Text>
                    <Text style={[styles.source, { color }]}>Source: {titleCase(row?.source || "application")}</Text>
                  </View>
                </View>
              );
            }) : (
              <Text style={[styles.body, { color: colors.textSecondary }]}>No structured requirement results were recorded.</Text>
            )}
          </View>

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={19} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Applicant Overview</Text>
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Application message</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{details?.application_context || details?.pitch_message || application?.message || "No application message provided."}</Text>
            <Text style={[styles.label, { color: colors.text }]}>Roles and instruments</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{skills.length > 0 ? skills.join(", ") : "Not provided"}</Text>
            <Text style={[styles.label, { color: colors.text }]}>Genres</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{genres.length > 0 ? genres.join(", ") : "Not provided"}</Text>
            <Text style={[styles.label, { color: colors.text }]}>Submitted files</Text>
            <View style={styles.mediaRow}>
              {cvUrl ? (
                <TouchableOpacity onPress={() => onOpenMedia(cvUrl, "Applicant CV")} style={[styles.mediaButton, { borderColor: colors.primary }]}>
                  <Ionicons name="document-text-outline" size={17} color={colors.primary} />
                  <Text style={[styles.mediaText, { color: colors.primary }]}>View CV</Text>
                </TouchableOpacity>
              ) : null}
              {videoUrl ? (
                <TouchableOpacity onPress={() => onOpenMedia(videoUrl, "Performance Video")} style={[styles.mediaButton, { borderColor: colors.primary }]}>
                  <Ionicons name="videocam-outline" size={17} color={colors.primary} />
                  <Text style={[styles.mediaText, { color: colors.primary }]}>View Video</Text>
                </TouchableOpacity>
              ) : null}
              {!cvUrl && !videoUrl ? <Text style={[styles.body, { color: colors.textSecondary }]}>No files submitted.</Text> : null}
            </View>
          </View>
        </ScrollView>

        {isPending ? (
          <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity disabled={busy} onPress={() => onDecline(application)} style={[styles.actionButton, { borderColor: "#DC2626", opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.actionText, { color: "#DC2626" }]}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => onAccept(application)} style={[styles.actionButton, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[styles.actionText, { color: "#FFFFFF" }]}>Accept</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
    <InAppMediaViewer
      visible={Boolean(portraitViewer)}
      uri={portraitViewer?.url || null}
      title={portraitViewer?.title}
      sensitive
      onClose={() => setPortraitViewer(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 68, borderBottomWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  closeButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontFamily: "Poppins_600SemiBold", fontSize: 9, letterSpacing: 1.2 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  heroCard: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 14 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  profileCopy: { flex: 1 },
  name: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  role: { fontFamily: "Poppins_500Medium", fontSize: 12, textTransform: "capitalize" },
  status: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 3 },
  matchPanel: { borderRadius: 15, padding: 14, gap: 10 },
  matchHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  matchTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  matchTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  score: { fontFamily: "Poppins_700Bold", fontSize: 17 },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  recommendationBanner: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, padding: 10 },
  recommendationLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  metrics: { flexDirection: "row", gap: 9 },
  metric: { flex: 1, borderRadius: 11, padding: 10 },
  metricValue: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  metricLabel: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  summary: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 },
  disclaimer: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14 },
  section: { borderWidth: 1, borderRadius: 17, padding: 14, gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  requirement: { borderWidth: 1, borderRadius: 12, padding: 11, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  requirementCopy: { flex: 1 },
  verificationBanner: { borderRadius: 12, padding: 11, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  memberVerificationCard: { borderRadius: 12, padding: 11, gap: 8 },
  portraitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  portraitCopy: { flex: 1, minWidth: 0 },
  requirementTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  requirementDetail: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17, marginTop: 2 },
  source: { fontFamily: "Poppins_500Medium", fontSize: 9, marginTop: 5 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 11, marginTop: 5 },
  body: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 },
  mediaRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  mediaButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  mediaText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  footer: { borderTopWidth: 1, padding: 14, flexDirection: "row", gap: 10 },
  actionButton: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});
