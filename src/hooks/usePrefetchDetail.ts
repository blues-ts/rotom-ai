import { useCallback } from "react";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/axios";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { getCard, getSealedProduct } from "@/lib/api/pricing";
import { getCatalogCard, catalogCardToScrydex } from "@/lib/api/catalog";
import { getCardImage } from "@/lib/scrydex";

/**
 * Warms the card/sealed detail query on tap so the detail screen opens with
 * data already in cache instead of fetching cold on mount. The keys match what
 * the detail screens read (["card", id] / ["sealed", id]).
 *
 * Pro-aware: non-Pro never hits the pricing API — card prefetch uses the local
 * catalog (matching the detail screen), and sealed prefetch is skipped (sealed
 * is a Pro-only feature).
 */
export function usePrefetchDetail() {
	const queryClient = useQueryClient();
	const api = useApi();
	const { isPro } = useRevenueCat();

	return useCallback(
		(kind: "card" | "sealed", id: string) => {
			if (!id) return;
			// fetchQuery (not prefetchQuery) so we can read the result and warm the
			// detail screen's image too. The grid only ever cached the `small`
			// thumbnail; the detail screen renders the `large` (a different URL), so
			// without this it downloads cold on mount. Best-effort, never throws.
			const warmImage = (item: Parameters<typeof getCardImage>[0]) => {
				const large = getCardImage(item, undefined, "large");
				if (large) void Image.prefetch(large, { cachePolicy: "memory-disk" });
			};
			if (kind === "sealed") {
				if (!isPro) return;
				void queryClient
					.fetchQuery({
						queryKey: ["sealed", id],
						queryFn: () => getSealedProduct(api, id),
					})
					.then(warmImage)
					.catch(() => {});
			} else {
				void queryClient
					.fetchQuery({
						queryKey: ["card", id],
						queryFn: () =>
							isPro
								? getCard(api, id)
								: getCatalogCard(api, id).then(catalogCardToScrydex),
					})
					.then(warmImage)
					.catch(() => {});
			}
		},
		[queryClient, api, isPro],
	);
}
