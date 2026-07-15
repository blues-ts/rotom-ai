import type { AxiosInstance } from "axios";

import { searchCards } from "@/lib/api/pricing";
import { getCatalogPokemonCards, catalogCardToScrydex } from "@/lib/api/catalog";
import {
	buildPokemonCardsQ,
	buildPokemonCardsFallbackQ,
} from "@/lib/scrydex";
import type { ScrydexCard } from "@/types/scrydex";

// Shared fetch for "every print of one Pokémon" — used by the pokemon-cards
// screen's query AND the Pokédex tile's press-in prefetch, so both hit the
// exact same cache entry.

// Concurrent page-through cap for the PRICED (Scrydex) path — a Pikachu-sized
// dex entry can't fan out unbounded. Beyond ~1000 prints the grid trims the
// tail; totals stay true.
export const POKEMON_CARDS_MAX_PAGES = 10;

export const pokemonCardsQueryKey = (name: string, langCode: "en" | "ja") =>
	// "v3": the metadata path moved to the catalog's exact name-token lookup —
	// result set/ordering changed, and the MMKV persister rehydrates old
	// entries by key, so stale shapes need a fresh key.
	["pokemonCards", "v3", name, langCode] as const;

/**
 * Every print of one Pokémon. Metadata (the default) is a SINGLE catalog
 * request — the server matches exact name tokens against its index and
 * returns the whole list from RAM. `includePrices` (the Pro value-sort) still
 * pages the live pricing search, with a fieldless fallback so JA prints match
 * via their English translation.
 */
export async function fetchPokemonCards(
	api: AxiosInstance,
	opts: {
		name: string;
		langCode: "en" | "ja";
		includePrices?: boolean;
	},
): Promise<{ items: ScrydexCard[]; total: number }> {
	const { name, langCode, includePrices = false } = opts;
	if (!includePrices) {
		const cards = await getCatalogPokemonCards(api, {
			name,
			language: langCode,
		});
		return { items: cards.map(catalogCardToScrydex), total: cards.length };
	}
	let q = buildPokemonCardsQ(name, langCode);
	let first = await searchCards(api, { q, pageSize: 100, includePrices });
	if (first.total_count === 0) {
		// name: only matches printed names — fall back fieldless so JA prints
		// match via their English translation.
		q = buildPokemonCardsFallbackQ(name, langCode);
		first = await searchCards(api, { q, pageSize: 100, includePrices });
	}
	const items: ScrydexCard[] = [...first.data];
	const pageSize = first.page_size || 100;
	const totalPages = Math.min(
		Math.ceil(first.total_count / pageSize),
		POKEMON_CARDS_MAX_PAGES,
	);
	if (totalPages > 1) {
		const rest = await Promise.all(
			Array.from({ length: totalPages - 1 }, (_, i) =>
				searchCards(api, { q, page: i + 2, pageSize: 100, includePrices }),
			),
		);
		// Promise.all preserves order, so page ordering is kept.
		for (const r of rest) items.push(...r.data);
	}
	return { items, total: first.total_count };
}
