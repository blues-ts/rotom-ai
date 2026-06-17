/**
 * Typed wrappers for the rotom-ai-server static catalog endpoints.
 * These serve pre-fetched set/card metadata + image URLs (no pricing) from the
 * backend's in-memory cache. Callers pass the axios instance from useApi().
 */
import type { AxiosInstance } from "axios";
import type { ScrydexCard, ScrydexExpansion, ScrydexImage } from "@/types/scrydex";

export interface CatalogSet {
  setId: string;
  name: string;
  /** English translation of the name for JA sets. */
  nameEn?: string;
  series?: string;
  code?: string;
  releaseDate?: string;
  totalCards?: number;
  printedTotal?: number;
  language?: string;
  languageCode?: string;
  isOnlineOnly?: boolean;
  logo?: string;
  symbol?: string;
  cardCount: number;
}

export interface CatalogCard {
  cardId: string;
  setId: string;
  name: string;
  /** English translation of the name for JA cards. */
  nameEn?: string;
  number: string;
  printedNumber?: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  rarity?: string;
  rarityCode?: string;
  hp?: string;
  artist?: string;
  expansionSortOrder?: number;
  images?: ScrydexImage[];
  variants?: { name: string; images?: ScrydexImage[] }[];
  language?: string;
  languageCode?: string;
}

export async function getCatalogSets(api: AxiosInstance): Promise<CatalogSet[]> {
  const res = await api.get<{ success: boolean; count: number; data: CatalogSet[] }>(
    "/api/catalog/sets",
  );
  return res.data.data;
}

export async function getCatalogSet(
  api: AxiosInstance,
  id: string,
): Promise<{ set: CatalogSet; cards: CatalogCard[] }> {
  const res = await api.get<{ success: boolean; set: CatalogSet; cards: CatalogCard[] }>(
    `/api/catalog/sets/${encodeURIComponent(id)}`,
  );
  return { set: res.data.set, cards: res.data.cards };
}

export async function getCatalogCard(api: AxiosInstance, id: string): Promise<CatalogCard> {
  const res = await api.get<{ success: boolean; data: CatalogCard }>(
    `/api/catalog/cards/${encodeURIComponent(id)}`,
  );
  return res.data.data;
}

export interface CatalogSearchPage {
  data: CatalogCard[];
  total: number;
  page: number;
  pageSize: number;
}

export async function searchCatalogCards(
  api: AxiosInstance,
  opts: { q: string; page?: number; pageSize?: number },
): Promise<CatalogSearchPage> {
  const res = await api.get<{ success: boolean } & CatalogSearchPage>("/api/catalog/cards", {
    params: { q: opts.q, page: opts.page ?? 1, pageSize: opts.pageSize ?? 30 },
  });
  return { data: res.data.data, total: res.data.total, page: res.data.page, pageSize: res.data.pageSize };
}

// --- Adapters to the Scrydex shapes the existing UI/helpers expect ---
// (nameEn → translation.en.name so getCard/ExpansionDisplayName keeps working.)

export function catalogSetToExpansion(s: CatalogSet): ScrydexExpansion {
  return {
    id: s.setId,
    name: s.name,
    series: s.series,
    code: s.code,
    total: s.totalCards,
    printed_total: s.printedTotal,
    language: s.language,
    language_code: s.languageCode,
    release_date: s.releaseDate,
    is_online_only: s.isOnlineOnly,
    logo: s.logo,
    symbol: s.symbol,
    ...(s.nameEn ? { translation: { en: { name: s.nameEn } } } : {}),
  };
}

export function catalogCardToScrydex(c: CatalogCard): ScrydexCard {
  return {
    id: c.cardId,
    name: c.name,
    number: c.number,
    printed_number: c.printedNumber,
    supertype: c.supertype,
    subtypes: c.subtypes,
    types: c.types,
    rarity: c.rarity,
    rarity_code: c.rarityCode,
    hp: c.hp,
    artist: c.artist,
    images: c.images,
    variants: c.variants,
    language: c.language,
    language_code: c.languageCode,
    expansion_sort_order: c.expansionSortOrder,
    ...(c.nameEn ? { translation: { en: { name: c.nameEn } } } : {}),
  };
}
