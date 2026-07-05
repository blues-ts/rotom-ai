import { memo, useMemo } from "react";
import { useMarkdown } from "react-native-marked";

import type { ThemeColors } from "@/constants/colors";
import { ColoredRenderer, type StreamFade } from "./ColoredRenderer";
import { getMarkdownStyles } from "./chatMarkdown";

/**
 * One markdown block, parsed once and frozen behind memo. Both the live
 * stream (StreamingMessage) and finished messages (ChatMessage) render
 * through this same component with the same styles and renderer, so the
 * streaming→complete handoff is pixel-identical by construction — and while
 * streaming, every completed block skips re-parsing on each reveal commit.
 *
 * `fade` (tail block only) fades the words at the reveal frontier; it must
 * be reset before EVERY parse — including to null for non-tail blocks, so a
 * freshly frozen block doesn't inherit the previous tail's fade state.
 */
export const MarkdownBlock = memo(
	function MarkdownBlock({
		text,
		colors,
		renderer,
		fade = null,
	}: {
		text: string;
		colors: ThemeColors;
		renderer: ColoredRenderer;
		fade?: StreamFade | null;
	}) {
		const mdStyles = useMemo(() => getMarkdownStyles(colors), [colors]);
		renderer.startBlock(fade);
		const elements = useMarkdown(text, { styles: mdStyles, renderer });
		return <>{elements}</>;
	},
	(prev, next) =>
		prev.text === next.text &&
		prev.colors === next.colors &&
		// The tail must re-parse when the fade frontier moves, even with
		// unchanged text — that's what animates the fade between words.
		prev.fade?.total === next.fade?.total &&
		prev.fade?.lead === next.fade?.lead &&
		prev.fade?.window === next.fade?.window,
);
