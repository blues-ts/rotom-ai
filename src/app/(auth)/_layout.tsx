import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect, SplashScreen, Stack, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";

const ONBOARDING_KEY = "onboarding_complete";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { debug } = useLocalSearchParams<{ debug?: string }>();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    SecureStore.getItemAsync(ONBOARDING_KEY).then((value) => {
      setHasCompletedOnboarding(value === "true");
    });
  }, []);

  if (!isLoaded || hasCompletedOnboarding === null) {
    return null;
  }

  if (isSignedIn && !(__DEV__ && debug === "true")) {
    SplashScreen.hideAsync();
    if (!hasCompletedOnboarding) {
      return <Redirect href="/(onboarding)/paywall" />;
    }
    return <Redirect href="/(home)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
