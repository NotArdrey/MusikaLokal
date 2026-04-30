import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

const RECENTLY_VIEWED_STORAGE_KEY = 'recently_viewed_items';
const PENDING_REOPEN_LISTING_STORAGE_KEY = 'pending_reopen_listing_id';
const MAX_SETTINGS_HISTORY_ITEMS = 6;

export default function SettingsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme, setTheme, colors, isDark } = useTheme();
  const { isGuest, setGuestMode } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width >= 768;
  const pageBackground = isWebDesktop
    ? isDark
      ? '#0A1224'
      : '#E9EEF8'
    : colors.background;
  const pageCardBackground = isWebDesktop
    ? isDark
      ? '#0F172A'
      : '#FFFFFF'
    : colors.card;
  const surfaceBackground = isWebDesktop
    ? isDark
      ? '#13213A'
      : '#F4F7FE'
    : isDark
      ? colors.inputBackground
      : '#F3F4F6';
  const borderSoft = isWebDesktop
    ? isDark
      ? '#1E2C48'
      : '#D8E3F2'
    : colors.border;
  const [userRole, setUserRole] = useState<string | null>(null);
  const [recentPreviewHistory, setRecentPreviewHistory] = useState<any[]>([]);

  // Fetch user role on mount
  useFocusEffect(
    useCallback(() => {
      const fetchUserRole = async () => {
        if (isGuest) {
          setUserRole(null);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .single();
            if (profile) {
              setUserRole(profile.role);
            }
          }
        }
      };

      const fetchRecentPreviewHistory = async () => {
        try {
          const storedHistory = await AsyncStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
          if (!storedHistory) {
            setRecentPreviewHistory([]);
            return;
          }

          const parsedHistory = JSON.parse(storedHistory);
          if (!Array.isArray(parsedHistory)) {
            setRecentPreviewHistory([]);
            return;
          }

          setRecentPreviewHistory(parsedHistory.slice(0, MAX_SETTINGS_HISTORY_ITEMS));
        } catch {
          setRecentPreviewHistory([]);
        }
      };

      fetchUserRole();
      fetchRecentPreviewHistory();
    }, [isGuest])
  );

  const getHistoryIcon = (itemType?: string) => {
    const normalized = String(itemType || '').toLowerCase();
    if (normalized === 'studio' || normalized === 'venue') return 'business-outline';
    if (normalized === 'gig') return 'mic-outline';
    if (normalized === 'artist') return 'person-outline';
    if (normalized === 'group') return 'people-outline';
    return 'albums-outline';
  };

  const openRecentPreviewItem = async (item: any) => {
    if (!item?.id) return;

    try {
      await AsyncStorage.setItem(PENDING_REOPEN_LISTING_STORAGE_KEY, String(item.id));
    } catch {
      // Continue even if cache write fails.
    }

    router.push('/home');
  };

  const clearRecentPreviewHistory = async () => {
    try {
      await AsyncStorage.removeItem(RECENTLY_VIEWED_STORAGE_KEY);
      setRecentPreviewHistory([]);
    } catch {
      // No-op if clear fails.
    }
  };

  const handleLogout = async () => {
    setModalVisible(false);
    await supabase.auth.signOut();
    router.replace('/');
  };

  // Check if user is studio/venue owner (shows wallet)
  const isOwner = userRole === 'studio-owner' || userRole === 'venue-owner';

  const settingsSections: Array<{
    title: string;
    items: Array<{ label: string; icon: string; route: string }>;
  }> = [];

  if (!isGuest) {
    settingsSections.push({
      title: 'Preferences',
      items: [
        { label: 'Account Security', icon: 'shield-outline', route: '/account_details' },
        { label: 'Identity Verification', icon: 'card-outline', route: '/identity_verification' },
        ...(isOwner
          ? [{ label: 'Wallet', icon: 'wallet-outline', route: '/wallet' }]
          : [{ label: 'Wallet', icon: 'wallet-outline', route: '/wallet' }]),
      ],
    });
  }

  settingsSections.push({
    title: 'Support & Legal',
    items: [
      { label: 'Help & Support', icon: 'help-circle-outline', route: '/help_support' },
      { label: 'Terms and Conditions', icon: 'document-text-outline', route: '/terms_and_conditions' },
      { label: 'Privacy Policy', icon: 'shield-checkmark-outline', route: '/privacy_policy' },
    ],
  });

  return (
    <>
      <View style={[styles.container, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        {/* Custom Header with Back Button */}
        <View
          style={[
            styles.header,
            isWebDesktop && styles.headerWeb,
            {
              backgroundColor: isWebDesktop ? pageCardBackground : colors.background,
              borderColor: borderSoft,
            },
          ]}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            isWebDesktop && styles.scrollContentWeb,
            { paddingBottom: 190 + insets.bottom },
          ]}
        >

          {/* Section: Appearance */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Appearance</Text>
            <View
              style={[
                styles.card,
                isWebDesktop && styles.webSectionCard,
                { backgroundColor: pageCardBackground, borderColor: borderSoft },
              ]}
            >
              <Text style={[styles.cardLabel, { color: colors.text }]}>Theme Preference</Text>

              <View style={styles.themeOptionsContainer}>
                {[
                  { id: 'light', icon: 'sunny', label: 'Light' },
                  { id: 'dark', icon: 'moon', label: 'Dark' },
                  { id: 'system', icon: 'phone-portrait-outline', label: 'System' }
                ].map((item) => {
                  const isActive = theme === item.id;
                  return (
                    <TouchableOpacity activeOpacity={1}
                      key={item.id}
                      onPress={() => setTheme(item.id as any)}
                      style={[
                        styles.themeButton,
                        {
                          backgroundColor: isActive ? (isDark ? colors.primaryLight : '#E7EEFD') : 'transparent',
                          borderColor: isActive ? colors.primary : borderSoft
                        }
                      ]}
                    >
                      <Ionicons name={item.icon as any} size={20} color={isActive ? colors.primary : colors.textSecondary} />
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[styles.themeButtonText, { color: isActive ? colors.primary : colors.textSecondary }]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </View>

          <View style={styles.sectionContainer}>
            <View style={styles.historyHeaderRow}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary, marginBottom: 0 }]}>History Preview</Text>
              {recentPreviewHistory.length > 0 && (
                <TouchableOpacity activeOpacity={1} onPress={clearRecentPreviewHistory}>
                  <Text style={[styles.clearHistoryText, { color: colors.primary }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <View
              style={[
                styles.cardOverflow,
                isWebDesktop && styles.webSectionCard,
                { backgroundColor: pageCardBackground, borderColor: borderSoft },
              ]}
            >
              {recentPreviewHistory.length === 0 ? (
                <View style={[styles.historyEmptyState, { borderColor: borderSoft }]}> 
                  <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.historyEmptyText, { color: colors.textSecondary }]}>No previews yet. Open cards from Home to see them here.</Text>
                </View>
              ) : (
                recentPreviewHistory.map((item, index) => (
                  <TouchableOpacity
                    activeOpacity={1}
                    key={`${item?.id || index}-${index}`}
                    onPress={() => openRecentPreviewItem(item)}
                    style={[
                      styles.menuItem,
                      {
                        borderBottomWidth: index === recentPreviewHistory.length - 1 ? 0 : 1,
                        borderBottomColor: borderSoft,
                      },
                    ]}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: surfaceBackground }]}>
                      <Ionicons name={getHistoryIcon(item?.type) as any} size={18} color={colors.text} />
                    </View>
                    <View style={styles.historyTextBlock}>
                      <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.menuText, { color: colors.text, marginRight: 0 }]}>
                        {item?.name || 'Untitled Listing'}
                      </Text>
                      <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.historyMetaText, { color: colors.textSecondary }]}>
                        {(item?.type || 'Listing')} • {item?.location || 'Location not set'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>

          {settingsSections.map((section) => (
            <View key={section.title} style={styles.sectionContainer}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{section.title}</Text>
              <View
                style={[
                  styles.cardOverflow,
                  isWebDesktop && styles.webSectionCard,
                  { backgroundColor: pageCardBackground, borderColor: borderSoft },
                ]}
              >
                {section.items.map((item, i) => (
                  <TouchableOpacity activeOpacity={1}
                    key={item.label}
                    onPress={() => router.push(item.route as any)}
                    style={[
                      styles.menuItem,
                      {
                        borderBottomWidth: i === section.items.length - 1 ? 0 : 1,
                        borderBottomColor: borderSoft
                      }
                    ]}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: surfaceBackground }]}>
                      <Ionicons name={item.icon as any} size={18} color={colors.text} />
                    </View>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[styles.menuText, { color: colors.text }]}
                    >
                      {item.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.footerContainer}>
            <TouchableOpacity activeOpacity={1}
              onPress={async () => {
                if (isGuest) {
                  await setGuestMode(false);
                  router.replace('/');
                  return;
                }
                setModalVisible(true);
              }}
              style={[
                styles.logoutButton,
                { backgroundColor: isGuest ? colors.primary : '#FEE2E2' },
              ]}
            >
              <Ionicons
                name={isGuest ? 'log-in-outline' : 'log-out-outline'}
                size={20}
                color={isGuest ? '#FFFFFF' : '#DC2626'}
              />
              <Text style={[styles.logoutText, { color: isGuest ? '#FFFFFF' : '#DC2626' }]}>
                {isGuest ? 'Sign In' : 'Log Out'}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.versionText, { color: colors.textSecondary }]}>Version 1.0.0 (Build 52)</Text>
          </View>

        </ScrollView>

        <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Log Out"
        message="Are you sure you want to log out of your account?"
        buttonText="Log Out"
        onConfirm={handleLogout}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageFrame: {
    flex: 1,
    width: '100%',
  },
  pageFrameWeb: {
    maxWidth: 1240,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingTop: 48, // pt-12
  },
  headerWeb: {
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 24,
    marginTop: 6,
    paddingTop: 18,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20, // text-xl
    fontFamily: 'Poppins_600SemiBold',
  },
  scrollContent: {
    paddingBottom: 150,
  },
  scrollContentWeb: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'center',
    paddingTop: 12,
  },
  webSectionCard: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  sectionContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 12,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1, // tracking-wider
    paddingLeft: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearHistoryText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  historyEmptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  historyEmptyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 18,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardLabel: {
    marginBottom: 16,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  themeOptionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  themeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  themeButtonText: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    textAlign: 'center',
  },
  cardOverflow: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    marginRight: 8,
  },
  historyTextBlock: {
    flex: 1,
    marginRight: 8,
  },
  historyMetaText: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  footerContainer: {
    paddingHorizontal: 24,
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  logoutText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#DC2626', // red-600
    fontFamily: 'Poppins_600SemiBold',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
});

