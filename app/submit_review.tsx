import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function SubmitReviewScreen() {
  const { colors, isDark } = useTheme();
  const { userId, isAuthenticated } = useRequireAuth();
  const params = useLocalSearchParams<{
    studioId?: string;
    gigId?: string;
    targetUserId?: string;
    bookingId?: string;
    bookingType?: string;
    entityName?: string;
    entityType?: string;
    reviewerRole?: string;
  }>();

  const [selectedValue, setSelectedValue] = useState<number>(0);
  const ratingOptions = [1, 2, 3, 4, 5];
  const [modalVisible, setModalVisible] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Determine what we're reviewing based on params
  const entityName = params.entityName || 'this booking';
  const isReviewingUser = !!params.targetUserId;
  const reviewTitle = isReviewingUser
    ? `Rate ${entityName}`
    : `Rate your experience`;
  const reviewSubtitle = isReviewingUser
    ? `How was your interaction with ${entityName}?`
    : `How was your booking with ${entityName}?`;

  const handleSubmitReview = async () => {
    if (!userId || !isAuthenticated) {
      Alert.alert('Error', 'You must be logged in to submit a review.');
      return;
    }

    if (selectedValue === 0) {
      Alert.alert('Error', 'Please select a rating.');
      return;
    }

    try {
      setSubmitting(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const reviewPayload: any = {
        action: 'create_review',
        userId,
        rating: selectedValue,
        content: feedback || null,
        bookingId: params.bookingId,
        bookingType: params.bookingType,
        reviewerRole: params.reviewerRole,
      };

      // Set the target entity
      if (params.studioId) reviewPayload.studioId = params.studioId;
      if (params.gigId) reviewPayload.gigId = params.gigId;
      if (params.targetUserId) reviewPayload.targetUserId = params.targetUserId;

      const { data, error } = await supabase.functions.invoke('manage-bookings', {
        body: reviewPayload,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data?.error) {
        Alert.alert('Error', data.error);
        return;
      }

      // Success - close modal and go back
      setModalVisible(false);
      Alert.alert('Success', 'Your review has been submitted!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      console.log('Review submission error:', e);
      Alert.alert('Error', 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Submit Review" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                {reviewTitle}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {reviewSubtitle}
              </Text>
            </View>

            <View style={styles.starsContainer}>
              {ratingOptions.map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setSelectedValue(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item <= selectedValue ? "star" : "star-outline"}
                    size={48}
                    color={item <= selectedValue ? "#F59E0B" : colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <View>
              <Text style={[styles.label, { color: colors.text }]}>Additional Comments</Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    borderColor: isDark ? '#374151' : '#E5E7EB',
                    backgroundColor: colors.inputBackground,
                    color: colors.text
                  }
                ]}
                placeholder="Share your experience..."
                placeholderTextColor={colors.textSecondary}
                multiline
                value={feedback}
                onChangeText={setFeedback}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: colors.primary, opacity: selectedValue === 0 || submitting ? 0.5 : 1 }
              ]}
              onPress={() => {
                if (selectedValue > 0 && !submitting) setModalVisible(true)
              }}
              disabled={selectedValue === 0 || submitting}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Submitting...' : 'Submit Review'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.navbar}>
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Review"
        message={`Are you sure you want to submit this ${selectedValue}-star review?`}
        buttonText={submitting ? "Submitting..." : "Submit"}
        onConfirm={handleSubmitReview}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 20,
    marginBottom: 8,
    fontFamily: 'Poppins_600SemiBold',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    fontFamily: 'Poppins_400Regular',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
    gap: 8,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    marginLeft: 4,
    fontFamily: 'Poppins_500Medium',
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    fontSize: 16,
    height: 150,
    textAlignVertical: 'top',
    fontFamily: 'Poppins_400Regular',
  },
  submitButton: {
    marginTop: 32,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  navbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
