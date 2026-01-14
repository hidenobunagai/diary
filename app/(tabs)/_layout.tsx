import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        lazy: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Record",
          // NOTE: expo-router Tabs options typings may not include `unmountOnBlur`.
          // If you need cleanup-on-leave, prefer doing it in screen-level focus effects.
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          // NOTE: expo-router Tabs options typings may not include `unmountOnBlur`.
          // If you need cleanup-on-leave, prefer doing it in screen-level focus effects.
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="paperplane.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          // NOTE: expo-router Tabs options typings may not include `unmountOnBlur`.
          // If you need cleanup-on-leave, prefer doing it in screen-level focus effects.
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="gearshape.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
