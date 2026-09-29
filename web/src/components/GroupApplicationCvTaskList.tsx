import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";

type Props = { userId: string | null; visible: boolean; colors: any; isDark: boolean };

export default function GroupApplicationCvTaskList({ userId, visible, colors, isDark }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const loadTasks = useCallback(async () => {
    if (!visible || !userId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("gig-applications", {
      body: { action: "fetch_member_cv_tasks", userId },
    });
    if (!error) setTasks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [userId, visible]);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadTasks();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadTasks]);
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
        const statusLabel = canFinalize ? "Ready to send" : needsCv ? "Your CV required" : "Waiting for members";
        const statusColor = canFinalize ? "#10B981" : needsCv ? "#F59E0B" : colors.primary;
        return (
          <TouchableOpacity
            key={task.id}
            activeOpacity={0.82}
            onPress={() => router.push({ pathname: "/group_application_cv", params: { applicationId: task.application_id } } as any)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.icon, { backgroundColor: isDark ? "rgba(124,58,237,0.18)" : "#F3E8FF" }]}>
              <Ionicons name="document-text-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>{application.group?.name || "Your group"}</Text>
              <Text style={[styles.gigName, { color: colors.textSecondary }]} numberOfLines={1}>{application.gig?.name || "Gig application"}</Text>
              <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 12, gap: 10 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  card: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  groupName: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  gigName: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  status: { fontFamily: "Poppins_600SemiBold", fontSize: 11, marginTop: 2 },
});
