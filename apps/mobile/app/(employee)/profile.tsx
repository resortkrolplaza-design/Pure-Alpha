import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { employee, fontSize, radius, spacing, shadow } from "@/lib/tokens";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { logout } from "@/lib/auth";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const reset = useAppStore((s) => s.reset);

  const handleLogout = async () => {
    await logout();
    reset();
    router.replace("/");
  };

  return (
    <LinearGradient colors={[employee.bgFrom, employee.bgTo]} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.title}>{t(lang, "emp.tab.profile")}</Text>

        <View style={styles.card}>
          <Text style={styles.placeholder}>Employee profile will load here</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "auth.logout")}
        >
          <Text style={styles.logoutText}>{t(lang, "auth.logout")}</Text>
        </Pressable>
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
    padding: spacing.xl, ...shadow.sm,
  },
  placeholder: { fontSize: fontSize.sm, fontFamily: "Inter_400Regular", color: employee.textMuted },
  logoutBtn: {
    backgroundColor: "#fef2f2", borderRadius: radius.full, borderWidth: 1, borderColor: "#fecaca",
    paddingVertical: 14, alignItems: "center",
  },
  logoutBtnPressed: { opacity: 0.7 },
  logoutText: { fontSize: fontSize.base, fontFamily: "Inter_600SemiBold", color: "#dc2626" },
});
