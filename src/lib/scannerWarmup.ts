import * as CardVision from "../../modules/card-vision";

// Warm the on-device scanner index at app launch instead of lazily when the
// camera first opens. Loading the ~23 MB embedding index into memory takes a
// beat, so doing it in the background up front means the camera is ready the
// moment the user taps it — no "Getting the scanner ready" wait.
//
// Idempotent module singleton: safe to call from multiple places; the work runs
// at most once per cold start. The loaded index lives in the native module, so
// the camera screen just checks `CardVision.isLoaded()` to skip its own load.

let warmup: Promise<void> | null = null;

/**
 * Kick off (or join) the background scanner warm-up. Resolves once the bundled
 * index is loaded (catalog updates ship as app updates — there is no server
 * download path). Never throws — scanning is optional and must not break
 * startup.
 */
export function warmScanner(): Promise<void> {
	if (warmup) return warmup;
	if (!CardVision.isAvailable()) return Promise.resolve();

	warmup = (async () => {
		// Skip when the native module already has the index loaded — native state
		// survives JS Fast Refresh even though this singleton is reset, so without
		// this guard every reload re-decodes the ~66 MB index into a ~132 MB
		// in-memory matrix, and a couple of those peaks OOM-kills the app.
		if (!CardVision.isLoaded()) {
			try {
				const local = await CardVision.loadBestLocal();
				console.log(
					`[scan] warmup index: rev=${local.rev} count=${local.count} source=${local.source}`,
				);
			} catch {}
		}
		// A failed/empty load must not be cached for the rest of the session —
		// clear the singleton so the next caller (e.g. the camera screen's
		// readiness retry loop) attempts the load again.
		if (!CardVision.isLoaded()) warmup = null;
	})();

	return warmup;
}

/** Whether the native index is loaded and ready to match against. */
export function isScannerReady(): boolean {
	return CardVision.isAvailable() && CardVision.isLoaded();
}
