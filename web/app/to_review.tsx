import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function ToReviewScreen() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();

  // Mock Data
  const reviewItems = [
    {
      id: 1,
      name: 'SoundWave Studio Malolos',
      date: 'Sat, Nov 16 • 2:00 PM - 3:00 PM',
      image: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=300&fit=crop',
      status: 'Completed',
      type: 'Studio Booking'
    }
  ];

  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Review" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {reviewItems.map((item) => (
          <View
            key={item.id}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border }
            ]}
          >
            <View>
              <Image
                source={{ uri: item.image }}
                style={styles.cardImage}
                resizeMode="cover"
              />
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>{item.type}</Text>
              </View>
            </View>

            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrapper}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.cardDate, { color: colors.textSecondary }]}>{item.date}</Text>
                </View>
              </View>

              <View style={[styles.cardFooter, { borderColor: isDark ? colors.border : '#F3F4F6' }]}>
                <View style={styles.statusRow}>
                  <Ionicons name="checkmark-done-circle" size={16} color={colors.textSecondary} />
                  <Text style={[styles.statusText, { color: colors.textSecondary }]}>{item.status}</Text>
                </View>

                <TouchableOpacity activeOpacity={1}
                  style={[styles.reviewBtn, { borderColor: colors.primary }]}
                  onPress={() => router.push('/submit_review' as any)}
                >
                  <Text style={[styles.reviewBtnText, { color: colors.primary }]}>Leave Review</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {reviewItems.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="star-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>No bookings to review</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.navbarContainer}>
        <Navbar />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardImage: {
    width: '100%',
    height: 144,
    opacity: 0.8,
  },
  badgeContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleWrapper: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  cardDate: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    marginLeft: 6,
    fontFamily: 'Poppins_500Medium',
  },
  reviewBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
  },
  reviewBtnText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
