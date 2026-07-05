import type { MarkedStyles } from "react-native-marked";

import type { ThemeColors } from "@/constants/colors";

// Shared by ChatMessage (finished messages) and StreamingMessage (in-flight
// stream) so the moment a stream finalizes into a message it renders
// pixel-identically — no format flip at the handoff.
export function getMarkdownStyles(colors: ThemeColors): MarkedStyles {
	return {
		text: {
			color: colors.foreground,
			fontSize: 16,
			lineHeight: 22,
		},
		h1: {
			fontSize: 22,
			fontWeight: "700",
			color: colors.foreground,
			marginTop: 20,
			marginBottom: 8,
		},
		h2: {
			fontSize: 20,
			fontWeight: "700",
			color: colors.foreground,
			marginTop: 18,
			marginBottom: 8,
		},
		h3: {
			fontSize: 18,
			fontWeight: "700",
			color: colors.foreground,
			marginTop: 16,
			marginBottom: 6,
		},
		paragraph: {
			marginTop: 4,
			marginBottom: 4,
		},
		strong: {
			fontWeight: "700",
			color: colors.foreground,
		},
		em: {
			fontStyle: "italic",
			color: colors.foreground,
		},
		list: {
			marginLeft: 4,
		},
		li: {
			color: colors.foreground,
			fontSize: 16,
			lineHeight: 22,
			marginVertical: 2,
		},
		codespan: {
			backgroundColor: colors.card,
			color: colors.foreground,
			borderRadius: 4,
			paddingHorizontal: 5,
			paddingVertical: 2,
			fontSize: 14,
			fontFamily: "Menlo",
		},
		code: {
			backgroundColor: colors.card,
			borderRadius: 8,
			padding: 12,
			marginVertical: 8,
			borderWidth: 0,
		},
		blockquote: {
			borderLeftWidth: 3,
			borderLeftColor: colors.primary,
			paddingLeft: 12,
			marginLeft: 0,
			marginVertical: 8,
			backgroundColor: "transparent",
		},
		hr: {
			backgroundColor: colors.border,
			height: 1,
			marginVertical: 12,
		},
		link: {
			color: colors.primary,
			textDecorationLine: "none",
		},
		image: {
			borderRadius: 10,
			resizeMode: "contain" as const,
		},
	};
}

// Rendered in place of ANY image in the still-streaming tail block — partial
// or complete. Partial, because the tag can't render until the URL finishes;
// complete, because a real <Image> in the re-parsing tail can still remount
// when element indices shift (restarting its load/fade), while the sentinel
// box is remount-proof. ColoredRenderer draws it as the same-size skeleton
// box (fading in on arrival), so the space is reserved from the instant
// `![` streams in, and the real image mounts exactly once — when its block
// freezes.
export const STREAMING_IMAGE_URI = "skeleton://streaming-image";

/**
 * Make a still-streaming markdown tail renderable as real markdown by
 * optimistically closing whatever is still open (ChatGPT-style): `**Incre`
 * renders bold immediately instead of as literal asterisks, an open code
 * fence renders as a code block, and constructs that can't partially render
 * (a bare "1." list marker) are held back until complete; images become
 * skeleton placeholders (see STREAMING_IMAGE_URI). `cursor` is inserted at
 * the end of the visible text, INSIDE the auto-appended closers, so the
 * caret rides along inside bold/code the way ChatGPT's does.
 */
export function closePartialMarkdown(md: string, cursor = ""): string {
	let text = md;

	// Every image in the tail — complete tags first, then an unfinished one
	// at the end — becomes the skeleton sentinel. All three partial states
	// need a case (`![al`, `![alt]`, `![alt](ur`): the reveal can park at ANY
	// character of the tag (the long URL token defeats word-snapping), and a
	// state that matches no pattern makes the box vanish for a commit.
	// Alt text is preserved in the sentinel: the model wraps images in bold
	// (`**![name](url)** - Ultra Rare`) and react-native-marked resolves that
	// strong-wrapping-an-image via the alt — an empty alt made the `**` pair
	// render as literal asterisks with the name missing mid-stream.
	text = text
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, `![$1](${STREAMING_IMAGE_URI})`)
		.replace(/!\[([^\]]*)\]\([^)]*$/, `![$1](${STREAMING_IMAGE_URI})`)
		.replace(/!\[([^\]]*)\]$/, `![$1](${STREAMING_IMAGE_URI})`)
		.replace(/!\[([^\]]*)$/, `![$1](${STREAMING_IMAGE_URI})`);
	// Unfinished links: show the label, drop the syntax (same three states).
	text = text
		.replace(/\[([^\]]*)\]\([^)]*$/, "$1")
		.replace(/\[([^\]]*)\]$/, "$1")
		.replace(/\[([^\]]*)$/, "$1");

	// A trailing lone marker ("1.", "-", "##", ">") parses as an empty
	// list/heading/quote and flashes — hold that line back until it has text.
	const lines = text.split("\n");
	if (/^\s*(?:[-*+]|\d+[.)]|#{1,6}|>)\s*$/.test(lines[lines.length - 1])) {
		lines.pop();
		text = lines.join("\n");
	}

	// Inside an open code fence everything is literal: close the fence and
	// skip inline handling entirely.
	let fence: string | null = null;
	for (const line of text.split("\n")) {
		const open = line.match(/^\s*(```|~~~)/);
		if (open) fence = fence ? null : open[1];
	}
	if (fence) return `${text}${cursor}\n${fence}`;

	// Close open inline formatting, innermost-first: an odd backtick count
	// means an open code span (whose contents are opaque to the * markers),
	// then bold, italic, strikethrough.
	const closers: string[] = [];
	let scratch = text.replace(/`[^`]*`/g, "");
	const openTick = scratch.indexOf("`");
	if (openTick !== -1) {
		closers.push("`");
		scratch = scratch.slice(0, openTick);
	}
	if ((scratch.match(/\*\*/g) ?? []).length % 2 === 1) closers.push("**");
	if ((scratch.replace(/\*\*/g, "").match(/\*/g) ?? []).length % 2 === 1) {
		closers.push("*");
	}
	if ((scratch.match(/~~/g) ?? []).length % 2 === 1) closers.push("~~");

	return text + cursor + closers.join("");
}

/**
 * Approximate length of the text a markdown string RENDERS as (markers,
 * image tags and link URLs don't reach the screen). Anchors the streaming
 * word-fade window to the end of the tail block's visible text.
 */
export function plainTextLength(md: string): number {
	return (
		md
			.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/^#{1,6}\s+/gm, "")
			// List markers (bulleted AND numbered) and blockquote prefixes
			// render as widgets/indentation, not text runs.
			.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
			.replace(/^\s*>\s?/gm, "")
			.replace(/\*\*|\*|~~|`/g, "")
			// Soft-break newlines never reach a text run (the parser emits
			// them as break elements) — counting them made the estimate
			// drift by +1 per line until the fade window slid past the real
			// frontier and the fade silently stopped.
			.replace(/\n/g, "").length
	);
}

/**
 * Split markdown into blocks on blank lines, without splitting inside a
 * fenced code block. Streaming renders each completed block through a
 * memoized component (parsed once); only the still-growing tail block
 * re-parses per reveal commit.
 */
export function splitMarkdownBlocks(md: string): string[] {
	const lines = md.split("\n");
	const blocks: string[] = [];
	let current: string[] = [];
	let inFence = false;

	for (const line of lines) {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
		}
		if (!inFence && line.trim() === "") {
			if (current.length) {
				blocks.push(current.join("\n"));
				current = [];
			}
			continue;
		}
		current.push(line);
	}
	if (current.length) {
		blocks.push(current.join("\n"));
	}
	return blocks;
}
