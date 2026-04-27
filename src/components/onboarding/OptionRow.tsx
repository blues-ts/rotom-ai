import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";
import type { IconName } from "@/constants/onboarding";

interface OptionRowProps {
  icon?: IconName;
  label: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
}

const RIGHT_SLOT_SIZE = 22;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 350, mass: 0.6 };

export function OptionRow({ icon, label, selected, multi, onPress }: OptionRowProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        styles.container,
        {
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
        animatedStyle,
      ]}
    >
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: selected ? colors.primary + "22" : colors.muted }]}>
          <Ionicons
            name={icon}
            size={18}
            color={selected ? colors.primary : colors.foreground}
          />
        </View>
      ) : null}
      <Text
        numberOfLines={2}
        style={[
          styles.label,
          { color: selected ? colors.accentForeground : colors.foreground },
        ]}
      >
        {label}
      </Text>
      <View style={styles.rightSlot}>
        {multi ? (
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: selected ? colors.primary : "transparent",
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            {selected ? (
              <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />
            ) : null}
          </View>
        ) : selected ? (
          <Ionicons name="checkmark-circle" size={RIGHT_SLOT_SIZE} color={colors.primary} />
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 12,
    minHeight: 76,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 21,
  },
  rightSlot: {
    width: RIGHT_SLOT_SIZE,
    height: RIGHT_SLOT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: RIGHT_SLOT_SIZE,
    height: RIGHT_SLOT_SIZE,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
