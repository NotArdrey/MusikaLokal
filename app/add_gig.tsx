import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';


export default function AddGigScreen() {
    const { colors } = useTheme();
    const [gigName, setGigName] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [talentNeeds, setTalentNeeds] = useState<string[]>([]);
    const [cost, setCost] = useState('');
    const [availabilitySlots, setAvailabilitySlots] = useState<Array<{date: string, time: string}>>([]);
    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [modalVisible, setModalVisible] = useState(false);

    const removeTalent = (index: number) => {
        setTalentNeeds(talentNeeds.filter((_, i) => i !== index));
    };

    const removeSlot = (index: number) => {
        setAvailabilitySlots(availabilitySlots.filter((_, i) => i !== index));
    };

    return (
    <>
      <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
        <Header title="Add Gig"></Header>

        <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
          <View className="pt-6">
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
              Gig Name
            </Text>
            <TextInput
              value={gigName}
              onChangeText={setGigName}
              className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
              style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
              placeholder="Enter gig name"
            />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 100 }}
            placeholder="Enter description"
            multiline
            textAlignVertical="top"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Address
          </Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
            placeholder="Enter address (e.g., Malolos, Bulacan)"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Upload Photos
          </Text>
          <View className="border-2 border-dashed border-gray-300 rounded-lg p-6 items-center justify-center mb-4">
            <Ionicons name="image-outline" size={40} color="#9CA3AF" />
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginTop: 8 }}>
              Upload Photos
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              Tap to upload your photos.
            </Text>
            <TouchableOpacity 
              className="mt-4 px-6 py-2 border border-gray-300 rounded-lg"
            >
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>
                Upload
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Upload Contract
          </Text>
          <View className="border-2 border-dashed border-gray-300 rounded-lg p-6 items-center justify-center mb-4">
            <Ionicons name="document-outline" size={40} color="#9CA3AF" />
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginTop: 8 }}>
              Upload Contract
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              Tap to upload your contract.
            </Text>
            <TouchableOpacity 
              className="mt-4 px-6 py-2 border border-gray-300 rounded-lg"
            >
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>
                Upload
              </Text>
            </TouchableOpacity>
          </View>
          
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Upload SEC or DTI Document
          </Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
            Upload your SEC or DTI registration for business verification
          </Text>
          <View className="border-2 border-dashed border-gray-300 rounded-lg p-6 items-center justify-center mb-4">
            <Ionicons name="document-outline" size={40} color="#9CA3AF" />
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginTop: 8 }}>
              Upload Document
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              Tap to upload your SEC or DTI document.
            </Text>
            <TouchableOpacity 
              className="mt-4 px-6 py-2 border border-gray-300 rounded-lg"
            >
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>
                Upload
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Talent Needs
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {talentNeeds.map((talent, index) => (
              <View key={index} className="flex-row items-center bg-gray-100 rounded-full px-4 py-2">
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.text }}>
                  {talent}
                </Text>
                <TouchableOpacity onPress={() => removeTalent(index)} className="ml-2">
                  <Ionicons name="close-circle" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity className="border border-dashed border-gray-400 rounded-full px-4 py-2">
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>
                + Add
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Cost
          </Text>
          <TextInput
            value={cost}
            onChangeText={setCost}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
            placeholder="Enter cost"
            keyboardType="numeric"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Availability
          </Text>
          <View className="gap-3 mb-4">
            {availabilitySlots.length > 0 && availabilitySlots.map((slot, index) => (
              <View key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <View className="flex-row items-center justify-between mb-2">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.text }}>
                    Slot {index + 1}
                  </Text>
                  <TouchableOpacity onPress={() => removeSlot(index)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginLeft: 8 }}>
                    {slot.date}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="time-outline" size={16} color="#6B7280" />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginLeft: 8 }}>
                    {slot.time}
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity className="border border-dashed border-gray-400 rounded-lg px-4 py-3 items-center">
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>
                + Add Time Slot
              </Text>
            </TouchableOpacity>
          </View>

            <TouchableOpacity 
              className="rounded-xl bg-primary-500 items-center justify-center py-3 mb-6"
              onPress={() => setModalVisible(true)}
            >
              <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>
                Create Gig Profile
              </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    
    <Modal
    visible = {modalVisible}
    onClose={() => setModalVisible(false)}
    title="Confirm Gig"
    message="Are you ready to post this gig?"
    buttonText="Confirm">
    </Modal>
    </>
    );
    
}

