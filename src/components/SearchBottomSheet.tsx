import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ListingCard from './ListingCard';
import SafeBottomSheetFlatList from './SafeBottomSheetFlatList';

const { width } = Dimensions.get('window');

interface SearchBottomSheetProps {
    onClose?: () => void;
    onItemPress?: (listingId: string) => void;
}

const SearchBottomSheet = forwardRef<BottomSheetModal, SearchBottomSheetProps>(
    function SearchBottomSheet({ onClose, onItemPress }, ref) {
        const { colors, isDark } = useTheme();
        const { userRole } = useAuth();
        const snapPoints = useMemo(() => ['94%'], []);

        // Filter Chips - safely handle null userRole
        const isOwner = userRole === 'venue-owner' || userRole === 'studio-owner';
        const FILTERS = isOwner ? ['All', 'Musician'] : ['All', 'Musician', 'Studio', 'Venue'];

        const [activeFilter, setActiveFilter] = useState('All');
        const [searchQuery, setSearchQuery] = useState('');
        const [data, setData] = useState<any[]>([]);
        const [loading, setLoading] = useState(false);
        const [refreshTrigger, setRefreshTrigger] = useState(0);

        const renderBackdrop = useCallback(
            (props: any) => (
                <BottomSheetBackdrop
                    {...props}
                    disappearsOnIndex={-1}
                    appearsOnIndex={0}
                    opacity={0.4}
                />
            ),
            []
        );

        const handleClose = useCallback(() => {
            Keyboard.dismiss();
            onClose?.();
        }, [onClose]);

        // Simple search effect
        useEffect(() => {
            const doSearch = async () => {
                setLoading(true);
                try {
                    let results: any[] = [];
                    let tables: string[] = [];

                    if (isOwner) {
                        tables = ['groups_with_stats'];
                    } else {
                        if (activeFilter === 'All') tables = ['groups_with_stats', 'studios_with_stats', 'gigs_with_stats'];
                        else if (activeFilter === 'Musician') tables = ['groups_with_stats'];
                        else if (activeFilter === 'Studio') tables = ['studios_with_stats'];
                        else if (activeFilter === 'Venue') tables = ['studios_with_stats', 'gigs_with_stats'];
                    }

                    for (const table of tables) {
                        let query = supabase.from(table).select('*');
                        if (searchQuery.trim().length > 0) {
                            query = query.or(`name.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%`);
                        }
                        // Only show open gigs for musicians/guests
                        if (table === 'gigs_with_stats') {
                            query = query.eq('status', 'open');
                        }
                        const { data: qData } = await query.limit(10);
                        if (qData) {
                            const type = table.includes('group') ? 'Group' : (table.includes('studio') ? 'Studio' : 'Gig');
                            const mapped = qData.map((item: any) => ({
                                ...item,
                                type: item.type || type,
                                image: item.images?.[0] || item.image,
                                rate: (item.rate || item.hourly_rate || item.budget)?.toString(),
                            }));
                            results.push(...mapped);
                        }
                    }
                    setData(results);
                } catch (e) {
                    console.log('Search error:', e);
                } finally {
                    setLoading(false);
                }
            };

            const timeout = setTimeout(doSearch, 300);
            return () => clearTimeout(timeout);
        }, [searchQuery, activeFilter, isOwner, refreshTrigger]);

        // Realtime Search Updates
        useEffect(() => {
            const channel = supabase
                .channel('public:search_updates')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'gigs' },
                    () => setRefreshTrigger(prev => prev + 1)
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'studios' },
                    () => setRefreshTrigger(prev => prev + 1)
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'groups' },
                    () => setRefreshTrigger(prev => prev + 1)
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }, []);

        const handleItemPress = useCallback((item: any) => {
            onClose?.();
            onItemPress?.(item.id);
        }, [onClose, onItemPress]);

        // Clear search
        const clearSearch = () => setSearchQuery('');

        const renderItem = useCallback(({ item }: { item: any }) => (
            <ListingCard
                item={item}
                onPress={handleItemPress}
                variant="vertical"
                style={{ width: '100%' }}
            />
        ), [handleItemPress]);

        const keyExtractor = useCallback((item: any) => item.id.toString(), []);

        // Extracted Header Component (Sticky)
        const renderHeader = useMemo(() => (
            <View style={{ backgroundColor: colors.background }}>
                {/* Header with improved search bar */}
                <View style={styles.headerContainer}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Discover</Text>

                    <View style={{ flexDirection: 'column', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={[styles.searchContainer, {
                                flex: 1,
                                backgroundColor: isDark ? '#374151' : '#F3F4F6',
                                borderColor: 'transparent'
                            }]}>
                                <Ionicons name="search" size={20} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.searchInput, { color: colors.text }]}
                                    placeholder={isOwner ? "Find musicians, bands..." : "Find studios, gigs, venues..."}
                                    placeholderTextColor={colors.textSecondary}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    returnKeyType="search"
                                    autoCorrect={false}
                                />
                                {searchQuery.length > 0 && (
                                    <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                        <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                        <Text style={{
                            fontSize: 12,
                            color: colors.textSecondary,
                            marginLeft: 4,
                            fontFamily: 'Poppins_400Regular'
                        }}>
                            {isOwner ? "Genre • Availability" : "Location • Rate"}
                        </Text>
                    </View>

                    {/* Filter Chips - Modern Style */}
                    {!isOwner && (
                        <View style={styles.chipsRow}>
                            {FILTERS.map((filter) => {
                                const isActive = filter === activeFilter;
                                return (
                                    <TouchableOpacity
                                        key={filter}
                                        style={[
                                            styles.chip,
                                            isActive
                                                ? { backgroundColor: colors.primary, borderWidth: 0 }
                                                : { backgroundColor: isDark ? '#374151' : '#F3F4F6', borderWidth: 0 },
                                        ]}
                                        onPress={() => setActiveFilter(filter)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[
                                            styles.chipText,
                                            isActive ? { color: '#FFF' } : { color: isDark ? '#D1D5DB' : '#4B5563' },
                                        ]}>{filter}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <Text style={[styles.resultsLabel, { color: colors.textSecondary }]}>
                    Top Results
                </Text>
            </View>
        ), [colors, isDark, searchQuery, activeFilter, isOwner, FILTERS]);

        const ListEmptyComponent = useMemo(() => (
            <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}>
                    <Ionicons name="search-outline" size={32} color={colors.textSecondary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No results found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                    We couldn't find anything for "{searchQuery}".{"\n"}Try adjusting your search terms.
                </Text>
            </View>
        ), [colors, isDark, searchQuery]);

        return (
            <BottomSheetModal
                ref={ref}
                index={0}
                snapPoints={snapPoints}
                backdropComponent={renderBackdrop}
                onDismiss={handleClose}
                onChange={(index) => {
                    if (index === 0) setRefreshTrigger(prev => prev + 1);
                }}
                backgroundStyle={{ backgroundColor: colors.background, borderRadius: 32 }}
                handleIndicatorStyle={{ backgroundColor: isDark ? '#4B5563' : '#E5E7EB', width: 40, marginTop: 10 }}
                enablePanDownToClose
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
                android_keyboardInputMode="adjustResize"
            >
                {renderHeader}

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : (
                    <SafeBottomSheetFlatList
                        data={data}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        // ListHeaderComponent has been removed / extracted to top
                        ListEmptyComponent={ListEmptyComponent}
                        ItemSeparatorComponent={() => <View style={{ height: 24 }} />}
                        contentContainerStyle={[styles.listContent, { paddingHorizontal: 24 }]} // Added padding here instead of on card
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    />
                )}
            </BottomSheetModal>
        );
    }
);

const styles = StyleSheet.create({
    headerContainer: {
        paddingTop: 8,
        paddingBottom: 16,
        paddingHorizontal: 24,
        gap: 16,
    },
    headerTitle: {
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Poppins_500Medium',
        fontSize: 15,
        padding: 0,
    },
    cancelButton: {
        paddingVertical: 8,
        paddingLeft: 4,
    },
    cancelText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 15,
    },
    chipsRow: {
        flexDirection: 'row',
        gap: 8,
        paddingTop: 4,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
    },
    chipText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 13,
    },
    divider: {
        height: 1,
        width: '100%',
        opacity: 0.1,
    },
    listContent: {
        paddingBottom: 100,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 50,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        paddingHorizontal: 32,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
    },
    resultsLabel: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 16,
        marginHorizontal: 24,
        marginTop: 24,
    },
});

export default SearchBottomSheet;
