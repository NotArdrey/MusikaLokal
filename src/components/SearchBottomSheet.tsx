import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MOCK_LISTINGS } from '../data/mockData';
import ListingCard from './ListingCard';
import ListingDetailsSheet from './ListingDetailsSheet';

const { width } = Dimensions.get('window');

interface SearchBottomSheetProps {
    onClose?: () => void;
}

const SearchBottomSheet = forwardRef<BottomSheetModal, SearchBottomSheetProps>(({ onClose }, ref) => {
    const { colors, isDark } = useTheme();
    const snapPoints = useMemo(() => ['94%'], []);

    // Filter Chips
    const FILTERS = ['All', 'Musician', 'Studio', 'Venue'];
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

    // Filter Logic
    const filteredData = MOCK_LISTINGS.filter(item => {
        const matchesCategory = activeFilter === 'All' ||
            (activeFilter === 'Musician' && item.type === 'Group') ||
            (activeFilter === 'Venue' && (item.type === 'Venue' || item.type === 'Gig')) ||
            item.type === activeFilter;

        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.location || '').toLowerCase().includes(searchQuery.toLowerCase());

        return matchesCategory && matchesSearch;
    });

    const renderItem = ({ item }: { item: any }) => (
        <ListingCard
            item={item}
            onPress={handleCardPress}
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

                    {/* 2. Category Filter Chips (Horizontal) */}
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
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* 3. Vertical Results List */}
                <BottomSheetFlatList
                    data={filteredData}
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
