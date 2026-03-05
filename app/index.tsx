import { useOnboarding } from "@/hooks/useOnboarding";
import { Redirect } from "expo-router";
import React from "react";

export default function Index() {
  const { hasSeenOnboarding, isLoading } = useOnboarding();

  if (isLoading) {
    return null;
  }

  if (!hasSeenOnboarding) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  return <Redirect href="/(auth)" />;
}
