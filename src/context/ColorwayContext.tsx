import React, { useCallback, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { ColorwayContext } from "@/constants/theme";
import {
	type ColorwayName,
	DEFAULT_COLORWAY,
	isColorwayName,
} from "@/constants/colorways";

const STORAGE_KEY = "app_colorway";

// Synchronous read so the first frame already paints the chosen colorway —
// an async load would flash River-blue before switching.
function readStoredColorway(): ColorwayName {
	try {
		const stored = SecureStore.getItem(STORAGE_KEY);
		if (stored && isColorwayName(stored)) return stored;
	} catch {
		// SecureStore is unavailable on web; fall through to the default.
	}
	return DEFAULT_COLORWAY;
}

export function ColorwayProvider({ children }: { children: React.ReactNode }) {
	const [colorway, setColorwayState] = useState<ColorwayName>(readStoredColorway);

	const setColorway = useCallback((name: ColorwayName) => {
		setColorwayState(name);
		try {
			SecureStore.setItem(STORAGE_KEY, name);
		} catch {
			// Non-fatal: selection still applies for this session.
		}
	}, []);

	const value = useMemo(() => ({ colorway, setColorway }), [colorway, setColorway]);

	return (
		<ColorwayContext.Provider value={value}>
			{children}
		</ColorwayContext.Provider>
	);
}
