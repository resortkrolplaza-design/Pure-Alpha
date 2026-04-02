// =============================================================================
// Loyal App -- Design Tokens (Navy + Gold dark theme)
// Primary: gold (#D4AF37) on navy (#0D2236)
// =============================================================================

import { Platform } from "react-native";

// -- Loyal App: Navy + Gold ---------------------------------------------------

export const loyal = {
  bg: "#0D2236",
  bgLight: "#132d47",
  primary: "#D4AF37",
  primaryLight: "rgba(212,175,55,0.15)",
  text: "#ffffff",
  textSecondary: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.4)",
  card: "rgba(255,255,255,0.08)",
  cardBorder: "rgba(255,255,255,0.12)",
  surface: "rgba(255,255,255,0.05)",
  inputBg: "rgba(255,255,255,0.08)",
  inputBorder: "rgba(255,255,255,0.15)",
  overlay: "rgba(0,0,0,0.6)",
  success: "#10b981",
  danger: "#ef4444",
  warning: "#f59e0b",
  white: "#ffffff",
  shadowDark: "#000000",
  tabBarBg: "#0a1a2e",
  contentBg: "#FBF9F5",
  bgDark: "#081624",
  primaryFaint: "rgba(212,175,55,0.08)",
  primaryDark: "#b8941e",
  textDim: "rgba(255,255,255,0.3)",
  tabInactive: "rgba(255,255,255,0.5)",
  waveLight: "rgba(212,175,55,0.15)",
  waveMedium: "rgba(212,175,55,0.25)",
  waveFaint: "rgba(212,175,55,0.05)",
} as const;

// -- Spacing (px values, NOT rem) ---------------------------------------------

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64,
} as const;

// -- Border Radius ------------------------------------------------------------

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  full: 9999,
} as const;

// -- Typography ---------------------------------------------------------------

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const letterSpacing = { tight: -0.3, snug: -0.5 } as const;

// -- Shadows (platform-specific) ----------------------------------------------

export const shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
  }),
  md: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 4 },
  }),
  lg: Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
    },
    android: { elevation: 8 },
  }),
} as const;

// -- Touch Target (WCAG AA) --------------------------------------------------

export const TOUCH_TARGET = 44;

// -- Animation ----------------------------------------------------------------

export const animation = {
  fast: 150,
  normal: 250,
  slow: 350,
  spring: { damping: 15, stiffness: 150, mass: 1 },
  springBounce: { damping: 12, stiffness: 200, mass: 0.8 },
} as const;
