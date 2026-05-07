import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import '@/global.css';

import { useColorScheme } from '@/components/useColorScheme';
import { CalendarEventsProvider } from '@/hooks/useCalendarEvents';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ActivityIndicator, View } from 'react-native';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, isLoading } = useAuth();

  // Show a loading indicator while checking auth state
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#030712' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <CalendarEventsProvider>
          <Stack>
            {/* Sign-in: only accessible when NOT authenticated */}
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            </Stack.Protected>

            {/* Main app: only accessible when authenticated */}
            <Stack.Protected guard={isAuthenticated}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="calendar" />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            </Stack.Protected>
          </Stack>
        </CalendarEventsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
