import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, useBottomSheetTimingConfigs } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Easing } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import ListingCard from './ListingCard';

const { width, height } = Dimensions.get('window');

// Responsive scaling utilities
const scale = (size: number) => {
    const newSize = (width / 375) * size;
    return Math.max(newSize, size * 0.85);
};
const verticalScale = (size: number) => {
    const baseHeight = 812;
    const ratio = height / baseHeight;
    const clampedRatio = Math.max(0.8, Math.min(1.2, ratio));
    return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
    const scaled = scale(size);
    return size + (scaled - size) * factor;
};

interface RecentlyViewedSheetProps {
    onClose?: () => void;
    onItemPress?: (listingId: string) => void;
    onChat?: (item: any) => void;
}

const RecentlyViewedSheet = forwardRef<BottomSheetModal, RecentlyViewedSheetProps>(({ onClose, onItemPress, onChat }, ref) => {
    const { colors, isDark } = useTheme();
    const snapPoints = useMemo(() => ['90%'], []);
    const animationConfigs = useBottomSheetTimingConfigs({
        duration: 320,
        easing: Easing.inOut(Easing.cubic),
    });

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
            />
        ),
        []
    );

    const handleDismiss = useCallback(() => {
        if (onClose) onClose();
    }, [onClose]);

    const closeSheet = useCallback(() => {
        // @ts-ignore
        ref?.current?.dismiss();
    }, [ref]);

    const handleCardPress = useCallback((item: any) => {
        if (onItemPress) {
            closeSheet();
            setTimeout(() => {
                onItemPress(item.id);
            }, 120);
        }
    }, [closeSheet, onItemPress]);

    // Fetch recently viewed items - uses full objects stored by home.tsx
    useEffect(() => {
        const fetchRecentlyViewed = async () => {
            setLoading(true);
            try {
                // Use the same key as home.tsx: 'recently_viewed_items'
                const historyJson = await AsyncStorage.getItem('recently_viewed_items');
                if (!historyJson) {
                    setData([]);
                    setLoading(false);
                    return;
                }

                const history = JSON.parse(historyJson);
                
                // home.tsx stores full item objects, not just IDs
                // Check if it's an array of objects or IDs
                if (history.length === 0) {
                    setData([]);
                    setLoading(false);
                    return;
                }

                // If first item is an object with 'id' and 'type', use directly
                if (typeof history[0] === 'object' && history[0].id) {
                    // Normalize the data format for ListingCard
                    const normalizedData = history
                        .filter((item: any) => {
                            const itemType = String(item?.type || '').toLowerCase();
                            if (itemType !== 'studio' && itemType !== 'gig') return true;
                            return String(item?.permit_status || '').toLowerCase() === 'approved';
                        })
                        .map((item: any) => ({
                            ...item,
                            image: item.image || item.images?.[0] || 'https://via.placeholder.com/300x200?text=Item',
                            rating: item.rating || 0,
                        }));
                    setData(normalizedData);
                    setLoading(false);
                    return;
                }

                // Legacy fallback: if stored as IDs, fetch from database
                const recentIds = history.slice(0, 50);

                // Fetch from projection-backed stats views (legacy-compatible shape)
                const [studiosRes, groupsRes, gigsRes] = await Promise.all([
                    supabase.from('studios_with_stats').select('*').eq('permit_status', 'approved').in('id', recentIds),
                    supabase.from('groups_with_stats').select('*').in('id', recentIds),
                    supabase
                        .from('gigs_with_stats')
                        .select('*')
                        .eq('status', 'open')
                        .eq('permit_status', 'approved')
                        .in('id', recentIds)
                ]);

                const combined: any[] = [];

                if (studiosRes.data) {
                    studiosRes.data.forEach((s: any) => {
                        combined.push({
                            ...s,
                            type: 'Studio',
                            image: s.images?.[0] || 'https://via.placeholder.com/300x200?text=Studio',
                            rating: s.rating || 0
                        });
                    });
                }

                if (groupsRes.data) {
                    groupsRes.data.forEach((g: any) => {
                        combined.push({
                            ...g,
                            type: 'Group',
                            image: g.images?.[0] || 'https://via.placeholder.com/300x200?text=Group',
                            rating: g.rating || g.average_rating || 0
                        });
                    });
                }

                if (gigsRes.data) {
                    gigsRes.data.forEach((gig: any) => {
                        combined.push({
                            ...gig,
                            type: 'Gig',
                            image: gig.images?.[0] || 'https://via.placeholder.com/300x200?text=Gig',
                            rating: gig.rating || 0,
                            location: gig.location
                        });
                    });
                }

                // Sort by recently viewed order
                const sortedData = combined.sort((a, b) => {
                    const aIndex = recentIds.indexOf(a.id);
                    const bIndex = recentIds.indexOf(b.id);
                    return aIndex - bIndex;
                });

                setData(sortedData);
            } catch (error) {
                console.error('Error fetching recently viewed:', error);
                setData([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRecentlyViewed();
    }, []);

    const renderItem = useCallback(({ item }: { item: any }) => (
        <View style={{ paddingHorizontal: scale(24), marginBottom: moderateScale(16) }}>
            <ListingCard item={item} onPress={() => handleCardPress(item)} />
        </View>
    ), [handleCardPress]);

    const keyExtractor = useCallback((item: any, index: number) => item?.id?.toString?.() || index.toString(), []);

    const renderEmpty = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={moderateScale(64)} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Recently Viewed Items</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Your viewing history will appear here
            </Text>
        </View>
    );

    return (
        <>
            <BottomSheetModal
                ref={ref}
                index={0}
                snapPoints={snapPoints}
                animationConfigs={animationConfigs}
                animateOnMount={true}
                enableDynamicSizing={false}
                enableContentPanningGesture={false}
                enableOverDrag={false}
                backdropComponent={renderBackdrop}
                onDismiss={handleDismiss}
                backgroundStyle={{ backgroundColor: colors.background }}
                handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
                enablePanDownToClose={true}
            >
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <View style={styles.headerContent}>
                        <View>
                            <Text style={[styles.title, { color: colors.text }]}>Recently Viewed</Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                {data.length} {data.length === 1 ? 'item' : 'items'}
                            </Text>
                        </View>
                        <TouchableOpacity activeOpacity={1}
                            style={[styles.closeBtn, { backgroundColor: colors.card }]}
                            onPress={closeSheet}
                        >
                            <Ionicons name="close" size={moderateScale(24)} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                            Loading your history...
                        </Text>
                    </View>
                ) : (
                    <BottomSheetFlatList
                        data={data}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        ListEmptyComponent={renderEmpty}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingTop: moderateScale(16), paddingBottom: moderateScale(100) }}
                        initialNumToRender={5}
                        maxToRenderPerBatch={8}
                        windowSize={5}
                        removeClippedSubviews
                    />
                )}
            </BottomSheetModal>
        </>
    );
});

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: scale(24),
        paddingBottom: moderateScale(16),
        borderBottomWidth: 1,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: moderateScale(24),
        fontFamily: 'Poppins_700Bold',
        marginBottom: moderateScale(4),
    },
    subtitle: {
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_400Regular',
    },
    closeBtn: {
        width: moderateScale(40),
        height: moderateScale(40),
        borderRadius: moderateScale(20),
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: verticalScale(60),
    },
    loadingText: {
        marginTop: moderateScale(16),
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_400Regular',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: verticalScale(80),
        paddingHorizontal: scale(40),
    },
    emptyTitle: {
        fontSize: moderateScale(18),
        fontFamily: 'Poppins_600SemiBold',
        marginTop: moderateScale(16),
        marginBottom: moderateScale(8),
    },
    emptySubtitle: {
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
});

export default RecentlyViewedSheet;
