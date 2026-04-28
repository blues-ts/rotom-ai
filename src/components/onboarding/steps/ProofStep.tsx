import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { FlowStep } from "@/components/onboarding/FlowStep";
import { TestimonialCard } from "@/components/onboarding/TestimonialCard";
import { TESTIMONIALS } from "@/constants/onboarding";

const STAGGER_MS = 100;

export function ProofStep() {
  return (
    <FlowStep
      title="12,000+ collectors already ask River first."
      subtitle="Reviews from folks like you."
      scrollable
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
    </FlowStep>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
    marginTop: 16,
  },
});
