import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { SplashScreen } from "expo-router";
import { AnimatedButton } from "react-native-3d-animated-buttons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import useSocialAuth from "@/hooks/useSocialAuth";
import { useWarmUpBrowser } from "@/hooks/useWarmUpBrowser";
import Onboarding from "@/components/Onboarding";

WebBrowser.maybeCompleteAuthSession();

const ONBOARDING_KEY = "onboarding_complete";

const Index = () => {
  useWarmUpBrowser();
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { loadingStrategy, handleSocialAuth } = useSocialAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const cameFromOnboarding = useRef(false);

  const isLoadingGoogle = loadingStrategy === "oauth_google";
  const isLoadingApple = loadingStrategy === "oauth_apple";
  const isLoading = isLoadingGoogle || isLoadingApple;

  useEffect(() => {
    SecureStore.getItemAsync(ONBOARDING_KEY).then((value) => {
      setHasCompletedOnboarding(value === "true");
      SplashScreen.hideAsync();
    });
  }, []);

  const handleOnboardingComplete = async () => {
    await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
    cameFromOnboarding.current = true;
    setHasCompletedOnboarding(true);
  };

  if (hasCompletedOnboarding === null) return null;

  if (!hasCompletedOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const entering = cameFromOnboarding.current ? FadeIn.duration(500) : undefined;

  return (
    <Animated.View style={styles.container} entering={entering}>
      <LinearGradient
        colors={[colors.primary, colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.hero}>
        <Image
          source="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/501.gif"
          style={styles.sprite}
          contentFit="contain"
        />
        <Text style={[styles.title, { color: colors.foreground }]}>
          River AI
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Your Pokemon TCG AI Assistant
        </Text>
      </View>

      <View style={[styles.buttons, { paddingBottom: bottom + 16 }]}>
        <AnimatedButton
          title="Continue with Google"
          onPress={() => handleSocialAuth("oauth_google")}
          icon="google"
          backgroundColor={colors.secondary}
          textColor={colors.secondaryForeground}
          shadowColor="#00000040"
          disabled={isLoading}
          loading={isLoadingGoogle}
          loadingText="Signing in..."
          fullWidth
        />
        <AnimatedButton
          title="Continue with Apple"
          onPress={() => handleSocialAuth("oauth_apple")}
          icon="apple"
          backgroundColor={colors.card}
          textColor={colors.cardForeground}
          shadowColor="#00000040"
          disabled={isLoading}
          loading={isLoadingApple}
          loadingText="Signing in..."
          fullWidth
        />
        <Text style={[styles.legalText, { color: colors.mutedForeground }]}>
          By continuing, you agree to our{" "}
          <Text
            style={[styles.legalLink, { color: colors.primary }]}
            onPress={() => Linking.openURL("https://example.com/terms")}
          >
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text
            style={[styles.legalLink, { color: colors.primary }]}
            onPress={() => Linking.openURL("https://example.com/privacy")}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sprite: {
    width: 96,
    height: 96,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 24,
  },
  buttons: {
    paddingHorizontal: 24,
    gap: 12,
  },
  legalText: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  legalLink: {
    textDecorationLine: "underline",
  },
});

export default Index;
