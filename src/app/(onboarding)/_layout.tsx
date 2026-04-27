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
        <Stack.Screen name="goal" />
        <Stack.Screen name="pain" />
        <Stack.Screen name="proof" />
        <Stack.Screen name="solution" />
        <Stack.Screen name="comparison" />
        <Stack.Screen name="eras" />
        <Stack.Screen name="budget" />
        <Stack.Screen name="camera" />
        <Stack.Screen name="processing" options={{ animation: "fade" }} />
        <Stack.Screen name="demo" />
        <Stack.Screen name="demo-chat" />
        <Stack.Screen name="snapshot" options={{ animation: "fade" }} />
        <Stack.Screen name="paywall" options={{ animation: "fade" }} />
      </Stack>
    </OnboardingProvider>
  );
}
