import type { Ionicons } from "@expo/vector-icons";

// TODO: When wiring RevenueCat (or any IAP provider), replace these constants
// with values pulled from the store offerings. Keep the keys stable so screens
// don't need to change.
export const PAYWALL = {
  trialDays: 7,
  annualPrice: "$49.99",
  annualMonthlyEquivalent: "$4.17",
  annualSavingsPct: 40,
  monthlyPrice: "$6.99",
  defaultPlan: "annual" as "annual" | "monthly",
} as const;

export const PAYWALL_FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}[] = [
  { icon: "chatbubbles-outline", label: "Unlimited River conversations" },
  { icon: "scan-outline", label: "Unlimited card scans" },
  { icon: "diamond-outline", label: "Raw + graded prices on every card" },
  { icon: "stats-chart-outline", label: "Full portfolio tracking + price alerts" },
];

export const PAYWALL_TESTIMONIAL = {
  name: "Marcus T.",
  tag: "Flipper, 4 months on River",
  rating: 5,
  quote:
    "River paid for itself in my first week. I don't buy, sell, or grade a card without asking it first.",
};
