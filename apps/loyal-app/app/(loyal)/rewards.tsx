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
import { fetchRewards, redeemReward, fetchPortalData } from "@/lib/loyal-api";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import type { RewardData, PortalData } from "@/lib/types";

// -- Reward Card (2-column grid) -----------------------------------------------

function RewardCard({
  item,
  pointsBalance,
  onRedeem,
  lang,
}: {
  item: RewardData;
  pointsBalance: number;
  onRedeem: (reward: RewardData) => void;
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
            style={styles.redeemBtn}
            onPress={() => onRedeem(item)}
            accessibilityRole="button"
            accessibilityLabel={`${tt("rewards.redeem")} ${item.name}`}
          >
            <Text style={styles.redeemBtnText}>{tt("rewards.redeem")}</Text>
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

// -- Main Screen ---------------------------------------------------------------

function RewardsScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const tt = (key: string) => t(lang, key);
  const token = useAppStore((s) => s.token);
  const queryClient = useQueryClient();

  // Fetch rewards list
  const { data: rewards = [], refetch: refetchRewards, isRefetching: isRefetchingRewards } = useQuery<RewardData[]>({
    queryKey: ["rewards", token],
    queryFn: async () => {
      const res = await fetchRewards(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load rewards");
      return res.data;
    },
    enabled: !!token,
  });

  // Fetch portal data for points balance
  const { data: portalData, refetch: refetchPortal, isRefetching: isRefetchingPortal } = useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const res = await fetchPortalData(token!);
      if (res.status !== "success" || !res.data) throw new Error(res.errorMessage ?? "Failed to load portal data");
      return res.data;
    },
    enabled: !!token,
  });

  const isRefetching = isRefetchingRewards || isRefetchingPortal;
  const pointsBalance = portalData?.member?.availablePoints ?? 0;

  const refetch = useCallback(() => {
    refetchRewards();
    refetchPortal();
  }, [refetchRewards, refetchPortal]);

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
});

export default function RewardsScreen() {
  return (
    <ErrorBoundary>
      <RewardsScreenInner />
    </ErrorBoundary>
  );
}
