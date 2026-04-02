// =============================================================================
// Loyal App -- Stay / Home Tab
// Hero image, loyalty card, stats, services, contact
// =============================================================================

import { useCallback, useMemo } from "react";
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
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { PortalData, ServiceData } from "@/lib/types";

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
          borderColor: loyal.inputBorder,
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

function ServiceCard({ item }: { item: ServiceData }) {
  return (
    <View style={styles.serviceCard}>
      <View style={styles.serviceIconWrap}>
        <Icon name="sparkles" size={22} color={loyal.primary} />
      </View>
      <Text style={styles.serviceName} numberOfLines={2}>{item.name}</Text>
    </View>
  );
}

// -- Main Screen ---------------------------------------------------------------

function StayScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const tt = (key: string) => t(lang, key);
  const token = useAppStore((s) => s.token);

  const { data, isLoading, refetch, isRefetching } = useQuery<PortalData>({
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

  const heroImage = data?.gallery?.[0]?.url ?? null;
  const member = data?.member;
  const hotel = data?.hotel;
  const program = data?.program;
  const services = data?.services ?? [];
  const tierName = data?.tier?.name ?? null;
  const tierMultiplier = data?.tier?.multiplier ?? null;

  const tierProgress = useMemo(() => {
    if (!data?.nextTier) return 0;
    const target = data.nextTier.minPoints;
    if (target > 0) {
      return Math.min((member?.availablePoints ?? 0) / target, 1);
    }
    return 0;
  }, [data?.nextTier, member?.availablePoints]);

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

  const renderHeader = () => (
    <View>
      {/* Hero Section */}
      <View style={styles.heroContainer}>
        {heroImage ? (
          <Image
            source={{ uri: heroImage }}
            style={styles.heroImage as any}
            resizeMode="cover"
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
            colors={[loyal.primary, loyal.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.loyaltyGradient}
          >
            <View style={styles.loyaltyTop}>
              <View style={styles.loyaltyInfo}>
                <Text style={styles.loyaltyName}>{member.firstName} {member.lastName}</Text>
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

      {/* Stats Row */}
      {member && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{member.totalStays ?? 0}</Text>
            <Text style={styles.statLabel}>{tt("stay.stays")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{member.availablePoints ?? 0}</Text>
            <Text style={styles.statLabel}>{tt("stay.points")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{tierMultiplier ?? 1}x</Text>
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
            renderItem={({ item }) => <ServiceCard item={item} />}
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
    </View>
  );

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
    color: loyal.primary,
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
    backgroundColor: loyal.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
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
    color: loyal.textSecondary,
    marginTop: spacing.xxs,
  },

  // -- Welcome ----------------------------------------------------------------
  welcomeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: loyal.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
    padding: spacing.xl,
    ...shadow.sm,
  },
  welcomeText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.text,
    lineHeight: 22,
  },

  // -- Services ---------------------------------------------------------------
  sectionContainer: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.text,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  servicesList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  serviceCard: {
    width: 100,
    backgroundColor: loyal.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
    ...shadow.sm,
  },
  serviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: loyal.primaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceName: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.text,
    textAlign: "center",
  },

  // -- Contact ----------------------------------------------------------------
  contactCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: loyal.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.sm,
  },
  contactTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.text,
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
    color: loyal.text,
  },
});

export default function StayScreen() {
  return (
    <ErrorBoundary>
      <StayScreenInner />
    </ErrorBoundary>
  );
}
