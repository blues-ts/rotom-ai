import { useCallback, useRef, useState } from "react";
import { Alert, InteractionManager, Linking, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import Purchases from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { PrimaryCTA, TextLink } from "@/components/onboarding/PrimaryCTA";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { useTheme } from "@/context/ThemeContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { PRO_ENTITLEMENT_ID } from "@/lib/revenuecat";

const ONBOARDING_KEY = "onboarding_complete";

type Stage = "presenting" | "cancelled" | "error";

export default function Paywall() {
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { isPro, isReady, refresh } = useRevenueCat();
  const [stage, setStage] = useState<Stage>("presenting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasAutoPresented = useRef(false);

  const finish = useCallback(async () => {
    await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
    router.replace("/(home)");
  }, []);

  const present = useCallback(async () => {
    try {
      setStage("presenting");
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
      });

      switch (result) {
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED:
        case PAYWALL_RESULT.NOT_PRESENTED:
          await finish();
          return;
        case PAYWALL_RESULT.CANCELLED:
          setStage("cancelled");
          return;
        case PAYWALL_RESULT.ERROR:
        default:
          setErrorMessage("Something went wrong loading the paywall.");
          setStage("error");
          return;
      }
    } catch (err) {
      console.warn("[Paywall] presentPaywall failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to present paywall.",
      );
      setStage("error");
    }
  }, [finish]);

  // Auto-present on first focus only. The delay lets Clerk's OAuth
  // SFAuthenticationViewController finish dismissing — without it, UIKit refuses
  // to present onto a VC that's not in the window hierarchy.
  useFocusEffect(
    useCallback(() => {
      if (!isReady || hasAutoPresented.current) return;
      hasAutoPresented.current = true;

      if (isPro) {
        void finish();
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const task = InteractionManager.runAfterInteractions(() => {
        timeoutId = setTimeout(() => void present(), 400);
      });

      return () => {
        task.cancel();
        if (timeoutId) clearTimeout(timeoutId);
      };
    }, [isReady, isPro, finish, present]),
  );

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const info = await Purchases.restorePurchases();
      await refresh();
      if (info.entitlements.active[PRO_ENTITLEMENT_ID]) {
        await finish();
      } else {
        Alert.alert(
          "No purchases found",
          "We couldn't find an active subscription to restore.",
        );
      }
    } catch (err) {
      console.warn("[Paywall] restorePurchases failed:", err);
      Alert.alert(
        "Restore failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const handleContinueFree = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await finish();
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: top },
      ]}
    >
      <OnboardingHeader step={STEP_NUMBERS.paywall} showProgress />

      <View style={styles.body}>
        {stage === "presenting" ? (
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
            Loading offers…
          </Text>
        ) : stage === "cancelled" ? (
          <Animated.View
            key="cancelled"
            entering={FadeIn.duration(450)}
            style={styles.bodyInner}
          >
            <Text style={[styles.title, { color: colors.foreground }]}>
              No rush.
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              You can unlock River AI Pro any time from Settings.
            </Text>
          </Animated.View>
        ) : (
          <Animated.View
            key="error"
            entering={FadeIn.duration(450)}
            style={styles.bodyInner}
          >
            <Text style={[styles.title, { color: colors.foreground }]}>
              Couldn't load the paywall.
            </Text>
            {errorMessage ? (
              <Text
                style={[styles.subtitle, { color: colors.mutedForeground }]}
              >
                {errorMessage}
              </Text>
            ) : null}
          </Animated.View>
        )}
      </View>

      {stage !== "presenting" ? (
        <Animated.View
          entering={FadeInUp.duration(450).delay(100)}
          style={[styles.footer, { paddingBottom: bottom + 12 }]}
        >
          <PrimaryCTA
            title={stage === "error" ? "Try again" : "Unlock River AI Pro"}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void present();
            }}
          />
          <TextLink title="Continue without Pro" onPress={handleContinueFree} />
          <View style={styles.legal}>
            <TextLink title="Restore purchases" onPress={handleRestore} />
            <Text style={[styles.legalDot, { color: colors.mutedForeground }]}>
              ·
            </Text>
            <TextLink
              title="Terms"
              onPress={() => Linking.openURL("https://example.com/terms")}
            />
            <Text style={[styles.legalDot, { color: colors.mutedForeground }]}>
              ·
            </Text>
            <TextLink
              title="Privacy"
              onPress={() => Linking.openURL("https://example.com/privacy")}
            />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  bodyInner: {
    alignItems: "center",
    gap: 8,
  },
  bodyText: {
    fontSize: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 6,
  },
  legal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  legalDot: {
    fontSize: 14,
  },
});
