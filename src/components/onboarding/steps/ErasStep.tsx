import { StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import CardPressable from "@/components/CardPressable";
import { FlowStep } from "@/components/onboarding/FlowStep";
import { useOnboarding } from "@/context/OnboardingContext";
import { ERA_OPTIONS } from "@/constants/onboarding";
import { useRiverTheme } from "@/constants/theme";

type EraOption = (typeof ERA_OPTIONS)[number];

const STAGGER_MS = 60;
const COLS = 2;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function ErasStep() {
  const { eras, toggleEra } = useOnboarding();
  const rows = chunk(ERA_OPTIONS, COLS);

  return (
    <FlowStep title="What do you collect?" subtitle="River will tune insights to your cards.">
      <View style={styles.grid}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {row.map((opt, colIdx) => {
              const selected = eras.includes(opt.id);
              const i = rowIdx * COLS + colIdx;
              return (
                <Animated.View
                  key={opt.id}
                  entering={FadeInDown.duration(400).delay(i * STAGGER_MS)}
                  style={styles.tileWrap}
                >
                  <EraTile
                    opt={opt}
                    selected={selected}
                    onPress={() => {
                      Haptics.selectionAsync();
                      toggleEra(opt.id);
                    }}
                  />
                </Animated.View>
              );
            })}
          </View>
        ))}
      </View>
    </FlowStep>
  );
}

interface EraTileProps {
  opt: EraOption;
  selected: boolean;
  onPress: () => void;
}

function EraTile({ opt, selected, onPress }: EraTileProps) {
  const t = useRiverTheme();

  return (
    <CardPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={opt.label}
      pressScale={0.97}
      style={[
        styles.tile,
        // Accent fill means selected; unselected tiles are elevated glass.
        selected
          ? { backgroundColor: t.accent, borderColor: t.accent }
          : {
              backgroundColor: t.glass.elevatedFill,
              borderColor: t.glass.elevatedBorder,
            },
        t.glass.shadow,
      ]}
    >
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
          name={opt.icon}
          size={20}
          color={selected ? "#FFFFFF" : t.accentOn}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: selected ? "#FFFFFF" : t.text.primary },
        ]}
        numberOfLines={2}
      >
        {opt.label}
      </Text>
      {selected ? (
        <View
          style={[styles.checkmark, { backgroundColor: "rgba(255, 255, 255, 0.25)" }]}
        >
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
        </View>
      ) : null}
    </CardPressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    marginTop: 16,
    gap: 10,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    justifyContent: "center",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
