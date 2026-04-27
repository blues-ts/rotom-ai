import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { TestimonialCard } from "@/components/onboarding/TestimonialCard";
import { STEP_NUMBERS, TESTIMONIALS } from "@/constants/onboarding";

const STAGGER_MS = 100;

export default function Proof() {
  return (
    <ScreenLayout
      step={STEP_NUMBERS.proof}
      title="12,000+ collectors already ask River first."
      subtitle="Reviews from folks like you."
      scrollable
      footer={
        <PrimaryCTA
          title="Continue"
          onPress={() => router.push("/(onboarding)/solution")}
        />
      }
    >
      <View style={styles.list}>
        {TESTIMONIALS.map((t, i) => (
          <Animated.View
            key={t.name}
            entering={FadeInDown.duration(400).delay(i * STAGGER_MS)}
          >
            <TestimonialCard {...t} />
          </Animated.View>
        ))}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
    marginTop: 20,
  },
});
