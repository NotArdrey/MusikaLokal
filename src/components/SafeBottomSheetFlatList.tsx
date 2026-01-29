import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React from 'react';
import { View, ViewStyle } from 'react-native';

interface SafeBottomSheetFlatListProps {
    data: any[];
    renderItem: any; // Relaxed type for compatibility
    keyExtractor: (item: any, index: number) => string;
    ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
    ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
    ItemSeparatorComponent?: React.ComponentType<any> | React.ReactElement | null;
    contentContainerStyle?: ViewStyle;
    style?: ViewStyle;
    showsVerticalScrollIndicator?: boolean;
    keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
    clipToPadding?: boolean;
}

/**
 * A "Safe" versions of BottomSheetFlatList that falls back to a ScrollView implementation.
 * This avoids "internalInstanceHandle" crashes caused by Reanimated version mismatches,
 * while maintaining the clean API of a FlatList (data, renderItem, etc).
 */
const SafeBottomSheetFlatList: React.FC<SafeBottomSheetFlatListProps> = ({
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListEmptyComponent,
    ItemSeparatorComponent,
    contentContainerStyle,
    style,
    showsVerticalScrollIndicator,
    keyboardShouldPersistTaps,
    clipToPadding
}) => {
    return (
        <BottomSheetScrollView
            style={[{ flex: 1 }, style]}
            contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            // @ts-ignore
            clipToPadding={clipToPadding}
        >
            {React.isValidElement(ListHeaderComponent) ? (
                ListHeaderComponent
            ) : (
                ListHeaderComponent && <ListHeaderComponent />
            )}

            {data.length === 0 ? (
                React.isValidElement(ListEmptyComponent) ? (
                    ListEmptyComponent
                ) : (
                    ListEmptyComponent && <ListEmptyComponent />
                )
            ) : (
                data.map((item, index) => (
                    <React.Fragment key={keyExtractor(item, index)}>
                        <View style={{ width: '100%' }}>
                            {renderItem({ item, index })}
                        </View>
                        {index < data.length - 1 && (
                            React.isValidElement(ItemSeparatorComponent) ? ItemSeparatorComponent : (ItemSeparatorComponent && <ItemSeparatorComponent />)
                        )}
                    </React.Fragment>
                ))
            )}
        </BottomSheetScrollView>
    );
};

export default SafeBottomSheetFlatList;
