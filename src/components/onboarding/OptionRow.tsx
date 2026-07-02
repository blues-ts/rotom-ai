import { StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import CardPressable from "@/components/CardPressable";
import { useRiverTheme } from "@/constants/theme";
import type { IconName } from "@/constants/onboarding";

interface OptionRowProps {
  icon?: IconName;
  label: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
}

const RIGHT_SLOT_SIZE = 22;

export function OptionRow({ icon, label, selected, multi, onPress }: OptionRowProps) {
  const t = useRiverTheme();

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress();
  };

  return (
    <CardPressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      pressScale={0.98}
      style={[
        styles.container,
        // Accent fill means selected (design rule) — unselected rows are
        // elevated glass like every other input surface.
        selected
          ? { backgroundColor: t.accent, borderColor: t.accent }
          : {
              backgroundColor: t.glass.elevatedFill,
              borderColor: t.glass.elevatedBorder,
            },
        t.glass.shadow,
      ]}
    >
      {icon ? (
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: selected
                ? "rgba(255, 255, 255, 0.20)"
                : t.accentIconFill,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={18}
            color={selected ? "#FFFFFF" : t.accentOn}
          />
        </View>
      ) : null}
      <Text
        numberOfLines={2}
        style={[
          styles.label,
          selected
            ? { color: "#FFFFFF", fontWeight: "600" }
            : { color: t.text.primary },
        ]}
      >
        {label}
      </Text>
      <View style={styles.rightSlot}>
        {multi ? (
          <View
            style={[
              styles.checkbox,
              selected
                ? {
                    backgroundColor: "rgba(255, 255, 255, 0.25)",
                    borderColor: "#FFFFFF",
                  }
                : {
                    backgroundColor: "transparent",
                    borderColor: t.glass.elevatedBorder,
                  },
            ]}
          >
            {selected ? (
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            ) : null}
          </View>
        ) : selected ? (
          <Ionicons name="checkmark-circle" size={RIGHT_SLOT_SIZE} color="#FFFFFF" />
        ) : null}
      </View>
    </CardPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
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
