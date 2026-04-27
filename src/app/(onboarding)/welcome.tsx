import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";

export default function Welcome() {
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary, colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: top + 24 }]}>
        <Animated.View entering={FadeInUp.duration(500).delay(100)}>
          <Text style={[styles.title, { color: colors.foreground }]}>Meet River.</Text>
          <Text style={[styles.subtitle, { color: colors.foreground, opacity: 0.85 }]}>
            The AI that knows every Pokemon card.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(600).delay(350)} style={styles.mockupWrap}>
          <ChatMockup />
        </Animated.View>

        <Animated.Text
          entering={FadeIn.duration(500).delay(2900)}
          style={[styles.caption, { color: colors.mutedForeground }]}
        >
          Prices, trends, grading calls — just ask.
        </Animated.Text>
      </View>

      <Animated.View
        entering={FadeInDown.duration(500).delay(700)}
        style={[styles.footer, { paddingBottom: bottom + 16 }]}
      >
        <PrimaryCTA title="Get Started" onPress={() => router.push("/(onboarding)/goal")} />
      </Animated.View>
    </View>
  );
}

function ChatMockup() {
  const { colors } = useTheme();
  return (
    <View style={[styles.phone, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.chat}>
        <Animated.View
          entering={FadeInUp.duration(400).delay(500)}
          style={[styles.userBubble, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.userText, { color: colors.primaryForeground }]}>
            River, what's a Moonbreon worth right now?
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.duration(400).delay(1100)}
          style={[styles.aiBubble, { backgroundColor: colors.muted }]}
        >
          <Text style={[styles.aiText, { color: colors.foreground }]}>
            Near Mint raw: <Text style={styles.aiStrong}>$412</Text>
            {"\n"}
            PSA 10: <Text style={styles.aiStrong}>$1,180</Text>
            {"  "}
            <Text style={[styles.aiTrend, { color: colors.chart2 }]}>▲ 18% 30d</Text>
            {"\n"}
            Sold last 7d: <Text style={styles.aiStrong}>142</Text>
            {"\n\n"}
            If yours is clean, it's worth grading — spread is $768 after fees.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.duration(400).delay(1900)}
          style={[styles.userBubble, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.userText, { color: colors.primaryForeground }]}>
            Best place to sell a PSA 10?
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.duration(400).delay(2500)}
          style={[styles.aiBubble, { backgroundColor: colors.muted }]}
        >
          <Text style={[styles.aiText, { color: colors.foreground }]}>
            eBay auction, ending Sunday night.
            {"\n"}
            Comps are hot — skip Buy It Now or you'll leave{" "}
            <Text style={styles.aiStrong}>~$200</Text> on the table.
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 17,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 24,
  },
  mockupWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 12,
  },
  phone: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 32,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  chat: {
    gap: 12,
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  userText: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19,
  },
  aiBubble: {
    alignSelf: "flex-start",
    maxWidth: "90%",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  aiText: {
    fontSize: 14,
    lineHeight: 20,
  },
  aiStrong: {
    fontWeight: "700",
  },
  aiTrend: {
    fontWeight: "700",
  },
  caption: {
    textAlign: "center",
    fontSize: 14,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: 24,
    gap: 6,
  },
});
