import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import GuestSignInGate from '../src/components/GuestSignInGate';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { formatDashedNumericDate } from '../src/utils/friendlyDateTime';

export default function AccountDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { isGuest } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccountDetails();
  }, []);

  const fetchAccountDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserEmail(user.email || null);

      const { data, error } = await supabase.functions.invoke('manage-profile', {
        body: { action: 'fetch', userId: user.id }
      });

      if (error) throw error;
      setProfile(data);
    } catch (e) {
      console.log('Error fetching account details:', e);
    } finally {
      setLoading(false);
    }
  };

  const getIdentitySubtitle = () => {
    if (!profile) return 'Status unavailable';

    const expiryRaw = profile?.id_document_expiry;
    const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
    const hasValidExpiry = !!expiryDate && !Number.isNaN(expiryDate.getTime());
    const isExpired = !!expiryDate && hasValidExpiry && expiryDate <= new Date();

    if (isExpired && expiryDate) {
      return `Expired on ${formatDashedNumericDate(expiryDate)}`;
    }

    if (profile?.is_verified) {
      if (hasValidExpiry && expiryDate) {
        return `Verified • Expires ${formatDashedNumericDate(expiryDate)}`;
      }
      return 'Verified';
    }

    const status = typeof profile?.verification_status === 'string'
      ? profile.verification_status.replace(/_/g, ' ')
      : '';
    return status ? `Status: ${status}` : 'Not verified';
  };

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
        {title}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderWidth: isDark ? 1 : 0, borderColor: colors.border }
        ]}
      >
        {children}
      </View>
    </View>
  );

  const renderItem = (label: string, value: string | null, onPress?: () => void, isLast: boolean = false, icon?: any, showArrow: boolean = true) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={1}
      style={[
        styles.itemRow,
        !isLast && { borderBottomWidth: 1 },
        { borderColor: isDark ? colors.border : '#F3F4F6' }
      ]}
    >
      <View style={styles.itemContent}>
        {icon && <View style={styles.itemIcon}>{icon}</View>}
        <View>
          <Text style={[styles.itemLabel, { color: colors.text }]}>{label}</Text>
          {value && <Text style={[styles.itemValue, { color: colors.textSecondary }]}>{value}</Text>}
        </View>
      </View>
      {onPress && showArrow && <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
    </TouchableOpacity>
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Account Details" />
        <GuestSignInGate message="Sign in to view and manage your account details." />
        <View style={styles.navbarContainer}>
          <Navbar />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Loading account details...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Account Details" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          <View style={styles.profileHeader}>
            <View style={[styles.avatarContainer, { borderColor: colors.card }]}>
              <Image
                source={{ uri: profile?.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&fit=crop' }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </View>
            <Text style={[styles.nameText, { color: colors.text }]}>{profile?.full_name || 'User'}</Text>
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>{profile?.role || 'Member'} Account</Text>
          </View>

          {renderSection('Personal Information', (
            <>
              {renderItem('Full Name', profile?.full_name || 'Not set', undefined, false, <Ionicons name="person-outline" size={16} color={colors.text} />)}
              {renderItem('Email', userEmail || 'No email', undefined, true, <Ionicons name="mail-outline" size={16} color={colors.text} />)}
            </>
          ))}

          {renderSection('Security', (
            <>
              {renderItem('Change Email', 'Update your email address', () => router.push('/change_email'), false, <Ionicons name="at-outline" size={16} color={colors.text} />)}
              {renderItem('Change Password', 'Update your password', () => router.push('/change_password'), false, <Ionicons name="lock-closed-outline" size={16} color={colors.text} />)}
              {renderItem('Identity Verification', getIdentitySubtitle(), () => router.push('/identity_verification'), true, <Ionicons name="card-outline" size={16} color={colors.text} />)}
            </>
          ))}

          {renderSection('Actions', (
            <>
              <TouchableOpacity activeOpacity={1}
                style={styles.actionRow}
                onPress={() => setModalVisible(true)}
              >
                <View style={styles.itemContent}>
                  <View style={[styles.deleteIconContainer, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2' }]}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </View>
                  <Text style={[styles.itemLabel, { color: '#EF4444' }]}>Close Account</Text>
                </View>
              </TouchableOpacity>
            </>
          ))}

          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Member since {profile?.created_at ? formatDashedNumericDate(profile.created_at) : 'Unknown'}
          </Text>

        </ScrollView>

        <View style={styles.navbarContainer}>
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Close Account"
        message="Are you sure you want to close your account? This action cannot be undone and you will lose all your data."
        buttonText="Close Account"
        danger
        onConfirm={() => {
          setModalVisible(false);
          // Add close account logic
          router.replace('/');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingBottom: 100,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14, // text-sm
    fontWeight: '600', // font-semibold
    textTransform: 'uppercase',
    letterSpacing: 1, // tracking-wider
    marginBottom: 12, // mb-3
    marginLeft: 4, // ml-1
    fontFamily: 'Poppins_600SemiBold',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    // shadow-sm logic usually needs shadow props manually
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    marginRight: 12,
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6', // bg-gray-100 (default, light mode logic handled in previous but I'll simplify here or assume overrides)
    // Note: The previous code had conditional bg for icon. I'll need to check if I can inline specific styles or if I should make this generic.
    // I will keep it generic here and let inline styles override if needed, but wait, `renderItem` passed the `icon` component.
    // Wait, the `icon` argument was a React Node. So I wrapped it in `itemIcon` view.
    // The original code: <View className="mr-3 w-8 h-8 ... bg-gray-100 dark:bg-gray-800">{icon}</View>
    // My `itemIcon` style should just handle layout.
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Poppins_500Medium',
  },
  itemValue: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Poppins_400Regular',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: '#E5E7EB', // bg-gray-200
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 4,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  nameText: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  roleText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  deleteIconContainer: {
    marginRight: 12,
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 16,
    marginBottom: 32,
    fontFamily: 'Poppins_400Regular',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

