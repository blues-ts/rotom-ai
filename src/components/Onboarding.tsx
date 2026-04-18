import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { AnimatedButton } from "react-native-3d-animated-buttons";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";

const OSHAWOTT_SPRITE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/501.gif";

type Step = {
  title: string;
  description: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

const STEPS: Step[] = [
  {
    title: "Welcome to River AI",
    description: "Your Pokemon TCG AI Assistant",
  },
  {
    title: "Scan Any Card",
    description:
      "Point your camera at any Pokemon card and get instant AI-powered identification and analysis",
    icon: "camera-outline",
  },
  {
    title: "Get AI Insights",
    description:
      "Ask questions about card values, deck building strategies, and market trends",
    icon: "chatbubble-outline",
  },
  {
    title: "Track Your Collection",
    description:
      "Organize your cards into collections and track your portfolio",
    icon: "folder-outline",
  },
];

const LAST_STEP = STEPS.length - 1;

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);

  const contentOpacity = useSharedValue(1);
  const contentTranslateY = useSharedValue(0);

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const animateToStep = useCallback(
    (nextStep: number) => {
      setCurrentStep(nextStep);
      contentTranslateY.value = 30;
      contentOpacity.value = withTiming(1, { duration: 300 });
      contentTranslateY.value = withTiming(0, { duration: 300 });
    },
    [contentOpacity, contentTranslateY],
  );

  const nextStep = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (currentStep === LAST_STEP) {
      onComplete();
      return;
    }

    const next = currentStep + 1;
    contentOpacity.value = withTiming(0, { duration: 200 });
    contentTranslateY.value = withTiming(-20, { duration: 200 }, () => {
      runOnJS(animateToStep)(next);
    });
  }, [currentStep, onComplete, contentOpacity, contentTranslateY, animateToStep]);

  const step = STEPS[currentStep];
  const isFirstStep = currentStep === 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, colors.background]}
        style={StyleSheet.absoluteFill}
      />

      {/* Step Content */}
      <View style={styles.hero}>
        <Animated.View style={[styles.content, animatedContentStyle]}>
          {isFirstStep ? (
            <Image
              source={OSHAWOTT_SPRITE}
              style={styles.sprite}
              contentFit="contain"
            />
          ) : step.icon ? (
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name={step.icon} size={48} color={colors.primary} />
            </View>
          ) : null}

          <Text style={[styles.title, { color: colors.foreground }]}>
            {step.title}
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {step.description}
          </Text>
        </Animated.View>
      </View>

      {/* Bottom Area */}
      <View style={[styles.bottom, { paddingBottom: bottom + 16 }]}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === currentStep ? colors.primary : colors.mutedForeground + "40",
                  width: i === currentStep ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        <AnimatedButton
          title={currentStep === LAST_STEP ? "Get Started" : "Continue"}
          onPress={nextStep}
          backgroundColor={colors.primary}
          textColor={colors.primaryForeground}
          shadowColor="#00000040"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  sprite: {
    width: 96,
    height: 96,
    marginBottom: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 24,
  },
  bottom: {
    paddingHorizontal: 24,
    gap: 12,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
