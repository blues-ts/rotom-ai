import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useEffect } from "react";

import { useRiverTheme } from "@/constants/theme";
import { ONBOARDING_STEPS } from "@/constants/onboarding";

interface ProgressBarProps {
  step: number;
  total?: number;
}

export function ProgressBar({ step, total = ONBOARDING_STEPS }: ProgressBarProps) {
  const t = useRiverTheme();
  const pct = Math.min(Math.max(step / total, 0), 1);
  const progress = useSharedValue(pct);

  useEffect(() => {
    progress.value = withTiming(pct, { duration: 400 });
  }, [pct, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={[styles.track, { backgroundColor: t.glass.elevatedFill }]}>
      <Animated.View
        style={[styles.fill, { backgroundColor: t.accent }, fillStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    // The header row now carries the 24px screen margin; keep a smaller
    // breather between the bar and the chevron/spacer beside it.
    marginHorizontal: 12,
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});
