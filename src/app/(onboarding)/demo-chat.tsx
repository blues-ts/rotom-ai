import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useOnboarding } from "@/context/OnboardingContext";
import { DEMO_CHIPS, type DemoChipId } from "@/constants/demoCards";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { useTheme } from "@/context/ThemeContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 350, mass: 0.6 };

const CHARS_PER_TICK = 3;
const TICK_MS = 22;

export default function DemoChat() {
  const { colors } = useTheme();
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
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: top }]}>
      <OnboardingHeader step={STEP_NUMBERS.demo} showProgress />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.cardHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Image
            source={{ uri: demoCard.image }}
            style={styles.cardImage}
            contentFit="contain"
          />
          <Text style={[styles.cardName, { color: colors.foreground }]}>
            {demoCard.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
            {demoCard.setName} · {demoCard.cardNumber}
          </Text>
        </View>

        <Text style={[styles.prompt, { color: colors.foreground }]}>
          Ask River about this card.
        </Text>

        {chosenChipLabel ? (
          <Animated.View
            entering={FadeInUp.duration(300)}
            style={[styles.userBubble, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.userBubbleText, { color: colors.primaryForeground }]}>
              {chosenChipLabel}
            </Text>
          </Animated.View>
        ) : null}

        {streamedText ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[styles.aiBubble, { backgroundColor: colors.muted }]}
          >
            <View style={styles.aiHeader}>
              <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.aiAvatarText}>R</Text>
              </View>
              <Text style={[styles.aiName, { color: colors.foreground }]}>River</Text>
              {isStreaming ? (
                <Text style={[styles.streamingDot, { color: colors.primary }]}>●</Text>
              ) : null}
            </View>
            <Text style={[styles.aiText, { color: colors.foreground }]}>
              {streamedText}
              {isStreaming ? (
                <Text style={[styles.cursor, { color: colors.primary }]}>▌</Text>
              ) : null}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottom + 16, borderTopColor: colors.border }]}>
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
            <Ionicons name="arrow-up" size={18} color={colors.mutedForeground} />
            <Text style={[styles.ctaHint, { color: colors.mutedForeground }]}>
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
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(0.94, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          opacity: disabled ? 0.6 : 1,
        },
        animatedStyle,
      ]}
    >
      <Ionicons
        name={chip.icon}
        size={14}
        color={selected ? colors.primaryForeground : colors.foreground}
      />
      <Text
        style={[
          styles.chipLabel,
          { color: selected ? colors.primaryForeground : colors.foreground },
        ]}
      >
        {chip.label}
      </Text>
    </AnimatedPressable>
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
    flex: 1,
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
    borderTopWidth: 1,
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
