import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";
import { createMMKV } from "react-native-mmkv";

// A React Query persister backed by MMKV (synchronous, JSI/Nitro — same runtime
// VisionCamera already uses). Persisting the cache means a cold start can paint
// the sets list / prices instantly from disk before any network call returns.
//
// Defensive: if the MMKV native module isn't in this binary yet (e.g. JS was
// reloaded before a native rebuild), creation throws — we swallow it and return
// null so the app simply runs without persistence instead of crashing at launch.
export function createQueryPersister(): Persister | null {
	try {
		const storage = createMMKV({ id: "react-query-cache" });
		return createSyncStoragePersister({
			storage: {
				setItem: (key, value) => storage.set(key, value),
				getItem: (key) => storage.getString(key) ?? null,
				removeItem: (key) => storage.remove(key),
			},
		});
	} catch {
		return null;
	}
}

// Bump when the cached shape changes in a breaking way — invalidates old caches.
export const QUERY_CACHE_BUSTER = "v1";
// How long a persisted cache stays usable across launches.
export const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24h

// Query families excluded from persistence (first element of the query key).
// These hold whole-card-list payloads — up to ~1000 full ScrydexCard objects
// (nested variants + prices) per entry — that a browsing session accumulates
// quickly. Persisting them made every cold start deserialize megabytes of
// JSON; in-memory caching keeps the session fast and a refetch is ~2 round
// trips (usually pre-warmed by press-in prefetch anyway).
export const HEAVY_QUERY_KEYS = new Set([
	"pokemonCards",
	"pokemonCardsPriced",
	"setCardsPriced",
	"setSealed",
]);
