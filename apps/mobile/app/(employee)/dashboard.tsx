// =============================================================================
// Employee App — Dashboard (Today's shift, stats, upcoming)
// =============================================================================

import { View, Text, ScrollView, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { employee, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.greeting}>Dzień dobry 👋</Text>
          <Text style={styles.subtitle}>Pure Alpha Employee App</Text>
        </Animated.View>

        {/* Today's shift card */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.card, styles.shiftCard]}>
          <View style={styles.shiftHeader}>
            <Text style={styles.shiftTitle}>{t(lang, "emp.todayShift")}</Text>
            <View style={styles.shiftBadge}>
              <Text style={styles.shiftBadgeText}>SCHEDULED</Text>
            </View>
          </View>
          <Text style={styles.placeholder}>{t(lang, "emp.noShift")}</Text>
        </Animated.View>

        {/* Week Stats */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0h</Text>
            <Text style={styles.statLabel}>{t(lang, "emp.hours")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>{t(lang, "emp.shifts")}</Text>
          </View>
        </Animated.View>

        {/* Upcoming */}
        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.card}>
          <Text style={styles.cardTitle}>{t(lang, "emp.upcoming")}</Text>
          <Text style={styles.placeholder}>Upcoming shifts will load here</Text>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  greeting: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text },
  subtitle: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: employee.card, borderRadius: radius.xl, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.xl, gap: spacing.md, ...shadow.sm,
  },
  shiftCard: { borderLeftWidth: 4, borderLeftColor: employee.brand },
  shiftHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shiftTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: employee.text },
  shiftBadge: { backgroundColor: employee.accent, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 2 },
  shiftBadgeText: { fontSize: fontSize.xs, fontFamily: "Inter_600SemiBold", color: employee.brand },
  cardTitle: { fontSize: fontSize.lg, fontFamily: "Inter_600SemiBold", color: employee.text },
  placeholder: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textMuted },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: {
    flex: 1, backgroundColor: employee.card, borderRadius: radius.lg, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing.lg, alignItems: "center", gap: 4, ...shadow.sm,
  },
  statValue: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: employee.brand },
  statLabel: { fontSize: fontSize.xs, fontFamily: "Inter_400Regular", color: employee.textSecondary },
});
