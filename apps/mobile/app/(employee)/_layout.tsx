// =============================================================================
// Employee App -- Bottom Tab Navigator (Warm Beige theme)
// =============================================================================

import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { employee, fontSize } from "@/lib/tokens";
import { TabIcon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

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
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t(lang, "emp.tab.home"),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              active={focused}
              activeName="home"
              inactiveName="home-outline"
              activeColor={employee.brand}
              inactiveColor={employee.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t(lang, "emp.tab.schedule"),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              active={focused}
              activeName="calendar"
              inactiveName="calendar-outline"
              activeColor={employee.brand}
              inactiveColor={employee.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t(lang, "emp.tab.chat"),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              active={focused}
              activeName="chatbubble-ellipses"
              inactiveName="chatbubble-ellipses-outline"
              activeColor={employee.brand}
              inactiveColor={employee.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t(lang, "emp.tab.profile"),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              active={focused}
              activeName="person"
              inactiveName="person-outline"
              activeColor={employee.brand}
              inactiveColor={employee.textMuted}
            />
          ),
        }}
      />
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
