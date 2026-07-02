import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCameraPermission } from "react-native-vision-camera";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { PrimaryCTA, TextLink } from "@/components/onboarding/PrimaryCTA";
import { BudgetStep } from "@/components/onboarding/steps/BudgetStep";
import { CameraStep } from "@/components/onboarding/steps/CameraStep";
import { ComparisonStep } from "@/components/onboarding/steps/ComparisonStep";
import { ErasStep } from "@/components/onboarding/steps/ErasStep";
import { GoalStep } from "@/components/onboarding/steps/GoalStep";
import { PainStep } from "@/components/onboarding/steps/PainStep";
import { ProofStep } from "@/components/onboarding/steps/ProofStep";
import { SolutionStep } from "@/components/onboarding/steps/SolutionStep";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { useRiverTheme } from "@/constants/theme";

interface StepEntry {
  number: number;
  Component: React.ComponentType;
}

const STEPS: StepEntry[] = [
  { number: STEP_NUMBERS.goal, Component: GoalStep },
  { number: STEP_NUMBERS.pain, Component: PainStep },
  { number: STEP_NUMBERS.proof, Component: ProofStep },
  { number: STEP_NUMBERS.solution, Component: SolutionStep },
  { number: STEP_NUMBERS.comparison, Component: ComparisonStep },
  { number: STEP_NUMBERS.eras, Component: ErasStep },
  { number: STEP_NUMBERS.budget, Component: BudgetStep },
  { number: STEP_NUMBERS.camera, Component: CameraStep },
];

export default function Flow() {
  const t = useRiverTheme();
  const { top, bottom } = useSafeAreaInsets();
  const [index, setIndex] = useState(0);

  const ctx = useOnboarding();
  const { hasPermission, requestPermission } = useCameraPermission();

  const advance = useCallback(() => {
    if (index === STEPS.length - 1) {
      router.push("/(onboarding)/processing");
    } else {
      setIndex((i) => i + 1);
    }
  }, [index]);

  const back = useCallback(() => {
    if (index === 0) {
      if (router.canGoBack()) router.back();
    } else {
      setIndex((i) => i - 1);
    }
  }, [index]);

  const cta = useMemo(() => {
    switch (index) {
      case 0:
        return { title: "Continue", disabled: !ctx.goal, onPress: advance };
      case 1:
        return { title: "Continue", disabled: ctx.pains.length === 0, onPress: advance };
      case 2:
      case 3:
      case 4:
        return { title: "Continue", disabled: false, onPress: advance };
      case 5:
        return { title: "Continue", disabled: ctx.eras.length === 0, onPress: advance };
      case 6:
        return { title: "Continue", disabled: !ctx.budget, onPress: advance };
      case 7:
        return {
          title: hasPermission ? "Camera's on — Continue" : "Enable Camera",
          disabled: false,
          onPress: async () => {
            const granted = await requestPermission();
            ctx.setCameraGranted(granted);
            advance();
          },
        };
      default:
        return { title: "Continue", disabled: false, onPress: advance };
    }
  }, [index, ctx, advance, hasPermission, requestPermission]);

  const current = STEPS[index];
  const StepComponent = current.Component;
  const isCameraStep = index === STEPS.length - 1;

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      {/* Deep-water gradient — the one background every screen shares. */}
      <LinearGradient
        colors={t.background.colors}
        locations={t.background.locations}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <OnboardingHeader step={current.number} onBack={back} />
      <Animated.View
        key={index}
        entering={FadeIn.duration(220)}
        style={styles.flex}
      >
        <StepComponent />
      </Animated.View>
      <View style={[styles.footer, { paddingBottom: bottom + 16 }]}>
        <PrimaryCTA title={cta.title} disabled={cta.disabled} onPress={cta.onPress} />
        {isCameraStep ? (
          <TextLink
            title="Not now"
            onPress={() => {
              ctx.setCameraGranted(false);
              advance();
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
});
