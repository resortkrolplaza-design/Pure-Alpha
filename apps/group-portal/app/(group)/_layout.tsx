// =============================================================================
// Group Portal — Bottom Tab Navigator
// =============================================================================

import { Tabs } from "expo-router";
import { Platform, StyleSheet, Animated, Text } from "react-native";
import { useRef, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { group, fontSize, spacing } from "@/lib/tokens";
import { Icon, type IconName } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

// -- Animated Tab Icon with scale effect on active state --------------------

function AnimatedTabIcon({
  focused,
  activeName,
  inactiveName,
}: {
  focused: boolean;
  activeName: IconName;
  inactiveName: IconName;
}) {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.1 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.1 : 1,
      damping: 14,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [focused, scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Icon
        name={focused ? activeName : inactiveName}
        size={24}
        color={focused ? group.primary : group.textMuted}
      />
    </Animated.View>
  );
}

// -- Custom Tab Label with font weight based on focus -----------------------

function TabLabel({ focused, label }: { focused: boolean; label: string }) {
  return (
    <Text
      style={[
        styles.tabLabelBase,
        focused ? styles.tabLabelActive : styles.tabLabelInactive,
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
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
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel focused={focused} label={t(lang, "group.tab.overview")} />
          ),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              activeName="clipboard"
              inactiveName="clipboard-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="guests"
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel focused={focused} label={t(lang, "group.tab.guests")} />
          ),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              activeName="people"
              inactiveName="people-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel focused={focused} label={t(lang, "group.tab.messages")} />
          ),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              activeName="chatbubbles"
              inactiveName="chatbubbles-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel
              focused={focused}
              label={t(lang, "group.tab.documents")}
            />
          ),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              activeName="document-text"
              inactiveName="document-text-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="photos"
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel focused={focused} label={t(lang, "group.tab.photos")} />
          ),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              activeName="camera"
              inactiveName="camera-outline"
            />
          ),
        }}
      />
      {/* Hidden screens (no tab bar item) */}
      <Tabs.Screen
        name="rsvp"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="register"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: group.tabBarBg,
    borderTopColor: group.cardBorder,
    borderTopWidth: 0.5,
    height: Platform.select({ ios: 88, android: 64 }),
    paddingBottom: Platform.select({ ios: 28, android: 8 }),
    paddingTop: spacing.sm,
  },
  tabLabelBase: {
    fontSize: fontSize.xs,
  },
  tabLabelActive: {
    fontFamily: "Inter_500Medium",
    color: group.primary,
  },
  tabLabelInactive: {
    fontFamily: "Inter_400Regular",
    color: group.textMuted,
  },
});
