import { useEffect, useState } from "react";
import { Redirect, SplashScreen } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@clerk/clerk-expo";

const ONBOARDING_KEY = "onboarding_complete";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(ONBOARDING_KEY).then((value) => {
      setHasCompletedOnboarding(value === "true");
      SplashScreen.hideAsync();
    });
  }, []);

  if (hasCompletedOnboarding === null || !isLoaded) return null;

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (isSignedIn) {
    return <Redirect href="/(home)" />;
  }

  return <Redirect href="/(auth)" />;
}
