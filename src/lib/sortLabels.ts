/**
 * Canonical sort/view option labels — ONE vocabulary for every sort sheet
 * (set-detail, collection-detail, pokemon-cards, the sets/Pokédex browsers).
 * Grammar: sentence case, attribute first, en-dash ranges in parentheses.
 * Never inline a sort label in a screen — add it here so the sheets can't
 * drift apart again.
 */
export const SORT_OPTION_LABELS = {
	newest: "Newest first",
	oldest: "Oldest first",
	name: "Name (A–Z)",
	numberAsc: "Number (low–high)",
	numberDesc: "Number (high–low)",
	valueDesc: "Value (high–low)",
	valueAsc: "Value (low–high)",
	dateAdded: "Date added (newest)",
	dateSold: "Date sold (newest)",
	gridView: "Grid",
	listView: "Compact list",
} as const;
