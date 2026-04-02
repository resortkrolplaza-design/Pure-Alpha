// =============================================================================
// Loyal App -- Bottom Tab Navigator (Navy bar + Gold accents + spring icons)
// 5 tabs: Pobyt, Lojalnosc, Nagrody, Hotel, Wiadomosci
// =============================================================================

import { useRef, useEffect } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { Tabs, router } from "expo-router";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { loyal, fontSize, spacing } from "@/lib/tokens";
import { useReducedMotion } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { usePushNotifications } from "@/lib/usePushNotifications";

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
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(active ? 1.1 : 1)).current;

  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(active ? 1.1 : 1);
      return;
    }
    Animated.spring(scale, {
      toValue: active ? 1.1 : 1,
      damping: 12,
      stiffness: 200,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [active, scale, reducedMotion]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons
        name={active ? activeName : inactiveName}
        size={24}
        color={active ? loyal.primary : loyal.tabInactive}
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
          color: focused ? loyal.primary : loyal.tabInactive,
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

export default function LoyalLayout() {
  const lang = useAppStore((s) => s.lang);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  // Register push token after authentication (best-effort, silent fail)
  usePushNotifications();

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
        tabBarActiveTintColor: loyal.primary,
        tabBarInactiveTintColor: loyal.tabInactive,
        tabBarShowLabel: false,
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
            <AnimatedTabIcon
              active={focused}
              activeName="home"
              inactiveName="home-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.stay")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.stay"),
        }}
      />
      <Tabs.Screen
        name="loyalty"
        options={{
          title: t(lang, "tab.loyalty"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="star"
              inactiveName="star-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.loyalty")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.loyalty"),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: t(lang, "tab.rewards"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="gift"
              inactiveName="gift-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.rewards")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.rewards"),
        }}
      />
      <Tabs.Screen
        name="hotel"
        options={{
          title: t(lang, "tab.hotel"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="business"
              inactiveName="business-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.hotel")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.hotel"),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t(lang, "tab.messages"),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              active={focused}
              activeName="chatbubbles"
              inactiveName="chatbubbles-outline"
            />
          ),
          tabBarLabel: ({ focused }) => (
            <TabLabel label={t(lang, "tab.messages")} focused={focused} />
          ),
          tabBarShowLabel: true,
          tabBarAccessibilityLabel: t(lang, "tab.messages"),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: loyal.tabBarBg,
    borderTopColor: loyal.cardBorder,
    borderTopWidth: 0.5,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.15,
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
