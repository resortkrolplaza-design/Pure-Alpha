// =============================================================================
// Loyal App -- Rewards Tab
// Points balance, 2-column reward grid, redeem flow
// =============================================================================

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  Alert,
  RefreshControl,
  StyleSheet,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchRewards, redeemReward, fetchPortalData, fetchOffers, trackOfferClick } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { RewardData, PortalData, OfferData } from "@/lib/types";

// -- Reward Card (2-column grid) -----------------------------------------------

function RewardCard({
  item,
  pointsBalance,
  onRedeem,
  isRedeeming,
  lang,
}: {
  item: RewardData;
  pointsBalance: number;
  onRedeem: (reward: RewardData) => void;
  isRedeeming: boolean;
  lang: "pl" | "en";
}) {
  const tt = (key: string) => t(lang, key);
  const canRedeem = item.canRedeem && pointsBalance >= item.pointsCost;
  const [imageError, setImageError] = useState(false);

  return (
    <View style={styles.rewardCard}>
      {/* Image or gradient placeholder */}
      {item.imageUrl && !imageError ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.rewardImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
          accessibilityLabel={item.name}
        />
      ) : (
        <LinearGradient
          colors={[loyal.lightPrimaryFaint, loyal.contentBg]}
          style={styles.rewardImage}
        >
          <Icon name="gift" size={32} color={loyal.primary} />
        </LinearGradient>
      )}

      <View style={styles.rewardContent}>
        <Text style={styles.rewardName} numberOfLines={2}>{item.name}</Text>

        {item.description && (
          <Text style={styles.rewardDesc} numberOfLines={2}>{item.description}</Text>
        )}

        {item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}

        <Text style={styles.rewardCost}>{item.pointsCost} pkt</Text>

        {canRedeem ? (
          <Pressable
            style={[styles.redeemBtn, isRedeeming && styles.redeemBtnDisabled]}
            onPress={() => !isRedeeming && onRedeem(item)}
            disabled={isRedeeming}
            accessibilityRole="button"
            accessibilityState={{ disabled: isRedeeming }}
            accessibilityLabel={`${tt("rewards.redeem")} ${item.name}`}
          >
            {isRedeeming ? (
              <ActivityIndicator size="small" color={loyal.white} />
            ) : (
              <Text style={styles.redeemBtnText}>{tt("rewards.redeem")}</Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.lockedBtn}>
            <Icon name="lock-closed" size={14} color={loyal.lightTextMuted} />
            <Text style={styles.lockedBtnText} numberOfLines={1}>
              {item.reasonsBlocked?.[0] ?? tt("rewards.notEnoughPoints")}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// -- Offer Card (horizontal scroll) -------------------------------------------

function OfferCard({
  item,
  lang,
  globalTierNameMap,
  token,
}: {
  item: OfferData;
  lang: "pl" | "en";
  globalTierNameMap: Map<string, string>;
  token: string | null;
}) {
  const tt = (key: string) => t(lang, key);
  const [imageError, setImageError] = useState(false);
  const discount = item.discountPercent
    ? `-${item.discountPercent}%`
    : item.discountFixed
      ? `-${item.discountFixed} PLN`
      : null;

  return (
    <View style={styles.offerCard}>
      {item.imageUrl && !imageError ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.offerImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
          accessibilityLabel={item.name}
        />
      ) : (
        <LinearGradient
          colors={[loyal.lightPrimaryFaint, loyal.contentBg]}
          style={styles.offerImage}
        >
          <Icon name="pricetag" size={28} color={loyal.primary} />
        </LinearGradient>
      )}

      {/* Featured badge */}
      {item.featured && (
        <View style={styles.offerFeaturedBadge}>
          <Icon name="star" size={10} color={loyal.white} />
        </View>
      )}

      {/* Discount badge */}
      {discount && (
        <View style={styles.offerDiscountBadge}>
          <Text style={styles.offerDiscountText}>{discount}</Text>
        </View>
      )}

      <View style={styles.offerContent}>
        <Text style={styles.offerName} numberOfLines={2}>{item.name}</Text>

        {item.description && (
          <Text style={styles.offerDesc} numberOfLines={2}>{item.description}</Text>
        )}

        {item.validUntil && (
          <Text style={styles.offerValidUntil}>
            {tt("offers.validUntil")}: {new Date(item.validUntil).toLocaleDateString(lang === "en" ? "en-GB" : "pl-PL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
          </Text>
        )}

        {item.minGlobalTierSlug && (
          <View style={styles.offerTierBadge}>
            <Icon
              name={item.isUnlocked ? "lock-open" : "lock-closed"}
              size={10}
              color={item.isUnlocked ? loyal.success : loyal.lightTextMuted}
            />
            <Text
              style={[
                styles.offerTierText,
                { color: item.isUnlocked ? loyal.success : loyal.lightTextMuted },
              ]}
              numberOfLines={1}
            >
              {tt("offers.tierRequired").replace("{tier}", globalTierNameMap.get(item.minGlobalTierSlug!) ?? item.minGlobalTierSlug!.charAt(0).toUpperCase() + item.minGlobalTierSlug!.slice(1))}
            </Text>
          </View>
        )}

        {item.isUnlocked && item.bookingUrl ? (
          <Pressable
            style={styles.offerBookBtn}
            onPress={() => {
              const url = item.bookingUrl!;
              // Block dangerous URI schemes (javascript:, data:, vbscript:)
              if (!/^https?:\/\//i.test(url)) return;
              if (token) trackOfferClick(token, item.id);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(url);
            }}
            accessibilityRole="link"
            accessibilityLabel={`${tt("offers.bookNow")} ${item.name}`}
          >
            <Text style={styles.offerBookBtnText}>{tt("offers.bookNow")}</Text>
          </Pressable>
        ) : !item.isUnlocked ? (
          <View style={styles.offerLockedBtn}>
            <Icon name="lock-closed" size={12} color={loyal.lightTextMuted} />
            <Text style={styles.offerLockedText}>{tt("offers.locked")}</Text>
          </View>
        ) : null}

        {item.isUnlocked && item.promoCode && (
          <View style={styles.promoCodeRow}>
            <Text style={styles.promoCodeLabel}>{tt("offers.promoCode")}:</Text>
            <Text style={styles.promoCodeValue}>{item.promoCode}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// -- Main Screen ---------------------------------------------------------------

function RewardsScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const tt = (key: string) => t(lang, key);
  const token = useAppStore((s) => s.token);
  const queryClient = useQueryClient();

  // Fetch exclusive offers
  const { data: offers = [], refetch: refetchOffers, isRefetching: isRefetchingOffers, isError: isOffersError } = useQuery<OfferData[]>({
    queryKey: ["offers", token],
    queryFn: async () => {
      const res = await fetchOffers(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load offers");
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch rewards list
  const { data: rewards = [], refetch: refetchRewards, isRefetching: isRefetchingRewards, isError: isRewardsError } = useQuery<RewardData[]>({
    queryKey: ["rewards", token],
    queryFn: async () => {
      const res = await fetchRewards(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load rewards");
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch portal data for points balance
  const { data: portalData, refetch: refetchPortal, isRefetching: isRefetchingPortal, isError: isPortalError } = useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const res = await fetchPortalData(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load portal data");
      return res.data;
    },
    enabled: !!token,
  });

  const isRefetching = isRefetchingRewards || isRefetchingPortal || isRefetchingOffers;
  const pointsBalance = portalData?.member?.availablePoints ?? 0;

  const globalTierNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (portalData?.globalTiers) {
      for (const gt of portalData.globalTiers) {
        map.set(gt.slug, lang === "en" && gt.nameEn ? gt.nameEn : gt.name);
      }
    }
    return map;
  }, [portalData?.globalTiers, lang]);

  const refetch = useCallback(() => {
    refetchRewards();
    refetchPortal();
    refetchOffers();
  }, [refetchRewards, refetchPortal, refetchOffers]);

  const redeemMutation = useMutation<
    {
      redemption: {
        id: string;
        rewardId: string;
        rewardName: string;
        pointsSpent: number;
        status: string;
        redemptionCode?: string | null;
        createdAt: string;
      };
      updatedBalance: number;
    },
    Error,
    string
  >({
    mutationFn: async (rewardId: string) => {
      const res = await redeemReward(token!, rewardId);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Redeem failed");
      return res.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["rewards", token] });
      queryClient.invalidateQueries({ queryKey: ["portal", token] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        tt("rewards.success"),
        result.redemption.redemptionCode
          ? `${tt("rewards.code")}: ${result.redemption.redemptionCode}`
          : tt("rewards.redeemed"),
      );
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(tt("common.error"), String(err.message ?? tt("rewards.redeemError")));
    },
  });

  const handleRedeem = useCallback(
    (reward: RewardData) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const remaining = pointsBalance - reward.pointsCost;

      Alert.alert(
        tt("rewards.confirmTitle"),
        `${reward.name}\n\n${tt("rewards.cost")}: ${reward.pointsCost} pkt\n${tt("rewards.remaining")}: ${remaining} pkt`,
        [
          { text: tt("common.cancel"), style: "cancel" },
          {
            text: tt("rewards.redeem"),
            onPress: () => redeemMutation.mutate(reward.id),
          },
        ],
      );
    },
    [pointsBalance, tt, redeemMutation],
  );

  const renderHeader = () => (
    <View>
      {/* Exclusive Offers horizontal scroll */}
      <View style={styles.offersSection}>
        <Text style={styles.offersSectionTitle}>{tt("offers.title")}</Text>
        {offers.length > 0 ? (
          <FlatList
            data={offers}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => <OfferCard item={item} lang={lang} globalTierNameMap={globalTierNameMap} token={token} />}
            contentContainerStyle={styles.offersListContent}
          />
        ) : !isRefetchingOffers ? (
          <View style={styles.offersEmptyState}>
            <Icon name="pricetag-outline" size={32} color={loyal.lightTextMuted} />
            <Text style={styles.offersEmptyText}>{tt("offers.noOffers")}</Text>
            <Text style={styles.offersEmptyDesc}>{tt("offers.noOffersDesc")}</Text>
          </View>
        ) : null}
      </View>

      {/* Points balance */}
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>{tt("rewards.yourPoints")}</Text>
        <Text style={styles.balanceValue}>{pointsBalance}</Text>
        <Text style={styles.balanceUnit}>pkt</Text>
      </View>

      {/* Empty state when no rewards AND no offers */}
      {rewards.length === 0 && (
        <View style={styles.emptyState}>
          <Icon name="gift-outline" size={48} color={loyal.lightTextMuted} />
          <Text style={styles.emptyTitle}>{tt("rewards.empty")}</Text>
          <Text style={styles.emptyDesc}>{tt("rewards.emptyDesc")}</Text>
        </View>
      )}
    </View>
  );

  const isError = isOffersError || isRewardsError || isPortalError;

  if (isError) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <Icon name="alert-circle-outline" size={48} color={loyal.lightTextMuted} />
        <Text style={{ color: loyal.lightText, fontSize: fontSize.base, marginTop: spacing.md, textAlign: "center" }}>
          {tt("common.error")}
        </Text>
        <Pressable
          onPress={refetch}
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
        data={rewards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <RewardCard
            item={item}
            pointsBalance={pointsBalance}
            onRedeem={handleRedeem}
            isRedeeming={redeemMutation.isPending}
            lang={lang}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={loyal.primary}
          />
        }
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing["4xl"],
        }}
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

  // -- Balance Header ---------------------------------------------------------
  balanceHeader: {
    alignItems: "center",
    paddingVertical: spacing["2xl"],
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextSecondary,
  },
  balanceValue: {
    fontSize: fontSize["4xl"],
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    marginTop: spacing.xs,
  },
  balanceUnit: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextMuted,
  },

  // -- Grid -------------------------------------------------------------------
  columnWrapper: {
    gap: spacing.md,
  },

  // -- Reward Card ------------------------------------------------------------
  rewardCard: {
    flex: 1,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    overflow: "hidden",
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  rewardImage: {
    width: "100%",
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  rewardName: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
    lineHeight: 18,
  },
  rewardDesc: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    lineHeight: 16,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: loyal.lightPrimaryFaint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  categoryText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.primary,
  },
  rewardCost: {
    fontSize: fontSize.base,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    marginTop: spacing.xxs,
  },

  redeemBtn: {
    backgroundColor: loyal.success,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  redeemBtnDisabled: {
    opacity: 0.5,
  },
  redeemBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_700Bold",
    color: loyal.white,
  },
  lockedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: loyal.lightInputBg,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  lockedBtnText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextMuted,
  },

  // -- Offers Section ---------------------------------------------------------
  offersSection: {
    marginBottom: spacing.lg,
  },
  offersSectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    marginBottom: spacing.md,
  },
  offersListContent: {
    gap: spacing.md,
  },

  // -- Offer Card -------------------------------------------------------------
  offerCard: {
    width: 200,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    overflow: "hidden",
    ...shadow.sm,
  },
  offerImage: {
    width: "100%",
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  offerFeaturedBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: loyal.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  offerDiscountBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: loyal.success,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  offerDiscountText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_700Bold",
    color: loyal.white,
  },
  offerContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  offerName: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
    lineHeight: 18,
  },
  offerTierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    alignSelf: "flex-start",
    backgroundColor: loyal.lightPrimaryFaint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  offerTierText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  offerBookBtn: {
    backgroundColor: loyal.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  offerBookBtnText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_700Bold",
    color: loyal.white,
  },
  offerLockedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: loyal.lightInputBg,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    minHeight: TOUCH_TARGET,
  },
  offerLockedText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextMuted,
  },
  offerDesc: {
    fontSize: fontSize.xs,
    color: loyal.lightTextMuted,
    fontFamily: "Inter_400Regular",
    marginBottom: spacing.xs,
    lineHeight: fontSize.xs * 1.4,
  },
  offerValidUntil: {
    fontSize: 10,
    color: loyal.lightTextMuted,
    fontFamily: "Inter_400Regular",
    marginBottom: spacing.xs,
  },
  promoCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${loyal.bgDark}15`,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  promoCodeLabel: {
    fontSize: fontSize.xs,
    color: loyal.lightTextMuted,
    fontFamily: "Inter_400Regular",
  },
  promoCodeValue: {
    fontSize: fontSize.xs,
    color: loyal.primary,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },

  // -- Offers Empty State -----------------------------------------------------
  offersEmptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  offersEmptyText: {
    fontSize: fontSize.sm,
    color: loyal.lightText,
    fontFamily: "Inter_600SemiBold",
    marginTop: spacing.sm,
  },
  offersEmptyDesc: {
    fontSize: fontSize.xs,
    color: loyal.lightTextMuted,
    fontFamily: "Inter_400Regular",
    marginTop: spacing.xs,
  },

  // -- Empty State ------------------------------------------------------------
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing["4xl"],
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});

export default function RewardsScreen() {
  return (
    <ErrorBoundary>
      <RewardsScreenInner />
    </ErrorBoundary>
  );
}
