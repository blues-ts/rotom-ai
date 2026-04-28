import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { FlowStep } from "@/components/onboarding/FlowStep";
import { useOnboarding } from "@/context/OnboardingContext";
import { ERA_OPTIONS } from "@/constants/onboarding";
import { useTheme } from "@/context/ThemeContext";

type EraOption = (typeof ERA_OPTIONS)[number];

const STAGGER_MS = 60;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 350, mass: 0.6 };
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
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        styles.tile,
        {
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
        animatedStyle,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: selected ? colors.primary + "22" : colors.muted },
        ]}
      >
        <Ionicons
          name={opt.icon}
          size={20}
          color={selected ? colors.primary : colors.foreground}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: selected ? colors.accentForeground : colors.foreground },
        ]}
        numberOfLines={2}
      >
        {opt.label}
      </Text>
      {selected ? (
        <View style={[styles.checkmark, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />
        </View>
      ) : null}
    </AnimatedPressable>
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
    borderRadius: 14,
    borderWidth: 1.5,
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
