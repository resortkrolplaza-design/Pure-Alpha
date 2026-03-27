// =============================================================================
// Group Portal — Bottom Tab Navigator
// =============================================================================

import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { group, fontSize } from "@/lib/tokens";
import { TabIcon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

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
      <Tabs.Screen name="overview" options={{ title: t(lang, "group.tab.overview"), tabBarIcon: ({ focused }) => <TabIcon active={focused} activeName="clipboard" inactiveName="clipboard-outline" activeColor={group.primary} inactiveColor={group.textMuted} /> }} />
      <Tabs.Screen name="guests" options={{ title: t(lang, "group.tab.guests"), tabBarIcon: ({ focused }) => <TabIcon active={focused} activeName="people" inactiveName="people-outline" activeColor={group.primary} inactiveColor={group.textMuted} /> }} />
      <Tabs.Screen name="messages" options={{ title: t(lang, "group.tab.messages"), tabBarIcon: ({ focused }) => <TabIcon active={focused} activeName="chatbubbles" inactiveName="chatbubbles-outline" activeColor={group.primary} inactiveColor={group.textMuted} /> }} />
      <Tabs.Screen name="documents" options={{ title: t(lang, "group.tab.documents"), tabBarIcon: ({ focused }) => <TabIcon active={focused} activeName="document-text" inactiveName="document-text-outline" activeColor={group.primary} inactiveColor={group.textMuted} /> }} />
      <Tabs.Screen name="photos" options={{ title: t(lang, "group.tab.photos"), tabBarIcon: ({ focused }) => <TabIcon active={focused} activeName="camera" inactiveName="camera-outline" activeColor={group.primary} inactiveColor={group.textMuted} /> }} />
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
