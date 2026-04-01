import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Dimensions,
	FlatList,
	Image,
	Platform,
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
	withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
				scale.value = withSpring(0.95, { damping: 20, stiffness: 300 });
			}}
			onPressOut={() => {
				scale.value = withSpring(1, { damping: 15, stiffness: 200 });
			}}
			onPress={onPress}
		>
			{children}
		</AnimatedPressable>
	);
}

function FadeImage({ uri, style, backgroundColor, shimmerColor, onError }: {
	uri: string;
	style: any;
	backgroundColor: string;
	shimmerColor: string;
	onError: () => void;
}) {
	const opacity = useSharedValue(0);
	const shimmerOpacity = useSharedValue(0.3);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		shimmerOpacity.value = withRepeat(
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

	const shimmerStyle = useAnimatedStyle(() => ({
		opacity: shimmerOpacity.value,
	}));

	return (
		<View style={[style, { backgroundColor, overflow: "hidden" }]}>
			{!loaded && (
				<Animated.View
					style={[StyleSheet.absoluteFill, { backgroundColor: shimmerColor }, shimmerStyle]}
				/>
			)}
			<Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
				<Image
					source={{ uri }}
					style={StyleSheet.absoluteFill}
					resizeMode="contain"
					onLoad={() => {
						setLoaded(true);
						opacity.value = withTiming(1, { duration: 200 });
					}}
					onError={onError}
				/>
			</Animated.View>
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
			style={[
				styles.cardImage,
				{ backgroundColor: color },
				animatedStyle,
			]}
		/>
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

export default function Search() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
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
			const result: SearchResponse = res.data;
			return result;
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
				<Animated.View
					entering={FadeIn.delay(Math.min(index * 30, 300)).duration(200)}
					exiting={FadeOut.duration(100)}
				>
					<CardPressable
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
							<FadeImage
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
	const showHint = !searchQuery.trim() && !isSearching;
	const showSkeleton = isSearching && isLoading;
	const showNoResults = isSearching && !isLoading && cards.length === 0;

	return (
		<>
			<Stack.SearchBar
				placeholder="Search cards..."
				onChangeText={(e) => setSearchQuery(e.nativeEvent.text)}
			/>

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
						contentContainerStyle={[styles.grid, { paddingTop: insets.top + PADDING }]}
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
						contentContainerStyle={[styles.grid, { paddingTop: insets.top + PADDING }]}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
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
});
