import Text from "@/components/Text";
import { useTheme } from "@/context/ThemeContext";
import useSocialAuth from "@/hooks/useSocialAuth";
import { useWarmUpBrowser } from "@/hooks/useWarmUpBrowser";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Dimensions, Linking, View } from "react-native";
import { AnimatedButton } from "react-native-3d-animated-buttons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const { width: screenWidth } = Dimensions.get("window");

const Index = () => {
  useWarmUpBrowser();
  const { loadingStrategy, handleSocialAuth } = useSocialAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" }}>
        {/* Logo placeholder */}
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        />

        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 48 }}>
          <Text
            style={{ fontSize: 12, color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 4, marginBottom: 8 }}
          >
            Sign in to
          </Text>
          <Text
            style={{ fontSize: 48, fontWeight: "bold", color: colors.foreground, textAlign: "center", letterSpacing: -1 }}
            accessibilityRole="header"
          >
            MyApp
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: "center" }}>
            Your app tagline goes here
          </Text>
        </View>

        {/* Sign In Buttons */}
        <View style={{ width: "100%", alignItems: "center" }}>
          <View style={{ marginBottom: 12 }}>
            <AnimatedButton
              title={isLoadingGoogle ? "Signing in..." : "Continue with Google"}
              backgroundColor={colors.primary}
              textColor={colors.primaryForeground}
              shadowColor={colors.border}
              onPress={handleGoogleAuth}
              disabled={isLoading}
              icon={"google"}
              textStyle={{ fontFamily: "Inter_500Medium", fontSize: 16 }}
              style={{ width: screenWidth - 80 }}
              minHeight={54}
            />
          </View>

          <View>
            <AnimatedButton
              title={isLoadingApple ? "Signing in..." : "Continue with Apple"}
              backgroundColor={colors.card}
              textColor={colors.foreground}
              shadowColor={colors.border}
              onPress={handleAppleAuth}
              disabled={isLoading}
              icon={"apple"}
              textStyle={{ fontFamily: "Inter_500Medium", fontSize: 16 }}
              style={{ width: screenWidth - 80 }}
              minHeight={54}
            />
          </View>
        </View>

        {/* Footer */}
        <View style={{ position: "absolute", bottom: 32, paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>
            By continuing, you agree to our{" "}
            <Text
              style={{ color: colors.foreground, textDecorationLine: "underline" }}
              onPress={() => Linking.openURL("https://yourapp.com/terms")}
            >
              Terms of Service
            </Text>
            {" "}and{" "}
            <Text
              style={{ color: colors.foreground, textDecorationLine: "underline" }}
              onPress={() => Linking.openURL("https://yourapp.com/privacy")}
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
    </View>
  );
};

export default Index;
