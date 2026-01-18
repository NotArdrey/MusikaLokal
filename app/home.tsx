import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const [activeCategory, setActiveCategory] = useState('All');
  const [featured, setFeatured] = useState<any[]>([]);
  const [newArrivals, setNewArrivals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetchFeed();
  }, []);

  async function fetchFeed() {
    try {
      const { data, error } = await supabase.functions.invoke('home-feed');
      if (error) throw error;
      setFeatured(data.featured || []);
      setNewArrivals(data.newArrivals || []);
    } catch (e) {
      console.log('Error fetching feed:', e);
    } finally {
      setLoading(false);
    }
  }

  const categories = ['All', 'Gigs', 'Musicians', 'Studios'];

  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Discover" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Hero / Search Section */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            Find your <Text style={{ color: colors.primary }}>rhythm</Text>
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Book the best local talent and spaces.
          </Text>

          <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              placeholder="Search gigs, bands, studios..."
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesScroll}
          contentContainerStyle={styles.categoriesContent}
        >
          {categories.map((cat, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => setActiveCategory(cat)}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: activeCategory === cat ? colors.primary : 'transparent',
                  borderColor: activeCategory === cat ? colors.primary : colors.border,
                  borderWidth: activeCategory === cat ? 0 : 1,
                  marginRight: 8,
                }
              ]}
            >
              <Text
                style={{
                  color: activeCategory === cat ? '#FFF' : colors.textSecondary,
                  fontFamily: 'Poppins_500Medium',
                  fontSize: 14,
                }}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Featured Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Featured</Text>
            <TouchableOpacity onPress={() => router.push('/find_talent_and_spaces')}>
              <Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <Text style={{ color: colors.textSecondary, marginLeft: 4 }}>Loading featured...</Text>
          ) : featured.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Ionicons name="star-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>No featured items yet</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredScrollContent}
            >
              {featured.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.9}
                  onPress={() => router.push(item.type === 'Gig' ? '/gig_details' : '/studio_details')}
                  style={[styles.featuredCard, { backgroundColor: colors.card }]}
                >
                  <View style={styles.featuredImageContainer}>
                    <Image
                      source={{ uri: item.images?.[0] || 'https://picsum.photos/400/250' }}
                      style={styles.featuredImage}
                      resizeMode="cover"
                    />
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.ratingText}>{item.rating || 'N/A'}</Text>
                    </View>
                    <View style={[styles.favoriteButton, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
                      <Ionicons name="heart-outline" size={18} color={colors.primary} />
                    </View>
                  </View>

                  <View style={styles.featuredInfo}>
                    <Text
                      numberOfLines={1}
                      style={[styles.featuredTitle, { color: colors.text }]}
                    >
                      {item.name}
                    </Text>
                    <View style={styles.locationContainer}>
                      <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.locationText, { color: colors.textSecondary }]}>
                        {item.location || item.address || 'Unknown Location'}
                      </Text>
                    </View>
                    <View style={styles.tagsContainer}>
                      <View style={[styles.tag, { backgroundColor: isDark ? '#312E81' : '#E0E7FF' }]}>
                        <Text style={[styles.tagText, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>
                          {item.type}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* New Arrivals List */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 16 }]}>New Arrivals</Text>

          {loading ? (
            <Text style={{ color: colors.textSecondary }}>Loading new arrivals...</Text>
          ) : newArrivals.length === 0 ? (
            <View style={[styles.emptyState, { borderColor: colors.border }]}>
              <Ionicons name="musical-notes-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>No new arrivals found</Text>
            </View>
          ) : newArrivals.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.newArrivalCard, { backgroundColor: colors.card }]}
              onPress={() => router.push('/group_details')}
            >
              <Image
                source={{ uri: item.images?.[0] || `https://picsum.photos/100/100?random=${20 + i}` }}
                style={styles.newArrivalImage}
              />
              <View style={styles.newArrivalInfo}>
                <Text style={[styles.newArrivalTitle, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.newArrivalSubtitle, { color: colors.textSecondary }]}>{item.genre || 'Music Group'}</Text>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={12} color={colors.primary} />
                  <Text style={[styles.ratingValue, { color: colors.primary }]}>{item.rating || 'N/A'}</Text>
                </View>
              </View>
              <View style={[styles.chevronContainer, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          ))}

        </View>

      </ScrollView>

      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 150,
  },
  sectionContainer: {
    paddingHorizontal: 24, // px-6
    marginBottom: 24, // mb-6
  },
  heroTitle: {
    fontSize: 30, // text-3xl
    fontFamily: 'Poppins_600SemiBold',
  },
  heroSubtitle: {
    fontSize: 16, // text-base
    marginTop: 4,
    marginBottom: 16,
    fontFamily: 'Poppins_400Regular',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
  },
  categoriesScroll: {
    marginHorizontal: 24, // px-6
    marginBottom: 32, // mb-8
  },
  categoriesContent: {
    paddingRight: 24,
    gap: 12,
  },
  categoryChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    marginRight: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  seeAllText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  featuredScrollContent: {
    paddingRight: 24,
    gap: 16,
  },
  featuredCard: {
    width: 288, // w-72 approx
    borderRadius: 24,
    padding: 12,
    marginRight: 16,
    // Shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  featuredImageContainer: {
    position: 'relative',
  },
  featuredImage: {
    width: '100%',
    height: 160,
    borderRadius: 16,
  },
  ratingBadge: {
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
    fontWeight: 'bold',
    color: '#111827',
    fontFamily: 'Poppins_600SemiBold',
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    borderRadius: 9999,
  },
  featuredInfo: {
    marginTop: 12,
    paddingHorizontal: 4,
  },
  featuredTitle: {
    fontSize: 16,
    marginBottom: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 12,
    marginLeft: 4,
    fontFamily: 'Poppins_400Regular',
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  newArrivalCard: {
    flexDirection: 'row',
    marginBottom: 16,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    // Shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  newArrivalImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  newArrivalInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  newArrivalTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  newArrivalSubtitle: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingValue: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  chevronContainer: {
    padding: 8,
    borderRadius: 9999,
  },
});
