import { useSyncExternalStore } from "react";
import { createMMKV } from "react-native-mmkv";

// Vending-flow preference (Settings → Features). Same defensive MMKV shape
// as scanPrefs: a stale binary without the module just loses persistence.
const prefs = (() => {
	try {
		return createMMKV({ id: "vendor-prefs" });
	} catch {
		return null;
	}
})();

const VENDING_ENABLED_KEY = "vendingEnabled";

// Enabled by default — the toggle exists to hide the flow for collectors
// who never sell.
let vendingEnabled: boolean =
	prefs?.getBoolean(VENDING_ENABLED_KEY) ?? true;
const listeners = new Set<() => void>();

export function getVendingEnabled(): boolean {
	return vendingEnabled;
}

export function setVendingEnabled(enabled: boolean) {
	if (enabled === vendingEnabled) return;
	vendingEnabled = enabled;
	prefs?.set(VENDING_ENABLED_KEY, enabled);
	for (const l of listeners) l();
}

export function useVendingEnabled(): boolean {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => vendingEnabled,
	);
}
