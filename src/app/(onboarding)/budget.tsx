import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { OptionRow } from "@/components/onboarding/OptionRow";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useOnboarding } from "@/context/OnboardingContext";
import { BUDGET_OPTIONS, STEP_NUMBERS } from "@/constants/onboarding";

const STAGGER_MS = 70;

export default function Budget() {
  const { budget, setBudget } = useOnboarding();

  return (
    <ScreenLayout
      step={STEP_NUMBERS.budget}
      title="What's your range per card?"
      subtitle="River flags opportunities in your budget first."
      scrollable
      footer={
        <PrimaryCTA
          title="Continue"
          disabled={!budget}
          onPress={() => router.push("/(onboarding)/camera")}
        />
      }
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: 10,
    marginTop: 20,
  },
});
