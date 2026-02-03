import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function SettingsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme, setTheme, colors, isDark } = useTheme();
  const [userRole, setUserRole] = useState<string | null>(null);

  // Fetch user role on mount
  useFocusEffect(
    useCallback(() => {
      const fetchUserRole = async () => {
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
      };
      fetchUserRole();
    }, [])
  );

  const handleLogout = async () => {
    setModalVisible(false);
    await supabase.auth.signOut();
    router.replace('/');
  };

  // Check if user is studio/venue owner (shows wallet & subscription)
  const isOwner = userRole === 'studio-owner' || userRole === 'venue-owner';

  const SETTINGS_SECTIONS = [
    {
      title: 'Preferences',
      items: [
        { label: 'Account Security', icon: 'shield-outline', route: '/account_details' },
        ...(isOwner ? [{ label: 'Wallet & Subscription', icon: 'wallet-outline', route: '/wallet' }] : [{ label: 'Wallet', icon: 'wallet-outline', route: '/wallet' }]),
      ]
    },
    {
      title: 'Support & Legal',
      items: [
        { label: 'Help & Support', icon: 'help-circle-outline', route: '/help_support' },
        { label: 'Terms and Conditions', icon: 'document-text-outline', route: '/terms_and_conditions' },
        { label: 'Privacy Policy', icon: 'shield-checkmark-outline', route: '/privacy_policy' },
      ]
    }
  ];

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Custom Header with Back Button */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Section: Appearance */}
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Appearance</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.text }]}>Theme Preference</Text>

              <View style={styles.themeOptionsContainer}>
                {[
                  { id: 'light', icon: 'sunny', label: 'Light' },
                  { id: 'dark', icon: 'moon', label: 'Dark' },
                  { id: 'system', icon: 'phone-portrait-outline', label: 'System' }
                ].map((item) => {
                  const isActive = theme === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setTheme(item.id as any)}
                      style={[
                        styles.themeButton,
                        {
                          backgroundColor: isActive ? (isDark ? colors.primaryLight : '#EEF2FF') : 'transparent',
                          borderColor: isActive ? colors.primary : colors.border
                        }
                      ]}
                    >
                      <Ionicons name={item.icon as any} size={20} color={isActive ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.themeButtonText, { color: isActive ? colors.primary : colors.textSecondary }]}>{item.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </View>

          {SETTINGS_SECTIONS.map((section, index) => (
            <View key={section.title} style={styles.sectionContainer}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{section.title}</Text>
              <View style={[styles.cardOverflow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {section.items.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    onPress={() => router.push(item.route as any)}
                    style={[
                      styles.menuItem,
                      {
                        borderBottomWidth: i === section.items.length - 1 ? 0 : 1,
                        borderBottomColor: colors.border
                      }
                    ]}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }]}>
                      <Ionicons name={item.icon as any} size={18} color={colors.text} />
                    </View>
                    <Text style={[styles.menuText, { color: colors.text }]}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.footerContainer}>
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              style={[styles.logoutButton, { backgroundColor: '#FEE2E2' }]}
            >
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>

            <Text style={[styles.versionText, { color: colors.textSecondary }]}>Version 1.0.0 (Build 52)</Text>
          </View>

        </ScrollView>

        <Navbar />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingTop: 48, // pt-12
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
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
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

