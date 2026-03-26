// =============================================================================
// Group Portal — Bottom Tab Navigator
// =============================================================================

import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { group, fontSize } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22 }}>{emoji}</Text>;
}

export default function GroupLayout() {
  const lang = useAppStore((s) => s.lang);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: group.primary,
        tabBarInactiveTintColor: group.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
      screenListeners={{ tabPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
    >
      <Tabs.Screen name="overview" options={{ title: t(lang, "group.tab.overview"), tabBarIcon: () => <TabIcon emoji="📋" /> }} />
      <Tabs.Screen name="guests" options={{ title: t(lang, "group.tab.guests"), tabBarIcon: () => <TabIcon emoji="👥" /> }} />
      <Tabs.Screen name="messages" options={{ title: t(lang, "group.tab.messages"), tabBarIcon: () => <TabIcon emoji="💬" /> }} />
      <Tabs.Screen name="documents" options={{ title: t(lang, "group.tab.documents"), tabBarIcon: () => <TabIcon emoji="📄" /> }} />
      <Tabs.Screen name="photos" options={{ title: t(lang, "group.tab.photos"), tabBarIcon: () => <TabIcon emoji="📸" /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopColor: group.cardBorder,
    borderTopWidth: 0.5,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
    paddingTop: 8,
  },
  tabLabel: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium" },
});
