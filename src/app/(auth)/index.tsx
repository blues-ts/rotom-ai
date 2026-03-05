import { useTheme } from "@/context/ThemeContext";
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
  const { colors } = useTheme();
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Rotom AI
          </Text>
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, { backgroundColor: colors.secondary }]}
            onPress={handleGoogleAuth}
            disabled={isLoading}
          >
            {isLoadingGoogle ? (
              <ActivityIndicator color={colors.secondaryForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.secondaryForeground }]}>
                Continue with Google
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.button, { backgroundColor: colors.card }]}
            onPress={handleAppleAuth}
            disabled={isLoading}
          >
            {isLoadingApple ? (
              <ActivityIndicator color={colors.cardForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.cardForeground }]}>
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
    textTransform: "uppercase",
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 42,
    fontWeight: "700",
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
  buttonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});

export default Index;
