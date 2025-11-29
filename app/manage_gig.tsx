import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';



export default function GigDetailsScreen() {
  const [activeTab, setActiveTab] = useState('About');

  return (
    <View className="flex-1 bg-white">
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
            
            <Text className="mt-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Junction 88 Music Bar</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Live Music Venue</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>Plaridel, Bulacan, Philippines</Text>
          </View>

          <View className="flex flex-row gap-5 mt-8 border-b border-gray-300  justify-center">
            <TouchableOpacity onPress={() => {setActiveTab('About')}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: activeTab === 'About'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15 }}>About</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Applicants')}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: activeTab === 'Applicants'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15  }}>Applicants</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Review')}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: activeTab === 'Review'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15 }}>Review</Text>
            </TouchableOpacity>
          </View>

          {activeTab ==='About'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>The Junction 88 Music Bar is a premier live music venue in Plaridel, Bulacan, Philippines, known for its intimate atmosphere and diverse lineup of artists. We offer a full bar, stage lighting, and sound equipment for performers.</Text>
              </View>

              <View className='flex flex-row mt-2 gap-4 mt-5'>
                <View className="justify-start items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }} >Capacity</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }} >69</Text>
                </View>

                <View>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>Services</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>Sound System, Stage Lighting</Text>
                </View>
              </View>

              <View className="mt-5 flex gap-2 border-t border-gray-300 pt-3">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Gallery</Text>

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

          ): activeTab === 'Applicants'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Applicants List</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280', marginTop: 4 }}>Review and manage applications for this gig</Text>
              </View>

              {/* Applicant Card 1 */}
              <View className="border border-gray-300 rounded-xl p-4 mt-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-full border border-gray-300 overflow-hidden" style={{height: 60, width: 60}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>The Rock Band</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280' }}>Rock • 5 members</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="star" size={14} color="#14b8a6" />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4 }}>4.8 (23 reviews)</Text>
                      </View>
                    </View>
                  </View>
                </View>
                
                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151' }}>"We're a professional rock band with 5 years of experience performing at various venues. We'd love to perform at your event!"</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity className="flex-1 bg-teal-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 border border-gray-300 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#374151' }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="border border-gray-300 rounded-lg px-3 items-center justify-center">
                    <Ionicons name="eye-outline" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Applicant Card 2 */}
              <View className="border border-gray-300 rounded-xl p-4 mt-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-full border border-gray-300 overflow-hidden" style={{height: 60, width: 60}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Jazz Vibes Collective</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280' }}>Jazz • 4 members</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="star" size={14} color="#14b8a6" />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4 }}>4.9 (31 reviews)</Text>
                      </View>
                    </View>
                  </View>
                </View>
                
                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151' }}>"Smooth jazz quartet specializing in contemporary and classic jazz. We bring sophistication to any event."</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity className="flex-1 bg-teal-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 border border-gray-300 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#374151' }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="border border-gray-300 rounded-lg px-3 items-center justify-center">
                    <Ionicons name="eye-outline" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Applicant Card 3 */}
              <View className="border border-gray-300 rounded-xl p-4 mt-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-full border border-gray-300 overflow-hidden" style={{height: 60, width: 60}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Acoustic Souls</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280' }}>Acoustic • 3 members</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="star" size={14} color="#14b8a6" />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4 }}>4.7 (18 reviews)</Text>
                      </View>
                    </View>
                  </View>
                </View>
                
                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151' }}>"Intimate acoustic performances perfect for creating a cozy atmosphere. Original and cover songs available."</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity className="flex-1 bg-teal-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-1 border border-gray-300 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#374151' }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="border border-gray-300 rounded-lg px-3 items-center justify-center">
                    <Ionicons name="eye-outline" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : activeTab ==="Review" ? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>User Reviews</Text>
              </View>

              <View className ="justify-center items-center flex flex-row gap-10 mt-4">

                <View className="w-1/4 items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 32 }}>4.5</Text>
                  <View className="flex-row">
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star-half" size={16} color="#14b8a6" />
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>25 Reviews</Text>
                </View>

                <View className="flex-1">
                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>5</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-full rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>4</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-4/5 rounded-xl" />
                    </View>                  
                  </View>
          
                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>3</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-3/5 rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>2</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-2/5 rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>1</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-1/5 rounded-xl" />
                    </View>                  
                  </View>
                </View>
              </View>

              <View className="mt-5">
                <View className="flex-row gap-2 items-center">
                  <View className="rounded-3xl border border-gray-300 overflow-hidden" style={{height: 50, width: 50}}>
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
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Jared Cariaso</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6b7280' }}>1 month ago</Text>
                  </View>
                </View>

                <View className="flex-row mt-2">
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star-half" size={16} color="#14b8a6" />
                </View>


                <View className="flex-1 mt-2">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Amazing venue! The sound system was top-notch and the staff was incredibly professional. The crowd was great and we had an unforgettable night performing here. Highly recommend for any musician looking for a quality gig.</Text>
                </View>


                <View className ="flex-row items-center gap-4 mt-3">
                  <TouchableOpacity className="flex-row items-center gap-1">
                    <Ionicons name="heart-outline" size={24} color="#262626" />
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#262626' }}>8</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-row items-center gap-1">
                    <Ionicons name="chatbubble-outline" size={22} color="#262626" />
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#262626' }}>1</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          ) : null}


        </View>
      </ScrollView>

      <Navbar/>
    </View>
  );
}