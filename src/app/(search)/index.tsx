import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	FlatList,
	Image,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/ThemeContext";
import { useApi } from "@/lib/axios";

interface CardResult {
	id: string;
	name: string;
	image: string;
}

const COLUMNS = 3;
const GAP = 8;
const PADDING = 12;
const screenWidth = Dimensions.get("window").width;
const imageWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const imageHeight = imageWidth * 1.4;

export default function Search() {
	const { colors } = useTheme();
	const api = useApi();
	const [searchQuery, setSearchQuery] = useState("");
	const [results, setResults] = useState<CardResult[]>([]);
	const [loading, setLoading] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const searchCards = useCallback(
		async (query: string) => {
			if (!query.trim()) {
				setResults([]);
				setLoading(false);
				return;
			}
			setLoading(true);
			try {
				const res = await api.get("/api/pricing/cards", {
					params: { search: query, limit: 20 },
				});
				setResults(res.data.data ?? []);
			} catch {
				setResults([]);
			} finally {
				setLoading(false);
			}
		},
		[api],
	);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!searchQuery.trim()) {
			setResults([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		debounceRef.current = setTimeout(() => {
			searchCards(searchQuery);
		}, 400);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [searchQuery, searchCards]);

	const renderItem = useCallback(
		({ item, index }: { item: CardResult; index: number }) => (
			<Animated.View entering={FadeIn.delay(index * 80).duration(300)}>
				<Image
					source={{ uri: item.image }}
					style={[styles.cardImage, { backgroundColor: colors.card }]}
					resizeMode="contain"
				/>
			</Animated.View>
		),
		[colors.card],
	);

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
				{loading && results.length === 0 && (
					<ActivityIndicator
						style={styles.loader}
						color={colors.mutedForeground}
					/>
				)}
				{!loading && searchQuery.trim() && results.length === 0 && (
					<Text style={[styles.empty, { color: colors.mutedForeground }]}>
						No cards found
					</Text>
				)}
				{results.length > 0 && (
					<FlatList
						data={results}
						keyExtractor={(item) => item.id}
						numColumns={COLUMNS}
						renderItem={renderItem}
						contentContainerStyle={styles.grid}
						columnWrapperStyle={styles.row}
						showsVerticalScrollIndicator={false}
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
	loader: {
		marginTop: 40,
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
	cardImage: {
		width: imageWidth,
		height: imageHeight,
		borderRadius: 8,
	},
});
