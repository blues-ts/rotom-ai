import * as CardVision from "../../modules/card-vision";
import {
	MODEL_LOCK_MARGIN,
	MODEL_LOCK_SCORE,
	OCR_FLOOR,
	OCR_MARGIN,
	resolveOcrTieBreak,
} from "@/lib/scanMatching";

// Multi-card frame scan (binder pages, table spreads): one photo, every
// card-shaped rectangle in the frame detected and identified — no grid to
// align against. Unlike the live single-card loop there is no frame voting —
// a single still is all we get — so thresholds are looser and the review
// overlay is the safety net. All consts are device-tunable without a native
// rebuild.

// Detector headroom over the nominal 9-pocket page: nested sleeve quads are
// deduped natively, and spurious extras score low and get discarded here.
export const BINDER_MAX_CARDS = 12;

// Accept outright — mirrors the live loop's INSTANT_LOCK intent, relaxed a
// touch because sleeved/pocketed cards score lower and the user reviews anyway.
export const BINDER_INSTANT = 0.88;
// Confident enough to check by default in review. A single still can't use the
// live scanner's multi-frame glare averaging, so sleeved/holo cards land lower
// than they would live — but the human review is the safety net, so this sits
// below the live ONDEVICE_THRESHOLD.
export const BINDER_ACCEPT = 0.68;
// Show as a LOW-confidence guess (unchecked by default). Above the live loop's
// OCR floor: at this score there's a real card and a plausible top guess worth
// surfacing rather than a blank "?". Below this the quad was junk (pocket seam,
// glare-only, a card half out of frame) — dropped, no tile.
export const BINDER_SHOW = 0.5;

export type Region = { x: number; y: number; w: number; h: number };

export type CardDetection = {
	rect: Region; // normalized to the analyzed frame (the guide box crop)
	id: string;
	score: number;
	viaOcr: boolean;
	// True → checked by default (accent tile). False → a low-confidence guess
	// shown unchecked (amber tile) for the user to confirm at a glance.
	confident: boolean;
};

export type FrameAnalysis = {
	/** Upright JPEG of the exact frame analyzed — display this, not the raw
	 *  capture (whose orientation metadata is unreliable). */
	photoUri: string;
	cards: CardDetection[];
};

/**
 * Detect + identify every card inside the guide-box region of a frame photo.
 * One native pass finds the card rectangles wherever they sit in the box;
 * each gets a verdict: match / unsure / discarded. Ambiguous detections
 * (tight margin — the classic near-twin holo cluster) get the same
 * collector-number OCR re-rank the live scanner uses, run in parallel.
 */
export async function analyzeCardsInFrame(
	fileUri: string,
	pageRegion: Region,
	previewAspect: number,
): Promise<FrameAnalysis> {
	const { photoUri, cards: detections } = await CardVision.identifyCardsInFrame(
		fileUri,
		pageRegion,
		previewAspect,
		BINDER_MAX_CARDS,
		12, // deep candidates: the OCR re-rank needs near-twins present
	);

	// Detection rects are normalized to the guide-box crop; the OCR re-read
	// needs the same card expressed in PREVIEW fractions.
	const toPreviewRect = (r: Region): Region => ({
		x: pageRegion.x + r.x * pageRegion.w,
		y: pageRegion.y + r.y * pageRegion.h,
		w: r.w * pageRegion.w,
		h: r.h * pageRegion.h,
	});

	const verdicts = await Promise.all(
		detections.map(async ({ rect, matches }): Promise<CardDetection | null> => {
			const top = matches[0];
			if (!top || top.score < BINDER_SHOW) return null;

			const margin = matches[1] ? top.score - matches[1].score : top.score;
			// A fat margin is decisive on its own (see scanMatching.ts) — real
			// scores never reach BINDER_INSTANT.
			const modelInstant =
				top.score >= MODEL_LOCK_SCORE && margin >= MODEL_LOCK_MARGIN;
			if (modelInstant || (top.score >= BINDER_INSTANT && margin >= OCR_MARGIN)) {
				return { rect, id: top.id, score: top.score, viaOcr: false, confident: true };
			}

			// Tight near-twin cluster: read the card's printed number and let it
			// break the tie (reinforcing the artwork, never overriding it).
			if (top.score >= OCR_FLOOR && margin < OCR_MARGIN) {
				try {
					const text = await CardVision.readCardText(
						fileUri,
						toPreviewRect(rect),
						previewAspect,
					);
					const resolved = resolveOcrTieBreak(matches, text);
					if (resolved) {
						return {
							rect,
							id: resolved.id,
							score: resolved.score,
							viaOcr: true,
							confident: true,
						};
					}
				} catch {}
			}

			// Always surface the best visual guess (glared holos in sleeves land
			// here): confident + checked when it clears ACCEPT, otherwise a
			// low-confidence guess the user confirms with a tap.
			return {
				rect,
				id: top.id,
				score: top.score,
				viaOcr: false,
				confident: top.score >= BINDER_ACCEPT,
			};
		}),
	);
	const kept = verdicts.filter((v): v is CardDetection => v !== null);

	if (__DEV__) {
		console.log(
			"[binder]",
			kept.length
				? kept
						.map(
							(v) =>
								`${v.id} ${v.score.toFixed(2)}${v.viaOcr ? "*" : ""}${
									v.confident ? "" : "?"
								}`,
						)
						.join("  ")
				: "(no cards detected)",
		);
	}
	return { photoUri, cards: kept };
}
