import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function FindAGigScreen() {
  const { colors, isDark } = useTheme();
  const [selectedType, setSelectedType] = useState('All');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [sortBy, setSortBy] = useState('Relevance');
  const [showSortModal, setShowSortModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResults();
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedType, selectedGenre, sortBy, searchQuery]);

  async function fetchResults() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-content', {
        body: { query: searchQuery, type: selectedType, genre: selectedGenre, sortBy }
      });
      if (error) throw error;
      setResults(data || []);
    } catch (e) {
      console.log('Error fetching results:', e);
    } finally {
      setLoading(false);
    }
  }

  const sortOptions = ['Relevance', 'Distance', 'Rating', 'Price: Low to High', 'Price: High to Low'];
  const types = ['All', 'Venue', 'Studio', 'Music Group', 'Solo Artist'];
  const genres = ['All', 'Rock', 'Jazz', 'Pop', 'Hip-hop', 'Classical', 'Electronic', 'R&B'];

  const renderPill = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      style={[
        styles.pillButton,
        {
          backgroundColor: selected ? colors.primary : 'transparent',
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 0 : 1,
        }
      ]}
    >
      <Text
        style={[
          styles.pillText,
          {
            color: selected ? '#FFFFFF' : colors.textSecondary
          }
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderCard = (type: string, title: string, rating: string, location: string, tags: string[], price: string | null, distance: string, description: string, imageUri: string) => (
    <TouchableOpacity
      key={title + location} // Simple key for now
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.card,
          // Shadow props for iOS
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          // Elevation for Android
          elevation: 3,
        }
      ]}
      onPress={() => { }}
    >
      <View style={styles.cardHeader}>
        <Image
          source={{ uri: imageUri }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        <View style={styles.cardBadge}>
          <Text style={styles.cardBadgeText}>{type}</Text>
        </View>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={12} color="#F59E0B" />
          <Text style={styles.ratingText}>{rating}</Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardTitleRow}>
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>

        <View style={styles.cardLocationRow}>
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <Text
            style={[styles.cardLocationText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {location}
          </Text>
        </View>

        <View style={styles.tagsContainer}>
          {tags.map((tag, index) => (
            <View key={index} style={[styles.tag, { backgroundColor: isDark ? '#312E81' : '#E0E7FF' }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.cardFooter, { borderColor: isDark ? colors.border : '#F3F4F6' }]}>
          <View>
            {price && (
              <View style={styles.priceContainer}>
                <Ionicons name="cash-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.priceText, { color: colors.primary }]}>{price}</Text>
              </View>
            )}
            <View style={styles.distanceContainer}>
              <Ionicons name="navigate-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={[styles.distanceText, { color: colors.textSecondary }]}>{distance}</Text>
            </View>
          </View>

          <View style={[styles.detailsButton, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
            <Text style={[styles.detailsButtonText, { color: colors.text }]}>View Details</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Find Talent & Spaces" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: colors.inputBackground }
            ]}
          >
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search for Venues, Studios..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Filters */}
        <View style={[styles.filterSection, { backgroundColor: colors.background }]}>
          <View style={styles.filterGroup}>
            <Text style={[styles.filterTitle, { color: colors.textSecondary }]}>Categories</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {types.map(type => renderPill(type, selectedType === type, () => setSelectedType(type)))}
            </ScrollView>
          </View>

          <View>
            <Text style={[styles.filterTitle, { color: colors.textSecondary }]}>Genres</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
              {genres.map(genre => renderPill(genre, selectedGenre === genre, () => setSelectedGenre(genre)))}
            </ScrollView>
          </View>

          <View style={styles.resultsHeader}>
            <Text style={[styles.resultsTitle, { color: colors.text }]}>Results</Text>
            <TouchableOpacity
              onPress={() => setShowSortModal(true)}
              style={[styles.sortButton, { borderColor: colors.border }]}
            >
              <Ionicons name="options-outline" size={14} color={colors.text} />
              <Text style={[styles.sortButtonText, { color: colors.text }]}>{sortBy}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Results */}
        <View style={styles.resultsList}>
          {loading ? (
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Searching...</Text>
          ) : results.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="search-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyStateTitle, { color: colors.textSecondary }]}>No results found</Text>
              <Text style={[styles.emptyStateSubtitle, { color: colors.textSecondary }]}>Try adjusting your filters</Text>
            </View>
          ) : results.map((item, index) => renderCard(
            item.itemType || item.type || 'Unknown',
            item.name,
            String(item.rating || 'N/A'),
            item.location || item.address || 'Unknown Location',
            item.amenities || (item.genre ? [item.genre] : []),
            item.hourly_rate ? `₱${item.hourly_rate} / hr` : null,
            'N/A', // Distance
            item.description,
            item.images?.[0] || 'https://picsum.photos/400/200'
          ))}
        </View >

      </ScrollView >

      {/* Sort Modal */}
      < Modal
        visible={showSortModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <View style={[styles.modalHeader, { borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Sort Results
              </Text>
            </View>

            {sortOptions.map((option) => (
              <TouchableOpacity
                key={option}
                onPress={() => {
                  setSortBy(option);
                  setShowSortModal(false);
                }}
                style={[styles.sortOption, { borderColor: colors.border }]}
              >
                <Text style={{
                  fontFamily: sortBy === option ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                  color: sortBy === option ? colors.primary : colors.text,
                  fontSize: 15
                }}>
                  {option}
                </Text>
                {sortBy === option && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setShowSortModal(false)}
                style={styles.cancelButton}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal >

      <View style={styles.navbarContainer}>
        <Navbar />
      </View>
    </View >
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 150,
  },
  searchSection: {
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 8, 
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
  },
  filterSection: {
    paddingHorizontal: 24, 
    paddingBottom: 8, 
  },
  filterGroup: {
    marginTop: 16,
  },
  filterTitle: {
    fontSize: 12, 
    marginBottom: 12, 
    fontWeight: '600', 
    textTransform: 'uppercase',
    letterSpacing: 1, 
    fontFamily: 'Poppins_600SemiBold',
  },
  filterScrollContent: {
    paddingRight: 24,
    gap: 12,
  },
  pillButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    marginRight: 8,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
  },
  resultsTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  sortButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  resultsList: {
    paddingHorizontal: 24, 
    paddingTop: 8, 
  },
  loadingText: {
    margin: 16,
    fontFamily: 'Poppins_400Regular',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateTitle: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  emptyStateSubtitle: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
  },
  cardContainer: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    height: 192, // h-48
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cardBadgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ratingContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ratingText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#111827',
    fontFamily: 'Poppins_600SemiBold',
  },
  cardContent: {
    padding: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
    flex: 1,
    marginRight: 8,
  },
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLocationText: {
    marginLeft: 4,
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    flex: 1,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  priceText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  distanceText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  detailsButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  detailsButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 384, // max-w-sm
    borderRadius: 16,
    overflow: 'hidden',
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalFooter: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontFamily: 'Poppins_600SemiBold',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
