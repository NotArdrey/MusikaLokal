import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";
import { ResizeMode, Video } from "expo-av";
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
  history: {
    id: string;
    action: string;
    notes: string;
    created_at: string;
    actor: { full_name: string } | null;
    actor_name: string | null;
  }[];
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

export default function UploadModerationPanel() {
  const { colors } = useTheme();
  const [cases, setCases] = useState<Case[]>([]);
  const [status, setStatus] = useState("pending_review");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Case | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<string | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const saveInFlight = useRef(false);
  const load = useCallback(
    async (offset = 0) => {
      const request = ++listRequest.current;
      setBusy(true);
      setError("");
      try {
        const data = await invoke("fetch_upload_moderation_cases", {
          status,
          offset,
        });
        if (request !== listRequest.current) return;
        setCases((previous) =>
          offset ? [...previous, ...data.cases] : data.cases,
        );
        setHasMore(data.hasMore);
      } catch (error) {
        if (request === listRequest.current) setError((error as Error).message);
      } finally {
        if (request === listRequest.current) setBusy(false);
      }
    },
    [status],
  );
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
    setError("");
    try {
      const data = await invoke("fetch_upload_moderation_details", {
        caseId: entry.id,
      });
      if (request === detailRequest.current) setDetails(data);
    } catch (error) {
      if (request === detailRequest.current) setError((error as Error).message);
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
    if (
      !selected ||
      !details ||
      !decision ||
      notes.trim().length < 3 ||
      saveInFlight.current
    )
      return;
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
    } catch (error) {
      setError((error as Error).message);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };
  const button = (title: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={{ color: colors.primary }}>{title}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={styles.section} testID="admin-upload-moderation">
      <Text style={[styles.heading, { color: colors.text }]}>
        AI-blocked uploads
      </Text>
      <Text style={{ color: colors.textSecondary }}>
        Private image and video reports awaiting human review. Approval lets the
        uploader submit the same media again.
      </Text>
      <View style={styles.row}>
        {["pending_review", "approved", "rejected", "all"].map((filter) => (
          <TouchableOpacity
            key={filter}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === status }}
            onPress={() => setStatus(filter)}
            style={[
              styles.button,
              {
                borderColor: filter === status ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>{label(filter)}</Text>
          </TouchableOpacity>
        ))}
        {button("Refresh reports", () => void load(), busy)}
      </View>
      {error && !selected ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {error}
        </Text>
      ) : null}
      {cases.map((entry) => (
        <View
          key={entry.id}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            {entry.file_name}
          </Text>
          <Text style={{ color: colors.text }}>
            {entry.uploader?.full_name || entry.uploader_name || "Deleted uploader"} · {entry.uploader?.email || entry.uploader_email}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {entry.media_kind} · {label(entry.status)} ·{" "}
            {new Date(entry.created_at).toLocaleString()}
          </Text>
          <Text style={{ color: colors.textSecondary }}>{entry.reason}</Text>
          {button("Review upload", () => void open(entry))}
        </View>
      ))}
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : !cases.length && !error ? (
        <Text style={{ color: colors.textSecondary }}>
          No upload moderation cases in this view.
        </Text>
      ) : null}
      {hasMore
        ? button("Load more reports", () => void load(cases.length), busy)
        : null}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <View style={styles.row}>
              <Text style={[styles.heading, { color: colors.text }]}>
                Review flagged upload
              </Text>
              {button("Close", close, saving)}
            </View>
            <ScrollView contentContainerStyle={styles.section}>
              {error ? (
                <Text accessibilityRole="alert" style={{ color: colors.text }}>
                  {error}
                </Text>
              ) : null}
              {!details ? (
                error ? (
                  button("Retry details", () => selected && void open(selected))
                ) : (
                  <ActivityIndicator color={colors.primary} />
                )
              ) : (
                <>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {selected?.file_name}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    {selected?.uploader?.full_name || selected?.uploader_name} ·{" "}
                    {selected?.uploader?.email || selected?.uploader_email}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    Uploaded:{" "}
                    {new Date(details.case.created_at).toLocaleString()}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    Status: {label(details.case.status)}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    Associated with:{" "}
                    {details.case.related_type || label(details.case.context)}
                    {details.case.related_id
                      ? ` · ${details.case.related_id}`
                      : " (draft upload)"}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    AI categories:{" "}
                    {details.case.categories.length
                      ? details.case.categories.join(", ")
                      : "Not supplied by provider"}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    AI confidence:{" "}
                    {details.case.confidence === null
                      ? "Not supplied by provider"
                      : `${(details.case.confidence * 100).toFixed(1)}%`}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    {details.case.reason}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    Previous rejected uploads: {details.previousRejections}
                  </Text>
                  {details.restrictedUntil ? (
                    <Text style={{ color: colors.text }}>
                      Uploads restricted until:{" "}
                      {new Date(details.restrictedUntil).toLocaleString()}
                    </Text>
                  ) : null}
                  {details.previewUrl ? (
                    <>
                      <Text style={{ color: colors.textSecondary }}>
                        {details.case.media_kind === "video"
                          ? "Frame flagged by AI"
                          : "Image screened by AI"}
                      </Text>
                      <Image
                        accessibilityLabel="Private AI-flagged evidence"
                        source={{ uri: details.previewUrl }}
                        style={styles.preview}
                        resizeMode="contain"
                      />
                    </>
                  ) : null}
                  {details.mediaUrl && details.case.media_kind === "video" ? (
                    <Video
                      source={{ uri: details.mediaUrl }}
                      style={styles.preview}
                      resizeMode={ResizeMode.CONTAIN}
                      useNativeControls
                      shouldPlay={false}
                    />
                  ) : null}
                  {!details.previewUrl &&
                  details.mediaUrl &&
                  details.case.media_kind === "photo" ? (
                    <Image
                      source={{ uri: details.mediaUrl }}
                      style={styles.preview}
                      resizeMode="contain"
                    />
                  ) : null}
                  {!details.previewUrl && !details.mediaUrl ? (
                    <Text style={{ color: colors.text }}>
                      Evidence has not been attached. Approval is unavailable.
                    </Text>
                  ) : null}
                  {button(
                    "Reload preview / latest case",
                    () => selected && void open(selected),
                    saving,
                  )}
                  <TextInput
                    accessibilityLabel="Moderation decision notes"
                    placeholder="Explain your decision (sent to uploader)"
                    placeholderTextColor={colors.textSecondary}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    editable={!saving}
                    style={[
                      styles.notes,
                      { color: colors.text, borderColor: colors.border },
                    ]}
                  />
                  <View style={styles.row}>
                    {details.case.status === "pending_review" ? (
                      <>
                        {button(
                          "Approve",
                          () => setDecision("approve"),
                          saving || (!details.previewUrl && !details.mediaUrl),
                        )}
                        {button("Reject", () => setDecision("reject"), saving)}
                      </>
                    ) : null}
                    {button("Warn user", () => setDecision("warn"), saving)}
                    {button(
                      "Restrict uploads for 7 days",
                      () => setDecision("restrict_7_days"),
                      saving,
                    )}
                    {details.restrictedUntil
                      ? button(
                          "Lift upload restriction",
                          () => setDecision("lift_restriction"),
                          saving,
                        )
                      : null}
                  </View>
                  {decision ? (
                    <View style={styles.card}>
                      <Text style={{ color: colors.text }}>
                        Confirm: {label(decision)}. This decision will be
                        recorded and the uploader notified.
                      </Text>
                      {button(
                        saving ? "Saving decision…" : "Confirm decision",
                        () => void review(),
                        saving || notes.trim().length < 3,
                      )}
                      {button(
                        "Cancel decision",
                        () => setDecision(null),
                        saving,
                      )}
                    </View>
                  ) : null}
                  <Text style={[styles.title, { color: colors.text }]}>
                    Decision history
                  </Text>
                  {details.history.length ? (
                    details.history.map((event) => (
                      <View key={event.id} style={styles.card}>
                        <Text style={{ color: colors.text }}>
                          {label(event.action)} ·{" "}
                          {event.actor?.full_name || event.actor_name || (event.action === "ai_flagged" ? "AI screening" : "System")}
                        </Text>
                        <Text style={{ color: colors.textSecondary }}>
                          {new Date(event.created_at).toLocaleString()} ·{" "}
                          {event.notes}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      No admin decisions yet.
                    </Text>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 12, paddingVertical: 16 },
  heading: { fontSize: 22, fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  button: { padding: 10, borderWidth: 1, borderRadius: 8 },
  card: { padding: 14, gap: 8, borderWidth: 1, borderRadius: 12 },
  backdrop: {
    flex: 1,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 800,
    maxHeight: "90%",
    padding: 20,
    borderRadius: 16,
  },
  preview: { width: "100%", height: 280, backgroundColor: "#111" },
  notes: { borderWidth: 1, padding: 12, minHeight: 80, borderRadius: 8 },
});
