import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ userId?: string }>();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  React.useEffect(() => {
    fetchProfile();
  }, [params.userId]);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      // Determine target ID: param OR current user
      const targetId = params.userId || currentUserId;

      if (!targetId) {
        console.log('No user found');
        setLoading(false);
        return;
      }

      // Check ownership
      const ownership = currentUserId && targetId === currentUserId;
      setIsOwner(!!ownership);

      const { data, error } = await supabase.functions.invoke('manage-profile', {
        body: { action: 'fetch', userId: targetId }
      });
      if (error) throw error;
      setProfile(data);
    } catch (e) {
      console.log('Error fetching profile:', e);
    } finally {
      setLoading(false);
    }
  }

  const MENU_ITEMS = [
    { label: 'Edit Profile', icon: 'person-outline', route: '/edit_profile' },
    { label: 'Wallet', icon: 'wallet-outline', route: '/wallet' },
    { label: 'Settings', icon: 'settings-outline', route: '/settings' },
  ];

  const [uploading, setUploading] = useState(false);

  const addMediaToPortfolio = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in.');
        return;
      }

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All, // Images + Videos
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      setUploading(true);
      const file = result.assets[0];
      const fileExt = file.uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const response = await fetch(file.uri);
      const blob = await response.blob();

      const { data, error } = await supabase.storage
        .from('portfolio')
        .upload(fileName, blob, { contentType: file.type || `image/${fileExt}` });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('portfolio')
        .getPublicUrl(data.path);

      // Add URL to portfolio_urls via Edge Function
      await supabase.functions.invoke('manage-profile', {
        body: { action: 'add_media', userId: user.id, mediaUrl: urlData.publicUrl }
      });

      // Refresh profile
      fetchProfile();
      Alert.alert('Success', 'Media added to portfolio!');
    } catch (e: any) {
      console.log('Upload error:', e);
      Alert.alert('Error', e.message || 'Failed to upload media');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title={isOwner ? "My Profile" : "User Profile"} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>

          {/* Profile Header */}
          <View className="px-6 pt-2 pb-6 items-center">
            <View className="relative">
              <View
                className="w-28 h-28 rounded-full overflow-hidden mb-4 border-4"
                style={{ borderColor: colors.surface }}
              >
                <Image
                  source={{ uri: profile?.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&fit=crop' }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>

              {isOwner && (
                <TouchableOpacity
                  onPress={() => router.push('/edit_profile')}
                  className="absolute bottom-4 right-0 p-2 rounded-full shadow-sm"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Ionicons name="pencil" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <Text className="text-xl mb-1 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{profile?.full_name || 'User'}</Text>
            <Text className="text-sm mb-4 text-center" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>{profile?.skills?.join(', ') || 'Musician'} • {profile?.location || 'Unknown'}</Text>

            <View className="flex-row gap-2 flex-wrap justify-center mb-6">
              {(profile?.genres || ['Rock', 'Indie']).map((genre: string) => (
                <View key={genre} className="px-3 py-1 rounded-full" style={{ backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>{genre}</Text>
                </View>
              ))}
            </View>

            <View className="flex-row w-full justify-between px-2">
              <View className="items-center flex-1">
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 18, color: colors.text }}>{profile?.rating ? `${Math.round(profile.rating * 20)}%` : 'N/A'}</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Rating</Text>
              </View>
              <View className="w-[1px] h-full bg-gray-200" style={{ backgroundColor: colors.border }} />
              <View className="items-center flex-1">
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 18, color: colors.text }}>{profile?.review_count || 0}</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Reviews</Text>
              </View>
              <View className="w-[1px] h-full bg-gray-200" style={{ backgroundColor: colors.border }} />
              <View className="items-center flex-1">
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 18, color: colors.text }}>-</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Active</Text>
              </View>
            </View>
          </View>

          {/* Menu Items (Owner Only) */}
          {isOwner ? (
            <View className="px-6 gap-3">
              {MENU_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => router.push(item.route as any)}
                  className="p-4 rounded-2xl flex-row items-center justify-between"
                  style={{ backgroundColor: colors.surface }}
                >
                  <View className="flex-row items-center gap-4">
                    <View className="w-10 h-10 rounded-full items-center justify-center bg-gray-50 dark:bg-slate-800">
                      <Ionicons name={item.icon as any} size={20} color={colors.text} />
                    </View>
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 15, color: colors.text }}>
                      {item.label}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* Public View Actions */
            /* Public View Actions */
            <View className="px-6 gap-3">
              <TouchableOpacity
                onPress={() => router.push('/report?type=profile&name=Jared%20Lopez%20Bagtas' as any)}
                className="p-4 rounded-2xl flex-row items-center justify-between"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center gap-4">
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: isDark ? '#450a0a' : '#fef2f2' }}>
                    <Ionicons name="flag-outline" size={20} color="#ef4444" />
                  </View>
                  <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 15, color: '#ef4444' }}>
                    Report User
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Media Section */}
          <View className="px-6 mt-6">
            <Text className="mb-4 text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Media & Portfolio</Text>
            {(!profile?.portfolio_urls || profile.portfolio_urls.length === 0) ? (
              <View className="items-center justify-center py-10 border border-dashed rounded-2xl" style={{ borderColor: colors.border }}>
                <Ionicons name="images-outline" size={32} color={colors.textSecondary} />
                <Text className="mt-2 text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>No media yet</Text>
                {isOwner && (
                  <TouchableOpacity
                    onPress={addMediaToPortfolio}
                    disabled={uploading}
                    className="mt-3 px-4 py-2 rounded-lg"
                    style={{ backgroundColor: uploading ? colors.textSecondary : colors.primary }}
                  >
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: '#fff', fontSize: 12 }}>
                      {uploading ? 'Uploading...' : 'Add Media'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6 gap-3">
                {profile.portfolio_urls.map((url: string, i: number) => (
                  <View key={i} className="w-64 h-40 rounded-2xl overflow-hidden relative shadow-sm" style={{ backgroundColor: colors.surface }}>
                    <Image
                      source={{ uri: url }}
                      className="w-full h-full"
                      style={{ opacity: 0.9 }}
                    />
                    <View className="absolute inset-0 items-center justify-center bg-black/20">
                      <Ionicons name="play-circle" size={40} color="#fff" />
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

        </ScrollView>
        <Navbar />
      </View>
    </>
  );
}

