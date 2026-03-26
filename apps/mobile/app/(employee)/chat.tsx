// =============================================================================
// Employee App -- Chat (Bridge to Pure Chat)
// =============================================================================

import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { employee, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + spacing.xl }]}>
        <View>
          <Text style={styles.title}>{t(lang, "emp.tab.chat")}</Text>
        </View>

        <View style={styles.card}>
          <Icon name="chatbubble-ellipses-outline" size={48} color={employee.brand} />
          <Text style={styles.cardTitle}>{t(lang, "emp.chat.title")}</Text>
          <Text style={styles.cardDesc}>
            {t(lang, "emp.chat.desc")}
          </Text>
          <View style={styles.comingSoonBadge} accessible={true} accessibilityRole="text">
            <Text style={styles.comingSoonText}>{t(lang, "emp.chatComingSoon")}</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text, letterSpacing: -0.3 },
  card: {
    backgroundColor: employee.card, borderRadius: radius.xl, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing["3xl"], alignItems: "center", gap: spacing.md, ...shadow.sm,
  },
  cardTitle: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: employee.text },
  cardDesc: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textSecondary, textAlign: "center", lineHeight: 18 },
  comingSoonBadge: {
    backgroundColor: employee.accent, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  comingSoonText: { fontSize: fontSize.sm, fontFamily: "Inter_600SemiBold", color: employee.brand },
});
