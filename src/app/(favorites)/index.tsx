import { useCallback, useRef, useState } from "react";
import {
	Alert,
	Dimensions,
	Keyboard,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, { FadeIn, FadeOut, ZoomOut } from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiverTheme } from "@/constants/theme";
import { cardWaterfall } from "@/lib/waterfall";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { useFavorites, type Favorite } from "@/hooks/useFavorites";
import { usePrefetchDetail } from "@/hooks/usePrefetchDetail";
import CardImage from "@/components/CardImage";
import CardContextMenu from "@/components/CardContextMenu";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import HeaderIconButton, {
	HeaderButtonGroup,
} from "@/components/HeaderIconButton";

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

const keyOf = (item: Favorite) => `${item.productType}:${item.cardId}`;

export default function Favorites() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const prefetchDetail = usePrefetchDetail();
	const { isPro } = useRevenueCat();
	const { favorites, isLoading, removeFavorites } = useFavorites();
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	// Multi-select. `selecting` swaps tile taps from navigate → toggle and hides
	// the context-menu long-press; `selected` holds the chosen tile keys.
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	// Guard the entrance waterfall so recycled FlatList cells don't replay it on
	// scroll-back (same pattern as the search results grid).
	const animatedIdsRef = useRef<Set<string>>(new Set());

	const exitSelection = useCallback(() => {
		setSelecting(false);
		setSelected(new Set());
	}, []);

	const toggleSelected = useCallback((key: string) => {
		Haptics.selectionAsync();
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const confirmRemove = useCallback(() => {
		const items = favorites
			.filter((f) => selected.has(keyOf(f)))
			.map((f) => ({ cardId: f.cardId, productType: f.productType }));
		if (items.length === 0) return;
		const noun = items.length === 1 ? "favorite" : "favorites";
		Alert.alert(
			`Remove ${items.length} ${noun}?`,
			"This won't delete the cards from any collections.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					style: "destructive",
					onPress: () => {
						Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
						removeFavorites.mutate({ items }, { onSuccess: exitSelection });
					},
				},
			],
		);
	}, [favorites, selected, removeFavorites, exitSelection]);

	// Bulk "Add to Collection" — hands the selection to the shared
	// add-to-collection sheet in its batch mode (comma-joined card ids +
	// images), the same path the scanner library uses. Pro-gated like every
	// other collection entry point.
	const addSelectedToCollection = useCallback(() => {
		const chosen = favorites.filter((f) => selected.has(keyOf(f)));
		if (chosen.length === 0) return;
		if (!isPro) {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			void presentProPaywallIfNeeded();
			return;
		}
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		router.push({
			pathname: "/add-to-collection",
			params: {
				cardIds: chosen.map((f) => f.cardId).join(","),
				cardImages: chosen
					.map((f) => encodeURIComponent(f.cardImageUrl))
					.join(","),
			},
		});
		// Selection is intentionally kept — the user stays in select mode after
		// the sheet dismisses so they can act on the same cards again.
	}, [favorites, selected, isPro]);

	const openCard = useCallback(
		(item: Favorite) => {
			Keyboard.dismiss();
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			prefetchDetail(item.productType, item.cardId);
			const base = item.productType === "sealed" ? "/(sealed)" : "/(card)";
			const imageParam = item.cardImageUrl
				? `&image=${encodeURIComponent(item.cardImageUrl)}`
				: "";
			router.push(
				`${base}/${item.cardId}?name=${encodeURIComponent(item.cardName)}${imageParam}`,
			);
		},
		[prefetchDetail],
	);

	const renderItem = useCallback(
		({ item, index }: { item: Favorite; index: number }) => {
			const key = keyOf(item);
			const isSelected = selected.has(key);
			const showPlaceholder =
				!item.cardImageUrl || failedImages.has(item.cardId);
			const firstAppearance = !animatedIdsRef.current.has(item.cardId);
			if (firstAppearance) animatedIdsRef.current.add(item.cardId);

			const tile = (
				<View>
					{showPlaceholder ? (
						<View
							style={[
								styles.cardImage,
								styles.placeholder,
								{ backgroundColor: t.glass.elevatedFill },
							]}
						>
							<SymbolView
								name="photo"
								size={24}
								tintColor={t.text.tertiary}
								weight="regular"
							/>
							<Text
								style={[styles.placeholderName, { color: t.text.primary }]}
								numberOfLines={2}
							>
								{item.cardName}
							</Text>
							{item.cardNumber && (
								<Text
									style={[
										styles.placeholderNumber,
										{ color: t.text.secondary },
									]}
								>
									#{item.cardNumber}
								</Text>
							)}
						</View>
					) : item.productType === "sealed" ? (
						<View
							style={[
								styles.cardImage,
								styles.sealedTile,
								{ backgroundColor: t.glass.elevatedFill },
							]}
						>
							<CardImage
								uri={item.cardImageUrl}
								style={styles.sealedImage}
								backgroundColor="transparent"
								shimmerColor={t.glass.elevatedFill}
								onError={() =>
									setFailedImages((prev) => new Set(prev).add(item.cardId))
								}
							/>
						</View>
					) : (
						<CardImage
							uri={item.cardImageUrl}
							style={styles.cardImage}
							backgroundColor={t.glass.elevatedFill}
							shimmerColor={t.glass.elevatedFill}
							onError={() =>
								setFailedImages((prev) => new Set(prev).add(item.cardId))
							}
						/>
					)}
					{/* Selection affordances — grey overlay, accent-glowing border,
					    checkmark — matching the collection-detail multiselect. */}
					{selecting && !isSelected && (
						<Animated.View
							entering={FadeIn.duration(180)}
							exiting={FadeOut.duration(150)}
							style={[styles.cardImage, styles.greyOverlay]}
						/>
					)}
					{selecting && isSelected && (
						<View
							style={[
								styles.cardImage,
								styles.selectRing,
								{ borderColor: t.accent },
								t.buttonGlow,
							]}
						/>
					)}
					{selecting && (
						<Animated.View
							// Fades with select mode, like the scan review screen.
							entering={FadeIn.duration(180)}
							exiting={FadeOut.duration(150)}
							style={[
								styles.check,
								isSelected
									? { backgroundColor: t.accent, borderColor: t.accent }
									: {
											backgroundColor: "rgba(0,0,0,0.4)",
											borderColor: "#fff",
										},
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
						</Animated.View>
					)}
				</View>
			);

			return (
				<Animated.View
					entering={firstAppearance ? cardWaterfall(index) : undefined}
					// Removed favorites shrink + fade out, like collection-detail.
					exiting={ZoomOut.duration(200)}
				>
					{selecting ? (
						<Pressable onPress={() => toggleSelected(key)}>{tile}</Pressable>
					) : (
						<CardContextMenu
							card={{
								cardId: item.cardId,
								cardName: item.cardName,
								cardNumber: item.cardNumber,
								setName: item.setName,
								cardImageUrl: item.cardImageUrl || undefined,
								productType: item.productType,
								variant: item.variant,
								condition: item.condition,
							}}
							onPress={() => openCard(item)}
						>
							{tile}
						</CardContextMenu>
					)}
				</Animated.View>
			);
		},
		[t, failedImages, openCard, selecting, selected, toggleSelected],
	);

	const gridTop = insets.top + 24;

	return (
		<View style={styles.container}>
			{/* Header buttons are driven by selection state, so override the inner
			    stack's options locally. */}
			<Stack.Screen
				options={{
					headerTitle: selecting
						? selected.size > 0
							? `${selected.size} Selected`
							: "Select favorites"
						: "Favorites",
					// Close (X) instead of a back chevron — matches the search screen.
					headerLeft: () => (
						<HeaderIconButton
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								if (selecting) exitSelection();
								else router.back();
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
					headerRight: () =>
						selecting ? (
							<HeaderButtonGroup>
								{selected.size > 0 && (
									<>
										<HeaderIconButton onPress={addSelectedToCollection}>
											<SymbolView
												name="folder.badge.plus"
												size={19}
												tintColor={t.accentOn}
												weight="medium"
											/>
										</HeaderIconButton>
										<HeaderIconButton onPress={confirmRemove}>
											<SymbolView
												name="trash"
												size={19}
												tintColor={t.loss}
												weight="medium"
											/>
										</HeaderIconButton>
									</>
								)}
								<HeaderIconButton onPress={exitSelection}>
									<SymbolView
										name="checkmark"
										size={20}
										tintColor={t.accentOn}
										weight="semibold"
									/>
								</HeaderIconButton>
							</HeaderButtonGroup>
						) : (
							<HeaderIconButton
								onPress={() => {
									Haptics.selectionAsync();
									setSelecting(true);
								}}
								disabled={favorites.length === 0}
							>
								<SymbolView
									name="checkmark.circle"
									size={20}
									tintColor={
										favorites.length === 0 ? t.text.tertiary : t.accentOn
									}
									weight="medium"
								/>
							</HeaderIconButton>
						),
				}}
			/>

			{/* Deep-water gradient — the one background every screen shares. */}
			<LinearGradient
				colors={t.background.colors}
				locations={t.background.locations}
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			/>
			{favorites.length === 0 ? (
				isLoading ? null : (
					<View style={[styles.emptyState, { paddingTop: gridTop }]}>
						<SymbolView
							name="star"
							size={44}
							tintColor={t.text.tertiary}
							weight="regular"
						/>
						<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
							No Favorites Yet
						</Text>
						<Text style={[styles.emptySubtitle, { color: t.text.secondary }]}>
							Tap the star on any card to save it here
						</Text>
					</View>
				)
			) : (
				<Animated.FlatList
					entering={FadeIn.duration(200)}
					data={favorites}
					keyExtractor={keyOf}
					numColumns={COLUMNS}
					renderItem={renderItem}
					contentContainerStyle={[styles.grid, { paddingTop: gridTop }]}
					columnWrapperStyle={styles.row}
					showsVerticalScrollIndicator={false}
					removeClippedSubviews
					initialNumToRender={15}
					maxToRenderPerBatch={9}
					windowSize={7}
				/>
			)}

			<HeaderFadeScrim />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	grid: {
		padding: PADDING,
		paddingBottom: 120,
	},
	row: {
		gap: GAP,
		marginBottom: GAP,
	},
	cardImage: {
		width: imageWidth,
		height: imageHeight,
		borderRadius: 8,
	},
	placeholder: {
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 8,
		gap: 4,
	},
	sealedTile: {
		padding: 8,
	},
	sealedImage: {
		flex: 1,
		borderRadius: 4,
	},
	placeholderName: {
		fontSize: 11,
		fontWeight: "600",
		textAlign: "center",
	},
	placeholderNumber: {
		fontSize: 10,
	},
	// Unselected tiles dim so the chosen ones read as lifted.
	greyOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		backgroundColor: "rgba(0,0,0,0.35)",
		zIndex: 1,
	},
	selectRing: {
		position: "absolute",
		top: 0,
		left: 0,
		borderWidth: 3,
		zIndex: 1,
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
		zIndex: 2,
	},
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
		paddingBottom: 120,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: "700",
		marginTop: 8,
	},
	emptySubtitle: {
		fontSize: 15,
		textAlign: "center",
		lineHeight: 21,
	},
});
