import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function PendingScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const { width } = useWindowDimensions();

  // Mock Data
  const pendingItems = [
    {
      id: 1,
      name: 'SoundWave Studio Malolos',
      date: 'Sat, Nov 16 • 2:00 PM - 3:00 PM',
      image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=300&fit=crop',
      status: 'Waiting for Approval',
      type: 'Studio Booking'
    },
    {
      id: 2,
      name: 'Echo Music Hub San Jose',
      date: 'Sun, Nov 17 • 4:30 PM - 5:30 PM',
      image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=300&fit=crop',
      status: 'Action Required',
      type: 'Gig Application'
    }
  ];

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Pending" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {pendingItems.map((item) => (
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
                    <Ionicons name="time-outline" size={16} color="#F59E0B" />
                    <Text style={[styles.statusText, { color: "#F59E0B" }]}>{item.status}</Text>
                  </View>

                  {item.status === 'Action Required' ? (
                    <TouchableOpacity
                      onPress={() => setModalVisible(true)}
                      style={[styles.actionBtn, { backgroundColor: '#16A34A' }]}
                    >
                      <Text style={[styles.actionBtnText, { color: 'white' }]}>Confirm Now</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.outlineBtn, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.outlineBtnText, { color: colors.textSecondary }]}>View Details</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.navbarContainer}>
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Booking"
        message="Are you sure you want to confirm this booking?"
        buttonText="Confirm"
        onConfirm={() => setModalVisible(false)}
      />
    </>
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
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  outlineBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
