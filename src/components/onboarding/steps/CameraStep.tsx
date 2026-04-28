import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { FlowStep } from "@/components/onboarding/FlowStep";
import { useTheme } from "@/context/ThemeContext";

const BULLETS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: "scan-outline", text: "River identifies any Pokemon card instantly" },
  { icon: "cash-outline", text: "Pulls live raw + graded prices on the spot" },
  { icon: "bulb-outline", text: "Gives you a take: hold, sell, or grade" },
];

const HERO_CARD_IMAGE = "https://images.pokemontcg.io/swsh7/215_hires.png";
const CARD_W = 130;
const CARD_H = 180;

export function CameraStep() {
  const { colors } = useTheme();

  return (
    <FlowStep>
      <View style={styles.hero}>
        <Animated.View entering={FadeIn.duration(500)} style={styles.illoWrap}>
          <LinearGradient
            colors={[colors.primary + "33", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          <ScanFrame primary={colors.primary} />
        </Animated.View>

        <Animated.Text
          entering={FadeInUp.duration(400).delay(200)}
          style={[styles.title, { color: colors.foreground }]}
        >
          Let River see your cards.
        </Animated.Text>
        <Animated.Text
          entering={FadeInUp.duration(400).delay(300)}
          style={[styles.subtitle, { color: colors.mutedForeground }]}
        >
          Camera access = instant pricing.
        </Animated.Text>

        <View style={styles.bullets}>
          {BULLETS.map((b, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.duration(400).delay(400 + i * 80)}
              style={styles.bullet}
            >
              <View style={[styles.bulletIcon, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name={b.icon} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.bulletText, { color: colors.foreground }]}>{b.text}</Text>
            </Animated.View>
          ))}
        </View>
      </View>
    </FlowStep>
  );
}

function ScanFrame({ primary }: { primary: string }) {
  const scanY = useSharedValue(0);

  useEffect(() => {
    scanY.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(scanY);
  }, [scanY]);

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value * (CARD_H - 4) }],
  }));

  const cornerBase = { borderColor: primary };

  return (
    <View style={styles.scanFrame}>
      <Image source={{ uri: HERO_CARD_IMAGE }} style={styles.cardImage} contentFit="contain" />
      <Animated.View
        style={[styles.scanLine, { backgroundColor: primary, shadowColor: primary }, lineStyle]}
      />
      <View style={[styles.corner, styles.cornerTL, cornerBase]} />
      <View style={[styles.corner, styles.cornerTR, cornerBase]} />
      <View style={[styles.corner, styles.cornerBL, cornerBase]} />
      <View style={[styles.corner, styles.cornerBR, cornerBase]} />
    </View>
  );
}

const CORNER_LEN = 22;
const CORNER_W = 3;

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: "center",
    paddingTop: 10,
  },
  illoWrap: {
    width: 200,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 24,
  },
  scanFrame: {
    width: CARD_W,
    height: CARD_H,
    alignItems: "center",
    justifyContent: "center",
  },
  cardImage: {
    width: CARD_W,
    height: CARD_H,
  },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 4,
    right: 4,
    height: 2,
    borderRadius: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    opacity: 0.85,
  },
  corner: {
    position: "absolute",
    width: CORNER_LEN,
    height: CORNER_LEN,
  },
  cornerTL: {
    top: -8,
    left: -8,
    borderTopWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: -8,
    right: -8,
    borderTopWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: -8,
    left: -8,
    borderBottomWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: -8,
    right: -8,
    borderBottomWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderBottomRightRadius: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 24,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
  bullets: {
    marginTop: 28,
    gap: 14,
    width: "100%",
  },
  bullet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bulletIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
});
