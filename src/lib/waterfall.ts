import { FadeInDown } from "react-native-reanimated";

/**
 * Shared waterfall entrance for card/tile grids (collection detail, set
 * detail, set search, scan library). ~36ms per 3-column row; the cap keeps
 * far-offscreen initial-batch mounts from queuing long delays. (Halved from
 * 24ms/item / 360ms cap — the full cascade read as lag on sort switches.)
 */
export const cardWaterfall = (index: number) =>
	FadeInDown.delay(Math.min(index * 12, 180)).duration(220);
