import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../context/ThemeContext";

type Case = {
  id: string;
  user_id: string | null;
  uploader_name: string | null;
  uploader_email: string | null;
  file_name: string;
  media_kind: string;
  status: string;
  version: number;
  created_at: string;
  context: string;
  related_type: string | null;
  related_id: string | null;
  categories: string[];
  confidence: number | null;
  reason: string;
  provider: string | null;
  uploader: { full_name: string; email: string } | null;
};

type Details = {
  case: Case;
  previewUrl: string | null;
  mediaUrl: string | null;
  previousRejections: number;
  restrictedUntil: string | null;
  restrictionScopes: string[];
  history: {
    id: string;
    action: string;
    notes: string;
    created_at: string;
    actor: { full_name: string } | null;
    actor_name: string | null;
  }[];
};

type ButtonTone = "default" | "primary" | "danger";
type EvidenceView = "original" | "frame";
type UploadModerationStatus = "all" | "pending_review" | "reviewed";

type UploadModerationPanelProps = {
  filterStatus?: UploadModerationStatus;
  searchQuery?: string;
};

const label = (value: string) => value.replace(/_/g, " ");

async function invoke(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    "admin-reports-management",
    { body: { action, ...params } },
  );
  if (error) {
    const detail = await error.context
      ?.clone?.()
      .json()
      .catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function UploadModerationPanel({
  filterStatus = "all",
  searchQuery = "",
}: UploadModerationPanelProps) {
  const { colors, isDark } = useTheme();
  const { height, width } = useWindowDimensions();
  const isCompact = width < 720;
  const [cases, setCases] = useState<Case[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Case | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<string | null>(null);
  const [evidenceView, setEvidenceView] = useState<EvidenceView>("original");
  const [imageViewer, setImageViewer] = useState<{ url: string; title: string } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const saveInFlight = useRef(false);

  const load = useCallback(async (offset = 0) => {
    const request = ++listRequest.current;
    setBusy(true);
    setError("");
    try {
      const data = await invoke("fetch_upload_moderation_cases", { status: filterStatus, offset });
      if (request !== listRequest.current) return;
      setCases((previous) => offset ? [...previous, ...data.cases] : data.cases);
      setHasMore(data.hasMore);
    } catch (loadError) {
      if (request === listRequest.current) setError((loadError as Error).message);
    } finally {
      if (request === listRequest.current) setBusy(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    const requests = listRequest;
    const detailsRequests = detailRequest;
    setCases([]);
    void load();
    return () => {
      requests.current++;
      detailsRequests.current++;
    };
  }, [load]);

  const open = async (entry: Case) => {
    const request = ++detailRequest.current;
    setSelected(entry);
    setDetails(null);
    setNotes("");
    setDecision(null);
    setEvidenceView(entry.media_kind === "video" ? "original" : "frame");
    setError("");
    try {
      const data: Details = await invoke("fetch_upload_moderation_details", { caseId: entry.id });
      if (request !== detailRequest.current) return;
      setDetails(data);
      setEvidenceView(data.case.media_kind === "video" && data.mediaUrl ? "original" : "frame");
    } catch (detailError) {
      if (request === detailRequest.current) setError((detailError as Error).message);
    }
  };

  const close = () => {
    if (saveInFlight.current) return;
    detailRequest.current++;
    setSelected(null);
    setDetails(null);
    setDecision(null);
  };

  const review = async () => {
    if (!selected || !details || !decision || notes.trim().length < 3 || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setError("");
    try {
      await invoke("review_upload_moderation_case", {
        caseId: selected.id,
        decision,
        notes: notes.trim(),
        version: details.case.version,
      });
      setSelected(null);
      setDetails(null);
      setDecision(null);
      await load();
    } catch (reviewError) {
      setError((reviewError as Error).message);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const openImage = (url: string, title: string) => {
    setImageZoom(1);
    setImageViewer({ url, title });
  };

  const button = (
    title: string,
    onPress: () => void,
    disabled = false,
    tone: ButtonTone = "default",
    active = false,
  ) => {
    const backgroundColor = tone === "primary"
      ? colors.primary
      : tone === "danger"
        ? "#DC2626"
        : active
          ? colors.primaryLight
          : "transparent";
    const textColor = tone === "primary" || tone === "danger"
      ? "#FFFFFF"
      : active
        ? colors.primary
        : colors.text;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.button,
          {
            backgroundColor,
            borderColor: active ? colors.primary : colors.border,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
      </TouchableOpacity>
    );
  };

  const renderEvidenceImage = (url: string, title: string) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${title}. Open image viewer`}
      accessibilityHint="Opens a full-screen image with zoom controls"
      activeOpacity={0.9}
      onPress={() => openImage(url, title)}
      style={[styles.mediaFrame, { borderColor: colors.border }]}
    >
      <Image
        accessibilityLabel={title}
        source={{ uri: url }}
        style={[styles.media, { height: isCompact ? 300 : 440 }]}
        resizeMode="contain"
      />
      <View style={styles.zoomHint}>
        <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
        <Text style={styles.zoomHintText}>Open and zoom</Text>
      </View>
    </TouchableOpacity>
  );

  const statusBackground = details?.case.status === "pending_review"
    ? isDark ? "#422006" : "#FEF3C7"
    : colors.primaryLight;
  const statusForeground = details?.case.status === "pending_review"
    ? isDark ? "#FCD34D" : "#92400E"
    : colors.primary;
  const viewerWidth = Math.max(280, Math.min(width - (isCompact ? 24 : 120), 1200));
  const viewerHeight = Math.max(260, height - (isCompact ? 140 : 180));
  const visibleCases = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return cases;
    return cases.filter((entry) => [
      entry.file_name,
      entry.reason,
      entry.media_kind,
      entry.uploader?.full_name,
      entry.uploader?.email,
      entry.uploader_name,
      entry.uploader_email,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [cases, searchQuery]);

  const getCaseStatusTone = (caseStatus: string) => {
    if (caseStatus === "pending_review") {
      return {
        backgroundColor: isDark ? "#422006" : "#FFF7E6",
        borderColor: "#F59E0B",
        color: isDark ? "#FCD34D" : "#B45309",
        label: "Active",
      };
    }
    if (caseStatus === "approved") {
      return {
        backgroundColor: isDark ? "#052E16" : "#ECFDF3",
        borderColor: "#22C55E",
        color: isDark ? "#86EFAC" : "#15803D",
        label: "Approved",
      };
    }
    return {
      backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
      borderColor: colors.border,
      color: colors.textSecondary,
      label: "Rejected",
    };
  };

  return (
    <View style={styles.reportListSection} testID="admin-upload-moderation">
      <View style={[styles.reportListHeader, { borderBottomColor: colors.border }]}>
        <View style={styles.reportListHeaderCopy}>
          <View style={styles.reportListTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
            <Text style={[styles.reportListTitle, { color: colors.text }]}>AI-screened upload reports</Text>
          </View>
          <Text style={[styles.reportListSubtitle, { color: colors.textSecondary }]}>Private uploads flagged by automated screening for administrator review.</Text>
        </View>
        <View style={styles.reportHeaderActions}>
          <View style={[styles.reportCountPill, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF", borderColor: colors.border }]}>
            <Text style={[styles.reportCountText, { color: colors.text }]}>{visibleCases.length}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Refresh AI-screened upload reports"
            disabled={busy}
            onPress={() => void load()}
            style={[styles.refreshButton, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {error && !selected ? (
        <View style={[styles.alert, { borderColor: "#FCA5A5", backgroundColor: isDark ? "#450A0A" : "#FEF2F2" }]}>
          <Text accessibilityRole="alert" style={{ color: isDark ? "#FCA5A5" : "#991B1B" }}>{error}</Text>
        </View>
      ) : null}

      {visibleCases.map((entry) => {
        const tone = getCaseStatusTone(entry.status);
        const uploaderName = entry.uploader?.full_name || entry.uploader_name || "Deleted uploader";
        const uploaderEmail = entry.uploader?.email || entry.uploader_email || "no email";
        return (
          <View key={entry.id} style={[styles.caseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.reportCardHeader}>
              <View style={styles.reportCardTitleBlock}>
                <Text numberOfLines={1} style={[styles.reportCardTitle, { color: colors.text }]}>{entry.file_name}</Text>
                <Text numberOfLines={2} style={[styles.reportCardReason, { color: colors.textSecondary }]}>{entry.reason}</Text>
              </View>
              <View style={[styles.caseStatusPill, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
                <Text style={[styles.caseStatusText, { color: tone.color }]}>{tone.label}</Text>
              </View>
            </View>
            <View style={styles.reportMetaGrid}>
              <Text style={[styles.reportMetaText, { color: colors.textSecondary }]}>
                <Text style={[styles.reportMetaLabel, { color: colors.text }]}>Uploader: </Text>
                {uploaderName} ({uploaderEmail})
              </Text>
              <Text style={[styles.reportMetaText, { color: colors.textSecondary }]}>
                <Text style={[styles.reportMetaLabel, { color: colors.text }]}>Media: </Text>
                {label(entry.media_kind)}
              </Text>
              <Text style={[styles.reportMetaText, { color: colors.textSecondary }]}>
                <Text style={[styles.reportMetaLabel, { color: colors.text }]}>Created: </Text>
                {new Date(entry.created_at).toLocaleString()}
              </Text>
            </View>
            <View style={styles.reportCardActionsRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`View ${entry.file_name}`}
                onPress={() => void open(entry)}
                style={[styles.reportActionButton, { borderColor: colors.border, backgroundColor: isDark ? "#0F172A" : "#FFFFFF" }]}
              >
                <Ionicons name="eye-outline" size={14} color={colors.text} />
                <Text style={[styles.reportActionText, { color: colors.text }]}>View</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {busy ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary }}>Loading reports…</Text>
        </View>
      ) : !visibleCases.length && !error ? (
        <View style={[styles.reportEmptyPanel, { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: colors.border }]}>
          <Text style={[styles.reportEmptyText, { color: colors.textSecondary }]}>No AI-screened upload reports match this status and search.</Text>
        </View>
      ) : null}
      {hasMore ? button("Load more reports", () => void load(cases.length), busy) : null}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={close}>
        <View style={[styles.backdrop, isCompact && styles.compactBackdrop]}>
          <View style={[styles.modal, isCompact && styles.compactModal, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.modalTitleCopy}>
                <Text style={[styles.modalEyebrow, { color: colors.primary }]}>CONTENT REVIEW</Text>
                <Text style={[styles.heading, { color: colors.text }]}>Review flagged upload</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close review"
                disabled={saving}
                onPress={close}
                style={[styles.iconButton, { borderColor: colors.border, opacity: saving ? 0.45 : 1 }]}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
              {error ? (
                <View style={[styles.alert, { borderColor: "#FCA5A5", backgroundColor: isDark ? "#450A0A" : "#FEF2F2" }]}>
                  <Text accessibilityRole="alert" style={{ color: isDark ? "#FCA5A5" : "#991B1B" }}>{error}</Text>
                </View>
              ) : null}

              {!details ? (
                <View style={styles.detailLoading}>
                  {error ? button("Retry loading details", () => selected && void open(selected)) : (
                    <>
                      <ActivityIndicator color={colors.primary} size="large" />
                      <Text style={{ color: colors.textSecondary }}>Loading review evidence…</Text>
                    </>
                  )}
                </View>
              ) : (
                <>
                  <View style={styles.caseSummaryHeader}>
                    <View style={styles.caseSummaryTitle}>
                      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>{selected?.file_name}</Text>
                      <Text style={{ color: colors.textSecondary }}>
                        {selected?.uploader?.full_name || selected?.uploader_name || "Deleted uploader"}
                        {selected?.uploader?.email || selected?.uploader_email ? ` · ${selected?.uploader?.email || selected?.uploader_email}` : ""}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: statusBackground }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusForeground }]} />
                      <Text style={[styles.statusText, { color: statusForeground }]}>{label(details.case.status)}</Text>
                    </View>
                  </View>

                  <View style={[styles.sensitiveNotice, { backgroundColor: isDark ? "#292313" : "#FFFBEB", borderColor: isDark ? "#713F12" : "#FDE68A" }]}>
                    <Ionicons name="warning-outline" size={20} color={isDark ? "#FCD34D" : "#92400E"} />
                    <Text style={[styles.noticeText, { color: isDark ? "#FDE68A" : "#78350F" }]}>
                      Sensitive content. Review the evidence before choosing an action.
                    </Text>
                  </View>

                  <View style={styles.detailGrid}>
                    <View style={[styles.detailCell, !isCompact && styles.detailCellHalf]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Uploaded</Text>
                      <Text style={{ color: colors.text }}>{new Date(details.case.created_at).toLocaleString()}</Text>
                    </View>
                    <View style={[styles.detailCell, !isCompact && styles.detailCellHalf]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Associated with</Text>
                      <Text style={{ color: colors.text }}>
                        {details.case.related_type || label(details.case.context)}
                        {details.case.related_id ? ` · ${details.case.related_id}` : " · Draft upload"}
                      </Text>
                    </View>
                    <View style={[styles.detailCell, !isCompact && styles.detailCellHalf]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>AI categories</Text>
                      <Text style={{ color: colors.text }}>
                        {details.case.categories.length ? details.case.categories.join(", ") : "Not supplied by provider"}
                      </Text>
                    </View>
                    <View style={[styles.detailCell, !isCompact && styles.detailCellHalf]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>AI confidence</Text>
                      <Text style={{ color: colors.text }}>
                        {details.case.confidence === null ? "Not supplied by provider" : `${(details.case.confidence * 100).toFixed(1)}%`}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.reasonCard, { backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>AI screening reason</Text>
                    <Text style={{ color: colors.text }}>{details.case.reason}</Text>
                  </View>

                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>Evidence</Text>
                      <Text style={{ color: colors.textSecondary }}>
                        {details.case.media_kind === "video"
                          ? "Play the original upload or inspect the frame flagged by AI."
                          : "Select the image to inspect it at a larger size."}
                      </Text>
                    </View>
                    {button("Reload evidence", () => selected && void open(selected), saving)}
                  </View>

                  {details.case.media_kind === "video" && details.mediaUrl && details.previewUrl ? (
                    <View style={[styles.mediaTabs, { backgroundColor: colors.inputBackground }]}>
                      <TouchableOpacity
                        accessibilityRole="tab"
                        accessibilityState={{ selected: evidenceView === "original" }}
                        onPress={() => setEvidenceView("original")}
                        style={[styles.mediaTab, evidenceView === "original" && { backgroundColor: colors.card }]}
                      >
                        <Ionicons name="play-circle-outline" size={18} color={evidenceView === "original" ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.mediaTabText, { color: evidenceView === "original" ? colors.primary : colors.textSecondary }]}>Original video</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="tab"
                        accessibilityState={{ selected: evidenceView === "frame" }}
                        onPress={() => setEvidenceView("frame")}
                        style={[styles.mediaTab, evidenceView === "frame" && { backgroundColor: colors.card }]}
                      >
                        <Ionicons name="scan-outline" size={18} color={evidenceView === "frame" ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.mediaTabText, { color: evidenceView === "frame" ? colors.primary : colors.textSecondary }]}>AI flagged frame</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {details.case.media_kind === "video" && details.mediaUrl && evidenceView === "original" ? (
                    <View style={[styles.mediaFrame, { borderColor: colors.border }]}>
                      <Video
                        accessibilityLabel="Original flagged video"
                        source={{ uri: details.mediaUrl }}
                        style={[styles.media, { height: isCompact ? 300 : 440 }]}
                        resizeMode={ResizeMode.CONTAIN}
                        useNativeControls
                        shouldPlay={false}
                      />
                    </View>
                  ) : null}

                  {details.case.media_kind === "video" && details.previewUrl && evidenceView === "frame"
                    ? renderEvidenceImage(details.previewUrl, "Frame flagged by AI")
                    : null}
                  {details.case.media_kind === "photo" && (details.mediaUrl || details.previewUrl)
                    ? renderEvidenceImage(details.mediaUrl || details.previewUrl || "", "Image screened by AI")
                    : null}

                  {!details.previewUrl && !details.mediaUrl ? (
                    <View style={[styles.emptyEvidence, { borderColor: colors.border }]}>
                      <Ionicons name="cloud-offline-outline" size={28} color={colors.textSecondary} />
                      <Text style={[styles.title, { color: colors.text }]}>Evidence unavailable</Text>
                      <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
                        Evidence has not been attached. Approval is unavailable.
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.reviewMeta}>
                    <Text style={{ color: colors.textSecondary }}>Previous rejected uploads: {details.previousRejections}</Text>
                    {details.restrictedUntil ? (
                      <View style={styles.restrictionSummary}>
                        <Text style={{ color: colors.text }}>
                          Restricted until {new Date(details.restrictedUntil).toLocaleString()}
                        </Text>
                        <Text style={{ color: colors.textSecondary }}>
                          Scope: {details.restrictionScopes.includes("social_posting")
                            ? "Media uploads and social posts"
                            : "Media uploads only"}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>Decision</Text>
                      <Text style={{ color: colors.textSecondary }}>Choose an action, add a clear explanation, then confirm.</Text>
                    </View>
                  </View>
                  <TextInput
                    accessibilityLabel="Moderation decision notes"
                    placeholder="Explain your decision to the uploader…"
                    placeholderTextColor={colors.textSecondary}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    editable={!saving}
                    style={[
                      styles.notes,
                      { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground },
                    ]}
                  />
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>Minimum 3 characters. This note is sent to the uploader in the app and by email.</Text>

                  <View style={styles.actionRow}>
                    {details.case.status === "pending_review" ? (
                      <>
                        {button("Approve upload", () => setDecision("approve"), saving || (!details.previewUrl && !details.mediaUrl), "default", decision === "approve")}
                        {button("Reject upload", () => setDecision("reject"), saving, "default", decision === "reject")}
                      </>
                    ) : null}
                    {button("Warn user", () => setDecision("warn"), saving, "default", decision === "warn")}
                    {button("Restrict uploads for 7 days", () => setDecision("restrict_uploads_7_days"), saving, "danger", decision === "restrict_uploads_7_days")}
                    {button("Restrict uploads + posts for 7 days", () => setDecision("restrict_content_7_days"), saving, "danger", decision === "restrict_content_7_days")}
                    {details.restrictionScopes.includes("social_posting")
                      ? button("Allow social posting", () => setDecision("lift_posting_restriction"), saving, "default", decision === "lift_posting_restriction")
                      : null}
                    {details.restrictedUntil
                      ? button("Lift all restrictions", () => setDecision("lift_restriction"), saving, "default", decision === "lift_restriction")
                      : null}
                  </View>

                  {decision ? (
                    <View style={[styles.confirmCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                      <View style={styles.confirmCopy}>
                        <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
                        <View style={styles.confirmText}>
                          <Text style={[styles.title, { color: colors.text }]}>Confirm {label(decision)}</Text>
                          <Text style={{ color: colors.textSecondary }}>This action is recorded and the uploader will receive an in-app notification and email.</Text>
                        </View>
                      </View>
                      <View style={styles.actionRow}>
                        {button(saving ? "Saving decision…" : "Confirm decision", () => void review(), saving || notes.trim().length < 3, "primary")}
                        {button("Cancel", () => setDecision(null), saving)}
                      </View>
                    </View>
                  ) : null}

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Decision history</Text>
                  {details.history.length ? (
                    <View style={styles.historyList}>
                      {details.history.map((event) => (
                        <View key={event.id} style={[styles.historyItem, { borderColor: colors.border }]}>
                          <View style={[styles.historyDot, { backgroundColor: colors.primary }]} />
                          <View style={styles.historyCopy}>
                            <Text style={[styles.title, { color: colors.text }]}>
                              {label(event.action)} · {event.actor?.full_name || event.actor_name || (event.action === "ai_flagged" ? "AI screening" : "System")}
                            </Text>
                            <Text style={{ color: colors.textSecondary }}>{new Date(event.created_at).toLocaleString()}</Text>
                            <Text style={{ color: colors.text }}>{event.notes}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>No admin decisions yet.</Text>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!imageViewer}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setImageViewer(null)}
      >
        <View style={styles.imageViewerBackdrop}>
          <View style={[styles.imageToolbar, { width: viewerWidth }]}>
            <View style={styles.imageViewerTitleRow}>
              <Ionicons name="image-outline" size={20} color="#FFFFFF" />
              <Text numberOfLines={1} style={styles.imageViewerTitle}>{imageViewer?.title}</Text>
            </View>
            <View style={styles.zoomControls}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
                disabled={imageZoom <= 1}
                onPress={() => setImageZoom((zoom) => Math.max(1, zoom - 0.25))}
                style={[styles.darkIconButton, { opacity: imageZoom <= 1 ? 0.4 : 1 }]}
              >
                <Ionicons name="remove" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reset zoom" onPress={() => setImageZoom(1)} style={styles.zoomValue}>
                <Text style={styles.zoomValueText}>{Math.round(imageZoom * 100)}%</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
                disabled={imageZoom >= 3}
                onPress={() => setImageZoom((zoom) => Math.min(3, zoom + 0.25))}
                style={[styles.darkIconButton, { opacity: imageZoom >= 3 ? 0.4 : 1 }]}
              >
                <Ionicons name="add" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close image viewer" onPress={() => setImageViewer(null)} style={styles.darkIconButton}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.imageViewport, { height: viewerHeight, width: viewerWidth }]}>
            <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={imageZoom > 1}>
              <ScrollView bounces={false} showsVerticalScrollIndicator={imageZoom > 1}>
                {imageViewer ? (
                  <Image
                    accessibilityLabel={imageViewer.title}
                    source={{ uri: imageViewer.url }}
                    resizeMode="contain"
                    style={{ height: viewerHeight * imageZoom, width: viewerWidth * imageZoom }}
                  />
                ) : null}
              </ScrollView>
            </ScrollView>
          </View>
          <Text style={styles.imageViewerHelp}>Use the controls to zoom, then scroll to inspect the image.</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14, paddingVertical: 16 },
  heading: { fontSize: 22, fontWeight: "700" },
  title: { fontSize: 15, fontWeight: "600" },
  supportingText: { fontSize: 14, lineHeight: 21 },
  restrictionSummary: { gap: 2 },
  listHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  listHeaderCompact: { flexDirection: "column", alignItems: "stretch" },
  listHeadingCopy: { flex: 1, gap: 4 },
  button: { minHeight: 42, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 14, fontWeight: "600" },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  filterText: { fontSize: 14, fontWeight: "600", textTransform: "capitalize" },
  alert: { borderWidth: 1, borderRadius: 10, padding: 12 },
  caseCard: { padding: 16, gap: 14, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  caseCardCompact: { flexDirection: "column", alignItems: "stretch" },
  caseCardBody: { flex: 1, gap: 6 },
  caseTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  caseTitleCopy: { flex: 1, gap: 2 },
  mediaKindIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 18 },
  emptyState: { borderWidth: 1, borderStyle: "dashed", borderRadius: 14, padding: 28, alignItems: "center", gap: 8 },
  reportListSection: { gap: 10 },
  reportListHeader: {
    borderBottomWidth: 1,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  reportListHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  reportListTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  reportListTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  reportListSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Poppins_400Regular" },
  reportHeaderActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  reportCountPill: {
    borderWidth: 1,
    borderRadius: 999,
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  reportCountText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  refreshButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  reportCardHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  reportCardTitleBlock: { flex: 1, minWidth: 220, gap: 3 },
  reportCardTitle: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  reportCardReason: { fontSize: 12, lineHeight: 18, fontFamily: "Poppins_400Regular" },
  caseStatusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  caseStatusText: { fontSize: 11, fontFamily: "Poppins_600SemiBold" },
  reportMetaGrid: { marginTop: 4, flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 2 },
  reportMetaText: { flexGrow: 1, flexBasis: 280, fontSize: 12, lineHeight: 18, fontFamily: "Poppins_400Regular" },
  reportMetaLabel: { fontFamily: "Poppins_600SemiBold" },
  reportCardActionsRow: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", justifyContent: "flex-end", gap: 8 },
  reportActionButton: {
    flexBasis: 126,
    minWidth: 112,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  reportActionText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  reportEmptyPanel: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  reportEmptyText: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center" },
  backdrop: { flex: 1, backgroundColor: "#000A", alignItems: "center", justifyContent: "center", padding: 24 },
  compactBackdrop: { padding: 0 },
  modal: { width: "100%", maxWidth: 1040, maxHeight: "94%", borderRadius: 18, overflow: "hidden" },
  compactModal: { maxHeight: "100%", height: "100%", borderRadius: 0 },
  modalHeader: { borderBottomWidth: 1, paddingHorizontal: 22, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  modalTitleCopy: { flex: 1 },
  modalEyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  iconButton: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  modalContent: { padding: 22, gap: 16 },
  detailLoading: { padding: 48, alignItems: "center", justifyContent: "center", gap: 12 },
  caseSummaryHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  caseSummaryTitle: { flex: 1, gap: 4 },
  fileName: { fontSize: 19, fontWeight: "700" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  statusDot: { width: 7, height: 7, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  sensitiveNotice: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 10, padding: 12 },
  noticeText: { flex: 1, fontSize: 13, fontWeight: "500" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailCell: { width: "100%", gap: 4 },
  detailCellHalf: { width: "48%", flexGrow: 1 },
  detailLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  reasonCard: { borderRadius: 10, padding: 13, gap: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  mediaTabs: { flexDirection: "row", alignSelf: "flex-start", padding: 4, borderRadius: 12, gap: 3 },
  mediaTab: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9 },
  mediaTabText: { fontSize: 13, fontWeight: "600" },
  mediaFrame: { width: "100%", backgroundColor: "#09090B", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  media: { width: "100%", backgroundColor: "#09090B" },
  zoomHint: { position: "absolute", right: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#000B", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  zoomHintText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  emptyEvidence: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, minHeight: 180, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  reviewMeta: { gap: 5, paddingTop: 2 },
  divider: { height: 1, width: "100%", marginVertical: 2 },
  notes: { borderWidth: 1, padding: 13, minHeight: 104, borderRadius: 10, textAlignVertical: "top", fontSize: 14 },
  helperText: { fontSize: 12, marginTop: -10 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  confirmCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 14 },
  confirmCopy: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  confirmText: { flex: 1, gap: 3 },
  historyList: { gap: 10 },
  historyItem: { flexDirection: "row", gap: 12, borderLeftWidth: 1, paddingLeft: 14, paddingVertical: 4 },
  historyDot: { width: 9, height: 9, borderRadius: 999, marginLeft: -19, marginTop: 5 },
  historyCopy: { flex: 1, gap: 3 },
  imageViewerBackdrop: { flex: 1, backgroundColor: "#050505F7", alignItems: "center", justifyContent: "center", padding: 12 },
  imageToolbar: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 10 },
  imageViewerTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  imageViewerTitle: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  zoomControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  darkIconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF1F", borderRadius: 9 },
  zoomValue: { minWidth: 58, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF1F", borderRadius: 9, paddingHorizontal: 8 },
  zoomValueText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  imageViewport: { backgroundColor: "#111111", overflow: "hidden" },
  imageViewerHelp: { color: "#A1A1AA", fontSize: 12, paddingTop: 8 },
});
