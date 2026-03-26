// =============================================================================
// Guest Portal -- Rewards Tab (Catalog + Redeem)
// =============================================================================

import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing } from "@/lib/tokens";
import { t, type Lang } from "@/lib/i18n";
import { useAppStore, useGuestStore } from "@/lib/store";
import { portalFetch } from "@/lib/api";
import type { Reward } from "@/lib/types";

// P1-12: Map all blocking reasons to i18n keys
function getBlockReason(reasons: string[] | undefined, lang: Lang): string {
  if (!reasons?.length) return "";
  const reason = reasons[0];
  const map: Record<string, string> = {
    INSUFFICIENT_POINTS: t(lang, "rewards.notEnoughPoints"),
    REWARD_TIER_LOCKED: t(lang, "rewards.tierRequired"),
    REWARD_OUT_OF_STOCK: t(lang, "rewards.outOfStock"),
    REWARD_LIMIT_REACHED: t(lang, "rewards.limitReached"),
    REWARD_YEARLY_LIMIT_REACHED: t(lang, "rewards.yearlyLimitReached"),
    REWARD_NOT_YET_VALID: t(lang, "rewards.notYetValid"),
    REWARD_EXPIRED: t(lang, "rewards.expired"),
  };
  return map[reason] ?? t(lang, "rewards.tierRequired");
}

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const portalToken = useAppStore((s) => s.portalToken);
  const member = useGuestStore((s) => s.member);
  const program = useGuestStore((s) => s.program);
  const queryClient = useQueryClient();

  // P1-11: Track which reward is currently being redeemed
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  // P1-14: Destructure isError for error state
  const { data: rewards, isLoading, isError, refetch } = useQuery({
    queryKey: ["rewards", portalToken],
    queryFn: async () => {
      if (!portalToken) return [];
      const res = await portalFetch<Reward[]>(portalToken, "/rewards");
      return (res.data as Reward[]) ?? [];
    },
    enabled: !!portalToken,
  });

  const redeemMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      if (!portalToken) throw new Error("No token");
      const res = await portalFetch<{ redemption: unknown }>(portalToken, "/rewards/redeem", {
        method: "POST",
        body: JSON.stringify({ rewardId }),
      });
      if (res.status !== "success") throw new Error(res.errorMessage || "Redeem failed");
      return res.data;
    },
    onSuccess: () => {
      setRedeemingId(null);
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t(lang, "rewards.catalog"), t(lang, "rewards.redeemSuccess"));
    },
    // P2-7: Wrap error in i18n instead of showing raw error.message
    onError: () => {
      setRedeemingId(null);
      Alert.alert(t(lang, "auth.error"), t(lang, "common.error"));
    },
  });

  const handleRedeem = (reward: Reward) => {
    if (!reward.canRedeem) return;
    Alert.alert(
      reward.name,
      `${t(lang, "rewards.redeemConfirm")}\n\n${reward.pointsCost} ${program?.pointsName ?? "pkt"}`,
      [
        { text: t(lang, "common.cancel"), style: "cancel" },
        {
          text: t(lang, "rewards.redeem"),
          onPress: () => {
            // P1-11: Set the specific reward being redeemed
            setRedeemingId(reward.id);
            redeemMutation.mutate(reward.id);
          },
        },
      ],
    );
  };

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title}>{t(lang, "rewards.catalog")}</Text>
          <Text style={styles.pointsBadge}>
            {member?.availablePoints.toLocaleString() ?? 0} {program?.pointsName ?? "pkt"}
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : isError ? (
          // P1-14: Error state with retry
          <View style={styles.errorContainer}>
            <Text style={styles.emptyText}>{t(lang, "common.error")}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel={t(lang, "common.retry")}
            >
              <Text style={styles.retryBtnText}>{t(lang, "common.retry")}</Text>
            </Pressable>
          </View>
        ) : !rewards?.length ? (
          <Text style={styles.emptyText}>{t(lang, "rewards.noRewards")}</Text>
        ) : (
          <View style={styles.grid}>
            {/* P3-2: Remove unused variable i */}
            {rewards.map((r) => (
              <View key={r.id}>
                <RewardCard
                  reward={r}
                  lang={lang}
                  pointsName={program?.pointsName ?? "pkt"}
                  onRedeem={() => handleRedeem(r)}
                  isRedeeming={redeemingId === r.id}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function RewardCard({
  reward: r, lang, pointsName, onRedeem, isRedeeming,
}: {
  reward: Reward; lang: Lang; pointsName: string; onRedeem: () => void; isRedeeming: boolean;
}) {
  const catKey = `rewards.cat.${r.category}` as const;
  const blocked = !r.canRedeem;

  return (
    <View style={styles.card}>
      {r.imageUrl && (
        <Image
          source={{ uri: r.imageUrl }}
          style={styles.cardImage}
          resizeMode="cover"
          // P3-7: Add accessibilityLabel to reward image
          accessibilityLabel={r.name}
        />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardCategory}>{t(lang, catKey)}</Text>
        <Text style={styles.cardName}>{r.name}</Text>
        {r.description && <Text style={styles.cardDesc} numberOfLines={2}>{r.description}</Text>}
        <View style={styles.cardFooter}>
          <Text style={styles.cardCost}>{r.pointsCost.toLocaleString()} {pointsName}</Text>
          <Pressable
            style={[styles.redeemBtn, blocked && styles.redeemBtnDisabled]}
            onPress={onRedeem}
            disabled={blocked || isRedeeming}
            accessibilityRole="button"
            accessibilityLabel={`${t(lang, "rewards.redeem")} ${r.name}`}
          >
            <Text style={[styles.redeemBtnText, blocked && styles.redeemBtnTextDisabled]}>
              {/* P1-12: Use getBlockReason for all blocking reasons */}
              {blocked
                ? getBlockReason(r.reasonsBlocked, lang)
                : t(lang, "rewards.redeem")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: guest.text },
  pointsBadge: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: GOLD, marginTop: 4 },
  emptyText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textMuted, textAlign: "center", paddingVertical: spacing["3xl"] },
  errorContainer: { alignItems: "center", gap: spacing.md, paddingVertical: spacing["3xl"] },
  retryBtn: {
    backgroundColor: GOLD, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, minHeight: 44,
    alignItems: "center", justifyContent: "center",
  },
  retryBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: NAVY },
  grid: { gap: spacing.lg },
  card: {
    backgroundColor: guest.card, borderRadius: radius.lg, borderWidth: 1, borderColor: guest.cardBorder,
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: 140 },
  cardBody: { padding: spacing.lg, gap: spacing.sm },
  cardCategory: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium", color: GOLD, textTransform: "uppercase", letterSpacing: 0.5 },
  cardName: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: guest.text },
  cardDesc: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textMuted },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  cardCost: { fontSize: fontSize.base, fontFamily: "Inter_700Bold", color: GOLD },
  redeemBtn: {
    backgroundColor: GOLD, borderRadius: radius.full,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, minHeight: 44,
    alignItems: "center", justifyContent: "center",
  },
  redeemBtnDisabled: { backgroundColor: guest.glass },
  redeemBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: NAVY },
  redeemBtnTextDisabled: { color: guest.textMuted },
});
