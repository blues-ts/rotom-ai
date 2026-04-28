import { Stack } from "expo-router";

import { OnboardingProvider } from "@/context/OnboardingContext";

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="welcome" options={{ animation: "fade" }} />
        <Stack.Screen name="flow" options={{ animation: "fade" }} />
        <Stack.Screen name="processing" options={{ animation: "fade" }} />
        <Stack.Screen name="demo" options={{ animation: "fade" }} />
        <Stack.Screen name="demo-chat" options={{ animation: "fade" }} />
        <Stack.Screen name="snapshot" options={{ animation: "fade" }} />
        <Stack.Screen name="paywall" options={{ animation: "fade" }} />
      </Stack>
    </OnboardingProvider>
  );
}
