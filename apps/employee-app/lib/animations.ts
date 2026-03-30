// =============================================================================
// Employee App -- Animation Utilities (RN Animated API)
// Apple-style spring physics and entrance animations.
// No react-native-reanimated -- Expo Go SDK 54 compatible.
// =============================================================================

import { useRef, useEffect, useCallback } from "react";
import { Animated } from "react-native";
import { animation } from "./tokens";

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
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: animation.normal,
      delay,
      useNativeDriver: true,
    }).start();
  }, [opacity, delay]);

  return { opacity };
}

// -- Slide Up + Fade In on Mount ----------------------------------------------

export function useSlideUp(delay = 0, distance = 20) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
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
  }, [opacity, translateY, delay, distance]);

  return { opacity, transform: [{ translateY }] };
}

