import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { debug } = useLocalSearchParams<{ debug?: string }>();

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn && !(__DEV__ && debug === "true")) {
    return <Redirect href="/(home)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
