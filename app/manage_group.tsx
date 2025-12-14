import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';



export default function GroupDetailsScreen() {
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');

  const handleAction = (action: string) => {
      if (action === 'accept') {
          setModalTitle('Accept Invitation');
          setModalMessage('Are you sure you want to accept this invitation?');
          setModalButtonText('Accept');
      } else {
          setModalTitle('Decline Invitation');
          setModalMessage('Are you sure you want to decline this invitation?');
          setModalButtonText('Decline');
      }
      setModalVisible(true);
  }

  return (
    <>
    <View className="flex-1 bg-white">
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

            <TouchableOpacity onPress={() => {setActiveTab('Gigs')}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: activeTab === 'Gigs'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15  }}>Gigs</Text>
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

              <View className="mt-5 flex gap-2 border-t border-gray-300 pt-3">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Completion Rate</Text>
                <View className="flex flex-row gap-2 items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 20, color: '#10b981' }}>98%</Text>
                  <View className="flex-1 h-2 bg-gray-300 rounded-full overflow-hidden">
                    <View className="h-full bg-green-500 rounded-full" style={{ width: '98%' }} />
                  </View>
                </View>
              </View>

              <View className="mt-5 flex border-t border-gray-300 pt-3">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Manager</Text>
                
                <View className="flex-row items-center justify-between">
                  <View className="flex-col">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>Jared Cariaso</Text>
                    <View className="flex-row gap-2 items-center">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#10b981' }}>98%</Text>
                      <View className="w-48 h-2 bg-gray-300 rounded-full overflow-hidden">
                        <View className="h-full bg-green-500 rounded-full" style={{ width: '98%' }} />
                      </View>
                    </View>

                    <TouchableOpacity>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#14b8a6', textDecorationLine: 'underline' }}>View Profile</Text>
                    </TouchableOpacity>
           
                  </View>

                  <View className="rounded-2xl overflow-hidden" style={{height: 80, width: 80}}>
                    <Image
                      source={{uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'}}
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

          ): activeTab === 'Gigs'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Gig Invitations</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280', marginTop: 4 }}>Venues and event organizers inviting your group to perform</Text>
              </View>

              {/* Invitation Card 1 */}
              <View className="border border-gray-300 rounded-xl p-4 mt-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-xl border border-gray-300 overflow-hidden" style={{height: 60, width: 60}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>The Blue Note Bar</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280' }}>Live Music Venue • Makati City</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="star" size={14} color="#14b8a6" />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4 }}>4.9 (156 reviews)</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View className="mt-3 bg-teal-50 rounded-lg p-3">
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="calendar" size={16} color="#14b8a6" />
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: '#14b8a6' }}>Dec 22, 2025 • 8:00 PM - 11:00 PM</Text>
                  </View>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Ionicons name="cash-outline" size={16} color="#14b8a6" />
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#14b8a6' }}>₱8,000.00</Text>
                  </View>
                </View>
                
                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151' }}>"We loved your performance at our sister venue! Would you be interested in a 3-hour set for our Christmas event? We'll provide all sound equipment."</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity onPress={() => handleAction('accept')} className="flex-1 bg-teal-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleAction('decline')} className="flex-1 border border-gray-300 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#374151' }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="border border-gray-300 rounded-lg px-3 items-center justify-center">
                    <Ionicons name="eye-outline" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Invitation Card 2 */}
              <View className="border border-gray-300 rounded-xl p-4 mt-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-xl border border-gray-300 overflow-hidden" style={{height: 60, width: 60}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Sunset Beach Resort</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280' }}>Resort • Batangas</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="star" size={14} color="#14b8a6" />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4 }}>4.7 (89 reviews)</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View className="mt-3 bg-teal-50 rounded-lg p-3">
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="calendar" size={16} color="#14b8a6" />
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: '#14b8a6' }}>Dec 31, 2025 • 9:00 PM - 1:00 AM</Text>
                  </View>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Ionicons name="cash-outline" size={16} color="#14b8a6" />
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#14b8a6' }}>₱15,000.00</Text>
                  </View>
                </View>
                
                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151' }}>"We're hosting a New Year's Eve countdown party and would love to have your band headline the event. Accommodation and meals included!"</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity onPress={() => handleAction('accept')} className="flex-1 bg-teal-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleAction('decline')} className="flex-1 border border-gray-300 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#374151' }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="border border-gray-300 rounded-lg px-3 items-center justify-center">
                    <Ionicons name="eye-outline" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Invitation Card 3 */}
              <View className="border border-gray-300 rounded-xl p-4 mt-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="rounded-xl border border-gray-300 overflow-hidden" style={{height: 60, width: 60}}>
                      <Image
                        source={{uri: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=100&h=100&fit=crop'}}
                        style={{ height: 60, width: 60 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Corporate Events PH</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280' }}>Event Organizer • BGC, Taguig</Text>
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="star" size={14} color="#14b8a6" />
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, marginLeft: 4 }}>4.8 (67 reviews)</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View className="mt-3 bg-teal-50 rounded-lg p-3">
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="calendar" size={16} color="#14b8a6" />
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: '#14b8a6' }}>Jan 15, 2026 • 6:00 PM - 9:00 PM</Text>
                  </View>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Ionicons name="cash-outline" size={16} color="#14b8a6" />
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#14b8a6' }}>₱12,000.00</Text>
                  </View>
                </View>
                
                <View className="mt-3">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#374151' }}>"We're organizing an annual company dinner for 300 guests and are looking for live entertainment. Interested in a 3-hour acoustic set?"</Text>
                </View>

                <View className="flex-row gap-2 mt-3">
                  <TouchableOpacity onPress={() => handleAction('accept')} className="flex-1 bg-teal-500 rounded-lg py-2 items-center">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleAction('decline')} className="flex-1 border border-gray-300 rounded-lg py-2 items-center">
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
    <Modal
        isVisible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
        onConfirm={() => setModalVisible(false)}
    />
    </>
  );
}