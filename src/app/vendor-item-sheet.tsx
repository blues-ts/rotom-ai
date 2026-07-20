import { Fragment } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CardPressable from "@/components/CardPressable";
import { useRiverTheme } from "@/constants/theme";
import { formatCurrency } from "@/lib/format";
import { formatCardConfig } from "@/lib/scrydex";
import { useVendorItems } from "@/hooks/useVendorItems";
import type { VendorItem } from "@/types/vendor";

// Same compact thumb as the shelf rows.
const THUMB_WIDTH = 44;
const THUMB_HEIGHT = THUMB_WIDTH * (88 / 63);

/** "$12.34" prompt input → per-unit price, or undefined when unparsable. */
function parsePrice(text: string | undefined): number | undefined {
	if (!text) return undefined;
	const value = parseFloat(text.replace(/[^0-9.]/g, ""));
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Options for one vending item in a NATIVE form sheet — the same presentation
 * as menu-sheet (fitToContents detent, 28pt lip, grabber), replacing the
 * Alert action list. Title (the card name) comes via the route's `title`
 * param, read by the header in _layout; the item itself is looked up from the
 * live query by id, so prices in the summary stay current while the sheet is
 * open (e.g. right after saving an asking price).
 */
export default function VendorItemSheet() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string; title?: string }>();
	const { items, setAskingPrice, markSold, unmarkSold, removeItem } =
		useVendorItems();

	const item = items.find((i) => i.id === id);
	// Removed while open (last mutation's back is in flight) — nothing to show.
	if (!item) return null;

	const promptAskingPrice = (it: VendorItem) => {
		Alert.prompt(
			"Asking price",
			`Market is ${formatCurrency(it.marketValue)}${it.quantity > 1 ? " each" : ""}.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Save",
					onPress: (text?: string) => {
						const price = parsePrice(text);
						if (price === undefined) return;
						Haptics.selectionAsync();
						// Sheet stays up — the summary re-renders with the new price.
						setAskingPrice.mutate({ id: it.id, askingPrice: price });
					},
				},
			],
			"plain-text",
			(it.askingPrice ?? it.marketValue).toFixed(2),
			"decimal-pad",
		);
	};

	const promptMarkSold = (it: VendorItem) => {
		Alert.prompt(
			"Mark sold",
			it.quantity > 1
				? `Sold price per card (×${it.quantity}).`
				: "What did it sell for?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Sold",
					onPress: (text?: string) => {
						const price = parsePrice(text);
						if (price === undefined) return;
						markSold.mutate(
							{ id: it.id, soldPrice: price },
							{ onSuccess: () => router.back() },
						);
					},
				},
			],
			"plain-text",
			(it.askingPrice ?? it.marketValue).toFixed(2),
			"decimal-pad",
		);
	};

	// Open the full card detail screen for this listing. The (card) group is a
	// modal, so pushing it over this formSheet stacks cleanly (same as the
	// pokemon-cards browser). Collection-only params (collectionId, pricePaid)
	// are omitted — a shelf item isn't in a collection.
	const viewCardDetails = (it: VendorItem) => {
		router.push({
			pathname: "/(card)/[id]",
			params: {
				id: it.cardId,
				name: it.cardName,
				...(it.cardImageUrl ? { image: it.cardImageUrl } : {}),
				pricingType: it.pricingType,
				variant: it.variant,
				condition: it.condition,
				gradedCompany: it.gradedCompany ?? "",
				gradedGrade: it.gradedGrade ?? "",
				quantity: String(it.quantity),
			},
		});
	};

	const confirmRemove = (it: VendorItem) => {
		Alert.alert(
			`Remove ${it.cardName}?`,
			it.status === "sold"
				? "This sale will leave your revenue total."
				: "It'll be removed from your table.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					style: "destructive",
					onPress: () => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
						removeItem.mutate(
							{ id: it.id },
							{ onSuccess: () => router.back() },
						);
					},
				},
			],
		);
	};

	const options: {
		label: string;
		icon: string;
		destructive?: boolean;
		onPress: () => void;
	}[] =
		item.status === "listed"
			? [
					{
						label: "View card details",
						icon: "info.circle",
						onPress: () => viewCardDetails(item),
					},
					{
						label: "Set asking price",
						icon: "tag",
						onPress: () => promptAskingPrice(item),
					},
					{
						label: "Mark sold",
						icon: "dollarsign.circle",
						onPress: () => promptMarkSold(item),
					},
					{
						label: "Move to group",
						icon: "folder",
						onPress: () =>
							// Replaces this sheet — iOS won't stack two formSheets,
							// and the picker is the next step of the same gesture.
							router.replace({
								pathname: "/vendor-group-sheet",
								params: { ids: item.id },
							}),
					},
					{
						label: "Remove from table",
						icon: "trash",
						destructive: true,
						onPress: () => confirmRemove(item),
					},
				]
			: [
					{
						label: "View card details",
						icon: "info.circle",
						onPress: () => viewCardDetails(item),
					},
					{
						label: "Undo sale",
						icon: "arrow.uturn.backward",
						onPress: () =>
							unmarkSold.mutate(
								{ id: item.id },
								{ onSuccess: () => router.back() },
							),
					},
					{
						label: "Remove",
						icon: "trash",
						destructive: true,
						onPress: () => confirmRemove(item),
					},
				];

	return (
		<View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
			{/* Card summary — thumb + set line + the two prices the decision
			    hangs on (market vs asking / sold). */}
			<View style={styles.summary}>
				<Image
					source={{ uri: item.cardImageUrl }}
					style={styles.thumb}
					contentFit="contain"
				/>
				<View style={styles.summaryInfo}>
					{(item.setName || item.cardNumber) && (
						<Text
							style={[styles.summarySet, { color: t.text.tertiary }]}
							numberOfLines={1}
						>
							{item.setName}
							{item.cardNumber
								? `${item.setName ? " · " : ""}${item.cardNumber}`
								: ""}
							{item.quantity > 1 ? `  ×${item.quantity}` : ""}
						</Text>
					)}
					{/* Saved variant + condition/grade — the same config subtitle
					    the shelf and recent-sales rows show. */}
					<Text
						style={[styles.summaryConfig, { color: t.text.secondary }]}
						numberOfLines={1}
					>
						{formatCardConfig(item)}
					</Text>
					<Text style={[styles.summaryPrices, { color: t.text.secondary }]}>
						{/* Sold: market value frozen at sale time (the profit/loss
						    basis), not today's market. Listed: live market. */}
						{item.status === "sold" ? "Market at sale " : "Market "}
						{formatCurrency(item.marketValue)}
						{item.status === "listed"
							? item.askingPrice !== undefined
								? ` · Asking ${formatCurrency(item.askingPrice)}`
								: " · No asking price"
							: ` · Sold ${formatCurrency(item.soldPrice ?? 0)}`}
					</Text>
				</View>
			</View>
			{/* Summary and options are different kinds of content — divide. */}
			<View
				style={[styles.divider, { backgroundColor: t.glass.surfaceBorder }]}
			/>

			{options.map((o, idx) => (
				<Fragment key={o.label}>
				{idx > 0 && (
					<View
						style={[
							styles.divider,
							{ backgroundColor: t.glass.surfaceBorder },
						]}
					/>
				)}
				<CardPressable
					pressScale={1}
					baseColor="transparent"
					pressedColor={t.glass.pressedFill}
					style={styles.optionRow}
					onPress={() => {
						Haptics.selectionAsync();
						o.onPress();
					}}
				>
					<View style={styles.optionInner}>
						<Text
							style={[
								styles.optionLabel,
								{ color: o.destructive ? t.loss : t.text.body },
							]}
						>
							{o.label}
						</Text>
						<SymbolView
							name={o.icon as never}
							size={17}
							tintColor={o.destructive ? t.loss : t.text.secondary}
							weight="medium"
						/>
					</View>
				</CardPressable>
				</Fragment>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingTop: 4,
	},
	summary: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 20,
		paddingTop: 8,
		paddingBottom: 14,
	},
	thumb: { width: THUMB_WIDTH, height: THUMB_HEIGHT },
	summaryInfo: { flex: 1, gap: 3 },
	summarySet: { fontSize: 13 },
	summaryConfig: { fontSize: 13, fontWeight: "500" },
	summaryPrices: { fontSize: 14, fontWeight: "500" },
	optionRow: {
		borderRadius: 12,
		marginHorizontal: 8,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginHorizontal: 20,
	},
	optionInner: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 14,
	},
	optionLabel: {
		fontSize: 16,
		fontWeight: "500",
	},
});
