import React from "react";
import { ScrollView, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useRiverTheme } from "@/constants/theme";

interface FlowStepProps {
  title?: string;
  subtitle?: string;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
  children?: React.ReactNode;
}

export function FlowStep({
  title,
  subtitle,
  scrollable = false,
  contentStyle,
  children,
}: FlowStepProps) {
  const t = useRiverTheme();

  const body = (
    <>
      {title ? (
        <Text style={[styles.title, { color: t.text.primary }]}>{title}</Text>
      ) : null}
      {subtitle ? (
        <Text style={[styles.subtitle, { color: t.text.secondary }]}>{subtitle}</Text>
      ) : null}
      {children}
    </>
  );

  return scrollable ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scroll, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {body}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.body, contentStyle]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
    lineHeight: 22,
  },
});
