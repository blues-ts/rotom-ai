import { useEffect, useMemo, useRef, useState } from "react";

import { useApi } from "@/lib/axios";
import { getPricedBatch } from "@/lib/api/pricing";
import {
	getConditionOptions,
	getVariantNames,
	selectPrice,
} from "@/lib/scrydex";
import { formatCurrency } from "@/lib/format";

// MODULE-LEVEL cache, shared by every consumer (the scan tray and the binder
// review overlay): a card priced by one surface never refetches on another —
// the binder confirm used to trigger a second identical batch from the tray.
// In-memory only; the session-scale id count keeps it tiny.
const priceCache = new Map<string, number | null>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => {
	for (const l of listeners) l();
};

/**
 * Ballpark prices for scanner surfaces (the scan tray, the binder review),
 * resolved lazily per card id — one batch call per wave of new ids, using the
 * same variant/condition/selectPrice path as add-to-collection so what's
 * shown matches what eventually gets stored. Missing key = still loading,
 * null = no usable price. Failed ids drop back out of `inFlight` so the next
 * change retries them; the scan loop never waits on any of this.
 */
export function useScanPrices(
	cards: { id: string }[],
): Record<string, number | null> {
	const api = useApi();
	// Bumped whenever the shared cache gains entries, from any consumer.
	const [version, setVersion] = useState(0);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		const listener = () => {
			if (mountedRef.current) setVersion((v) => v + 1);
		};
		listeners.add(listener);
		return () => {
			mountedRef.current = false;
			listeners.delete(listener);
		};
	}, []);

	useEffect(() => {
		const unknown = [
			...new Set(
				cards
					.map((c) => c.id)
					.filter((id) => !priceCache.has(id) && !inFlight.has(id)),
			),
		];
		if (unknown.length === 0) return;
		for (const id of unknown) inFlight.add(id);
		getPricedBatch(api, {
			cardIds: unknown,
			sealedIds: [],
			// These prices are informational — the NM price on the card response
			// is enough; skip the raw-USD price_history backfill.
			skipRawBackfill: true,
		})
			.then(({ cards: priced }) => {
				const byId = new Map(priced.map((c) => [c.id, c]));
				for (const id of unknown) {
					const card = byId.get(id);
					if (!card) {
						priceCache.set(id, null);
						continue;
					}
					const variant = getVariantNames(card)[0] ?? "normal";
					const condition = getConditionOptions(card, variant)[0] ?? "NM";
					priceCache.set(
						id,
						selectPrice(card, variant, { kind: "raw", condition })?.value ??
							null,
					);
				}
				notify();
			})
			.catch(() => {
				// Left out of the cache on purpose — retried on the next change.
			})
			.finally(() => {
				for (const id of unknown) inFlight.delete(id);
			});
	}, [api, cards, version]);

	return useMemo(() => {
		const prices: Record<string, number | null> = {};
		for (const c of cards) {
			const cached = priceCache.get(c.id);
			if (cached !== undefined) prices[c.id] = cached;
		}
		return prices;
		// version invalidates when the shared cache gains entries.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cards, version]);
}

/** Render helper: `…` while loading, `—` when the card has no usable price. */
export function scanPriceLabel(price: number | null | undefined): string {
	return price === undefined
		? "…"
		: price === null
			? "—"
			: formatCurrency(price);
}
