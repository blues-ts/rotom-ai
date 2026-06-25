// Capture feedback for the scanner: a success haptic plus a short "captured"
// blip. The player is created once (lazily, on first capture) and reused so the
// sound fires with near-zero latency on every subsequent scan.
//
// NOTE: expo-audio is a native module — after pulling these changes you must
// rebuild the dev client (`bun expo run:ios` / `run:android` or an EAS build).
// A JS-only reload won't pick it up.
import {
	createAudioPlayer,
	setAudioModeAsync,
	type AudioPlayer,
} from "expo-audio";
import * as Haptics from "expo-haptics";

const CAPTURE_SOUND = require("../../assets/sounds/capture.wav");

let player: AudioPlayer | null = null;

function ensurePlayer(): AudioPlayer | null {
	if (player) return player;
	try {
		// Play the capture blip even when the ringer is on silent (shutter-style),
		// and don't stop the user's music — just duck under it briefly.
		void setAudioModeAsync({
			playsInSilentMode: true,
			interruptionMode: "mixWithOthers",
		});
		player = createAudioPlayer(CAPTURE_SOUND);
	} catch {
		player = null; // e.g. running in a build without the native module yet
	}
	return player;
}

/** Fire the "card captured" cue: a success haptic plus the capture blip. */
export function playCaptureFeedback() {
	void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
	const p = ensurePlayer();
	if (!p) return;
	// seekTo is async: after a sound finishes the playhead sits at the end, so we
	// must wait for the rewind to land before play() — otherwise every other
	// capture plays from the end (silence) while the seek is still in flight.
	void (async () => {
		try {
			await p.seekTo(0);
			p.play();
		} catch {}
	})();
}
