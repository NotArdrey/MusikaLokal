import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import ListingCard from './ListingCard';
import ListingDetailsSheet from './ListingDetailsSheet';

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
}

const RecentlyViewedSheet = forwardRef<BottomSheetModal, RecentlyViewedSheetProps>(({ onClose }, ref) => {
    const { colors, isDark } = useTheme();
    const snapPoints = useMemo(() => ['94%'], []);

    const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const detailsRef = React.useRef<BottomSheetModal>(null);

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

    const handleDismiss = () => {
        // @ts-ignore
        ref?.current?.dismiss();
        if (onClose) onClose();
    };

    const handleCardPress = (item: any) => {
        setSelectedListingId(item.id);
        detailsRef.current?.present();
    };

    // Fetch recently viewed items
    useEffect(() => {
        const fetchRecentlyViewed = async () => {
            setLoading(true);
            try {
                const historyJson = await AsyncStorage.getItem('recently_viewed');
                if (!historyJson) {
                    setData([]);
                    setLoading(false);
                    return;
                }

                const history = JSON.parse(historyJson);
                const recentIds = history.slice(0, 50); // Get up to 50 recent items

                if (recentIds.length === 0) {
                    setData([]);
                    setLoading(false);
                    return;
                }

                // Fetch from all tables
                const [studiosRes, groupsRes, gigsRes] = await Promise.all([
                    supabase.from('studios').select('*').in('id', recentIds),
                    supabase.from('groups').select('*').in('id', recentIds),
                    supabase.from('gigs').select('*, venues(name, location)').in('id', recentIds)
                ]);

                const combined: any[] = [];

                if (studiosRes.data) {
                    studiosRes.data.forEach((s: any) => {
                        combined.push({
                            ...s,
                            type: 'studio',
                            image: s.images?.[0] || 'https://via.placeholder.com/300x200?text=Studio',
                            rating: s.rating || 4.5
                        });
                    });
                }

                if (groupsRes.data) {
                    groupsRes.data.forEach((g: any) => {
                        combined.push({
                            ...g,
                            type: 'group',
                            image: g.images?.[0] || 'https://via.placeholder.com/300x200?text=Group',
                            rating: g.average_rating || 4.5
                        });
                    });
                }

                if (gigsRes.data) {
                    gigsRes.data.forEach((gig: any) => {
                        combined.push({
                            ...gig,
                            type: 'gig',
                            image: gig.images?.[0] || 'https://via.placeholder.com/300x200?text=Gig',
                            rating: gig.rating || 4.5,
                            location: gig.venues?.location || gig.location
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
    ), []);

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
                backdropComponent={renderBackdrop}
                onDismiss={handleDismiss}
                backgroundStyle={{ backgroundColor: colors.background }}
                handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
            >
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <View style={styles.headerContent}>
                        <View>
                            <Text style={[styles.title, { color: colors.text }]}>Recently Viewed</Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                {data.length} {data.length === 1 ? 'item' : 'items'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.closeBtn, { backgroundColor: colors.card }]}
                            onPress={handleDismiss}
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
                        renderItem={renderItem}
                        keyExtractor={(item: any) => item.id}
                        contentContainerStyle={{ paddingTop: moderateScale(16), paddingBottom: moderateScale(100) }}
                        ListEmptyComponent={renderEmpty}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </BottomSheetModal>

            <ListingDetailsSheet ref={detailsRef} listingId={selectedListingId} />
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
