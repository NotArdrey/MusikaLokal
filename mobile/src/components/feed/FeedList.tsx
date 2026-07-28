import React, { memo } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  type FlatListProps,
} from "react-native";

type FeedListProps = Pick<
  FlatListProps<any>,
  | "ListEmptyComponent"
  | "ListFooterComponent"
  | "ListHeaderComponent"
  | "ItemSeparatorComponent"
  | "contentContainerStyle"
  | "data"
  | "keyExtractor"
  | "onEndReached"
  | "onEndReachedThreshold"
  | "onViewableItemsChanged"
  | "renderItem"
  | "scrollIndicatorInsets"
  | "style"
  | "viewabilityConfig"
> & {
  onRefresh: () => void;
  refreshing: boolean;
  refreshTintColor: string;
};

/**
 * A memo boundary between screen-level modal/composer state and the expensive
 * virtualized feed. Opening a shared modal no longer asks FlatList to reconcile
 * every visible card when its list props have not changed.
 */
function FeedListComponent({
  onRefresh,
  refreshing,
  refreshTintColor,
  ...listProps
}: FeedListProps) {
  return (
    <FlatList
      {...listProps}
      initialNumToRender={5}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={50}
      windowSize={9}
      removeClippedSubviews={Platform.OS === "android"}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={refreshTintColor}
        />
      )}
    />
  );
}

export const FeedList = memo(FeedListComponent);
