import type { ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

// Crisp return — lands fast with a whisper of overshoot, no wobble.
const SPRING = { stiffness: 320, damping: 26, mass: 0.7 };

// Stretching past MAX_SCALE moves at a fraction of the gesture, like Photos'
// rubber-band. Shrinking below 1x is a hard floor — the card never gets
// smaller than its resting size.
const MAX_SCALE = 3.5;
const RESISTANCE = 0.3;

/**
 * Peek zoom: pinch to magnify in place, then roam the whole image — the pan
 * keeps working with two fingers OR one, so dropping a finger after the pinch
 * lets you drag around the entire card without re-zooming. Everything springs
 * back home only when the LAST finger lifts. Nothing persists; it's a look,
 * not a mode.
 *
 * Scale is applied incrementally around the live pinch focal point and the
 * pan is a separate simultaneous gesture, so finger lifts/additions never
 * cause positional jumps. The zoomed content is lifted above its siblings
 * (zIndex) so it can overflow the layout while active.
 */
export default function PeekZoom({
	width,
	height,
	onActiveChange,
	children,
}: {
	/** Laid-out size of the content — the anchor math needs the true center. */
	width: number;
	height: number;
	/** Fires as the peek starts/ends — disable the enclosing scroll view
	 * while true so drags move the card, not the page. */
	onActiveChange?: (active: boolean) => void;
	children: ReactNode;
}) {
	const scale = useSharedValue(1);
	const tx = useSharedValue(0);
	const ty = useSharedValue(0);
	const active = useSharedValue(false);

	const pinch = Gesture.Pinch()
		.onStart(() => {
			active.value = true;
			if (onActiveChange) runOnJS(onActiveChange)(true);
		})
		.onChange((e) => {
			// Incremental: scale by this event's delta around the CURRENT focal
			// point. Focal jumps (finger lifted/added) can't move the content —
			// they only re-anchor future scaling.
			let k = e.scaleChange;
			if (k > 1 && scale.value >= MAX_SCALE) k = 1 + (k - 1) * RESISTANCE;
			let s = scale.value * k;
			if (s < 1) s = 1;
			const factor = s / scale.value;
			const fx = e.focalX - width / 2;
			const fy = e.focalY - height / 2;
			tx.value = fx - (fx - tx.value) * factor;
			ty.value = fy - (fy - ty.value) * factor;
			scale.value = s;
		});

	// All translation lives here, 1:1 with the finger centroid. Manual
	// activation: takes over only once actually zoomed, so an ordinary
	// one-finger scroll that happens to start on the card still scrolls the
	// page. It never fails while pending — a pinch later in the same touch
	// can still hand it the drag.
	const pan = Gesture.Pan()
		.manualActivation(true)
		.minPointers(1)
		.maxPointers(2)
		.averageTouches(true)
		.onTouchesMove((_e, mgr) => {
			if (scale.value > 1.01) mgr.activate();
		})
		.onChange((e) => {
			tx.value += e.changeX;
			ty.value += e.changeY;
		})
		.onFinalize(() => {
			// Fires when the last finger lifts (also when the touch ends without
			// the pan ever activating) — the one moment the peek snaps home.
			if (onActiveChange) runOnJS(onActiveChange)(false);
			scale.value = withSpring(1, SPRING);
			tx.value = withSpring(0, SPRING);
			ty.value = withSpring(0, SPRING, (finished) => {
				if (finished) active.value = false;
			});
		});

	const style = useAnimatedStyle(() => ({
		zIndex: active.value ? 100 : 0,
		transform: [
			{ translateX: tx.value },
			{ translateY: ty.value },
			{ scale: scale.value },
		],
	}));

	return (
		<GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
			<Animated.View style={[{ width, height }, style]}>
				{children}
			</Animated.View>
		</GestureDetector>
	);
}
