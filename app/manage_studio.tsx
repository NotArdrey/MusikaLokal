import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';



export default function StudioDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');

  const handleAction = (action: string) => {
      if (action === 'accept') {
          setModalTitle('Accept Booking');
          setModalMessage('Are you sure you want to accept this booking request?');
          setModalButtonText('Accept');
      } else {
          setModalTitle('Decline Booking');
          setModalMessage('Are you sure you want to decline this booking request?');
          setModalButtonText('Decline');
      }
      setModalVisible(true);
  }

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

            <TouchableOpacity onPress={() => {setActiveTab('Bookings')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'Bookings'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>Bookings</Text>
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

          ): activeTab === 'Bookings'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Booking Requests</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>Review and manage booking requests for your studio</Text>
              </View>

              {/* Booking Request 1 */}
              <View className="rounded-xl p-4 mt-4" style={{ borderWidth: 1, borderColor: colors.border }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-full overflow-hidden" style={{height: 60, width: 60, borderWidth: 1, borderColor: colors.border}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Marcus Rivera</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Solo Artist • Singer-Songwriter</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4, color: colors.text }}>Dec 15, 2025 • 2:00 PM - 6:00 PM</Text>
                      </View>
                    </View>
                  </View>
                </View>
                
                <View className="mt-3 rounded-lg p-3" style={{ backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }}>
                  <View className="flex-row justify-between">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Duration: 4 hours</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.primary }}>₱2,000.00</Text>
                  </View>
                </View>

                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>"I'd like to record my upcoming EP. I have 5 songs ready and need professional mixing as well."</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity onPress={() => handleAction('accept')} className="flex-1 bg-primary-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleAction('decline')} className="flex-1 rounded-lg py-2 items-center" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="rounded-lg px-3 items-center justify-center" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Booking Request 2 */}
              <View className="rounded-xl p-4 mt-3" style={{ borderWidth: 1, borderColor: colors.border }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-full overflow-hidden" style={{height: 60, width: 60, borderWidth: 1, borderColor: colors.border}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>The Midnight Echoes</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Band • Indie Rock • 4 members</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4, color: colors.text }}>Dec 18, 2025 • 10:00 AM - 4:00 PM</Text>
                      </View>
                    </View>
                  </View>
                </View>
                
                <View className="mt-3 rounded-lg p-3" style={{ backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }}>
                  <View className="flex-row justify-between">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Duration: 6 hours</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.primary }}>₱3,000.00</Text>
                  </View>
                </View>

                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>"We're recording our debut single. We'll bring our own instruments but will need the full recording suite and mixing services."</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity onPress={() => handleAction('accept')} className="flex-1 bg-primary-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleAction('decline')} className="flex-1 rounded-lg py-2 items-center" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="rounded-lg px-3 items-center justify-center" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Booking Request 3 */}
              <View className="rounded-xl p-4 mt-3" style={{ borderWidth: 1, borderColor: colors.border }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-full overflow-hidden" style={{height: 60, width: 60, borderWidth: 1, borderColor: colors.border}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>DJ Beats Production</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Producer • Electronic Music</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4, color: colors.text }}>Dec 20, 2025 • 8:00 PM - 12:00 AM</Text>
                      </View>
                    </View>
                  </View>
                </View>
                
                <View className="mt-3 rounded-lg p-3" style={{ backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }}>
                  <View className="flex-row justify-between">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Duration: 4 hours</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.primary }}>₱2,000.00</Text>
                  </View>
                </View>

                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>"Looking to use your mixing board for mastering my latest tracks. Will need access to monitoring systems."</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity onPress={() => handleAction('accept')} className="flex-1 bg-primary-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleAction('decline')} className="flex-1 rounded-lg py-2 items-center" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="rounded-lg px-3 items-center justify-center" style={{ borderWidth: 1, borderColor: colors.border }}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
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
      visible={modalVisible}
      onClose={() => setModalVisible(false)}
      title={modalTitle}
      message={modalMessage}
      buttonText={modalButtonText}
    />
    </>
  );
}

