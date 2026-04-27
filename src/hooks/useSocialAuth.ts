import { useSSO } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { useState } from "react";
import { Alert } from "react-native";

function useSocialAuth() {
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null);
  const { startSSOFlow } = useSSO();

  const handleSocialAuth = async (strategy: "oauth_google" | "oauth_apple") => {
    setLoadingStrategy(strategy);
    try {
      const { createdSessionId, setActive, signIn, signUp } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: "riverai",
          path: "sso-callback",
        }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        const provider = strategy === "oauth_google" ? "Google" : "Apple";
        const signInStatus = signIn?.status;
        const signUpStatus = signUp?.status;
        console.warn(
          `[SignIn] No session from ${provider} - user may have cancelled or has missing requirements`,
          { signInStatus, signUpStatus, missingFields: signUp?.missingFields }
        );
        const hasMissingRequirements =
          (signUp?.missingFields?.length ?? 0) > 0 || signUpStatus === "missing_requirements";
        if (hasMissingRequirements) {
          Alert.alert(
            "Complete sign up",
            "Additional information is required to finish signing in."
          );
        }
      }
    } catch (error) {
      const provider = strategy === "oauth_google" ? "Google" : "Apple";
      console.error(`[SignIn] Error signing in with ${provider}:`, error);
      if (error instanceof Error) {
        console.error("[SignIn] Error message:", error.message);
        console.error("[SignIn] Error stack:", error.stack);
      }
      Alert.alert(`Error signing in with ${provider}`, "Please try again.");
    } finally {
      setLoadingStrategy(null);
    }
  };

  return {
    loadingStrategy,
    handleSocialAuth,
  };
}

export default useSocialAuth;
