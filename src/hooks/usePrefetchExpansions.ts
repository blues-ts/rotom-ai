import { useEffect } from "react";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/axios";
import { getCatalogSets } from "@/lib/api/catalog";

/** Shared query key so screens can read the prefetched sets list. */
export const CATALOG_SETS_KEY = ["catalog-sets"] as const;

// Session guard: fire at most once per cold start, even if the app shell
// re-renders (theme changes, etc.).
let started = false;

/**
 * Fired once at app launch (mounted in the root layout, so it runs while the
 * splash is up). In the background it warms the static expansions list into the
 * React Query cache and pre-caches every set logo to disk — so by the time the
 * user reaches the sets screen, the list and its logos are already there.
 *
 * Best-effort and non-blocking: it never delays the splash, and if expansions
 * are already cached/fresh the fetch is a no-op (staleTime) and prefetching
 * already-cached logos is a cheap no-op too.
 */
export function usePrefetchExpansions() {
  const queryClient = useQueryClient();
  const api = useApi();

  useEffect(() => {
    if (started) return;
    started = true;

    void (async () => {
      try {
        const sets = await queryClient.fetchQuery({
          queryKey: CATALOG_SETS_KEY,
          queryFn: () => getCatalogSets(api),
          staleTime: 1000 * 60 * 60 * 24, // static data — refetch at most daily
        });
        const logos = sets.map((s) => s.logo).filter((u): u is string => !!u);
        if (logos.length) void Image.prefetch(logos, { cachePolicy: "memory-disk" });
      } catch {
        // Best-effort warm-up — never surface startup errors.
        started = false; // allow a later retry (e.g. next foreground) if it failed
      }
    })();
  }, [queryClient, api]);
}
