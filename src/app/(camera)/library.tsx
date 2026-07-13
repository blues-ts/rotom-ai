import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import {
	Alert,
	Dimensions,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	LinearTransition,
	ZoomOut,
} from "react-native-reanimated";
import { cardWaterfall } from "@/lib/waterfall";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ContextMenu, {
	type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import type { NativeSyntheticEvent } from "react-native";

import { spacing, useRiverTheme } from "@/constants/theme";
import { useScanSession, type ScannedCard } from "@/context/ScanSessionContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import CardPressable from "@/components/CardPressable";
import HeaderIconButton, {
	HeaderButtonGroup,
	useHeaderGlassStyle,
} from "@/components/HeaderIconButton";

// Mirror the set-detail grid so the two screens read the same. imageWidth is
// floored (set-detail gets exact columns from FlatList; a flexWrap grid needs a
// hair of slack or the third tile rounds onto the next row).
const COLUMNS = 3;
const GAP = 8;
const PADDING = spacing.screen;
const screenWidth = Dimensions.get("window").width;
const imageWidth = Math.floor(
	(screenWidth - PADDING * 2 - GAP * (COLUMNS - 1) - 1) / COLUMNS,
);
// Card art is always TCG ratio (63:88), never cropped.
const imageHeight = imageWidth * (88 / 63);

export default function ScanLibraryScreen() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const headerGlassStyle = useHeaderGlassStyle(false, true);
	const { isPro } = useRevenueCat();
	const { scans, count, removeScans } = useScanSession();

	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const exitSelect = useCallback(() => {
		setSelectMode(false);
		setSelected(new Set());
	}, []);

	const toggle = useCallback((id: string) => {
		Haptics.selectionAsync();
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const onTilePress = useCallback(
		(card: ScannedCard) => {
			if (selectMode) {
				toggle(card.id);
				return;
			}
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			router.push({
				pathname: "/(card)/[id]",
				params: { id: card.id, image: card.image },
			});
		},
		[selectMode, toggle],
	);

	const handleDelete = useCallback(() => {
		const ids = [...selected];
		if (ids.length === 0) return;
		Alert.alert(
			`Delete ${ids.length} ${ids.length === 1 ? "card" : "cards"}?`,
			"They'll be removed from this scanning session.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						removeScans(ids);
						exitSelect();
					},
				},
			],
		);
	}, [selected, removeScans, exitSelect]);

	const pushAddToCollection = useCallback(
		(ids: string[]) => {
			if (ids.length === 0) return;
			// Collections are Pro — gate before opening the picker, like the
			// long-press quick-add on search (CardContextMenu).
			if (!isPro) {
				void presentProPaywallIfNeeded();
				return;
			}
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			const byId = new Map(scans.map((s) => [s.id, s.image]));
			router.push({
				pathname: "/add-to-collection",
				params: {
					cardIds: ids.join(","),
					cardImages: ids
						.map((id) => encodeURIComponent(byId.get(id) ?? ""))
						.join(","),
				},
			});
			exitSelect();
		},
		[isPro, scans, exitSelect],
	);

	const handleAddToCollection = useCallback(() => {
		pushAddToCollection([...selected]);
	}, [pushAddToCollection, selected]);

	// The screen's primary action: add the whole scanning session at once.
	const handleAddAll = useCallback(() => {
		pushAddToCollection(scans.map((s) => s.id));
	}, [pushAddToCollection, scans]);

	const handleMenuPress = useCallback(
		(e: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
			if (e.nativeEvent.index === 0) handleAddToCollection();
			else if (e.nativeEvent.index === 1) handleDelete();
		},
		[handleAddToCollection, handleDelete],
	);

	const headerTitle = selectMode
		? selected.size > 0
			? `${selected.size} Selected`
			: "Select cards"
		: count > 0
			? `${count} scanned`
			: "Your Scans";

	return (
		<View style={styles.container}>
			{/* Deep-water gradient — the one background every screen shares. */}
			<LinearGradient
				colors={t.background.colors}
				locations={t.background.locations}
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			/>
			<Stack.Screen
				options={{
					headerTitle,
					headerLeft: () => (
						<HeaderIconButton
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.back();
							}}
						>
							<SymbolView
								name="xmark"
								size={20}
								tintColor={t.accentOn}
								weight="medium"
							/>
						</HeaderIconButton>
					),
					headerRight: () => {
						if (count === 0) return null;
						if (!selectMode) {
							return (
								<HeaderIconButton
									onPress={() => {
										Haptics.selectionAsync();
										setSelectMode(true);
									}}
								>
									<SymbolView
										name="checkmark.circle"
										size={22}
										tintColor={t.accentOn}
										weight="medium"
									/>
								</HeaderIconButton>
							);
						}
						return (
							<HeaderButtonGroup>
								{selected.size > 0 && (
									<ContextMenu
										dropdownMenuMode
										actions={[
											{ title: "Add to Collection", systemIcon: "plus" },
											{ title: "Delete", systemIcon: "trash", destructive: true },
										]}
										onPress={handleMenuPress}
									>
										<View style={headerGlassStyle}>
											<SymbolView
												name="ellipsis"
												size={20}
												tintColor={t.accentOn}
												weight="medium"
											/>
										</View>
									</ContextMenu>
								)}
								<HeaderIconButton
									onPress={exitSelect}
								>
									<SymbolView
										name="checkmark"
										size={21}
										tintColor={t.accentOn}
										weight="semibold"
									/>
								</HeaderIconButton>
							</HeaderButtonGroup>
						);
					},
				}}
			/>

			{count === 0 ? (
				<View
					style={[
						styles.empty,
						{ paddingTop: insets.top + 52, paddingBottom: insets.bottom + 24 },
					]}
				>
					<SymbolView
						name="viewfinder"
						size={44}
						tintColor={t.text.tertiary}
						weight="regular"
					/>
					<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
						No Scans Yet
					</Text>
					<Text style={[styles.emptySubtitle, { color: t.text.secondary }]}>
						Point the scanner at a card and it&apos;ll land here.
					</Text>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={[
						styles.grid,
						{
							paddingTop: insets.top + 56,
							// Clear the pinned "Add to collection" button below.
							paddingBottom: insets.bottom + 96,
						},
					]}
					showsVerticalScrollIndicator={false}
				>
					<Text style={[styles.subtitle, { color: t.text.secondary }]}>
						Tap a card to review
					</Text>
					{scans.map((card, index) => {
						const isSelected = selected.has(card.id);
						return (
							<Animated.View
								key={card.id}
								// Stagger in like set-detail; on removal the card shrinks out
								// and the rest slide up to fill the gap (LinearTransition).
								entering={cardWaterfall(index)}
								exiting={ZoomOut.duration(180)}
								layout={LinearTransition.duration(220)}
								style={styles.tile}
							>
								<CardPressable onPress={() => onTilePress(card)}>
									<Image
										source={{ uri: card.image }}
										style={styles.cardImage}
										contentFit="contain"
									/>
									{selectMode && !isSelected && (
										<View style={styles.greyOverlay} />
									)}
									{selectMode && (
										<View
											style={[
												styles.check,
												isSelected
													? { backgroundColor: t.accent, borderColor: t.accent }
													: { backgroundColor: "rgba(0,0,0,0.35)", borderColor: "#fff" },
											]}
										>
											{isSelected && (
												<SymbolView
													name="checkmark"
													size={13}
													tintColor="#FFFFFF"
													weight="bold"
												/>
											)}
										</View>
									)}
								</CardPressable>
							</Animated.View>
						);
					})}
				</ScrollView>
			)}

			{/* Primary action — full-width accent pill with glow, pinned above the
			    home indicator. Hidden in select mode (the header menu takes over). */}
			{count > 0 && !selectMode && (
				<View
					style={[styles.addAllWrap, { paddingBottom: insets.bottom + 12 }]}
					pointerEvents="box-none"
				>
					<CardPressable
						onPress={handleAddAll}
						style={[
							styles.addAllButton,
							{ backgroundColor: t.accent },
							t.buttonGlow,
						]}
					>
						<SymbolView
							name="checkmark"
							size={15}
							tintColor="#FFFFFF"
							weight="semibold"
						/>
						<Text style={styles.addAllText}>
							Add {count} to collection
						</Text>
					</CardPressable>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	emptyTitle: { fontSize: 20, fontWeight: "700", marginTop: 8 },
	emptySubtitle: { fontSize: 15, textAlign: "center", lineHeight: 21 },
	// Full-width line under the native "N scanned" title.
	subtitle: {
		width: "100%",
		textAlign: "center",
		fontSize: 12,
		fontWeight: "500",
		// Clear the transparent header above so it doesn't sit in its shadow.
		marginTop: 8,
		marginBottom: 6,
	},
	addAllWrap: {
		position: "absolute",
		left: spacing.screen,
		right: spacing.screen,
		bottom: 0,
	},
	addAllButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 52,
		borderRadius: 999,
	},
	addAllText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "700",
	},
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		padding: PADDING,
		columnGap: GAP,
		rowGap: GAP,
	},
	tile: { width: imageWidth },
	// No container radius — the artwork's own printed corners do the rounding
	// (matches the card detail screen and the binder review tray).
	cardImage: { width: imageWidth, height: imageHeight },
	greyOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		width: imageWidth,
		height: imageHeight,
		// ≈ the card's printed corner (~4.5% of width) so the dim overlay
		// doesn't show square corners over the art's transparent ones.
		borderRadius: imageWidth * 0.045,
		backgroundColor: "rgba(120,120,120,0.5)",
	},
	check: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 24,
		height: 24,
		borderRadius: 12,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
});
