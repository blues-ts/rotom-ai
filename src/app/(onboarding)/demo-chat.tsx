import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CardPressable from "@/components/CardPressable";
import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useOnboarding } from "@/context/OnboardingContext";
import { DEMO_CHIPS, type DemoChipId } from "@/constants/demoCards";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { useRiverTheme } from "@/constants/theme";

const CHARS_PER_TICK = 3;
const TICK_MS = 22;

export default function DemoChat() {
  const t = useRiverTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { demoCard, demoChip, demoResponse, setDemoChip } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);

  const [streamedText, setStreamedText] = useState(demoResponse);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    // If nothing has been asked yet, no-op.
    if (!demoChip || !demoCard) return;
    // If the cached response matches the stored state already, skip streaming.
    const full = demoCard.responses[demoChip];
    if (!full || streamedText === full) return;

    setIsStreaming(true);
    setStreamedText("");
    let i = 0;
    const interval = setInterval(() => {
      i = Math.min(i + CHARS_PER_TICK, full.length);
      setStreamedText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
    // Only re-run when chip changes; we don't want re-streams on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoChip, demoCard?.id]);

  useEffect(() => {
    if (streamedText) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [streamedText]);

  const handleChipPress = (chipId: DemoChipId) => {
    if (isStreaming || !demoCard) return;
    const response = demoCard.responses[chipId];
    if (!response) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDemoChip(chipId, response);
  };

  const handleSnapshot = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(onboarding)/snapshot");
  };

  if (!demoCard) {
    // Defensive — if someone deep-links here without a card, bounce back.
    router.replace("/(onboarding)/demo");
    return null;
  }

  const chosenChipLabel = demoChip
    ? DEMO_CHIPS.find((c) => c.id === demoChip)?.label
    : null;

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      {/* Deep-water gradient — the one background every screen shares. */}
      <LinearGradient
        colors={t.background.colors}
        locations={t.background.locations}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <OnboardingHeader step={STEP_NUMBERS.demo} showProgress />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.cardHero,
            {
              backgroundColor: t.glass.surfaceFill,
              borderColor: t.glass.surfaceBorder,
            },
            t.glass.shadow,
          ]}
        >
          <Image
            source={{ uri: demoCard.image }}
            style={styles.cardImage}
            contentFit="contain"
          />
          <Text style={[styles.cardName, { color: t.text.primary }]}>
            {demoCard.name}
          </Text>
          <Text style={[styles.cardMeta, { color: t.text.secondary }]}>
            {demoCard.setName} · {demoCard.cardNumber}
          </Text>
        </View>

        <Text style={[styles.prompt, { color: t.text.primary }]}>
          Ask River about this card.
        </Text>

        {chosenChipLabel ? (
          <Animated.View
            entering={FadeInUp.duration(300)}
            style={[styles.userBubble, { backgroundColor: t.accent }]}
          >
            <Text style={[styles.userBubbleText, { color: "#FFFFFF" }]}>
              {chosenChipLabel}
            </Text>
          </Animated.View>
        ) : null}

        {streamedText ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.aiBubble, { backgroundColor: t.glass.elevatedFill }]}
          >
            <View style={styles.aiHeader}>
              <View style={[styles.aiAvatar, { backgroundColor: t.accent }]}>
                <Text style={styles.aiAvatarText}>R</Text>
              </View>
              <Text style={[styles.aiName, { color: t.text.primary }]}>River</Text>
              {isStreaming ? (
                <Text style={[styles.streamingDot, { color: t.accentOn }]}>●</Text>
              ) : null}
            </View>
            <Text style={[styles.aiText, { color: t.text.body }]}>
              {streamedText}
              {isStreaming ? (
                <Text style={[styles.cursor, { color: t.accentOn }]}>▌</Text>
              ) : null}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottom + 16 }]}>
        <View style={styles.chips}>
          {DEMO_CHIPS.map((chip) => {
            const selected = demoChip === chip.id;
            return (
              <Chip
                key={chip.id}
                chip={chip}
                selected={selected}
                disabled={isStreaming}
                onPress={() => handleChipPress(chip.id)}
              />
            );
          })}
        </View>

        {demoChip && !isStreaming ? (
          <PrimaryCTA
            title="See my River snapshot →"
            onPress={handleSnapshot}
          />
        ) : (
          <View style={styles.ctaPlaceholder}>
            <Ionicons name="arrow-up" size={18} color={t.text.secondary} />
            <Text style={[styles.ctaHint, { color: t.text.secondary }]}>
              Tap a question to ask River
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface ChipProps {
  chip: (typeof DEMO_CHIPS)[number];
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function Chip({ chip, selected, disabled, onPress }: ChipProps) {
  const t = useRiverTheme();

  return (
    <CardPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={chip.label}
      // Selection chips brighten without moving (iOS convention).
      pressScale={1}
      baseColor={selected ? t.accent : t.glass.elevatedFill}
      pressedColor={selected ? t.accent : t.glass.pressedFill}
      style={[
        styles.chip,
        {
          borderColor: selected ? t.accent : t.glass.elevatedBorder,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons
        name={chip.icon}
        size={14}
        color={selected ? "#FFFFFF" : t.accentOn}
      />
      <Text
        style={[
          styles.chipLabel,
          { color: selected ? "#FFFFFF" : t.text.primary },
        ]}
      >
        {chip.label}
      </Text>
    </CardPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  cardHero: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  cardImage: {
    width: "70%",
    aspectRatio: 0.72,
    marginBottom: 8,
  },
  cardName: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  cardMeta: {
    fontSize: 13,
  },
  prompt: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  userBubbleText: {
    fontSize: 15,
    fontWeight: "500",
  },
  aiBubble: {
    alignSelf: "flex-start",
    maxWidth: "95%",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    gap: 8,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  aiAvatarText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  aiName: {
    fontSize: 13,
    fontWeight: "700",
  },
  streamingDot: {
    fontSize: 14,
  },
  aiText: {
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: {
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  ctaPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  ctaHint: {
    fontSize: 13,
    fontWeight: "500",
  },
});
