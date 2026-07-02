import { StyleSheet, View } from "react-native";
import { Host, Popover, Text } from "@expo/ui/swift-ui";
import { frame, padding } from "@expo/ui/swift-ui/modifiers";

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
}: {
	width: number;
	height: number;
	label?: string;
	onDismiss: () => void;
}) {
	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			<Host style={StyleSheet.absoluteFill}>
				<Popover
					isPresented
					onIsPresentedChange={(presented) => {
						if (!presented) onDismiss();
					}}
					attachmentAnchor="bottom"
					arrowEdge="top"
				>
					<Popover.Trigger>
						{/* Invisible anchor framed to the card so the popover points at it. */}
						<Text modifiers={[frame({ width, height })]}>{""}</Text>
					</Popover.Trigger>
					<Popover.Content>
						<Text modifiers={[padding({ horizontal: 16, vertical: 12 })]}>
							{label}
						</Text>
					</Popover.Content>
				</Popover>
			</Host>
		</View>
	);
}
