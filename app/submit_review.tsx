import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Submit Feedback" />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24, paddingTop: 20 }}>
            <View className="items-center mb-8">
              <Text className="text-xl font-semibold mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                Rate your experience
              </Text>
              <Text className="text-sm text-center px-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                How was your booking with SoundWave Studio Malolos?
              </Text>
            </View>

            <View className="flex-row justify-center mb-10 gap-2">
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
              <Text className="text-sm font-medium mb-2 ml-1" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Additional Comments</Text>
              <TextInput
                className={`rounded-xl border p-4 text-base ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
                placeholder="Share your experience..."
                placeholderTextColor={colors.textSecondary}
                style={{
                  height: 150,
                  textAlignVertical: 'top',
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  fontFamily: 'Poppins_400Regular'
                }}
                multiline
                value={feedback}
                onChangeText={setFeedback}
              />
            </View>

            <TouchableOpacity
              className="mt-8 rounded-xl py-4 items-center shadow-md shadow-indigo-500/20"
              style={{ backgroundColor: colors.primary, opacity: selectedValue === 0 ? 0.5 : 1 }}
              onPress={() => {
                if (selectedValue > 0) setModalVisible(true)
              }}
              disabled={selectedValue === 0}
            >
              <Text className="text-white text-base" style={{ fontFamily: 'Poppins_600SemiBold' }}>
                Submit Review
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        <View className="absolute bottom-0 left-0 right-0">
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
