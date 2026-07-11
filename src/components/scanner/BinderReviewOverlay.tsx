import { useEffect, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/constants/theme";
import { useApi } from "@/lib/axios";
import { getCatalogCard } from "@/lib/api/catalog";
import type { CardDetection } from "@/lib/binderScan";
import { binderRegion } from "@/components/scanner/BinderFrameOverlay";

// Post-shutter review: the analyzed frame (already upright + cropped to the
// guide box natively) pinned where the guide box sits on screen, with one tile
// per DETECTED card at the spot it was found. Identified cards show the match
// (tap to include/exclude), unsure detections a question mark. Confirm sends
// the included cards into the scan session; Retake returns to the viewfinder.

const AMBER = "#FFAE04"; // matches the scanner's "hold steady" signal

const { width, height } = Dimensions.get("window");

// The guide-box region in screen points — the frame image is displayed here,
// and detection rects (frame-normalized) map into this box.
const regionLeft = binderRegion.x * width;
const regionTop = binderRegion.y * height;
const regionW = binderRegion.w * width;
const regionH = binderRegion.h * height;

const cardImageUrl = (id: string) =>
	`https://images.scrydex.com/pokemon/${id}/small`;

type Picked = { id: string; score: number };

export default function BinderReviewOverlay({
	photoUri,
	detections,
	onConfirm,
	onRetake,
}: {
	photoUri: string;
	detections: CardDetection[];
	onConfirm: (picked: Picked[]) => void;
	onRetake: () => void;
}) {
	const api = useApi();
	const insets = useSafeAreaInsets();
	// Low-confidence guesses start unchecked — the user confirms them with a
	// tap after eyeballing the card behind the tile.
	const [excluded, setExcluded] = useState<Set<number>>(
		() => new Set(detections.flatMap((d, i) => (d.confident ? [] : [i]))),
	);
	const [names, setNames] = useState<Record<string, string>>({});

	// Resolve display names for the matched ids. Thumbnails render immediately
	// from the Scrydex URL; names fill in as the catalog answers.
	useEffect(() => {
		let cancelled = false;
		const ids = [...new Set(detections.map((d) => d.id))];
		Promise.allSettled(ids.map((id) => getCatalogCard(api, id))).then(
			(settled) => {
				if (cancelled) return;
				const next: Record<string, string> = {};
				settled.forEach((s, i) => {
					if (s.status === "fulfilled")
						next[ids[i]] = s.value.nameEn ?? s.value.name;
				});
				setNames(next);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [api, detections]);

	const included = detections.filter((_, i) => !excluded.has(i));
	const includedIds = included.map((d) => d.id);
	const hasDuplicates = new Set(includedIds).size < includedIds.length;

	const toggle = (index: number) => {
		Haptics.selectionAsync();
		setExcluded((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	return (
		<View style={[StyleSheet.absoluteFill, styles.backdrop]}>
			{!!photoUri && (
				<Image
					source={{ uri: photoUri }}
					style={styles.frame}
					contentFit="fill"
				/>
			)}

			{/* One tile per detected card, at the spot it was found in the frame —
			    tiles line up with the cards behind them. Confident matches are
			    checked (accent); low-confidence guesses start unchecked (amber,
			    dashed) for the user to confirm. */}
			{detections.map((d, index) => {
				const box = {
					left: regionLeft + d.rect.x * regionW,
					top: regionTop + d.rect.y * regionH,
					width: d.rect.w * regionW,
					height: d.rect.h * regionH,
				};
				const on = !excluded.has(index);
				const accent = d.confident && !d.viaOcr ? palette.accent : AMBER;
				return (
					<Pressable
						key={index}
						onPress={() => toggle(index)}
						style={[
							styles.tile,
							box,
							!d.confident && styles.tileGuess,
							{ borderColor: on ? accent : "rgba(255,255,255,0.25)" },
						]}
					>
						<Image
							source={{ uri: cardImageUrl(d.id) }}
							style={[styles.tileImage, !on && styles.tileImageOff]}
							contentFit="contain"
						/>
						<Text style={styles.tileName} numberOfLines={1}>
							{names[d.id] ?? d.id.slice(d.id.lastIndexOf("-") + 1)}
						</Text>
						{on ? (
							<View style={[styles.tileCheck, { backgroundColor: accent }]}>
								<SymbolView
									name="checkmark"
									size={10}
									tintColor="#fff"
									weight="bold"
								/>
							</View>
						) : (
							<View style={styles.tileAdd}>
								<SymbolView
									name="plus"
									size={11}
									tintColor="#fff"
									weight="bold"
								/>
							</View>
						)}
					</Pressable>
				);
			})}

			{detections.length === 0 && (
				<View style={styles.emptyState} pointerEvents="none">
					<Text style={styles.emptyText}>
						No cards found — try moving closer
					</Text>
				</View>
			)}

			{/* Confirm / retake */}
			<View style={[styles.footer, { bottom: insets.bottom + 16 }]}>
				{hasDuplicates && (
					<Text style={styles.dupeNote}>Duplicates are added once</Text>
				)}
				<View style={styles.footerButtons}>
					<Pressable style={styles.retakeButton} onPress={onRetake}>
						<Text style={styles.retakeText}>Retake</Text>
					</Pressable>
					<Pressable
						style={[
							styles.confirmButton,
							included.length === 0 && styles.confirmDisabled,
						]}
						disabled={included.length === 0}
						onPress={() =>
							onConfirm(included.map((d) => ({ id: d.id, score: d.score })))
						}
					>
						<Text style={styles.confirmText}>
							{included.length === 1
								? "Add 1 card"
								: `Add ${included.length} cards`}
						</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		backgroundColor: "rgba(0,0,0,0.92)",
	},
	// The analyzed frame, pinned exactly where the guide box sat during
	// capture. `fill` is correct (not a distortion): the native crop's aspect
	// IS this box's aspect.
	frame: {
		position: "absolute",
		left: regionLeft,
		top: regionTop,
		width: regionW,
		height: regionH,
		borderRadius: 14,
	},
	tile: {
		position: "absolute",
		padding: 3,
		borderWidth: 2,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	tileImage: {
		flex: 1,
		alignSelf: "stretch",
	},
	tileName: {
		color: "#fff",
		fontSize: 9,
		fontWeight: "600",
		maxWidth: "100%",
	},
	tileCheck: {
		position: "absolute",
		top: 5,
		right: 5,
		width: 18,
		height: 18,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	tileAdd: {
		position: "absolute",
		top: 5,
		right: 5,
		width: 18,
		height: 18,
		borderRadius: 9,
		backgroundColor: "rgba(0,0,0,0.55)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.6)",
		alignItems: "center",
		justifyContent: "center",
	},
	// Low-confidence guess: dashed border draws the eye to double-check it.
	tileGuess: {
		borderStyle: "dashed",
	},
	tileImageOff: {
		opacity: 0.45,
	},
	emptyState: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyText: {
		color: "rgba(255,255,255,0.8)",
		fontSize: 15,
		fontWeight: "600",
	},
	footer: {
		position: "absolute",
		left: 16,
		right: 16,
		gap: 10,
	},
	dupeNote: {
		textAlign: "center",
		color: "rgba(255,255,255,0.65)",
		fontSize: 12,
		fontWeight: "500",
	},
	footerButtons: {
		flexDirection: "row",
		gap: 10,
	},
	retakeButton: {
		flex: 1,
		paddingVertical: 14,
		borderRadius: 999,
		alignItems: "center",
		backgroundColor: "rgba(255,255,255,0.14)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.2)",
	},
	retakeText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	confirmButton: {
		flex: 2,
		paddingVertical: 14,
		borderRadius: 999,
		alignItems: "center",
		backgroundColor: palette.accent,
	},
	confirmDisabled: {
		opacity: 0.4,
	},
	confirmText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
});
