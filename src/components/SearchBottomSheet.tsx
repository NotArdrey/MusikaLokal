import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import ListingCard from './ListingCard';
import ListingDetailsSheet from './ListingDetailsSheet';

const { width } = Dimensions.get('window');

interface SearchBottomSheetProps {
    onClose?: () => void;
}

import { useAuth } from '../context/AuthContext';

// ... imports

const SearchBottomSheet = forwardRef<BottomSheetModal, SearchBottomSheetProps>(({ onClose }, ref) => {
    const { colors, isDark } = useTheme();
    const { userRole } = useAuth();
    const snapPoints = useMemo(() => ['94%'], []);

    // Filter Chips
    const isOwner = userRole === 'venue-owner' || userRole === 'studio-owner';
    // If owner, only show relevant filters (effectively just Musicians, maybe 'All' is redundant if it's the same, but let's keep it consistent)
    const FILTERS = isOwner ? ['All', 'Musician'] : ['All', 'Musician', 'Studio', 'Venue'];

    const [activeFilter, setActiveFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

    // Detail Sheet Ref (for opening nested details from search)
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

    // Data State
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // ... state ...

    // Filter Logic & Search Effect
    React.useEffect(() => {
        const doSearch = async () => {
            setLoading(true);
            try {
                let results: any[] = [];
                // Use require for AsyncStorage to avoid circular dependency issues if global import fails or isn't present
                const AsyncStorage = require('@react-native-async-storage/async-storage').default;

                // AI RELEVANCE CHECK
                // If query is empty, try to fetch based on "Last Viewed" embedding
                let usedAI = false;
                if (searchQuery.trim().length === 0) {
                    try {
                        let queryVector = null;

                        // 1. Try Long-Term Profile
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                            const { data: p } = await supabase.from('profiles').select('interest_vector').eq('id', user.id).single();
                            if (p?.interest_vector) {
                                queryVector = typeof p.interest_vector === 'string' ? JSON.parse(p.interest_vector) : p.interest_vector;
                            }
                        }

                        // 2. Fallback to Short-Term
                        if (!queryVector) {
                            const historyJson = await AsyncStorage.getItem('last_viewed_item');
                            if (historyJson) {
                                const history = JSON.parse(historyJson);
                                if (history?.embedding) queryVector = history.embedding;
                            }
                        }

                        if (queryVector) {
                            usedAI = true;
                            const history = { embedding: queryVector }; // Shim for below logic if needed, or refactor below
                            // Actually the code below expects `history.embedding`.
                            // Let's keep `history` var or refactor the block below.
                            // Refactoring block below to use `queryVector`

                            // Determine type to search
                            // If filter is 'All', we search all types? match_listings takes one type.
                            // We might need to run parallel for all types if 'All'
                            const searchTypes = isOwner
                                ? ['Group']
                                : (activeFilter === 'All' ? ['Group', 'Studio', 'Gig'] : [activeFilter]);

                            const promises = searchTypes.map(t =>
                                supabase.rpc('match_listings', {
                                    query_embedding: history.embedding,
                                    match_threshold: 0.3, // Lower threshold for search
                                    match_count: 5,
                                    listing_type: t === 'Musician' ? 'Group' : (t === 'Venue' ? 'Gig' : t) // Map filter to type
                                    // Note: Mapping 'Venue' -> 'Gig' or 'Studio' depends on schema. 
                                    // Standard: 'Group', 'Studio', 'Gig'
                                })
                            );

                            const aiResults = await Promise.all(promises);
                            const flatIds: any[] = [];

                            // Collect IDs and Types
                            aiResults.forEach((res, idx) => {
                                if (res.data) {
                                    const type = searchTypes[idx];
                                    res.data.forEach((r: any) => flatIds.push({ id: r.id, type }));
                                }
                            });

                            // Fetch full objects
                            if (flatIds.length > 0) {
                                // We need to fetch from respective tables again to get full data
                                // This is a bit heavy, but correct.
                                // Optimization: Just fetch top 10 total

                                for (const type of ['Group', 'Studio', 'Gig']) {
                                    const ids = flatIds.filter(x => x.type === type).map(x => x.id);
                                    if (ids.length > 0) {
                                        let table = 'groups_with_stats';
                                        if (type === 'Studio') table = 'studios_with_stats';
                                        if (type === 'Gig') table = 'gigs_with_stats';

                                        const { data: fullItems } = await supabase.from(table).select('*').in('id', ids);
                                        if (fullItems) {
                                            const mapped = fullItems.map((item: any) => ({
                                                ...item,
                                                type,
                                                image: item.images?.[0] || item.image,
                                                hourly_rate: item.hourly_rate ? item.hourly_rate.toString() : undefined,
                                                budget: item.budget ? item.budget.toString() : undefined,
                                                rate: (item.rate || item.hourly_rate || item.budget)?.toString(),
                                            }));
                                            results.push(...mapped);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.log('AI Search Error:', e);
                    }
                }

                if (!usedAI) {
                    // Fallback to Standard Search
                    // Determine which tables to query based on filter
                    let tables: string[] = [];

                    if (isOwner) {
                        // Owner restricted view: Only Groups
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

                        const { data: qData, error } = await query.limit(10);

                        if (error) {
                            console.log(`Error querying ${table}:`, error);
                            continue;
                        }

                        if (qData) {
                            // Normalize
                            const type = table.includes('group') ? 'Group' : (table.includes('studio') ? 'Studio' : 'Gig');
                            const mapped = qData.map((item: any) => ({
                                ...item,
                                type: item.type || type, // Use existing or fallback
                                image: item.images?.[0] || item.image,
                                // Ensure normalized props for card
                                // Ensure normalized props for card
                                // For Studio: prioritize hourly_rate, For Gig: prioritize budget, For Group: rate
                                hourly_rate: item.hourly_rate ? item.hourly_rate.toString() : undefined,
                                budget: item.budget ? item.budget.toString() : undefined,
                                rate: (item.rate || item.hourly_rate || item.budget)?.toString(),
                            }));
                            results.push(...mapped);
                        }
                    }
                }

                // Client-side filtering for edge cases (like Venue vs Studio)
                const final = results.filter(item => {
                    if (activeFilter === 'Venue') {
                        return item.type === 'Venue' || item.type === 'Gig' || (item.type === 'Studio' && item.amenities?.includes('Stage'));
                    }
                    return true;
                });

                setData(final);

            } catch (e) {
                console.log('Search error:', e);
            } finally {
                setLoading(false);
            }
        };

        const timeout = setTimeout(doSearch, 300); // Debounce
        return () => clearTimeout(timeout);
    }, [searchQuery, activeFilter]);

    // Handle invite action - opens the details sheet for booking/connecting
    const handleInvite = (item: any) => {
        setSelectedListingId(item.id);
        detailsRef.current?.present();
    };

    const renderItem = ({ item }: { item: any }) => (
        <ListingCard
            item={item}
            onPress={handleCardPress}
            onInvite={handleInvite}
            variant="vertical"
            style={{ width: '100%', marginBottom: 24, marginRight: 0 }}
        />
    );

    return (
        <BottomSheetModal
            ref={ref}
            index={0}
            snapPoints={snapPoints}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: colors.background }}
            handleIndicatorStyle={{ backgroundColor: isDark ? '#4B5563' : '#E5E7EB', width: 40 }}
            keyboardBehavior="interactive"
            keyboardBlurBehavior="restore"
        >
            <View style={{ flex: 1, minHeight: '100%' }}>
                {/* 1. Modal Header & Controls */}
                <View style={styles.headerContainer}>
                    {/* Top Row: Close | Title | Filter Icon */}
                    <View style={styles.headerTopRow}>
                        <TouchableOpacity onPress={handleDismiss} style={styles.iconBtn}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>Search</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Search Input */}
                    <View style={[styles.searchContainer, { backgroundColor: isDark ? '#374151' : '#F3F4F6', borderColor: isDark ? '#4B5563' : 'transparent' }]}>
                        <Ionicons name="search" size={20} color={colors.textSecondary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Where to?"
                            placeholderTextColor={colors.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* 2. Category Filter Chips (Horizontal) - Hidden for owners */}
                    {!isOwner && (
                        <View style={styles.chipsContainer}>
                            <BottomSheetFlatList
                                horizontal
                                data={FILTERS}
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
                                keyExtractor={(i: string) => i}
                                renderItem={({ item }: { item: string }) => {
                                    const isActive = item === activeFilter;
                                    return (
                                        <TouchableOpacity
                                            style={[
                                                styles.chip,
                                                isActive ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: 'transparent', borderColor: colors.border },
                                            ]}
                                            onPress={() => setActiveFilter(item)}
                                        >
                                            <Text style={[
                                                styles.chipText,
                                                isActive ? { color: '#FFF' } : { color: colors.textSecondary },
                                            ]}>{item}</Text>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        </View>
                    )}
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* 3. Vertical Results List */}
                <BottomSheetFlatList
                    data={data}
                    keyExtractor={(item: any) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.listContent, { minHeight: '100%' }]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>No results found</Text>
                        </View>
                    }
                />

                {/* Nested Listing Details Sheet */}
                <ListingDetailsSheet ref={detailsRef} listingId={selectedListingId} />
            </View>
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    headerContainer: {
        paddingVertical: 8,
    },
    headerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    headerTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
    },
    iconBtn: {
        padding: 8,
        borderRadius: 20,
    },
    searchContainer: {
        marginHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        gap: 10,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
        padding: 0,
    },
    chipsContainer: {
        paddingBottom: 8,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 24,
        borderWidth: 1,
    },
    chipText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 13,
    },
    divider: {
        height: 1,
        width: '100%',
        opacity: 0.5,
    },
    listContent: {
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 50,
    },
});

export default SearchBottomSheet;
