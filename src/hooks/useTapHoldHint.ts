import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const HINT_KEY = "tap_hold_hint_seen";

// Module-level guard so the nudge is claimed by exactly one screen per session
// (search vs set-detail, whichever shows a first card first) and never re-shown.
let claimed = false;

/**
 * One-time "Tap and hold me!" coachmark gate. Returns `show` for the first
 * eligible screen on the user's first encounter, and `dismiss` to persist that
 * it's been seen. Reads/writes a SecureStore flag, mirroring the onboarding flag.
 */
export function useTapHoldHint(eligible: boolean) {
	const [show, setShow] = useState(false);

	useEffect(() => {
		if (!eligible || claimed) return;
		let active = true;
		SecureStore.getItemAsync(HINT_KEY).then((value) => {
			if (!active || claimed || value === "true") return;
			claimed = true; // first screen to resolve wins
			setShow(true);
		});
		return () => {
			active = false;
		};
	}, [eligible]);

	const dismiss = useCallback(() => {
		setShow(false);
		void SecureStore.setItemAsync(HINT_KEY, "true");
	}, []);

	return { show, dismiss };
}

/**
 * Debug helper: clears the persisted "seen" flag and the in-session guard so the
 * "Tap and hold me!" popover shows again the next time a first card renders.
 */
export async function resetTapHoldHint() {
	claimed = false;
	await SecureStore.deleteItemAsync(HINT_KEY);
}
