import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { OptionRow } from "@/components/onboarding/OptionRow";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useOnboarding } from "@/context/OnboardingContext";
import { GOAL_OPTIONS, STEP_NUMBERS } from "@/constants/onboarding";

const STAGGER_MS = 70;

export default function Goal() {
  const { goal, setGoal } = useOnboarding();

  return (
    <ScreenLayout
      step={STEP_NUMBERS.goal}
      title="What brings you here?"
      subtitle="We'll tune River for you."
      scrollable
      footer={
        <PrimaryCTA
          title="Continue"
          disabled={!goal}
          onPress={() => router.push("/(onboarding)/pain")}
        />
      }
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: 10,
    marginTop: 20,
  },
});
