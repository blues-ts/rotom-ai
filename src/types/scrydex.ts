/**
 * Type definitions for Scrydex card data as served by rotom-ai-server.
 * Mirrors rotom-ai-server/src/types/Scrydex.ts — keep in sync.
 */

export type ScrydexCondition = "NM" | "LP" | "MP" | "HP" | "DM" | "U";

export type ScrydexGradingCompany =
  | "PSA"
  | "CGC"
  | "BGS"
  | "SGC"
  | "ACE"
  | "AGS"
  | "TAG";

/** Trend values occasionally arrive as strings — always parse with toNumber() */
export interface ScrydexTrendWindow {
  price_change: number | string;
  percent_change: number | string;
}

export interface ScrydexTrends {
  days_1?: ScrydexTrendWindow;
  days_7?: ScrydexTrendWindow;
  days_14?: ScrydexTrendWindow;
  days_30?: ScrydexTrendWindow;
  days_90?: ScrydexTrendWindow;
  days_180?: ScrydexTrendWindow;
}

export interface ScrydexRawPrice {
  type: "raw";
  /** "U" (unopened) appears on sealed product prices */
  condition: ScrydexCondition;
  market?: number;
  low?: number;
  mid?: number;
  high?: number;
  currency: string;
  source_currency?: string;
  is_perfect?: boolean;
  is_signed?: boolean;
  is_error?: boolean;
  trends?: ScrydexTrends;
}

export interface ScrydexGradedPrice {
  type: "graded";
  company: ScrydexGradingCompany;
  grade: string;
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  currency: string;
  source_currency?: string;
  is_perfect?: boolean;
  is_signed?: boolean;
  is_error?: boolean;
  trends?: ScrydexTrends;
}

export type ScrydexPrice = ScrydexRawPrice | ScrydexGradedPrice;

export interface ScrydexImage {
  type?: string;
  small?: string;
  medium?: string;
  large?: string;
}

export interface ScrydexVariant {
  name: string;
  images?: ScrydexImage[];
  prices?: ScrydexPrice[];
}

export interface ScrydexExpansion {
  id: string;
  name: string;
  series?: string;
  code?: string;
  total?: number;
  printed_total?: number;
  language?: string;
  language_code?: string;
  release_date?: string;
  is_online_only?: boolean;
  logo?: string;
  symbol?: string;
  /** English translations for Japanese expansions */
  translation?: { en?: { name?: string } };
}

export interface ScrydexLegality {
  format: string;
  status: string;
}

export interface ScrydexCard {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: string | number;
  /** Card number without leading zeros, e.g. "13" */
  number: string;
  /** Full printed form, e.g. "013/198" */
  printed_number?: string;
  rarity?: string;
  rarity_code?: string;
  artist?: string;
  national_pokedex_numbers?: number[];
  legalities?: ScrydexLegality[];
  images?: ScrydexImage[];
  expansion?: ScrydexExpansion;
  language?: string;
  language_code?: string;
  expansion_sort_order?: number;
  variants?: ScrydexVariant[];
  /** English translations for Japanese cards (partial) */
  translation?: {
    en?: { name?: string; rarity?: string | null; [key: string]: unknown };
  };
}

export interface ScrydexSealedProduct {
  id: string;
  name: string;
  type?: string;
  description?: string;
  images?: ScrydexImage[];
  expansion?: ScrydexExpansion;
  expansion_sort_order?: number;
  variants?: ScrydexVariant[];
}

export interface ScrydexPriceHistoryDay {
  /** "2026/06/10" */
  date: string;
  prices: (ScrydexPrice & { variant?: string })[];
}

export interface ScrydexListing {
  id: string;
  source: string;
  card_id: string;
  title: string;
  variant?: string;
  company?: string;
  grade?: string;
  is_perfect?: boolean;
  is_error?: boolean;
  is_signed?: boolean;
  url?: string;
  price: number;
  currency: string;
  /** "2026/06/09" */
  sold_at: string;
}

// --- rotom-ai-server response envelopes ---

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  page: number;
  page_size: number;
  count?: number;
  total_count: number;
}

export interface ApiItemResponse<T> {
  success: boolean;
  data: T;
}
