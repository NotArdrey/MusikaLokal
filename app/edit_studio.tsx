import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function EditStudioScreen() {
    const { colors, isDark } = useTheme();
    const [studioName, setStudioName] = useState('SoundWave Recording Studio');
    const [description, setDescription] = useState('Professional recording studio equipped with state-of-the-art equipment and acoustic treatment for premium sound quality.');
    const [address, setAddress] = useState('Malolos, Bulacan');
    const [amenities, setAmenities] = useState(['Soundproof Rooms', 'Mixing Console', 'Instruments', 'Wi-Fi']);
    const [cost, setCost] = useState('800');
    const [availabilitySlots, setAvailabilitySlots] = useState([
        { date: 'March 5, 2026', time: '9:00am - 5:00pm' },
        { date: 'March 12, 2026', time: '10:00am - 6:00pm' },
        { date: 'March 19, 2026', time: '2:00pm - 8:00pm' }
    ]);
    const [selectedImages, setSelectedImages] = useState([
        'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=300&h=200&fit=crop',
        'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=300&h=200&fit=crop',
        'https://images.unsplash.com/photo-1563330232-57114bb0823c?w=300&h=200&fit=crop'
    ]);
    const [modalVisible, setModalVisible] = useState(false);

    const removeAmenity = (index: number) => {
        setAmenities(amenities.filter((_, i) => i !== index));
    };

    const removeSlot = (index: number) => {
        setAvailabilitySlots(availabilitySlots.filter((_, i) => i !== index));
    };

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Edit Studio"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Studio Name
          </Text>
          <TextInput
            value={studioName}
            onChangeText={setStudioName}
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, backgroundColor: colors.card, color: colors.text }}
            placeholder="Enter studio name"
            placeholderTextColor={colors.muted}
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, backgroundColor: colors.card, color: colors.text }}
            placeholder="Enter description"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Address
          </Text>
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?w=400&h=150&fit=crop' }}
              style={{ width: '100%', height: 120 }}
              resizeMode="cover"
            />
          </View>
          <TextInput
            value={address}
            onChangeText={setAddress}
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, backgroundColor: colors.card, color: colors.text }}
            placeholder="Enter address"
            placeholderTextColor={colors.muted}
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Upload Photos
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              {selectedImages.map((uri, index) => (
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
                style={{ width: 100, height: 100, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="add" size={32} color={colors.muted} />
              </TouchableOpacity>
            </View>
          </ScrollView>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Amenities
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {amenities.map((amenity, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? colors.inputBackground : '#F3F4F6', borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.text }}>
                  {amenity}
                </Text>
                <TouchableOpacity onPress={() => removeAmenity(index)} style={{ marginLeft: 8 }}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>
                + Add
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Cost per Hour
          </Text>
          <TextInput
            value={cost}
            onChangeText={setCost}
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, backgroundColor: colors.card, color: colors.text }}
            placeholder="Enter cost per hour"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Availability
          </Text>
          <View className="gap-3 mb-4">
            {availabilitySlots.map((slot, index) => (
              <View key={index} style={{ backgroundColor: isDark ? 'rgba(29, 185, 84, 0.1)' : '#EFF6FF', borderWidth: 1, borderColor: isDark ? 'rgba(29, 185, 84, 0.2)' : '#BFDBFE', borderRadius: 8, padding: 12 }}>
                <View className="flex-row items-center justify-between mb-2">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.text }}>
                    Slot {index + 1}
                  </Text>
                  <TouchableOpacity onPress={() => removeSlot(index)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginLeft: 8 }}>
                    {slot.date}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="time-outline" size={16} color={colors.muted} />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginLeft: 8 }}>
                    {slot.time}
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}>
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
              Save Studio Profile
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
    title="Confirm Changes"
    message="Are you sure you want to save these changes?"
    buttonText="Save">
    </Modal>
    </>
    );
}

