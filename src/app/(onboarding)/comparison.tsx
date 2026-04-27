import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenLayout } from "@/components/onboarding/ScreenLayout";
import { PrimaryCTA } from "@/components/onboarding/PrimaryCTA";
import { useTheme } from "@/context/ThemeContext";
import { COMPARISON_ROWS, STEP_NUMBERS } from "@/constants/onboarding";

export default function Comparison() {
  const { colors } = useTheme();

  return (
    <ScreenLayout
      step={STEP_NUMBERS.comparison}
      title="87% of collectors undersell their cards."
      subtitle="No AI. No edge."
      scrollable
      footer={
        <PrimaryCTA
          title="Continue"
          onPress={() => router.push("/(onboarding)/eras")}
        />
      }
    >
      <View style={[styles.table, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
          <View style={styles.labelCell} />
          <View style={styles.valueCell}>
            <Text style={[styles.headerLabel, { color: colors.primary }]}>River AI</Text>
          </View>
          <View style={styles.valueCell}>
            <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>
              Without
            </Text>
          </View>
        </View>
        {COMPARISON_ROWS.map((row, i) => (
          <View
            key={row.label}
            style={[
              styles.row,
              i < COMPARISON_ROWS.length - 1 && {
                borderBottomColor: colors.border,
                borderBottomWidth: 1,
              },
            ]}
          >
            <View style={styles.labelCell}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
            </View>
            <View style={styles.valueCell}>
              <Ionicons
                name={row.river ? "checkmark-circle" : "close-circle"}
                size={22}
                color={row.river ? colors.chart2 : colors.destructive}
              />
            </View>
            <View style={styles.valueCell}>
              <Ionicons
                name={row.without ? "checkmark-circle" : "close-circle"}
                size={22}
                color={row.without ? colors.chart2 : colors.destructive}
              />
            </View>
          </View>
        ))}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  table: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 20,
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  labelCell: {
    flex: 1.5,
  },
  valueCell: {
    flex: 1,
    alignItems: "center",
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 19,
  },
});
