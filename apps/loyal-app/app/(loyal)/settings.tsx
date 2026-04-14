// =============================================================================
// Loyal App -- Settings / Profile Screen
// Profile info, language toggle, hotel switch, logout, app info, GDPR
// =============================================================================

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { loyal, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalData } from "@/lib/loyal-api";
import { logout as clearSecureStore, setPersistedLang } from "@/lib/auth";
import { disconnectPusher } from "@/lib/pusher";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { PortalData } from "@/lib/types";

// -- Helpers ------------------------------------------------------------------

const appVersion =
  Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? "1.0.0";

// -- Section Card wrapper -----------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

// -- Row component ------------------------------------------------------------

function SettingsRow({
  icon,
  iconColor = loyal.lightTextSecondary,
  label,
  value,
  onPress,
  danger = false,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  iconColor?: string;
  label: string;
  value?: string | null;
  onPress?: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      style={styles.row}
      {...(onPress
        ? {
            onPress,
            accessibilityRole: "button" as const,
            accessibilityLabel: accessibilityLabel ?? label,
          }
        : {})}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: "rgba(239,68,68,0.10)" }]}>
        <Icon name={icon} size={18} color={danger ? loyal.danger : iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && { color: loyal.danger }]}>{label}</Text>
        {value != null && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      </View>
      {onPress && (
        <Icon name="chevron-forward" size={16} color={loyal.lightTextMuted} />
      )}
    </Wrapper>
  );
}

// -- Main Screen --------------------------------------------------------------

function SettingsScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const token = useAppStore((s) => s.token);
  const memberName = useAppStore((s) => s.memberName);
  const hotelName = useAppStore((s) => s.hotelName);
  const setLang = useAppStore((s) => s.setLang);
  const reset = useAppStore((s) => s.reset);
  const tt = (key: string) => t(lang, key);

  const [loggingOut, setLoggingOut] = useState(false);

  const { data } = useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const res = await fetchPortalData(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed");
      return res.data;
    },
    enabled: !!token,
  });

  const member = data?.member;
  const hotel = data?.hotel;

  const displayName = useMemo(() => {
    if (member?.firstName || member?.lastName) {
      return [member.firstName, member.lastName].filter(Boolean).join(" ");
    }
    return memberName ?? "--";
  }, [member?.firstName, member?.lastName, memberName]);

  // P2-4: Dynamic theme accent color
  const accentColor = useMemo(() => {
    const config = data?.program?.portalThemeConfig;
    if (!config || typeof config !== "object") return loyal.primary;
    const c = config as Record<string, unknown>;
    return typeof c.primaryColor === "string" ? c.primaryColor : loyal.primary;
  }, [data?.program?.portalThemeConfig]);

  const handleToggleLang = useCallback(() => {
    const next = lang === "pl" ? "en" : "pl";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLang(next);
    setPersistedLang(next);
  }, [lang, setLang]);

  const handleChangeHotel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/(auth)/hotel-select");
  }, []);

  const handleLogout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      tt("settings.logout"),
      tt("settings.logoutConfirm"),
      [
        { text: tt("common.cancel"), style: "cancel" },
        {
          text: tt("settings.logout"),
          style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            try {
              disconnectPusher();
              await clearSecureStore();
              reset();
              router.replace("/(auth)/welcome");
            } catch {
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  }, [tt, reset]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[loyal.bg, loyal.bgLight]}
        style={[styles.header, { paddingTop: insets.top + spacing.lg }]}
      >
        <Text style={styles.headerTitle}>{tt("settings.title")}</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing["4xl"] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <SectionCard>
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: accentColor }]}>
              <Text style={styles.avatarText}>
                {(member?.firstName ?? memberName ?? "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayName}</Text>
              {member?.memberNumber && (
                <Text style={styles.profileMember}>#{member.memberNumber}</Text>
              )}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.profileDetails}>
            {member?.email && (
              <View style={styles.detailRow}>
                <Icon name="mail-outline" size={16} color={loyal.lightTextMuted} />
                <Text style={styles.detailText}>{member.email}</Text>
              </View>
            )}
            {member?.memberNumber && (
              <View style={styles.detailRow}>
                <Icon name="card-outline" size={16} color={loyal.lightTextMuted} />
                <Text style={styles.detailText}>
                  {tt("settings.memberNumber")}: {member.memberNumber}
                </Text>
              </View>
            )}
          </View>
        </SectionCard>

        {/* Language */}
        <SectionCard>
          <SettingsRow
            icon="globe-outline"
            iconColor={accentColor}
            label={tt("settings.language")}
            value={lang === "pl" ? "Polski" : "English"}
            onPress={handleToggleLang}
            accessibilityLabel={`${tt("settings.language")}: ${lang === "pl" ? "Polski" : "English"}`}
          />
        </SectionCard>

        {/* Hotel */}
        <SectionCard>
          <SettingsRow
            icon="business-outline"
            iconColor={accentColor}
            label={tt("settings.hotel")}
            value={hotel?.name ?? hotelName ?? "--"}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="swap-horizontal-outline"
            iconColor={accentColor}
            label={tt("settings.changeHotel")}
            onPress={handleChangeHotel}
          />
        </SectionCard>

        {/* App Info */}
        <SectionCard>
          <SettingsRow
            icon="information-circle-outline"
            iconColor={loyal.lightTextSecondary}
            label={tt("settings.version")}
            value={appVersion}
          />
        </SectionCard>

        {/* Delete Account */}
        <SectionCard>
          <View style={styles.deleteSection}>
            <Icon name="trash-outline" size={18} color={loyal.lightTextMuted} />
            <Text style={styles.deleteTitle}>{tt("settings.deleteAccount")}</Text>
            <Text style={styles.deleteDesc}>{tt("settings.deleteAccountDesc")}</Text>
          </View>
        </SectionCard>

        {/* Logout */}
        <Pressable
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel={tt("settings.logout")}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={loyal.white} />
          ) : (
            <>
              <Icon name="log-out-outline" size={20} color={loyal.white} />
              <Text style={styles.logoutText}>{tt("settings.logout")}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default function SettingsScreen() {
  return (
    <ErrorBoundary>
      <SettingsScreenInner />
    </ErrorBoundary>
  );
}

// -- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: loyal.contentBg,
  },

  // -- Header -----------------------------------------------------------------
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.white,
  },

  // -- Scroll -----------------------------------------------------------------
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },

  // -- Card -------------------------------------------------------------------
  card: {
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    overflow: "hidden",
    ...shadow.sm,
  },

  // -- Profile ----------------------------------------------------------------
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
  },
  profileMember: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    marginTop: spacing.xxs,
  },
  profileDetails: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  detailText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    flex: 1,
  },

  // -- Divider ----------------------------------------------------------------
  divider: {
    height: 1,
    backgroundColor: loyal.lightCardBorder,
    marginHorizontal: spacing.lg,
  },

  // -- Row --------------------------------------------------------------------
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: TOUCH_TARGET,
    gap: spacing.md,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: loyal.lightPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: loyal.lightText,
  },
  rowValue: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    marginTop: spacing.xxs,
  },

  // -- Delete Account ---------------------------------------------------------
  deleteSection: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  deleteTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
  },
  deleteDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    lineHeight: 20,
  },

  // -- Logout -----------------------------------------------------------------
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: loyal.danger,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    minHeight: TOUCH_TARGET,
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  logoutText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: loyal.white,
  },
});
