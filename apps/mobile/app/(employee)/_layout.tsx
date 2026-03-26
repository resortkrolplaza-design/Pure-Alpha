// =============================================================================
// Employee App — Bottom Tab Navigator (Warm Beige theme)
// =============================================================================

import { Tabs } from "expo-router";
import { Platform, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { employee, fontSize } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 22 }}>{emoji}</Text>;
}

export default function EmployeeLayout() {
  const lang = useAppStore((s) => s.lang);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: employee.brand,
        tabBarInactiveTintColor: employee.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
      screenListeners={{ tabPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
    >
      <Tabs.Screen name="dashboard" options={{ title: t(lang, "emp.tab.home"), tabBarIcon: () => <TabIcon emoji="🏠" /> }} />
      <Tabs.Screen name="schedule" options={{ title: t(lang, "emp.tab.schedule"), tabBarIcon: () => <TabIcon emoji="📅" /> }} />
      <Tabs.Screen name="chat" options={{ title: t(lang, "emp.tab.chat"), tabBarIcon: () => <TabIcon emoji="💬" /> }} />
      <Tabs.Screen name="profile" options={{ title: t(lang, "emp.tab.profile"), tabBarIcon: () => <TabIcon emoji="👤" /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderTopColor: employee.cardBorder,
    borderTopWidth: 0.5,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
    paddingTop: 8,
  },
  tabLabel: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium" },
});
