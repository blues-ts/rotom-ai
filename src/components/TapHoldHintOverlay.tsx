import { StyleSheet, View } from "react-native";
import { Host, Popover, Text } from "@expo/ui/swift-ui";
import {
	fixedSize,
	frame,
	multilineTextAlignment,
	padding,
} from "@expo/ui/swift-ui/modifiers";

/**
 * A native SwiftUI popover (@expo/ui) that points at a card to nudge the user to
 * try the long-press menu. Rendered as an absolute overlay over the card: the
 * invisible Trigger is framed to the card's size so the popover anchors to it,
 * and the Content shows the hint BELOW the card (arrow pointing up) — the first
 * card is the top-left tile, so anchoring above would tuck it under the header.
 *
 * `pointerEvents="none"` so the overlay never blocks the long-press it's
 * advertising — the popover is presented/dismissed natively via `isPresented`,
 * independent of RN touch handling.
 */
export default function TapHoldHintOverlay({
	width,
	height,
	label = "Tap and hold me!",
	onDismiss,
	position = "below",
	maxWidth,
}: {
	width: number;
	height: number;
	label?: string;
	onDismiss: () => void;
	/** Where the hint bubble sits relative to the anchor. "below" for cards
	 *  near the top of the screen (default); "above" for anchors near the
	 *  bottom (e.g. the scanner's sheet lip). */
	position?: "below" | "above";
	/** Wrap the label to this width (pt) instead of one long line — for hints
	 *  whose copy is a sentence rather than a few words. */
	maxWidth?: number;
}) {
	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			<Host style={StyleSheet.absoluteFill}>
				<Popover
					isPresented
					onIsPresentedChange={(presented) => {
						if (!presented) onDismiss();
					}}
					attachmentAnchor={position === "above" ? "top" : "bottom"}
					arrowEdge={position === "above" ? "bottom" : "top"}
				>
					<Popover.Trigger>
						{/* Invisible anchor framed to the card so the popover points at it. */}
						<Text modifiers={[frame({ width, height })]}>{""}</Text>
					</Popover.Trigger>
					<Popover.Content>
						<Text
							modifiers={[
								// maxWidth wraps long copy; fixedSize lets the popover grow
								// vertically to fit instead of truncating.
								...(maxWidth
									? [
											frame({ maxWidth }),
											fixedSize({ horizontal: false, vertical: true }),
											multilineTextAlignment("center"),
										]
									: []),
								padding({ horizontal: 16, vertical: 12 }),
							]}
						>
							{label}
						</Text>
					</Popover.Content>
				</Popover>
			</Host>
		</View>
	);
}
