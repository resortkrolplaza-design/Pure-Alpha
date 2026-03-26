// =============================================================================
// Guest Portal — Rewards Tab (Catalog + Redeem)
// =============================================================================

import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore, useGuestStore } from "@/lib/store";
import { portalFetch } from "@/lib/api";
import type { Reward } from "@/lib/types";

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const portalToken = useAppStore((s) => s.portalToken);
  const member = useGuestStore((s) => s.member);
  const program = useGuestStore((s) => s.program);
  const queryClient = useQueryClient();

  const { data: rewards, isLoading } = useQuery({
    queryKey: ["rewards", portalToken],
    queryFn: async () => {
      if (!portalToken) return [];
      const res = await portalFetch<{ rewards: Reward[] }>(portalToken, "/rewards");
      return res.data?.rewards ?? [];
    },
    enabled: !!portalToken,
  });

  const redeemMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      if (!portalToken) throw new Error("No token");
      const res = await portalFetch<{ redemption: unknown }>(portalToken, "/redeem", {
        method: "POST",
        body: JSON.stringify({ rewardId }),
      });
      if (res.status !== "success") throw new Error(res.errorMessage || "Redeem failed");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("🎉", t(lang, "rewards.redeemSuccess"));
    },
    onError: (err: Error) => {
      Alert.alert("Błąd", err.message);
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
          onPress: () => redeemMutation.mutate(reward.id),
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
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.title}>{t(lang, "rewards.catalog")}</Text>
          <Text style={styles.pointsBadge}>
            {member?.availablePoints.toLocaleString() ?? 0} {program?.pointsName ?? "pkt"}
          </Text>
        </Animated.View>

        {isLoading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
        ) : !rewards?.length ? (
          <Text style={styles.emptyText}>{t(lang, "rewards.noRewards")}</Text>
        ) : (
          <View style={styles.grid}>
            {rewards.map((r, i) => (
              <Animated.View key={r.id} entering={FadeInDown.delay(200 + i * 50).springify()}>
                <RewardCard
                  reward={r}
                  lang={lang}
                  pointsName={program?.pointsName ?? "pkt"}
                  onRedeem={() => handleRedeem(r)}
                  isRedeeming={redeemMutation.isPending}
                />
              </Animated.View>
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
  reward: Reward; lang: "pl" | "en"; pointsName: string; onRedeem: () => void; isRedeeming: boolean;
}) {
  const catKey = `rewards.cat.${r.category}` as const;
  const blocked = !r.canRedeem;

  return (
    <View style={styles.card}>
      {r.imageUrl && (
        <Image
          source={{ uri: r.imageUrl }}
          style={styles.cardImage}
          contentFit="cover"
          transition={200}
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
              {blocked
                ? (r.reasonsBlocked[0] === "NOT_ENOUGH_POINTS"
                  ? t(lang, "rewards.notEnoughPoints")
                  : t(lang, "rewards.tierRequired"))
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
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, minHeight: 36,
    alignItems: "center", justifyContent: "center",
  },
  redeemBtnDisabled: { backgroundColor: guest.glass },
  redeemBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: NAVY },
  redeemBtnTextDisabled: { color: guest.textMuted },
});
