import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import {
	Alert,
	Dimensions,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	FadeInDown,
	LinearTransition,
	ZoomOut,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ContextMenu, {
	type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import type { NativeSyntheticEvent } from "react-native";

import { useTheme } from "@/context/ThemeContext";
import { useScanSession, type ScannedCard } from "@/context/ScanSessionContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import CardPressable from "@/components/CardPressable";

// Mirror the set-detail grid so the two screens read the same. imageWidth is
// floored (set-detail gets exact columns from FlatList; a flexWrap grid needs a
// hair of slack or the third tile rounds onto the next row).
const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = Math.floor(
	(screenWidth - PADDING * 2 - GAP * (COLUMNS - 1) - 1) / COLUMNS,
);
const imageHeight = imageWidth * 1.4;

export default function ScanLibraryScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
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

	const handleAddToCollection = useCallback(() => {
		const ids = [...selected];
		if (ids.length === 0) return;
		// Collections are Pro — gate before opening the picker, like the long-press
		// quick-add on search (CardContextMenu).
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
	}, [selected, isPro, scans, exitSelect]);

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
			? `${count} Scanned`
			: "Your Scans";

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<Stack.Screen
				options={{
					headerTitle,
					headerLeft: () => (
						<Pressable
							hitSlop={8}
							style={styles.headerIconBtn}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.back();
							}}
						>
							<Ionicons name="close" size={24} color={colors.foreground} />
						</Pressable>
					),
					headerRight: () => {
						if (count === 0) return null;
						if (!selectMode) {
							return (
								<Pressable
									hitSlop={8}
									style={styles.headerIconBtn}
									onPress={() => {
										Haptics.selectionAsync();
										setSelectMode(true);
									}}
								>
									<Ionicons
										name="checkmark-circle-outline"
										size={25}
										color={colors.foreground}
									/>
								</Pressable>
							);
						}
						return (
							<View style={styles.headerRow}>
								{selected.size > 0 && (
									<ContextMenu
										dropdownMenuMode
										actions={[
											{ title: "Add to Collection", systemIcon: "plus" },
											{ title: "Delete", systemIcon: "trash", destructive: true },
										]}
										onPress={handleMenuPress}
									>
										<View style={styles.headerIconBtn}>
											<Ionicons
												name="ellipsis-horizontal"
												size={22}
												color={colors.foreground}
											/>
										</View>
									</ContextMenu>
								)}
								<Pressable
									hitSlop={8}
									style={styles.headerIconBtn}
									onPress={exitSelect}
								>
									<Ionicons name="checkmark" size={26} color={colors.primary} />
								</Pressable>
							</View>
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
					<Ionicons name="scan-outline" size={48} color={colors.mutedForeground} />
					<Text style={[styles.emptyTitle, { color: colors.foreground }]}>
						No Scans Yet
					</Text>
					<Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
						Point the scanner at a card and it&apos;ll land here.
					</Text>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={[
						styles.grid,
						{
							paddingTop: insets.top + 56,
							paddingBottom: insets.bottom + 24,
						},
					]}
					showsVerticalScrollIndicator={false}
				>
					{scans.map((card, index) => {
						const isSelected = selected.has(card.id);
						return (
							<Animated.View
								key={card.id}
								// Stagger in like set-detail; on removal the card shrinks out
								// and the rest slide up to fill the gap (LinearTransition).
								entering={FadeInDown.delay(Math.min(index * 22, 200)).duration(240)}
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
													? { backgroundColor: colors.primary, borderColor: colors.primary }
													: { backgroundColor: "rgba(0,0,0,0.35)", borderColor: "#fff" },
											]}
										>
											{isSelected && (
												<Ionicons name="checkmark" size={15} color="#fff" />
											)}
										</View>
									)}
								</CardPressable>
							</Animated.View>
						);
					})}
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	headerIconBtn: { padding: 4 },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 10,
	},
	emptyTitle: { fontSize: 20, fontWeight: "700", marginTop: 8 },
	emptySubtitle: { fontSize: 15, textAlign: "center", lineHeight: 21 },
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		padding: PADDING,
		columnGap: GAP,
		rowGap: GAP,
	},
	tile: { width: imageWidth },
	cardImage: { width: imageWidth, height: imageHeight, borderRadius: 8 },
	greyOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		width: imageWidth,
		height: imageHeight,
		borderRadius: 8,
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
