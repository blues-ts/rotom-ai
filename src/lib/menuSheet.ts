import type { LegacyMenuAction } from "@/components/LegacyToolbarMenu";

// Handoff for the /menu-sheet route (a native formSheet): function props
// can't ride router params, so the presenter deposits its actions here right
// before pushing. Only one menu is ever open at a time, so a single slot
// suffices.
//
// Rows that keep the sheet open (direction toggles) need their checkmark and
// arrow to track the new sort, so the slot is a subscribable store rather
// than a one-shot drop: the presenter republishes on every render, and the
// sheet reads it live. Republishing is gated on an owner token so a screen
// still mounted underneath can't overwrite the open sheet's actions.
let currentActions: LegacyMenuAction[] = [];
let currentOwner: symbol | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

/** Claim the slot and publish the initial actions. Call before presenting. */
export function openMenuSheetSlot(
	owner: symbol,
	actions: LegacyMenuAction[],
): void {
	currentOwner = owner;
	currentActions = actions;
	emit();
}

/** Refresh the open sheet's actions. No-op unless `owner` holds the slot. */
export function updateMenuSheetActions(
	owner: symbol,
	actions: LegacyMenuAction[],
): void {
	if (currentOwner !== owner) return;
	currentActions = actions;
	emit();
}

/** Release the slot on dismiss so a background screen can't keep writing. */
export function closeMenuSheetSlot(): void {
	currentOwner = null;
}

export function subscribeMenuSheetActions(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getMenuSheetActions(): LegacyMenuAction[] {
	return currentActions;
}
