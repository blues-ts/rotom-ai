import type { AxiosInstance } from "axios";

import { searchCards } from "@/lib/api/pricing";
import { searchCatalogCards, catalogCardToScrydex } from "@/lib/api/catalog";
import {
	buildPokemonCardsQ,
	buildPokemonCardsFallbackQ,
} from "@/lib/scrydex";
import type { ScrydexCard } from "@/types/scrydex";

// Shared fetch for "every print of one Pokémon" — used by the pokemon-cards
// screen's query AND the Pokédex tile's press-in prefetch, so both hit the
// exact same cache entry.

// Concurrent page-through cap — a Pikachu-sized dex entry can't fan out
// unbounded. Beyond ~1000 prints the grid trims the tail; totals stay true.
export const POKEMON_CARDS_MAX_PAGES = 10;

export const pokemonCardsQueryKey = (
	name: string,
	langCode: "en" | "ja",
	isPro: boolean,
) =>
	// "v2": this key previously held an infinite-query shape ({pages}); the
	// MMKV persister rehydrates old entries by key, so the shape change
	// needed a new key or restored caches crashed on `.items`.
	["pokemonCards", "v2", name, langCode, isPro] as const;

/**
 * Whole-list fetch, paginated concurrently (~2 round trips). Pro hits the
 * pricing search (with a fieldless fallback so JA prints match via their
 * English translation); non-Pro pages the local catalog instead.
 */
export async function fetchPokemonCards(
	api: AxiosInstance,
	opts: {
		name: string;
		langCode: "en" | "ja";
		isPro: boolean;
		includePrices?: boolean;
	},
): Promise<{ items: ScrydexCard[]; total: number }> {
	const { name, langCode, isPro, includePrices = false } = opts;
	if (!isPro) {
		const first = await searchCatalogCards(api, {
			q: name,
			pageSize: 100,
			language: langCode,
		});
		const items = first.data.map(catalogCardToScrydex);
		const totalPages = Math.min(
			Math.ceil(first.total / (first.pageSize || 100)),
			POKEMON_CARDS_MAX_PAGES,
		);
		if (totalPages > 1) {
			const rest = await Promise.all(
				Array.from({ length: totalPages - 1 }, (_, i) =>
					searchCatalogCards(api, {
						q: name,
						page: i + 2,
						pageSize: 100,
						language: langCode,
					}),
				),
			);
			for (const r of rest) items.push(...r.data.map(catalogCardToScrydex));
		}
		return { items, total: first.total };
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
