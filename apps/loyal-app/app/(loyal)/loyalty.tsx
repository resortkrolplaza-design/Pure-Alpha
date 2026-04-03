// =============================================================================
// Loyal App -- Loyalty Tab
// Scratch cards, tier, points, challenges, badges, transaction history
// =============================================================================

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  fetchPortalData,
  fetchScratchCards,
  fetchHistory,
  scratchCard,
  fetchChallenges,
  fetchBadges,
} from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type {
  PortalData,
  ScratchCardData,
  TransactionData,
  ChallengeData,
  BadgeData,
} from "@/lib/types";

// -- Scratch Card Component ---------------------------------------------------

function ScratchCardItem({
  card,
  onReveal,
  lang,
}: {
  card: ScratchCardData;
  onReveal: (id: string) => void;
  lang: "pl" | "en";
}) {
  const isRevealed = card.status !== "AVAILABLE";
  return (
    <View style={styles.scratchCard}>
      {isRevealed ? (
        <View style={styles.scratchRevealed}>
          <Icon name="trophy" size={28} color={loyal.primary} />
          <Text style={styles.scratchPrize}>{card.prizeDescription ?? "--"}</Text>
          {card.prizeValue != null && card.prizeValue > 0 && (
            <Text style={styles.scratchPoints}>+{card.prizeValue} pkt</Text>
          )}
        </View>
      ) : (
        <Pressable
          style={styles.scratchOverlay}
          onPress={() => onReveal(card.id)}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "scratch.tapToScratch")}
        >
          <Icon name="sparkles" size={28} color={loyal.bg} />
          <Text style={styles.scratchBtnText}>{t(lang, "scratch.tapToScratch")}</Text>
        </Pressable>
      )}
    </View>
  );
}

// -- Challenge Card -----------------------------------------------------------

function ChallengeCard({ item, lang }: { item: ChallengeData; lang: "pl" | "en" }) {
  const progress = item.targetValue > 0 ? Math.min(item.currentValue / item.targetValue, 1) : 0;
  const daysLeft = item.endDate
    ? Math.max(0, Math.ceil((new Date(item.endDate).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <View style={styles.challengeCard}>
      <View style={styles.challengeHeader}>
        <Text style={styles.challengeName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.challengeReward}>+{item.rewardPoints} pkt</Text>
      </View>
      {item.description && (
        <Text style={styles.challengeDesc} numberOfLines={2}>{item.description}</Text>
      )}
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.challengeFooter}>
        <Text style={styles.challengeProgress}>
          {item.currentValue}/{item.targetValue}
        </Text>
        {daysLeft != null && (
          <Text style={styles.challengeDays}>
            {daysLeft} {lang === "pl" ? "dni" : "days"}
          </Text>
        )}
      </View>
    </View>
  );
}

// -- Badge Item ---------------------------------------------------------------

function BadgeItem({ item }: { item: BadgeData }) {
  const earned = item.isEarned;
  return (
    <View style={[styles.badgeItem, !earned && styles.badgeLocked]}>
      <View style={[styles.badgeIconWrap, earned ? styles.badgeIconEarned : styles.badgeIconGrey]}>
        <Icon name={(item.icon as any) ?? "medal"} size={24} color={earned ? loyal.primary : loyal.lightTextMuted} />
      </View>
      <Text style={[styles.badgeName, !earned && styles.badgeNameLocked]} numberOfLines={2}>
        {item.name}
      </Text>
    </View>
  );
}

// -- Transaction Item ---------------------------------------------------------

function TransactionItem({ item }: { item: TransactionData }) {
  const isEarn = item.type === "EARN";
  const isRedeem = item.type === "REDEEM";
  const iconName = isEarn ? "arrow-up-circle" : isRedeem ? "arrow-down-circle" : "time-outline";
  const color = isEarn ? loyal.success : isRedeem ? loyal.danger : loyal.lightTextMuted;
  const sign = isEarn ? "+" : isRedeem ? "-" : "";

  return (
    <View style={styles.transactionRow}>
      <Icon name={iconName as any} size={24} color={color} />
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionDesc} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.transactionDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <Text style={[styles.transactionPoints, { color }]}>
        {sign}{item.points}
      </Text>
    </View>
  );
}

// -- Main Screen ---------------------------------------------------------------

function LoyaltyScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const tt = (key: string) => t(lang, key);
  const token = useAppStore((s) => s.token);

  const [txPage, setTxPage] = useState(0);
  const [allTx, setAllTx] = useState<TransactionData[]>([]);

  // -- Queries ----------------------------------------------------------------
  const { data: portalData, refetch: refetchPortal, isRefetching: isRefetchingPortal } = useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const res = await fetchPortalData(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load portal data");
      return res.data;
    },
    enabled: !!token,
  });

  const { data: scratchCards, refetch: refetchCards } = useQuery<ScratchCardData[]>({
    queryKey: ["scratchCards", token],
    queryFn: async () => {
      const res = await fetchScratchCards(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load scratch cards");
      return res.data;
    },
    enabled: !!token,
  });

  const { data: txData, refetch: refetchTx, isFetching: isFetchingTx } = useQuery<{ transactions: TransactionData[]; hasMore: boolean; total: number }>({
    queryKey: ["transactions", token, txPage],
    queryFn: async () => {
      const res = await fetchHistory(token!, txPage);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load history");
      return res.data;
    },
    enabled: !!token,
  });

  const { data: challengesData, refetch: refetchChallenges } = useQuery<ChallengeData[]>({
    queryKey: ["challenges", token],
    queryFn: async () => {
      const res = await fetchChallenges(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load challenges");
      return res.data;
    },
    enabled: !!token,
  });

  const { data: badgesData, refetch: refetchBadges } = useQuery<BadgeData[]>({
    queryKey: ["badges", token],
    queryFn: async () => {
      const res = await fetchBadges(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load badges");
      return res.data;
    },
    enabled: !!token,
  });

  // Merge paginated transactions
  useEffect(() => {
    if (txData?.transactions) {
      setAllTx((prev) => {
        if (txPage === 0) return txData.transactions;
        const existingIds = new Set(prev.map((tx) => tx.id));
        const newItems = txData.transactions.filter((tx) => !existingIds.has(tx.id));
        return [...prev, ...newItems];
      });
    }
  }, [txData, txPage]);

  const handleRefresh = useCallback(() => {
    setTxPage(0);
    refetchPortal();
    refetchCards();
    refetchTx();
    refetchChallenges();
    refetchBadges();
  }, [refetchPortal, refetchCards, refetchTx, refetchChallenges, refetchBadges]);

  const handleRevealCard = useCallback(async (cardId: string) => {
    if (!token) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await scratchCard(token, cardId);
    if (res.status !== "success") {
      // Silently fail -- card will remain unscratched
    }
    refetchCards();
  }, [token, refetchCards]);

  const handleLoadMore = useCallback(() => {
    if (txData?.hasMore && !isFetchingTx) {
      setTxPage((p) => p + 1);
    }
  }, [txData?.hasMore, isFetchingTx]);

  // -- Render -----------------------------------------------------------------

  const member = portalData?.member;
  const tier = portalData?.tier;
  const nextTier = portalData?.nextTier;
  const expiringPoints = portalData?.expiringPoints;
  const challenges = challengesData ?? [];
  const badges = badgesData ?? [];
  const cards = scratchCards ?? [];

  // Compute tier progress toward next tier
  const tierProgress = useMemo(() => {
    if (!nextTier) return 0;
    const target = nextTier.minPoints;
    if (target > 0) return Math.min((member?.availablePoints ?? 0) / target, 1);
    return 0;
  }, [nextTier, member?.availablePoints]);

  const renderHeader = () => (
    <View style={{ gap: spacing.xl }}>
      {/* Scratch Cards */}
      {cards.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{tt("loyalty.scratchCards")}</Text>
          <FlatList
            data={cards}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <ScratchCardItem card={item} onReveal={handleRevealCard} lang={lang} />
            )}
            contentContainerStyle={styles.horizontalList}
          />
        </View>
      )}

      {/* Current Tier */}
      {tier && (
        <View style={styles.tierCard}>
          <View style={styles.tierHeader}>
            <Icon name="shield-checkmark" size={24} color={loyal.primary} />
            <Text style={styles.tierName}>{tier.name}</Text>
          </View>
          <View style={styles.tierDetails}>
            {tier.multiplier != null && (
              <View style={styles.tierDetail}>
                <Text style={styles.tierDetailLabel}>{tt("loyalty.multiplier")}</Text>
                <Text style={styles.tierDetailValue}>{tier.multiplier}x</Text>
              </View>
            )}
            {tier.discountPercent != null && (
              <View style={styles.tierDetail}>
                <Text style={styles.tierDetailLabel}>{tt("loyalty.discount")}</Text>
                <Text style={styles.tierDetailValue}>{tier.discountPercent}%</Text>
              </View>
            )}
          </View>
          {/* Progress to next tier */}
          {nextTier && (
            <View style={styles.nextTierSection}>
              <Text style={styles.nextTierLabel}>
                {tt("loyalty.nextTier")}: {nextTier.name}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(tierProgress * 100)}%` },
                  ]}
                />
              </View>
              {nextTier.minPoints > 0 && (
                <Text style={styles.tierCriteria}>
                  {member?.availablePoints ?? 0} / {nextTier.minPoints} {tt("stay.points")}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Points Summary */}
      {member && (
        <View style={styles.pointsRow}>
          <View style={styles.pointCard}>
            <Text style={styles.pointValue}>{member.availablePoints ?? 0}</Text>
            <Text style={styles.pointLabel}>{tt("loyalty.available")}</Text>
          </View>
          <View style={styles.pointCard}>
            <Text style={styles.pointValue}>{member.lifetimePoints ?? 0}</Text>
            <Text style={styles.pointLabel}>{tt("loyalty.lifetime")}</Text>
          </View>
          <View style={styles.pointCard}>
            <Text style={styles.pointValue}>{member.pendingPoints ?? 0}</Text>
            <Text style={styles.pointLabel}>{tt("loyalty.pending")}</Text>
          </View>
        </View>
      )}

      {/* Expiry Warning */}
      {expiringPoints != null && expiringPoints.totalPoints > 0 && (
        <View style={styles.expiryWarning}>
          <Icon name="warning" size={18} color={loyal.warning} />
          <Text style={styles.expiryText}>
            {tt("loyalty.expiringWarning").replace("{n}", String(expiringPoints.totalPoints))}
          </Text>
        </View>
      )}

      {/* Challenges */}
      {challenges.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{tt("loyalty.challenges")}</Text>
          {challenges.map((ch) => (
            <ChallengeCard key={ch.id} item={ch} lang={lang} />
          ))}
        </View>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>{tt("loyalty.badges")}</Text>
          <FlatList
            data={badges}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => <BadgeItem item={item} />}
            contentContainerStyle={styles.horizontalList}
          />
        </View>
      )}

      {/* Transaction History Header */}
      {allTx.length > 0 && (
        <Text style={styles.sectionTitle}>{tt("loyalty.history")}</Text>
      )}
    </View>
  );

  const renderFooter = () => {
    if (isFetchingTx && txPage > 0) {
      return (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator color={loyal.primary} />
        </View>
      );
    }
    if (txData?.hasMore) {
      return (
        <Pressable
          style={styles.loadMoreBtn}
          onPress={handleLoadMore}
          accessibilityRole="button"
          accessibilityLabel={tt("loyalty.loadMore")}
        >
          <Text style={styles.loadMoreText}>{tt("loyalty.loadMore")}</Text>
        </Pressable>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={allTx}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        renderItem={({ item }) => <TransactionItem item={item} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingPortal}
            onRefresh={handleRefresh}
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

  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
    marginBottom: spacing.md,
  },
  horizontalList: {
    gap: spacing.md,
  },

  // -- Scratch Cards ----------------------------------------------------------
  scratchCard: {
    width: 140,
    height: 160,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.md,
  },
  scratchOverlay: {
    flex: 1,
    backgroundColor: loyal.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  scratchBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.bg,
  },
  scratchRevealed: {
    flex: 1,
    backgroundColor: loyal.lightCard,
    borderWidth: 2,
    borderColor: loyal.primary,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
  },
  scratchPrize: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
    textAlign: "center",
  },
  scratchPoints: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
  },

  // -- Tier -------------------------------------------------------------------
  tierCard: {
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.sm,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  tierName: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.lightText,
  },
  tierDetails: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  tierDetail: {
    gap: spacing.xxs,
  },
  tierDetailLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
  },
  tierDetailValue: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
  },
  nextTierSection: {
    gap: spacing.sm,
  },
  nextTierLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextSecondary,
  },
  tierCriteria: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextMuted,
  },

  // -- Points -----------------------------------------------------------------
  pointsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pointCard: {
    flex: 1,
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.md,
    alignItems: "center",
    ...shadow.sm,
  },
  pointValue: {
    fontSize: fontSize.xl,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
  },
  pointLabel: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    marginTop: spacing.xxs,
  },

  // -- Expiry Warning ---------------------------------------------------------
  expiryWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  expiryText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: "Inter_500Medium",
    color: loyal.warning,
    lineHeight: 18,
  },

  // -- Challenges -------------------------------------------------------------
  challengeCard: {
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  challengeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  challengeName: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightText,
  },
  challengeReward: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
    marginLeft: spacing.sm,
  },
  challengeDesc: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextSecondary,
    lineHeight: 18,
  },
  progressTrack: {
    height: 6,
    backgroundColor: loyal.lightProgressTrack,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: loyal.primary,
    borderRadius: 3,
  },
  challengeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  challengeProgress: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.lightTextSecondary,
  },
  challengeDays: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextMuted,
  },

  // -- Badges -----------------------------------------------------------------
  badgeItem: {
    width: 80,
    alignItems: "center",
    gap: spacing.xs,
  },
  badgeLocked: {
    opacity: 0.5,
  },
  badgeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIconEarned: {
    backgroundColor: loyal.lightPrimaryFaint,
    borderWidth: 2,
    borderColor: loyal.primary,
  },
  badgeIconGrey: {
    backgroundColor: loyal.lightInputBg,
    borderWidth: 1,
    borderColor: loyal.lightInputBorder,
  },
  badgeName: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_500Medium",
    color: loyal.lightText,
    textAlign: "center",
  },
  badgeNameLocked: {
    color: loyal.lightTextMuted,
  },

  // -- Transactions -----------------------------------------------------------
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: loyal.lightCardBorder,
    minHeight: TOUCH_TARGET,
  },
  transactionInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  transactionDesc: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: loyal.lightText,
  },
  transactionDate: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.lightTextMuted,
  },
  transactionPoints: {
    fontSize: fontSize.base,
    fontFamily: "Inter_700Bold",
  },

  // -- Load More --------------------------------------------------------------
  loadMoreContainer: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  loadMoreBtn: {
    alignSelf: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: loyal.lightPrimaryFaint,
    borderRadius: radius.full,
    marginTop: spacing.lg,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
  },
});

export default function LoyaltyScreen() {
  return (
    <ErrorBoundary>
      <LoyaltyScreenInner />
    </ErrorBoundary>
  );
}
