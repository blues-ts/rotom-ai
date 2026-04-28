import type { Ionicons } from "@expo/vector-icons";

export type IconName = keyof typeof Ionicons.glyphMap;

export const ONBOARDING_STEPS = 13;

export const STEP_NUMBERS = {
  welcome: 1,
  goal: 2,
  pain: 3,
  proof: 4,
  solution: 5,
  comparison: 6,
  eras: 7,
  budget: 8,
  camera: 9,
  processing: 10,
  demo: 11,
  snapshot: 12,
  paywall: 13,
} as const;

export type GoalId =
  | "flipping"
  | "tracking"
  | "grading"
  | "just_pulled"
  | "returning"
  | "new";

export const GOAL_OPTIONS: { id: GoalId; icon: IconName; label: string }[] = [
  { id: "flipping", icon: "cash-outline", label: "Flipping cards on eBay / TCGplayer" },
  { id: "tracking", icon: "stats-chart-outline", label: "Tracking my collection's value" },
  { id: "grading", icon: "diamond-outline", label: "Figuring out what to grade" },
  { id: "just_pulled", icon: "sparkles-outline", label: "I just pulled something — is it worth anything?" },
  { id: "returning", icon: "refresh-outline", label: "Getting back into the hobby" },
  { id: "new", icon: "rocket-outline", label: "Brand new to Pokemon TCG" },
];

export type PainId =
  | "research_time"
  | "missing_moves"
  | "grading_unsure"
  | "portfolio_blind"
  | "condition_guess"
  | "listing_guess"
  | "deal_unsure";

export const PAIN_OPTIONS: {
  id: PainId;
  icon: IconName;
  label: string;
  solution: string;
}[] = [
  {
    id: "research_time",
    icon: "time-outline",
    label: "Pricing one card takes 15 minutes of tabs",
    solution: "Scan any card. River identifies it and prices it in 3 seconds.",
  },
  {
    id: "missing_moves",
    icon: "trending-down-outline",
    label: "I miss big moves until it's too late",
    solution: "River watches trends so you spot moves before Reddit does.",
  },
  {
    id: "grading_unsure",
    icon: "ribbon-outline",
    label: "I can't tell what's worth grading",
    solution: "PSA 10 / BGS 9.5 side-by-side with raw. See the spread before you ship.",
  },
  {
    id: "portfolio_blind",
    icon: "wallet-outline",
    label: "I have no idea what my collection is worth",
    solution: "River tracks your whole collection. Total value, daily change, top movers.",
  },
  {
    id: "condition_guess",
    icon: "scan-outline",
    label: "Condition is a coin flip",
    solution: "River calls condition from the scan and prices each tier.",
  },
  {
    id: "listing_guess",
    icon: "pricetags-outline",
    label: "I'm guessing at my eBay list prices",
    solution: "Live comps from TCGplayer + eBay, so every list is sharp.",
  },
  {
    id: "deal_unsure",
    icon: "scale-outline",
    label: "I can't tell a good deal from a bad one",
    solution: "Ask River before you buy. It knows every recent sale.",
  },
];

export const TESTIMONIALS = [
  {
    name: "Marcus T.",
    tag: "Flipper",
    rating: 5,
    quote:
      "River told me to grade my Umbreon VMAX at NM. Paid $40 raw, sold PSA 10 for $380. This app paid for itself in one card.",
  },
  {
    name: "Priya L.",
    tag: "Returning collector",
    rating: 5,
    quote:
      "I dug my 1999 binder out of my parents' garage. River priced the whole thing in ten minutes. I was sitting on $3,800 I had no idea about.",
  },
  {
    name: "Devin A.",
    tag: "Modern collector",
    rating: 5,
    quote:
      "The AI actually knows what it's talking about. I ask River before every purchase now — it's caught me overpaying on comps twice this month.",
  },
];

export type EraId =
  | "wotc"
  | "ecard_ex"
  | "dp_hgss"
  | "bw_sm"
  | "swsh"
  | "sv"
  | "mega"
  | "sealed";

export const ERA_OPTIONS: { id: EraId; icon: IconName; label: string }[] = [
  { id: "wotc", icon: "trophy-outline", label: "WOTC (Base → Neo)" },
  { id: "ecard_ex", icon: "hourglass-outline", label: "e-Card → EX" },
  { id: "dp_hgss", icon: "planet-outline", label: "Diamond & Pearl → HGSS" },
  { id: "bw_sm", icon: "sunny-outline", label: "BW → XY → Sun & Moon" },
  { id: "swsh", icon: "shield-outline", label: "Sword & Shield" },
  { id: "sv", icon: "moon-outline", label: "Scarlet & Violet" },
  { id: "mega", icon: "flash-outline", label: "Mega Evolution" },
  { id: "sealed", icon: "cube-outline", label: "Sealed product" },
];

export type BudgetId = "lt_10" | "10_50" | "50_200" | "200_1000" | "whale";

export const BUDGET_OPTIONS: { id: BudgetId; icon: IconName; label: string }[] = [
  { id: "lt_10", icon: "wallet-outline", label: "Under $10" },
  { id: "10_50", icon: "cash-outline", label: "$10 – $50" },
  { id: "50_200", icon: "card-outline", label: "$50 – $200" },
  { id: "200_1000", icon: "diamond-outline", label: "$200 – $1,000" },
  { id: "whale", icon: "trophy-outline", label: "Whales only ($1,000+)" },
];

export const COMPARISON_ROWS = [
  { label: "Personal AI analyst", river: true, without: false },
  { label: "Real-time raw + graded prices", river: true, without: false },
  { label: "Grade-or-sell math", river: true, without: false },
  { label: "Whole-portfolio tracking", river: true, without: false },
  { label: "Trend alerts on your cards", river: true, without: false },
];

export const PROCESSING_CAPTIONS = [
  "Teaching River your collection…",
  "Loading market data from TCGplayer + eBay…",
  "Tuning grade recommendations…",
  "River's ready.",
];

export const PERMISSION_SKIPPED_VALUE = "skipped";
