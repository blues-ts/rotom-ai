import { Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/context/ThemeContext";

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
  const { colors } = useTheme();

  const backgroundColor =
    variant === "primary" ? colors.primary : colors.card;
  const textColor =
    variant === "primary" ? colors.primaryForeground : colors.foreground;
  const borderColor =
    variant === "primary" ? colors.primary : colors.border;

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.text, { color: textColor }]}>
        {loading ? loadingText ?? title : title}
      </Text>
    </Pressable>
  );
}

interface TextLinkProps {
  title: string;
  onPress: () => void;
  color?: string;
}

export function TextLink({ title, onPress, color }: TextLinkProps) {
  const { colors } = useTheme();
  const handlePress = () => {
    Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} hitSlop={12} style={styles.link}>
      <Text style={[styles.linkText, { color: color ?? colors.mutedForeground }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
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
