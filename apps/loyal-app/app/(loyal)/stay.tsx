// =============================================================================
// Loyal App -- Stay / Home Tab
// Hero image, loyalty card, stats, services, contact
// =============================================================================

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchPortalData } from "@/lib/loyal-api";
import { setPersistedLang } from "@/lib/auth";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { PortalData, ServiceData, GlobalTierData } from "@/lib/types";

// -- Greeting helper -----------------------------------------------------------

function getGreeting(lang: "pl" | "en"): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return t(lang, "stay.greeting.morning");
  if (h >= 12 && h < 18) return t(lang, "stay.greeting.afternoon");
  if (h >= 18 && h < 22) return t(lang, "stay.greeting.evening");
  return t(lang, "stay.greeting.night");
}

// -- Circular Progress Ring ----------------------------------------------------

function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 5,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const r = center - strokeWidth;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={{ width: size, height: size }}>
      {/* Background circle (track) */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: center,
          borderWidth: strokeWidth,
          borderColor: loyal.lightProgressTrack,
        }}
      />
      {/* Filled arc approximation using a rotated half-circle trick */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: center,
          borderWidth: strokeWidth,
          borderColor: loyal.primary,
          borderTopColor: filled > 0.25 ? loyal.primary : "transparent",
          borderRightColor: filled > 0.5 ? loyal.primary : "transparent",
          borderBottomColor: filled > 0.75 ? loyal.primary : "transparent",
          borderLeftColor: filled > 0 ? loyal.primary : "transparent",
          transform: [{ rotate: "-90deg" }],
        }}
      />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={styles.ringText}>{Math.round(filled * 100)}%</Text>
      </View>
    </View>
  );
}

// -- Service Card (horizontal scroll) -----------------------------------------

function ServiceCard({ item, accentColor, currency }: { item: ServiceData; accentColor: string; currency: string }) {
  return (
    <View style={styles.serviceCard}>
      <View style={styles.serviceIconWrap}>
        <Icon name="sparkles" size={22} color={accentColor} />
      </View>
      <Text style={styles.serviceName} numberOfLines={2}>{item.name}</Text>
      {item.price != null && (
        <Text style={styles.servicePrice}>
          {item.price} {item.currency ?? currency}
        </Text>
      )}
    </View>
  );
}

// -- Main Screen ---------------------------------------------------------------

function StayScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const tt = (key: string) => t(lang, key);
  const token = useAppStore((s) => s.token);

  const { data, isLoading, refetch, isRefetching, isError } = useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const res = await fetchPortalData(token!);
      if (res.status !== "success" || !res.data) {
        throw new Error(res.errorMessage ?? "Failed to load portal data");
      }
      return res.data;
    },
    enabled: !!token,
  });

  const greeting = useMemo(() => getGreeting(lang), [lang]);

  const [heroError, setHeroError] = useState(false);
  const heroImage = data?.gallery?.[0]?.url ?? null;
  const member = data?.member;
  const hotel = data?.hotel;
  const program = data?.program;
  const services = data?.services ?? [];
  const tierName = data?.tier?.name ?? null;
  const tierMultiplier = data?.tier?.multiplier ?? null;
  const globalTier = data?.globalTier ?? null;
  const globalStats = data?.globalStats ?? null;
  const nextGlobalTier = data?.nextGlobalTier ?? null;

  // P2-2: Tier Benefits
  const tierBenefits = useMemo(() => {
    if (!data?.tier?.benefits) return [];
    if (Array.isArray(data.tier.benefits)) return data.tier.benefits as string[];
    return [];
  }, [data?.tier?.benefits]);

  // P2-4: Dynamic theme accent color
  const accentColor = useMemo(() => {
    if (!program?.portalThemeConfig || typeof program.portalThemeConfig !== "object") return loyal.primary;
    const config = program.portalThemeConfig as Record<string, unknown>;
    return typeof config.primaryColor === "string" ? config.primaryColor : loyal.primary;
  }, [program?.portalThemeConfig]);

  const tierProgress = useMemo(() => {
    if (!data?.nextTier) return 0;
    const target = data.nextTier.minPoints;
    if (target > 0) {
      return Math.min((member?.availablePoints ?? 0) / target, 1);
    }
    return 0;
  }, [data?.nextTier, member?.availablePoints]);

  const globalTierProgress = useMemo(() => {
    if (!nextGlobalTier) return 1; // max tier
    const target = nextGlobalTier.minPoints;
    if (target > 0) {
      return Math.min((globalStats?.lifetimePoints ?? 0) / target, 1);
    }
    return 0;
  }, [nextGlobalTier, globalStats?.lifetimePoints]);

  const handleCall = useCallback(() => {
    if (!hotel?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${hotel.phone}`);
  }, [hotel?.phone]);

  const handleEmail = useCallback(() => {
    if (!hotel?.email) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`mailto:${hotel.email}`);
  }, [hotel?.email]);

  const setLang = useAppStore((s) => s.setLang);
  const handleToggleLang = useCallback(() => {
    const next = lang === "pl" ? "en" : "pl";
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLang(next);
    setPersistedLang(next);
  }, [lang, setLang]);

  const renderHeader = () => (
    <View>
      {/* Hero Section */}
      <View style={styles.heroContainer}>
        {heroImage && !heroError ? (
          <Image
            source={{ uri: heroImage }}
            style={styles.heroImage as any}
            resizeMode="cover"
            onError={() => setHeroError(true)}
            accessibilityLabel={hotel?.name ? `${hotel.name} - ${tt("stay.heroImage")}` : tt("stay.heroImage")}
          />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: loyal.bgDark }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(13,34,54,0.8)"]}
          style={styles.heroGradient}
        />
        <View style={[styles.heroContent, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.heroGreeting}>{greeting}</Text>
          {member?.firstName && (
            <Text style={styles.heroName}>{member.firstName}</Text>
          )}
        </View>
      </View>

      {/* Loyalty Card */}
      {member && (
        <View style={styles.loyaltyCard}>
          <LinearGradient
            colors={[accentColor, accentColor === loyal.primary ? loyal.primaryDark : accentColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.loyaltyGradient}
          >
            <View style={styles.loyaltyTop}>
              <View style={styles.loyaltyInfo}>
                {(member.firstName || member.lastName) && (
                  <Text style={styles.loyaltyName}>{[member.firstName, member.lastName].filter(Boolean).join(" ")}</Text>
                )}
                {member.memberNumber && (
                  <Text style={styles.loyaltyNumber}>#{member.memberNumber}</Text>
                )}
                {tierName && (
                  <View style={styles.tierBadge}>
                    <Icon name="shield-checkmark" size={14} color={loyal.bg} />
                    <Text style={styles.tierBadgeText}>{tierName}</Text>
                  </View>
                )}
              </View>
              <ProgressRing progress={tierProgress} />
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Global Tier Card */}
      {(globalTier || nextGlobalTier) && globalStats && (
        <View style={styles.globalTierCard}>
          <View style={styles.globalTierHeader}>
            <View
              style={[
                styles.globalTierIconWrap,
                { backgroundColor: (globalTier?.badgeColor ?? nextGlobalTier?.badgeColor) ?? loyal.primary },
              ]}
            >
              <Icon name="globe" size={18} color={loyal.white} />
            </View>
            <View style={styles.globalTierHeaderText}>
              <Text style={styles.globalTierTitle}>{tt("globalTier.title")}</Text>
              <Text style={styles.globalTierSubtitle}>{tt("globalTier.crossHotel")}</Text>
            </View>
          </View>

          <View style={styles.globalTierNameRow}>
            {globalTier ? (
              <Text
                style={[
                  styles.globalTierName,
                  { color: globalTier.badgeColor ?? loyal.primary },
                ]}
              >
                {lang === "en" && globalTier.nameEn ? globalTier.nameEn : globalTier.name}
              </Text>
            ) : nextGlobalTier ? (
              <Text
                style={[
                  styles.globalTierName,
                  { color: nextGlobalTier.badgeColor ?? loyal.primary },
                ]}
              >
                {tt("globalTier.getFirstTier")}
              </Text>
            ) : null}
          </View>

          {/* Global stats */}
          <View style={styles.globalStatsRow}>
            <View style={styles.globalStatItem}>
              <Text style={styles.globalStatValue}>{globalStats.lifetimePoints}</Text>
              <Text style={styles.globalStatLabel}>{tt("globalTier.lifetimePoints")}</Text>
            </View>
            <View style={styles.globalStatItem}>
              <Text style={styles.globalStatValue}>{globalStats.totalStays}</Text>
              <Text style={styles.globalStatLabel}>{tt("globalTier.totalStays")}</Text>
            </View>
            <View style={styles.globalStatItem}>
              <Text style={styles.globalStatValue}>{Math.round(globalStats.totalSpent)}</Text>
              <Text style={styles.globalStatLabel}>{tt("globalTier.totalSpent")}</Text>
            </View>
          </View>

          {/* Progress to next global tier */}
          {nextGlobalTier ? (
            <View style={styles.globalTierProgressWrap}>
              <View style={styles.globalTierProgressRow}>
                <Text style={styles.globalTierProgressLabel}>
                  {tt("globalTier.nextTier")}: {lang === "en" && nextGlobalTier.nameEn ? nextGlobalTier.nameEn : nextGlobalTier.name}
                </Text>
                <Text style={styles.globalTierProgressPct}>
                  {Math.round(globalTierProgress * 100)}%
                </Text>
              </View>
              <View style={styles.globalTierProgressTrack}>
                <View
                  style={[
                    styles.globalTierProgressFill,
                    {
                      width: `${Math.round(globalTierProgress * 100)}%`,
                      backgroundColor: nextGlobalTier.badgeColor ?? loyal.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.globalTierProgressHint}>
                {(() => {
                  const remaining = Math.max(0, nextGlobalTier.minPoints - (globalStats.lifetimePoints ?? 0));
                  if (remaining === 0) return tt("globalTier.earnFirst");
                  return tt("globalTier.pointsToNext").replace("{n}", String(remaining));
                })()}
              </Text>
            </View>
          ) : (
            <View style={styles.globalTierMaxBadge}>
              <Icon name="trophy" size={16} color={loyal.primary} />
              <Text style={styles.globalTierMaxText}>{tt("globalTier.maxTier")}</Text>
            </View>
          )}
        </View>
      )}

      {/* Tier Benefits */}
      {tierBenefits.length > 0 && (
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>{tt("stay.yourBenefits")}</Text>
          {tierBenefits.map((benefit, idx) => (
            <View key={idx} style={styles.benefitRow}>
              <Icon name="checkmark-circle" size={16} color={accentColor} />
              <Text style={styles.benefitText}>{String(benefit)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Stats Row */}
      {member && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: accentColor }]}>{member.totalStays ?? 0}</Text>
            <Text style={styles.statLabel}>{tt("stay.stays")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: accentColor }]}>{member.availablePoints ?? 0}</Text>
            <Text style={styles.statLabel}>{tt("stay.points")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: accentColor }]}>{tierMultiplier ?? 1}x</Text>
            <Text style={styles.statLabel}>{tt("stay.multiplier")}</Text>
          </View>
        </View>
      )}

      {/* Welcome Message */}
      {program?.portalWelcomeMessage && (
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>{program.portalWelcomeMessage}</Text>
        </View>
      )}

      {/* Services */}
      {services.length > 0 && (
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>{tt("stay.services")}</Text>
          <FlatList
            data={services}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => <ServiceCard item={item} accentColor={accentColor} currency={data?.program?.currency ?? "PLN"} />}
            contentContainerStyle={styles.servicesList}
          />
        </View>
      )}

      {/* Contact Card */}
      {hotel && (
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>{tt("stay.contact")}</Text>
          {hotel.phone && (
            <Pressable
              style={styles.contactRow}
              onPress={handleCall}
              accessibilityRole="button"
              accessibilityLabel={`${tt("stay.phone")}: ${hotel.phone}`}
            >
              <Icon name="call" size={20} color={loyal.primary} />
              <Text style={styles.contactText}>{hotel.phone}</Text>
            </Pressable>
          )}
          {hotel.email && (
            <Pressable
              style={styles.contactRow}
              onPress={handleEmail}
              accessibilityRole="button"
              accessibilityLabel={`${tt("stay.email")}: ${hotel.email}`}
            >
              <Icon name="mail" size={20} color={loyal.primary} />
              <Text style={styles.contactText}>{hotel.email}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Language Toggle */}
      <Pressable
        style={styles.langToggle}
        onPress={handleToggleLang}
        accessibilityRole="button"
        accessibilityLabel={tt("common.language")}
      >
        <Icon name="globe-outline" size={18} color={loyal.lightTextMuted} />
        <Text style={styles.langToggleText}>
          {lang === "pl" ? "English" : "Polski"}
        </Text>
      </Pressable>
    </View>
  );

  if (isLoading && !data) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={loyal.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <Icon name="alert-circle-outline" size={48} color={loyal.lightTextMuted} />
        <Text style={{ color: loyal.lightText, fontSize: fontSize.base, marginTop: spacing.md, textAlign: "center" }}>
          {tt("common.error")}
        </Text>
        <Pressable
          onPress={() => refetch()}
          style={{ marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: loyal.primary, borderRadius: radius.lg }}
          accessibilityRole="button"
          accessibilityLabel={tt("common.retry")}
        >
          <Text style={{ color: loyal.white, fontSize: fontSize.base, fontFamily: "Inter_600SemiBold" }}>
            {tt("common.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={loyal.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing["4xl"] }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: loyal.contentBg,
  },

  // -- Hero -------------------------------------------------------------------
  heroContainer: {
    height: 260,
    position: "relative",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
  },
  heroGreeting: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  heroName: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.white,
    marginTop: spacing.xs,
  },

  // -- Loyalty Card -----------------------------------------------------------
  loyaltyCard: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing["3xl"],
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.lg,
  },
  loyaltyGradient: {
    padding: spacing.xl,
  },
  loyaltyTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  loyaltyInfo: {
    flex: 1,
    marginRight: spacing.lg,
  },
  loyaltyName: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
  },
  loyaltyNumber: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: "rgba(13,34,54,0.6)",
    marginTop: spacing.xxs,
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(13,34,54,0.15)",
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
  },
  tierBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: loyal.bg,
  },

  ringText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
  },

  // -- Stats ------------------------------------------------------------------
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.md,
    alignItems: "center",
    ...shadow.sm,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    marginTop: spacing.xxs,
  },

  // -- Benefits ---------------------------------------------------------------
  benefitsCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadow.sm,
  },
  benefitsTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    marginBottom: spacing.xs,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  benefitText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightText,
    lineHeight: 18,
  },

  // -- Welcome ----------------------------------------------------------------
  welcomeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    ...shadow.sm,
  },
  welcomeText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightText,
    lineHeight: 22,
  },

  // -- Services ---------------------------------------------------------------
  sectionContainer: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  servicesList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  serviceCard: {
    width: 100,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
    ...shadow.sm,
  },
  serviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: loyal.lightPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceName: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.lightText,
    textAlign: "center",
  },
  servicePrice: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
    textAlign: "center" as const,
    marginTop: 2,
  },

  // -- Contact ----------------------------------------------------------------
  contactCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.sm,
  },
  contactTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  contactText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightText,
  },

  // -- Global Tier Card -------------------------------------------------------
  globalTierCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.sm,
  },
  globalTierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  globalTierIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  globalTierHeaderText: {
    flex: 1,
  },
  globalTierTitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
  },
  globalTierSubtitle: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    marginTop: 1,
  },
  globalTierNameRow: {
    alignItems: "center",
  },
  globalTierName: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
  },
  globalStatsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  globalStatItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: loyal.lightPrimaryFaint,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  globalStatValue: {
    fontSize: fontSize.base,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
  },
  globalStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    textAlign: "center",
    marginTop: 2,
  },
  globalTierProgressWrap: {
    gap: spacing.xs,
  },
  globalTierProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  globalTierProgressLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextSecondary,
  },
  globalTierProgressPct: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
  },
  globalTierProgressTrack: {
    height: 6,
    backgroundColor: loyal.lightProgressTrack,
    borderRadius: 3,
    overflow: "hidden",
  },
  globalTierProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  globalTierProgressHint: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextMuted,
  },
  globalTierMaxBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  globalTierMaxText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
  },

  // -- Language Toggle ----------------------------------------------------------
  langToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: TOUCH_TARGET,
  },
  langToggleText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextMuted,
  },
});

export default function StayScreen() {
  return (
    <ErrorBoundary>
      <StayScreenInner />
    </ErrorBoundary>
  );
}
