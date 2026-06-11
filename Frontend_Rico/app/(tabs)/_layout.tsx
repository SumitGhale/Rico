import React from 'react';
import { Link, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarStyle: { display: 'none' },
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Link href="/calendar" asChild>
                <Pressable style={{ marginRight: 15 }}>
                  {({ pressed }) => (
                    <Ionicons
                      name="calendar"
                      size={25}
                      color={Colors[colorScheme].text}
                      style={{ opacity: pressed ? 0.5 : 1 }}
                    />
                  )}
                </Pressable>
              </Link>
              <Link href="/modal" asChild>
                <Pressable style={{ marginRight: 15 }}>
                  {({ pressed }) => (
                    <Ionicons
                      name="settings-outline"
                      size={25}
                      color={Colors[colorScheme].text}
                      style={{ opacity: pressed ? 0.5 : 1 }}
                    />
                  )}
                </Pressable>
              </Link>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
