import { Tabs } from 'expo-router';
import { GlobalNavbar } from '../../src/components/navbar';

const HIDDEN_TAB_OPTIONS = {
  href: null,
} as const;

export default function TabsLayout() {
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
