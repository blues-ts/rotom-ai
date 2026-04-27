import React from "react";
import { ScrollView, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/context/ThemeContext";
import { OnboardingHeader } from "./OnboardingHeader";

interface ScreenLayoutProps {
  step: number;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  showProgress?: boolean;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function ScreenLayout({
  step,
  title,
  subtitle,
  showBack = true,
  showProgress = true,
  scrollable = false,
  contentStyle,
  footer,
  children,
}: ScreenLayoutProps) {
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();

  const BodyWrapper: React.ComponentType<{ children: React.ReactNode }> = scrollable
    ? ({ children: c }) => (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {c}
        </ScrollView>
      )
    : ({ children: c }) => <View style={[styles.flex, styles.body, contentStyle]}>{c}</View>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: top }]}>
      <OnboardingHeader step={step} showBack={showBack} showProgress={showProgress} />
      <BodyWrapper>
        {title ? (
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
        {children}
      </BodyWrapper>
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: bottom + 16,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
});
