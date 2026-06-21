import { requireOptionalNativeModule } from "expo-modules-core";

// Spike: on-device card recognition via Apple Vision FeaturePrint (iOS only).
// Optional so a stale JS bundle on an old binary doesn't crash at import — the
// module is only present after a native rebuild (`expo run:ios`).
const CardVision = requireOptionalNativeModule("CardVision");

function mod() {
  if (!CardVision) {
    throw new Error(
      "Native module 'CardVision' not found — run a native rebuild (bunx expo run:ios --device).",
    );
  }
  return CardVision;
}

/** Whether the native module is present in this binary. */
export function isAvailable(): boolean {
  return !!CardVision;
}

export interface CardMatch {
  id: string;
  score: number; // cosine similarity, 0..1 (higher = closer)
}

/** Vision FeaturePrint revision on this device. Must equal the index's `rev`. */
export function visionRevision(): number {
  return mod().visionRevision();
}

/** Whether a reference index has been loaded. */
export function isLoaded(): boolean {
  return mod().isLoaded();
}

/** Number of cards in the loaded index. */
export function loadedCount(): number {
  return mod().loadedCount();
}

/**
 * Load a binary index already on disk: a `.manifest.json` (rev, dim, count, ids)
 * and a Float16 `.f16` matrix. Returns the card count.
 */
export function loadIndexFromFile(
  manifestUri: string,
  f16Uri: string,
): Promise<number> {
  return mod().loadIndexFromFile(manifestUri, f16Uri);
}

/**
 * Hybrid step 1 (instant, offline): load the best index already on device —
 * the bundled baseline or a previously-downloaded cache, whichever has more
 * cards. `source` is "bundled" | "cached" | "none" (count 0 when nothing local).
 */
export function loadBestLocal(): Promise<{
  count: number;
  rev: number;
  source: "bundled" | "cached" | "none";
}> {
  return mod().loadBestLocal();
}

/**
 * Hybrid step 2 (background): refresh from the server. Downloads + caches + loads
 * only when the server's {rev,count} differs from what's loaded. Call after
 * loadBestLocal so the app is usable immediately while this runs.
 */
export function refreshFromServer(
  versionURL: string,
  manifestURL: string,
  f16URL: string,
): Promise<{ count: number; rev: number; updated: boolean }> {
  return mod().refreshFromServer(versionURL, manifestURL, f16URL);
}

/**
 * Load the reference index. Pass the flattened vector buffer (ids.length * dim)
 * — flat arrays cross the bridge far cheaper than nested ones.
 */
export function loadIndex(
  ids: string[],
  flatVectors: number[],
  dim: number,
): Promise<void> {
  return mod().loadIndex(ids, flatVectors, dim);
}

/**
 * Identify a captured photo against the loaded index.
 * @param uri file URI from camera (`takePictureAsync().uri`)
 * @param topN number of candidates to return
 * @param crop detect + perspective-correct the card first (recommended live)
 */
export function identify(
  uri: string,
  topN = 5,
  crop = true,
): Promise<CardMatch[]> {
  return mod().identify(uri, topN, crop);
}

/**
 * Identify within an on-screen region of the camera preview (the scan guide box).
 * `region` is in preview fractions (0..1, origin top-left); `previewAspect` is the
 * preview's width/height. Crops to the box, refines, then matches.
 */
export function identifyInRegion(
  uri: string,
  region: { x: number; y: number; w: number; h: number },
  previewAspect: number,
  topN = 5,
): Promise<CardMatch[]> {
  return mod().identifyInRegion(
    uri,
    region.x,
    region.y,
    region.w,
    region.h,
    previewAspect,
    topN,
  );
}
