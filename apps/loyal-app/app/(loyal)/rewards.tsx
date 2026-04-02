// =============================================================================
// Loyal App -- Rewards Tab
// Points balance, 2-column reward grid, redeem flow
// =============================================================================

import { useCallback } from "react";
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
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { loyal, fontSize, radius, spacing, shadow, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchRewards, redeemReward } from "@/lib/api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { Reward, RedeemResult } from "@/lib/types";

// -- Reward Card (2-column grid) -----------------------------------------------

function RewardCard({
  item,
  pointsBalance,
  onRedeem,
  lang,
}: {
  item: Reward;
  pointsBalance: number;
  onRedeem: (reward: Reward) => void;
  lang: "pl" | "en";
}) {
  const tt = (key: string) => t(lang, key);
  const canRedeem = item.canRedeem && pointsBalance >= item.pointsCost;

  return (
    <View style={styles.rewardCard}>
      {/* Image or gradient placeholder */}
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.rewardImage}
          resizeMode="cover"
          onError={() => {}}
        />
      ) : (
        <LinearGradient
          colors={[loyal.primaryFaint, loyal.contentBg]}
          style={styles.rewardImage}
        >
          <Icon name="gift" size={32} color={loyal.primary} />
        </LinearGradient>
      )}

      <View style={styles.rewardContent}>
        <Text style={styles.rewardName} numberOfLines={2}>{item.name}</Text>

        {item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}

        <Text style={styles.rewardCost}>{item.pointsCost} pkt</Text>

        {canRedeem ? (
          <Pressable
            style={styles.redeemBtn}
            onPress={() => onRedeem(item)}
            accessibilityRole="button"
            accessibilityLabel={`${tt("rewards.redeem")} ${item.name}`}
          >
            <Text style={styles.redeemBtnText}>{tt("rewards.redeem")}</Text>
          </Pressable>
        ) : (
          <View style={styles.lockedBtn}>
            <Icon name="lock-closed" size={14} color={loyal.textDim} />
            <Text style={styles.lockedBtnText} numberOfLines={1}>
              {item.reasonsBlocked?.[0] ?? tt("rewards.notEnoughPoints")}
            </Text>
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

  const { data, refetch, isRefetching } = useQuery<{ rewards: Reward[]; pointsBalance: number }>({
    queryKey: ["rewards", token],
    queryFn: () => fetchRewards(token!),
    enabled: !!token,
  });

  const redeemMutation = useMutation<RedeemResult, Error, string>({
    mutationFn: (rewardId: string) => redeemReward(token!, rewardId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["rewards", token] });
      queryClient.invalidateQueries({ queryKey: ["loyalty", token] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        tt("rewards.success"),
        result.code
          ? `${tt("rewards.code")}: ${result.code}`
          : tt("rewards.redeemed"),
      );
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(tt("common.error"), String(err.message ?? tt("rewards.redeemError")));
    },
  });

  const handleRedeem = useCallback(
    (reward: Reward) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const balance = data?.pointsBalance ?? 0;
      const remaining = balance - reward.pointsCost;

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
    [data?.pointsBalance, tt, redeemMutation],
  );

  const rewards = data?.rewards ?? [];
  const pointsBalance = data?.pointsBalance ?? 0;

  const renderHeader = () => (
    <View style={styles.balanceHeader}>
      <Text style={styles.balanceLabel}>{tt("rewards.yourPoints")}</Text>
      <Text style={styles.balanceValue}>{pointsBalance}</Text>
      <Text style={styles.balanceUnit}>pkt</Text>
    </View>
  );

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
    color: loyal.textSecondary,
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
    color: loyal.textDim,
  },

  // -- Grid -------------------------------------------------------------------
  columnWrapper: {
    gap: spacing.md,
  },

  // -- Reward Card ------------------------------------------------------------
  rewardCard: {
    flex: 1,
    backgroundColor: loyal.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loyal.cardBorder,
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
    color: loyal.text,
    lineHeight: 18,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: loyal.primaryFaint,
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
    backgroundColor: loyal.inputBg,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    minHeight: TOUCH_TARGET,
  },
  lockedBtnText: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: loyal.textDim,
  },
});

export default function RewardsScreen() {
  return (
    <ErrorBoundary>
      <RewardsScreenInner />
    </ErrorBoundary>
  );
}
