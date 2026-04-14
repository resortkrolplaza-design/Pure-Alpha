// =============================================================================
// Loyal App -- Bottom Tab Navigator (Navy bar + Gold accents + spring icons)
// 6 tabs: Pobyt, Lojalnosc, Nagrody, Hotel, Wiadomosci, Ustawienia
// =============================================================================

import { useRef, useEffect, useMemo, useCallback } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
} from "react-native";
import { Tabs, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { loyal, fontSize, spacing, radius } from "@/lib/tokens";
import { useReducedMotion } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalData } from "@/lib/loyal-api";
import { logout as clearSecureStore } from "@/lib/auth";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { Icon } from "@/lib/icons";
import type { PortalData } from "@/lib/types";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// -- AnimatedTabIcon (spring scale 1.0 / 1.1) --------------------------------

function AnimatedTabIcon({
  active,
  activeName,
  inactiveName,
  activeColor = loyal.primary,
}: {
  active: boolean;
  activeName: IoniconName;
  inactiveName: IoniconName;
  activeColor?: string;
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
        color={active ? activeColor : loyal.tabInactive}
      />
    </Animated.View>
  );
}

// -- TabLabel (font weight change on focus) -----------------------------------

function TabLabel({ label, focused, activeColor = loyal.primary }: { label: string; focused: boolean; activeColor?: string }) {
  return (
    <Text
      style={[
        styles.tabLabel,
        {
          color: focused ? activeColor : loyal.tabInactive,
          fontFamily: focused ? "Inter_600SemiBold" : "Inter_400Regular",
        },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
}

// -- Session Expired Modal ----------------------------------------------------

function SessionExpiredModal({
  visible,
  lang,
  onReLogin,
}: {
  visible: boolean;
  lang: "pl" | "en";
  onReLogin: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onReLogin}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconWrap}>
            <Icon name="time-outline" size={36} color={loyal.primary} />
          </View>
          <Text style={styles.modalTitle}>{t(lang, "settings.sessionExpired")}</Text>
          <Text style={styles.modalDesc}>{t(lang, "settings.sessionExpiredDesc")}</Text>
          <Pressable
            style={styles.modalButton}
            onPress={onReLogin}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "settings.reLogin")}
          >
            <Text style={styles.modalButtonText}>{t(lang, "settings.reLogin")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// -- Layout -------------------------------------------------------------------

export default function LoyalLayout() {
  const lang = useAppStore((s) => s.lang);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const token = useAppStore((s) => s.token);
  const sessionExpired = useAppStore((s) => s.sessionExpired);
  const reset = useAppStore((s) => s.reset);

  // Register push token after authentication (best-effort, silent fail)
  usePushNotifications();

  // Auth guard -- redirect unauthenticated users to entry screen
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated]);

  // Session expired handler -- clear store + navigate to login
  const handleReLogin = useCallback(async () => {
    try {
      await clearSecureStore();
    } catch {
      // best-effort
    }
    reset();
    router.replace("/(auth)/login");
  }, [reset]);

  // P2-4: Read portalThemeConfig for dynamic accent color
  const { data: portalData } = useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const res = await fetchPortalData(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed");
      return res.data;
    },
    enabled: !!token,
  });

  const accentColor = useMemo(() => {
    const config = portalData?.program?.portalThemeConfig;
    if (!config || typeof config !== "object") return loyal.primary;
    const c = config as Record<string, unknown>;
    return typeof c.primaryColor === "string" ? c.primaryColor : loyal.primary;
  }, [portalData?.program?.portalThemeConfig]);

  return (
    <>
      <SessionExpiredModal
        visible={sessionExpired}
        lang={lang}
        onReLogin={handleReLogin}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: accentColor,
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
                activeColor={accentColor}
              />
            ),
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t(lang, "tab.stay")} focused={focused} activeColor={accentColor} />
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
                activeColor={accentColor}
              />
            ),
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t(lang, "tab.loyalty")} focused={focused} activeColor={accentColor} />
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
                activeColor={accentColor}
              />
            ),
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t(lang, "tab.rewards")} focused={focused} activeColor={accentColor} />
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
                activeColor={accentColor}
              />
            ),
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t(lang, "tab.hotel")} focused={focused} activeColor={accentColor} />
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
                activeColor={accentColor}
              />
            ),
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t(lang, "tab.messages")} focused={focused} activeColor={accentColor} />
            ),
            tabBarShowLabel: true,
            tabBarAccessibilityLabel: t(lang, "tab.messages"),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t(lang, "tab.settings"),
            tabBarIcon: ({ focused }) => (
              <AnimatedTabIcon
                active={focused}
                activeName="settings"
                inactiveName="settings-outline"
                activeColor={accentColor}
              />
            ),
            tabBarLabel: ({ focused }) => (
              <TabLabel label={t(lang, "tab.settings")} focused={focused} activeColor={accentColor} />
            ),
            tabBarShowLabel: true,
            tabBarAccessibilityLabel: t(lang, "tab.settings"),
          }}
        />
      </Tabs>
    </>
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

  // -- Session Expired Modal --------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: loyal.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["3xl"],
  },
  modalCard: {
    backgroundColor: loyal.white,
    borderRadius: radius.xl,
    padding: spacing["3xl"],
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    gap: spacing.md,
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: loyal.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    textAlign: "center",
  },
  modalDesc: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: loyal.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["3xl"],
    marginTop: spacing.sm,
    minWidth: 200,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: loyal.bg,
  },
});
