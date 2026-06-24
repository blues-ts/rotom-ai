import type { ReactNode } from "react";
import {
	type GestureResponderEvent,
	type NativeSyntheticEvent,
	Pressable,
} from "react-native";
import ContextMenu, {
	type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";

/** The card identity + pricing the quick-add formsheet needs. */
export type QuickAddCard = {
	cardId: string;
	cardName: string;
	cardNumber?: string;
	setName?: string;
	cardImageUrl?: string;
	cardValue?: number;
	productType?: "card" | "sealed";
	// Must be a REAL variant/condition of the card (the card-detail screen's
	// defaults). If these don't match an actual variant, the detail screen
	// silently re-selects a valid one and then can't match the stored row — so
	// the in-collection controls never appear. See set-detail/search callers.
	variant?: string;
	condition?: string;
};

/**
 * Wraps a card tile in a native iOS long-press context menu (the lifted "peek"
 * preview). The single "Add to Collection" action opens the existing
 * /add-to-collection formsheet seeded with this card.
 *
 * The tappable child is a PLAIN Pressable (not a reanimated one): the native
 * context menu reparents/snapshots its child for the lift, and a reanimated
 * `transform` there fights that — leaving the image blanked after dismissal,
 * double-animating, and swallowing the menu's touch-cancellation so a long-press
 * still navigates. A plain Pressable lets the native interaction cancel the tap
 * cleanly, and the no-op `onLongPress` guarantees `onPress` never fires on a hold.
 */
export default function CardContextMenu({
	card,
	onPress,
	borderRadius = 8,
	children,
}: {
	card: QuickAddCard;
	onPress: (e: GestureResponderEvent) => void;
	borderRadius?: number;
	children: ReactNode;
}) {
	const { isPro } = useRevenueCat();

	const handleMenuPress = (
		e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>,
	) => {
		// Only one action today, but guard by index so adding more stays safe.
		if (e.nativeEvent.index !== 0) return;
		// Collections are Pro — gate before opening the picker, like card-detail.
		if (!isPro) {
			void presentProPaywallIfNeeded();
			return;
		}
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		router.push({
			pathname: "/add-to-collection",
			params: {
				cardId: card.cardId,
				cardName: card.cardName,
				cardNumber: card.cardNumber ?? "",
				setName: card.setName ?? "",
				cardImageUrl: card.cardImageUrl ?? "",
				cardValue: String(card.cardValue ?? 0),
				pricingType: "Raw",
				productType: card.productType ?? "card",
				variant: card.variant ?? "normal",
				condition: card.condition ?? "NM",
				gradedCompany: "",
				gradedGrade: "",
			},
		});
	};

	return (
		<ContextMenu
			actions={[{ title: "Add to Collection", systemIcon: "plus" }]}
			onPress={handleMenuPress}
			previewBackgroundColor="transparent"
			borderRadius={borderRadius}
		>
			<Pressable
				onPress={onPress}
				// No-op: presence of onLongPress makes RN treat a hold as a long-press
				// (not a press), so a quick tap navigates but holding to open the menu
				// never fires onPress.
				onLongPress={() => {}}
				// Keep this view out of RN's layout-flattening. The native menu
				// reparents this child for the lifted preview; if Fabric flattens it
				// away, there's nothing to restore on dismiss and the card vanishes.
				collapsable={false}
				// Deliberately NO press-state style: a `({ pressed }) => …` style
				// function re-renders this Pressable on every touch, and after the
				// menu reparents this view that re-render collapses it (the card
				// flickers away on tap). A static tree avoids re-triggering it.
			>
				{children}
			</Pressable>
		</ContextMenu>
	);
}
