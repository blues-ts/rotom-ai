import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp } from "react-native-reanimated";

import CardPressable from "@/components/CardPressable";
import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { useOnboarding } from "@/context/OnboardingContext";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { DEMO_CARDS, type DemoCard } from "@/constants/demoCards";
import { useRiverTheme } from "@/constants/theme";

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
  const t = useRiverTheme();
  const [imageError, setImageError] = useState(false);

  return (
    <CardPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={shortName(card.name)}
      pressScale={0.97}
      baseColor={t.glass.surfaceFill}
      pressedColor={t.glass.pressedFill}
      style={[
        styles.cell,
        { borderColor: t.glass.surfaceBorder },
        t.glass.shadow,
      ]}
    >
      <View style={styles.imageWrap}>
        {imageError ? (
          <View style={styles.fallback}>
            <Ionicons name="image-outline" size={28} color={t.text.tertiary} />
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
          style={[styles.cardName, { color: t.text.primary }]}
        >
          {shortName(card.name)}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={t.text.tertiary} />
      </View>
    </CardPressable>
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
    borderRadius: 16,
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
