// =============================================================================
// Loyal App -- Auth Stack (welcome, login, register, forgot-password, hotel-select)
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
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="hotel-select" />
    </Stack>
  );
}
