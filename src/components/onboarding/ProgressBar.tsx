import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useEffect } from "react";

import { useTheme } from "@/context/ThemeContext";
import { ONBOARDING_STEPS } from "@/constants/onboarding";

interface ProgressBarProps {
  step: number;
  total?: number;
}

export function ProgressBar({ step, total = ONBOARDING_STEPS }: ProgressBarProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  const pct = Math.min(Math.max(step / total, 0), 1);

  useEffect(() => {
    progress.value = withTiming(pct, { duration: 400 });
  }, [pct, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={[styles.track, { backgroundColor: colors.muted }]}>
      <Animated.View
        style={[styles.fill, { backgroundColor: colors.primary }, fillStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginHorizontal: 24,
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});
