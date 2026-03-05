import Text from "@/components/Text";
import { useTheme } from "@/context/ThemeContext";
import { useOnboarding } from "@/hooks/useOnboarding";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { AnimatedButton } from "react-native-3d-animated-buttons";
import PagerView from "react-native-pager-view";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: screenWidth } = Dimensions.get("window");

// Update these features to describe your app
const features = [
  { title: "Feature One", description: "Describe your first key feature here." },
  { title: "Feature Two", description: "Describe your second key feature here." },
  { title: "Feature Three", description: "Describe your third key feature here." },
];

export default function WelcomeScreen() {
  const { completeOnboarding } = useOnboarding();
  const { colors } = useTheme();
  const [currentPage, setCurrentPage] = useState(0);

  const handleGetStarted = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await completeOnboarding();
    } catch (error) {}
    router.replace("/(auth)");
  };

  const handleSkip = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await completeOnboarding();
    } catch (error) {}
    router.replace("/(auth)");
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 pt-4 pb-4">
        {/* Skip Button */}
        <View className="items-end mb-2">
          <Pressable
            onPress={handleSkip}
            className="px-4 py-2 active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text className="text-muted-foreground text-sm font-medium">Skip</Text>
          </Pressable>
        </View>

        {/* Header */}
        <View className="items-center mb-4">
          <Text
            className="text-xs text-muted-foreground uppercase tracking-widest mb-2"
            style={{ letterSpacing: 4 }}
          >
            Welcome to
          </Text>
          <Text
            className="text-5xl font-bold text-foreground text-center"
            style={{ letterSpacing: -1 }}
          >
            MyApp
          </Text>
          <Text className="text-sm text-muted-foreground mt-2 text-center">
            Your app tagline goes here
          </Text>
        </View>

        {/* Carousel */}
        <View className="flex-1 justify-center items-center">
          <PagerView
            style={{ width: screenWidth - 48, flex: 1 }}
            initialPage={0}
            onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
          >
            {features.map((feature, index) => (
              <View
                key={index}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}
              >
                {/* Replace with Lottie/Image per feature */}
                <View
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: 20,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 24,
                  }}
                >
                  <Text className="text-muted-foreground text-sm">Media here</Text>
                </View>
                <Text
                  className="text-2xl font-semibold text-foreground text-center mb-3"
                  style={{ letterSpacing: -0.5 }}
                >
                  {feature.title}
                </Text>
                <Text className="text-base text-center text-muted-foreground leading-6">
                  {feature.description}
                </Text>
              </View>
            ))}
          </PagerView>

          {/* Page indicators */}
          <View className="flex-row justify-center mt-4">
            {features.map((_, index) => (
              <View
                key={index}
                style={{
                  height: 10,
                  borderRadius: 5,
                  marginHorizontal: 5,
                  width: index === currentPage ? 28 : 10,
                  backgroundColor: index === currentPage ? colors.primary : colors.border,
                }}
              />
            ))}
          </View>
        </View>

        {/* CTA */}
        <View className="items-center pt-4">
          <AnimatedButton
            title="Get Started"
            backgroundColor={colors.primary}
            textColor={colors.primaryForeground}
            shadowColor={colors.border}
            onPress={handleGetStarted}
            textStyle={{ fontFamily: "Inter_600SemiBold", fontSize: 16, letterSpacing: 0.5 }}
            style={{ width: screenWidth - 80 }}
            minHeight={54}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
