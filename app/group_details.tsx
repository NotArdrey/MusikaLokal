import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';


export default function GroupDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="px-6">
        <Header title="Group Details"></Header>
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
                source={{uri: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=400&h=400&fit=crop'}}
                style={{
                  flex: 1,
                  height: 200,
                  width: '100%',
                }}
                resizeMode="cover"
              />
            </View>
            
            <Text className="mt-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Ben&Ben</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>Folk-Pop Band • 9 Members</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Manila, Philippines</Text>
            <TouchableOpacity 
              className="mt-5 rounded-xl bg-primary-500 px-8 py-3 items-center" 
              style={{
                width: '45%',
                shadowcolor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>Invite Group</Text>
            </TouchableOpacity>
          </View>

          <View className="flex flex-row gap-5 mt-8 justify-center" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => {setActiveTab('About')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'About'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>About</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Apply')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'Apply'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border  }}>Apply</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Review')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'Review'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>Review</Text>
            </TouchableOpacity>
          </View>

          {activeTab ==='About'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>Ben&Ben is a Filipino indie folk-pop band known for their poetic lyrics and soulful melodies. Formed in 2015, the 9-member ensemble has become one of the most celebrated acts in the Philippine music scene, with hits like "Pagtingin," "Leaves," and "Kathang Isip."</Text>
              </View>

              <View className='flex flex-row mt-2 gap-4 mt-5'>
                <View className="justify-start items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }} >Members</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }} >9</Text>
                </View>

                <View>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Genre</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Folk-Pop, Indie, OPM</Text>
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
                        source={{uri: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=400&h=400&fit=crop'}}
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
                        source={{uri: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&h=400&fit=crop'}}
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
                        source={{uri: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop'}}
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

              <View className="mt-5 flex gap-2 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Completion Rate</Text>
                <View className="flex flex-row gap-2 items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 20, color: '#10b981' }}>98%</Text>
                  <View className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
                    <View className="h-full bg-green-500 rounded-full" style={{ width: '98%' }} />
                  </View>
                </View>
              </View>

              <View className="mt-5 flex pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Band Leader</Text>
                
                <View className="flex-row items-center justify-between">
                  <View className="flex-col">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Paolo Benjamin</Text>
                    <View className="flex-row gap-2 items-center">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#10b981' }}>99%</Text>
                      <View className="w-48 h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
                        <View className="h-full bg-green-500 rounded-full" style={{ width: '99%' }} />
                      </View>
                    </View>

                    <TouchableOpacity onPress={() => router.push('/profile')}>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.primary, textDecorationLine: 'underline' }}>View Profile</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="rounded-2xl overflow-hidden" style={{height: 80, width: 80}}>
                    <Image
                      source={{uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'}}
                      style={{
                        height: 80,
                        width: 80,
                      }}
                      resizeMode="cover"
                    />
                  </View>
                </View>
              </View>
            </View>

          ): activeTab === 'Apply'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Message to band manager</Text>
              </View>

              <View className="rounded-xl px-3 py-2 justify-start items-start mt-3" style={{ borderWidth: 1, borderColor: colors.border }}>
                <TextInput className="justify-start items-start" placeholder='Introduce yourself and your event details' placeholderTextColor={colors.muted} multiline={true} style={{height: 200, width: '100%', fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text}}>
                </TextInput>
              </View>

              <View className="mt-5">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Event Details</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>Share information about your event and booking request</Text>
              </View>

              <View className="justify-center items-center border border-dashed rounded-xl p-6 mt-3" style={{ minHeight: 150, width: '100%', borderColor: colors.border }}>
                <TouchableOpacity className="justify-center items-center">
                  <Ionicons name="cloud-upload-outline" size={48} color={colors.textSecondary} />
                  <Text className="mt-2" style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>Upload Event Proposal</Text>
                  <Text className="mt-1" style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>PDF, DOC (Max 10MB)</Text>
                </TouchableOpacity>
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


                <View className="justify-center items-center flex flex-row gap-4 pl-3 rounded-xl mt-5" style={{ backgroundColor: isDark ? colors.inputBackground : '#E5E7EB' }}>
                      
                    <View className="flex flex-col justify-center items-center" style={{width: '40%'}}>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Booking Terms</Text>
                      <Text className="text-primary-500" style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>View Terms</Text>
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

              <TouchableOpacity className="rounded-xl mt-3 justify-center items-center py-3 bg-primary-500" onPress={() => setModalVisible(true)}>
                <Text className="text-white"style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Submit Booking Request</Text>
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
                      source={{uri: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop'}}
                      style={{
                        height: 50,
                        width: 50,
                      }}
                      resizeMode="cover"
                    />
                  </View>

                  <View className="flex-col">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Mark Santos</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>2 weeks ago</Text>
                  </View>
                </View>

                <View className="flex-row mt-2">
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star" size={16} color={colors.primary} />
                  <Ionicons name="star" size={16} color={colors.primary} />
                </View>


                <View className="flex-1 mt-2">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>Ben&Ben exceeded all expectations at our corporate event! Their live performance was absolutely breathtaking. The band was professional, punctual, and their music created such a beautiful atmosphere. The crowd was mesmerized from start to finish. Highly recommend booking them!</Text>
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
    message="Are you sure you want to submit this booking request?"
    buttonText="Submit">
    </Modal>
    </>
  );
}

