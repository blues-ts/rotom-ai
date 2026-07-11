import { memo } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Svg, { Defs, Mask, Rect } from "react-native-svg";

// Binder-page viewfinder: scrim with a page-shaped hole. No inner grid — the
// detector finds the cards wherever they sit inside the frame; the box just
// keeps them close enough to the camera to detect. A 9-pocket page is
// ~7.5" × 10.5" — the same 0.714 aspect as a single card, just bigger — so
// this reuses the card-box math with wider constants.

const { width, height } = Dimensions.get("window");

const PAGE_ASPECT = 2.5 / 3.5;
const PAGE_MAX_WIDTH = 370;
const PAGE_WIDTH_RATIO = 0.92;
const PAGE_CENTER_Y_RATIO = 0.42;
const SCRIM_OPACITY = 0.28;
const REGION_PAD = 0.04;

export const BINDER_CORNER_RADIUS = 18;
export const binderWidth = Math.min(PAGE_MAX_WIDTH, width * PAGE_WIDTH_RATIO);
export const binderHeight = binderWidth / PAGE_ASPECT;
export const binderX = width / 2 - binderWidth / 2;
export const binderY = height * PAGE_CENTER_Y_RATIO - binderHeight / 2;

// The page box as preview fractions (plus padding) for the recognition crop —
// same construction as the single-card scanRegion.
export const binderRegion = {
	x: Math.max(0, binderX / width - (binderWidth / width) * REGION_PAD),
	y: Math.max(0, binderY / height - (binderHeight / height) * REGION_PAD),
	w: Math.min(1, (binderWidth / width) * (1 + 2 * REGION_PAD)),
	h: Math.min(1, (binderHeight / height) * (1 + 2 * REGION_PAD)),
};

// The scrim/mask never changes — memoized so state-color re-renders only
// re-commit the small outline Svg below (same split as the card scanner).
const BinderScrim = memo(function BinderScrim() {
	return (
		<Svg
			style={StyleSheet.absoluteFill}
			width={width}
			height={height}
			pointerEvents="none"
		>
			<Defs>
				<Mask id="binderHoleMask">
					<Rect width={width} height={height} fill="white" />
					<Rect
						x={binderX}
						y={binderY}
						width={binderWidth}
						height={binderHeight}
						rx={BINDER_CORNER_RADIUS}
						ry={BINDER_CORNER_RADIUS}
						fill="black"
					/>
				</Mask>
			</Defs>
			<Rect
				width={width}
				height={height}
				fill={`rgba(0,0,0,${SCRIM_OPACITY})`}
				mask="url(#binderHoleMask)"
			/>
		</Svg>
	);
});

export default function BinderFrameOverlay({ color }: { color: string }) {
	return (
		<>
			<BinderScrim />
			<Svg
				style={StyleSheet.absoluteFill}
				width={width}
				height={height}
				pointerEvents="none"
			>
				<Rect
					x={binderX}
					y={binderY}
					width={binderWidth}
					height={binderHeight}
					rx={BINDER_CORNER_RADIUS}
					ry={BINDER_CORNER_RADIUS}
					fill="none"
					stroke={color}
					strokeWidth={3}
				/>
			</Svg>
		</>
	);
}
