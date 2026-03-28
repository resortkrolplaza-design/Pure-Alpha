// =============================================================================
// Group Portal — Bottom Tab Navigator (dynamic tabs based on feature flags + role)
// =============================================================================

import { Tabs } from "expo-router";
import { Platform, StyleSheet, Animated, Text } from "react-native";
import { useRef, useEffect, useState, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { group, fontSize, spacing } from "@/lib/tokens";
import { Icon, type IconName } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalInit, groupFetch } from "@/lib/group-api";
import { getSecureItem, setSecureItem } from "@/lib/auth";
import type { GroupMessage } from "@/lib/types";

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
  const trackingId = useAppStore((s) => s.groupTrackingId) ?? "";
  const portalRole = useAppStore((s) => s.portalRole);
  const isParticipant = portalRole === "participant";

  // Fix 1: Unified queryFn -- MUST match overview.tsx shape (unwrapped PortalInitData)
  // Both use queryKey ["portal-init", trackingId]. React Query caches ONE shape per key.
  const { data: initData } = useQuery({
    queryKey: ["portal-init", trackingId],
    queryFn: async () => {
      if (!trackingId) return null;
      const res = await fetchPortalInit(trackingId);
      return res.status === "success" ? res.data : null;
    },
    enabled: !!trackingId,
    staleTime: 60_000,
  });

  const portal = initData?.portal ?? null;

  // ── TASK 2: Unread message badge ──
  const LAST_SEEN_KEY = `pa_last_seen_msg_count_${trackingId}`;
  const [unreadBadge, setUnreadBadge] = useState<number | undefined>(undefined);

  const { data: msgData } = useQuery({
    queryKey: ["group-messages-count", trackingId],
    queryFn: async () => {
      if (!trackingId) return { replies: [], anchorMessage: null };
      const res = await groupFetch<{ replies: GroupMessage[]; anchorMessage: GroupMessage | null; unreadCount?: number }>(trackingId, "/messages");
      return res.data ?? { replies: [], anchorMessage: null };
    },
    enabled: !!trackingId && !!portal?.messagingEnabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!msgData) return;
    const currentCount = msgData.replies?.length ?? 0;
    getSecureItem(LAST_SEEN_KEY).then((stored) => {
      const lastSeen = stored ? parseInt(stored, 10) : 0;
      const diff = currentCount - (isNaN(lastSeen) ? 0 : lastSeen);
      setUnreadBadge(diff > 0 ? diff : undefined);
    }).catch(() => setUnreadBadge(undefined));
  }, [msgData, LAST_SEEN_KEY]);

  // When user taps Messages tab, mark all as seen
  const markMessagesSeen = useCallback(() => {
    const currentCount = msgData?.replies?.length ?? 0;
    setSecureItem(LAST_SEEN_KEY, String(currentCount)).catch(() => {});
    setUnreadBadge(undefined);
  }, [msgData, LAST_SEEN_KEY]);

  // Fix 2: Consistent defaults -- ALL optional tabs hidden until data loads
  const hideGuests = !portal?.guestListEnabled || isParticipant;
  const hideMessages = !portal?.messagingEnabled;
  const hideDocuments = !portal?.documentsEnabled || isParticipant;
  const hidePhotos = !portal?.photoWallEnabled;

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
          tabBarItemStyle: hideGuests ? { display: "none" } : undefined,
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
          tabBarItemStyle: hideMessages ? { display: "none" } : undefined,
          tabBarBadge: unreadBadge,
          tabBarBadgeStyle: styles.tabBadge,
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
        listeners={{
          tabPress: () => markMessagesSeen(),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          tabBarItemStyle: hideDocuments ? { display: "none" } : undefined,
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
          tabBarItemStyle: hidePhotos ? { display: "none" } : undefined,
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
      <Tabs.Screen name="rsvp" options={{ href: null }} />
      <Tabs.Screen name="register" options={{ href: null }} />
      <Tabs.Screen name="agenda" options={{ href: null }} />
      <Tabs.Screen name="announcements" options={{ href: null }} />
      <Tabs.Screen name="faq" options={{ href: null }} />
      <Tabs.Screen name="services" options={{ href: null }} />
      <Tabs.Screen name="attractions" options={{ href: null }} />
      <Tabs.Screen name="gallery" options={{ href: null }} />
      <Tabs.Screen name="polls" options={{ href: null }} />
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
  tabBadge: {
    backgroundColor: group.primary,
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    minWidth: 18,
    height: 18,
    lineHeight: 18,
    borderRadius: 9,
  },
});
