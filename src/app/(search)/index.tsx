import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Dimensions,
	FlatList,
	Keyboard,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	FadeIn,
	FadeInDown,
	FadeOut,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
	withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";
import { useApi } from "@/lib/axios";
import { searchCards, searchSealed, searchSets } from "@/lib/api/pricing";
import { buildSearchFallbackQ, buildSearchQ, getCardDisplayName, getCardImage, getCardNumber, getExpansionDisplayName } from "@/lib/scrydex";
import CardImage from "@/components/CardImage";
import ErrorState from "@/components/ErrorState";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import type { ApiListResponse, ScrydexCard, ScrydexExpansion, ScrydexSealedProduct } from "@/types/scrydex";

type SearchMode = "cards" | "sealed";
type SetsLanguage = "EN" | "JA";

const MODE_LABELS: Record<SearchMode, string> = {
	cards: "⭐ Cards",
	sealed: "📦 Sealed",
};

// JA expansions don't index is_online_only:false (same quirk as JA cards),
// so both use the negation form to drop TCG Pocket sets.
const SETS_LANGUAGE_Q: Record<SetsLanguage, string> = {
	EN: "language:English -is_online_only:true",
	JA: "language:Japanese -is_online_only:true",
};

interface CardResult {
	id: string;
	name: string;
	image: string;
	cardNumber: string;
	kind: "card" | "sealed";
}

const SKELETON_DATA = Array.from({ length: 15 }, (_, i) => ({ id: `skeleton-${i}` }));

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;
const setTileWidth = (screenWidth - PADDING * 2 - GAP) / 2;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CardPressable({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<AnimatedPressable
			style={animatedStyle}
			onPressIn={() => {
				scale.value = withTiming(0.96, { duration: 80 });
			}}
			onPressOut={() => {
				scale.value = withTiming(1, { duration: 120 });
			}}
			onPress={onPress}
		>
			{children}
		</AnimatedPressable>
	);
}

function SkeletonCard({ color }: { color: string }) {
	const opacity = useSharedValue(0.3);

	useEffect(() => {
		opacity.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, []);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			style={[
				styles.cardImage,
				{ backgroundColor: color },
				animatedStyle,
			]}
		/>
	);
}

function SkeletonSetTile({ color }: { color: string }) {
	const opacity = useSharedValue(0.3);

	useEffect(() => {
		opacity.value = withRepeat(
			withSequence(
				withTiming(0.7, { duration: 800 }),
				withTiming(0.3, { duration: 800 }),
			),
			-1,
		);
	}, []);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}));

	return (
		<Animated.View style={[styles.setTileSkeleton, animatedStyle]}>
			<View style={[styles.setLogoSkeleton, { backgroundColor: color }]} />
			<View style={[styles.setNameSkeleton, { backgroundColor: color }]} />
		</Animated.View>
	);
}

function LoadingSpinner({ color }: { color: string }) {
	const dot1 = useSharedValue(0);
	const dot2 = useSharedValue(0);
	const dot3 = useSharedValue(0);

	useEffect(() => {
		dot1.value = withRepeat(
			withSequence(
				withTiming(-8, { duration: 300 }),
				withTiming(0, { duration: 300 }),
			),
			-1,
		);
		dot2.value = withRepeat(
			withSequence(
				withTiming(0, { duration: 150 }),
				withTiming(-8, { duration: 300 }),
				withTiming(0, { duration: 300 }),
			),
			-1,
		);
		dot3.value = withRepeat(
			withSequence(
				withTiming(0, { duration: 300 }),
				withTiming(-8, { duration: 300 }),
				withTiming(0, { duration: 300 }),
			),
			-1,
		);
	}, []);

	const style1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
	const style2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
	const style3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

	return (
		<View style={styles.spinnerRow}>
			<Animated.View style={[styles.dot, { backgroundColor: color }, style1]} />
			<Animated.View style={[styles.dot, { backgroundColor: color }, style2]} />
			<Animated.View style={[styles.dot, { backgroundColor: color }, style3]} />
		</View>
	);
}

function SetsBrowser({ mode, language }: { mode: SearchMode; language: SetsLanguage }) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const api = useApi();

	const { data: sets, isLoading, isError, refetch } = useQuery({
		queryKey: ["expansions", language],
		queryFn: async () => {
			// Physical sets only (~180 EN / ~220 JA); fetch every page up
			// front so browsing and the local name filter are instant.
			const q = SETS_LANGUAGE_Q[language];
			const first = await searchSets(api, { q, pageSize: 100, orderBy: "-release_date" });
			const all = [...first.data];
			let page = 2;
			while (all.length < first.total_count && page <= 5) {
				const next = await searchSets(api, {
					q,
					page,
					pageSize: 100,
					orderBy: "-release_date",
				});
				if (next.data.length === 0) break;
				all.push(...next.data);
				page += 1;
			}
			return all;
		},
		staleTime: Infinity,
	});

	const filtered = sets ?? [];

	const renderSet = useCallback(
		({ item, index }: { item: ScrydexExpansion; index: number }) => (
			<Animated.View
				entering={FadeInDown.delay(Math.min(index * 35, 400))
					.duration(380)
					.springify()
					.damping(60)}
			>
				<CardPressable
					onPress={() => {
						Keyboard.dismiss();
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push({
							pathname: "/set-detail",
							params: {
								id: item.id,
								name: getExpansionDisplayName(item),
								mode,
								releaseDate: item.release_date ?? "",
								total: item.total !== undefined ? String(item.total) : "",
								logo: item.logo ?? "",
							},
						});
					}}
				>
					<View
						style={[
							styles.setTile,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<View style={styles.setLogoBox}>
							{item.logo ? (
								<Image
									source={{ uri: item.logo }}
									style={styles.setLogo}
									contentFit="contain"
									transition={150}
									cachePolicy="memory-disk"
								/>
							) : (
								<Ionicons
									name="albums-outline"
									size={28}
									color={colors.mutedForeground}
								/>
							)}
						</View>
						<Text
							style={[styles.setName, { color: colors.foreground }]}
							numberOfLines={1}
						>
							{getExpansionDisplayName(item)}
						</Text>
					</View>
				</CardPressable>
			</Animated.View>
		),
		[colors, mode],
	);

	if (isError) {
		return <ErrorState title="Couldn't load sets" onRetry={() => refetch()} />;
	}

	if (isLoading) {
		return (
			<FlatList
				data={Array.from({ length: 12 }, (_, i) => ({ id: `s-${i}` }))}
				keyExtractor={(item) => item.id}
				numColumns={2}
				renderItem={() => <SkeletonSetTile color={colors.border} />}
				contentContainerStyle={[styles.grid, { paddingTop: insets.top + 56 }]}
				columnWrapperStyle={styles.row}
				scrollEnabled={false}
			/>
		);
	}

	if (filtered.length === 0) {
		return (
			<Text style={[styles.empty, { color: colors.mutedForeground, marginTop: insets.top + 20 }]}>
				No sets found
			</Text>
		);
	}

	return (
		<FlatList
			key={language}
			data={filtered}
			keyExtractor={(item) => item.id}
			numColumns={2}
			renderItem={renderSet}
			contentContainerStyle={[styles.grid, { paddingTop: insets.top + 56 }]}
			columnWrapperStyle={styles.row}
			showsVerticalScrollIndicator={false}
			keyboardDismissMode="on-drag"
			keyboardShouldPersistTaps="handled"
		/>
	);
}

export default function Search() {
	const { colors } = useTheme();
	const { isPro } = useRevenueCat();
	const insets = useSafeAreaInsets();
	const api = useApi();
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [mode, setMode] = useState<SearchMode>("cards");
	const [setsLanguage, setSetsLanguage] = useState<SetsLanguage>("EN");
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	// Debounce search input
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(searchQuery);
		}, 400);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	const {
		data,
		isLoading,
		isError,
		refetch,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery<ApiListResponse<ScrydexCard | ScrydexSealedProduct>>({
		queryKey: ["searchCards", mode, debouncedQuery],
		queryFn: async ({ pageParam }) => {
			const page = pageParam as number;
			const search = mode === "sealed" ? searchSealed : searchCards;
			const primary = await search(api, {
				q: buildSearchQ(debouncedQuery),
				page,
				pageSize: 30,
			});
			if (primary.total_count > 0) return primary;
			// Prefix search only matches printed names — retry fieldless so
			// English terms can match translations of Japanese cards.
			const fallbackQ = buildSearchFallbackQ(debouncedQuery);
			if (!fallbackQ) return primary;
			return search(api, { q: fallbackQ, page, pageSize: 30 });
		},
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page * lastPage.page_size < lastPage.total_count
				? lastPage.page + 1
				: undefined,
		enabled: buildSearchQ(debouncedQuery).length > 0,
	});

	const cards = useMemo<CardResult[]>(
		() =>
			data?.pages.flatMap((p) =>
				p.data.map((item) => ({
					id: item.id,
					// Japanese cards display their English translation when available
					name: "number" in item ? getCardDisplayName(item) : item.name,
					image: getCardImage(item, undefined, "small") ?? "",
					// Sealed products have no card number
					cardNumber: "number" in item ? getCardNumber(item) : "",
					kind: ("number" in item ? "card" : "sealed") as CardResult["kind"],
				})),
			) ?? [],
		[data],
	);

	// Keep a snapshot of the last non-empty results so we can fade them out
	const [displayCards, setDisplayCards] = useState<CardResult[]>([]);
	const [isClearing, setIsClearing] = useState(false);
	const clearOpacity = useSharedValue(1);

	useEffect(() => {
		if (cards.length > 0) {
			setDisplayCards(cards);
			setIsClearing(false);
			clearOpacity.value = 1;
		} else if (displayCards.length > 0 && !searchQuery.trim()) {
			// Search was cleared — fade out
			setIsClearing(true);
			clearOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
				if (finished) {
					runOnJS(setDisplayCards)([]);
					runOnJS(setIsClearing)(false);
				}
			});
		} else if (!isClearing) {
			setDisplayCards([]);
		}
	}, [cards, searchQuery]);

	const clearAnimatedStyle = useAnimatedStyle(() => ({
		opacity: clearOpacity.value,
	}));

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const renderItem = useCallback(
		({ item, index }: { item: CardResult; index: number }) => {
			const showPlaceholder = !item.image || failedImages.has(item.id);
			return (
				<Animated.View
					entering={FadeIn.delay(Math.min(index * 30, 300)).duration(200)}
					exiting={FadeOut.duration(100)}
				>
					<CardPressable
						onPress={() => {
							Keyboard.dismiss();
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							const base = item.kind === "sealed" ? "/(sealed)" : "/(card)";
							router.push(`${base}/${item.id}?name=${encodeURIComponent(item.name)}`);
						}}
					>
						{showPlaceholder ? (
							<View style={[styles.cardImage, styles.placeholder, { backgroundColor: colors.card }]}>
								<Ionicons name="image-outline" size={24} color={colors.mutedForeground} />
								<Text style={[styles.placeholderName, { color: colors.foreground }]} numberOfLines={2}>
									{item.name}
								</Text>
								{item.cardNumber && (
									<Text style={[styles.placeholderNumber, { color: colors.mutedForeground }]}>
										#{item.cardNumber}
									</Text>
								)}
							</View>
						) : item.kind === "sealed" ? (
							// Sealed art comes in arbitrary aspect ratios — inset it on the
							// tile background so the tile keeps the same card silhouette.
							<View style={[styles.cardImage, styles.sealedTile, { backgroundColor: colors.card }]}>
								<CardImage
									uri={item.image}
									style={styles.sealedImage}
									backgroundColor="transparent"
									shimmerColor={colors.border}
									onError={() => {
										setFailedImages((prev) => new Set(prev).add(item.id));
									}}
								/>
							</View>
						) : (
							<CardImage
								uri={item.image}
								style={styles.cardImage}
								backgroundColor={colors.card}
								shimmerColor={colors.border}
								onError={() => {
									setFailedImages((prev) => new Set(prev).add(item.id));
								}}
							/>
						)}
					</CardPressable>
				</Animated.View>
			);
		},
		[colors.card, colors.foreground, colors.mutedForeground, failedImages],
	);

	const isSearching = debouncedQuery.trim().length > 0;
	const showHint = !searchQuery.trim() && !isSearching && displayCards.length === 0;
	const showSkeleton = isSearching && isLoading && displayCards.length === 0;
	const showError = isSearching && isError && displayCards.length === 0;
	const showNoResults = isSearching && !isLoading && !isError && cards.length === 0 && displayCards.length === 0;

	return (
		<>
			<Stack.SearchBar
				placeholder="Search cards..."
				onChangeText={(e) => setSearchQuery(e.nativeEvent.text)}
				onCancelButtonPress={() => router.back()}
			/>

			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon="camera"
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						if (!isPro) {
							void presentProPaywallIfNeeded();
							return;
						}
						router.push("/(camera)");
					}}
				/>
			</Stack.Toolbar>

			<Stack.Toolbar placement="bottom">
				<Stack.Toolbar.SearchBarSlot />
				<Stack.Toolbar.Menu icon="line.3.horizontal.decrease.circle">
					<Stack.Toolbar.MenuAction
						isOn={mode === "cards"}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setMode("cards");
						}}
					>
						{MODE_LABELS.cards}
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						isOn={mode === "sealed"}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setMode("sealed");
						}}
					>
						{MODE_LABELS.sealed}
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						isOn={setsLanguage === "EN"}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setSetsLanguage("EN");
						}}
					>
						🇺🇸 English Sets
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						isOn={setsLanguage === "JA"}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setSetsLanguage("JA");
						}}
					>
						🇯🇵 Japanese Sets
					</Stack.Toolbar.MenuAction>
				</Stack.Toolbar.Menu>
			</Stack.Toolbar>

			<View
				style={[styles.container, { backgroundColor: colors.background }]}
			>
				{/* Sets browser is the default content until the user types */}
				{showHint && (
					<Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
						<SetsBrowser mode={mode} language={setsLanguage} />
					</Animated.View>
				)}
				{showSkeleton && (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => <SkeletonCard color={colors.border} />}
						contentContainerStyle={[styles.grid, { paddingTop: insets.top + PADDING }]}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				)}
				{showError && (
					<Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
						<ErrorState
							title="Search failed"
							onRetry={() => refetch()}
						/>
					</Animated.View>
				)}
				{showNoResults && (
					<Text style={[styles.empty, { color: colors.mutedForeground, marginTop: insets.top + 20 }]}>
						{mode === "sealed" ? "No products found" : "No cards found"}
					</Text>
				)}
				{displayCards.length > 0 && (
					<Animated.View
						style={[{ flex: 1 }, clearAnimatedStyle]}
					>
					<FlatList
						data={displayCards}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={renderItem}
						contentContainerStyle={[styles.grid, { paddingTop: insets.top + PADDING }]}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="on-drag"
						keyboardShouldPersistTaps="handled"
						onEndReached={handleEndReached}
						onEndReachedThreshold={0.5}
						ListFooterComponent={
							isFetchingNextPage ? (
								<Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)} style={styles.footer}>
									<LoadingSpinner color={colors.mutedForeground} />
								</Animated.View>
							) : !hasNextPage && cards.length > 0 ? (
								<Text style={[styles.endText, { color: colors.mutedForeground }]}>
									No more results
								</Text>
							) : null
						}
					/>
					</Animated.View>
				)}
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	hint: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		paddingBottom: 80,
	},
	hintText: {
		fontSize: 16,
		textAlign: "center",
	},
	empty: {
		textAlign: "center",
		marginTop: 40,
		fontSize: 16,
	},
	grid: {
		padding: PADDING,
		paddingTop: 20,
		paddingBottom: 75,
	},
	row: {
		gap: GAP,
		marginBottom: GAP,
	},
	skeletonRow: {
		flexDirection: "row",
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
	footer: {
		alignItems: "center",
		paddingVertical: 20,
	},
	spinnerRow: {
		flexDirection: "row",
		gap: 6,
		alignItems: "center",
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	endText: {
		textAlign: "center",
		marginTop: 20,
		marginBottom: 10,
		fontSize: 14,
	},
	setTile: {
		width: setTileWidth,
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		alignItems: "center",
	},
	setLogoBox: {
		height: 56,
		alignSelf: "stretch",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 8,
	},
	setLogo: {
		width: "90%",
		height: 56,
	},
	setName: {
		fontSize: 13,
		fontWeight: "700",
		textAlign: "center",
	},
	// Skeleton mirroring the set tile layout: logo box + name line
	setTileSkeleton: {
		width: setTileWidth,
		borderRadius: 12,
		padding: 12,
		alignItems: "center",
	},
	setLogoSkeleton: {
		height: 56,
		alignSelf: "stretch",
		borderRadius: 8,
		marginBottom: 8,
	},
	setNameSkeleton: {
		height: 14,
		width: "70%",
		borderRadius: 4,
	},
});
