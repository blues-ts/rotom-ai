import { FadeInDown } from "react-native-reanimated";

/**
 * Shared waterfall entrance for card/tile grids (collection detail, set
 * detail, set search, scan library). ~72ms per 3-column row; the cap keeps
 * far-offscreen initial-batch mounts from queuing long delays.
 */
export const cardWaterfall = (index: number) =>
	FadeInDown.delay(Math.min(index * 24, 360)).duration(220);
