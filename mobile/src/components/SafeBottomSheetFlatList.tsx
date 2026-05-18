import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React from 'react';
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    StyleProp,
    View,
    ViewStyle,
} from 'react-native';

interface SafeBottomSheetFlatListProps<T = any> {
    data: T[];
    renderItem: (props: { item: T; index: number }) => React.ReactElement | null;
    keyExtractor: (item: T, index: number) => string;
    ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
    ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
    ListFooterComponent?: React.ComponentType<any> | React.ReactElement | null;
    ItemSeparatorComponent?: React.ComponentType<any> | (() => React.ReactElement) | null;
    contentContainerStyle?: StyleProp<ViewStyle>;
    style?: StyleProp<ViewStyle>;
    showsVerticalScrollIndicator?: boolean;
    keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
    clipToPadding?: boolean;
    nestedScrollEnabled?: boolean;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    scrollEventThrottle?: number;
    initialNumToRender?: number;
    maxToRenderPerBatch?: number;
    updateCellsBatchingPeriod?: number;
    windowSize?: number;
}

/**
 * A "Safe" version of BottomSheetFlatList that uses BottomSheetScrollView with manual rendering.
 * This avoids "__internalInstanceHandle" crashes caused by Reanimated version mismatches
 * with BottomSheetFlatList, while maintaining a FlatList-like API.
 * 
 * Note: The "Couldn't find the scrollable node handle id" warning is harmless and 
 * occurs when the bottom sheet can't auto-detect the scroll view, but scrolling still works.
 */
const SafeBottomSheetFlatList = <T,>({
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    ItemSeparatorComponent,
    contentContainerStyle,
    style,
    showsVerticalScrollIndicator,
    keyboardShouldPersistTaps,
    nestedScrollEnabled,
    onEndReached,
    onEndReachedThreshold = 0.5,
    scrollEventThrottle = 16,
}: SafeBottomSheetFlatListProps<T>) => {
    const endReachedContentHeightRef = React.useRef(0);

    // Helper to safely render a component prop that could be an Element or a ComponentType
    const renderProp = (Prop: React.ComponentType<any> | React.ReactElement | null | undefined) => {
        if (!Prop) return null;
        if (React.isValidElement(Prop)) return Prop;
        const Component = Prop as React.ComponentType<any>;
        return <Component />;
    };

    const handleScroll = React.useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (!onEndReached) return;

            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            if (contentSize.height <= layoutMeasurement.height) return;

            const distanceFromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
            const thresholdPx = layoutMeasurement.height * onEndReachedThreshold;
            if (
                distanceFromEnd <= thresholdPx &&
                endReachedContentHeightRef.current !== contentSize.height
            ) {
                endReachedContentHeightRef.current = contentSize.height;
                onEndReached();
            }
        },
        [onEndReached, onEndReachedThreshold],
    );

    return (
        <BottomSheetScrollView
            style={[{ flex: 1 }, style]}
            contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            nestedScrollEnabled={nestedScrollEnabled}
            onScroll={handleScroll}
            scrollEventThrottle={scrollEventThrottle}
        >
            {renderProp(ListHeaderComponent)}

            {data.length === 0 ? (
                renderProp(ListEmptyComponent)
            ) : (
                data.map((item, index) => (
                    <React.Fragment key={keyExtractor(item, index)}>
                        <View style={{ width: '100%' }}>
                            {renderItem({ item, index })}
                        </View>
                        {index < data.length - 1 && renderProp(ItemSeparatorComponent)}
                    </React.Fragment>
                ))
            )}

            {renderProp(ListFooterComponent)}
        </BottomSheetScrollView>
    );
};

export default SafeBottomSheetFlatList;
