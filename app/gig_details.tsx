import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';



export default function GigDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="px-6">
        <Header title="Gig Details"></Header>
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
                source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
                style={{
                  flex: 1,
                  height: 200,
                  width: '100%',
                }}
                resizeMode="cover"
              />
            </View>
            
            <Text className="mt-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Junction 88 Music Bar</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>Live Music Venue</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Plaridel, Bulacan, Philippines</Text>
          </View>

          <View className="flex flex-row gap-5 mt-8 justify-center" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={() => {setActiveTab('About')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'About'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>About</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Apply')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'Apply'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>Apply</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Review')}}>
              <Text className="pb-2" style={{ fontFamily: activeTab === 'Review'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border }}>Review</Text>
            </TouchableOpacity>
          </View>

          {activeTab ==='About'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>The Junction 88 Music Bar is a premier live music venue in Plaridel, Bulacan, Philippines, known for its intimate atmosphere and diverse lineup of artists. We offer a full bar, stage lighting, and sound equipment for performers.</Text>
              </View>

              <View className='flex flex-row mt-2 gap-4 mt-5'>
                <View className="justify-start items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }} >Capacity</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }} >69</Text>
                </View>

                <View>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Services</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary }}>Sound System, Stage Lighting</Text>
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
                        source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
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
                        source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
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
                        source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
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

          ): activeTab === 'Apply'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Message to event owner</Text>
              </View>

              <View className="rounded-xl px-3 py-2 justify-start items-start mt-3" style={{ borderWidth: 1, borderColor: colors.border }}>
                <TextInput className="justify-start items-start" placeholder='Enter your message' placeholderTextColor={colors.muted} multiline={true} style={{height: 200, width: '100%', fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text}}>
                </TextInput>
              </View>

              <View className="mt-5">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Upload Sample Video</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>Share a video of your performance to showcase your talent</Text>
              </View>

              <View className="justify-center items-center border-dashed rounded-xl p-6 mt-3" style={{ minHeight: 150, width: '100%', borderWidth: 1, borderColor: colors.border }}>
                <TouchableOpacity className="justify-center items-center">
                  <Ionicons name="cloud-upload-outline" size={48} color="#9CA3AF" />
                  <Text className="mt-2" style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>Upload Video</Text>
                  <Text className="mt-1" style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>MP4, MOV (Max 50MB)</Text>
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

              <TouchableOpacity className="rounded-xl mt-3 justify-center items-center py-3 bg-primary-500" onPress={() => setModalVisible(true)}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#fff' }}>Submit</Text>
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
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>Amazing venue! The sound system was top-notch and the staff was incredibly professional. The crowd was great and we had an unforgettable night performing here. Highly recommend for any musician looking for a quality gig.</Text>
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
    title="Confirm Application"
    message="Are you sure you want to submit your application for this gig?"
    buttonText="Submit">
    </Modal>
    </>
  );
}

