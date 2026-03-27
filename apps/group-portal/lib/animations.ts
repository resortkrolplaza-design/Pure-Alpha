// =============================================================================
// Pure Alpha Mobile -- Animation Utilities (RN Animated API)
// Apple-style spring physics and entrance animations.
// No react-native-reanimated -- Expo Go SDK 54 compatible.
// =============================================================================

import { useRef, useEffect, useCallback } from "react";
import { Animated, LayoutAnimation, Platform, UIManager } from "react-native";
import { animation } from "./tokens";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// -- Spring Press Animation (for Pressable cards/buttons) ---------------------
// Returns onPressIn/onPressOut handlers + animated scale style.
// Usage: const { scaleStyle, onPressIn, onPressOut } = useScalePress();
//        <Animated.View style={scaleStyle}>...</Animated.View>

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

// -- Fade In on Mount --------------------------------------------------------
// Usage: const fadeStyle = useFadeIn(200);
//        <Animated.View style={fadeStyle}>...</Animated.View>

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

// -- Slide Up + Fade In on Mount ---------------------------------------------
// Usage: const slideStyle = useSlideUp(100);
//        <Animated.View style={slideStyle}>...</Animated.View>

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

// -- Layout Animation for List/Tab Transitions --------------------------------
// Usage: configureListAnimation(); setSection("foo");

export function configureListAnimation() {
  LayoutAnimation.configureNext({
    duration: animation.normal,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

// -- Rotation Animation (for FAQ chevrons, expand/collapse) -------------------
// Usage: const rotation = useRotation(isExpanded);
//        <Animated.View style={{ transform: [{ rotate: rotation }] }}>

export function useRotation(expanded: boolean) {
  const anim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: expanded ? 1 : 0,
      duration: animation.fast,
      useNativeDriver: true,
    }).start();
  }, [expanded, anim]);

  return anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });
}
