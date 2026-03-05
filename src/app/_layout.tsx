import AuthSync from "@/components/AuthSync";
import { queryClient } from "@/config/queryClient";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ClerkLoaded, ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AppContent() {
  const { theme, colors } = useTheme();

  const navigationTheme = theme === "dark" ? DarkTheme : DefaultTheme;

  return (
    <NavigationThemeProvider
      value={{
        ...navigationTheme,
        colors: {
          ...navigationTheme.colors,
          background: colors.background,
          card: colors.background,
          text: colors.foreground,
          border: colors.border,
          primary: colors.primary,
        },
      }}
    >
      <AuthSync />
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        <Stack.Screen name="(home)" options={{ animation: "fade" }} />
        <Stack.Screen
          name="(settings)"
          options={{
            animation: "slide_from_right",
            headerShown: true,
            headerTitle: "Settings",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.foreground,
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  SplashScreen.hideAsync();

  if (!publishableKey) {
    throw new Error("Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file");
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <ClerkLoaded>
            <AppContent />
          </ClerkLoaded>
        </ClerkProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
