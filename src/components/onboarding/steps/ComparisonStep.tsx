import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { FlowStep } from "@/components/onboarding/FlowStep";
import { useRiverTheme } from "@/constants/theme";
import { COMPARISON_ROWS } from "@/constants/onboarding";

export function ComparisonStep() {
  const t = useRiverTheme();

  return (
    <FlowStep
      title="87% of collectors undersell their cards."
      subtitle="No AI. No edge."
      scrollable
    >
      <View
        style={[
          styles.table,
          {
            backgroundColor: t.glass.surfaceFill,
            borderColor: t.glass.surfaceBorder,
          },
          t.glass.shadow,
        ]}
      >
        <View style={[styles.headerRow, { borderBottomColor: t.glass.surfaceBorder }]}>
          <View style={styles.labelCell} />
          <View style={styles.valueCell}>
            <Text style={[styles.headerLabel, { color: t.accentOn }]}>River AI</Text>
          </View>
          <View style={styles.valueCell}>
            <Text style={[styles.headerLabel, { color: t.text.secondary }]}>
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
                borderBottomColor: t.glass.surfaceBorder,
                borderBottomWidth: 1,
              },
            ]}
          >
            <View style={styles.labelCell}>
              <Text style={[styles.rowLabel, { color: t.text.primary }]}>{row.label}</Text>
            </View>
            <View style={styles.valueCell}>
              <Ionicons
                name={row.river ? "checkmark-circle" : "close-circle"}
                size={22}
                color={row.river ? t.gain : t.loss}
              />
            </View>
            <View style={styles.valueCell}>
              <Ionicons
                name={row.without ? "checkmark-circle" : "close-circle"}
                size={22}
                color={row.without ? t.gain : t.loss}
              />
            </View>
          </View>
        ))}
      </View>
    </FlowStep>
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
