import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { radius, typography } from "../theme/tokens";
import { getGroupApplicationCvStatusLabel, isGroupApplicationCollectingCvs } from "../utils/groupApplicationCv";

type Props = {
  userId: string | null;
  visible: boolean;
  colors: any;
  isDark: boolean;
};

export default function GroupApplicationCvTaskList({ userId, visible, colors, isDark }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const loadTasks = useCallback(async () => {
    if (!visible || !userId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("gig-applications", {
      body: { action: "fetch_member_cv_tasks", userId },
    });
    if (requestId !== requestRef.current) return;
    setTasks(!error && Array.isArray(data) ? data.filter((task) => isGroupApplicationCollectingCvs(task.application)) : []);
    setLoading(false);
  }, [userId, visible]);

  useFocusEffect(useCallback(() => {
    setTasks([]);
    void loadTasks();
    if (!visible || !userId) return;
    const channel = supabase.channel(`group-cv-tasks:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gig_applications" }, () => void loadTasks())
      .subscribe();
    return () => {
      requestRef.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [loadTasks, userId, visible]));

  if (!visible || (!loading && tasks.length === 0)) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View>
          <Text style={[styles.heading, { color: colors.text }]}>Group application tasks</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Member CVs required before applications are sent</Text>
        </View>
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
      {tasks.map((task) => {
        const application = task.application || {};
        const needsCv = task.cv_status !== "submitted";
        const canFinalize = task.can_finalize === true;
        const statusLabel = getGroupApplicationCvStatusLabel(application, task);
        const statusColor = canFinalize ? "#10B981" : needsCv ? "#F59E0B" : colors.primary;
        const statusIcon = canFinalize ? "checkmark-circle" : "time-outline";
        return (
          <TouchableOpacity
            key={task.id}
            activeOpacity={0.82}
            onPress={() => router.push({ pathname: "/group_application_cv", params: { applicationId: task.application_id } } as any)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.labelRow}>
              <Text style={[styles.applicationType, { color: colors.primary }]}>Group application</Text>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>View task</Text>
            </View>

            <Text style={[styles.gigName, { color: colors.text }]} numberOfLines={2}>
              {application.gig?.name || "Gig application"}
            </Text>

            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={14} color={colors.primary} />
              <Text style={[styles.groupName, { color: colors.textSecondary }]} numberOfLines={1}>
                Applying with {application.group?.name || "your group"}
              </Text>
            </View>

            <View style={[styles.footer, { borderTopColor: isDark ? colors.border : "#F3F4F6" }]}>
              <View style={styles.statusRow}>
                <Ionicons name={statusIcon} size={16} color={statusColor} />
                <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
              </View>
              <View style={[styles.chevronButton, { borderColor: colors.border }]}>
                <Ionicons name="chevron-forward" size={17} color={colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, marginBottom: 12, gap: 10 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: typography.heading, fontSize: 16, lineHeight: 21 },
  subtitle: { fontFamily: typography.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16 },
  labelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  applicationType: {
    flex: 1,
    fontFamily: typography.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  actionLabel: { fontFamily: typography.semibold, fontSize: 12 },
  gigName: { fontFamily: typography.title, fontSize: 19, lineHeight: 25 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  groupName: { flex: 1, fontFamily: typography.body, fontSize: 11, lineHeight: 15 },
  footer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  status: { fontFamily: typography.semibold, fontSize: 12 },
  chevronButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
