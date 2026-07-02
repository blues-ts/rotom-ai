import { Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";

import CardPressable from "@/components/CardPressable";
import { radius, useRiverTheme } from "@/constants/theme";

interface PrimaryCTAProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  loading?: boolean;
  loadingText?: string;
}

export function PrimaryCTA({
  title,
  onPress,
  disabled,
  variant = "primary",
  loading,
  loadingText,
}: PrimaryCTAProps) {
  const t = useRiverTheme();
  const isPrimary = variant === "primary";
  const inactive = disabled || loading;

  const handlePress = () => {
    if (inactive) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <CardPressable
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      pressScale={0.97}
      baseColor={isPrimary ? t.accent : t.glass.surfaceFill}
      pressedColor={isPrimary ? t.accent : t.glass.pressedFill}
      style={[
        styles.button,
        isPrimary
          ? [{ borderColor: "transparent" }, disabled ? null : t.buttonGlow]
          : { borderColor: t.glass.surfaceBorder },
        { opacity: disabled ? 0.45 : 1 },
      ]}
    >
      <Text
        style={[styles.text, { color: isPrimary ? "#FFFFFF" : t.text.primary }]}
      >
        {loading ? loadingText ?? title : title}
      </Text>
    </CardPressable>
  );
}

interface TextLinkProps {
  title: string;
  onPress: () => void;
  color?: string;
}

export function TextLink({ title, onPress, color }: TextLinkProps) {
  const t = useRiverTheme();
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} hitSlop={12} style={styles.link}>
      <Text style={[styles.linkText, { color: color ?? t.text.secondary }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  text: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  link: {
    alignItems: "center",
    paddingVertical: 10,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
