import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

type Applicant = {
  id: string;
  applicant_id: string;
  name: string;
  status: string;
  group_id: string | null;
  created_at: string;
  is_self: boolean;
};
type GigHistory = {
  id: string;
  name: string;
  event_date: string | null;
  created_at: string;
  status: string;
  location: string | null;
  is_owner: boolean;
  applicants: Applicant[];
};
const PAGE_SIZE = 10;
const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Date to be announced";

export default function GigHistorySection() {
  const { userId, isGuest } = useAuth();
  const { colors } = useTheme();
  const [gigs, setGigs] = useState<GigHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(
    async (offset = 0) => {
      if (!userId || isGuest) return;
      const request = ++requestId.current;
      setBusy(true);
      setError("");
      try {
        const { data, error: queryError } = await supabase.rpc(
          "fetch_gig_history",
          { p_offset: offset, p_limit: PAGE_SIZE },
        );
        if (queryError) throw queryError;
        if (request !== requestId.current) return;
        const rows = (Array.isArray(data) ? data : []) as GigHistory[];
        setHasMore(rows.length > PAGE_SIZE);
        setGigs((previous) =>
          offset
            ? [...previous, ...rows.slice(0, PAGE_SIZE)]
            : rows.slice(0, PAGE_SIZE),
        );
      } catch {
        if (request === requestId.current)
          setError("Gig history could not be loaded. Please retry.");
      } finally {
        if (request === requestId.current) setBusy(false);
      }
    },
    [userId, isGuest],
  );
  useFocusEffect(
    useCallback(() => {
      setGigs([]);
      void load();
      return () => {
        requestId.current += 1;
      };
    }, [load]),
  );
  if (!userId || isGuest) return null;
  return (
    <View style={styles.section} testID="gig-history-section">
      <View style={styles.row}>
        <Text style={[styles.heading, { color: colors.text }]}>
          Gig History
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void load()}
        >
          <Text style={{ color: colors.primary }}>Refresh</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.textSecondary }}>
        Posted gigs and gigs you applied to, with every applicant and
        application status.
      </Text>
      {error ? (
        <View>
          <Text accessibilityRole="alert" style={{ color: colors.text }}>
            {error}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void load()}
          >
            <Text style={{ color: colors.primary }}>Retry gig history</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {gigs.map((gig) => (
        <View
          key={gig.id}
          testID={`gig-history-${gig.id}`}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{gig.name}</Text>
          <Text style={{ color: colors.textSecondary }}>
            {dateLabel(gig.event_date)} · {gig.status}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {gig.is_owner ? "Posted by you" : "Applied gig"} · Posted{" "}
            {dateLabel(gig.created_at)}
          </Text>
          {gig.location ? (
            <Text style={{ color: colors.textSecondary }}>{gig.location}</Text>
          ) : null}
          {gig.is_owner ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/manage_gig",
                  params: { id: gig.id, tab: "Applicants" },
                })
              }
            >
              <Text style={{ color: colors.primary }}>Manage gig</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.title, { color: colors.text }]}>
            Applicants ({gig.applicants.length})
          </Text>
          {gig.applicants.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              No applicants for this gig.
            </Text>
          ) : (
            gig.applicants.map((applicant) => (
              <View
                key={applicant.id}
                style={[styles.applicant, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text }}>
                  {applicant.name}
                  {applicant.is_self ? " (You)" : ""} ·{" "}
                  {applicant.group_id ? "Group" : "Solo"}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {(applicant.status || "pending").replace(/_/g, " ")} · Applied{" "}
                  {dateLabel(applicant.created_at)}
                </Text>
              </View>
            ))
          )}
        </View>
      ))}
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="Loading gig history"
          color={colors.primary}
        />
      ) : !error && gigs.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>
          No posted gigs or applications yet.
        </Text>
      ) : null}
      {hasMore && !error ? (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void load(gigs.length)}
        >
          <Text style={{ color: colors.primary }}>Load more gigs</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 12, paddingVertical: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heading: { fontSize: 21, fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "600" },
  card: { padding: 16, gap: 10, borderWidth: 1, borderRadius: 14 },
  applicant: { borderTopWidth: 1, paddingTop: 10, gap: 5 },
});
