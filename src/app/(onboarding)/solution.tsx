import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useOnboarding } from "@/context/OnboardingContext";
import { PAIN_OPTIONS, STEP_NUMBERS } from "@/constants/onboarding";
import { useTheme } from "@/context/ThemeContext";

const ROWS: {
  icon: keyof typeof Ionicons.glyphMap;
  defaultPain: string;
  painMatch?: string;
  solution: string;
}[] = [
  {
    icon: "sparkles",
    defaultPain: "I'm Googling every card.",
    solution: "Ask River anything. Prices, trends, grading calls — just ask.",
  },
  {
    icon: "scan-outline",
    defaultPain: "Pricing one card takes 15 minutes.",
    painMatch: "research_time",
    solution: "Scan any card. River identifies it and prices it in 3 seconds.",
  },
  {
    icon: "diamond-outline",
    defaultPain: "I can't tell what's worth grading.",
    painMatch: "grading_unsure",
    solution: "PSA 10 / BGS 9.5 side-by-side with raw. See the spread before you ship.",
  },
  {
    icon: "trending-up-outline",
    defaultPain: "I have no idea what my collection is worth.",
    painMatch: "portfolio_blind",
    solution: "River tracks your whole collection. Total value, daily change, top movers.",
  },
];

export default function Solution() {
  const { pains } = useOnboarding();
  const { colors } = useTheme();

  const resolvePain = (row: (typeof ROWS)[number]) => {
    if (row.painMatch) {
      const match = PAIN_OPTIONS.find((p) => p.id === row.painMatch);
      if (match && pains.includes(match.id)) {
        return match.label;
      }
    }
    return row.defaultPain;
  };

  return (
    <ScreenLayout
      step={STEP_NUMBERS.solution}
      title="Meet River."
      subtitle="Built for exactly what you just told us."
      scrollable
      footer={
        <PrimaryCTA
          title="Continue"
          onPress={() => router.push("/(onboarding)/comparison")}
        />
      }
    >
      <View style={styles.list}>
        {ROWS.map((row, i) => (
          <Animated.View
            key={i}
            entering={FadeInDown.duration(400).delay(i * 100)}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
              <Ionicons name={row.icon} size={22} color={colors.accentForeground} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.pain, { color: colors.mutedForeground }]}>
                {resolvePain(row)}
              </Text>
              <Text style={[styles.solution, { color: colors.foreground }]}>
                {row.solution}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
    marginTop: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    paddingTop: 2,
  },
  pain: {
    fontSize: 13,
    textDecorationLine: "line-through",
    marginBottom: 4,
  },
  solution: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
});
