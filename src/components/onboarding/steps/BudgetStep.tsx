import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { FlowStep } from "@/components/onboarding/FlowStep";
import { OptionRow } from "@/components/onboarding/OptionRow";
import { useOnboarding } from "@/context/OnboardingContext";
import { BUDGET_OPTIONS } from "@/constants/onboarding";

const STAGGER_MS = 70;

export function BudgetStep() {
  const { budget, setBudget } = useOnboarding();

  return (
    <FlowStep
      title="What's your range per card?"
      subtitle="River flags opportunities in your budget first."
      scrollable
    >
      <View style={styles.options}>
        {BUDGET_OPTIONS.map((opt, i) => (
          <Animated.View
            key={opt.id}
            entering={FadeInDown.duration(400).delay(i * STAGGER_MS)}
          >
            <OptionRow
              icon={opt.icon}
              label={opt.label}
              selected={budget === opt.id}
              onPress={() => setBudget(opt.id)}
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
