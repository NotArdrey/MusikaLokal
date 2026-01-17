import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function AddGigScreen() {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [gigName, setGigName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [cost, setCost] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  // Form Steps Configuration
  const steps = [
    { id: 1, title: 'Gig Details', icon: 'information-circle' },
    { id: 2, title: 'Requirements', icon: 'list' },
    { id: 3, title: 'Review', icon: 'checkmark-circle' },
  ];

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else setModalVisible(true);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const handleConfirm = () => {
    setModalVisible(false);
    console.log('Gig Created');
    router.back();
  };

  const renderInput = (label: string, value: string, setValue: (text: string) => void, placeholder: string, multiline = false, keyboardType: any = 'default') => (
    <View className="mb-4">
      <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>{label}</Text>
      <View className={`rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={keyboardType}
          className="p-4"
          style={{
            fontFamily: 'Poppins_400Regular',
            color: colors.text,
            height: multiline ? 120 : 'auto',
            textAlignVertical: multiline ? 'top' : 'center'
          }}
        />
      </View>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Create Gig" />

      {/* Step Indicator */}
      <View className="flex-row justify-between px-8 py-6">
        {steps.map((s, index) => {
          const isActive = step >= s.id;
          const isCurrent = step === s.id;
          return (
            <View key={s.id} className="items-center relative" style={{ width: 80 }}>
              <View
                className={`w-10 h-10 rounded-full items-center justify-center mb-2 border-2 ${isActive ? 'bg-indigo-500 border-indigo-500' : 'bg-transparent border-gray-300'}`}
                style={{
                  backgroundColor: isActive ? colors.primary : 'transparent',
                  borderColor: isActive ? colors.primary : colors.border
                }}
              >
                <Ionicons name={s.icon as any} size={20} color={isActive ? '#fff' : colors.textSecondary} />
              </View>
              <Text
                style={{
                  fontFamily: isCurrent ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                  fontSize: 10,
                  color: isCurrent ? colors.primary : colors.textSecondary
                }}
              >
                {s.title}
              </Text>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <View
                  className="absolute top-5 -right-[50%] w-full h-[2px]"
                  style={{
                    backgroundColor: step > s.id ? colors.primary : colors.border,
                    width: 60,
                    right: -40
                  }}
                />
              )}
            </View>
          );
        })}
      </View>

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {step === 1 && (
          <View className="pt-2 pb-24">
            <Text className="text-xl mb-6" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Basic Information</Text>
            {renderInput('Gig Title', gigName, setGigName, 'e.g. Saturday Night Live Band')}
            {renderInput('Location', address, setAddress, 'e.g. The Grand Ballroom, Makati')}
            {renderInput('Budget', cost, setCost, 'e.g. 15000', false, 'numeric')}
            {renderInput('Description', description, setDescription, 'Describe the event, genre, and special requests...', true)}
          </View>
        )}

        {step === 2 && (
          <View className="pt-2 pb-24">
            <Text className="text-xl mb-6" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Technical Requirements</Text>

            <View className="mb-6">
              <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Documents</Text>

              {['Contract', 'Tech Rider', 'Set List'].map((doc, i) => (
                <TouchableOpacity
                  key={i}
                  className="flex-row items-center justify-between p-4 mb-3 rounded-xl border border-dashed border-gray-300"
                  style={{ borderColor: colors.border }}
                >
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center" style={{ backgroundColor: isDark ? colors.card : '#F3F4F6' }}>
                      <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
                    </View>
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Upload {doc}</Text>
                  </View>
                  <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View className="pt-2 pb-24">
            <Text className="text-xl mb-6" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Summary</Text>

            <View className="p-5 rounded-2xl border mb-6" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <View className="mb-4">
                <Text className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Poppins_500Medium' }}>TITLE</Text>
                <Text className="text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{gigName || 'Untitled Gig'}</Text>
              </View>
              <View className="mb-4">
                <Text className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Poppins_500Medium' }}>LOCATION</Text>
                <Text className="text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}>{address || 'No location set'}</Text>
              </View>
              <View>
                <Text className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Poppins_500Medium' }}>BUDGET</Text>
                <Text className="text-lg text-green-600" style={{ fontFamily: 'Poppins_700Bold' }}>₱ {cost || '0.00'}</Text>
              </View>
            </View>

            <Text className="text-xs text-center text-gray-400 px-4">
              By posting this gig, you agree to our Terms of Service and Cancellation Policy.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Controls */}
      <View className="absolute bottom-24 left-0 right-0 px-6 py-4 border-t border-gray-100 bg-white/90" style={{ borderColor: isDark ? '#334155' : '#E5E7EB', backgroundColor: isDark ? colors.background : '#fffc' }}>
        <View className="flex-row gap-4">
          <TouchableOpacity
            onPress={handleBack}
            className="flex-1 py-4 rounded-xl items-center justify-center border border-gray-200"
            style={{ borderColor: colors.border }}
          >
            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{step === 1 ? 'Cancel' : 'Back'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNext}
            className="flex-1 py-4 rounded-xl items-center justify-center shadow-lg"
            style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8 }}
          >
            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{step === 3 ? 'Post Gig' : 'Next Step'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Posting"
        message="Are you sure you want to post this gig? It will be visible to all verified musicians."
        buttonText="Confim & Post"
        onConfirm={handleConfirm}
      />
    </View>
  );
}

