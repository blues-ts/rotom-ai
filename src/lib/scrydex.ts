/**
 * Helpers for working with Scrydex card data: search query building,
 * price selection, and shape adapters shared by search, card detail,
 * collections, and the camera flow.
 */
import type {
  ScrydexCard,
  ScrydexExpansion,
  ScrydexImage,
  ScrydexListing,
  ScrydexPrice,
  ScrydexPriceHistoryDay,
  ScrydexVariant,
} from "@/types/scrydex";

/** Anything with variants/images — cards and sealed products both qualify. */
type PricedItem = { variants?: ScrydexVariant[]; images?: ScrydexImage[] };

export type PriceSelector =
  | { kind: "raw"; condition: string }
  | { kind: "graded"; company: string; grade: string };

const CONDITION_ORDER = ["NM", "LP", "MP", "HP", "DM"];

export const CONDITION_LABELS: Record<string, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DM: "Damaged",
  U: "Unopened",
};

export const PERIOD_TO_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/** Scrydex numbers occasionally arrive as JSON strings. */
export function toNumber(value: number | string | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** "unlimitedHolofoil" → "Unlimited Holofoil", "reverse_holofoil" → "Reverse Holofoil" */
export function formatVariantLabel(variant: string): string {
  return variant
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Online-only cards (e.g. TCG Pocket) are excluded via negation —
 * `expansion.is_online_only:false` would also drop Japanese cards whose
 * expansions don't index the field, so `-...:true` is the safe form.
 */
const ONLINE_ONLY_EXCLUSION = "-expansion.is_online_only:true";

const LANGUAGE_TAGS: Record<string, "en" | "ja"> = {
  en: "en",
  eng: "en",
  english: "en",
  ja: "ja",
  jp: "ja",
  jpn: "ja",
  japanese: "ja",
};

/**
 * Pull a standalone language tag out of a search ("charizard jp" → Japanese
 * prints only). The tag can sit anywhere in the query, but only counts when
 * other terms remain — searching just "jp" stays a plain name search.
 */
export function extractSearchLanguage(raw: string): {
  rest: string;
  language?: "en" | "ja";
} {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return { rest: raw.trim() };
  let language: "en" | "ja" | undefined;
  const rest: string[] = [];
  for (const t of tokens) {
    const lang = LANGUAGE_TAGS[t.toLowerCase()];
    if (lang && !language) language = lang;
    else rest.push(t);
  }
  if (rest.length === 0) return { rest: raw.trim() };
  return { rest: rest.join(" "), language };
}

function parseSearchTerms(raw: string): {
  nameTokens: string[];
  number?: string;
  language?: "en" | "ja";
} {
  const { rest, language } = extractSearchLanguage(raw);
  const tokens = rest.split(/\s+/).filter(Boolean);
  let nameTokens = tokens;
  let number: string | undefined;

  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const isNumberToken =
      /^\d+(\/\d+)?$/.test(last) || /^[A-Za-z]{1,4}\d{1,4}$/.test(last);
    if (isNumberToken) {
      nameTokens = tokens.slice(0, -1);
      const numberPart = last.includes("/") ? last.split("/")[0] : last;
      number = numberPart.replace(/^0+(\d)/, "$1");
    }
  }

  const cleaned = nameTokens
    .join(" ")
    .replace(/["#:*()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { nameTokens: cleaned ? cleaned.split(" ") : [], number, language };
}

/**
 * Query for browsing/filtering the cards of one expansion. Filter tokens
 * become `name:` prefix wildcards (with the usual trailing-number handling)
 * so the set page narrows as the user types.
 */
export function buildSetCardsQ(expansionId: string, filter: string): string {
  const clauses = [`expansion.id:${expansionId}`];
  const { nameTokens, number } = parseSearchTerms(filter);
  for (const tok of nameTokens) clauses.push(`name:${tok}*`);
  if (number) clauses.push(`number:${number}`);
  return clauses.join(" ");
}

/**
 * Cards for one Pokémon (the Pokédex browse). The dex name is a quoted phrase
 * on the printed name — `name:"mr mime"` keyword matching — with the usual
 * online-only exclusion and optional language filter.
 */
export function buildPokemonCardsQ(
  name: string,
  language?: "en" | "ja",
): string {
  // Dex names use the typographic apostrophe (Farfetch’d); cards print '.
  const clean = name.replace(/’/g, "'");
  const clauses = [`name:"${clean}"`];
  if (language) clauses.push(`language_code:${language}`);
  clauses.push(ONLINE_ONLY_EXCLUSION);
  return clauses.join(" ");
}

/**
 * Fieldless fallback when the name query finds nothing — `name:` only matches
 * printed names, so this is what surfaces Japanese prints (リザードン) via
 * their English translation. Terms stay unquoted (quoted fieldless phrases
 * are unsupported) and punctuation is dropped.
 */
export function buildPokemonCardsFallbackQ(
  name: string,
  language?: "en" | "ja",
): string {
  const terms = name
    .replace(/[’'".:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!terms) return "";
  const clauses = [terms];
  if (language) clauses.push(`language_code:${language}`);
  clauses.push(ONLINE_ONLY_EXCLUSION);
  return clauses.join(" ");
}

/** Drop non-USD rows and signed/error/perfect outliers (junk $9999 entries). */
function isUsableRow(price: ScrydexPrice): boolean {
  if (price.currency !== "USD") return false;
  if (price.is_signed || price.is_error || price.is_perfect) return false;
  return true;
}

function matchesSelector(price: ScrydexPrice, sel: PriceSelector): boolean {
  if (sel.kind === "raw") {
    return price.type === "raw" && price.condition === sel.condition;
  }
  return (
    price.type === "graded" &&
    price.company.toUpperCase() === sel.company.toUpperCase() &&
    price.grade === sel.grade
  );
}

function priceValue(price: ScrydexPrice): number | undefined {
  return (
    toNumber(price.market) ??
    toNumber(price.mid) ??
    toNumber(price.low) ??
    toNumber(price.high)
  );
}

/**
 * Pick a price off a card for a given variant + selector. When `variant` is
 * undefined, the first variant with a usable match wins.
 */
export function selectPrice(
  card: PricedItem,
  variant: string | undefined,
  sel: PriceSelector,
): { value: number; currency: "USD"; variant: string } | null {
  for (const v of card.variants ?? []) {
    if (variant && v.name !== variant) continue;
    for (const price of v.prices ?? []) {
      if (!isUsableRow(price) || !matchesSelector(price, sel)) continue;
      const value = priceValue(price);
      if (value !== undefined) {
        return { value, currency: "USD", variant: v.name };
      }
    }
  }
  return null;
}

// Scrydex only tags listings with graders it recognizes — slabs from smaller
// companies (LCC, GMA, …) or oddly-worded titles ("… 10 CGC") come back with
// company unset and would pass a naive "no company = raw" filter. ACE and TAG
// are also card terms (ACE SPEC, TAG TEAM), so they only count when followed
// by a grade number.
const GRADED_TITLE_PATTERN =
  /\b(?:PSA|BGS|CGC|SGC|AGS|LCC|GMA|MGC|HGA|ISA|KSA|RCG|PGS)\b|\b(?:ACE|TAG)\s*\d{1,2}(?:\.5)?\b|\bgraded\b|\bslab/i;

/** True when a sold listing is (or very likely is) a graded slab sale. */
export function isLikelyGradedListing(listing: ScrydexListing): boolean {
  if (listing.company) return true;
  return GRADED_TITLE_PATTERN.test(listing.title ?? "");
}

export function getVariantNames(card: PricedItem): string[] {
  return (card.variants ?? []).map((v) => v.name);
}

/** Raw conditions with usable USD pricing for a variant, in NM→DM order. */
export function getConditionOptions(card: ScrydexCard, variant: string): string[] {
  const found = new Set<string>();
  for (const v of card.variants ?? []) {
    if (v.name !== variant) continue;
    for (const price of v.prices ?? []) {
      // priceValue check: a row can pass isUsableRow yet carry no numbers at
      // all — offering it would select a condition selectPrice can't resolve.
      if (
        price.type === "raw" &&
        isUsableRow(price) &&
        priceValue(price) !== undefined
      ) {
        found.add(price.condition);
      }
    }
  }
  return CONDITION_ORDER.filter((c) => found.has(c));
}

/** Graded companies + grades with usable USD pricing for a variant. PSA first, grades descending. */
export function getGradedOptions(
  card: ScrydexCard,
  variant: string,
): { company: string; grades: string[] }[] {
  const byCompany = new Map<string, Set<string>>();
  for (const v of card.variants ?? []) {
    if (v.name !== variant) continue;
    for (const price of v.prices ?? []) {
      if (price.type !== "graded" || !isUsableRow(price)) continue;
      // Skip rows with no numeric data — they'd offer a grade that
      // selectPrice can't resolve, stranding the UI on "—".
      if (priceValue(price) === undefined) continue;
      const company = price.company.toUpperCase();
      if (!byCompany.has(company)) byCompany.set(company, new Set());
      byCompany.get(company)!.add(price.grade);
    }
  }
  return Array.from(byCompany.entries())
    .sort(([a], [b]) => {
      if (a === "PSA") return -1;
      if (b === "PSA") return 1;
      return a.localeCompare(b);
    })
    .map(([company, grades]) => ({
      company,
      grades: Array.from(grades).sort((a, b) => Number(b) - Number(a)),
    }));
}

function pickImageUrl(
  image: ScrydexImage | undefined,
  size: "small" | "medium" | "large",
): string | undefined {
  if (!image) return undefined;
  return image[size] ?? image.medium ?? image.large ?? image.small;
}

function frontImage(images: ScrydexImage[] | undefined): ScrydexImage | undefined {
  if (!images || images.length === 0) return undefined;
  return images.find((i) => i.type === "front") ?? images[0];
}

/** Variant-specific image when available, falling back to the card's front image. */
export function getCardImage(
  card: PricedItem,
  variant?: string,
  size: "small" | "medium" | "large" = "small",
): string | undefined {
  if (variant) {
    const v = (card.variants ?? []).find((x) => x.name === variant);
    const url = pickImageUrl(frontImage(v?.images), size);
    if (url) return url;
  }
  return pickImageUrl(frontImage(card.images), size);
}

/** Full printed number ("013/198") when available, else the bare number. */
export function getCardNumber(card: ScrydexCard): string {
  return card.printed_number ?? card.number;
}

/** English name when available (Japanese sets carry translation.en.name). */
export function getExpansionDisplayName(expansion: ScrydexExpansion): string {
  return expansion.translation?.en?.name || expansion.name;
}

/**
 * English name when available — Japanese cards carry translation.en.name
 * (coverage is partial; falls back to the printed name).
 */
export function getCardDisplayName(card: ScrydexCard): string {
  return card.translation?.en?.name || card.name;
}

/** English rarity when available (通常 → "Normal", スペシャルアートレア → "Special Art Rare"). */
export function getCardDisplayRarity(card: ScrydexCard): string | undefined {
  return card.translation?.en?.rarity || card.rarity;
}

/**
 * TCGplayer product page for the selected variant. Falls back to any variant
 * carrying a tcgplayer id — a TCGplayer product page covers every printing of
 * a card, so a sibling variant's id still lands on the right page.
 */
export function getTcgplayerProductUrl(
  item: { variants?: ScrydexVariant[] },
  variant?: string,
): string | undefined {
  const variants = item.variants ?? [];
  const ordered = variant
    ? [
        ...variants.filter((v) => v.name === variant),
        ...variants.filter((v) => v.name !== variant),
      ]
    : variants;
  for (const v of ordered) {
    const mp = v.marketplaces?.find((m) => m.name === "tcgplayer");
    if (mp?.product_id) {
      return `https://www.tcgplayer.com/product/${mp.product_id}`;
    }
  }
  return undefined;
}

/**
 * Flatten history days into chart points for one variant + selector.
 * History rows for a tier path are already outlier-filtered server-side,
 * but keep the filter as defense. Sorted ascending by date.
 */
export function historyToChartPoints(
  days: ScrydexPriceHistoryDay[],
  variant: string | undefined,
  sel: PriceSelector,
): { timestamp: number; value: number }[] {
  const points: { timestamp: number; value: number }[] = [];
  for (const day of days) {
    const timestamp = Date.parse(`${day.date.replace(/\//g, "-")}T00:00:00Z`);
    if (Number.isNaN(timestamp)) continue;
    for (const price of day.prices ?? []) {
      if (variant && price.variant && price.variant !== variant) continue;
      if (!isUsableRow(price) || !matchesSelector(price, sel)) continue;
      const value = priceValue(price);
      if (value === undefined) continue;
      points.push({ timestamp, value });
      break;
    }
  }
  return points.sort((a, b) => a.timestamp - b.timestamp);
}
