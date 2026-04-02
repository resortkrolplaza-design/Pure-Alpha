// =============================================================================
// Loyal App -- Auth Stack (welcome + enter-token)
// =============================================================================

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_bottom",
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="enter-token" />
    </Stack>
  );
}
