import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
      // Check session first to avoid unnecessary API calls
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Session available:', !!session, 'Access token:', session?.access_token?.substring(0, 20) + '...');
      const currentUserId = session?.user?.id;

      // Determine target ID: param OR current user
      const targetId = params.userId || currentUserId;

      if (!targetId) {
        // No user logged in and no userId param - can't fetch profile
        setLoading(false);
        return;
      }

      // Check ownership
      const ownership = currentUserId && targetId === currentUserId;
      setIsOwner(!!ownership);

      // Only call API if we have a target to fetch
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
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title={isOwner ? "My Profile" : "User Profile"} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Profile Header */}
          <View style={styles.headerProfile}>
            <View style={styles.avatarWrapper}>
              <View
                style={[
                  styles.avatarContainer,
                  { borderColor: colors.surface }
                ]}
              >
                <Image
                  source={{ uri: profile?.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&fit=crop' }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              </View>

              {isOwner && (
                <TouchableOpacity
                  onPress={() => router.push('/edit_profile')}
                  style={[styles.editIconBtn, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="pencil" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.nameText, { color: colors.text }]}>{profile?.full_name || 'User'}</Text>
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>{profile?.skills?.join(', ') || 'Musician'} • {profile?.location || 'Unknown'}</Text>

            <View style={styles.genreRow}>
              {(profile?.genres || ['Rock', 'Indie']).map((genre: string) => (
                <View key={genre} style={[styles.genreTag, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}>
                  <Text style={[styles.genreText, { color: colors.textSecondary }]}>{genre}</Text>
                </View>
              ))}
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>{profile?.rating ? `${Math.round(profile.rating * 20)}%` : 'N/A'}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>{profile?.review_count || 0}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Reviews</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>-</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active</Text>
              </View>
            </View>
          </View>

          {/* Menu Items (Owner Only) */}
          {isOwner ? (
            <View style={styles.menuContainer}>
              {MENU_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => router.push(item.route as any)}
                  style={[styles.menuItem, { backgroundColor: colors.surface }]}
                >
                  <View style={styles.menuLeft}>
                    <View style={[styles.iconBox, { backgroundColor: isDark ? '#1E293B' : '#F9FAFB' }]}>
                      <Ionicons name={item.icon as any} size={20} color={colors.text} />
                    </View>
                    <Text style={[styles.menuLabel, { color: colors.text }]}>
                      {item.label}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* Public View Actions */
            <View style={styles.menuContainer}>
              <TouchableOpacity
                onPress={() => router.push('/report?type=profile&name=Jared%20Lopez%20Bagtas' as any)}
                style={[styles.menuItem, { backgroundColor: colors.surface }]}
              >
                <View style={styles.menuLeft}>
                  <View style={[styles.iconBox, { backgroundColor: isDark ? '#450a0a' : '#fef2f2' }]}>
                    <Ionicons name="flag-outline" size={20} color="#ef4444" />
                  </View>
                  <Text style={[styles.menuLabel, { color: '#ef4444' }]}>
                    Report User
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Media Section */}
          <View style={styles.mediaSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Media & Portfolio</Text>
            {(!profile?.portfolio_urls || profile.portfolio_urls.length === 0) ? (
              <View style={[styles.emptyMedia, { borderColor: colors.border }]}>
                <Ionicons name="images-outline" size={32} color={colors.textSecondary} />
                <Text style={{ marginTop: 8, fontSize: 14, fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>No media yet</Text>
                {isOwner && (
                  <TouchableOpacity
                    onPress={addMediaToPortfolio}
                    disabled={uploading}
                    style={[styles.uploadBtn, { backgroundColor: uploading ? colors.textSecondary : colors.primary }]}
                  >
                    <Text style={styles.uploadBtnText}>
                      {uploading ? 'Uploading...' : 'Add Media'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaScroll}>
                {profile.portfolio_urls.map((url: string, i: number) => (
                  <View key={i} style={[styles.mediaItem, { backgroundColor: colors.surface }]}>
                    <Image
                      source={{ uri: url }}
                      style={[styles.mediaImage, { opacity: 0.9 }]}
                    />
                    <View style={styles.playOverlay}>
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

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 150,
  },
  headerProfile: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  editIconBtn: {
    position: 'absolute',
    bottom: 16,
    right: 0,
    padding: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  nameText: {
    fontSize: 20,
    marginBottom: 4,
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
  },
  roleText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },
  genreRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 24,
  },
  genreTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  genreText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  statsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
  },
  statLabel: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: '100%',
  },
  menuContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  menuItem: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 15,
  },
  mediaSection: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  sectionTitle: {
    marginBottom: 16,
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  emptyMedia: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  uploadBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  uploadBtnText: {
    fontFamily: 'Poppins_500Medium',
    color: '#fff',
    fontSize: 12,
  },
  mediaScroll: {
    marginLeft: -24,
    paddingHorizontal: 24,
    gap: 12,
    marginRight: -24,
  },
  mediaItem: {
    width: 256,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  }
});

