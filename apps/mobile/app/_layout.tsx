// =============================================================================
// Root Layout — Providers, fonts, splash screen
// =============================================================================

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import { configureApiClient } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAppStore } from "@/lib/store";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const reset = useAppStore((s) => s.reset);

  useEffect(() => {
    configureApiClient({
      getToken,
      onTokenExpired: () => {
        reset();
      },
    });
  }, [reset]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <DynamicStatusBar />
        <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(guest)" />
          <Stack.Screen name="(group)" />
          <Stack.Screen name="(employee)" />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function DynamicStatusBar() {
  const mode = useAppStore((s) => s.mode);
  // Guest portal = dark bg → light status bar; Group/Employee = light bg → dark status bar
  const style = mode === "guest" || mode === null ? "light" : "dark";
  return <StatusBar style={style} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
