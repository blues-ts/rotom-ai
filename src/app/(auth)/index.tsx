import useSocialAuth from "@/hooks/useSocialAuth";
import { useWarmUpBrowser } from "@/hooks/useWarmUpBrowser";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const Index = () => {
  useWarmUpBrowser();
  const { loadingStrategy, handleSocialAuth } = useSocialAuth();

  const isLoadingGoogle = loadingStrategy === "oauth_google";
  const isLoadingApple = loadingStrategy === "oauth_apple";
  const isLoading = isLoadingGoogle || isLoadingApple;

  const handleGoogleAuth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleSocialAuth("oauth_google");
  };

  const handleAppleAuth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleSocialAuth("oauth_apple");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>Sign in to</Text>
          <Text style={styles.title}>Rotom AI</Text>
        </View>

        {/* Sign In Buttons */}
        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.googleButton]}
            onPress={handleGoogleAuth}
            disabled={isLoading}
          >
            {isLoadingGoogle ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={[styles.buttonText, styles.googleText]}>
                Continue with Google
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.button, styles.appleButton]}
            onPress={handleAppleAuth}
            disabled={isLoading}
          >
            {isLoadingApple ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.buttonText, styles.appleText]}>
                Continue with Apple
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 42,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -1,
  },
  buttons: {
    width: "100%",
    gap: 12,
  },
  button: {
    height: 54,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  googleButton: {
    backgroundColor: "#fff",
  },
  appleButton: {
    backgroundColor: "#1a1a1a",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  googleText: {
    color: "#000",
  },
  appleText: {
    color: "#fff",
  },
});

export default Index;
