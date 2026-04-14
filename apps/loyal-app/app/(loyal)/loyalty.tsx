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
  Alert,
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
  claimScratchCard,
  fetchChallenges,
  fetchBadges,
  type HistoryApiResponse,
} from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type {
  PortalData,
  ScratchCardData,
  TransactionData,
  ChallengeData,
  BadgeData,
} from "@/lib/types";
import { deriveScratchCardStatus } from "@/lib/types";

// -- Scratch Card Component ---------------------------------------------------

function ScratchCardItem({
  card,
  onReveal,
  lang,
  pointsName,
}: {
  card: ScratchCardData;
  onReveal: (id: string) => void;
  lang: "pl" | "en";
  pointsName: string;
}) {
  const status = deriveScratchCardStatus(card);
  const isRevealed = status !== "AVAILABLE";
  return (
    <View style={styles.scratchCard}>
      {isRevealed ? (
        <View style={styles.scratchRevealed}>
          <Icon name="trophy" size={28} color={loyal.primary} />
          <Text style={styles.scratchPrize}>{card.prizeLabel ?? "--"}</Text>
          {card.prizeValue != null && card.prizeValue > 0 && (
            <Text style={styles.scratchPoints}>+{card.prizeValue} {pointsName}</Text>
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

function ChallengeCard({ item, lang, pointsName }: { item: ChallengeData; lang: "pl" | "en"; pointsName: string }) {
  const currentValue = item.progress?.currentValue ?? 0;
  const isCompleted = !!item.progress?.completedAt;
  const progressRatio = item.targetValue > 0 ? Math.min(currentValue / item.targetValue, 1) : 0;
  const daysLeft = item.endDate
    ? Math.max(0, Math.ceil((new Date(item.endDate).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <View style={[styles.challengeCard, isCompleted && { opacity: 0.6 }]}>
      <View style={styles.challengeHeader}>
        <Text style={styles.challengeName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.challengeReward}>+{item.rewardPoints} {pointsName}</Text>
      </View>
      {item.description && (
        <Text style={styles.challengeDesc} numberOfLines={2}>{item.description}</Text>
      )}
      {/* Progress bar */}
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel={`${Math.round(progressRatio * 100)}%`}
        accessibilityValue={{ min: 0, max: item.targetValue, now: currentValue }}
      >
        <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
      </View>
      <View style={styles.challengeFooter}>
        <Text style={styles.challengeProgress}>
          {currentValue}/{item.targetValue}
        </Text>
        {daysLeft != null && !isCompleted && (
          <Text style={styles.challengeDays}>
            {t(lang, "challenge.daysLeftN").replace("{n}", String(daysLeft))}
          </Text>
        )}
      </View>
    </View>
  );
}

// -- Badge Item ---------------------------------------------------------------

function BadgeItem({ item }: { item: BadgeData }) {
  const earned = item.isEarned;
  // Use emoji as display icon if available, otherwise fall back to generic icon
  const displayLabel = item.emoji ?? null;
  return (
    <View style={[styles.badgeItem, !earned && styles.badgeLocked]}>
      <View style={[styles.badgeIconWrap, earned ? styles.badgeIconEarned : styles.badgeIconGrey]}>
        {displayLabel ? (
          <Text style={{ fontSize: 24 }}>{displayLabel}</Text>
        ) : (
          <Icon name="medal" size={24} color={earned ? loyal.primary : loyal.lightTextMuted} />
        )}
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
        <Text style={styles.transactionDesc} numberOfLines={1}>{item.description || item.type}</Text>
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
  const [revealingCardId, setRevealingCardId] = useState<string | null>(null);

  // -- Queries ----------------------------------------------------------------
  const { data: portalData, refetch: refetchPortal, isRefetching: isRefetchingPortal, isError: isPortalError, isLoading: isPortalLoading } = useQuery<PortalData>({
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

  const { data: txData, refetch: refetchTx, isFetching: isFetchingTx } = useQuery<{
    transactions: TransactionData[];
    hasMore: boolean;
    total: number;
  }>({
    queryKey: ["transactions", token, txPage],
    queryFn: async () => {
      const res = await fetchHistory(token!, txPage);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load history");
      const pagination = res.pagination;
      const currentPage = pagination?.page ?? 1;
      const totalPages = pagination?.totalPages ?? 1;
      return {
        transactions: res.data,
        hasMore: currentPage < totalPages,
        total: pagination?.total ?? res.data.length,
      };
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
      const { earned, available } = res.data;
      // Combine earned + available into a single BadgeData[] with isEarned flag
      const earnedBadges: BadgeData[] = (earned ?? []).map((b) => ({
        id: b.badgeId ?? b.id,
        name: b.name,
        description: b.description,
        iconUrl: b.iconUrl,
        emoji: b.emoji,
        category: b.category,
        isEarned: true,
        earnedAt: b.earnedAt,
      }));
      const availableBadges: BadgeData[] = (available ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        iconUrl: b.iconUrl,
        emoji: b.emoji,
        category: b.category,
        isEarned: false,
        earnedAt: null,
      }));
      return [...earnedBadges, ...availableBadges];
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
    if (!token || revealingCardId) return;
    setRevealingCardId(cardId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await scratchCard(token, cardId);
      if (res.status !== "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(tt("common.error"), res.errorMessage ?? tt("common.retry"));
      } else if (res.data && res.data.prizeType !== "NONE") {
        // Auto-claim the prize after a winning scratch
        try {
          await claimScratchCard(token, cardId);
        } catch {
          // Claim failed silently -- user can retry via the card UI
        }
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(tt("common.error"), tt("common.retry"));
    } finally {
      setRevealingCardId(null);
      refetchCards();
      refetchPortal();
    }
  }, [token, revealingCardId, refetchCards, refetchPortal, tt]);

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
  const program = portalData?.program;
  const challenges = challengesData ?? [];
  const badges = badgesData ?? [];
  const cards = scratchCards ?? [];

  // Parse earning rules from program data
  const earningRules = useMemo(() => {
    if (!program?.earningRules || typeof program.earningRules !== "object") return null;
    return program.earningRules as Record<string, number>;
  }, [program?.earningRules]);

  // Parse tier benefits
  const tierBenefits = useMemo(() => {
    if (!tier?.benefits) return [];
    if (Array.isArray(tier.benefits)) return tier.benefits as string[];
    return [];
  }, [tier?.benefits]);

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
              <ScratchCardItem card={item} onReveal={handleRevealCard} lang={lang} pointsName={portalData?.program?.pointsName ?? "pkt"} />
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
          {/* Tier Benefits */}
          {tierBenefits.length > 0 && (
            <View style={styles.tierBenefitsSection}>
              <Text style={styles.tierBenefitsLabel}>{tt("loyalty.tierBenefits")}</Text>
              {tierBenefits.map((benefit, idx) => (
                <View key={idx} style={styles.benefitRow}>
                  <Icon name="checkmark-circle" size={16} color={loyal.primary} />
                  <Text style={styles.benefitText}>{String(benefit)}</Text>
                </View>
              ))}
            </View>
          )}
          {/* Progress to next tier */}
          {nextTier && (
            <View style={styles.nextTierSection}>
              <Text style={styles.nextTierLabel}>
                {tt("loyalty.nextTier")}: {nextTier.name}
              </Text>
              <View
                style={styles.progressTrack}
                accessibilityRole="progressbar"
                accessibilityLabel={`${Math.round(tierProgress * 100)}%`}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(tierProgress * 100) }}
              >
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(tierProgress * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.tierProgressPct}>
                {Math.round(tierProgress * 100)}%
              </Text>
              {nextTier.minPoints > 0 && (
                <Text style={styles.tierCriteria}>
                  {member?.availablePoints ?? 0} / {nextTier.minPoints} {tt("stay.points")}
                </Text>
              )}
              {nextTier.minSpent != null && (
                <Text style={styles.tierCriteria}>
                  {tt("loyalty.spent")}: {member?.totalSpent ?? 0} / {nextTier.minSpent} {portalData?.program?.currency ?? "PLN"}
                </Text>
              )}
              {nextTier.minStays != null && (
                <Text style={styles.tierCriteria}>
                  {tt("loyalty.stays")}: {member?.totalStays ?? 0} / {nextTier.minStays}
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
            <ChallengeCard key={ch.id} item={ch} lang={lang} pointsName={portalData?.program?.pointsName ?? "pkt"} />
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

      {/* Earning Rules */}
      {earningRules && Object.keys(earningRules).length > 0 && (
        <View style={styles.earningRulesCard}>
          <Text style={styles.sectionTitle}>{tt("loyalty.earningRules")}</Text>
          {Object.entries(earningRules).map(([key, value]) => {
            const iconMap: Record<string, import("@/lib/icons").IconName> = {
              stay: "bed-outline",
              spend: "wallet-outline",
              review: "chatbubble-ellipses-outline",
              referral: "people-outline",
              booking: "calendar-outline",
              signup: "person-add-outline",
              checkin: "log-in-outline",
              checkout: "log-out-outline",
            };
            const labelKey = `loyalty.earningRule.${key}`;
            const label = tt(labelKey);
            return (
              <View key={key} style={styles.earningRuleRow}>
                <View style={styles.earningRuleIconWrap}>
                  <Icon
                    name={iconMap[key] ?? "ellipse-outline"}
                    size={18}
                    color={loyal.primary}
                  />
                </View>
                <Text style={styles.earningRuleLabel}>{label}</Text>
                <Text style={styles.earningRulePoints}>+{value} {portalData?.program?.pointsName ?? "pkt"}</Text>
              </View>
            );
          })}
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

  if (isPortalLoading && !portalData) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={loyal.primary} />
      </View>
    );
  }

  if (isPortalError) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <Icon name="alert-circle-outline" size={48} color={loyal.lightTextMuted} />
        <Text style={{ color: loyal.lightText, fontSize: fontSize.base, marginTop: spacing.md, textAlign: "center" }}>
          {tt("common.error")}
        </Text>
        <Pressable
          onPress={handleRefresh}
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
  tierProgressPct: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_600SemiBold",
    color: loyal.primary,
    textAlign: "right",
    marginTop: -spacing.xxs,
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

  // -- Tier Benefits ----------------------------------------------------------
  tierBenefitsSection: {
    gap: spacing.sm,
  },
  tierBenefitsLabel: {
    fontSize: fontSize.sm,
    fontFamily: "Inter_600SemiBold",
    color: loyal.lightTextSecondary,
    marginBottom: spacing.xxs,
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

  // -- Earning Rules ----------------------------------------------------------
  earningRulesCard: {
    backgroundColor: loyal.lightCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.lightCardBorder,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.sm,
  },
  earningRuleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  earningRuleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: loyal.lightPrimaryFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  earningRuleLabel: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: loyal.lightText,
  },
  earningRulePoints: {
    fontSize: fontSize.base,
    fontFamily: "Inter_700Bold",
    color: loyal.primary,
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
