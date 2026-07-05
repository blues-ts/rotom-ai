import React, { useMemo, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import type { LeadStore } from "@/hooks/useChat";
import { ColoredRenderer, type StreamFade } from "./ColoredRenderer";
import { MarkdownBlock } from "./MarkdownBlocks";
import {
	closePartialMarkdown,
	plainTextLength,
	splitMarkdownBlocks,
} from "./chatMarkdown";

const NULL_LEAD_STORE: LeadStore = {
	get: () => 0,
	subscribe: () => () => {},
};

interface StreamingMessageProps {
	content: string;
	/**
	 * Reveal-clock lead store (~60Hz). Subscribed here — NOT passed as a
	 * value through props — so fade ticks re-render only this component.
	 */
	leadStore?: LeadStore;
}

// No cursor glyph: a caret hopping forward a word at a time is a visual
// metronome that reads as stutter — the fade frontier itself marks where
// the text is growing (ChatGPT dropped its caret for the same reason).

// The trailing ~6 words before the reveal frontier ramp from transparent to
// full text alpha — under the steady clock-paced reveal this positional
// gradient plays back as each word fading in (see StreamFade in
// ColoredRenderer). Wider window = slower, dreamier fade: each word spends
// ~window/rate seconds brightening (≈0.5–1.2s at the current 30–85cps).
const FADE_WINDOW_CHARS = 36;

// Every COMPLETED block streams as frozen, memoized markdown; the
// still-growing tail also renders as markdown, with its open formatting
// optimistically closed so `**Incre` is bold from the first frame and never
// pops from plain text to formatted when the block completes. Constructs
// that can't partially render (images, a bare list marker) are held back by
// closePartialMarkdown until they're complete.
export default function StreamingMessage({
	content,
	leadStore = NULL_LEAD_STORE,
}: StreamingMessageProps) {
	const { colors } = useTheme();
	const lead = useSyncExternalStore(leadStore.subscribe, leadStore.get);
	const renderer = useMemo(() => new ColoredRenderer(), []);
	const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);
	const completed = blocks.slice(0, -1);
	const tail = blocks.length > 0 ? blocks[blocks.length - 1] : "";
	const tailClosed = useMemo(() => closePartialMarkdown(tail), [tail]);
	const tailFade: StreamFade = useMemo(
		() => ({
			total: plainTextLength(tailClosed),
			window: FADE_WINDOW_CHARS,
			lead,
		}),
		[tailClosed, lead],
	);

	return (
		<View style={styles.container}>
			{completed.map((block, i) => (
				<MarkdownBlock
					key={i}
					text={block}
					colors={colors}
					renderer={renderer}
				/>
			))}
			{tailClosed.trim().length > 0 ? (
				<MarkdownBlock
					text={tailClosed}
					colors={colors}
					renderer={renderer}
					fade={tailFade}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: 16,
		paddingVertical: 4,
		width: "100%",
	},
});
