import type { CardMatch, CardText } from "../../modules/card-vision";

// Collector-number re-rank. When the visual match is a tight near-twin cluster
// (holos), OCR the printed number and use it to break the tie — but only as a
// reinforcement of the artwork, never an override (a candidate must clear
// NUM_VISUAL_FLOOR to be eligible, so a misread number can't pull in a card the
// camera never really saw). Shared by the single-card scanner and binder scan.
export const OCR_FLOOR = 0.55; // below this the frame isn't a confident card — skip OCR
export const OCR_MARGIN = 0.06; // only OCR when the top two are this close (ambiguous)
export const OCR_TIE_BAND = 0.06; // a lettered number breaks ties within this band of #1
export const PHOTO_FINISH = 0.008; // a bare number may confirm only a leader/co-leader this close to #1
export const NUM_VISUAL_FLOOR = 0.55; // and never trusts a candidate below this absolute score

// Normalise a collector number for comparison: uppercase, drop a letter prefix's
// leading zeros. "TG02" → "TG2", "010" → "10", "123" → "123".
export function normNum(raw: string): string | null {
	const m = String(raw).toUpperCase().match(/([A-Z]{0,4})0*(\d{1,3})/);
	return m ? m[1] + m[2] : null;
}

// The printed number is the Scrydex id's suffix after the LAST dash (set codes
// themselves contain dashes, e.g. `tcgp-A4a-4`). `swsh10tg-TG02` → "TG2".
export function idNumber(id: string): string | null {
	const i = id.lastIndexOf("-");
	return i < 0 ? null : normNum(id.slice(i + 1));
}

// Collector numbers parsed from OCR lines, split by how trustworthy they are:
//  - high: a LETTERED number ("XY133", "TG02", "SWSH165"). Those numbering schemes
//    are set-bound, so the token alone identifies the card — safe to break a tie.
//  - low: a bare 1–3 digit number ("21", "6"). Shared across thousands of cards
//    (and "021/028"→"21" is no better — the set total is what's specific, and we
//    don't have it), so a bare number may only CONFIRM the artwork's own pick.
export function parseNumbers(lines: string[]): {
	high: Set<string>;
	low: Set<string>;
} {
	const high = new Set<string>();
	const low = new Set<string>();
	const token = /([A-Z]{0,4})0*(\d{1,3})/g;
	for (const line of lines) {
		const up = line.toUpperCase();
		let m: RegExpExecArray | null;
		token.lastIndex = 0;
		while ((m = token.exec(up))) {
			const t = m[1] + m[2];
			if (m[1]) high.add(t); // letter prefix → set-specific
			else low.add(t); // bare digits → common, confirm-only
		}
	}
	return { high, low };
}

// Hiragana, katakana, or CJK present → this is the Japanese print of the card.
// EN cards have no such characters, so absence is treated as English.
export function hasJapanese(lines: string[]): boolean {
	return lines.some((l) => /[぀-ヿ㐀-鿿]/.test(l));
}

/**
 * Resolve an ambiguous near-twin cluster with the OCR'd card text. A lettered
 * number may break a tie among candidates the artwork already scored within
 * OCR_TIE_BAND of #1 (EN/JA twins split on script); a bare number may only
 * confirm a visual leader within PHOTO_FINISH of #1. Returns the one resolved
 * match, or null when the text doesn't single out a candidate.
 */
export function resolveOcrTieBreak(
	matches: CardMatch[],
	text: CardText,
): CardMatch | null {
	const top = matches[0];
	if (!top) return null;
	const { high, low } = parseNumbers(text.bottom);
	if (!high.size && !low.size) return null;

	const ja = hasJapanese([...text.top, ...text.bottom]);
	// (1) A LETTERED number may break a tie within the top cluster —
	// candidates the artwork already scored within OCR_TIE_BAND of #1.
	const cut = Math.max(NUM_VISUAL_FLOOR, top.score - OCR_TIE_BAND);
	let hits = matches.filter((m) => {
		const n = idNumber(m.id);
		return m.score >= cut && n != null && high.has(n);
	});
	// EN/JA twin (same art + number): split on the script OCR read.
	if (hits.length > 1) {
		const byLang = hits.filter((m) => m.id.includes("_ja") === ja);
		if (byLang.length) hits = byLang;
	}
	// (2) A bare number may only CONFIRM a visual leader / co-leader
	// (a true photo-finish with #1) — never promote a lower card that
	// merely shares the very common collector number.
	const leaders = matches.filter((m) => m.score >= top.score - PHOTO_FINISH);
	const confirmed = leaders.filter((m) => {
		const n = idNumber(m.id);
		return n != null && (high.has(n) || low.has(n));
	});
	if (__DEV__) {
		console.log(
			"[scan] ocr",
			`hi:${[...high].join(",") || "-"} lo:${[...low].join(",") || "-"}`,
			ja ? "(ja)" : "(en)",
			"→",
			hits.length === 1
				? hits[0].id
				: confirmed.length === 1
					? `${confirmed[0].id} (confirms #1)`
					: "(no eligible match)",
		);
	}
	if (hits.length === 1) return hits[0];
	if (confirmed.length === 1) return confirmed[0];
	return null;
}
