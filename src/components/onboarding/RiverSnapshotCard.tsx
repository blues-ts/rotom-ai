import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";
import type { DemoCard } from "@/constants/demoCards";

interface RiverSnapshotCardProps {
  card: DemoCard;
  riverQuote: string;
}

export function RiverSnapshotCard({ card, riverQuote }: RiverSnapshotCardProps) {
  const { colors } = useTheme();
  const trendPositive = card.pct30d >= 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.brand, { color: colors.primary }]}>RIVER SNAPSHOT</Text>
        <Ionicons name="flash" size={14} color={colors.primary} />
      </View>

      <View style={styles.artWrap}>
        <Image source={{ uri: card.image }} style={styles.art} contentFit="contain" />
      </View>

      <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
        {card.name}
      </Text>
      <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
        {card.setName} · {card.cardNumber}
      </Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.priceRow}>
        <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Raw NM</Text>
        <Text style={[styles.priceValue, { color: colors.foreground }]}>${card.rawNM}</Text>
      </View>
      <View style={styles.priceRow}>
        <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>PSA 10</Text>
        <View style={styles.priceRight}>
          <Text style={[styles.priceValue, { color: colors.foreground }]}>
            ${card.psa10.toLocaleString()}
          </Text>
          <Text
            style={[
              styles.trend,
              { color: trendPositive ? colors.chart2 : colors.destructive },
            ]}
          >
            {trendPositive ? "▲" : "▼"} {Math.abs(card.pct30d)}% 30d
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.quoteWrap}>
        <View style={styles.quoteHeader}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
          <Text style={[styles.quoteLabel, { color: colors.primary }]}>River says</Text>
        </View>
        <Text style={[styles.quote, { color: colors.foreground }]}>
          &ldquo;{shortenQuote(riverQuote)}&rdquo;
        </Text>
      </View>

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>riverai.app</Text>
    </View>
  );
}

function shortenQuote(q: string): string {
  // Keep the first sentence only for the on-screen snapshot — needs to fit
  // alongside everything else without scrolling.
  const firstSentence = q.split(". ")[0];
  if (!firstSentence) return q;
  return firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
  },
  brand: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  artWrap: {
    alignItems: "center",
  },
  art: {
    width: 150,
    height: 209,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  cardMeta: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  priceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trend: {
    fontSize: 12,
    fontWeight: "700",
  },
  quoteWrap: {
    gap: 6,
  },
  quoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quoteLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  quote: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: "italic",
  },
  footer: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    letterSpacing: 0.4,
  },
});
