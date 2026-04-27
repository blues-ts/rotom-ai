import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useOnboarding } from "@/context/OnboardingContext";
import { ERA_OPTIONS, STEP_NUMBERS } from "@/constants/onboarding";
import { useTheme } from "@/context/ThemeContext";

type EraOption = (typeof ERA_OPTIONS)[number];

const STAGGER_MS = 60;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 350, mass: 0.6 };

export default function Eras() {
  const { eras, toggleEra } = useOnboarding();

  return (
    <ScreenLayout
      step={STEP_NUMBERS.eras}
      title="What do you collect?"
      subtitle="River will tune insights to your cards."
      scrollable
      footer={
        <PrimaryCTA
          title="Continue"
          disabled={eras.length === 0}
          onPress={() => router.push("/(onboarding)/budget")}
        />
      }
    >
      <View style={styles.grid}>
        {ERA_OPTIONS.map((opt, i) => {
          const selected = eras.includes(opt.id);
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
    </ScreenLayout>
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
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 10,
    marginTop: 20,
  },
  tileWrap: {
    width: "48.5%",
  },
  tile: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 10,
    height: 130,
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
