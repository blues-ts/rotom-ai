import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";

import { useTheme } from "@/context/ThemeContext";
import { PROCESSING_CAPTIONS } from "@/constants/onboarding";

const OSHAWOTT_SPRITE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/501.gif";

const CAPTION_INTERVAL = 800;

export default function Processing() {
  const { colors } = useTheme();
  const [captionIndex, setCaptionIndex] = useState(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    const caption = setInterval(() => {
      setCaptionIndex((i) => Math.min(i + 1, PROCESSING_CAPTIONS.length - 1));
    }, CAPTION_INTERVAL);
    const done = setTimeout(() => {
      router.replace("/(onboarding)/demo");
    }, PROCESSING_CAPTIONS.length * CAPTION_INTERVAL + 200);

    return () => {
      cancelAnimation(pulse);
      clearInterval(caption);
      clearTimeout(done);
    };
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary, colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <Animated.View
          style={[styles.pulse, { backgroundColor: colors.primary + "33" }, pulseStyle]}
        >
          <Image
            source={OSHAWOTT_SPRITE}
            style={styles.sprite}
            contentFit="contain"
          />
        </Animated.View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          Building River for you…
        </Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          {PROCESSING_CAPTIONS[captionIndex]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 24,
  },
  pulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  sprite: {
    width: 64,
    height: 64,
    transform: [{ translateY: -6 }],
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  caption: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
