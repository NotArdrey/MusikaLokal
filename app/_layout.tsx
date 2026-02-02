import { Poppins_300Light, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, useFonts } from '@expo-google-fonts/poppins';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as Linking from 'expo-linking';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <BottomSheetModalProvider>
            <RootContent />
          </BottomSheetModalProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootContent() {
  const { colors } = useTheme();
  const { session, loading, userId } = useAuth();
  const segments = useSegments();
  const pathname = segments.join('/');
  const processedDeepLinksRef = useRef<Set<string>>(new Set());

  // Handle deep links for payment redirects
  useEffect(() => {
    // Handle initial deep link (app opened via link)
    const handleInitialDeepLink = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    handleInitialDeepLink();

    // Handle deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    console.log('📱 Deep link received:', url);
    
    try {
      const { hostname, path, queryParams } = Linking.parse(url);
      console.log('📱 Parsed deep link:', { hostname, path, queryParams });

      // Create a unique key for this deep link to prevent double processing
      const linkKey = `${path}-${queryParams?.booking_id}-${queryParams?.status}`;
      if (processedDeepLinksRef.current.has(linkKey)) {
        console.log('📱 Deep link already processed, skipping');
        return;
      }
      processedDeepLinksRef.current.add(linkKey);

      // Clear old processed links after a timeout
      setTimeout(() => {
        processedDeepLinksRef.current.delete(linkKey);
      }, 5000);

      // Handle payment result deep links
      if (hostname === 'payment-result' || path === 'payment-result') {
        const status = queryParams?.status as string;
        const bookingId = queryParams?.booking_id as string;

        console.log('💳 Payment result deep link:', { status, bookingId });

        // Navigate to payment result screen
        router.replace({
          pathname: '/payment-result',
          params: { status, booking_id: bookingId }
        });
      }
    } catch (e) {
      console.error('Error parsing deep link:', e);
    }
  };

  // Profile check is now handled via components and action-gates (e.g. Booking) rather than a hard app-lock.
  // This allows users to browse even if profile is incomplete.

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background }, // Also ensure stack content has background
          animation: 'fade', // Smooth fade transition for tab switching
        }}
      />
    </View>
  );
}
