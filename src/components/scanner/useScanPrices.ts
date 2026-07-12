import { useEffect, useRef, useState } from "react";

import { useApi } from "@/lib/axios";
import { getPricedBatch } from "@/lib/api/pricing";
import {
	getConditionOptions,
	getVariantNames,
	selectPrice,
} from "@/lib/scrydex";
import { formatCurrency } from "@/lib/format";

/**
 * Ballpark prices for scanner surfaces (the scan tray, the binder review),
 * resolved lazily per card id — one batch call per wave of new ids, using the
 * same variant/condition/selectPrice path as add-to-collection so what's
 * shown matches what eventually gets stored. Missing key = still loading,
 * null = no usable price. Failed ids drop back out of `pending` so the next
 * change retries them; the scan loop never waits on any of this.
 */
export function useScanPrices(
	cards: { id: string }[],
): Record<string, number | null> {
	const api = useApi();
	const [prices, setPrices] = useState<Record<string, number | null>>({});
	const pendingRef = useRef<Set<string>>(new Set());
	const mountedRef = useRef(true);

	useEffect(() => {
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const unknown = [
			...new Set(
				cards
					.map((c) => c.id)
					.filter((id) => !(id in prices) && !pendingRef.current.has(id)),
			),
		];
		if (unknown.length === 0) return;
		for (const id of unknown) pendingRef.current.add(id);
		getPricedBatch(api, {
			cardIds: unknown,
			sealedIds: [],
			// These prices are informational — the NM price on the card response
			// is enough; skip the raw-USD price_history backfill.
			skipRawBackfill: true,
		})
			.then(({ cards: priced }) => {
				if (!mountedRef.current) return;
				const byId = new Map(priced.map((c) => [c.id, c]));
				setPrices((prev) => {
					const next = { ...prev };
					for (const id of unknown) {
						const card = byId.get(id);
						if (!card) {
							next[id] = null;
							continue;
						}
						const variant = getVariantNames(card)[0] ?? "normal";
						const condition = getConditionOptions(card, variant)[0] ?? "NM";
						next[id] =
							selectPrice(card, variant, { kind: "raw", condition })?.value ??
							null;
					}
					return next;
				});
			})
			.catch(() => {
				// Left out of `prices` on purpose — retried on the next change.
			})
			.finally(() => {
				for (const id of unknown) pendingRef.current.delete(id);
			});
	}, [api, cards, prices]);

	return prices;
}

/** Render helper: `…` while loading, `—` when the card has no usable price. */
export function scanPriceLabel(price: number | null | undefined): string {
	return price === undefined
		? "…"
		: price === null
			? "—"
			: formatCurrency(price);
}
