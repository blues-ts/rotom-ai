import React, { type ReactNode, useEffect, useState } from "react";
import { type ImageStyle, Keyboard, Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Renderer } from "react-native-marked";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { useRiverTheme } from "@/constants/theme";
import CodeBlock from "./CodeBlock";
import { STREAMING_IMAGE_URI } from "./chatMarkdown";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CardImagePressable({ cardId, name, image, children }: { cardId: string; name: string; image: string; children: ReactNode }) {
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<AnimatedPressable
			onPressIn={() => { scale.value = withTiming(0.96, { duration: 80 }); }}
			onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				// Dismiss BEFORE the card modal presents — same reason as the
				// paywall in (home)/index.tsx: a keyboard hide underneath a
				// native modal can skip its willHide event, leaving the chat
				// input's avoidance padding stuck at keyboard height.
				Keyboard.dismiss();
				// Pass the (already-cached) chat image as the `image` param so the detail
				// screen's hero shows instantly instead of waiting for a cold card fetch
				// on first open — same as navigating from the set/search grids.
				router.push(
					`/(card)/${cardId}?name=${encodeURIComponent(name)}&image=${encodeURIComponent(image)}`,
				);
			}}
			style={animatedStyle}
		>
			{children}
		</AnimatedPressable>
	);
}

// Remounts must never replay the loading state: chat images remount at
// several normal moments — the tail block re-parses (fresh keys) on every
// reveal commit, the streaming→complete handoff swaps component trees, and
// FlatList windowing unmounts far-away rows. Tracking loaded URIs here means
// only the FIRST mount of an image ever shows the skeleton pulse and fade;
// every later mount renders the (expo-image-cached) art instantly, so the
// skeleton can't flicker back in after the art has been seen.
const loadedImageUris = new Set<string>();

// Drawn in place of an image while its tag is still streaming in the tail
// block (STREAMING_IMAGE_URI). It reserves the exact box the real image
// will occupy, fading in on arrival so the box doesn't slam into layout.
// (A mount animation is safe here ONLY because ColoredRenderer's stable
// per-block keys keep this instance alive across the tail's ~30Hz
// re-parses; with the base renderer's ever-fresh keys it would remount and
// replay the fade every commit.)
// Skeleton fill must be LIGHTER than the gradient (elevated glass, like the
// chat input) — measured on device, colors.card is darker than the deep-water
// background here, which made the skeleton read as a dark hole flashing in.
function StreamingImagePlaceholder() {
	const t = useRiverTheme();
	return (
		<Animated.View
			entering={FadeIn.duration(350)}
			style={[
				skeletonStyles.box,
				{
					backgroundColor: t.glass.elevatedFill,
					borderColor: t.glass.elevatedBorder,
					borderWidth: 1,
				},
			]}
		/>
	);
}

// First mount of a real image: pulsing skeleton in the reserved
// aspect-ratio box, cross-fading out on the same 220ms clock as the image's
// fade-in. The pulse starts at full opacity so the placeholder→skeleton
// handoff is seamless. Later mounts of the same URI skip all of it.
function SkeletonCardImage({ uri, alt }: { uri: string; alt?: string }) {
	const t = useRiverTheme();
	const alreadyLoaded = loadedImageUris.has(uri);
	const [loaded, setLoaded] = useState(alreadyLoaded);
	const pulse = useSharedValue(1);

	useEffect(() => {
		if (alreadyLoaded) return;
		pulse.value = withRepeat(
			withSequence(
				withTiming(0.55, { duration: 700 }),
				withTiming(1, { duration: 700 }),
			),
			-1,
		);
	}, [alreadyLoaded, pulse]);

	const skeletonStyle = useAnimatedStyle(() => ({
		opacity: loaded ? withTiming(0, { duration: 350 }) : pulse.value,
	}));

	return (
		<View style={skeletonStyles.box}>
			{!alreadyLoaded ? (
				<Animated.View
					style={[
						StyleSheet.absoluteFill,
						{
							backgroundColor: t.glass.elevatedFill,
							borderColor: t.glass.elevatedBorder,
							borderWidth: 1,
							borderRadius: 23,
						},
						skeletonStyle,
					]}
				/>
			) : null}
			<Image
				source={{ uri }}
				style={StyleSheet.absoluteFill}
				contentFit="contain"
				transition={alreadyLoaded ? 0 : 350}
				onLoad={() => {
					loadedImageUris.add(uri);
					setLoaded(true);
				}}
				accessibilityLabel={alt}
			/>
		</View>
	);
}

const skeletonStyles = StyleSheet.create({
	box: {
		width: "100%",
		aspectRatio: 63 / 88,
		borderRadius: 23,
		overflow: "hidden",
	},
});

// --- Streaming word fade ---------------------------------------------------
// The reveal frontier fades in: the last `window` characters of the tail
// block render with reduced text alpha, ramping to full as they get further
// from the frontier. Because the tail re-renders on every reveal commit
// (~30Hz), this POSITIONAL gradient plays back as a smooth temporal fade-in
// of each new word — no animation machinery, and it can't desync from the
// reveal. Nested Text can't take `opacity`, so the fade rides on color alpha.
export interface StreamFade {
	/** Rendered-text length of the block, cursor excluded. */
	total: number;
	/** How many trailing characters span the fade ramp. */
	window: number;
	/**
	 * How far the continuous reveal clock has advanced past the committed
	 * text. Words brighten smoothly between word arrivals because the
	 * effective frontier is total + lead, and lead moves every tick.
	 */
	lead: number;
}

// Words materialize from FULLY transparent: a word landing at any visible
// alpha is a discrete pop the eye reads as stutter — at 0 the arrival is
// invisible and all the user ever sees is the continuous brightening.
const FADE_MIN_ALPHA = 0;

function withAlpha(color: string, alpha: number): string {
	const hex = color.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const n = parseInt(hex[1], 16);
		return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
	}
	const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
	if (rgb) {
		const [r, g, b] = rgb[1].split(",").map((p) => parseFloat(p));
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	// Unknown color format: skip fading rather than break the color.
	return color;
}

// No `g` flag: a global regex makes `.test()` stateful (it advances `lastIndex`),
// which intermittently mis-fires across messages. `.split()` still splits every
// match and keeps the capture group without it.
// Matches bare signed percentages ("+11.83%", "-1.74%", incl. Unicode minus)
// wherever they appear — "7-day trend: -1.74%", "(7-day: +0.81%, 30-day: …)".
const PERCENT_REGEX = /([+\-−][\d.]+%)/;

/**
 * Custom markdown renderer that colorizes percentage changes
 * and renders syntax-highlighted code blocks.
 */
export class ColoredRenderer extends Renderer {
	private fade: StreamFade | null = null;
	private fadeConsumed = 0;
	private keyIndex = 0;

	// STABLE keys per block position, unlike the base class's slugger which
	// increments forever across parses. With ever-fresh keys, the streaming
	// tail's whole native text tree unmounted and remounted on every reveal
	// commit (~30Hz) — heavy, and the churn read as stutter. Resetting the
	// counter per parse means a re-parse of the same block produces the
	// same keys, so React updates text in place.
	getKey(): string {
		return `cr-${this.keyIndex++}`;
	}

	// Called by MarkdownBlock before each parse. Text runs arrive in
	// document order, so a running counter gives each run its offset within
	// the block's rendered text.
	startBlock(fade: StreamFade | null) {
		this.fade = fade;
		this.fadeConsumed = 0;
		this.keyIndex = 0;
	}

	// Consume a string run against the fade counter; returns faded spans if
	// the run reaches the trailing window, null if the caller should render
	// it normally. Used by text() AND the inline wrappers (strong/em/
	// codespan), because the parser short-circuits simple bold/italic runs
	// straight to those methods without a text() call — un-counted bold
	// drifted every later offset and broke the fade.
	private consumeForFade(run: string, styles?: TextStyle): ReactNode | null {
		if (!this.fade) return null;
		const { total, window, lead } = this.fade;
		const start = this.fadeConsumed;
		this.fadeConsumed += run.length;
		if (start + run.length > total + lead - window) {
			return this.renderFadedRun(run, start, styles);
		}
		return null;
	}

	// Waterfall fade: a PER-CHARACTER alpha ramp with smoothstep easing.
	// Per-word alphas read as blocks brightening; per-char makes the ramp a
	// continuous luminance gradient flowing over the text. Adjacent chars
	// with the same quantized alpha share a span, so a run costs ~a dozen
	// spans, not one per character.
	private renderFadedRun(
		run: string,
		start: number,
		styles?: TextStyle,
	): ReactNode {
		const { total, window, lead } = this.fade as StreamFade;
		const frontier = total + lead;
		const base = (styles?.color as string) ?? "#FFFFFF";
		const children: ReactNode[] = [];
		let spanStart = 0;
		let spanAlpha = -1;
		const flush = (endIdx: number) => {
			if (endIdx <= spanStart) return;
			const piece = run.slice(spanStart, endIdx);
			children.push(
				spanAlpha >= 1 ? (
					piece
				) : (
					<Text
						key={spanStart}
						style={[styles, { color: withAlpha(base, spanAlpha) }]}
					>
						{piece}
					</Text>
				),
			);
			spanStart = endIdx;
		};
		for (let i = 0; i < run.length; i++) {
			const dist = frontier - (start + i + 1);
			const t = Math.min(1, Math.max(0, dist / window));
			// Smoothstep: no visible crease at either end of the ramp.
			const eased = t * t * (3 - 2 * t);
			const alpha =
				Math.round(
					(FADE_MIN_ALPHA + (1 - FADE_MIN_ALPHA) * eased) * 20,
				) / 20;
			if (alpha !== spanAlpha) {
				flush(i);
				spanAlpha = alpha;
			}
		}
		flush(run.length);
		return (
			<Text selectable key={this.getKey()} style={styles}>
				{children}
			</Text>
		);
	}

	strong(children: string | ReactNode[], styles?: TextStyle): ReactNode {
		if (typeof children === "string") {
			const faded = this.consumeForFade(children, styles);
			if (faded) return faded;
		}
		return super.strong(children, styles);
	}

	em(children: string | ReactNode[], styles?: TextStyle): ReactNode {
		if (typeof children === "string") {
			const faded = this.consumeForFade(children, styles);
			if (faded) return faded;
		}
		return super.em(children, styles);
	}

	codespan(text: string, styles?: TextStyle): ReactNode {
		const faded = this.consumeForFade(text, styles);
		if (faded) return faded;
		return super.codespan(text, styles);
	}

	link(
		children: string | ReactNode[],
		href: string,
		styles?: TextStyle,
		title?: string,
	): ReactNode {
		// Count link labels so downstream offsets stay aligned, but don't
		// fade them — recoloring would clobber the link tint.
		if (this.fade && typeof children === "string") {
			this.fadeConsumed += children.length;
		}
		return super.link(children, href, styles, title);
	}

	image(
		uri: string,
		alt?: string,
		style?: ImageStyle,
		_title?: string,
	): ReactNode {
		// Still streaming in the tail block: static placeholder box only.
		if (uri === STREAMING_IMAGE_URI) {
			return <StreamingImagePlaceholder key={this.getKey()} />;
		}

		let imageUrl = uri;
		let cardId: string | null = null;

		const hashIndex = uri.indexOf("#cardId=");
		if (hashIndex !== -1) {
			cardId = uri.substring(hashIndex + 8);
			imageUrl = uri.substring(0, hashIndex);
		}

		const image = (
			<SkeletonCardImage key={this.getKey()} uri={imageUrl} alt={alt} />
		);

		if (cardId) {
			return (
				<CardImagePressable key={this.getKey()} cardId={cardId} name={alt || ""} image={imageUrl}>
					{image}
				</CardImagePressable>
			);
		}

		return image;
	}

	code(
		text: string,
		language?: string,
		_containerStyle?: ViewStyle,
		_textStyle?: TextStyle,
	): ReactNode {
		return <CodeBlock key={this.getKey()} code={text} language={language} />;
	}

	text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
		// Runs reaching into the trailing fade window render as faded
		// spans; earlier runs fall through to the normal path (incl.
		// percent coloring — the frontier gets its colors a beat later,
		// once the text ages out of the window).
		if (typeof text === "string") {
			const faded = this.consumeForFade(text, styles);
			if (faded) return faded;
		}
		if (typeof text === "string" && PERCENT_REGEX.test(text)) {
			// A single capture group means matches land at odd indices of the split.
			const parts = text.split(PERCENT_REGEX);
			const children = parts.map((part, i) => {
				if (i % 2 === 1) {
					// Skip numeric ranges ("10-15%"): the "-15%" there is not a delta.
					const prev = parts[i - 1];
					if (prev && /\d$/.test(prev)) return part;
					const isPositive = part.startsWith("+");
					return (
						<Text
							key={i}
							style={[styles, { color: isPositive ? "#22c55e" : "#ef4444" }]}
						>
							{part}
						</Text>
					);
				}
				return part;
			});

			return (
				<Text selectable key={this.getKey()} style={styles}>
					{children}
				</Text>
			);
		}

		return super.text(text, styles);
	}
}
