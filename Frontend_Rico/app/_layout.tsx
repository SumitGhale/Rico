import 'react-native-gesture-handler';
import '@/lib/applyGlobalFont';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setAudioModeAsync } from 'expo-audio';
import { useEffect } from 'react';
import '@/global.css';

import { useColorScheme } from '@/components/useColorScheme';
import { CalendarEventsProvider } from '@/hooks/useCalendarEvents';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { WhisperModelProvider } from '@/hooks/useWhisperModel';
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
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Keep the iOS audio session in .playAndRecord for the whole app lifetime so
  // streamed TTS playback never flips it back to .playback and tears down the
  // mic input route mid-conversation. expo-audio adds .defaultToSpeaker when
  // allowsRecording is true, so TTS still plays through the speaker.
  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch((modeError) => {
      console.warn('Failed to configure audio mode:', modeError);
    });
  }, []);

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
      <WhisperModelProvider>
        <RootLayoutNav />
      </WhisperModelProvider>
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
              <Stack.Screen name="(tabs)"  options={{ headerShown: false, title: 'Home' }} />
              <Stack.Screen name="calendar" />
              <Stack.Screen
                name="modal"
                options={{ presentation: 'modal', title: 'Speech Models' }}
              />
            </Stack.Protected>
          </Stack>
        </CalendarEventsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
