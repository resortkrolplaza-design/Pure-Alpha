// =============================================================================
// Guest Portal -- Bottom Tab Navigator (Norwegian Prima theme)
// =============================================================================

import { useRef } from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { NAVY, GOLD, guest, fontSize } from "@/lib/tokens";
import { TabIcon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function GuestLayout() {
  const lang = useAppStore((s) => s.lang);
  // P3-5: Track which tab was last focused to avoid haptics on already-active tab
  const lastFocusedRef = useRef<string | null>(null);

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
        // P3-5: Only fire haptics if tapping a different tab
        tabPress: (e) => {
          const targetRoute = e.target?.split("-")[0] ?? "";
          if (lastFocusedRef.current === targetRoute) return;
          lastFocusedRef.current = targetRoute;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="stay"
        options={{
          title: t(lang, "tab.stay"),
          tabBarIcon: ({ focused }) => (
            <TabIcon active={focused} activeName="bed" inactiveName="bed-outline" activeColor={GOLD} inactiveColor={guest.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: t(lang, "tab.points"),
          tabBarIcon: ({ focused }) => (
            <TabIcon active={focused} activeName="star" inactiveName="star-outline" activeColor={GOLD} inactiveColor={guest.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: t(lang, "tab.rewards"),
          tabBarIcon: ({ focused }) => (
            <TabIcon active={focused} activeName="gift" inactiveName="gift-outline" activeColor={GOLD} inactiveColor={guest.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="hotel"
        options={{
          title: t(lang, "tab.hotel"),
          tabBarIcon: ({ focused }) => (
            <TabIcon active={focused} activeName="business" inactiveName="business-outline" activeColor={GOLD} inactiveColor={guest.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t(lang, "tab.messages"),
          tabBarIcon: ({ focused }) => (
            <TabIcon active={focused} activeName="chatbubble" inactiveName="chatbubble-outline" activeColor={GOLD} inactiveColor={guest.textMuted} />
          ),
        }}
      />
    </Tabs>
  );
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
