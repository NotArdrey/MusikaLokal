import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createGig,
  deleteGig,
  loadApplicationDebug,
  loadGig,
  loadSessionContext,
  pollApplicationDebug,
  safeMessage,
  submitApplication,
  updateGig,
  uploadContract,
  uploadGigImages,
  validateGigForm,
  type SessionContext,
} from "./_mobileParity";
import { colors, styles } from "./_styles";
import {
  EMPTY_GIG_FORM,
  type ApplicationFormValue,
  type DebugStage,
  type GigFormValue,
  type LoadedGig,
  type PortalResult,
  type PortalTab,
} from "./_types";
import { PH_MUSIC_GROUP_TYPES } from "../../../src/constants/groupTypes";
import GigSpecificSlotRequirements from "../../../src/components/GigSpecificSlotRequirements";
import { normalizeSpecificSlotRequirements } from "../../../src/utils/gigSlotRequirements";

// TEST HARNESS DIFFERENCE:
// Mobile behavior: the gig workflow is spread across full-screen routes, sheets,
// and upload components.
// Web testing behavior: the same contracts are exposed in one internal route with
// stage-by-stage diagnostics.
// Reason: this page is an internal parity/debug harness, not a production UX.

type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  multiline?: boolean;
  wide?: boolean;
  editable?: boolean;
};

const Field = ({ label, value, onChange, required, hint, multiline, wide, editable = true }: InputProps) => (
  <View style={[styles.field, wide && styles.fieldWide]}>
    <Text style={styles.label}>{label}{required ? " *" : ""}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      editable={editable}
      multiline={multiline}
      style={[styles.input, multiline && styles.inputMultiline, !editable && styles.buttonDisabled]}
      placeholderTextColor={colors.muted}
    />
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>
);

const Button = ({ children, onPress, secondary = false, destructive = false, disabled = false }: {
  children: React.ReactNode;
  onPress: () => void;
  secondary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) => (
  <TouchableOpacity
    activeOpacity={0.78}
    disabled={disabled}
    onPress={onPress}
    style={[styles.button, secondary && styles.buttonSecondary, destructive && styles.buttonDestructive, disabled && styles.buttonDisabled]}
  >
    <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, destructive && styles.buttonTextDestructive]}>{children}</Text>
  </TouchableOpacity>
);

const CounterButton = ({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label === "+" ? "Increase count" : "Decrease count"}
    activeOpacity={0.78}
    disabled={disabled}
    onPress={onPress}
    style={[styles.counterButton, disabled && styles.buttonDisabled]}
  >
    <Text style={styles.counterButtonText}>{label}</Text>
  </TouchableOpacity>
);

const SlotCounter = ({ title, count, onChange, children }: {
  title: string;
  count: number;
  onChange: (count: number) => void;
  children?: React.ReactNode;
}) => (
  <View style={styles.counterCard}>
    <View style={styles.counterHeader}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.counterControls}>
        <CounterButton label="−" disabled={count === 0} onPress={() => onChange(Math.max(0, count - 1))} />
        <Text style={styles.counterValue}>{count}</Text>
        <CounterButton label="+" onPress={() => onChange(count + 1)} />
      </View>
    </View>
    {count > 0 ? children : null}
  </View>
);

const GigCardPreview = ({ gig }: { gig: LoadedGig }) => (
  <View style={styles.gigPreview}>
    {gig.images?.[0]
      ? <Image source={{ uri: gig.images[0] }} style={styles.gigPreviewImage} />
      : <View style={styles.gigPreviewPlaceholder}><Text style={styles.gigPreviewPlaceholderText}>♪</Text></View>}
    <View style={{ flex: 1 }}>
      <Text style={styles.bannerTitle}>{gig.name}</Text>
      <Text style={styles.hint}>Status: {gig.status}</Text>
    </View>
  </View>
);

const parseCountedList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

const Checkbox = ({ label, checked, onPress, hint }: { label: string; checked: boolean; onPress: () => void; hint?: string }) => (
  <TouchableOpacity activeOpacity={0.78} onPress={onPress} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked }}>
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  </TouchableOpacity>
);

const WebFileInput = ({ accept, multiple, onFiles, disabled }: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) => {
  if (Platform.OS !== "web") return <Text style={styles.warning}>This internal route accepts browser files on web only.</Text>;
  return React.createElement("input", {
    type: "file",
    accept,
    multiple,
    disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length > 0) onFiles(files);
      event.target.value = "";
    },
    style: {
      color: colors.text,
      background: colors.surfaceRaised,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      padding: 10,
      width: "100%",
      boxSizing: "border-box",
    },
  });
};

const StatusIcon = ({ state }: { state: DebugStage["state"] }) => {
  const content = state === "success" ? "✓" : state === "processing" ? "⏳" : state === "failed" ? "✕" : state === "warning" ? "⚠" : "•";
  const color = state === "success" ? colors.accent : state === "failed" ? colors.danger : state === "warning" ? colors.warning : state === "processing" ? colors.info : colors.muted;
  return <Text style={{ color, width: 20, fontFamily: "Poppins_700Bold" }}>{content}</Text>;
};

const redactDebugValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === "string") return value
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/([?&](?:access_token|apikey|api_key|token|jwt|secret|password)=)[^&#\s]+/gi, "$1[redacted]");
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactDebugValue(item, seen));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    /^(?:api_?key|access_?token|service_?role(?:_?key)?|jwt|secret|password|authorization|genre_evidence_receipt)$/i.test(key)
      ? "[redacted]"
      : redactDebugValue(item, seen),
  ]));
};

const JsonBlock = ({ value }: { value: unknown }) => (
  <Text selectable style={styles.mono}>{JSON.stringify(redactDebugValue(value), null, 2)}</Text>
);

const StageList = ({ stages }: { stages: DebugStage[] }) => {
  if (stages.length === 0) return <Text style={styles.empty}>No test stages have run yet.</Text>;
  const grouped = stages.reduce((map, item) => {
    const entries = map.get(item.group) || [];
    entries.push(item);
    map.set(item.group, entries);
    return map;
  }, new Map<string, DebugStage[]>());
  return <View style={{ gap: 18 }}>
    {Array.from(grouped.entries()).map(([group, entries]) => (
      <View key={group} style={{ gap: 10 }}>
        <Text style={styles.sectionTitle}>{group}</Text>
        {entries.map((item) => (
          <View key={item.id} style={styles.stage}>
            <View style={styles.stageHeader}>
              <StatusIcon state={item.state} />
              <Text style={styles.stageLabel}>{item.label}</Text>
              {typeof item.durationMs === "number" ? <Text style={styles.pillText}>{item.durationMs} ms</Text> : null}
            </View>
            {item.message ? <Text style={styles.stageMessage}>{item.message}</Text> : null}
            {(item.databaseOperation || item.storagePath || item.edgeFunction || item.httpStatus || item.startedAt) ? (
              <View style={{ gap: 2 }}>
                {item.databaseOperation ? <Text style={styles.hint}>Database: {item.databaseOperation}</Text> : null}
                {item.storagePath ? <Text style={styles.hint}>Storage: {item.storagePath}</Text> : null}
                {item.edgeFunction ? <Text style={styles.hint}>Edge Function: {item.edgeFunction}</Text> : null}
                {item.httpStatus ? <Text style={styles.hint}>HTTP status: {item.httpStatus}</Text> : null}
                {item.startedAt ? <Text style={styles.hint}>Started: {item.startedAt}</Text> : null}
                {item.finishedAt ? <Text style={styles.hint}>Finished: {item.finishedAt}</Text> : null}
              </View>
            ) : null}
            {item.details ? <JsonBlock value={item.details} /> : null}
          </View>
        ))}
      </View>
    ))}
  </View>;
};

const GigFormEditor = ({ value, onChange, busy, onImages, onContract, allowPermitUrl = false }: {
  value: GigFormValue;
  onChange: React.Dispatch<React.SetStateAction<GigFormValue>>;
  busy: boolean;
  onImages: (files: File[]) => void;
  onContract: (files: File[]) => void;
  allowPermitUrl?: boolean;
}) => {
  const [scheduleNotice, setScheduleNotice] = useState<{ kind: "success" | "warning"; text: string } | null>(null);
  const [groupNotice, setGroupNotice] = useState("");
  const [customGroupType, setCustomGroupType] = useState("");
  const set = (key: keyof GigFormValue, next: any) => onChange((current) => ({ ...current, [key]: next }));
  const addSchedule = () => {
    if (!value.eventDate || !value.eventStartTime || !value.eventEndTime) {
      setScheduleNotice({ kind: "warning", text: "Choose a date, start time, and end time." });
      return;
    }
    const next = { date: value.eventDate, start_time: value.eventStartTime, end_time: value.eventEndTime };
    const duplicate = value.schedules.some((item) => JSON.stringify(item) === JSON.stringify(next));
    onChange((current) => ({
      ...current,
      schedules: duplicate ? current.schedules : [...current.schedules, next],
      eventDate: "",
      eventStartTime: "06:00 PM",
      eventEndTime: "11:00 PM",
    }));
    setScheduleNotice(duplicate
      ? { kind: "warning", text: "This date and time is already added. The fields were reset." }
      : { kind: "success", text: "Date and time added. The fields were reset." });
  };
  const slotCount = (key: "soloSlots" | "duoSlots" | "bandSlots") => Math.max(0, Math.floor(Number(value[key]) || 0));
  const setSlotCount = (key: "soloSlots" | "duoSlots" | "bandSlots", count: number) => onChange((current) => {
    const safeCount = Math.max(0, count);
    return {
      ...current,
      [key]: String(safeCount),
      ...(key === "bandSlots" ? { bandGroupTypes: parseCountedList(current.bandGroupTypes).slice(0, safeCount).join(", ") } : {}),
      ...(key === "soloSlots" ? {
        soloSpecificRequirements: normalizeSpecificSlotRequirements(current.soloSpecificRequirements, safeCount, "solo", {
          roles: current.soloRoles.split(",").map((item) => item.trim()).filter(Boolean),
          preferred_genres: current.soloGenres.split(",").map((item) => item.trim()).filter(Boolean),
          preferred_instruments: current.soloInstruments.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      } : {}),
      ...(key === "duoSlots" ? {
        duoSpecificRequirements: normalizeSpecificSlotRequirements(current.duoSpecificRequirements, safeCount, "duo", {
          roles: current.duoRoles.split(",").map((item) => item.trim()).filter(Boolean),
          preferred_genres: current.duoGenres.split(",").map((item) => item.trim()).filter(Boolean),
          preferred_instruments: current.duoInstruments.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      } : {}),
    };
  });
  const groupTypes = parseCountedList(value.bandGroupTypes);
  const addGroupType = (groupType: string) => {
    const normalized = groupType.trim();
    if (!normalized) return;
    if (groupTypes.length >= slotCount("bandSlots")) {
      setGroupNotice("Increase the Group Type count before assigning another type.");
      return;
    }
    set("bandGroupTypes", [...groupTypes, normalized].join(", "));
    setGroupNotice("");
    setCustomGroupType("");
  };
  const removeGroupType = (groupType: string) => {
    const index = groupTypes.lastIndexOf(groupType);
    if (index < 0) return;
    set("bandGroupTypes", groupTypes.filter((_, itemIndex) => itemIndex !== index).join(", "));
  };
  const criterion = (key: keyof GigFormValue["recommendation"]["criteria"]) => (
    <Checkbox
      key={key}
      label={`${key[0].toUpperCase()}${key.slice(1)} required`}
      hint={{
        genres: "Checks the genres selected for this slot or gig.",
        instruments: "Checks the roles and instruments selected for this slot.",
        location: "Checks whether the applicant is near the gig.",
        portfolio: "Checks whether the applicant provided a portfolio, video, or CV.",
      }[key]}
      checked={value.recommendation.criteria[key] === "required"}
      onPress={() => onChange((current) => ({
        ...current,
        recommendation: {
          ...current.recommendation,
          criteria: { ...current.recommendation.criteria, [key]: current.recommendation.criteria[key] === "required" ? "ignore" : "required" },
        },
      }))}
    />
  );

  return <View style={{ gap: 14 }}>
    <Text style={styles.sectionTitle}>Gig details</Text>
    <View style={styles.grid}>
      <Field label="Gig name" required value={value.name} onChange={(text) => set("name", text)} hint={`${value.name.length}/120`} />
      <Field label="Payout amount" required value={value.budget} onChange={(text) => set("budget", text)} />
      <Field label="Description" required wide multiline value={value.description} onChange={(text) => set("description", text)} hint={`${value.description.length}/1000`} />
      <Field label="Address" required wide value={value.location} onChange={(text) => set("location", text)} />
      <Field label="Latitude" value={value.latitude} onChange={(text) => set("latitude", text)} hint="Optional; mobile location picker supplies this." />
      <Field label="Longitude" value={value.longitude} onChange={(text) => set("longitude", text)} hint="Optional; mobile location picker supplies this." />
    </View>

    <Text style={styles.sectionTitle}>Event schedule</Text>
    <View style={styles.grid}>
      <Field label="Date (YYYY-MM-DD)" required value={value.eventDate} onChange={(text) => set("eventDate", text)} />
      <Field label="Start time" required value={value.eventStartTime} onChange={(text) => set("eventStartTime", text)} hint="Mobile format: 06:00 PM" />
      <Field label="End time" required value={value.eventEndTime} onChange={(text) => set("eventEndTime", text)} hint="Mobile format: 11:00 PM" />
    </View>
    <View style={styles.buttonRow}>
      <Button secondary onPress={addSchedule}>Add date/time condition</Button>
    </View>
    {scheduleNotice ? <Text style={scheduleNotice.kind === "warning" ? styles.warning : styles.success}>{scheduleNotice.text}</Text> : null}
    {value.schedules.map((item, index) => (
      <View key={`${item.date}-${item.start_time}-${index}`} style={styles.row}>
        <Text style={styles.stageMessage}>{item.date} · {item.start_time}–{item.end_time}</Text>
        <Button secondary onPress={() => set("schedules", value.schedules.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
      </View>
    ))}

    <Text style={styles.sectionTitle}>Media and document uploads</Text>
    <View style={styles.grid}>
      <View style={styles.field}>
        <Text style={styles.label}>Event photos *</Text>
        <WebFileInput accept="image/*" multiple disabled={busy} onFiles={onImages} />
        <Text style={styles.hint}>{value.imageUrls.length}/10 uploaded to the `listings` bucket. The first URL is the thumbnail.</Text>
        {value.imageUrls.map((url, index) => <View key={url} style={styles.row}>
          <Text numberOfLines={1} style={[styles.hint, { flex: 1 }]}>{index === 0 ? "Thumbnail · " : ""}{url}</Text>
          {index > 0 ? <Button secondary onPress={() => set("imageUrls", [url, ...value.imageUrls.filter((_, itemIndex) => itemIndex !== index)])}>Set thumbnail</Button> : null}
          <Button secondary onPress={() => set("imageUrls", value.imageUrls.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
        </View>)}
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Custom contract (optional PDF)</Text>
        <WebFileInput accept="application/pdf" disabled={busy} onFiles={onContract} />
        <Text style={styles.hint}>{value.contractUrl || "No contract uploaded."}</Text>
      </View>
      {allowPermitUrl ? <Field label="Business permit public URL" value={value.businessPermitUrl} onChange={(text) => set("businessPermitUrl", text)} hint="Edit parity: changing this URL resets permit review when the mobile rules allow it." wide /> : null}
    </View>

    <Text style={styles.sectionTitle}>General requirements</Text>
    <View style={styles.grid}>
      <Field label="Genres" value={value.genres} onChange={(text) => set("genres", text)} hint="Comma-separated; optional in mobile." />
      <Field label="Supplied equipment / instruments" value={value.instruments} onChange={(text) => set("instruments", text)} hint="Comma-separated; optional in mobile." />
      <Field label="Reapplication cooldown (hours)" value={value.reapplicationCooldownHours} onChange={(text) => set("reapplicationCooldownHours", text)} hint="Starts at 720 hours (30 days)." />
    </View>

    <Text style={styles.sectionTitle}>Musician slots</Text>
    <SlotCounter title="Solo" count={slotCount("soloSlots")} onChange={(count) => setSlotCount("soloSlots", count)}>
      <GigSpecificSlotRequirements slotType="solo" value={value.soloSpecificRequirements} onChange={(items) => set("soloSpecificRequirements", items)} />
      <View style={styles.grid}>
        <Field label="Shared roles" value={value.soloRoles} onChange={(text) => set("soloRoles", text)} />
        <Field label="Shared preferred genres" value={value.soloGenres} onChange={(text) => set("soloGenres", text)} />
        <Field label="Shared preferred instruments" value={value.soloInstruments} onChange={(text) => set("soloInstruments", text)} />
      </View>
    </SlotCounter>
    <SlotCounter title="Duos (2 members)" count={slotCount("duoSlots")} onChange={(count) => setSlotCount("duoSlots", count)}>
      <GigSpecificSlotRequirements slotType="duo" value={value.duoSpecificRequirements} onChange={(items) => set("duoSpecificRequirements", items)} />
      <View style={styles.grid}>
        <Field label="Shared roles" value={value.duoRoles} onChange={(text) => set("duoRoles", text)} />
        <Field label="Shared preferred genres" value={value.duoGenres} onChange={(text) => set("duoGenres", text)} />
        <Field label="Shared preferred instruments" value={value.duoInstruments} onChange={(text) => set("duoInstruments", text)} />
      </View>
    </SlotCounter>
    <SlotCounter title="Group Type" count={slotCount("bandSlots")} onChange={(count) => setSlotCount("bandSlots", count)}>
      <Text style={styles.hint}>Choose a type for each group slot ({groupTypes.length}/{slotCount("bandSlots")} assigned).</Text>
      {groupNotice ? <Text style={styles.warning}>{groupNotice}</Text> : null}
      <View style={styles.grid}>
        <Field label="Roles" value={value.bandRoles} onChange={(text) => set("bandRoles", text)} />
        <Field label="Preferred genres" value={value.bandGenres} onChange={(text) => set("bandGenres", text)} />
        <Field label="Preferred instruments" value={value.bandInstruments} onChange={(text) => set("bandInstruments", text)} />
      </View>
      <View style={styles.groupTypeList}>
        {PH_MUSIC_GROUP_TYPES.map((type) => {
          const typeCount = groupTypes.filter((item) => item === type.id).length;
          return <View key={type.id} style={styles.groupTypeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{type.label}</Text>
              {typeCount > 0 ? <Text style={styles.hint}>{typeCount} slot{typeCount === 1 ? "" : "s"}</Text> : null}
            </View>
            <CounterButton label="−" disabled={typeCount === 0} onPress={() => removeGroupType(type.id)} />
            <CounterButton label="+" disabled={groupTypes.length >= slotCount("bandSlots")} onPress={() => addGroupType(type.id)} />
          </View>;
        })}
      </View>
      <View style={styles.customGroupTypeRow}>
        <TextInput
          value={customGroupType}
          onChangeText={setCustomGroupType}
          placeholder="Add another group type"
          placeholderTextColor={colors.muted}
          style={[styles.input, { flex: 1 }]}
        />
        <Button secondary disabled={!customGroupType.trim() || groupTypes.length >= slotCount("bandSlots")} onPress={() => addGroupType(customGroupType)}>Add</Button>
      </View>
      {Array.from(new Set(groupTypes.filter((item) => !PH_MUSIC_GROUP_TYPES.some((type) => type.id === item)))).map((type) => {
        const typeCount = groupTypes.filter((item) => item === type).length;
        return <View key={type} style={styles.groupTypeRow}>
          <Text style={[styles.label, { flex: 1 }]}>{type} ({typeCount})</Text>
          <CounterButton label="−" onPress={() => removeGroupType(type)} />
          <CounterButton label="+" disabled={groupTypes.length >= slotCount("bandSlots")} onPress={() => addGroupType(type)} />
        </View>;
      })}
    </SlotCounter>

    <Text style={styles.sectionTitle}>Recommendation settings</Text>
    <Checkbox label="Enable applicant recommendations" checked={value.recommendation.enabled} onPress={() => onChange((current) => ({ ...current, recommendation: { ...current.recommendation, enabled: !current.recommendation.enabled } }))} />
    <Text style={styles.hint}>Required criteria must match. Ignored criteria are not checked.</Text>
    <View style={styles.grid}>
      <Field label="Minimum score" value={String(value.recommendation.minimum_score)} onChange={(text) => onChange((current) => ({ ...current, recommendation: { ...current.recommendation, minimum_score: Number(text) || 0 } }))} />
      <Field label="Location radius km" value={value.recommendation.location_radius_km == null ? "" : String(value.recommendation.location_radius_km)} onChange={(text) => onChange((current) => ({ ...current, recommendation: { ...current.recommendation, location_radius_km: text ? Number(text) : null } }))} hint="Allowed mobile values: 5, 10, 25, 50, 100, or blank for any." />
    </View>
    <View style={styles.grid}>{(["genres", "instruments", "location", "portfolio"] as const).map(criterion)}</View>
  </View>;
};

export default function GigTestingPage() {
  const [tab, setTab] = useState<PortalTab>("create");
  const [context, setContext] = useState<SessionContext | null>(null);
  const [contextError, setContextError] = useState("");
  const [createForm, setCreateForm] = useState<GigFormValue>(() => ({ ...EMPTY_GIG_FORM, recommendation: { ...EMPTY_GIG_FORM.recommendation, criteria: { ...EMPTY_GIG_FORM.recommendation.criteria } } }));
  const [editForm, setEditForm] = useState<GigFormValue>(() => ({ ...EMPTY_GIG_FORM, recommendation: { ...EMPTY_GIG_FORM.recommendation, criteria: { ...EMPTY_GIG_FORM.recommendation.criteria } } }));
  const [editGigId, setEditGigId] = useState("");
  const [loadedEditGig, setLoadedEditGig] = useState<LoadedGig | null>(null);
  const [deleteGigId, setDeleteGigId] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [applicationGigId, setApplicationGigId] = useState("");
  const [applicationGig, setApplicationGig] = useState<LoadedGig | null>(null);
  const [applicationForm, setApplicationForm] = useState<ApplicationFormValue>({ gigId: "", selectedGroupId: "", slotType: "", pitchMessage: "", aiPortfolioReviewConsent: false });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success" | "warning"; text: string } | null>(null);
  const [stages, setStages] = useState<DebugStage[]>([]);
  const stagesRef = useRef<DebugStage[]>([]);
  const [result, setResult] = useState<PortalResult | null>(null);
  const [debugApplicationId, setDebugApplicationId] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);

  const reportStage = useCallback((next: DebugStage) => {
    const index = stagesRef.current.findIndex((item) => item.id === next.id);
    stagesRef.current = index >= 0
      ? stagesRef.current.map((item, itemIndex) => itemIndex === index ? next : item)
      : [...stagesRef.current, next];
    setStages(stagesRef.current);
  }, []);

  useEffect(() => {
    void loadSessionContext().then(setContext).catch((error) => setContextError(safeMessage(error)));
  }, []);

  const selectTab = (nextTab: PortalTab) => {
    if (nextTab !== "results" && nextTab !== tab) {
      stagesRef.current = [];
      setStages([]);
      setNotice(null);
    }
    setTab(nextTab);
  };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try { await action(); } catch (error) { setNotice({ kind: "error", text: safeMessage(error) }); }
    finally { setBusy(false); }
  };

  const uploadImagesInto = (setter: React.Dispatch<React.SetStateAction<GigFormValue>>) => (files: File[]) => run(async () => {
    if (!context) throw new Error("Session profile is still loading.");
    const uploaded = await uploadGigImages(files, context.userId, reportStage);
    setter((current) => ({ ...current, imageUrls: [...current.imageUrls, ...uploaded.urls].slice(0, 10) }));
  });
  const uploadContractInto = (setter: React.Dispatch<React.SetStateAction<GigFormValue>>) => (files: File[]) => run(async () => {
    if (!context || !files[0]) throw new Error("Session profile is still loading.");
    const uploaded = await uploadContract(files[0], context.userId, reportStage);
    setter((current) => ({ ...current, contractUrl: uploaded.url }));
  });

  const submitCreate = () => run(async () => {
    const validation = validateGigForm(createForm);
    if (validation) throw new Error(validation);
    const next = await createGig(createForm, reportStage);
    const merged = { ...next, stages: stagesRef.current, completedAt: new Date().toISOString() };
    setResult(merged);
    setNotice({ kind: "success", text: `Gig ${next.gigId} created with the mobile database contract.` });
    setTab("results");
  });

  const fetchEditGig = () => run(async () => {
    const loaded = await loadGig(editGigId);
    setLoadedEditGig(loaded.gig);
    setEditForm(loaded.form);
    setNotice({ kind: "success", text: `Loaded gig ${loaded.gig.id}.` });
  });

  const submitEdit = () => run(async () => {
    if (!loadedEditGig) throw new Error("Load a gig before saving changes.");
    const next = await updateGig(loadedEditGig, editForm, reportStage);
    setResult({ ...next, stages: stagesRef.current, completedAt: new Date().toISOString() });
    setNotice({ kind: "success", text: `Gig ${next.gigId} updated through update_gig_with_cooldown_safely.` });
    setTab("results");
  });

  const submitDelete = () => run(async () => {
    const next = await deleteGig(deleteGigId, deleteReason, reportStage);
    setResult({ ...next, stages: stagesRef.current, completedAt: new Date().toISOString() });
    setLoadedEditGig((current) => current?.id === next.gigId ? null : current);
    setApplicationGig((current) => current?.id === next.gigId ? null : current);
    setNotice({ kind: "success", text: `Gig ${next.gigId} deleted safely.` });
    setDeleteGigId("");
    setDeleteReason("");
    setTab("results");
  });

  const fetchApplicationGig = () => run(async () => {
    const loaded = await loadGig(applicationGigId);
    setApplicationGig(loaded.gig);
    setApplicationForm((current) => ({ ...current, gigId: loaded.gig.id }));
    setNotice({ kind: "success", text: `Loaded ${loaded.gig.name}.` });
  });

  const submitMusicianApplication = () => run(async () => {
    if (!context) throw new Error("Session profile is still loading.");
    if (!applicationGig) throw new Error("Load a gig before applying.");
    const next = await submitApplication(context, applicationGig, applicationForm, { cv: cvFile, video: videoFile }, reportStage);
    setDebugApplicationId(next.applicationId || "");
    setResult({ ...next, stages: stagesRef.current, completedAt: new Date().toISOString() });
    setNotice({ kind: "success", text: `Application ${next.applicationId} saved. Watching real backend review stages…` });
    setTab("results");
    if (next.applicationId && applicationForm.aiPortfolioReviewConsent) {
      const debug = await pollApplicationDebug(next.applicationId, reportStage);
      setResult((current) => current ? { ...current, ...debug, stages: stagesRef.current, completedAt: new Date().toISOString() } : current);
    }
  });

  const fetchDebug = () => run(async () => {
    const debug = await loadApplicationDebug(debugApplicationId);
    const next: PortalResult = {
      operation: "load_debug", success: true, gigId: debug.application.gig_id,
      applicationId: debug.application.id, organizerId: undefined, profileId: debug.application.applicant_id,
      createdStatus: debug.application.status, backendResult: debug.application,
      aiReview: debug.aiReview, recommendation: debug.recommendation,
      stages: stagesRef.current, completedAt: new Date().toISOString(),
    };
    setResult(next);
    setNotice({ kind: "success", text: `Loaded application ${debug.application.id}.` });
  });

  const tabs: { id: PortalTab; label: string }[] = [
    { id: "create", label: "Create Gig" },
    { id: "edit", label: "Edit Gig" },
    { id: "delete", label: "Delete Gig" },
    { id: "application", label: "Musician Application" },
    { id: "results", label: "Results / Debug" },
  ];

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>INTERNAL · REAL DEVELOPMENT BACKEND</Text>
      <Text style={styles.title}>Gig Testing</Text>
      <Text style={styles.subtitle}>End-to-end parity harness for gig creation, safe editing and deletion, musician applications, uploads, consented AI evidence, and recommendations. It uses the signed-in user and never impersonates another profile.</Text>
    </View>

    <View style={styles.banner}>
      <Text style={styles.bannerTitle}>Current session</Text>
      {context ? <Text style={styles.bannerText}>{context.profile?.full_name || context.userId} · {context.profile?.role || "unknown role"} · {context.userId}</Text> : <Text style={contextError ? styles.error : styles.bannerText}>{contextError || "Loading authenticated profile…"}</Text>}
      <Text style={styles.hint}>Create and delete require the owner. Applications require a musician. Edit permits the owner or assigned Level 1 venue staff, matching mobile.</Text>
    </View>

    <View style={styles.tabs}>
      {tabs.map((item) => <TouchableOpacity key={item.id} onPress={() => selectTab(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}>
        <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text>
      </TouchableOpacity>)}
    </View>

    {notice ? <View style={styles.banner}><Text style={notice.kind === "error" ? styles.error : notice.kind === "warning" ? styles.warning : styles.success}>{notice.text}</Text></View> : null}
    {busy ? <View style={styles.row}><ActivityIndicator color={colors.accent} /><Text style={styles.stageMessage}>Keep this page open while the real backend operation finishes.</Text></View> : null}

    {tab === "create" ? <View style={styles.card}>
      <Text style={styles.cardTitle}>Create Gig</Text>
      <Text style={styles.hint}>Required fields mirror `mobile/app/add_gig.tsx`. Contract is optional. New gigs are approved while the permit URL stays empty.</Text>
      <GigFormEditor value={createForm} onChange={setCreateForm} busy={busy} onImages={uploadImagesInto(setCreateForm)} onContract={uploadContractInto(setCreateForm)} />
      <View style={styles.buttonRow}><Button disabled={busy} onPress={submitCreate}>Create Gig with Real Backend</Button></View>
    </View> : null}

    {tab === "edit" ? <View style={styles.card}>
      <Text style={styles.cardTitle}>Edit Gig</Text>
      <View style={styles.grid}><Field label="Gig ID" required wide value={editGigId} onChange={setEditGigId} /></View>
      <View style={styles.buttonRow}><Button secondary disabled={busy} onPress={fetchEditGig}>Load current gig</Button></View>
      {loadedEditGig ? <>
        <View style={styles.banner}><Text style={styles.bannerTitle}>Loaded status</Text><Text style={styles.bannerText}>Gig {loadedEditGig.id} · status {loadedEditGig.status} · permit {loadedEditGig.permit_status || "n/a"}</Text></View>
        <GigCardPreview gig={loadedEditGig} />
        <GigFormEditor value={editForm} onChange={setEditForm} busy={busy} onImages={uploadImagesInto(setEditForm)} onContract={uploadContractInto(setEditForm)} allowPermitUrl />
        <View style={styles.buttonRow}><Button disabled={busy} onPress={submitEdit}>Save with Mobile Safe-Update RPC</Button></View>
      </> : null}
    </View> : null}

    {tab === "delete" ? <View style={styles.card}>
      <Text style={styles.cardTitle}>Delete Gig</Text>
      <Text style={styles.hint}>Uses the same safe-delete RPC as the feed card. Gigs with active accepted applicants cannot be deleted.</Text>
      <View style={styles.grid}>
        <Field label="Gig ID" required wide value={deleteGigId} onChange={setDeleteGigId} />
        <Field label="Cancellation reason" required wide multiline value={deleteReason} onChange={setDeleteReason} />
      </View>
      <View style={styles.buttonRow}>
        <Button destructive disabled={busy || !deleteGigId.trim() || !deleteReason.trim()} onPress={submitDelete}>Delete Gig with Safe-Delete RPC</Button>
      </View>
    </View> : null}

    {tab === "application" ? <View style={styles.card}>
      <Text style={styles.cardTitle}>Musician Application</Text>
      <View style={styles.grid}><Field label="Gig ID" required wide value={applicationGigId} onChange={setApplicationGigId} /></View>
      <View style={styles.buttonRow}><Button secondary disabled={busy} onPress={fetchApplicationGig}>Load gig</Button></View>
      {applicationGig ? <>
        <GigCardPreview gig={applicationGig} />
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{applicationGig.name}</Text>
          <Text style={styles.bannerText}>Status: {applicationGig.status} · Required musician type: {applicationGig.requirements?.musician_type || "both"} · Slots: {JSON.stringify(applicationGig.requirements?.slots || {})}</Text>
        </View>
        <View style={styles.grid}>
          <Field label="Musician / profile" value={context ? `${context.profile?.full_name || "Current user"} (${context.userId})` : "Loading…"} onChange={() => undefined} editable={false} hint="Mobile submits only as the authenticated musician. The harness does not impersonate profiles." wide />
          <Field label="Pitch message" required wide multiline value={applicationForm.pitchMessage} onChange={(text) => setApplicationForm((current) => ({ ...current, pitchMessage: text }))} />
        </View>
        <Text style={styles.sectionTitle}>Apply as</Text>
        <View style={styles.buttonRow}>
          <Button secondary={applicationForm.selectedGroupId !== ""} onPress={() => setApplicationForm((current) => ({ ...current, selectedGroupId: "" }))}>Individual</Button>
          {(context?.groups || []).map((group) => <Button key={group.id} secondary={applicationForm.selectedGroupId !== group.id} onPress={() => setApplicationForm((current) => ({ ...current, selectedGroupId: group.id }))}>{group.name} · {group.group_type}</Button>)}
        </View>
        <Text style={styles.sectionTitle}>Slot category</Text>
        <View style={styles.buttonRow}>{(["solo", "duo", "band"] as const).map((slot) => <Button key={slot} secondary={applicationForm.slotType !== slot} onPress={() => setApplicationForm((current) => ({ ...current, slotType: slot }))}>{slot === "solo" ? "Individual" : slot === "duo" ? "Duo" : "Group"}</Button>)}</View>
        <Checkbox
          label="AI portfolio review (optional)"
          checked={applicationForm.aiPortfolioReviewConsent}
          onPress={() => setApplicationForm((current) => ({ ...current, aiPortfolioReviewConsent: !current.aiPortfolioReviewConsent }))}
          hint="Allows Groq text/vision/Whisper and the DeepFace/ArcFace service to review redacted application evidence. Advisory only; it does not accept or reject the application."
        />
        <View style={styles.grid}>
          <View style={styles.field}><Text style={styles.label}>CV / resume *</Text><WebFileInput accept="application/pdf,.doc,.docx,text/plain" disabled={busy} onFiles={(files) => setCvFile(files[0] || null)} /><Text style={styles.hint}>{cvFile?.name || "No CV selected."}</Text></View>
          <View style={styles.field}><Text style={styles.label}>Performance video * (max 50 MB)</Text><WebFileInput accept="video/*" disabled={busy} onFiles={(files) => setVideoFile(files[0] || null)} /><Text style={styles.hint}>{videoFile?.name || "No video selected."}</Text></View>
        </View>
        <View style={styles.buttonRow}><Button disabled={busy} onPress={submitMusicianApplication}>Run Real Application Flow</Button></View>
      </> : null}
    </View> : null}

    {tab === "results" ? <View style={{ gap: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Results / Debug</Text>
        <View style={styles.grid}><Field label="Application ID" wide value={debugApplicationId} onChange={setDebugApplicationId} hint="Load an existing application visible to the signed-in user." /></View>
        <View style={styles.buttonRow}>
          <Button secondary disabled={busy} onPress={fetchDebug}>Load stored result</Button>
          {debugApplicationId ? <Button secondary disabled={busy} onPress={() => run(async () => {
            const debug = await pollApplicationDebug(debugApplicationId, reportStage);
            setResult((current) => current ? { ...current, ...debug, stages: stagesRef.current, completedAt: new Date().toISOString() } : current);
          })}>Poll processing stages</Button> : null}
        </View>
        {result ? <View style={styles.grid}>
          <View style={styles.banner}><Text style={styles.bannerTitle}>Gig ID</Text><Text selectable style={styles.bannerText}>{result.gigId || "—"}</Text></View>
          <View style={styles.banner}><Text style={styles.bannerTitle}>Application ID</Text><Text selectable style={styles.bannerText}>{result.applicationId || "—"}</Text></View>
          <View style={styles.banner}><Text style={styles.bannerTitle}>Organizer ID</Text><Text selectable style={styles.bannerText}>{result.organizerId || "—"}</Text></View>
          <View style={styles.banner}><Text style={styles.bannerTitle}>User / profile ID</Text><Text selectable style={styles.bannerText}>{result.profileId || context?.userId || "—"}</Text></View>
          <View style={styles.banner}><Text style={styles.bannerTitle}>Created status</Text><Text style={styles.bannerText}>{result.createdStatus || (result.success ? "success" : "failed")}</Text></View>
          <View style={styles.banner}><Text style={styles.bannerTitle}>Completed</Text><Text style={styles.bannerText}>{result.completedAt}</Text></View>
        </View> : null}
      </View>

      <View style={styles.card}><Text style={styles.cardTitle}>Individual stages</Text><StageList stages={stages} /></View>

      {result?.aiReview ? <View style={styles.card}>
        <Text style={styles.cardTitle}>AI evidence review</Text>
        <Text style={styles.sectionTitle}>TRANSCRIPTION</Text><Text style={styles.stageMessage}>{result.aiReview.source_summary?.video_transcribed ? "✓ Completed" : "⚠ No transcript available"}</Text>
        <Text style={styles.sectionTitle}>CV ANALYSIS</Text><JsonBlock value={{ classification: result.aiReview.source_summary?.cv_document_classification, criteria: result.aiReview.source_summary?.cv_requirement_review }} />
        <Text style={styles.sectionTitle}>PORTFOLIO / VISION</Text><JsonBlock value={{ frames_analyzed: result.aiReview.source_summary?.video_frames_reviewed, portfolio_images_reviewed: result.aiReview.source_summary?.portfolio_images_reviewed, evidence: result.aiReview.evidence }} />
        <Text style={styles.sectionTitle}>ACRCLOUD</Text><JsonBlock value={result.aiReview.source_summary?.recognized_audio_genre || { status: "No trusted catalog genre evidence" }} />
        <Text style={styles.sectionTitle}>FACE VERIFICATION · DEEPFACE / ARCFACE</Text><JsonBlock value={{ solo: result.aiReview.face_similarity, group: result.aiReview.group_face_similarity }} />
      </View> : null}

      {result?.recommendation ? <View style={styles.card}><Text style={styles.cardTitle}>Recommendation</Text><JsonBlock value={result.recommendation} /></View> : null}

      {result ? <View style={styles.card}>
        <TouchableOpacity onPress={() => setDebugOpen((value) => !value)} style={styles.row}>
          <Text style={styles.cardTitle}>Developer payload</Text><Text style={styles.pillText}>{debugOpen ? "Collapse" : "Expand"}</Text>
        </TouchableOpacity>
        {debugOpen ? <JsonBlock value={result} /> : null}
      </View> : null}
    </View> : null}

    <View style={styles.banner}>
      <Text style={styles.bannerTitle}>Safety boundary</Text>
      <Text style={styles.bannerText}>This page never renders API keys, service-role keys, access tokens, passwords, or provider secrets. Debug output contains only IDs, public storage paths/URLs, status codes, timestamps, durations, safe errors, and backend response data already visible under the signed-in user’s RLS permissions.</Text>
    </View>
  </ScrollView>;
}
