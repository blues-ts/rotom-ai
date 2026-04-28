import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { FlowStep } from "@/components/onboarding/FlowStep";
import { OptionRow } from "@/components/onboarding/OptionRow";
import { useOnboarding } from "@/context/OnboardingContext";
import { PAIN_OPTIONS } from "@/constants/onboarding";

const STAGGER_MS = 70;

export function PainStep() {
  const { pains, togglePain } = useOnboarding();

  return (
    <FlowStep
      title="What slows you down today?"
      subtitle="Pick as many as hit."
      scrollable
    >
      <View style={styles.options}>
        {PAIN_OPTIONS.map((opt, i) => (
          <Animated.View
            key={opt.id}
            entering={FadeInDown.duration(400).delay(i * STAGGER_MS)}
          >
            <OptionRow
              icon={opt.icon}
              label={opt.label}
              selected={pains.includes(opt.id)}
              multi
              onPress={() => togglePain(opt.id)}
            />
          </Animated.View>
        ))}
      </View>
    </FlowStep>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: 10,
    marginTop: 20,
  },
});
