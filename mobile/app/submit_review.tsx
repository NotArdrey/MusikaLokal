import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function SubmitReviewScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { userId, isAuthenticated } = useRequireAuth();
  const params = useLocalSearchParams<{
    studioId?: string;
    gigId?: string;
    groupId?: string;
    targetUserId?: string;
    bookingId?: string;
    bookingType?: string;
    entityName?: string;
    entityType?: string;
    reviewerRole?: string;
    returnTab?: string;
  }>();

  const [selectedValue, setSelectedValue] = useState<number>(0);
  const ratingOptions = [1, 2, 3, 4, 5];
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[]
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const extractFunctionErrorMessage = async (
    error: any,
    fallback: string
  ) => {
    if (!error) return fallback;

    if (typeof error?.message === 'string' && error.message.trim().length > 0) {
      const isGenericFunctionMessage = error.message.includes('non-2xx status code');
      if (!isGenericFunctionMessage) return error.message;
    }

    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (typeof body?.error === 'string' && body.error.trim().length > 0) {
          return body.error;
        }
        if (typeof body?.message === 'string' && body.message.trim().length > 0) {
          return body.message;
        }
      }
    } catch (_parseError) {
      // Fall through to fallback error text.
    }

    return fallback;
  };

  // Determine what we're reviewing based on params
  const entityName = params.entityName || 'this booking';
  const isReviewingCounterparty = !!(params.targetUserId || params.groupId);
  const reviewTitle = isReviewingCounterparty
    ? `Rate ${entityName}`
    : `Rate your experience`;
  const reviewSubtitle = isReviewingCounterparty
    ? `How was your interaction with ${entityName}?`
    : `How was your booking with ${entityName}?`;

  const handleSubmitReview = async () => {
    if (submitting) return;
    if (!userId || !isAuthenticated) {
      showAlert('error', 'Error', 'You must be logged in to submit a review.');
      return;
    }

    if (selectedValue === 0) {
      showAlert('error', 'Error', 'Please select a rating.');
      return;
    }

    const hasTargetEntity = !!(params.studioId || params.gigId || params.groupId || params.targetUserId);
    if (!hasTargetEntity) {
      showAlert(
        'error',
        'Error',
        'Missing review target. Please open this screen from your booking history and try again.'
      );
      return;
    }

    if (!params.bookingId || !params.bookingType || !params.reviewerRole) {
      showAlert(
        'error',
        'Error',
        'Missing review metadata. Please open this screen from Bookings and try again.'
      );
      return;
    }

    if (params.bookingType !== 'studio_booking' && params.bookingType !== 'gig_application') {
      showAlert('error', 'Error', 'Invalid booking type for review submission.');
      return;
    }

    try {
      setSubmitting(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const reviewPayload: any = {
        action: 'create_review',
        userId: session.user.id,
        rating: selectedValue,
        content: feedback || null,
        bookingId: params.bookingId,
        bookingType: params.bookingType,
        reviewerRole: params.reviewerRole,
      };

      // Set the target entity
      if (params.studioId) reviewPayload.studioId = params.studioId;
      if (params.gigId) reviewPayload.gigId = params.gigId;
      if (params.groupId) reviewPayload.groupId = params.groupId;
      if (params.targetUserId) reviewPayload.targetUserId = params.targetUserId;

      const { data, error } = await supabase.functions.invoke('manage-bookings', {
        body: reviewPayload,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        const errorMessage = await extractFunctionErrorMessage(
          error,
          'Failed to submit review. Please try again.'
        );
        showAlert('error', 'Error', errorMessage);
        return;
      }

      if (data?.error) {
        showAlert('error', 'Error', data.error);
        return;
      }

      // Success - go back
      showAlert('success', 'Success', 'Your review has been submitted!', [
        {
          text: 'OK',
          onPress: () => {
            const requestedTab = typeof params.returnTab === 'string' ? params.returnTab : undefined;
            if (requestedTab) {
              router.replace({
                pathname: '/bookings',
                params: { tab: requestedTab },
              } as any);
              return;
            }
            router.back();
          },
        }
      ]);
    } catch (e: any) {
      const errorMessage = await extractFunctionErrorMessage(
        e,
        'Failed to submit review. Please try again.'
      );
      showAlert('error', 'Error', errorMessage);
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
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
          >
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
                <TouchableOpacity activeOpacity={1}
                  key={item}
                  onPress={() => setSelectedValue(item)}
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
                { backgroundColor: selectedValue > 0 ? colors.primary : colors.border, opacity: submitting ? 0.5 : 1 }
              ]}
              onPress={handleSubmitReview}
              disabled={selectedValue === 0 || submitting}
              activeOpacity={1}
            >
              <Text style={[styles.submitButtonText, { color: selectedValue > 0 ? "#FFFFFF" : colors.textSecondary }]}>
                {submitting ? 'Submitting...' : 'Submit Review'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.navbar}>
          <Navbar />
        </View>
      </View >

      <Modal
        visible={submitting}
        loading
        loadingMessage="Submitting review..."
        onClose={() => { }}
      />

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
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
    justifyContent: 'center',
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
