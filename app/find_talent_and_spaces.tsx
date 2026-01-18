import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
      console.log('Results:', data);
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
      onPress={onPress}
      className={`px-5 py-2.5 rounded-full mr-2 ${selected ? 'bg-primary-600' : 'bg-transparent border'}`}
      style={{
        backgroundColor: selected ? colors.primary : 'transparent',
        borderColor: selected ? colors.primary : colors.border
      }}
    >
      <Text
        className="text-sm font-medium"
        style={{
          fontFamily: 'Poppins_500Medium',
          color: selected ? '#FFFFFF' : colors.textSecondary
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderCard = (type: string, title: string, rating: string, location: string, tags: string[], price: string | null, distance: string, description: string, imageUri: string) => (
    <TouchableOpacity
      className="mb-6 rounded-2xl overflow-hidden shadow-md"
      style={{ backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 }}
      onPress={() => { }}
    >
      <View className="relative h-48">
        <Image
          source={{ uri: imageUri }}
          className="w-full h-full"
          resizeMode="cover"
        />
        <View className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md">
          <Text className="text-white text-[10px] font-bold uppercase tracking-wide" style={{ fontFamily: 'Poppins_700Bold' }}>{type}</Text>
        </View>
        <View className="absolute bottom-3 right-3 flex-row items-center bg-white/90 rounded-full px-2.5 py-1">
          <Ionicons name="star" size={12} color="#F59E0B" />
          <Text className="ml-1 text-xs font-bold text-gray-900" style={{ fontFamily: 'Poppins_600SemiBold' }}>{rating}</Text>
        </View>
      </View>

      <View className="p-4">
        <View className="flex-row justify-between items-start mb-1">
          <Text className="text-lg flex-1 mr-2" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }} numberOfLines={1}>{title}</Text>
        </View>

        <View className="flex-row items-center mb-3">
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <Text className="ml-1 text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }} numberOfLines={1}>{location}</Text>
        </View>

        <View className="flex-row flex-wrap gap-2 mb-4">
          {tags.map((tag, index) => (
            <View key={index} className="px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/20">
              <Text className="text-[10px] font-medium" style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>{tag}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row items-center justify-between pt-3 border-t" style={{ borderColor: isDark ? colors.border : '#F3F4F6' }}>
          <View>
            {price && (
              <View className="flex-row items-center">
                <Ionicons name="cash-outline" size={14} color={colors.textSecondary} className="mr-1" />
                <Text className="text-xs" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>{price}</Text>
              </View>
            )}
            <View className="flex-row items-center mt-0.5">
              <Ionicons name="navigate-outline" size={14} color={colors.textSecondary} className="mr-1" />
              <Text className="text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>{distance}</Text>
            </View>
          </View>

          <View className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800">
            <Text className="text-xs font-semibold" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>View Details</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Find Talent & Spaces" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
      >

        {/* Search Bar - Consistent with Explore */}
        <View className="px-6 pt-6 pb-2">
          <View
            className="flex-row items-center px-4 py-3.5 rounded-2xl"
            style={{
              backgroundColor: colors.inputBackground,
            }}
          >
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              className="flex-1 ml-3 text-base"
              style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
              placeholder="Search for Venues, Studios..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Filters */}
        <View className="px-6 pb-2" style={{ backgroundColor: colors.background }}>
          <View className="mt-4">
            <Text className="text-xs mb-3 font-semibold uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Categories</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-3" contentContainerStyle={{ paddingRight: 24 }}>
              {types.map(type => renderPill(type, selectedType === type, () => setSelectedType(type)))}
            </ScrollView>
          </View>

          <View>
            <Text className="text-xs mb-3 font-semibold uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Genres</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-3" contentContainerStyle={{ paddingRight: 24 }}>
              {genres.map(genre => renderPill(genre, selectedGenre === genre, () => setSelectedGenre(genre)))}
            </ScrollView>
          </View>

          <View className="flex-row items-center justify-between mt-6 mb-2">
            <Text className="text-lg" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Results</Text>
            <TouchableOpacity
              onPress={() => setShowSortModal(true)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-transparent"
              style={{ borderColor: colors.border }}
            >
              <Ionicons name="options-outline" size={14} color={colors.text} />
              <Text className="text-xs font-medium" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{sortBy}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Results */}
        <View className="px-6 pt-2">
          {loading ? (
            <Text className="text-gray-500 m-4">Searching...</Text>
          ) : results.length === 0 ? (
            <View className="items-center justify-center py-20">
              <Ionicons name="search-outline" size={48} color={colors.border} />
              <Text className="mt-4 text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>No results found</Text>
              <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Try adjusting your filters</Text>
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
          className="flex-1 bg-black/50 justify-center items-center p-4"
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View className="w-full max-w-sm rounded-2xl overflow-hidden shadow-lg" style={{ backgroundColor: colors.card, borderWidth: isDark ? 1 : 0, borderColor: colors.border }}>
            <View className="px-6 py-4 border-b" style={{ borderColor: colors.border }}>
              <Text className="text-lg font-bold" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>
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
                className="flex-row items-center justify-between px-6 py-4 border-b last:border-0"
                style={{ borderColor: colors.border }}
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

            <View className="p-4 bg-gray-50 dark:bg-black/20">
              <TouchableOpacity
                onPress={() => setShowSortModal(false)}
                className="py-3 items-center rounded-xl bg-gray-200 dark:bg-gray-700"
              >
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal >

      <View className="absolute bottom-0 left-0 right-0">
        <Navbar />
      </View>
    </View >
  );
}
