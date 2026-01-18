import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function SubmitReviewScreen() {
  const { colors, isDark } = useTheme();
  const [selectedValue, setSelectedValue] = useState<number>(0);
  const ratingOptions = [1, 2, 3, 4, 5];
  const [modalVisible, setModalVisible] = useState(false);
  const [feedback, setFeedback] = useState('');

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Submit Feedback" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                Rate your experience
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                How was your booking with SoundWave Studio Malolos?
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
                    borderColor: isDark ? '#374151' : '#E5E7EB', // border-gray-700 : border-gray-200
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
                { backgroundColor: colors.primary, opacity: selectedValue === 0 ? 0.5 : 1 }
              ]}
              onPress={() => {
                if (selectedValue > 0) setModalVisible(true)
              }}
              disabled={selectedValue === 0}
            >
              <Text style={styles.submitButtonText}>
                Submit Review
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
        title="Confirm Feedback"
        message="Are you sure you want to submit this feedback?"
        buttonText="Submit"
        onConfirm={() => {
          setModalVisible(false);
          router.back();
        }}
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
    fontSize: 20, // text-xl
    marginBottom: 8,
    fontFamily: 'Poppins_600SemiBold',
  },
  subtitle: {
    fontSize: 14, // text-sm
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
    fontSize: 14, // text-sm
    marginBottom: 8,
    marginLeft: 4,
    fontFamily: 'Poppins_500Medium',
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    fontSize: 16, // text-base
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
    shadowRadius: 3, // approximate shadow-md intent
    elevation: 4,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16, // text-base
    fontFamily: 'Poppins_600SemiBold',
  },
  navbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
