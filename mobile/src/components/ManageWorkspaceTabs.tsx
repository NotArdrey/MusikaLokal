import { router } from "expo-router";
import React from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { resolveRoleManageRoute } from "../utils/roleRouting";
import MusicianWorkspaceTabs from "./MusicianWorkspaceTabs";
import SlidingTabBar from "./SlidingTabBar";
import StaffWorkspaceTabs from "./StaffWorkspaceTabs";

type WorkspaceKey = "group" | "studio" | "venue" | "production" | "history";

const ownerLabels: Record<string, string> = {
  "/my_group": "My Group",
  "/my_studio": "My Studio",
  "/my_venue": "My Gig",
  "/my_production": "My Production",
};

export default function ManageWorkspaceTabs({ activeKey }: { activeKey: WorkspaceKey }) {
  const { userRole } = useAuth();
  const { colors } = useTheme();
  if (userRole === "musician") {
    return <MusicianWorkspaceTabs activeKey={activeKey === "production" ? "producer" : activeKey === "studio" ? "group" : activeKey} />;
  }
  if (userRole === "staff") {
    return <StaffWorkspaceTabs activeKey={activeKey === "group" ? "history" : activeKey} />;
  }
  const route = resolveRoleManageRoute(userRole);
  const label = ownerLabels[route];
  if (!label) return null;
  return (
    <SlidingTabBar
      activeKey={activeKey === "history" ? "history" : "listings"}
      tabs={[{ key: "listings", label }, { key: "history", label: "My History", testID: "manage-history-tab" }]}
      onChange={(key) => router.replace((key === "history" ? "/my_history" : route) as any)}
      activeColor={colors.primary}
      inactiveColor={colors.textSecondary}
      indicatorColor={colors.primary}
      borderColor={colors.border}
      backgroundColor={colors.surface}
      style={{ marginBottom: 16 }}
      textStyle={{ fontSize: 12 }}
    />
  );
}
