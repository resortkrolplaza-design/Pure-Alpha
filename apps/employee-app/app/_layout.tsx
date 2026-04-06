// =============================================================================
// Root Layout -- Providers, fonts, splash screen
// =============================================================================

import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, AppState, Platform } from "react-native";
import { configureEmployeeApi } from "@/lib/employee-api";
import { logout } from "@/lib/auth";
import { useAppStore } from "@/lib/store";
import { initSentry } from "@/lib/sentry";

initSentry();

// TanStack Query: refetch on app focus (React Native needs manual AppState wiring)
if (Platform.OS !== "web") {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (state) => {
      handleFocus(state === "active");
    });
    return () => sub.remove();
  });
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const reset = useAppStore((s) => s.reset);

  useEffect(() => {
    const handleSessionExpired = async () => {
      await logout();
      reset();
      router.replace("/");
    };

    configureEmployeeApi({ onSessionExpired: handleSessionExpired });
  }, [reset]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(employee)" />
          <Stack.Screen name="clock-scan" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
