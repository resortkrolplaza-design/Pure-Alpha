// =============================================================================
// Guest Portal — Bottom Tab Navigator (Norwegian Prima theme)
// =============================================================================

import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { NAVY, GOLD, guest, fontSize } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

// Simple text-based icons (no external icon library needed)
const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  stay: { active: "🏨", inactive: "🏨" },
  points: { active: "⭐", inactive: "⭐" },
  rewards: { active: "🎁", inactive: "🎁" },
  hotel: { active: "🏛️", inactive: "🏛️" },
  messages: { active: "💬", inactive: "💬" },
};

export default function GuestLayout() {
  const lang = useAppStore((s) => s.lang);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: guest.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null,
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="stay"
        options={{
          title: t(lang, "tab.stay"),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji={TAB_ICONS.stay[focused ? "active" : "inactive"]} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: t(lang, "tab.points"),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji={TAB_ICONS.points[focused ? "active" : "inactive"]} />
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: t(lang, "tab.rewards"),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji={TAB_ICONS.rewards[focused ? "active" : "inactive"]} />
          ),
        }}
      />
      <Tabs.Screen
        name="hotel"
        options={{
          title: t(lang, "tab.hotel"),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji={TAB_ICONS.hotel[focused ? "active" : "inactive"]} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t(lang, "tab.messages"),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji={TAB_ICONS.messages[focused ? "active" : "inactive"]} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22 }}>{emoji}</Text>;
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    backgroundColor: Platform.OS === "ios" ? "transparent" : "rgba(13,34,54,0.95)",
    borderTopColor: guest.glassBorder,
    borderTopWidth: 0.5,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
  },
});
