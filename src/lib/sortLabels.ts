import type { LegacyMenuAction } from "@/components/LegacyToolbarMenu";

/**
 * Canonical sort/view option labels — ONE vocabulary for every sort sheet
 * (set-detail, collection-detail, pokemon-cards, the sets/Pokédex browsers).
 * Grammar: sentence case, attribute first. Sorts that run both ways carry no
 * direction in the label — they're one row with an arrow, see directionRow.
 * Never inline a sort label in a screen — add it here so the sheets can't
 * drift apart again.
 */
export const SORT_OPTION_LABELS = {
	newest: "Newest",
	// Two-way sorts — one row, direction shown by the arrow.
	name: "Name",
	number: "Card Number",
	value: "Value",
	// The browsers' recency sort, named for what it actually orders by: sets
	// run on release date, the Pokédex on national dex number.
	released: "Release Date",
	dexNumber: "Dex Number",
	dateAdded: "Date added",
	dateSold: "Date sold",
	gridView: "Grid",
	listView: "Compact list",
} as const;

/**
 * Trailing glyph on a two-way sort row: the arrow shows the direction
 * currently applied, and points the other way once tapped. A screen not
 * sorted by that attribute at all still shows the ascending arrow, since
 * that's what a tap would give it.
 */
export const SORT_DIRECTION_ICON = {
	asc: "arrow.up",
	desc: "arrow.down",
} as const;

/**
 * One sheet row standing in for an ascending/descending pair: checked while
 * either direction is active, and tapping flips between them. Selecting it
 * from a different sort lands on ascending.
 */
export function directionRow<T extends string>({
	label,
	asc,
	desc,
	current,
	onSelect,
}: {
	label: string;
	asc: T;
	desc: T;
	current: T;
	onSelect: (option: T) => void;
}): LegacyMenuAction {
	return {
		label,
		// Stays up so the direction can be flipped without reopening.
		keepOpen: true,
		isOn: current === asc || current === desc,
		icon:
			current === desc ? SORT_DIRECTION_ICON.desc : SORT_DIRECTION_ICON.asc,
		onPress: () => onSelect(current === asc ? desc : asc),
	};
}
