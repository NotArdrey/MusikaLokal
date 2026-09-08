import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import LoadingState from '../../src/components/LoadingState';
import { GlobalNavbar } from '../../src/components/navbar';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

const HIDDEN_TAB_OPTIONS = {
  href: null,
} as const;

export default function TabsLayout() {
  const { session, loading, isGuest } = useAuth();
  const { colors } = useTheme();

  // Wait for persisted auth before mounting the feed on launch or reload.
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoadingState
          message="Getting Musika Lokal ready..."
          detail="Restoring your session and preferences."
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  if (!session && !isGuest) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        lazy: true,
        freezeOnBlur: true,
      }}
      tabBar={(props) => <GlobalNavbar {...props} />}
    >
      <Tabs.Screen name="feed" options={{ title: 'Home' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Activity' }} />
      <Tabs.Screen name="marketplace" options={{ title: 'Shop' }} />
      <Tabs.Screen name="manage" options={{ title: 'Manage' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

      <Tabs.Screen name="home" options={HIDDEN_TAB_OPTIONS} />
      <Tabs.Screen name="chat" options={HIDDEN_TAB_OPTIONS} />
      <Tabs.Screen name="notifications" options={HIDDEN_TAB_OPTIONS} />
      <Tabs.Screen name="my_group" options={HIDDEN_TAB_OPTIONS} />
      <Tabs.Screen name="my_production" options={HIDDEN_TAB_OPTIONS} />
      <Tabs.Screen name="my_studio" options={HIDDEN_TAB_OPTIONS} />
      <Tabs.Screen name="my_venue" options={HIDDEN_TAB_OPTIONS} />
    </Tabs>
  );
}
