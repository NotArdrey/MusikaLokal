import React, { createContext, useContext, useEffect } from "react";
import { ScrollView, ScrollViewProps, View } from "react-native";
import { ManagedListingType } from "../utils/listingHistory";

export type ManagedListingScreenProps = {
  historyOnly?: boolean;
  embedded?: boolean;
};

export const HistoryRefreshContext = createContext<((refresh: () => void) => () => void) | null>(null);

export type HistoryListState = { loading: boolean; itemCount: number; error: string | null };
export const HistoryListStateContext = createContext<((type: ManagedListingType, state: HistoryListState) => void) | null>(null);

export default function ManagedListingContent({ embedded, listingType, loading = false, itemCount = 0, error = null, children, ...props }: ScrollViewProps & {
  embedded?: boolean;
  listingType?: ManagedListingType;
  loading?: boolean;
  itemCount?: number;
  error?: string | null;
}) {
  const registerRefresh = useContext(HistoryRefreshContext);
  const reportState = useContext(HistoryListStateContext);
  const refresh = (props.refreshControl as React.ReactElement<{ onRefresh?: () => void }> | undefined)?.props.onRefresh;
  useEffect(() => {
    if (embedded && refresh && registerRefresh) return registerRefresh(refresh);
  }, [embedded, refresh, registerRefresh]);
  useEffect(() => {
    if (embedded && listingType && reportState) reportState(listingType, { loading, itemCount, error });
  }, [embedded, listingType, reportState, loading, itemCount, error]);
  if (embedded && (loading || itemCount === 0)) return null;
  // History owns the scroll container; each section keeps its existing cards and handlers.
  return embedded
    ? <View style={[props.contentContainerStyle, { paddingTop: 0, paddingBottom: 0 }]}>{children}</View>
    : <ScrollView {...props}>{children}</ScrollView>;
}
