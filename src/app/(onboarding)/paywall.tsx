import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { PrimaryCTA, TextLink } from "@/components/onboarding/PrimaryCTA";
import { TestimonialCard } from "@/components/onboarding/TestimonialCard";
import { STEP_NUMBERS } from "@/constants/onboarding";
import { PAYWALL, PAYWALL_FEATURES, PAYWALL_TESTIMONIAL } from "@/constants/paywall";
import { useTheme } from "@/context/ThemeContext";

const ONBOARDING_KEY = "onboarding_complete";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 350, mass: 0.6 };

type Plan = "annual" | "monthly";

export default function Paywall() {
  const { colors } = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const [plan, setPlan] = useState<Plan>(PAYWALL.defaultPlan);

  const finishOnboarding = async () => {
    await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
    if (isSignedIn) {
      router.replace("/(home)");
    } else {
      router.replace("/(auth)");
    }
  };

  const handleStartTrial = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO: wire up RevenueCat (or your IAP provider) here.
    // - Load offerings
    // - Call purchasePackage for the selected plan
    // - Confirm entitlement before proceeding
    Alert.alert(
      "Placeholder paywall",
      `Starting ${PAYWALL.trialDays}-day free trial on the ${plan} plan.\n\n(Wire up RevenueCat in src/app/(onboarding)/paywall.tsx)`,
      [{ text: "Continue", onPress: finishOnboarding }],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: top }]}>
      <OnboardingHeader step={STEP_NUMBERS.paywall} showProgress />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(400)} style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Your private analyst for every Pokemon card.
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Unlimited River insights, scans, and portfolio tracking.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.testimonialWrap}>
          <TestimonialCard {...PAYWALL_TESTIMONIAL} />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(400).delay(200)}>
          <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
            Included with trial
          </Text>
          <View style={[styles.features, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {PAYWALL_FEATURES.map((f, i) => (
              <View
                key={i}
                style={[
                  styles.featureRow,
                  i < PAYWALL_FEATURES.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={[styles.featureIcon, { backgroundColor: colors.primary + "22" }]}>
                  <Ionicons name={f.icon} size={16} color={colors.primary} />
                </View>
                <Text style={[styles.featureText, { color: colors.foreground }]}>
                  {f.label}
                </Text>
                <Ionicons name="checkmark" size={18} color={colors.chart2} />
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(400).delay(300)} style={styles.plans}>
          <PlanCard
            plan="annual"
            selected={plan === "annual"}
            onSelect={() => {
              Haptics.selectionAsync();
              setPlan("annual");
            }}
          />
          <PlanCard
            plan="monthly"
            selected={plan === "monthly"}
            onSelect={() => {
              Haptics.selectionAsync();
              setPlan("monthly");
            }}
          />
        </Animated.View>
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: bottom + 12, borderTopColor: colors.border }]}>
        <PrimaryCTA title="Start Free Trial" onPress={handleStartTrial} />
        <Text style={[styles.fineprint, { color: colors.mutedForeground }]}>
          Cancel anytime. You'll get a reminder 2 days before your trial ends.
        </Text>
        <View style={styles.legal}>
          <TextLink title="Restore purchases" onPress={finishOnboarding} />
          <Text style={[styles.legalDot, { color: colors.mutedForeground }]}>·</Text>
          <TextLink
            title="Terms"
            onPress={() => Linking.openURL("https://example.com/terms")}
          />
          <Text style={[styles.legalDot, { color: colors.mutedForeground }]}>·</Text>
          <TextLink
            title="Privacy"
            onPress={() => Linking.openURL("https://example.com/privacy")}
          />
        </View>
      </View>
    </View>
  );
}

interface PlanCardProps {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
}

function PlanCard({ plan, selected, onSelect }: PlanCardProps) {
  const { colors } = useTheme();
  const isAnnual = plan === "annual";
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onSelect}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        styles.planCard,
        {
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
        animatedStyle,
      ]}
    >
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.primary : colors.mutedForeground },
        ]}
      >
        {selected ? (
          <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
        ) : null}
      </View>

      <View style={styles.planBody}>
        <View style={styles.planTopRow}>
          <Text style={[styles.planName, { color: colors.foreground }]}>
            {isAnnual ? "ANNUAL" : "MONTHLY"}
          </Text>
          {isAnnual ? (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
                BEST VALUE
              </Text>
            </View>
          ) : null}
        </View>
        {isAnnual ? (
          <>
            <Text style={[styles.planPriceMain, { color: colors.foreground }]}>
              {PAYWALL.trialDays} days free, then {PAYWALL.annualPrice} / year
            </Text>
            <Text style={[styles.planPriceSub, { color: colors.mutedForeground }]}>
              Just {PAYWALL.annualMonthlyEquivalent} / month · Save {PAYWALL.annualSavingsPct}%
            </Text>
          </>
        ) : (
          <Text style={[styles.planPriceMain, { color: colors.foreground }]}>
            {PAYWALL.monthlyPrice} / month
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 20,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  testimonialWrap: {},
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  features: {
    borderRadius: 14,
    borderWidth: 1,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  plans: {
    gap: 10,
  },
  planCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "flex-start",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planBody: {
    flex: 1,
    gap: 4,
  },
  planTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planName: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  planPriceMain: {
    fontSize: 15,
    fontWeight: "600",
  },
  planPriceSub: {
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 6,
    borderTopWidth: 1,
  },
  fineprint: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
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
