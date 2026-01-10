import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';



export default function StudioDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="px-6">
        <Header title="Studio Details"></Header>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-6" contentContainerStyle={{ paddingBottom: 20 }}>
        <View className="flex flex-1 mt-3 flex-col">
          <View className="justify-center items-center gap-1">
            <View
              className="rounded-xl"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 6,
                elevation: 8,
                marginHorizontal: 4,
                marginVertical: 8,
                height: 200,
                width: '50%',
              }}
            >
              <Image
                className="rounded-xl flex flex-1"
                source={{uri: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=130&fit=crop'}}
                style={{
                  flex: 1,
                  height: 200,
                  width: '100%',
                }}
                resizeMode="cover"
              />
            </View>
            
            <Text className="mt-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>SoundWave Recording Studio</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>Professional Recording Studio</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Malolos City, Bulacan, Philippines</Text>
          </View>

          <View className="flex flex-row gap-5 mt-8 justify-center" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => {setActiveTab('About')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'About'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>About</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Book')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'Book'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border  }}>Book</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Review')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'Review'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>Review</Text>
            </TouchableOpacity>
          </View>

          {activeTab ==='About'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>SoundWave Recording Studio is a professional recording facility located in Malolos City, Bulacan. We offer state-of-the-art equipment including condenser microphones, acoustic treatment, mixing console, and monitoring systems. Perfect for musicians, bands, podcasters, and voice-over artists looking for quality recordings.</Text>
              </View>

              <View className='flex flex-row mt-2 gap-4 mt-5'>
                <View className="justify-start items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }} >Size</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }} >30 sqm</Text>
                </View>

                <View>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Equipment</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Full Recording Suite, Mixing Board</Text>
                </View>
              </View>

              <View className="mt-5 flex gap-2 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Gallery</Text>

                <ScrollView showsHorizontalScrollIndicator={false}>
                  <View className="flex-row flex">
                    <View
                      className="rounded-xl"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                        elevation: 8,
                        marginHorizontal: 4,
                        marginVertical: 8,
                        height: 200,
                        width: 200,
                      }}
                    >
                      <Image
                        className="rounded-xl"
                        source={{uri: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=400&h=130&fit=crop'}}
                        style={{
                          flex: 1,
                          height: 200,
                          width: 200
                        }}
                      />
                    </View>

                    <View
                      className="rounded-xl"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                        elevation: 8,
                        marginHorizontal: 4,
                        marginVertical: 8,
                        height: 200,
                        width: 200,
                      }}
                    >
                      <Image
                        className="rounded-xl"
                        source={{uri: 'https://images.unsplash.com/photo-1563330232-57114bb0823c?w=400&h=130&fit=crop'}}
                        style={{
                          flex: 1,
                          height: 200,
                          width: 200
                        }}
                      />
                    </View>

                    <View
                      className="rounded-xl"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                        elevation: 8,
                        marginHorizontal: 4,
                        marginVertical: 8,
                        height: 200,
                        width: 200,
                      }}
                    >
                      <Image
                        className="rounded-xl"
                        source={{uri: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400&h=130&fit=crop'}}
                        style={{
                          flex: 1,
                          height: 200,
                          width: 200
                        }}
                      />
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>

          ): activeTab === 'Book'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Booking Information</Text>
              </View>

              <View className="mt-4">
                <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>Date</Text>
                <TouchableOpacity className="rounded-xl px-3 py-3 mt-2 flex-row items-center justify-between" style={{ borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary}}>Select date</Text>
                  <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View className="mt-4">
                <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>Time</Text>
                <View className="flex flex-row gap-3 mt-2">
                  <View className="rounded-xl px-3 py-3 flex-1" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <TextInput placeholder='Start time' placeholderTextColor={colors.muted} style={{fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text}}>
                    </TextInput>
                  </View>
                  <View className="rounded-xl px-3 py-3 flex-1" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <TextInput placeholder='End time' placeholderTextColor={colors.muted} style={{fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text}}>
                    </TextInput>
                  </View>
                </View>
              </View>

              <View className="mt-4">
                <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>Number of Hours</Text>
                <View className="rounded-xl px-3 py-3 mt-2" style={{ borderWidth: 1, borderColor: colors.border }}>
                  <TextInput placeholder='Enter number of hours' placeholderTextColor={colors.muted} keyboardType='numeric' style={{fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text}}>
                  </TextInput>
                </View>
              </View>

              <View className="mt-4">
                <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>Additional Message</Text>
                <View className="rounded-xl px-3 py-2 justify-start items-start mt-2" style={{ borderWidth: 1, borderColor: colors.border }}>
                  <TextInput className="justify-start items-start" placeholder='Enter your message (optional)' placeholderTextColor={colors.muted} multiline={true} style={{height: 100, width: '100%', fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text}}>
                  </TextInput>
                </View>
              </View>

              <TouchableOpacity className="mt-5 rounded-xl" style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 6,
                  elevation: 8,
                  marginHorizontal: 4,
                  marginVertical: 8,
                }}>
                <View className="justify-center items-center flex flex-row gap-4 pl-3 rounded-xl" style={{ backgroundColor: isDark ? colors.inputBackground : '#E5E7EB' }}>
                  <View className="flex flex-col justify-center items-center" style={{width: '40%'}}>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Contract of the Gig</Text>
                    <Text className="text-primary-500" style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>View Contract</Text>
                  </View>
                  <Image
                    className="rounded-r-xl flex flex-1"
                    source={{uri: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&h=200&fit=crop'}}
                    style={{
                      height: 120
                    }}
                    resizeMode="contain"
                  />                  
                </View>
              </TouchableOpacity>

              <View className="mt-5 rounded-xl p-4" style={{ backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Booking Summary</Text>
                <View className="flex flex-row justify-between mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>Hourly Rate</Text>
                  <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>₱500.00</Text>
                </View>
                <View className="flex flex-row justify-between mt-2">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>Service Fee</Text>
                  <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>₱50.00</Text>
                </View>
                <View className="mt-3 pt-3 flex flex-row justify-between" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Total Cost</Text>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.primary }}>₱550.00</Text>
                </View>
              </View>

              <TouchableOpacity className="rounded-xl mt-5 justify-center items-center py-3 bg-primary-500" onPress={() => setModalVisible(true)}>
                <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Confirm Booking</Text>
              </TouchableOpacity>
            </View>
          ) : activeTab ==="Review" ? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>User Reviews</Text>
              </View>

              <View className ="justify-center items-center flex flex-row gap-10 mt-4">

                <View className="w-1/4 items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 32, color: colors.text }}>4.5</Text>
                  <View className="flex-row">
                    <Ionicons name="star" size={16} color={colors.primary} />
                    <Ionicons name="star" size={16} color={colors.primary} />
                    <Ionicons name="star" size={16} color={colors.primary} />
                    <Ionicons name="star" size={16} color={colors.primary} />
                    <Ionicons name="star-half" size={16} color={colors.primary} />
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>25 Reviews</Text>
                </View>

                <View className="flex-1">
                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12, color: colors.text }}>5</Text>
                    <View className="flex-1 h-3 rounded-xl overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
                      <View className="h-full bg-primary-500 w-full rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12, color: colors.text }}>4</Text>
                    <View className="flex-1 h-3 rounded-xl overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
                      <View className="h-full bg-primary-500 w-4/5 rounded-xl" />
                    </View>                  
                  </View>
          
                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12, color: colors.text }}>3</Text>
                    <View className="flex-1 h-3 rounded-xl overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
                      <View className="h-full bg-primary-500 w-3/5 rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12, color: colors.text }}>2</Text>
                    <View className="flex-1 h-3 rounded-xl overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
                      <View className="h-full bg-primary-500 w-2/5 rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12, color: colors.text }}>1</Text>
                    <View className="flex-1 h-3 rounded-xl overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
                      <View className="h-full bg-primary-500 w-1/5 rounded-xl" />
                    </View>                  
                  </View>
                </View>
              </View>

              <View className="mt-5">
                <View className="flex-row gap-2 items-center">
                  <View className="rounded-3xl overflow-hidden" style={{height: 50, width: 50, borderWidth: 1, borderColor: colors.border}}>
                    <Image
                      source={{uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'}}
                      style={{
                        height: 50,
                        width: 50,
                      }}
                      resizeMode="cover"
                    />
                  </View>

                  <View className="flex-col">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Jared Cariaso</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>1 month ago</Text>
                  </View>
                </View>

                <View className="flex-row mt-2">
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star-half" size={16} color={colors.primary} />
                </View>


                <View className="flex-1 mt-2">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>Excellent studio! The acoustic treatment is superb and the equipment is professional-grade. The engineer was very helpful and knowledgeable. We recorded our EP here and the quality exceeded our expectations. Highly recommend for serious recording projects.</Text>
                </View>


                <View className ="flex-row items-center gap-4 mt-3">
                  <TouchableOpacity className="flex-row items-center gap-1">
                    <Ionicons name="heart-outline" size={24} color={colors.text} />
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>8</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-row items-center gap-1">
                    <Ionicons name="chatbubble-outline" size={22} color={colors.text} />
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>1</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          ) : null}


        </View>
      </ScrollView>

      <Navbar/>
    </View>
    
    <Modal
    visible = {modalVisible}
    onClose={() => setModalVisible(false)}
    title="Confirm Booking"
    message="Are you sure you want to confirm this booking?"
    buttonText="Confirm">
    </Modal>
    </>
  );
}

