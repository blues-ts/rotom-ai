import { Linking, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { AnimatedButton } from "react-native-3d-animated-buttons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import useSocialAuth from "@/hooks/useSocialAuth";
import { useWarmUpBrowser } from "@/hooks/useWarmUpBrowser";

WebBrowser.maybeCompleteAuthSession();

const Index = () => {
  useWarmUpBrowser();
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { loadingStrategy, handleSocialAuth } = useSocialAuth();

  const isLoadingGoogle = loadingStrategy === "oauth_google";
  const isLoadingApple = loadingStrategy === "oauth_apple";
  const isLoading = isLoadingGoogle || isLoadingApple;

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(500)}>
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
        <Text style={[styles.title, { color: colors.foreground }]}>River AI</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Your Pokemon TCG AI Assistant
        </Text>
      </View>

      <View style={[styles.buttons, { paddingBottom: bottom + 16 }]}>
        <AnimatedButton
          title="Continue with Apple"
          onPress={() => handleSocialAuth("oauth_apple")}
          icon="apple"
          backgroundColor="#000000"
          textColor="#ffffff"
          shadowColor="#2a2a2a"
          disabled={isLoading}
          loading={isLoadingApple}
          loadingText="Signing in..."
          fullWidth
        />
        <AnimatedButton
          title="Continue with Google"
          onPress={() => handleSocialAuth("oauth_google")}
          icon="google"
          backgroundColor="#ffffff"
          textColor="#000000"
          shadowColor="#d4d4d4"
          disabled={isLoading}
          loading={isLoadingGoogle}
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
