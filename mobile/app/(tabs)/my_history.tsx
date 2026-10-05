import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";
import Header from "../../src/components/header";
import InlineErrorBanner from "../../src/components/InlineErrorBanner";
import LoadingState from "../../src/components/LoadingState";
import ManageWorkspaceTabs from "../../src/components/ManageWorkspaceTabs";
import { HistoryListState, HistoryListStateContext, HistoryRefreshContext } from "../../src/components/ManagedListingContent";
import { useAuth, useRequireAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { useBottomBarClearance } from "../../src/hooks/useBottomBarClearance";
import { resolveRoleManageRoute } from "../../src/utils/roleRouting";
import { ManagedListingType } from "../../src/utils/listingHistory";
import { typography } from "../../src/theme/tokens";
import { fetchActiveStaffAssignments, getCachedActiveStaffAssignments, StaffEntityType } from "../../src/utils/staffAccess";
import MyGroupScreen from "./my_group";
import MyProductionScreen from "./my_production";
import MyStudioScreen from "./my_studio";
import MyVenueScreen from "./my_venue";

const HISTORY_LISTINGS = [
  { type: "group", label: "Groups", Component: MyGroupScreen },
  { type: "production", label: "Production", Component: MyProductionScreen },
  { type: "studio", label: "Studios", Component: MyStudioScreen },
  { type: "gig", label: "Gigs", Component: MyVenueScreen },
] as const;
const OWNER_LISTING_TYPES: Record<string, ManagedListingType> = {
  "/my_group": "group", "/my_production": "production", "/my_studio": "studio", "/my_venue": "gig",
};

export default function MyHistoryScreen() {
  const { userId } = useRequireAuth();
  const { userRole } = useAuth();
  const { colors } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const [staffTypes, setStaffTypes] = useState<StaffEntityType[]>(() => userId
    ? [...new Set(getCachedActiveStaffAssignments(userId)?.map((assignment) => assignment.entity_type))]
    : []);
  const [loading, setLoading] = useState(userRole === "staff");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ManagedListingType | "all">("all");
  const [listStates, setListStates] = useState<Partial<Record<ManagedListingType, HistoryListState>>>({});
  const reportState = useCallback((type: ManagedListingType, state: HistoryListState) => {
    setListStates((current) => {
      const previous = current[type];
      if (previous?.loading === state.loading && previous?.itemCount === state.itemCount && previous?.error === state.error) return current;
      return { ...current, [type]: state };
    });
  }, []);
  const refreshCallbacks = useRef(new Set<() => void>());
  const registerRefresh = useCallback((refresh: () => void) => {
    refreshCallbacks.current.add(refresh);
    return () => { refreshCallbacks.current.delete(refresh); };
  }, []);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([...refreshCallbacks.current].map((refresh) => refresh()));
      if (userRole === "staff" && userId) {
        const assignments = await fetchActiveStaffAssignments(supabase, userId);
        setStaffTypes([...new Set(assignments.map((assignment) => assignment.entity_type))]);
        setLoadError(null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your history could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }, [userId, userRole]);

  useFocusEffect(useCallback(() => {
    if (userRole !== "staff" || !userId) return;
    let active = true;
    setLoadError(null);
    void fetchActiveStaffAssignments(supabase, userId).then((assignments) => {
      if (active) setStaffTypes([...new Set(assignments.map((assignment) => assignment.entity_type))]);
    }).catch((error) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Your history could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId, userRole]));

  const ownerType = OWNER_LISTING_TYPES[resolveRoleManageRoute(userRole)];
  const availableListings = HISTORY_LISTINGS.filter(({ type }) => userRole === "musician"
    ? type !== "studio"
    : userRole === "staff"
      ? staffTypes.some((staffType) => (staffType === "venue" ? "gig" : staffType) === type)
      : type === ownerType);
  const showFilters = availableListings.length > 1;
  const activeFilter = showFilters && (filter === "all" || availableListings.some(({ type }) => type === filter)) ? filter : "all";
  const visibleListings = availableListings.filter(({ type }) => activeFilter === "all" || activeFilter === type);
  const historyLoading = loading || visibleListings.some(({ type }) => !listStates[type] || listStates[type]?.loading);
  const historyError = loadError || visibleListings.map(({ type }) => listStates[type]?.error).find(Boolean) || null;
  const historyCount = visibleListings.reduce((count, { type }) => count + (listStates[type]?.itemCount || 0), 0);
  const filterItems = [{ type: "all" as const, label: "All" }, ...availableListings];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="My History" overline="MusikaLokal" showTitle={false} />
      <ScrollView contentContainerStyle={{ paddingBottom: contentBottomPadding }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={{ paddingHorizontal: 16 }}><ManageWorkspaceTabs activeKey="history" /></View>
        {showFilters && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 16 }}>
          {filterItems.map(({ type, label }) => (
            <TouchableOpacity
              key={type}
              testID={`history-filter-${type}`}
              accessibilityRole="button"
              accessibilityLabel={`${label} history`}
              accessibilityState={{ selected: activeFilter === type }}
              onPress={() => setFilter(type)}
              style={{ minHeight: 40, paddingHorizontal: 16, justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: activeFilter === type ? colors.primary : colors.border, backgroundColor: activeFilter === type ? colors.primary : colors.surface }}
            >
              <Text style={{ fontFamily: typography.semibold, fontSize: 12, color: activeFilter === type ? "#fff" : colors.textSecondary }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>}
        <InlineErrorBanner message={historyError} onRetry={onRefresh} />
        {historyLoading && <LoadingState message="Loading your history..." compact />}
        {!historyLoading && !historyError && historyCount === 0 && (
          <Text testID="history-empty" style={{ color: colors.textSecondary, paddingHorizontal: 24, paddingVertical: 32, textAlign: "center" }}>
            {activeFilter === "all" ? "No history yet." : "No history for this filter."}
          </Text>
        )}
        <HistoryRefreshContext.Provider value={registerRefresh}>
          <HistoryListStateContext.Provider value={reportState}>
            {availableListings.map(({ type, Component }) => (
              <View key={`${userId}:${type}`} testID={`history-list-${type}`} style={activeFilter !== "all" && activeFilter !== type ? { display: "none" } : undefined}>
                <Component historyOnly embedded />
              </View>
            ))}
          </HistoryListStateContext.Provider>
        </HistoryRefreshContext.Provider>
      </ScrollView>
    </View>
  );
}
