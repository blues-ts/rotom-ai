import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const TAP_HOLD_HINT_KEY = "tap_hold_hint_seen";
// Card detail's "Chat about this card" row nudge.
export const CHAT_CARD_HINT_KEY = "chat_card_hint_seen";
// Scanner nudge (camera screen): one-time bubble above the sheet introducing
// the toolbar's EN/JP language filter and binder-page mode.
export const SCANNER_TOOLS_HINT_KEY = "scanner_tools_hint_seen";

// Module-level guard so each nudge is claimed by exactly one screen per
// session (e.g. search vs set-detail, whichever shows a first card first)
// and never re-shown while the app stays alive.
const claimed = new Set<string>();

/**
 * One-time coachmark gate. Returns `show` for the first eligible screen on
 * the user's first encounter with the given hint, and `dismiss` to persist
 * that it's been seen. Reads/writes a SecureStore flag per hint key,
 * mirroring the onboarding flag.
 */
export function useOneTimeHint(key: string, eligible: boolean) {
	const [show, setShow] = useState(false);

	useEffect(() => {
		if (!eligible || claimed.has(key)) return;
		let active = true;
		SecureStore.getItemAsync(key).then((value) => {
			if (!active || claimed.has(key) || value === "true") return;
			claimed.add(key); // first screen to resolve wins
			setShow(true);
		});
		return () => {
			active = false;
		};
	}, [eligible, key]);

	const dismiss = useCallback(() => {
		setShow(false);
		void SecureStore.setItemAsync(key, "true");
	}, [key]);

	return { show, dismiss };
}

/** The original "Tap and hold me!" nudge on card grids. */
export function useTapHoldHint(eligible: boolean) {
	return useOneTimeHint(TAP_HOLD_HINT_KEY, eligible);
}

/**
 * Debug helper: clears the persisted "seen" flags and the in-session guard so
 * every one-time hint shows again on its next eligible screen.
 */
export async function resetTapHoldHint() {
	claimed.clear();
	await SecureStore.deleteItemAsync(TAP_HOLD_HINT_KEY);
	await SecureStore.deleteItemAsync(CHAT_CARD_HINT_KEY);
	await SecureStore.deleteItemAsync(SCANNER_TOOLS_HINT_KEY);
}
