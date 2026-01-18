import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function OngoingScreen() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();

  // Mock Data
  const ongoingItems = [
    {
      id: 1,
      name: 'Music One Studios Makati',
      date: 'Sat, Dec 14 • 2:00 PM - 4:00 PM',
      image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=300&fit=crop',
      status: 'In Progress',
      type: 'Studio Booking'
    },
    {
      id: 2,
      name: 'Saguijo Cafe + Bar Makati',
      date: 'Fri, Dec 13 • 8:00 PM - 11:00 PM',
      image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=300&fit=crop',
      status: 'Happening Now',
      type: 'Gig'
    }
  ];

  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Ongoing" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {ongoingItems.map((item) => (
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
              <View style={[styles.typeBadge, { backgroundColor: '#6366F1' }]}>
                <Text style={styles.typeBadgeText}>{item.type}</Text>
              </View>

              <View style={[styles.liveBadge, { backgroundColor: '#22C55E' }]}>
                <View style={[styles.liveDot, { backgroundColor: 'white' }]} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            </View>

            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.cardDate, { color: colors.textSecondary }]}>{item.date}</Text>
                </View>
              </View>

              <View style={[styles.cardFooter, { borderColor: isDark ? colors.border : '#F3F4F6' }]}>
                <View style={styles.statusRow}>
                  <Ionicons name="play-circle" size={16} color="#10B981" />
                  <Text style={[styles.statusText, { color: "#10B981" }]}>{item.status}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.uploadBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.uploadBtnText}>Upload Proof</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
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
  },
  typeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  typeBadgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  liveText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
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
  cardInfo: {
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
  uploadBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  uploadBtnText: {
    fontSize: 12,
    color: 'white',
    fontFamily: 'Poppins_600SemiBold',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
