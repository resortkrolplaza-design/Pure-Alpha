// =============================================================================
// Employee App -- Bottom Tab Navigator (warm cream + frosted bar + spring icons)
// 5 tabs: Pulpit, Grafik, Urlopy, Chat, Profil
// Matches Group Portal _layout.tsx with AnimatedTabIcon + haptics
// =============================================================================

import { useRef, useEffect } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { Tabs, router } from "expo-router";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { emp, fontSize, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// -- AnimatedTabIcon (spring scale 1.0 / 1.1) --------------------------------

function AnimatedTabIcon({
  active,
  activeName,
  inactiveName,
}: {
  active: boolean;
  activeName: IoniconName;
  inactiveName: IoniconName;
}) {
  const scale = useRef(new Animated.Value(active ? 1.1 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? 1.1 : 1,
      damping: 12,
      stiffness: 200,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [active, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons
        name={active ? activeName : inactiveName}
        size={24}
        color={active ? emp.primary : emp.textMuted}
      />
    </Animated.View>
  );
}

// -- TabLabel (font weight change on focus) -----------------------------------

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={[
        styles.tabLabel,
        {
          color: focused ? emp.primary : emp.textMuted,
          fontFamily: focused ? "Inter_600SemiBold" : "Inter_400Regular",
        },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
}

// -- Layout -------------------------------------------------------------------

export default function EmployeeLayout() {
  const lang = useAppStore((s) => s.lang);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  // Auth guard -- redirect unauthenticated users to entry screen
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: emp.primary,
        tabBarInactiveTintColor: emp.textMuted,
        tabBarShowLabel: false,
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t(lang, "tab.dashboard"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="home"
              inactiveName="home-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.dashboard")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.dashboard"),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t(lang, "tab.schedule"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="calendar"
              inactiveName="calendar-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.schedule")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.schedule"),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: t(lang, "tab.leave"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="airplane"
              inactiveName="airplane-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.leave")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.leave"),
        }}
      />
      {/* Chat tab hidden until feature is ready -- set href: null to exclude from nav */}
      <Tabs.Screen
        name="chat"
        options={{
          href: null,
          title: t(lang, "tab.chat"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t(lang, "tab.profile"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="person"
              inactiveName="person-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.profile")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.profile"),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: emp.tabBarBg,
    borderTopColor: emp.cardBorder,
    borderTopWidth: 0.5,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: emp.shadowDark,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  tabLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
});
