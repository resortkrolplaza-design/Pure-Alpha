// =============================================================================
// Loyal App -- Hotel Select Screen (pick hotel after multi-hotel login)
// Shows hotel cards with portalToken, points, tier badge, program name
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  FlatList,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, letterSpacing, TOUCH_TARGET, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchGuestHotels, fetchPortalData, type GuestHotelData } from "@/lib/loyal-api";
import { saveSelectedToken, setHotelName, setMemberName, getGuestJwt, logout } from "@/lib/auth";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSlideUp } from "@/lib/animations";

function HotelSelectScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const guestJwt = useAppStore((s) => s.guestJwt);
  const store = useAppStore.getState;
  const params = useLocalSearchParams<{ hotels?: string; firstName?: string }>();

  const [hotels, setHotels] = useState<GuestHotelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const headerAnim = useSlideUp(0, 20);

  // -- Load hotels on mount or from params --------------------------------------

  useEffect(() => {
    async function loadHotels() {
      // Try params first (passed from login screen)
      if (params.hotels) {
        try {
          const parsed = JSON.parse(params.hotels) as GuestHotelData[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHotels(parsed);
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to API fetch
        }
      }

      // Fetch from API
      const jwt = guestJwt ?? await getGuestJwt();
      if (!jwt) {
        // No JWT -- redirect to login
        router.replace("/(auth)/login");
        return;
      }

      const res = await fetchGuestHotels(jwt);
      if (res.status === "success" && res.data) {
        setHotels(res.data.hotels);
      } else {
        Alert.alert(t(lang, "common.error"), res.errorMessage ?? t(lang, "common.error"));
      }
      setLoading(false);
    }

    loadHotels();
  }, [params.hotels, guestJwt, lang]);

  // -- Select hotel handler -----------------------------------------------------

  const handleSelectHotel = useCallback(async (hotel: GuestHotelData) => {
    if (!hotel.portalToken) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        t(lang, "common.error"),
        t(lang, "hotelSelect.noPortal"),
      );
      return;
    }

    setSelecting(hotel.memberId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await saveSelectedToken(hotel.portalToken);
      const s = store();
      s.setToken(hotel.portalToken);

      // Fetch portal data to populate store with full details
      const portalRes = await fetchPortalData(hotel.portalToken);
      if (portalRes.status === "success" && portalRes.data) {
        const { member, hotel: h, program } = portalRes.data;
        s.setMemberName(member.firstName);
        s.setHotelName(h.name);
        s.setProgramName(program.programName);
        if (program.portalLanguage === "en" || program.portalLanguage === "pl") {
          s.setLang(program.portalLanguage);
        }
      } else {
        // Fallback: use data from hotel card
        s.setHotelName(hotel.hotelName);
        if (hotel.guestName) s.setMemberName(hotel.guestName);
        s.setProgramName(hotel.programName);
      }

      // Persist for cold start restore
      await setHotelName(hotel.hotelName);
      if (hotel.guestName) await setMemberName(hotel.guestName);

      s.setAuthenticated(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(loyal)/stay");
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t(lang, "common.error"), t(lang, "common.error"));
      setSelecting(null);
    }
  }, [lang, store]);

  // -- Logout handler -----------------------------------------------------------

  const handleLogout = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await logout();
    store().reset();
    router.replace("/(auth)/welcome");
  }, [store]);

  // -- Render hotel card --------------------------------------------------------

  const renderHotelCard = useCallback(({ item, index }: { item: GuestHotelData; index: number }) => {
    const isSelecting = selecting === item.memberId;

    return (
      <Pressable
        style={[styles.hotelCard, isSelecting ? styles.hotelCardActive : null]}
        onPress={() => handleSelectHotel(item)}
        disabled={selecting !== null}
        accessibilityRole="button"
        accessibilityLabel={`${item.hotelName} - ${item.availablePoints} ${item.pointsName}`}
      >
        {/* Hotel logo or fallback */}
        <View style={styles.hotelLogoContainer}>
          {item.hotelLogo ? (
            <Image
              source={{ uri: item.hotelLogo }}
              style={styles.hotelLogo}
              resizeMode="contain"
              accessibilityLabel={item.hotelName}
            />
          ) : (
            <View style={styles.hotelLogoFallback}>
              <Icon name="business-outline" size={28} color={loyal.primary} />
            </View>
          )}
        </View>

        {/* Hotel info */}
        <View style={styles.hotelInfo}>
          <Text style={styles.hotelName} numberOfLines={1}>{item.hotelName}</Text>
          <Text style={styles.programName} numberOfLines={1}>{item.programName}</Text>

          {/* Points + tier row */}
          <View style={styles.hotelMeta}>
            <Text style={styles.pointsText}>
              {item.availablePoints.toLocaleString()} {item.pointsName}
            </Text>
            {item.tierName ? (
              <View style={[styles.tierBadge, { backgroundColor: item.tierColor + "30" }]}>
                <Text style={[styles.tierText, { color: item.tierColor }]} numberOfLines={1}>
                  {item.tierName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Arrow or spinner */}
        <View style={styles.hotelArrow}>
          {isSelecting ? (
            <ActivityIndicator size="small" color={loyal.primary} />
          ) : (
            <Icon name="chevron-forward" size={20} color={loyal.textMuted} />
          )}
        </View>
      </Pressable>
    );
  }, [selecting, handleSelectHotel]);

  // -- Render -------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[loyal.bg, loyal.bgDark, loyal.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerAnim.opacity, transform: headerAnim.transform }]}>
          <Pressable
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel={lang === "pl" ? "Wyloguj" : "Log out"}
            hitSlop={12}
          >
            <Icon name="log-out-outline" size={22} color={loyal.textMuted} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Icon name="business-outline" size={24} color={loyal.primary} />
            <Text style={styles.headerTitle}>{t(lang, "auth.selectHotel")}</Text>
          </View>

          {/* Spacer for symmetry */}
          <View style={styles.logoutButton} />
        </Animated.View>

        {params.firstName ? (
          <Text style={styles.greeting}>
            {lang === "pl" ? `Witaj, ${params.firstName}` : `Welcome, ${params.firstName}`}
          </Text>
        ) : null}

        <Text style={styles.subtitle}>{t(lang, "auth.yourHotels")}</Text>

        {/* Hotel list */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={loyal.primary} />
            <Text style={styles.loadingText}>{t(lang, "auth.loadingHotels")}</Text>
          </View>
        ) : hotels.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="alert-circle-outline" size={48} color={loyal.textMuted} />
            <Text style={styles.emptyTitle}>{t(lang, "auth.noHotels")}</Text>
            <Text style={styles.emptyDesc}>{t(lang, "auth.noHotelsDesc")}</Text>
          </View>
        ) : (
          <FlatList
            data={hotels}
            keyExtractor={(item) => item.memberId}
            renderItem={renderHotelCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </View>
  );
}

// -- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: loyal.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing["2xl"],
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    letterSpacing: letterSpacing.snug,
  },
  logoutButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },

  greeting: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.text,
    textAlign: "center",
    marginBottom: spacing.xs,
    letterSpacing: letterSpacing.snug,
  },
  subtitle: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.textMuted,
    textAlign: "center",
    marginBottom: spacing["2xl"],
  },

  listContent: {
    paddingBottom: spacing["3xl"],
  },
  separator: {
    height: spacing.md,
  },

  hotelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: loyal.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
    padding: spacing.lg,
    gap: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: loyal.shadowDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  hotelCardActive: {
    borderColor: loyal.primary,
    backgroundColor: loyal.primaryFaint,
  },

  hotelLogoContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: loyal.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  hotelLogo: {
    width: 56,
    height: 56,
  },
  hotelLogoFallback: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: loyal.primaryLight,
    borderRadius: radius.md,
  },

  hotelInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  hotelName: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.text,
    letterSpacing: letterSpacing.tight,
  },
  programName: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.textMuted,
  },
  hotelMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  pointsText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
  },
  tierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  tierText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
  },

  hotelArrow: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },

  // Loading / empty states
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg,
  },
  loadingText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing["3xl"],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.textSecondary,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});

// -- Default export wrapped in ErrorBoundary -----------------------------------

export default function HotelSelectScreen() {
  return (
    <ErrorBoundary>
      <HotelSelectScreenInner />
    </ErrorBoundary>
  );
}
