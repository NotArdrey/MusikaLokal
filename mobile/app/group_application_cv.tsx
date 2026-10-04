import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import DocumentUploader from "../src/components/DocumentUploader";
import { assertCvDocument } from "../src/utils/cvDocument";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { useRequireAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { radius, typography } from "../src/theme/tokens";
import { sanitizeStorageFileName, uploadStorageObject } from "../src/utils/storageUpload";

const readFunctionError = async (error: any, fallback: string) => {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const body = await error.context.json();
      if (typeof body?.error === "string" && body.error.trim()) return body.error;
    }
  } catch {
    // Fall through to the safe message.
  }
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return message && !message.includes("non-2xx status code") ? message : fallback;
};

export default function GroupApplicationCvScreen() {
  const { colors, isDark } = useTheme();
  const { userId, isAuthenticated } = useRequireAuth();
  const params = useLocalSearchParams<{ applicationId?: string }>();
  const applicationId = typeof params.applicationId === "string" ? params.applicationId : "";
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
  }>({ type: "info", title: "", message: "" });

  const showAlert = (type: AlertType, title: string, message: string) => {
    setAlertConfig({ type, title, message });
    setAlertVisible(true);
  };

  const loadDetails = useCallback(async () => {
    if (!applicationId || !isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("gig-applications", {
      body: { action: "fetch_group_application_cv_status", applicationId, userId },
    });
    if (error || data?.error) {
      showAlert(
        "error",
        "Unable to Load Application",
        data?.error || await readFunctionError(error, "Please refresh and try again."),
      );
    } else {
      setDetails(data);
    }
    setLoading(false);
  }, [applicationId, isAuthenticated, userId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadDetails();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadDetails]);

  const ownMember = useMemo(
    () => (details?.members || []).find((member: any) => member.is_current_user),
    [details],
  );
  const application = details?.application;
  const isComplete = application?.member_cv_status === "complete";
  const submittedCount = Number(application?.member_cv_submitted_count || 0);
  const requiredCount = Number(application?.member_cv_required_count || details?.members?.length || 0);

  const uploadCv = async () => {
    if (!file || !userId) {
      showAlert("warning", "Select Your CV", "Choose your CV or resume before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const contentType = assertCvDocument(file);
      const extension = file.name?.split(".").pop() || "pdf";
      const filename = sanitizeStorageFileName(file.name || `cv.${extension}`, `cv.${extension}`);
      const path = `${userId}/gig-applications/${applicationId}/${Date.now()}_${filename}`;
      const { data: upload, error: uploadError } = await uploadStorageObject({
        bucket: "application-cvs",
        path,
        uri: file.uri,
        contentType,
        documentOnly: true,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.functions.invoke("gig-applications", {
        body: {
          action: "submit_member_cv",
          applicationId,
          userId,
          cvStoragePath: upload.path,
          cvFilename: filename,
          aiReviewConsent: true,
          memberVerificationConsent: true,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || await readFunctionError(error, "Your CV could not be submitted."));
      }
      setFile(null);
      await loadDetails();
      showAlert(
        "success",
        "CV Submitted",
        data?.status === "ready"
          ? "Every member has completed their CV. The group leader can now send the application to the gig organizer."
          : "Your CV was added to the group application.",
      );
    } catch (error: any) {
      showAlert("error", "Submission Failed", error?.message || "Your CV could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const finalizeApplication = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("gig-applications", {
      body: { action: "finalize_group_application", applicationId, userId },
    });
    if (error || data?.error) {
      showAlert(
        "error",
        "Application Not Sent",
        data?.error || await readFunctionError(error, "Please check every member CV and try again."),
      );
    } else {
      await loadDetails();
      showAlert(
        "success",
        "Application Sent",
        "The complete group application is now visible to the gig organizer.",
      );
    }
    setSubmitting(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Group Application" overline="Member CVs" />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.secondary, { color: colors.textSecondary }]}>Loading application…</Text>
          </View>
        ) : !application ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Application unavailable</Text>
            <Text style={[styles.secondary, { color: colors.textSecondary }]}>Open this task again from Notifications or Bookings.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>{application.group?.name || "Group"}</Text>
              <Text style={[styles.title, { color: colors.text }]}>{application.gig?.name || "Gig application"}</Text>
              {!!application.gig?.location && (
                <Text style={[styles.secondary, { color: colors.textSecondary }]}>{application.gig.location}</Text>
              )}
              <View style={[styles.progressTrack, { backgroundColor: isDark ? "#374151" : "#E5E7EB" }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${requiredCount > 0 ? Math.min(100, (submittedCount / requiredCount) * 100) : 0}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                {submittedCount} of {requiredCount} member CVs submitted
              </Text>
              <View style={styles.sharedRow}>
                <Ionicons name="videocam-outline" size={18} color="#10B981" />
                <Text style={[styles.memberMeta, { color: colors.text }]}>Shared performance video saved for the whole group</Text>
              </View>
            </View>

            {!isComplete && ownMember && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Your CV</Text>
                {ownMember.cv_status === "submitted" && (
                  <View style={styles.successRow}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={[styles.memberMeta, { color: colors.text }]}>Submitted{ownMember.cv_filename ? `: ${ownMember.cv_filename}` : ""}</Text>
                  </View>
                )}
                <DocumentUploader
                  label={ownMember.cv_status === "submitted" ? "Replace Your CV/Resume" : "Upload Your CV/Resume"}
                  onFileSelect={setFile}
                />
                <TouchableOpacity
                  activeOpacity={0.82}
                  disabled={!file || submitting}
                  onPress={uploadCv}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !file || submitting ? 0.5 : 1 }]}
                >
                  {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />}
                  <Text style={styles.primaryButtonText}>{ownMember.cv_status === "submitted" ? "Replace CV" : "Submit CV"}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Member progress</Text>
              {(details.members || []).map((member: any) => {
                const submitted = member.cv_status === "submitted";
                return (
                  <View key={member.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                    <Ionicons
                      name={submitted ? "checkmark-circle" : "time-outline"}
                      size={22}
                      color={submitted ? "#10B981" : "#F59E0B"}
                    />
                    <View style={styles.memberText}>
                      <Text style={[styles.memberName, { color: colors.text }]}>{member.member_name}{member.is_current_user ? " (You)" : ""}</Text>
                      <Text style={[styles.memberMeta, { color: colors.textSecondary }]}>
                        {[member.role, member.instrument].filter(Boolean).join(" · ") || "Group member"}
                      </Text>
                    </View>
                    <Text style={[styles.statusText, { color: submitted ? "#10B981" : "#F59E0B" }]}>
                      {submitted ? "Submitted" : "Waiting"}
                    </Text>
                  </View>
                );
              })}
            </View>

            {details.can_finalize && !isComplete && (
              <TouchableOpacity
                activeOpacity={0.82}
                disabled={submitting}
                onPress={finalizeApplication}
                style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
              >
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send-outline" size={18} color="#FFFFFF" />}
                <Text style={styles.primaryButtonText}>Send Complete Application</Text>
              </TouchableOpacity>
            )}

            {isComplete && (
              <View style={[styles.completeCard, { borderColor: "#10B981", backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5" }]}>
                <Ionicons name="checkmark-circle" size={26} color="#10B981" />
                <View style={styles.memberText}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Application sent</Text>
                  <Text style={[styles.secondary, { color: colors.textSecondary }]}>The organizer can now review the complete group application.</Text>
                </View>
              </View>
            )}

          </>
        )}
      </ScrollView>
      <Navbar />
      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 120, gap: 14, width: "100%", maxWidth: 760, alignSelf: "center" },
  loading: { paddingVertical: 64, alignItems: "center", gap: 12 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16 },
  eyebrow: { fontFamily: typography.bold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 },
  title: { fontFamily: typography.title, fontSize: 21, lineHeight: 27, marginTop: 3 },
  sectionTitle: { fontFamily: typography.heading, fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: typography.body, fontSize: 13, lineHeight: 19, marginTop: 4 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 16, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  progressText: { fontFamily: typography.medium, fontSize: 12, marginTop: 7 },
  sharedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  successRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 12 },
  primaryButton: { minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  primaryButtonText: { color: "#FFFFFF", fontFamily: typography.semibold, fontSize: 14 },
  memberRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  memberText: { flex: 1 },
  memberName: { fontFamily: typography.semibold, fontSize: 14, lineHeight: 20 },
  memberMeta: { fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  statusText: { fontFamily: typography.semibold, fontSize: 11 },
  completeCard: { borderWidth: 1, borderRadius: radius.card, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
});
