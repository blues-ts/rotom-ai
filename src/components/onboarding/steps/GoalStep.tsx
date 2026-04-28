import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { FlowStep } from "@/components/onboarding/FlowStep";
import { OptionRow } from "@/components/onboarding/OptionRow";
import { useOnboarding } from "@/context/OnboardingContext";
import { GOAL_OPTIONS } from "@/constants/onboarding";

const STAGGER_MS = 70;

export function GoalStep() {
  const { goal, setGoal } = useOnboarding();

  return (
    <FlowStep
      title="What brings you here?"
      subtitle="We'll tune River for you."
      scrollable
    >
      <View style={styles.options}>
        {GOAL_OPTIONS.map((opt, i) => (
          <Animated.View
            key={opt.id}
            entering={FadeInDown.duration(400).delay(i * STAGGER_MS)}
          >
            <OptionRow
              icon={opt.icon}
              label={opt.label}
              selected={goal === opt.id}
              onPress={() => setGoal(opt.id)}
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
