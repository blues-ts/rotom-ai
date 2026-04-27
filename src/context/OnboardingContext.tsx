import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import type {
  BudgetId,
  EraId,
  GoalId,
  PainId,
} from "@/constants/onboarding";
import type { DemoCard, DemoChipId } from "@/constants/demoCards";

interface OnboardingState {
  goal: GoalId | null;
  pains: PainId[];
  eras: EraId[];
  budget: BudgetId | null;
  cameraGranted: boolean | null;
  demoCard: DemoCard | null;
  demoChip: DemoChipId | null;
  demoResponse: string;
}

interface OnboardingContextValue extends OnboardingState {
  setGoal: (goal: GoalId) => void;
  togglePain: (pain: PainId) => void;
  toggleEra: (era: EraId) => void;
  setBudget: (budget: BudgetId) => void;
  setCameraGranted: (granted: boolean) => void;
  setDemoCard: (card: DemoCard) => void;
  setDemoChip: (chip: DemoChipId, response: string) => void;
  reset: () => void;
}

const INITIAL_STATE: OnboardingState = {
  goal: null,
  pains: [],
  eras: [],
  budget: null,
  cameraGranted: null,
  demoCard: null,
  demoChip: null,
  demoResponse: "",
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);

  const setGoal = useCallback((goal: GoalId) => {
    setState((s) => ({ ...s, goal }));
  }, []);

  const togglePain = useCallback((pain: PainId) => {
    setState((s) => ({
      ...s,
      pains: s.pains.includes(pain)
        ? s.pains.filter((p) => p !== pain)
        : [...s.pains, pain],
    }));
  }, []);

  const toggleEra = useCallback((era: EraId) => {
    setState((s) => ({
      ...s,
      eras: s.eras.includes(era) ? s.eras.filter((e) => e !== era) : [...s.eras, era],
    }));
  }, []);

  const setBudget = useCallback((budget: BudgetId) => {
    setState((s) => ({ ...s, budget }));
  }, []);

  const setCameraGranted = useCallback((granted: boolean) => {
    setState((s) => ({ ...s, cameraGranted: granted }));
  }, []);

  const setDemoCard = useCallback((card: DemoCard) => {
    setState((s) => ({ ...s, demoCard: card, demoChip: null, demoResponse: "" }));
  }, []);

  const setDemoChip = useCallback((chip: DemoChipId, response: string) => {
    setState((s) => ({ ...s, demoChip: chip, demoResponse: response }));
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const value = useMemo(
    () => ({
      ...state,
      setGoal,
      togglePain,
      toggleEra,
      setBudget,
      setCameraGranted,
      setDemoCard,
      setDemoChip,
      reset,
    }),
    [
      state,
      setGoal,
      togglePain,
      toggleEra,
      setBudget,
      setCameraGranted,
      setDemoCard,
      setDemoChip,
      reset,
    ],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return ctx;
}
