import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/context/ThemeContext";
import { ProgressBar } from "./ProgressBar";

interface OnboardingHeaderProps {
  step: number;
  showBack?: boolean;
  showProgress?: boolean;
  onBack?: () => void;
}

export function OnboardingHeader({
  step,
  showBack = true,
  showProgress = true,
  onBack,
}: OnboardingHeaderProps) {
  const { colors } = useTheme();

  const handleBack = () => {
    Haptics.selectionAsync();
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  const canBack = showBack && (onBack !== undefined || router.canGoBack());

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {canBack ? (
          <Pressable onPress={handleBack} hitSlop={12} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.foreground} />
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <View style={styles.progressWrap}>
          {showProgress ? <ProgressBar step={step} /> : null}
        </View>
        <View style={styles.backButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  progressWrap: {
    flex: 1,
  },
});
