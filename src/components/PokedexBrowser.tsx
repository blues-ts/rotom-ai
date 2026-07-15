import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
	Dimensions,
	FlatList,
	Keyboard,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	type ScrollHandlerProcessed,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardWaterfall } from "@/lib/waterfall";

import { useQueryClient } from "@tanstack/react-query";

import { useRiverTheme, type RiverTheme } from "@/constants/theme";
import { useApi } from "@/lib/axios";
import {
	fetchPokemonCards,
	pokemonCardsQueryKey,
} from "@/lib/pokemonCards";
import CardPressable from "@/components/CardPressable";
import pokedexNames from "@/data/pokedex.json";

// Every Pokémon, instantly: the dex (id + display name) is BUNDLED
// (src/data/pokedex.json, ~11 KB, generated once from PokéAPI), so switching
// to the Pokédex never fetches a list. Only the sprites come off the network
// — PokéAPI's GitHub CDN, keyed by dex number — and expo-image's memory-disk
// cache makes each one a one-time download.

type DexEntry = { id: number; name: string };

const POKEDEX: DexEntry[] = (pokedexNames as string[]).map((name, i) => ({
	id: i + 1,
	name,
}));

const spriteUrl = (id: number) =>
	`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const tileWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const SPRITE_SIZE = 72;
const TILE_HEIGHT = SPRITE_SIZE + 40; // sprite + name + number lines

// Generation boundaries are fixed national-dex ranges, so the sectioned list
// (headers + rows of three) is built once at module scope. Headers can't be
// interleaved into a numColumns FlatList, so each list item is either a
// full-width header or one pre-chunked row of tiles — generations never
// share a row.
const GENERATIONS = [
	{ numeral: "I", region: "Kanto", from: 1, to: 151 },
	{ numeral: "II", region: "Johto", from: 152, to: 251 },
	{ numeral: "III", region: "Hoenn", from: 252, to: 386 },
	{ numeral: "IV", region: "Sinnoh", from: 387, to: 493 },
	{ numeral: "V", region: "Unova", from: 494, to: 649 },
	{ numeral: "VI", region: "Kalos", from: 650, to: 721 },
	{ numeral: "VII", region: "Alola", from: 722, to: 809 },
	{ numeral: "VIII", region: "Galar", from: 810, to: 905 },
	{ numeral: "IX", region: "Paldea", from: 906, to: 1025 },
] as const;

// Same menu vocabulary as the sets browser: "oldest" is dex order (the
// default here — #0001 up), "newest" walks it backwards, "alpha" is one flat
// A-to-Z run with no generation headers.
export type DexSort = "newest" | "oldest" | "alpha";
export type DexView = "grid" | "list";

type ListItem =
	| { key: string; kind: "header"; title: string; region: string }
	| { key: string; kind: "row"; entries: DexEntry[] }
	| { key: string; kind: "entry"; entry: DexEntry };

// Rows of tiles (grid view) or one item per Pokémon (list view). Headers
// can't be interleaved into a numColumns FlatList, so grid rows are
// pre-chunked and generations never share a row.
function pushEntries(items: ListItem[], entries: DexEntry[], view: DexView) {
	if (view === "list") {
		for (const e of entries) {
			items.push({ key: `p-${e.id}`, kind: "entry", entry: e });
		}
	} else {
		for (let i = 0; i < entries.length; i += COLUMNS) {
			items.push({
				key: `row-${entries[i].id}`,
				kind: "row",
				entries: entries.slice(i, i + COLUMNS),
			});
		}
	}
}

const ALPHA_DEX = [...POKEDEX].sort((a, b) => a.name.localeCompare(b.name));

function buildBrowseList(sort: DexSort, view: DexView): ListItem[] {
	const items: ListItem[] = [];
	if (sort === "alpha") {
		pushEntries(items, ALPHA_DEX, view);
		return items;
	}
	const gens = sort === "oldest" ? GENERATIONS : [...GENERATIONS].reverse();
	for (const g of gens) {
		items.push({
			key: `gen-${g.numeral}`,
			kind: "header",
			title: `Generation ${g.numeral}`,
			region: g.region,
		});
		const entries = POKEDEX.slice(g.from - 1, g.to);
		if (sort === "newest") entries.reverse();
		pushEntries(items, entries, view);
	}
	return items;
}

// Filter matching is punctuation-blind so "farfetchd", "mr mime", and
// "nidoran" all hit their entries despite ’ ♀ . in the dex names.
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const DEX_SEARCH_KEYS = POKEDEX.map((e) => normalize(e.name));

const DexTile = memo(function DexTile({
	entry,
	language,
	onPrefetch,
	t,
}: {
	entry: DexEntry;
	language: "EN" | "JA";
	/** Fired on touch-down — warms the card list ~150ms before navigation. */
	onPrefetch: (name: string) => void;
	t: RiverTheme;
}) {
	return (
		<CardPressable
			// Touch-down (not press-in, which CardPressable owns for its scale
			// animation) — warms the card list ~150ms before navigation fires.
			onTouchStart={() => onPrefetch(entry.name)}
			onPress={() => {
				Keyboard.dismiss();
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push({
					pathname: "/pokemon-cards",
					params: {
						name: entry.name,
						dexId: String(entry.id),
						language,
					},
				});
			}}
		>
			<View
				style={[
					styles.tile,
					{
						backgroundColor: t.glass.surfaceFill,
						borderColor: t.glass.surfaceBorder,
					},
					t.glass.shadow,
				]}
			>
				{/* No transition: the tile's waterfall entrance is the only fade —
				    a second sprite fade on top read as lag. */}
				<Image
					source={{ uri: spriteUrl(entry.id) }}
					style={styles.sprite}
					contentFit="contain"
					cachePolicy="memory-disk"
					recyclingKey={String(entry.id)}
				/>
				<Text
					style={[styles.name, { color: t.text.primary }]}
					numberOfLines={1}
				>
					{entry.name}
				</Text>
				<Text style={[styles.number, { color: t.text.tertiary }]}>
					#{String(entry.id).padStart(4, "0")}
				</Text>
			</View>
		</CardPressable>
	);
});

// Compact list view: one glass row per Pokémon — sprite, name, dex number —
// the same tap target (and touch-down prefetch) as the tile.
const DexListRow = memo(function DexListRow({
	entry,
	language,
	onPrefetch,
	t,
}: {
	entry: DexEntry;
	language: "EN" | "JA";
	onPrefetch: (name: string) => void;
	t: RiverTheme;
}) {
	return (
		<CardPressable
			onTouchStart={() => onPrefetch(entry.name)}
			onPress={() => {
				Keyboard.dismiss();
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push({
					pathname: "/pokemon-cards",
					params: {
						name: entry.name,
						dexId: String(entry.id),
						language,
					},
				});
			}}
		>
			<View
				style={[
					styles.listRow,
					{
						backgroundColor: t.glass.surfaceFill,
						borderColor: t.glass.surfaceBorder,
					},
					t.glass.shadow,
				]}
			>
				<Image
					source={{ uri: spriteUrl(entry.id) }}
					style={styles.listSprite}
					contentFit="contain"
					cachePolicy="memory-disk"
					recyclingKey={String(entry.id)}
				/>
				<Text
					style={[styles.listName, { color: t.text.primary }]}
					numberOfLines={1}
				>
					{entry.name}
				</Text>
				<Text style={[styles.listNumber, { color: t.text.tertiary }]}>
					#{String(entry.id).padStart(4, "0")}
				</Text>
				<SymbolView
					name="chevron.right"
					size={12}
					tintColor={t.text.tertiary}
					weight="semibold"
				/>
			</View>
		</CardPressable>
	);
});

// memo: the search screen re-renders on every keystroke / chip flip / scroll
// fade — this skips the whole browser pass when its props didn't change.
const PokedexBrowser = memo(function PokedexBrowser({
	topPadding,
	filteringTopPadding,
	language,
	filter,
	sort,
	view,
	onScroll,
}: {
	topPadding: number;
	/**
	 * Tighter offset used while a filter is active — the header collapses
	 * then, so matches align with where card-search results sit.
	 */
	filteringTopPadding: number;
	/** The menu's EN/JA toggle — carried into each entry's card list. */
	language: "EN" | "JA";
	/** Search-bar text — filters the dex by name/number, flat grid (no gens). */
	filter: string;
	sort: DexSort;
	view: DexView;
	/** Animated scroll handler — the chip bar's fade runs on the UI thread. */
	onScroll?: ScrollHandlerProcessed<Record<string, unknown>>;
}) {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const listRef = useRef<FlatList<ListItem>>(null);
	const api = useApi();
	const queryClient = useQueryClient();

	// Press-in prefetch: touch-down precedes navigation by ~150ms, so the
	// card list is already warming by the time the screen pushes. Targeted
	// (one Pokémon per actual press) — and cheap now: a single catalog request
	// served from server RAM.
	const prefetchPokemon = useCallback(
		(pokemonName: string) => {
			const langCode = language === "JA" ? "ja" : "en";
			void queryClient.prefetchQuery({
				queryKey: pokemonCardsQueryKey(pokemonName, langCode),
				queryFn: () =>
					fetchPokemonCards(api, { name: pokemonName, langCode }),
				staleTime: 24 * 60 * 60 * 1000,
			});
		},
		[api, queryClient, language],
	);

	// Filtering is a pure in-memory pass over the bundled names — no debounce
	// needed, every keystroke re-renders instantly. Matches: punctuation-blind
	// name substrings, or a dex-number prefix when the query is digits.
	const trimmed = filter.trim();
	const normalized = normalize(trimmed);
	const isNumeric = /^\d+$/.test(trimmed);
	const listData = useMemo(() => {
		if (!normalized) return buildBrowseList(sort, view);
		// Filter matches follow the active sort too (they're collected in dex
		// order), just without headers — a filtered list is already flat.
		let matches = POKEDEX.filter(
			(e, i) =>
				DEX_SEARCH_KEYS[i].includes(normalized) ||
				(isNumeric && String(e.id).startsWith(trimmed)),
		);
		if (sort === "newest") matches = [...matches].reverse();
		else if (sort === "alpha")
			matches = [...matches].sort((a, b) => a.name.localeCompare(b.name));
		const rows: ListItem[] = [];
		pushEntries(rows, matches, view);
		return rows;
	}, [normalized, isNumeric, trimmed, sort, view]);

	// A new filter can leave the list scrolled past the (now shorter) content.
	useEffect(() => {
		listRef.current?.scrollToOffset({ offset: 0, animated: false });
	}, [normalized]);

	// Same once-per-item waterfall as the sets grid: FlatList recycles cells
	// while scrolling and `entering` re-fires on every mount, so without this
	// guard the fade-in replays on every scroll-back and janks the grid. The
	// guard is a FRESH set per sort/view context (memoized during render, so
	// it's already empty when the remounted list draws its first cells) —
	// every switch replays the waterfall; a persistent set would go quiet on
	// return visits. While filtering, entrances are OFF — rows re-shuffle
	// every keystroke and animating each shuffle reads as flicker.
	const listKey = `${sort}-${view}`;
	// eslint-disable-next-line react-hooks/exhaustive-deps -- listKey IS the cache key
	const animatedKeys = useMemo(() => new Set<string>(), [listKey]);
	const filtering = normalized.length > 0;

	const renderItem = useCallback(
		({ item, index }: { item: ListItem; index: number }) => {
			const firstAppearance = !filtering && !animatedKeys.has(item.key);
			if (firstAppearance) animatedKeys.add(item.key);
			const entering = firstAppearance ? cardWaterfall(index) : undefined;
			if (item.kind === "header") {
				return (
					<Animated.View entering={entering} style={styles.header}>
						<Text style={[styles.headerTitle, { color: t.text.primary }]}>
							{item.title}
						</Text>
						<Text style={[styles.headerRegion, { color: t.text.tertiary }]}>
							{item.region}
						</Text>
					</Animated.View>
				);
			}
			if (item.kind === "entry") {
				return (
					<Animated.View entering={entering} style={styles.listItem}>
						<DexListRow
							entry={item.entry}
							language={language}
							onPrefetch={prefetchPokemon}
							t={t}
						/>
					</Animated.View>
				);
			}
			return (
				<Animated.View entering={entering} style={styles.tileRow}>
					{item.entries.map((entry) => (
						<DexTile
							key={entry.id}
							entry={entry}
							language={language}
							onPrefetch={prefetchPokemon}
							t={t}
						/>
					))}
				</Animated.View>
			);
		},
		[t, language, filtering, prefetchPokemon, animatedKeys],
	);

	// NO getItemLayout here, deliberately: its offsets don't include the
	// contentContainer paddingTop, so the list's virtual geometry disagrees
	// with reality by ~a full row — mis-windowed cells while scrolling and a
	// snap-back at the very bottom. Rows are uniform fixed-height, so
	// self-measurement is exact and cheap (same as the sets grid).
	return (
		<Animated.FlatList
			// Context swaps (sort, grid ⇄ list) remount the list — recycled
			// cells never mix row shapes, and `entering` (a mount animation)
			// gets a fresh mount to fire on.
			key={listKey}
			ref={listRef}
			data={listData}
			keyExtractor={(item) => item.key}
			renderItem={renderItem}
			onScroll={onScroll}
			scrollEventThrottle={16}
			ListEmptyComponent={
				<View style={styles.emptyState}>
					<SymbolView
						name="magnifyingglass"
						size={44}
						tintColor={t.text.tertiary}
						weight="regular"
					/>
					<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
						No Pokémon found
					</Text>
				</View>
			}
			contentContainerStyle={[
				styles.grid,
				// Bottom padding clears the floating search bar (~56pt of bar +
				// its gap above the home indicator), so the last dex row rests
				// fully visible above it.
				{
					// A to Z has no generation headers, so add the 16pt the first
					// header's own top margin normally provides below the chip bar.
					paddingTop: filtering
						? filteringTopPadding
						: topPadding + (sort === "alpha" ? 16 : 0),
					paddingBottom: insets.bottom + 90,
				},
				// Lets the empty state center itself vertically.
				listData.length === 0 && { flexGrow: 1 },
			]}
			showsVerticalScrollIndicator={false}
			keyboardDismissMode="on-drag"
			keyboardShouldPersistTaps="handled"
			removeClippedSubviews
			// Items are whole rows (or headers) now — one viewport is ~7 of
			// them. Small, spaced batches keep off-screen mounting from
			// stealing the waterfall's frames.
			initialNumToRender={8}
			maxToRenderPerBatch={5}
			updateCellsBatchingPeriod={100}
			windowSize={5}
		/>
	);
});

export default PokedexBrowser;

const styles = StyleSheet.create({
	grid: {
		paddingHorizontal: PADDING,
	},
	tileRow: {
		flexDirection: "row",
		gap: GAP,
		marginBottom: GAP,
	},
	// Compact list view — one row per Pokémon.
	listItem: {
		marginBottom: GAP,
	},
	listRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: 1,
		paddingVertical: 6,
		paddingHorizontal: 14,
	},
	listSprite: {
		width: 36,
		height: 36,
	},
	listName: {
		flex: 1,
		fontSize: 15,
		fontWeight: "600",
	},
	listNumber: {
		fontSize: 13,
		fontWeight: "500",
		fontVariant: ["tabular-nums"],
	},
	header: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 8,
		marginTop: 16,
		marginBottom: 10,
		paddingHorizontal: 2,
	},
	headerTitle: {
		fontSize: 17,
		fontWeight: "700",
	},
	headerRegion: {
		fontSize: 13,
		fontWeight: "500",
	},
	// Same glass language as the sets tiles: full 1pt border + glass shadow.
	tile: {
		width: tileWidth,
		height: TILE_HEIGHT,
		borderRadius: 16,
		borderWidth: 1,
		alignItems: "center",
		paddingTop: 2,
	},
	sprite: {
		width: SPRITE_SIZE,
		height: SPRITE_SIZE,
	},
	name: {
		fontSize: 12,
		fontWeight: "600",
		maxWidth: tileWidth - 10,
	},
	number: {
		fontSize: 10,
		fontWeight: "500",
		fontVariant: ["tabular-nums"],
		marginTop: 1,
	},
	// Icon + centered title — the shared search-path empty-state language.
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: "700",
		marginTop: 8,
	},
});
