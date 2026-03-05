import Text from "@/components/Text";
import { useTheme } from "@/context/ThemeContext";
import useSocialAuth from "@/hooks/useSocialAuth";
import { useWarmUpBrowser } from "@/hooks/useWarmUpBrowser";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Dimensions, Linking, View } from "react-native";
import { AnimatedButton } from "react-native-3d-animated-buttons";
import { SafeAreaView } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const { width: screenWidth } = Dimensions.get("window");

const Index = () => {
  useWarmUpBrowser();
  const { loadingStrategy, handleSocialAuth } = useSocialAuth();
  const { colors } = useTheme();

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
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 justify-center items-center">
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
        <View className="items-center mb-12">
          <Text
            className="text-xs text-muted-foreground uppercase tracking-widest mb-2"
            style={{ letterSpacing: 4 }}
          >
            Sign in to
          </Text>
          <Text
            className="text-5xl font-bold text-foreground text-center"
            style={{ letterSpacing: -1 }}
            accessibilityRole="header"
          >
            MyApp
          </Text>
          <Text className="text-sm text-muted-foreground mt-2 text-center">
            Your app tagline goes here
          </Text>
        </View>

        {/* Sign In Buttons */}
        <View className="w-full items-center">
          <View className="mb-3">
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
        <View className="absolute bottom-8 px-6">
          <Text className="text-xs text-muted-foreground text-center leading-5">
            By continuing, you agree to our{" "}
            <Text
              className="text-foreground underline"
              onPress={() => Linking.openURL("https://yourapp.com/terms")}
            >
              Terms of Service
            </Text>
            {" "}and{" "}
            <Text
              className="text-foreground underline"
              onPress={() => Linking.openURL("https://yourapp.com/privacy")}
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default Index;
