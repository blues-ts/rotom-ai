import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { OptionRow } from "@/components/onboarding/OptionRow";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useOnboarding } from "@/context/OnboardingContext";
import { PAIN_OPTIONS, STEP_NUMBERS } from "@/constants/onboarding";

const STAGGER_MS = 70;

export default function Pain() {
  const { pains, togglePain } = useOnboarding();

  return (
    <ScreenLayout
      step={STEP_NUMBERS.pain}
      title="What slows you down today?"
      subtitle="Pick as many as hit."
      scrollable
      footer={
        <PrimaryCTA
          title="Continue"
          disabled={pains.length === 0}
          onPress={() => router.push("/(onboarding)/proof")}
        />
      }
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: 10,
    marginTop: 20,
  },
});
