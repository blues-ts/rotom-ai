import * as CardVision from "../../modules/card-vision";

// Warm the on-device scanner index at app launch instead of lazily when the
// camera first opens. Loading the ~66 MB FeaturePrint index into memory takes a
// beat, so doing it in the background up front means the camera is ready the
// moment the user taps it — no "Getting the scanner ready" wait.
//
// Idempotent module singleton: safe to call from multiple places; the work runs
// at most once per cold start. The loaded index lives in the native module, so
// the camera screen just checks `CardVision.isLoaded()` to skip its own load.

const SCAN_INDEX_BASE = process.env.EXPO_PUBLIC_API_URL
	? `${process.env.EXPO_PUBLIC_API_URL}/api/scan-index`
	: null;

let warmup: Promise<void> | null = null;

/**
 * Kick off (or join) the background scanner warm-up. Resolves once the best
 * local index is loaded; the server refresh continues after and is best-effort.
 * Never throws — scanning is optional and must not break startup.
 */
export function warmScanner(): Promise<void> {
	if (warmup) return warmup;
	if (!CardVision.isAvailable()) return Promise.resolve();

	warmup = (async () => {
		// Step 1 (blocks readiness): load whatever index is already on device.
		// Skip when the native module already has it loaded — native state
		// survives JS Fast Refresh even though this singleton is reset, so without
		// this guard every reload re-decodes the ~66 MB index into a ~132 MB
		// in-memory matrix, and a couple of those peaks OOM-kills the app.
		if (!CardVision.isLoaded()) {
			try {
				await CardVision.loadBestLocal();
			} catch {
				// Nothing local yet (download-only build) — the refresh handles it.
			}
		}
		// Step 2 (best-effort, non-blocking for the caller's await): refresh from
		// the server only when it has a newer {rev,count}.
		if (SCAN_INDEX_BASE) {
			CardVision.refreshFromServer(
				`${SCAN_INDEX_BASE}/version`,
				`${SCAN_INDEX_BASE}/manifest.json`,
				`${SCAN_INDEX_BASE}/index.f16`,
			).catch(() => {});
		}
	})();

	return warmup;
}

/** Whether the native index is loaded and ready to match against. */
export function isScannerReady(): boolean {
	return CardVision.isAvailable() && CardVision.isLoaded();
}
