import { useSSO } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { useState } from "react";
import { Alert } from "react-native";

// Update this scheme to match your app.json scheme value
const APP_SCHEME = "myapp";

function useSocialAuth() {
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null);
  const { startSSOFlow } = useSSO();

  const handleSocialAuth = async (strategy: "oauth_google" | "oauth_apple") => {
    setLoadingStrategy(strategy);
    try {
      const { createdSessionId, setActive, signIn, signUp } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: APP_SCHEME,
          path: "sso-callback",
        }),
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      } else {
        const provider = strategy === "oauth_google" ? "Google" : "Apple";
        const hasMissingRequirements =
          (signUp?.missingFields?.length ?? 0) > 0 ||
          signUp?.status === "missing_requirements";

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
