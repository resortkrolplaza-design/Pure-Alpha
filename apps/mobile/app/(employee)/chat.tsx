// =============================================================================
// Employee App — Chat (Bridge to Pure Chat)
// =============================================================================

import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { employee, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.title}>{t(lang, "emp.tab.chat")}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.card}>
          <Text style={styles.cardEmoji}>💬</Text>
          <Text style={styles.cardTitle}>Pure Chat</Text>
          <Text style={styles.cardDesc}>
            Chat z zespołem — kanały, wiadomości bezpośrednie, AI asystent.
            Wymaga połączenia z serwerem czatu.
          </Text>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xl },
  title: { fontSize: fontSize["2xl"], fontFamily: "Inter_700Bold", color: employee.text },
  card: {
    backgroundColor: employee.card, borderRadius: radius.xl, borderWidth: 1, borderColor: employee.cardBorder,
    padding: spacing["3xl"], alignItems: "center", gap: spacing.md, ...shadow.sm,
  },
  cardEmoji: { fontSize: 48 },
  cardTitle: { fontSize: fontSize.xl, fontFamily: "Inter_700Bold", color: employee.text },
  cardDesc: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textSecondary, textAlign: "center", lineHeight: 20 },
});
