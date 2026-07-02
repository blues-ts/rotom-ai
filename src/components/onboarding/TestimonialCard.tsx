import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { radius, useRiverTheme } from "@/constants/theme";

interface TestimonialCardProps {
  name: string;
  tag: string;
  rating: number;
  quote: string;
}

// Stars stay gold — the design system has no rating token and accent would
// read as "selected".
const STAR_GOLD = "#F7B928";

export function TestimonialCard({ name, tag, rating, quote }: TestimonialCardProps) {
  const t = useRiverTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.glass.surfaceFill,
          borderColor: t.glass.surfaceBorder,
        },
        t.glass.shadow,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: t.accentIconFill }]}>
          <Text style={[styles.avatarText, { color: t.accentOn }]}>
            {name.charAt(0)}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.name, { color: t.text.primary }]}>{name}</Text>
          <Text style={[styles.tag, { color: t.text.secondary }]}>{tag}</Text>
        </View>
        <View style={styles.stars}>
          {Array.from({ length: rating }).map((_, i) => (
            <Ionicons key={i} name="star" size={13} color={STAR_GOLD} />
          ))}
        </View>
      </View>
      <Text style={[styles.quote, { color: t.text.body }]}>&ldquo;{quote}&rdquo;</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.tile,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "700",
  },
  meta: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
  },
  tag: {
    fontSize: 12,
    marginTop: 1,
  },
  stars: {
    flexDirection: "row",
    gap: 1,
  },
  quote: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: "italic",
  },
});
