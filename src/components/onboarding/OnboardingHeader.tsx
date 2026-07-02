import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useRiverTheme } from "@/constants/theme";
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
  const t = useRiverTheme();

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
            <Ionicons name="chevron-back" size={24} color={t.accentOn} />
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
    // Match the screens' 24px content margin so the chevron lines up with
    // the title below it.
    paddingHorizontal: 24,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  progressWrap: {
    flex: 1,
  },
});
