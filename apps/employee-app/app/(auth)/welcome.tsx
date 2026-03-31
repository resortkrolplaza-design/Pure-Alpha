// =============================================================================
// Employee App -- Welcome Screen (warm cream + animated briefcase + wave)
// Matches Group Portal welcome.tsx pattern with employee identity (blue-800)
// =============================================================================

import { useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useReducedMotion } from "@/lib/animations";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { emp, fontSize, radius, spacing, letterSpacing } from "@/lib/tokens";
import { Icon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { ErrorBoundary } from "@/lib/ErrorBoundary";

// -- Animated sine wave (bottom decorative element) ---------------------------

const WAVE_POINTS = 60;
const WAVE_HEIGHT = 140;
const WAVE_AMPLITUDE = 18;

function AnimatedWave({
  color,
  phaseOffset,
  speed,
  yOffset,
  screenW,
  reducedMotion,
}: {
  color: string;
  phaseOffset: number;
  speed: number;
  yOffset: number;
  screenW: number;
  reducedMotion: boolean;
}) {
  const phase = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeAnim = Animated.timing(fadeIn, {
      toValue: 1,
      duration: 1200,
      delay: 300,
      useNativeDriver: true,
    });
    fadeAnim.start();

    if (reducedMotion) {
      phase.setValue(0);
      return () => { fadeAnim.stop(); };
    }

    const loopAnim = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: speed,
        useNativeDriver: false,
      }),
    );
    loopAnim.start();

    return () => {
      fadeAnim.stop();
      loopAnim.stop();
    };
  }, [phase, fadeIn, speed, reducedMotion]);

  const dots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < WAVE_POINTS; i++) {
      arr.push(i);
    }
    return arr;
  }, []);

  return (
    <Animated.View style={[styles.waveContainer, { bottom: yOffset, opacity: fadeIn }]}>
      {dots.map((i) => {
        const x = (i / WAVE_POINTS) * screenW;
        const dotPhase = phaseOffset + (i / WAVE_POINTS) * Math.PI * 2;

        const translateY = phase.interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1],
          outputRange: [
            Math.sin(dotPhase) * WAVE_AMPLITUDE,
            Math.sin(dotPhase + Math.PI * 0.5) * WAVE_AMPLITUDE,
            Math.sin(dotPhase + Math.PI) * WAVE_AMPLITUDE,
            Math.sin(dotPhase + Math.PI * 1.5) * WAVE_AMPLITUDE,
            Math.sin(dotPhase + Math.PI * 2) * WAVE_AMPLITUDE,
          ],
        });

        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: x,
              width: screenW / WAVE_POINTS + 1,
              height: WAVE_HEIGHT,
              backgroundColor: color,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              transform: [{ translateY }],
            }}
          />
        );
      })}
    </Animated.View>
  );
}

// -- Main Welcome Screen ------------------------------------------------------

function WelcomeScreenInner() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const lang = useAppStore((s) => s.lang);
  const reducedMotion = useReducedMotion();

  // Entrance animations
  const iconScale = useRef(new Animated.Value(0.3)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(24)).current;
  const descOpacity = useRef(new Animated.Value(0)).current;
  const descTranslateY = useRef(new Animated.Value(16)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnTranslateY = useRef(new Animated.Value(20)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  // Pulsing icon
  const iconPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const entranceAnim = Animated.sequence([
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1,
          damping: 12,
          stiffness: 150,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(titleTranslateY, {
          toValue: 0,
          damping: 14,
          stiffness: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(descOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(descTranslateY, {
          toValue: 0,
          damping: 14,
          stiffness: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(btnOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(btnTranslateY, {
          toValue: 0,
          damping: 14,
          stiffness: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);
    entranceAnim.start();

    let pulseAnim: Animated.CompositeAnimation | null = null;
    if (reducedMotion) {
      iconPulse.setValue(1);
    } else {
      pulseAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(iconPulse, {
            toValue: 1.08,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(iconPulse, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseAnim.start();
    }

    return () => {
      entranceAnim.stop();
      pulseAnim?.stop();
    };
  }, [
    iconScale, iconOpacity, iconPulse,
    titleOpacity, titleTranslateY,
    descOpacity, descTranslateY,
    btnOpacity, btnTranslateY,
    footerOpacity,
    reducedMotion,
  ]);

  const handleScanQr = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(auth)/scan");
  };

  const handleManualEntry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(auth)/login");
  };

  return (
    <View style={styles.container}>
      {/* Gradient background */}
      <LinearGradient
        colors={[emp.bg, emp.white, emp.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated waves at bottom */}
      <AnimatedWave color={emp.waveLight} phaseOffset={0} speed={6000} yOffset={0} screenW={screenW} reducedMotion={reducedMotion} />
      <AnimatedWave color={emp.waveMedium} phaseOffset={2} speed={5000} yOffset={30} screenW={screenW} reducedMotion={reducedMotion} />
      <AnimatedWave color={emp.waveFaint} phaseOffset={4} speed={7000} yOffset={60} screenW={screenW} reducedMotion={reducedMotion} />

      {/* Content */}
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 32 }]}>
        {/* Top spacer */}
        <View style={styles.spacer} />

        {/* Briefcase icon */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              opacity: iconOpacity,
              transform: [{ scale: Animated.multiply(iconScale, iconPulse) }],
            },
          ]}
        >
          <LinearGradient
            colors={[emp.primary, emp.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Icon name="briefcase" size={44} color={emp.white} />
          </LinearGradient>
        </Animated.View>

        {/* Title */}
        <Animated.Text
          style={[
            styles.title,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            },
          ]}
        >
          {t(lang, "welcome.title")}
        </Animated.Text>

        {/* Description */}
        <Animated.Text
          style={[
            styles.description,
            {
              opacity: descOpacity,
              transform: [{ translateY: descTranslateY }],
            },
          ]}
        >
          {t(lang, "welcome.subtitle")}
        </Animated.Text>

        {/* Bottom spacer */}
        <View style={styles.spacer} />

        {/* CTA Buttons */}
        <Animated.View
          style={{
            opacity: btnOpacity,
            transform: [{ translateY: btnTranslateY }],
            width: "100%",
            maxWidth: 400,
            gap: spacing.md,
          }}
        >
          {/* Primary: Scan QR */}
          <Pressable
            style={styles.ctaButton}
            onPress={handleScanQr}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "welcome.scanQr")}
          >
            <Icon name="qr-code-outline" size={22} color={emp.white} />
            <Text style={styles.ctaText}>{t(lang, "welcome.scanQr")}</Text>
          </Pressable>

          {/* Secondary: Enter manually */}
          <Pressable
            style={styles.ctaSecondaryButton}
            onPress={handleManualEntry}
            accessibilityRole="button"
            accessibilityLabel={t(lang, "welcome.enterManually")}
          >
            <Icon name="keypad-outline" size={20} color={emp.primary} />
            <Text style={styles.ctaSecondaryText}>
              {t(lang, "welcome.enterManually")}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Footer */}
        <Animated.Text style={[styles.footer, { opacity: footerOpacity }]}>
          {t(lang, "welcome.poweredBy")}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: emp.bg,
  },
  waveContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    height: WAVE_HEIGHT,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing["2xl"],
  },

  iconContainer: {
    marginBottom: spacing["3xl"],
  },
  iconGradient: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: emp.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },

  title: {
    fontSize: fontSize["3xl"],
    fontFamily: "Inter_700Bold",
    color: emp.text,
    letterSpacing: letterSpacing.snug,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 38,
  },

  description: {
    fontSize: fontSize.base,
    fontFamily: "Inter_400Regular",
    color: emp.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 320,
    paddingHorizontal: spacing.md,
  },

  spacer: { flex: 1 },

  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: emp.primary,
    borderRadius: radius["2xl"],
    paddingVertical: spacing.lg,
    minHeight: 56,
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
  ctaText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_700Bold",
    color: emp.white,
    letterSpacing: letterSpacing.tight,
  },
  ctaSecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "transparent",
    borderRadius: radius["2xl"],
    borderWidth: 1.5,
    borderColor: emp.primary,
    paddingVertical: spacing.lg,
    minHeight: 56,
  },
  ctaSecondaryText: {
    fontSize: fontSize.lg,
    fontFamily: "Inter_600SemiBold",
    color: emp.primary,
    letterSpacing: letterSpacing.tight,
  },

  footer: {
    fontSize: fontSize.xs,
    fontFamily: "Inter_400Regular",
    color: emp.textMuted,
    marginTop: spacing.xl,
  },
});

// -- Default export wrapped in ErrorBoundary ----------------------------------

export default function WelcomeScreen() {
  return (
    <ErrorBoundary>
      <WelcomeScreenInner />
    </ErrorBoundary>
  );
}
