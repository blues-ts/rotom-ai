import Text from "@/components/Text";
import { useTheme } from "@/context/ThemeContext";
import { useOnboarding } from "@/hooks/useOnboarding";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { AnimatedButton } from "react-native-3d-animated-buttons";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const insets = useSafeAreaInsets();
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
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 }}>
        {/* Skip Button */}
        <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [{ paddingHorizontal: 16, paddingVertical: 8 }, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 14, fontWeight: "500" }}>Skip</Text>
          </Pressable>
        </View>

        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <Text
            style={{ fontSize: 12, color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 4, marginBottom: 8 }}
          >
            Welcome to
          </Text>
          <Text
            style={{ fontSize: 48, fontWeight: "bold", color: colors.foreground, textAlign: "center", letterSpacing: -1 }}
          >
            MyApp
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: "center" }}>
            Your app tagline goes here
          </Text>
        </View>

        {/* Carousel */}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
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
                  <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Media here</Text>
                </View>
                <Text
                  style={{ fontSize: 24, fontWeight: "600", color: colors.foreground, textAlign: "center", marginBottom: 12, letterSpacing: -0.5 }}
                >
                  {feature.title}
                </Text>
                <Text style={{ fontSize: 16, textAlign: "center", color: colors.mutedForeground, lineHeight: 24 }}>
                  {feature.description}
                </Text>
              </View>
            ))}
          </PagerView>

          {/* Page indicators */}
          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 16 }}>
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
        <View style={{ alignItems: "center", paddingTop: 16 }}>
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
    </View>
  );
}
