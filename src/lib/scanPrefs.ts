import { useSyncExternalStore } from "react";
import { createMMKV } from "react-native-mmkv";

import type { ScanLang } from "./scanMatching";

// Scanner preferences shared across the camera routes (the scan loop reads
// synchronously, the tips sheet toggles) and persisted across launches.
// Defensive like config/storage.ts: a stale binary without the MMKV module
// just loses persistence, never crashes the scanner.
const prefs = (() => {
	try {
		return createMMKV({ id: "scan-prefs" });
	} catch {
		return null;
	}
})();

const SCAN_LANG_KEY = "scanLang";

let scanLang: ScanLang = prefs?.getString(SCAN_LANG_KEY) === "ja" ? "ja" : "en";
const listeners = new Set<() => void>();

/** Current value, readable synchronously from the async scan loop. */
export function getScanLang(): ScanLang {
	return scanLang;
}

export function setScanLang(lang: ScanLang) {
	if (lang === scanLang) return;
	scanLang = lang;
	prefs?.set(SCAN_LANG_KEY, lang);
	for (const l of listeners) l();
}

export function useScanLang(): ScanLang {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => scanLang,
	);
}
