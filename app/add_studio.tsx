import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function AddStudioScreen() {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [studioName, setStudioName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [cost, setCost] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  // Arrays
  const [amenities, setAmenities] = useState<string[]>([]);
  const [newAmenity, setNewAmenity] = useState('');

  const steps = [
    { id: 1, title: 'Details', icon: 'business' },
    { id: 2, title: 'Amenities', icon: 'mic' },
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
    console.log('Studio Created');
    router.back();
  };

  const addAmenity = () => {
    if (newAmenity.trim()) {
      setAmenities([...amenities, newAmenity.trim()]);
      setNewAmenity('');
    }
  };

  const removeAmenity = (index: number) => {
    setAmenities(amenities.filter((_, i) => i !== index));
  };

  const renderInput = (label: string, value: string, setValue: (text: string) => void, placeholder: string, multiline = false, numeric = false) => (
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
          keyboardType={numeric ? 'numeric' : 'default'}
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
      <Header title="Create Studio" />

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
            <Text className="text-xl mb-6" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Studio Details</Text>

            {renderInput('Studio Name', studioName, setStudioName, 'e.g. SoundWave Rec')}
            {renderInput('Description', description, setDescription, 'Describe your studio space, vibe, and main features...', true)}
            {renderInput('Location', address, setAddress, 'Complete Address')}
            {renderInput('Hourly Rate (₱)', cost, setCost, '0.00', false, true)}

            <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Photos & Documents (DTI)</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 border-2 border-dashed rounded-xl p-6 items-center justify-center mb-6"
                style={{ borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F9FAFB' }}
              >
                <Ionicons name="images-outline" size={24} color={colors.primary} />
                <Text className="mt-2 text-xs" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Photos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 border-2 border-dashed rounded-xl p-6 items-center justify-center mb-6"
                style={{ borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F9FAFB' }}
              >
                <Ionicons name="document-text-outline" size={24} color={colors.primary} />
                <Text className="mt-2 text-xs" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>DTI</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 2 && (
          <View className="pt-2 pb-24">
            <Text className="text-xl mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Facilities & Equipment</Text>
            <Text className="text-sm mb-6" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>List down available gear and room features.</Text>

            <View className="flex-row gap-2 mb-6">
              <View className={`flex-1 rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
                <TextInput
                  value={newAmenity}
                  onChangeText={setNewAmenity}
                  placeholder="e.g. Drum Kit, AC, Wifi"
                  placeholderTextColor={colors.textSecondary}
                  className="p-4"
                  style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                />
              </View>
              <TouchableOpacity
                onPress={addAmenity}
                className="w-14 items-center justify-center rounded-xl bg-indigo-500"
                style={{ backgroundColor: colors.primary }}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {amenities.map((item, index) => (
                <View key={index} className="flex-row items-center pl-4 pr-2 py-2 rounded-full border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                  <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{item}</Text>
                  <TouchableOpacity onPress={() => removeAmenity(index)} className="ml-2">
                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
              {amenities.length === 0 && (
                <View className="w-full p-8 items-center justify-center border-2 border-dashed rounded-xl" style={{ borderColor: colors.border }}>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>No amenities listed yet.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {step === 3 && (
          <View className="pt-2 pb-24">
            <Text className="text-xl mb-6" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Review Profile</Text>

            <View className="p-5 rounded-2xl border mb-6" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <View className="items-center mb-6">
                <View className="w-20 h-20 rounded-full bg-indigo-100 items-center justify-center mb-3">
                  <Ionicons name="business" size={32} color={colors.primary} />
                </View>
                <Text className="text-xl" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>{studioName || 'Untitled Studio'}</Text>
                <Text className="text-sm mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>{address || 'No Address'}</Text>
                <Text className="px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs mt-3" style={{ fontFamily: 'Poppins_600SemiBold' }}>₱ {cost || '0'} / hr</Text>
              </View>

              <View className="border-t pt-4" style={{ borderColor: colors.border }}>
                <Text className="text-xs uppercase text-gray-400 mb-2" style={{ fontFamily: 'Poppins_600SemiBold' }}>Amenities ({amenities.length})</Text>
                <View className="flex-row flex-wrap gap-2">
                  {amenities.map((m, i) => (
                    <Text key={i} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600" style={{ fontFamily: 'Poppins_400Regular' }}>{m}</Text>
                  ))}
                </View>
              </View>
            </View>
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
            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{step === 3 ? 'Create Studio' : 'Next Step'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Create Studio"
        message="Are you sure you want to create this studio profile?"
        buttonText="Create Profile"
        onConfirm={handleConfirm}
      />
    </View>
  );
}

