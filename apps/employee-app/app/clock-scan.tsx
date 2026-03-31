// =============================================================================
// Employee App -- Clock Scan Screen (QR scanner for clock-in geofencing)
// Full-screen modal: scan PA-CLK-* QR code, get GPS, set pendingClockIn
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
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { emp, fontSize, radius, spacing, TOUCH_TARGET } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { getCurrentLocation } from "@/lib/location";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

const { width: SCREEN_W } = Dimensions.get("window");
const OVERLAY_SIZE = Math.min(SCREEN_W * 0.7, 280);
const CORNER_SIZE = 28;
const CORNER_WIDTH = 4;
const SCAN_DEBOUNCE_MS = 3000;

// -- QR decode helper ---------------------------------------------------------

function extractClockQr(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const PREFIX = "PA-CLK-";
  if (trimmed.startsWith(PREFIX) && trimmed.length > PREFIX.length) {
    // Return FULL token including prefix -- backend DB stores "PA-CLK-{uuid}"
    return trimmed;
  }
  return null;
}

function isOnboardingQr(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.startsWith("purealpha-employee://")) return true;
  // HTTPS onboarding links from purealphahotel.pl (e.g. /employee-app/onboard/SLUG)
  if (trimmed.includes("purealphahotel.pl") && !trimmed.startsWith("PA-CLK-")) return true;
  return false;
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

function ClockScanScreenInner() {
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const navigation = useNavigation();

  // Web: CameraView not supported
  useEffect(() => {
    if (Platform.OS === "web") {
      router.back();
    }
  }, []);

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Debounce: ignore duplicate scans for 3 seconds
  const lastScanRef = useRef<number>(0);
  const processingRef = useRef(false);

  // Pulsing animation for "searching" text
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
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
  }, [pulseAnim]);

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
      router.replace("/(employee)/dashboard");
    }
  }, [navigation]);

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
        // Check if this is an onboarding QR (wrong context)
        if (isOnboardingQr(rawData)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setScanError(t(lang, "clockScan.onboardingQr"));
          return;
        }

        // Extract clock token
        const qrToken = extractClockQr(rawData);
        if (!qrToken) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setScanError(t(lang, "clockScan.invalidQr"));
          return;
        }

        // Get GPS location
        setGettingLocation(true);
        const locResult = await getCurrentLocation();
        setGettingLocation(false);

        if (!locResult.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          if (locResult.error === "permission_denied") {
            setScanError(t(lang, "clockScan.locationDenied"));
          } else {
            setScanError(t(lang, "clockScan.locationUnavailable"));
          }
          return;
        }

        // Success -- store pending clock-in data and go back to dashboard
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        useAppStore.getState().setPendingClockIn({
          qrToken,
          latitude: locResult.data.latitude,
          longitude: locResult.data.longitude,
          gpsAccuracy: locResult.data.accuracy ?? undefined,
        });
        router.back();
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setScanError(t(lang, "common.error"));
      } finally {
        setGettingLocation(false);
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
            accessibilityLabel={t(lang, "clockScan.openSettings")}
          >
            <Icon name="settings-outline" size={20} color={emp.white} />
            <Text style={styles.permPrimaryBtnText}>
              {t(lang, "clockScan.openSettings")}
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

        <Text style={styles.topTitle}>{t(lang, "clockScan.title")}</Text>

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
        {/* Location loading indicator */}
        {gettingLocation ? (
          <View style={styles.locationRow}>
            <ActivityIndicator size="small" color={emp.white} />
            <Text style={styles.scanningText}>
              {t(lang, "clockScan.gettingLocation")}
            </Text>
          </View>
        ) : (
          <Animated.Text
            style={[
              styles.scanningText,
              scanError ? { color: emp.danger } : { opacity: pulseAnim },
            ]}
          >
            {scanError ?? t(lang, "clockScan.scanning")}
          </Animated.Text>
        )}
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
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
});

// -- Default export wrapped in ErrorBoundary ----------------------------------

export default function ClockScanScreen() {
  return (
    <ErrorBoundary>
      <ClockScanScreenInner />
    </ErrorBoundary>
  );
}
