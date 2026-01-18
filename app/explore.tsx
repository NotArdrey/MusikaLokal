import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function ExploreScreen() {
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const services = [
    { title: 'Gigs', icon: 'microphone-variant', color: '#8B5CF6', image: 'https://picsum.photos/300/200?random=20' },
    { title: 'Studios', icon: 'headphones', color: '#10B981', image: 'https://picsum.photos/300/200?random=21' },
    { title: 'Musicians', icon: 'account-music', color: '#F59E0B', image: 'https://picsum.photos/300/200?random=22' },
    { title: 'Events', icon: 'ticket-confirmation', color: '#EF4444', image: 'https://picsum.photos/300/200?random=23' },
  ];

  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Explore" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Search Bar */}
        <View style={styles.sectionContainer}>
          <View style={[styles.searchContainer, { backgroundColor: colors.inputBackground }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              placeholder="What are you looking for?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Categories Grid */}
        <View style={styles.categoriesSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Browse Categories</Text>
          <View style={styles.categoriesGrid}>
            {services.map((service, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.categoryCard,
                  {
                    shadowColor: service.color,
                  }
                ]}
                onPress={() => router.push('/find_talent_and_spaces')}
              >
                <Image
                  source={{ uri: service.image }}
                  style={styles.categoryImage}
                />
                <View style={styles.categoryOverlay} />
                <View style={styles.categoryContent}>
                  <View style={styles.categoryIconBg}>
                    <MaterialCommunityIcons name={service.icon as any} size={20} color="#FFF" />
                  </View>
                  <Text style={styles.categoryTitle}>{service.title}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Trending Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.trendingHeader}>
            <Ionicons name="trending-up" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { marginLeft: 8, color: colors.text, marginBottom: 0 }]}>Trending Near You</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScrollContent}>
            {[1, 2, 3].map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.trendingCard, { backgroundColor: colors.card }]}
                onPress={() => { }}
              >
                <Image
                  source={{ uri: `https://picsum.photos/300/200?random=${30 + i}` }}
                  style={styles.trendingImage}
                />
                <Text style={[styles.trendingTag, { color: colors.primary }]}>POPULAR</Text>
                <Text
                  numberOfLines={1}
                  style={[styles.trendingTitle, { color: colors.text }]}
                >
                  Bulacan State University Field
                </Text>
                <Text style={styles.trendingSubtitle}>Available for Concerts</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
    paddingBottom: 100,
  },
  sectionContainer: {
    paddingHorizontal: 24, // px-6
    marginBottom: 24, // mb-6
  },
  searchContainer: {
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
  categoriesSection: {
    paddingHorizontal: 24, // px-6
    marginBottom: 32, // mb-8
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 16,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16, // using gap for row spacing, or marginBottom on elements
  },
  categoryCard: {
    width: '47%', // approx 48%
    height: 144, // h-36
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
    // Shadows
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  categoryOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  categoryContent: {
    position: 'absolute',
    bottom: 12,
    left: 12,
  },
  categoryIconBg: {
    padding: 8,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  categoryTitle: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  trendingScrollContent: {
    paddingRight: 24,
    gap: 16,
  },
  trendingCard: {
    width: 256, // w-64
    padding: 12,
    borderRadius: 16,
    marginRight: 16,
    // Shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  trendingImage: {
    width: '100%',
    height: 128, // h-32
    borderRadius: 12,
    marginBottom: 12,
  },
  trendingTag: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    paddingHorizontal: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  trendingTitle: {
    fontSize: 16,
    marginBottom: 4,
    paddingHorizontal: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  trendingSubtitle: {
    fontSize: 12,
    color: '#6B7280', // gray-500
    paddingHorizontal: 4,
    fontFamily: 'Poppins_400Regular',
  },
});
