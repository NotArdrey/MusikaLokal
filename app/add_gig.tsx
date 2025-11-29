import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';




export default function AddGigScreen() {
    const [gigName, setGigName] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [talentNeeds, setTalentNeeds] = useState<string[]>([]);
    const [cost, setCost] = useState('');
    const [availabilitySlots, setAvailabilitySlots] = useState<Array<{date: string, time: string}>>([]);
    const [selectedImages, setSelectedImages] = useState<string[]>([]);

    const removeTalent = (index: number) => {
        setTalentNeeds(talentNeeds.filter((_, i) => i !== index));
    };

    const removeSlot = (index: number) => {
        setAvailabilitySlots(availabilitySlots.filter((_, i) => i !== index));
    };

    return (
    <View className="flex-1 bg-white px-6">
      <Header title="Add Gig"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Gig Name
          </Text>
          <TextInput
            value={gigName}
            onChangeText={setGigName}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
            placeholder="Enter gig name"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
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

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Address
          </Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
            placeholder="Enter address (e.g., Malolos, Bulacan)"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Upload Photos
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              {selectedImages.length > 0 && selectedImages.map((uri, index) => (
                <View key={index} className="relative">
                  <Image 
                    source={{ uri }}
                    style={{ width: 100, height: 100, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity 
                    className="absolute top-1 right-1 bg-red-500 rounded-full w-6 h-6 items-center justify-center"
                    onPress={() => setSelectedImages(selectedImages.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity 
                className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg items-center justify-center"
                style={{ width: 100, height: 100 }}
              >
                <Ionicons name="add" size={32} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </ScrollView>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Upload Contract
          </Text>
          <View className="border-2 border-dashed border-gray-300 rounded-lg p-6 items-center justify-center mb-4">
            <Ionicons name="document-outline" size={40} color="#9CA3AF" />
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginTop: 8 }}>
              Upload Contract
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 4 }}>
              Tap to upload your contract.
            </Text>
            <TouchableOpacity 
              className="mt-4 px-6 py-2 border border-gray-300 rounded-lg"
            >
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: '#000' }}>
                Upload
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Talent Needs
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {talentNeeds.map((talent, index) => (
              <View key={index} className="flex-row items-center bg-gray-100 rounded-full px-4 py-2">
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#000' }}>
                  {talent}
                </Text>
                <TouchableOpacity onPress={() => removeTalent(index)} className="ml-2">
                  <Ionicons name="close-circle" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity className="border border-dashed border-gray-400 rounded-full px-4 py-2">
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6B7280' }}>
                + Add
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
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

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Availability
          </Text>
          <View className="gap-3 mb-4">
            {availabilitySlots.length > 0 && availabilitySlots.map((slot, index) => (
              <View key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <View className="flex-row items-center justify-between mb-2">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#000' }}>
                    Slot {index + 1}
                  </Text>
                  <TouchableOpacity onPress={() => removeSlot(index)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151', marginLeft: 8 }}>
                    {slot.date}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="time-outline" size={16} color="#6B7280" />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151', marginLeft: 8 }}>
                    {slot.time}
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity className="border border-dashed border-gray-400 rounded-lg px-4 py-3 items-center">
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6B7280' }}>
                + Add Time Slot
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            className="rounded-lg items-center justify-center py-3 mb-6"
            style={{ backgroundColor: '#00CEC9' }}
            onPress={() => router.back()}
          >
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#FFF' }}>
              Create Gig Profile
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    
    );
}