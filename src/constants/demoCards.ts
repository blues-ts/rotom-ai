export type DemoChipId = "grade" | "trend" | "worth";

export interface DemoCard {
  id: string;
  name: string;
  setName: string;
  cardNumber: string;
  image: string;
  rawNM: number;
  psa10: number;
  pct30d: number;
  responses: Record<DemoChipId, string>;
}

// TODO: verify pokemontcg.io IDs & swap for backend-served images once the
// real card-analyze pipeline serves demo fixtures.
export const DEMO_CARDS: DemoCard[] = [
  {
    id: "swsh7-215",
    name: "Umbreon VMAX (Alt Art)",
    setName: "Evolving Skies",
    cardNumber: "215/203",
    image: "https://images.pokemontcg.io/swsh7/215_hires.png",
    rawNM: 412,
    psa10: 1180,
    pct30d: 18,
    responses: {
      grade:
        "Moonbreon is a no-brainer grade if yours is clean. Raw NM is $412, PSA 10 is $1,180 — that's a $768 spread. Centering is the killer on this card, so only grade if corners and edges are crisp. Skip BGS unless you're chasing a 10.",
      trend:
        "Moonbreon is up 18% in the last 30 days and volume on TCGplayer is up 22%. Modern set classic — low pop relative to demand. Holding makes sense unless you need liquidity.",
      worth:
        "Near Mint raw: $412. PSA 10: $1,180 (+18% MoM). PSA 9 sits around $580. eBay sold comps are $395-$430 for raw. If yours is in a binder sleeve, you're looking at raw value — if it's centered and clean, ship it to PSA.",
    },
  },
  {
    id: "sv3-215",
    name: "Charizard ex SIR",
    setName: "Obsidian Flames",
    cardNumber: "215/197",
    image: "https://images.pokemontcg.io/sv3/215_hires.png",
    rawNM: 248,
    psa10: 690,
    pct30d: 6,
    responses: {
      grade:
        "Charizard ex SIR is worth grading but the math is tighter than people think. Raw $248 → PSA 10 $690 = $442 spread before grading fees. PSA 9 is only $290, so you need that 10 to make it worth the wait.",
      trend:
        "Slow-and-steady climber. Up 6% over 30d, up 31% year-to-date. Modern Charizard always appreciates — this one specifically because of the artwork. Not a flip, a hold.",
      worth:
        "Near Mint raw: $248. PSA 10: $690. PSA 9: $290. BGS 9.5: $520. eBay sold average over 30d: $251 raw. Pricing is steady — no rush to sell.",
    },
  },
  {
    id: "swsh11-186",
    name: "Giratina V (Alt Art)",
    setName: "Lost Origin",
    cardNumber: "186/196",
    image: "https://images.pokemontcg.io/swsh11/186_hires.png",
    rawNM: 162,
    psa10: 480,
    pct30d: -4,
    responses: {
      grade:
        "Giratina V Alt is grade-worthy but timing matters. Raw $162 → PSA 10 $480. Spread is solid but the card dipped 4% this month — wait for a turnaround before shipping, or grade and hold 6+ months.",
      trend:
        "Down 4% over 30d, but the 90d trend is flat and 1yr is +12%. Alt arts for legendary V cards hold value — this is a normal cooling period, not a crash.",
      worth:
        "Near Mint raw: $162. PSA 10: $480. PSA 9: $210. eBay has been listing around $158-$175. If you're selling raw, list at $165 firm.",
    },
  },
  {
    id: "swsh7-218",
    name: "Rayquaza VMAX (Alt Art)",
    setName: "Evolving Skies",
    cardNumber: "218/203",
    image: "https://images.pokemontcg.io/swsh7/218_hires.png",
    rawNM: 285,
    psa10: 720,
    pct30d: 11,
    responses: {
      grade:
        "Rayquaza VMAX Alt is one of the cleanest grades in modern. Raw $285 → PSA 10 $720 = $435 spread. Card surface is forgiving and centering is usually OK — PSA 10 success rate is above average.",
      trend:
        "Up 11% in 30 days. Rayquaza alt is the sleeper of Evolving Skies — everyone's watching Moonbreon, meanwhile this is quietly pumping. Expect continued upside.",
      worth:
        "Near Mint raw: $285. PSA 10: $720. PSA 9: $340. Sold comps last week: $278-$295 raw. List at $290 for a quick move.",
    },
  },
  {
    id: "sv8-247",
    name: "Pikachu ex SIR",
    setName: "Surging Sparks",
    cardNumber: "238/191",
    image: "https://images.pokemontcg.io/sv8/238_hires.png",
    rawNM: 320,
    psa10: 780,
    pct30d: 24,
    responses: {
      grade:
        "Pikachu ex SIR is hot right now. Raw $320 → PSA 10 $780 = $460 spread, and this card is brand new so pop reports are low — high PSA 10 probability if yours is fresh out of a pack. Grade it.",
      trend:
        "Up 24% in 30 days. Recent set so it's volatile, but the chase Pikachu SIR of a new set always runs. Watch for a Japanese reprint announcement — that's the only risk to the upside.",
      worth:
        "Near Mint raw: $320. PSA 10: $780. PSA 9: $380. eBay asking prices are $310-$340 raw. Don't sell raw if you can grade — the spread is too good.",
    },
  },
  {
    id: "sv2-254",
    name: "Iono SIR",
    setName: "Paldea Evolved",
    cardNumber: "254/193",
    image: "https://images.pokemontcg.io/sv2/254_hires.png",
    rawNM: 175,
    psa10: 430,
    pct30d: 3,
    responses: {
      grade:
        "Iono SIR is a solid grade but not urgent. Raw $175 → PSA 10 $430 = $255 spread. Trainer SIRs are more prone to centering misses than Pokemon SIRs — if yours looks off-center, skip PSA, try CGC.",
      trend:
        "Up 3% over 30d, up 19% over 1yr. Trainer SIRs are a slow-burn category — Iono is a fan favorite so it'll keep climbing. Not a flip, a hold.",
      worth:
        "Near Mint raw: $175. PSA 10: $430. PSA 9: $220. CGC 10: $360. eBay raw comps: $168-$180. List at $179.",
    },
  },
];

import type { Ionicons } from "@expo/vector-icons";

export const DEMO_CHIPS: {
  id: DemoChipId;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}[] = [
  { id: "grade", icon: "diamond-outline", label: "Is this worth grading?" },
  { id: "trend", icon: "trending-up-outline", label: "Is this trending?" },
  { id: "worth", icon: "cash-outline", label: "What's it worth?" },
];
