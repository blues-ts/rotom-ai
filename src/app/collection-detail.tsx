import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Alert,
	Dimensions,
	FlatList,
	Image,
	Keyboard,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";
import {
	useCollectionCards,
	useCollectionDetail,
	useCollections,
} from "@/hooks/useCollections";
import type { CollectionCard } from "@/types/collection";

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

function FadeImage({
	uri,
	style,
	backgroundColor,
	shimmerColor,
}: {
	uri: string;
	style: any;
	backgroundColor: string;
	shimmerColor: string;
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
					style={[
						StyleSheet.absoluteFill,
						{ backgroundColor: shimmerColor },
						shimmerStyle,
					]}
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
				/>
			</Animated.View>
		</View>
	);
}

function formatPrice(value: number): string {
	return `$${value.toFixed(2)}`;
}

export default function CollectionDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { colors } = useTheme();
	const { renameCollection } = useCollections();
	const { data: collection } = useCollectionDetail(id);
	const { data: cards } = useCollectionCards(id);
	const [filterQuery, setFilterQuery] = useState("");

	const filteredCards = useMemo(() => {
		if (!cards) return [];
		if (!filterQuery.trim()) return cards;
		const q = filterQuery.toLowerCase();
		return cards.filter((c) => c.cardName.toLowerCase().includes(q));
	}, [cards, filterQuery]);

	const handleRename = useCallback(() => {
		if (!collection) return;
		Alert.prompt(
			"Rename Collection",
			"Enter a new name for this collection",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Save",
					onPress: (name: string | undefined) => {
						if (name?.trim()) {
							renameCollection.mutate({ id, name: name.trim() });
						}
					},
				},
			],
			"plain-text",
			collection.name,
		);
	}, [collection, id, renameCollection]);

	const renderItem = useCallback(
		({ item, index }: { item: CollectionCard; index: number }) => (
			<Animated.View
				entering={FadeIn.delay(Math.min(index * 30, 300)).duration(200)}
			>
				<CardPressable
					onPress={() => {
						Keyboard.dismiss();
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push({
							pathname: `/(card)/${item.cardId}`,
							params: {
								name: item.cardName,
								pricingType: item.pricingType,
								source: item.source,
								condition: item.condition,
								gradedCompany: item.gradedCompany ?? "",
								gradedGrade: item.gradedGrade ?? "",
								collectionId: item.collectionId,
								quantity: String(item.quantity),
							},
						});
					}}
				>
					{item.cardImageUrl ? (
						<FadeImage
							uri={item.cardImageUrl}
							style={styles.cardImage}
							backgroundColor={colors.card}
							shimmerColor={colors.border}
						/>
					) : (
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
								style={[
									styles.placeholderName,
									{ color: colors.foreground },
								]}
								numberOfLines={2}
							>
								{item.cardName}
							</Text>
						</View>
					)}
				</CardPressable>
			</Animated.View>
		),
		[colors],
	);

	return (
		<>
			<Stack.Screen
				options={{
					headerShown: true,
					headerTitle: collection?.name ?? "",
					headerBackButtonDisplayMode: "minimal",
					headerStyle: { backgroundColor: colors.background },
					headerTintColor: colors.foreground,
					headerShadowVisible: false,
					headerRight: () => (
						<View style={styles.headerRight}>
							<Pressable
								onPress={() => {
									Haptics.impactAsync(
										Haptics.ImpactFeedbackStyle.Light,
									);
									handleRename();
								}}
								style={styles.headerButton}
							>
								<Ionicons
									name="pencil-outline"
									size={20}
									color={colors.foreground}
								/>
							</Pressable>
							<Pressable
								onPress={() => {
									Haptics.impactAsync(
										Haptics.ImpactFeedbackStyle.Light,
									);
									router.push("/(search)");
								}}
								style={styles.headerButton}
							>
								<Ionicons
									name="add"
									size={26}
									color={colors.foreground}
								/>
							</Pressable>
						</View>
					),
				}}
			/>

			<View style={[styles.container, { backgroundColor: colors.background }]}>
				{/* Filter bar */}
				<View style={styles.filterContainer}>
					<View
						style={[
							styles.filterBar,
							{
								backgroundColor: colors.card,
								borderColor: colors.border,
							},
						]}
					>
						<Ionicons
							name="search"
							size={18}
							color={colors.mutedForeground}
						/>
						<TextInput
							style={[styles.filterInput, { color: colors.foreground }]}
							placeholder="Search cards..."
							placeholderTextColor={colors.mutedForeground}
							value={filterQuery}
							onChangeText={setFilterQuery}
							returnKeyType="search"
						/>
						{filterQuery.length > 0 && (
							<Pressable
								onPress={() => setFilterQuery("")}
								hitSlop={8}
							>
								<Ionicons
									name="close-circle"
									size={18}
									color={colors.mutedForeground}
								/>
							</Pressable>
						)}
					</View>
				</View>

				{/* Summary row */}
				{collection && (
					<View style={styles.summaryRow}>
						<View>
							<Text
								style={[
									styles.summaryLabel,
									{ color: colors.mutedForeground },
								]}
							>
								Collection value
							</Text>
							<Text
								style={[
									styles.summaryValue,
									{ color: colors.foreground },
								]}
							>
								{formatPrice(collection.totalValue)}
							</Text>
						</View>
						<View style={styles.summaryRight}>
							<Text
								style={[
									styles.summaryLabel,
									{ color: colors.mutedForeground },
								]}
							>
								Cards
							</Text>
							<Text
								style={[
									styles.summaryValue,
									{ color: colors.foreground },
								]}
							>
								{collection.cardCount}
							</Text>
						</View>
					</View>
				)}

				{/* Card grid or empty state */}
				{filteredCards.length > 0 ? (
					<FlatList
						data={filteredCards}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={renderItem}
						contentContainerStyle={styles.grid}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="on-drag"
						keyboardShouldPersistTaps="handled"
					/>
				) : (
					<View style={styles.emptyState}>
						<Ionicons
							name="folder-open-outline"
							size={48}
							color={colors.mutedForeground}
						/>
						<Text
							style={[
								styles.emptyTitle,
								{ color: colors.foreground },
							]}
						>
							No Cards Yet
						</Text>
						<Text
							style={[
								styles.emptySubtitle,
								{ color: colors.mutedForeground },
							]}
						>
							Tap + to search and add cards to this collection
						</Text>
					</View>
				)}
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	headerRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	headerButton: {
		padding: 8,
	},
	filterContainer: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 12,
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
	filterInput: {
		flex: 1,
		fontSize: 15,
		height: 40,
	},
	summaryRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingBottom: 12,
	},
	summaryRight: {
		alignItems: "flex-end",
	},
	summaryLabel: {
		fontSize: 13,
		marginBottom: 2,
	},
	summaryValue: {
		fontSize: 22,
		fontWeight: "700",
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
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 32,
		gap: 10,
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
