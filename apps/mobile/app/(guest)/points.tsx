// =============================================================================
// Guest Portal -- Points Tab (Transactions, Challenges, Badges, Scratch Cards)
// =============================================================================

import React, { useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing, semantic } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { configureListAnimation } from "@/lib/animations";
import { t } from "@/lib/i18n";
import { useAppStore, useGuestStore } from "@/lib/store";
import { portalFetch } from "@/lib/api";
import type { Transaction, ChallengeWithProgress, BadgeEarned, BadgeAvailable } from "@/lib/types";

type Section = "history" | "challenges" | "badges";

export default function PointsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const portalToken = useAppStore((s) => s.portalToken);
  const member = useGuestStore((s) => s.member);
  const program = useGuestStore((s) => s.program);
  const [section, setSection] = useState<Section>("history");

  const handleSectionChange = (key: Section) => {
    configureListAnimation();
    setSection(key);
  };

  // P1-14: Destructure isError from all 3 queries
  const { data: transactions, isLoading: loadingTx, isError: errorTx, refetch: refetchTx } = useQuery({
    queryKey: ["transactions", portalToken],
    queryFn: async () => {
      if (!portalToken) return [];
      const res = await portalFetch<Transaction[]>(portalToken, "/history?limit=50");
      return (res.data as Transaction[]) ?? [];
    },
    enabled: !!portalToken,
  });

  const { data: challenges, isLoading: loadingCh, isError: errorCh, refetch: refetchCh } = useQuery({
    queryKey: ["challenges", portalToken],
    queryFn: async () => {
      if (!portalToken) return [];
      const res = await portalFetch<ChallengeWithProgress[]>(portalToken, "/challenges");
      return (res.data as ChallengeWithProgress[]) ?? [];
    },
    enabled: !!portalToken,
  });

  const { data: badgeData, isError: errorBadges, refetch: refetchBadges } = useQuery({
    queryKey: ["badges", portalToken],
    queryFn: async () => {
      if (!portalToken) return { earned: [], available: [] };
      const res = await portalFetch<{ earned: BadgeEarned[]; available: BadgeAvailable[] }>(portalToken, "/badges");
      return res.data ?? { earned: [], available: [] };
    },
    enabled: !!portalToken,
  });

  const SECTIONS: { key: Section; label: string }[] = [
    { key: "history", label: t(lang, "points.history") },
    { key: "challenges", label: t(lang, "points.challenges") },
    { key: "badges", label: t(lang, "points.badges") },
  ];

  // P1-13: Render item callbacks for FlatList
  const renderTransaction = useCallback(({ item: tx }: { item: Transaction }) => (
    <TransactionRow tx={tx} lang={lang} />
  ), [lang]);

  const renderChallenge = useCallback(({ item: c }: { item: ChallengeWithProgress }) => (
    <ChallengeCard challenge={c} lang={lang} pointsName={program?.pointsName ?? "pkt"} />
  ), [lang, program?.pointsName]);

  // Header component for the FlatList (points summary + tabs)
  const ListHeader = (
    <>
      {/* Points Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{(member?.availablePoints ?? 0).toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>{t(lang, "stay.availablePoints")}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{(member?.lifetimePoints ?? 0).toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>{t(lang, "stay.lifetimePoints")}</Text>
        </View>
      </View>

      {/* Section Tabs */}
      <View style={styles.tabs} accessibilityRole="tablist">
        {SECTIONS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.tab, section === s.key && styles.tabActive]}
            onPress={() => handleSectionChange(s.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === s.key }}
          >
            <Text style={[styles.tabText, section === s.key && styles.tabTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  // P1-14: Error + retry UI helper
  const ErrorRetry = ({ onRetry }: { onRetry: () => void }) => (
    <View style={styles.errorContainer}>
      <Text style={styles.emptyText}>{t(lang, "common.error")}</Text>
      <Pressable
        style={styles.retryBtn}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t(lang, "common.retry")}
      >
        <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
      </Pressable>
    </View>
  );

  // Badges section content (not a flat list, so rendered inline)
  const BadgesContent = () => {
    if (errorBadges) {
      return <ErrorRetry onRetry={() => refetchBadges()} />;
    }
    return (
      <View style={styles.section}>
        {badgeData?.earned.length ? (
          <>
            <Text style={styles.sectionLabel}>{t(lang, "points.earnedBadges")}</Text>
            <View style={styles.badgeGrid}>
              {badgeData.earned.map((b) => (
                <View key={b.id} style={styles.badge}>
                  <Icon name="ribbon" size={28} color={GOLD} />
                  <Text style={styles.badgeName}>{b.name}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        {badgeData?.available.length ? (
          <>
            <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>{t(lang, "points.availableBadges")}</Text>
            <View style={styles.badgeGrid}>
              {badgeData.available.map((b) => (
                <View key={b.id} style={[styles.badge, styles.badgeLocked]}>
                  <Icon name="ribbon-outline" size={28} color={guest.textMuted} />
                  <Text style={styles.badgeName}>{b.name}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        {!badgeData?.earned.length && !badgeData?.available.length && (
          <Text style={styles.emptyText}>{t(lang, "points.noBadges")}</Text>
        )}
      </View>
    );
  };

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      {/* P1-13: Use FlatList for transactions and challenges (50+ items), badges stays as-is */}
      {section === "history" ? (
        <FlatList
          data={transactions ?? []}
          renderItem={renderTransaction}
          keyExtractor={(tx) => tx.id}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            loadingTx ? (
              <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />
            ) : errorTx ? (
              <ErrorRetry onRetry={() => refetchTx()} />
            ) : (
              <Text style={styles.emptyText}>{t(lang, "points.noTransactions")}</Text>
            )
          }
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      ) : section === "challenges" ? (
        <FlatList
          data={challenges ?? []}
          renderItem={renderChallenge}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            loadingCh ? (
              <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />
            ) : errorCh ? (
              <ErrorRetry onRetry={() => refetchCh()} />
            ) : (
              <Text style={styles.emptyText}>{t(lang, "points.noChallenges")}</Text>
            )
          }
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        />
      ) : (
        // Badges tab: small number of items, FlatList not needed
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <>
              {ListHeader}
              <BadgesContent />
            </>
          }
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </LinearGradient>
  );
}

const TransactionRow = React.memo(function TransactionRow({ tx, lang }: { tx: Transaction; lang: "pl" | "en" }) {
  const isPositive = tx.points > 0;
  const sourceKey = `points.source.${tx.source}` as const;
  return (
    <View style={styles.txRow}>
      <View style={styles.txLeft}>
        <Text style={styles.txSource}>{t(lang, sourceKey)}</Text>
        {tx.description && <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>}
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txPoints, isPositive ? styles.txPositive : styles.txNegative]}>
          {isPositive ? "+" : ""}{tx.points}
        </Text>
        <Text style={styles.txDate}>
          {new Date(tx.createdAt).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", {
            day: "numeric", month: "short",
          })}
        </Text>
      </View>
    </View>
  );
});

const ChallengeCard = React.memo(function ChallengeCard({ challenge: c, lang, pointsName }: { challenge: ChallengeWithProgress; lang: "pl" | "en"; pointsName: string }) {
  const progress = c.progress?.currentValue ?? 0;
  const pct = c.targetValue > 0 ? Math.min(100, (progress / c.targetValue) * 100) : 0;
  const isComplete = c.progress?.completedAt != null;

  return (
    <View style={styles.challengeCard}>
      <View style={styles.challengeHeader}>
        <Text style={styles.challengeName}>{c.name}</Text>
        {isComplete && <Icon name="checkmark-circle" size={18} color={semantic.success} />}
      </View>
      {c.description && <Text style={styles.challengeDesc}>{c.description}</Text>}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.challengeFooter}>
        <Text style={styles.challengeProgress}>{progress} / {c.targetValue}</Text>
        <Text style={styles.challengeReward}>+{c.rewardPoints} {pointsName}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  summaryRow: { flexDirection: "row", gap: spacing.md },
  summaryCard: {
    flex: 1, backgroundColor: guest.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: guest.cardBorder, padding: spacing.lg, alignItems: "center", gap: 4,
  },
  summaryValue: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: GOLD },
  summaryLabel: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textSecondary, textAlign: "center" },
  tabs: { flexDirection: "row", gap: spacing.sm },
  tab: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.full,
    alignItems: "center", borderWidth: 1, borderColor: guest.glassBorder,
  },
  tabActive: { backgroundColor: GOLD, borderColor: GOLD },
  tabText: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: guest.textSecondary },
  tabTextActive: { color: NAVY, fontFamily: "Inter_600SemiBold" },
  section: { gap: spacing.md },
  sectionLabel: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: guest.textSecondary },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textMuted, textAlign: "center", paddingVertical: spacing["3xl"] },
  errorContainer: { alignItems: "center", gap: spacing.md, paddingVertical: spacing["3xl"] },
  retryBtn: {
    backgroundColor: GOLD, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, minHeight: 44,
    alignItems: "center", justifyContent: "center",
  },
  retryBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: NAVY },
  txRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: guest.card, borderRadius: radius.md, borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.lg,
  },
  txLeft: { flex: 1, gap: 2 },
  txSource: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: guest.text },
  txDesc: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted },
  txRight: { alignItems: "flex-end", gap: 2 },
  txPoints: { fontSize: fontSize.lg, fontFamily: "Inter_700Bold" },
  txPositive: { color: semantic.successLight },
  txNegative: { color: semantic.dangerLight },
  txDate: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted },
  challengeCard: {
    backgroundColor: guest.card, borderRadius: radius.lg, borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.lg, gap: spacing.sm,
  },
  challengeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  challengeName: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: guest.text, flex: 1 },
  challengeDesc: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textMuted, lineHeight: 18 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: guest.glassBorder, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: GOLD, borderRadius: 3 },
  challengeFooter: { flexDirection: "row", justifyContent: "space-between" },
  challengeProgress: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium", color: guest.textSecondary },
  challengeReward: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium", color: GOLD },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  badge: {
    width: 80, alignItems: "center", gap: 4,
    backgroundColor: guest.card, borderRadius: radius.md, borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.md,
  },
  badgeLocked: { opacity: 0.5 },
  badgeName: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium", color: guest.text, textAlign: "center" },
});
