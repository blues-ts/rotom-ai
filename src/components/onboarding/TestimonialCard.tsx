import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";

interface TestimonialCardProps {
  name: string;
  tag: string;
  rating: number;
  quote: string;
}

export function TestimonialCard({ name, tag, rating, quote }: TestimonialCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={[styles.avatarText, { color: colors.accentForeground }]}>
            {name.charAt(0)}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
          <Text style={[styles.tag, { color: colors.mutedForeground }]}>{tag}</Text>
        </View>
        <View style={styles.stars}>
          {Array.from({ length: rating }).map((_, i) => (
            <Ionicons key={i} name="star" size={13} color={colors.chart3} />
          ))}
        </View>
      </View>
      <Text style={[styles.quote, { color: colors.foreground }]}>&ldquo;{quote}&rdquo;</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
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
