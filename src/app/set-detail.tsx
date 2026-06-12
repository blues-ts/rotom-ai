import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActionSheetIOS,
	Dimensions,
	FlatList,
	Keyboard,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTheme } from "@/context/ThemeContext";
import { useApi } from "@/lib/axios";
import { searchCards } from "@/lib/api/pricing";
import { buildSetCardsQ, getCardImage, getCardNumber, toNumber } from "@/lib/scrydex";
import CardImage from "@/components/CardImage";
import ErrorState from "@/components/ErrorState";
import type { ApiListResponse, ScrydexCard } from "@/types/scrydex";

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

const SKELETON_DATA = Array.from({ length: 15 }, (_, i) => ({ id: `skeleton-${i}` }));

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SortOption = "number" | "numberDesc" | "nameAsc" | "valueDesc" | "valueAsc";

const SORT_LABELS: Record<SortOption, string> = {
	number: "Number (low to high)",
	numberDesc: "Number (high to low)",
	nameAsc: "Name (A–Z)",
	valueDesc: "Value (high to low)",
	valueAsc: "Value (low to high)",
};

// Scrydex order_by silently ignores price fields, so number/name sorts run
// server-side while value sorts fetch the whole set with prices and sort here.
const SORT_ORDER_BY: Record<string, string> = {
	number: "number",
	numberDesc: "-number",
	nameAsc: "name",
};

/** Sort value: the card's NM market price (highest NM across variants). */
function cardSortValue(card: ScrydexCard): number {
	let best = 0;
	for (const v of card.variants ?? []) {
		for (const p of v.prices ?? []) {
			if (p.type !== "raw" || p.condition !== "NM" || p.currency !== "USD")
				continue;
			if (p.is_signed || p.is_error || p.is_perfect) continue;
			const value = toNumber(p.market) ?? 0;
			if (value > best) best = value;
		}
	}
	return best;
}

function CardPressable({
	children,
	onPress,
}: {
	children: React.ReactNode;
	onPress: () => void;
}) {
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
			style={[styles.cardImage, { backgroundColor: color }, animatedStyle]}
		/>
	);
}

export default function SetDetail() {
	const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
	const { colors, theme } = useTheme();
	const api = useApi();
	const [filterQuery, setFilterQuery] = useState("");
	const [debouncedFilter, setDebouncedFilter] = useState("");
	const [sortBy, setSortBy] = useState<SortOption>("number");
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	const sortScale = useSharedValue(1);
	const sortAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: sortScale.value }],
	}));

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedFilter(filterQuery);
		}, 350);
		return () => clearTimeout(timer);
	}, [filterQuery]);

	const isValueSort = sortBy === "valueDesc" || sortBy === "valueAsc";

	const {
		data,
		isLoading: pagedLoading,
		isError: pagedError,
		refetch: refetchPaged,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery<ApiListResponse<ScrydexCard>>({
		queryKey: ["setCards", id, debouncedFilter, sortBy],
		queryFn: ({ pageParam }) =>
			searchCards(api, {
				q: buildSetCardsQ(id, debouncedFilter),
				page: pageParam as number,
				pageSize: 60,
				orderBy: SORT_ORDER_BY[sortBy],
			}),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page * lastPage.page_size < lastPage.total_count
				? lastPage.page + 1
				: undefined,
		enabled: !!id && !isValueSort,
	});

	// Value sorting: Scrydex can't order by price, so pull the whole set
	// (with prices) once and sort locally. Sets top out around ~300 cards.
	const {
		data: allCards,
		isLoading: allLoading,
		isError: allError,
		refetch: refetchAll,
	} = useQuery({
		queryKey: ["setCardsAll", id, debouncedFilter],
		queryFn: async () => {
			const q = buildSetCardsQ(id, debouncedFilter);
			const first = await searchCards(api, {
				q,
				pageSize: 100,
				includePrices: true,
			});
			const all = [...first.data];
			let page = 2;
			while (all.length < first.total_count && page <= 6) {
				const next = await searchCards(api, {
					q,
					page,
					pageSize: 100,
					includePrices: true,
				});
				if (next.data.length === 0) break;
				all.push(...next.data);
				page += 1;
			}
			return all;
		},
		enabled: !!id && isValueSort,
		staleTime: 5 * 60 * 1000,
	});

	const isLoading = isValueSort ? allLoading : pagedLoading;
	const isError = isValueSort ? allError : pagedError;
	const refetch = isValueSort ? refetchAll : refetchPaged;

	const cards = useMemo(() => {
		if (isValueSort) {
			const sorted = (allCards ?? [])
				.slice()
				.sort((a, b) => cardSortValue(b) - cardSortValue(a));
			return sortBy === "valueAsc" ? sorted.reverse() : sorted;
		}
		return data?.pages.flatMap((p) => p.data) ?? [];
	}, [isValueSort, allCards, sortBy, data]);

	const handleEndReached = useCallback(() => {
		if (!isValueSort && hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [isValueSort, hasNextPage, isFetchingNextPage, fetchNextPage]);

	const renderItem = useCallback(
		({ item, index }: { item: ScrydexCard; index: number }) => {
			const image = getCardImage(item, undefined, "small") ?? "";
			const cardNumber = getCardNumber(item);
			const showPlaceholder = !image || failedImages.has(item.id);
			return (
				<Animated.View
					entering={FadeIn.delay(Math.min(index * 20, 240)).duration(200)}
				>
					<CardPressable
						onPress={() => {
							Keyboard.dismiss();
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.push(
								`/(card)/${item.id}?name=${encodeURIComponent(item.name)}`,
							);
						}}
					>
						{showPlaceholder ? (
							<View
								style={[
									styles.cardImage,
									styles.placeholder,
									{ backgroundColor: colors.card },
								]}
							>
								<Ionicons
									name="image-outline"
									size={24}
									color={colors.mutedForeground}
								/>
								<Text
									style={[styles.placeholderName, { color: colors.foreground }]}
									numberOfLines={2}
								>
									{item.name}
								</Text>
								{!!cardNumber && (
									<Text
										style={[
											styles.placeholderNumber,
											{ color: colors.mutedForeground },
										]}
									>
										#{cardNumber}
									</Text>
								)}
							</View>
						) : (
							<CardImage
								uri={image}
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
		[colors, failedImages],
	);

	return (
		<>
			<Stack.Screen
				options={{
					headerTitle: name ?? "Set",
					headerLeft: () => (
						<Pressable
							hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								router.back();
							}}
						>
							<Ionicons name="close" size={24} color={colors.foreground} />
						</Pressable>
					),
				}}
			/>

			<View style={[styles.container, { backgroundColor: colors.background }]}>
				{/* Filter + sort row */}
				<View style={styles.filterContainer}>
					<View
						style={[
							styles.filterBar,
							styles.filterBarFlex,
							{ backgroundColor: colors.card, borderColor: colors.border },
						]}
					>
						<Ionicons name="search" size={18} color={colors.mutedForeground} />
						<TextInput
							style={[styles.filterInput, { color: colors.foreground }]}
							placeholder="Search this set..."
							placeholderTextColor={colors.mutedForeground}
							value={filterQuery}
							onChangeText={setFilterQuery}
							returnKeyType="search"
						/>
						{filterQuery.length > 0 && (
							<Pressable onPress={() => setFilterQuery("")} hitSlop={8}>
								<Ionicons
									name="close-circle"
									size={18}
									color={colors.mutedForeground}
								/>
							</Pressable>
						)}
					</View>
					<AnimatedPressable
						onPressIn={() => {
							sortScale.value = withTiming(0.9, { duration: 80 });
						}}
						onPressOut={() => {
							sortScale.value = withTiming(1, { duration: 140 });
						}}
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							if (Platform.OS !== "ios") return;
							const opts = Object.keys(SORT_LABELS) as SortOption[];
							ActionSheetIOS.showActionSheetWithOptions(
								{
									title: "Sort by",
									options: [
										...opts.map((o) =>
											sortBy === o ? `✓  ${SORT_LABELS[o]}` : SORT_LABELS[o],
										),
										"Cancel",
									],
									cancelButtonIndex: opts.length,
									userInterfaceStyle: theme === "dark" ? "dark" : "light",
								},
								(idx) => {
									if (idx < opts.length) setSortBy(opts[idx]);
								},
							);
						}}
						style={[
							styles.sortButton,
							{ backgroundColor: colors.card, borderColor: colors.border },
							sortAnimatedStyle,
						]}
					>
						<Ionicons name="swap-vertical" size={20} color={colors.primary} />
					</AnimatedPressable>
				</View>

				{isError ? (
					<ErrorState title="Couldn't load set" onRetry={() => refetch()} />
				) : isLoading ? (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => <SkeletonCard color={colors.border} />}
						contentContainerStyle={styles.grid}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				) : cards.length === 0 ? (
					<View style={styles.emptyState}>
						<Ionicons
							name="search-outline"
							size={48}
							color={colors.mutedForeground}
						/>
						<Text style={[styles.emptyTitle, { color: colors.foreground }]}>
							No matching cards
						</Text>
					</View>
				) : (
					<FlatList
						data={cards}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={renderItem}
						contentContainerStyle={styles.grid}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="on-drag"
						keyboardShouldPersistTaps="handled"
						onEndReached={handleEndReached}
						onEndReachedThreshold={0.5}
						ListFooterComponent={
							isFetchingNextPage ? (
								<Animated.View
									entering={FadeIn.duration(200)}
									exiting={FadeOut.duration(300)}
									style={styles.footer}
								>
									<LoadingSpinner color={colors.mutedForeground} />
								</Animated.View>
							) : null
						}
					/>
				)}
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	filterContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 8,
	},
	filterBar: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 12,
		height: 40,
		gap: 8,
	},
	filterBarFlex: {
		flex: 1,
	},
	sortButton: {
		width: 40,
		height: 40,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	filterInput: {
		flex: 1,
		fontSize: 15,
		height: 40,
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
	grid: {
		padding: PADDING,
		paddingBottom: 40,
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
	placeholderName: {
		fontSize: 11,
		fontWeight: "600",
		textAlign: "center",
	},
	placeholderNumber: {
		fontSize: 10,
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
});
