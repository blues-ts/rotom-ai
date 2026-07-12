import type { LegacyMenuAction } from "@/components/LegacyToolbarMenu";

// Handoff for the /menu-sheet route (a native formSheet): function props
// can't ride router params, so the presenter deposits its actions here right
// before pushing, and the sheet snapshots them on mount. Only one menu is
// ever open at a time, so a single slot suffices.
let currentActions: LegacyMenuAction[] = [];

export function setMenuSheetActions(actions: LegacyMenuAction[]) {
	currentActions = actions;
}

export function getMenuSheetActions(): LegacyMenuAction[] {
	return currentActions;
}
