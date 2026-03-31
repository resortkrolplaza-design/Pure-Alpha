// =============================================================================
// Employee App -- Animation Utilities (RN Animated API)
// Apple-style spring physics and entrance animations.
// No react-native-reanimated -- Expo Go SDK 54 compatible.
// =============================================================================

import { useRef, useEffect, useCallback, useState } from "react";
import { Animated, AccessibilityInfo } from "react-native";
import { animation } from "./tokens";

// -- Reduced Motion Hook (a11y) ------------------------------------------------
// Reads system "Reduce Motion" setting. Returns true when animations should be
// suppressed (static values only, no loops/springs).

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v) => { if (mounted) setReduced(v); },
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

// -- Spring Press Animation (for Pressable cards/buttons) ---------------------
// Returns onPressIn/onPressOut handlers + animated scale style.

export function useScalePress(toValue = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue,
      damping: animation.spring.damping,
      stiffness: animation.spring.stiffness,
      mass: animation.spring.mass,
      useNativeDriver: true,
    }).start();
  }, [scale, toValue]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      damping: animation.spring.damping,
      stiffness: animation.spring.stiffness,
      mass: animation.spring.mass,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const scaleStyle = { transform: [{ scale }] };

  return { scaleStyle, onPressIn, onPressOut };
}

// -- Fade In on Mount ---------------------------------------------------------

export function useFadeIn(delay = 0) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: animation.normal,
      delay,
      useNativeDriver: true,
    }).start();
  }, [opacity, delay, reducedMotion]);

  return { opacity };
}

// -- Slide Up + Fade In on Mount ----------------------------------------------

export function useSlideUp(delay = 0, distance = 20) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reducedMotion ? 0 : distance)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: animation.normal,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: animation.spring.damping,
        stiffness: animation.spring.stiffness,
        mass: animation.spring.mass,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, delay, distance, reducedMotion]);

  return { opacity, transform: [{ translateY }] };
}

