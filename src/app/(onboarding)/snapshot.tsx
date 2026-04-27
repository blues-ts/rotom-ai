import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { PrimaryCTA, TextLink } from "@/components/onboarding/PrimaryCTA";
import { RiverSnapshotCard } from "@/components/onboarding/RiverSnapshotCard";
import { useOnboarding } from "@/context/OnboardingContext";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { useTheme } from "@/context/ThemeContext";

const PROCESSING_MS = 1400;

export default function Snapshot() {
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { demoCard, demoResponse } = useOnboarding();
  const [isProcessing, setIsProcessing] = useState(true);
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
    const t = setTimeout(() => setIsProcessing(false), PROCESSING_MS);
    return () => {
      cancelAnimation(spin);
      clearTimeout(t);
    };
  }, [spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  if (!demoCard) {
    router.replace("/(onboarding)/demo");
    return null;
  }

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // TODO: upgrade to image-share via react-native-view-shot + expo-sharing.
    try {
      await Share.share({
        message: `River says on ${demoCard.name}: "${demoResponse}"\n\nRaw NM: $${demoCard.rawNM} · PSA 10: $${demoCard.psa10.toLocaleString()} (${demoCard.pct30d >= 0 ? "+" : ""}${demoCard.pct30d}% 30d)\n\nTry River: riverai.app`,
      });
    } catch {
      // User dismissed; no-op.
    }
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(onboarding)/paywall");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: top }]}>
      <OnboardingHeader step={STEP_NUMBERS.snapshot} showProgress />

      {isProcessing ? (
        <View style={styles.loading}>
          <Animated.View
            style={[
              styles.spinner,
              { borderColor: colors.border, borderTopColor: colors.primary },
              spinStyle,
            ]}
          />
          <Text style={[styles.loadingText, { color: colors.foreground }]}>
            Saving your River snapshot…
          </Text>
        </View>
      ) : (
        <>
          <Animated.View entering={FadeIn.duration(400)} style={styles.titleWrap}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Your first snapshot.
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Screenshot it or tap share.
            </Text>
          </Animated.View>

          <View style={styles.cardWrap}>
            <Animated.View entering={FadeInUp.duration(400).delay(120)} style={styles.cardInner}>
              <RiverSnapshotCard card={demoCard} riverQuote={demoResponse} />
            </Animated.View>
          </View>

          <Animated.View
            entering={FadeInUp.duration(300).delay(300)}
            style={[styles.footer, { paddingBottom: bottom + 12 }]}
          >
            <PrimaryCTA title="Build my collection →" onPress={handleNext} />
            <TextLink title="Share snapshot" onPress={handleShare} color={colors.primary} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
  },
  titleWrap: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  cardWrap: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  cardInner: {
    width: "100%",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 2,
  },
});
