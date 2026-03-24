import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Dimensions,
	FlatList,
	Image,
	Pressable,
	StyleSheet,
	Text,
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
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTheme } from "@/context/ThemeContext";
import { useApi } from "@/lib/axios";

interface CardResult {
	id: string;
	name: string;
	image: string;
	cardNumber: string;
}

interface SearchResponse {
	success: boolean;
	data: CardResult[];
	pagination: {
		hasMore: boolean;
		nextCursor: string | null;
		count: number;
	};
}

const SKELETON_DATA = Array.from({ length: 15 }, (_, i) => ({ id: `skeleton-${i}` }));

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

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

export default function Search() {
	const { colors } = useTheme();
	const api = useApi();
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
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
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery<SearchResponse>({
		queryKey: ["searchCards", debouncedQuery],
		queryFn: async ({ pageParam }) => {
			const params: Record<string, string | number> = {
				search: debouncedQuery,
				limit: 20,
				game: "pokemon",
			};
			if (pageParam) params.cursor = pageParam as string;
			const res = await api.get("/api/pricing/cards", { params });
			return res.data;
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) =>
			lastPage.pagination.hasMore ? lastPage.pagination.nextCursor ?? undefined : undefined,
		enabled: debouncedQuery.trim().length > 0,
	});

	const cards = useMemo(
		() => data?.pages.flatMap((p) => p.data) ?? [],
		[data],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) {
			fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const renderItem = useCallback(
		({ item, index }: { item: CardResult; index: number }) => {
			const showPlaceholder = !item.image || failedImages.has(item.id);
			return (
				<Animated.View entering={FadeIn.delay(index * 30).duration(150)} exiting={FadeOut.duration(100)}>
					<Pressable
						onPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.push(`/(card)/${item.id}?name=${encodeURIComponent(item.name)}`);
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
						) : (
							<Image
								source={{ uri: item.image }}
								style={[styles.cardImage, { backgroundColor: colors.card }]}
								resizeMode="contain"
								onError={() => {
									setFailedImages((prev) => new Set(prev).add(item.id));
								}}
							/>
						)}
					</Pressable>
				</Animated.View>
			);
		},
		[colors.card, colors.foreground, colors.mutedForeground, failedImages],
	);

	const isSearching = debouncedQuery.trim().length > 0;
	const showHint = !searchQuery.trim() && !isSearching;
	const showSkeleton = isSearching && isLoading;
	const showNoResults = isSearching && !isLoading && cards.length === 0;

	return (
		<>
			<Stack.SearchBar
				placeholder="Search cards..."
				onChangeText={(e) => setSearchQuery(e.nativeEvent.text)}
			/>

			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.back();
					}}
				/>
			</Stack.Toolbar>

			<Stack.Toolbar placement="bottom">
				<Stack.Toolbar.SearchBarSlot />
			</Stack.Toolbar>

			<View
				style={[styles.container, { backgroundColor: colors.background }]}
			>
				{showHint && (
					<View style={styles.hint}>
						<Ionicons name="search" size={40} color={colors.mutedForeground} />
						<Text style={[styles.hintText, { color: colors.mutedForeground }]}>
							Search over 27,000 Pokemon cards
						</Text>
					</View>
				)}
				{showSkeleton && (
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={() => <SkeletonCard color={colors.border} />}
						contentContainerStyle={styles.grid}
						columnWrapperStyle={styles.row}
						scrollEnabled={false}
					/>
				)}
				{showNoResults && (
					<Text style={[styles.empty, { color: colors.mutedForeground }]}>
						No cards found
					</Text>
				)}
				{cards.length > 0 && (
					<FlatList
						data={cards}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={renderItem}
						contentContainerStyle={styles.grid}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
						bounces={hasNextPage !== false}
						onEndReached={handleEndReached}
						onEndReachedThreshold={0.5}
						ListFooterComponent={null}
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
		paddingBottom: 100,
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
	placeholderName: {
		fontSize: 11,
		fontWeight: "600",
		textAlign: "center",
	},
	placeholderNumber: {
		fontSize: 10,
	},
});
