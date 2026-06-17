import { useCallback } from "react";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/axios";
import { getCatalogSet } from "@/lib/api/catalog";

// Only warm the first screenful of card images per set. The catalog returns
// cards in display order, so these are exactly what set-detail shows first.
// Prefetching the whole set (~200 images) per visible tile floods the network
// and decoder and janks the sets-grid scroll; the rest load on demand.
const PREFETCH_CARD_LIMIT = 12;

/**
 * Warms a set's first card images into the expo-image disk cache (and the set
 * data into React Query) before the set screen mounts, so its grid paints from
 * cache instead of downloading on first render.
 *
 * Fire-and-forget and best-effort: failures are swallowed, and prefetching
 * already-cached images is a cheap no-op. The URLs are the same CDN URLs the set
 * grid renders, so the warmed cache hits directly.
 */
export function usePrefetchSetImages() {
  const queryClient = useQueryClient();
  const api = useApi();

  return useCallback(
    (setId: string) => {
      if (!setId) return;
      void (async () => {
        try {
          const { cards } = await queryClient.fetchQuery({
            queryKey: ["catalog-set", setId],
            queryFn: () => getCatalogSet(api, setId),
            staleTime: 1000 * 60 * 60 * 24, // static data — refetch at most daily
          });
          const urls = cards
            .slice(0, PREFETCH_CARD_LIMIT)
            .map((c) => c.images?.[0]?.small ?? c.images?.[0]?.medium ?? c.images?.[0]?.large)
            .filter((u): u is string => !!u);
          if (urls.length) void Image.prefetch(urls, { cachePolicy: "memory-disk" });
        } catch {
          // Best-effort warm-up — never block or surface navigation errors.
        }
      })();
    },
    [queryClient, api],
  );
}
