// =============================================================================
// Guest Portal -- Stay Tab (Member Card + Services + Contact)
// =============================================================================

import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAVY, NAVY_LIGHT, GOLD, guest, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useGuestStore } from "@/lib/store";

function getGreetingKey(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "stay.greeting.morning";
  if (h >= 12 && h < 18) return "stay.greeting.afternoon";
  if (h >= 18 && h < 22) return "stay.greeting.evening";
  return "stay.greeting.night";
}

export default function StayScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const member = useGuestStore((s) => s.member);
  const program = useGuestStore((s) => s.program);
  const hotel = useGuestStore((s) => s.hotel);
  const nextTier = useGuestStore((s) => s.nextTier);

  // P1-9: Remove useMemo -- getGreetingKey is cheap and should update on re-render
  const greetingKey = getGreetingKey();
  const displayName = member?.firstName || member?.email?.split("@")[0] || "";

  // P1-7: Use program currency instead of hardcoded PLN
  const currency = program?.currency ?? "PLN";

  if (!member || !program) {
    return (
      <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={styles.loadingText}>{t(lang, "common.loading")}</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[NAVY, NAVY_LIGHT, NAVY]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View>
          <Text style={styles.greeting}>
            {t(lang, greetingKey)}, {displayName}
          </Text>
          {hotel && <Text style={styles.hotelName}>{hotel.name}</Text>}
        </View>

        {/* Member Card */}
        <View style={styles.memberCard}>
          <LinearGradient
            colors={[GOLD, "#c4a030"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.memberCardGradient}
          >
            <View style={styles.memberCardHeader}>
              <Text style={styles.memberCardProgram}>{program.programName}</Text>
              <Text style={styles.memberCardNumber}>#{member.memberNumber}</Text>
            </View>

            <Text style={styles.memberCardName}>
              {member.firstName} {member.lastName}
            </Text>

            <View style={styles.memberCardPoints}>
              <View>
                <Text style={styles.pointsValue}>{member.availablePoints.toLocaleString()}</Text>
                <Text style={styles.pointsLabel}>{t(lang, "stay.availablePoints")}</Text>
              </View>
              {member.tier && (
                <View style={styles.tierBadge}>
                  <Text style={styles.tierText}>{member.tier.name}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard label={t(lang, "stay.totalStays")} value={String(member.totalStays)} />
          <StatCard label={t(lang, "stay.lifetimePoints")} value={member.lifetimePoints.toLocaleString()} />
          <StatCard
            label={t(lang, "stay.multiplier")}
            value={member.tier ? `${member.tier.multiplier}x` : "1x"}
          />
          {/* P1-7: Use dynamic currency instead of hardcoded PLN */}
          <StatCard
            label={t(lang, "stay.totalSpent")}
            value={`${member.totalSpent.toLocaleString()} ${currency}`}
          />
        </View>

        {/* Next Tier Progress */}
        {nextTier && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t(lang, "stay.nextTier")}: {nextTier.name}</Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      nextTier.minPoints > 0
                        ? (member.lifetimePoints / nextTier.minPoints) * 100
                        : 0,
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {member.lifetimePoints.toLocaleString()} / {nextTier.minPoints.toLocaleString()} {program.pointsName}
            </Text>
          </View>
        )}

        {/* Expiring Points Warning */}
        {member.expiringPoints && member.expiringPoints.totalPoints > 0 && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              {member.expiringPoints.totalPoints.toLocaleString()} {program.pointsName}{" "}
              {t(lang, "stay.expiresOn")} {new Date(member.expiringPoints.earliestExpiry).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB")}
            </Text>
          </View>
        )}

        {/* Tier Benefits */}
        {member.tier?.benefits && member.tier.benefits.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t(lang, "stay.benefits")}</Text>
            {/* P2-9: Use benefit string as key instead of index */}
            {member.tier.benefits.map((b) => (
              <View key={b} style={styles.benefitRow}>
                <Text style={styles.benefitDot}>*</Text>
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Contact */}
        {hotel && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t(lang, "stay.contact")}</Text>
            <View style={styles.contactRow}>
              {hotel.phone && (
                <Pressable
                  style={styles.contactBtn}
                  onPress={() => Linking.openURL(`tel:${hotel.phone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "hotel.call")}
                >
                  <Text style={styles.contactBtnIcon}>Tel</Text>
                  <Text style={styles.contactBtnText}>{t(lang, "hotel.call")}</Text>
                </Pressable>
              )}
              {hotel.email && (
                <Pressable
                  style={styles.contactBtn}
                  onPress={() => Linking.openURL(`mailto:${hotel.email}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, "hotel.sendEmail")}
                >
                  <Text style={styles.contactBtnIcon}>@</Text>
                  <Text style={styles.contactBtnText}>Email</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: guest.textSecondary, fontSize: fontSize.base, fontFamily: "Inter_400Regular" },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  greeting: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: guest.text },
  hotelName: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textSecondary, marginTop: 2 },
  memberCard: { borderRadius: radius.xl, overflow: "hidden", ...shadow.gold },
  memberCardGradient: { padding: spacing.xl, gap: spacing.md },
  memberCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  memberCardProgram: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: NAVY, textTransform: "uppercase", letterSpacing: 1 },
  memberCardNumber: { fontSize: fontSize.xs, fontFamily: "Inter_500Medium", color: "rgba(13,34,54,0.6)" },
  memberCardName: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: NAVY },
  memberCardPoints: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: spacing.sm },
  pointsValue: { fontSize: fontSize["3xl"], fontFamily: "Inter_700Bold", color: NAVY },
  pointsLabel: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: "rgba(13,34,54,0.6)" },
  tierBadge: {
    backgroundColor: "rgba(13,34,54,0.15)", borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  tierText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: NAVY },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: guest.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.lg, alignItems: "center", gap: 4,
  },
  statValue: { fontSize: fontSize.lg, fontFamily: "Inter_700Bold", color: guest.text },
  statLabel: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textSecondary, textAlign: "center" },
  card: {
    backgroundColor: guest.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: guest.cardBorder,
    padding: spacing.xl, gap: spacing.md,
  },
  cardTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: guest.text },
  progressBar: {
    height: 6, borderRadius: 3, backgroundColor: guest.glassBorder, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: GOLD, borderRadius: 3 },
  progressText: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: guest.textSecondary },
  warningCard: {
    backgroundColor: "rgba(245,158,11,0.1)", borderRadius: radius.lg,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.2)",
    padding: spacing.lg,
  },
  warningText: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: "#fcd34d" },
  benefitRow: { flexDirection: "row", gap: spacing.sm },
  benefitDot: { color: GOLD, fontSize: fontSize.base },
  benefitText: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: guest.textSecondary, flex: 1 },
  contactRow: { flexDirection: "row", gap: spacing.md },
  contactBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, backgroundColor: guest.glass, borderRadius: radius.md,
    borderWidth: 1, borderColor: guest.glassBorder,
    paddingVertical: spacing.md, minHeight: 44,
  },
  contactBtnIcon: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: GOLD },
  contactBtnText: { fontSize: fontSize.sm, fontFamily: "Inter_500Medium", color: guest.text },
});
