import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/axios";
import { getPricedBatch } from "@/lib/api/pricing";
import {
	CONDITION_LABELS,
	formatVariantLabel,
	getConditionOptions,
	getVariantNames,
	selectPrice,
} from "@/lib/scrydex";
import type { ScanCardConfig } from "@/context/ScanSessionContext";
import type { ScrydexCard } from "@/types/scrydex";

/**
 * Priced cards for the scan review flow. The library (review) screen and the
 * per-card configure sheet query with the SAME id list, so the sheet always
 * hits the library's cache — one batch request per review session. Kept out
 * of the disk persist (memory-only) via HEAVY_QUERY_KEYS.
 */
export function useScanReviewBatch(cardIds: string[]) {
	const api = useApi();
	// Order-insensitive key: the sheet receives ids through a URL param and
	// must land on the review screen's cache entry regardless of ordering.
	const key = useMemo(() => [...cardIds].sort().join(","), [cardIds]);

	return useQuery({
		queryKey: ["scanReviewBatch", key],
		queryFn: async (): Promise<ScrydexCard[]> => {
			const { cards } = await getPricedBatch(api, {
				cardIds,
				sealedIds: [],
				// The NM/graded prices on the card response are enough for the
				// review flow — skip the raw-USD price_history backfill.
				skipRawBackfill: true,
			});
			return cards;
		},
		enabled: cardIds.length > 0,
		staleTime: 5 * 60 * 1000,
		// The id set changes in place (a scan removed, a new capture added) —
		// keep showing the last batch instead of flashing the loading state.
		placeholderData: keepPreviousData,
	});
}

/** The same defaults the blind batch add used: first variant, best condition. */
export function defaultScanConfig(card: ScrydexCard): ScanCardConfig {
	const variant = getVariantNames(card)[0] ?? "normal";
	const condition = getConditionOptions(card, variant)[0] ?? "NM";
	return { pricingType: "Raw", variant, condition, quantity: 1 };
}

/** Live unit price for a config — undefined when that tier isn't priced. */
export function scanConfigPrice(
	card: ScrydexCard,
	config: ScanCardConfig,
): number | undefined {
	if (
		config.pricingType === "Graded" &&
		config.gradedCompany &&
		config.gradedGrade
	) {
		return selectPrice(card, config.variant, {
			kind: "graded",
			company: config.gradedCompany,
			grade: config.gradedGrade,
		})?.value;
	}
	return selectPrice(card, config.variant, {
		kind: "raw",
		condition: config.condition,
	})?.value;
}

/** "Reverse Holofoil · Near Mint" / "Holofoil · PSA 9" row summary. */
export function scanConfigSummary(config: ScanCardConfig): string {
	const variant = formatVariantLabel(config.variant);
	const tier =
		config.pricingType === "Graded" && config.gradedCompany && config.gradedGrade
			? `${config.gradedCompany} ${config.gradedGrade}`
			: (CONDITION_LABELS[config.condition] ?? config.condition);
	return `${variant} · ${tier}`;
}
