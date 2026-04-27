import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { useOnboarding } from "@/context/OnboardingContext";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { DEMO_CARDS, type DemoCard } from "@/constants/demoCards";
import { useTheme } from "@/context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 350, mass: 0.6 };

export default function Demo() {
  const { setDemoCard } = useOnboarding();

  const handlePick = (card: DemoCard) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDemoCard(card);
    router.push("/(onboarding)/demo-chat");
  };

  return (
    <ScreenLayout
      step={STEP_NUMBERS.demo}
      title="Pick a card. Ask River."
      subtitle="Tap one to see what River says."
      scrollable
    >
      <View style={styles.grid}>
        {DEMO_CARDS.map((card, i) => (
          <Animated.View
            key={card.id}
            entering={FadeInUp.duration(400).delay(i * 60)}
            style={styles.cellWrap}
          >
            <DemoCardCell card={card} onPress={() => handlePick(card)} />
          </Animated.View>
        ))}
      </View>
    </ScreenLayout>
  );
}

function DemoCardCell({ card, onPress }: { card: DemoCard; onPress: () => void }) {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);
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
        styles.cell,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        animatedStyle,
      ]}
    >
      <View style={styles.imageWrap}>
        {imageError ? (
          <View style={styles.fallback}>
            <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
          </View>
        ) : (
          <Image
            source={{ uri: card.image }}
            style={styles.cardImage}
            contentFit="contain"
            transition={180}
            onError={() => setImageError(true)}
          />
        )}
      </View>
      <View style={styles.cellFooter}>
        <Text
          numberOfLines={1}
          style={[styles.cardName, { color: colors.foreground }]}
        >
          {shortName(card.name)}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
      </View>
    </AnimatedPressable>
  );
}

function shortName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, "").trim();
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 12,
    marginTop: 20,
  },
  cellWrap: {
    width: "48.5%",
  },
  cell: {
    width: "100%",
    aspectRatio: 0.78,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  imageWrap: {
    flex: 1,
    width: "100%",
    borderRadius: 6,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  cardImage: {
    flex: 1,
    width: "100%",
  },
  fallback: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cellFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
});
