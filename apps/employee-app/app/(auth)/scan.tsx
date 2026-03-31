// =============================================================================
// Employee App -- QR Scanner Screen (warm cream theme + camera overlay)
// Scans hotel onboarding QR codes (purealpha-employee://onboard?slug=X or plain)
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  Linking,
} from "react-native";
import { useReducedMotion } from "@/lib/animations";
// CameraView is not supported on web -- guard below
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { emp, fontSize, radius, spacing, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { resolveHotel, resolveHotelByToken } from "@/lib/employee-api";
import { setHotelSlug, setHotelId, setHotelOnboarded } from "@/lib/auth";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

const { width: SCREEN_W } = Dimensions.get("window");
const OVERLAY_SIZE = Math.min(SCREEN_W * 0.7, 280);
const CORNER_SIZE = 28;
const CORNER_WIDTH = 4;
const SCAN_DEBOUNCE_MS = 3000;

// -- QR decode helper ---------------------------------------------------------

function extractSlugFromQr(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Deep link: purealpha-employee://onboard?slug=X
  try {
    const url = new URL(trimmed);
    if (url.protocol === "purealpha-employee:") {
      const slug = url.searchParams.get("slug");
      if (slug) return slug.toLowerCase();
    }
    // HTTPS onboarding URLs -- only from trusted hostname
    if (url.hostname === "purealphahotel.pl" && url.searchParams.has("slug")) {
      const slug = url.searchParams.get("slug");
      if (slug) return slug.toLowerCase();
    }
  } catch {
    // Not a URL -- treat as plain text slug
  }

  // Plain text slug (alphanumeric + hyphens, 2-64 chars)
  if (/^[a-zA-Z0-9-]{2,64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

// -- Corner Bracket Component -------------------------------------------------

function CornerBracket({
  position,
}: {
  position: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
}) {
  const isTop = position.includes("top");
  const isLeft = position.includes("Left");

  return (
    <View
      style={[
        styles.corner,
        {
          top: isTop ? -CORNER_WIDTH / 2 : undefined,
          bottom: !isTop ? -CORNER_WIDTH / 2 : undefined,
          left: isLeft ? -CORNER_WIDTH / 2 : undefined,
          right: !isLeft ? -CORNER_WIDTH / 2 : undefined,
          borderTopWidth: isTop ? CORNER_WIDTH : 0,
          borderBottomWidth: !isTop ? CORNER_WIDTH : 0,
          borderLeftWidth: isLeft ? CORNER_WIDTH : 0,
          borderRightWidth: !isLeft ? CORNER_WIDTH : 0,
          borderTopLeftRadius: isTop && isLeft ? radius.sm : 0,
          borderTopRightRadius: isTop && !isLeft ? radius.sm : 0,
          borderBottomLeftRadius: !isTop && isLeft ? radius.sm : 0,
          borderBottomRightRadius: !isTop && !isLeft ? radius.sm : 0,
        },
      ]}
    />
  );
}

// -- Main Scanner Screen ------------------------------------------------------

function ScanScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();

  // Web: CameraView not supported -- redirect to manual login
  useEffect(() => {
    if (Platform.OS === "web") {
      router.replace("/(auth)/login");
    }
  }, []);

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Debounce: ignore duplicate scans for 3 seconds
  const lastScanRef = useRef<number>(0);
  const processingRef = useRef(false);

  // Pulsing animation for "searching" text
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim, reducedMotion]);

  // Request camera permission on mount
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const canGoBack = navigation.canGoBack();
    if (canGoBack) {
      router.back();
    } else {
      router.replace("/(auth)/welcome");
    }
  }, [navigation]);

  const handleManualEntry = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(auth)/login");
  }, []);

  const toggleTorch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTorch((prev) => !prev);
  }, []);

  const handleOpenSettings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openSettings();
  }, []);

  // -- QR Scanned callback ----------------------------------------------------
  const handleBarcodeScanned = useCallback(
    async (result: { data: string; type: string }) => {
      const now = Date.now();
      if (now - lastScanRef.current < SCAN_DEBOUNCE_MS) return;
      if (processingRef.current) return;

      lastScanRef.current = now;
      processingRef.current = true;
      setScanError(null);

      const rawData = typeof result.data === "string" ? result.data : String(result.data ?? "");

      try {
        // Check if this is a ClockPoint QR (PA-CLK-*) -- unified QR for onboarding + clock-in
        const isClockPointQr = rawData.trim().startsWith("PA-CLK-") && rawData.trim().length > 7;

        if (isClockPointQr) {
          setScanError(null);
          const res = await resolveHotelByToken(rawData.trim());
          if (res.status === "success" && res.data) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await Promise.all([
              setHotelSlug(res.data.slug),
              setHotelId(res.data.hotelId),
              setHotelOnboarded(),
            ]);
            const store = useAppStore.getState();
            store.setHotel({
              slug: res.data.slug,
              id: res.data.hotelId,
              name: res.data.hotelName,
            });
            router.replace("/(auth)/login");
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setScanError(res.errorMessage ?? t(lang, "welcome.hotelNotFound"));
          }
          return;
        }

        const slug = extractSlugFromQr(rawData);
        if (!slug) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setScanError(`${t(lang, "scan.invalidQr")} [${rawData.slice(0, 40)}]`);
          return;
        }

        // Validate slug with API
        setScanError(null);
        const res = await resolveHotel(slug);
        if (res.status === "success" && res.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await Promise.all([
            setHotelSlug(res.data.slug ?? slug),
            setHotelId(res.data.hotelId),
            setHotelOnboarded(),
          ]);

          const store = useAppStore.getState();
          store.setHotel({
            slug: res.data.slug ?? slug,
            id: res.data.hotelId,
            name: res.data.hotelName,
          });

          router.replace("/(auth)/login");
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setScanError(res.errorMessage ?? t(lang, "welcome.hotelNotFound"));
        }
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setScanError(t(lang, "common.networkError"));
      } finally {
        processingRef.current = false;
      }
    },
    [lang],
  );

  // -- Permission denied state ------------------------------------------------
  if (permission && !permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Back button */}
        <Pressable
          onPress={handleBack}
          style={[styles.permBackBtn, { top: insets.top + spacing.md }]}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.back")}
        >
          <View style={styles.circleBtn}>
            <Icon name="chevron-back" size={22} color={emp.text} />
          </View>
        </Pressable>

        <View style={styles.permContent}>
          <View style={styles.permIconCircle}>
            <Icon name="camera-outline" size={48} color={emp.textMuted} />
          </View>
          <Text style={styles.permTitle}>
            {t(lang, "scan.permissionDenied")}
          </Text>
          <Text style={styles.permDesc}>
            {t(lang, "scan.permissionDesc")}
          </Text>

          <Pressable
            style={styles.permPrimaryBtn}
            onPress={handleOpenSettings}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "scan.openSettings")}
          >
            <Icon name="settings-outline" size={20} color={emp.white} />
            <Text style={styles.permPrimaryBtnText}>
              {t(lang, "scan.openSettings")}
            </Text>
          </Pressable>

          <Pressable
            style={styles.permSecondaryBtn}
            onPress={handleManualEntry}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "scan.manual")}
          >
            <Text style={styles.permSecondaryBtnText}>
              {t(lang, "scan.manual")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // -- Camera view ------------------------------------------------------------
  return (
    <View style={styles.fullScreen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Dark overlay with transparent center */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Top dark band */}
        <View style={styles.overlayDarkTop} />

        {/* Middle row: left dark | clear center | right dark */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlayDarkSide} />
          <View style={styles.scanWindow}>
            <CornerBracket position="topLeft" />
            <CornerBracket position="topRight" />
            <CornerBracket position="bottomLeft" />
            <CornerBracket position="bottomRight" />
          </View>
          <View style={styles.overlayDarkSide} />
        </View>

        {/* Bottom dark band */}
        <View style={styles.overlayDarkBottom} />
      </View>

      {/* Top controls */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleBack}
          style={styles.circleBtn}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "common.back")}
        >
          <Icon name="chevron-back" size={22} color={emp.white} />
        </Pressable>

        <Text style={styles.topTitle}>{t(lang, "scan.title")}</Text>

        <Pressable
          onPress={toggleTorch}
          style={[styles.circleBtn, torch && styles.circleBtnActive]}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "scan.torch")}
        >
          <Icon
            name={torch ? "flashlight" : "flashlight-outline"}
            size={22}
            color={torch ? emp.primary : emp.white}
          />
        </Pressable>
      </View>

      {/* Bottom section */}
      <View
        style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.xl }]}
        pointerEvents="box-none"
      >
        {/* Scanning indicator */}
        <Animated.Text
          style={[
            styles.scanningText,
            scanError ? { color: "#ef4444" } : { opacity: pulseAnim },
          ]}
        >
          {scanError ?? t(lang, "scan.scanning")}
        </Animated.Text>

        {/* Manual entry link */}
        <Pressable
          onPress={handleManualEntry}
          style={styles.manualEntryBtn}
          accessibilityRole="button"
          accessibilityLabel={t(lang, "scan.manual")}
        >
          <Icon name="keypad-outline" size={18} color={emp.white} />
          <Text style={styles.manualEntryText}>
            {t(lang, "scan.manual")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// -- Styles -------------------------------------------------------------------

const OVERLAY_COLOR = "rgba(0,0,0,0.6)";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: emp.bg,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "#000",
  },

  // -- Overlay grid -----------------------------------------------------------
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayDarkTop: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  overlayMiddle: {
    flexDirection: "row",
    height: OVERLAY_SIZE,
  },
  overlayDarkSide: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  scanWindow: {
    width: OVERLAY_SIZE,
    height: OVERLAY_SIZE,
    // Clear center -- no background
  },
  overlayDarkBottom: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },

  // -- Corner brackets --------------------------------------------------------
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: emp.white,
  },

  // -- Top bar ----------------------------------------------------------------
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
  },
  topTitle: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: emp.white,
    letterSpacing: -0.3,
  },

  circleBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnActive: {
    backgroundColor: emp.white,
  },

  // -- Bottom bar -------------------------------------------------------------
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: spacing.xl,
    paddingTop: spacing["3xl"],
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  scanningText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.white,
    textAlign: "center",
  },
  manualEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: TOUCH_TARGET,
  },
  manualEntryText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.white,
    textDecorationLine: "underline",
  },

  // -- Permission denied state ------------------------------------------------
  permBackBtn: {
    position: "absolute",
    left: spacing.xl,
    zIndex: 10,
  },
  permContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["2xl"],
    gap: spacing.lg,
  },
  permIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: emp.inputBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  permTitle: {
    fontSize: fontSize["2xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    textAlign: "center",
  },
  permDesc: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  permPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: emp.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing["3xl"],
    minHeight: TOUCH_TARGET + 8,
    marginTop: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  permPrimaryBtnText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: emp.white,
  },
  permSecondaryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
  },
  permSecondaryBtnText: {
    fontSize: fontSize.base,
    fontFamily: "Inter_500Medium",
    color: emp.primary,
    textDecorationLine: "underline",
  },
});

// -- Default export wrapped in ErrorBoundary ----------------------------------

export default function ScanScreen() {
  return (
    <ErrorBoundary>
      <ScanScreenInner />
    </ErrorBoundary>
  );
}
