// =============================================================================
// Sentry Error Tracking -- Expo / React Native
// =============================================================================

import * as Sentry from "@sentry/react-native";

const SENTRY_DSN = ""; // Will be set when Sentry project is created

export function initSentry() {
  if (!SENTRY_DSN) return; // Skip if DSN not configured

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: __DEV__ ? "development" : "production",
    enabled: !__DEV__,
  });
}

export { Sentry };
