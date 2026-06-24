import { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/context/ThemeContext";
import { useAutoRefreshStalePrices, useCollections } from "@/hooks/useCollections";
import { recordCollectionValueSnapshot } from "@/lib/collectionValueHistory";
import CollectionCard from "@/components/CollectionCard";
import ErrorState from "@/components/ErrorState";
import CollectionValueChart from "@/components/CollectionValueChart";
import RefreshingPill from "@/components/RefreshingPill";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export default function Collections() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { collections, isLoading, isError, refetch } = useCollections();
	const refreshPrices = useAutoRefreshStalePrices();
	const queryClient = useQueryClient();

	useEffect(() => {
		recordCollectionValueSnapshot();
		queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
	}, [queryClient]);

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: colors.background }]}
			// No bottom edge: let the scroll surface reach the phone's bottom edge so
			// content scrolls all the way down (home-indicator clearance is handled by
			// the content's paddingBottom) instead of stopping short — the hard cutoff.
			edges={[]}
		>
			<RefreshingPill visible={refreshPrices.isPending} topOffset={52 + 8} />
			<ScrollView
				contentContainerStyle={[
					styles.content,
					{ paddingTop: insets.top + 52, paddingBottom: insets.bottom + 24 },
				]}
				refreshControl={
					<RefreshControl
						// The pill is the sole "updating" indicator — keep the native
						// spinner from lingering behind it; pulling still refreshes.
						refreshing={false}
						onRefresh={() => refreshPrices.mutate(undefined)}
						tintColor={colors.mutedForeground}
						progressViewOffset={insets.top + 52}
						title="Pull to refresh prices"
						titleColor={colors.mutedForeground}
					/>
				}
			>
				{isError ? (
					<ErrorState
						title="Couldn't load collections"
						message="Something went wrong reading your collections."
						onRetry={() => refetch()}
					/>
				) : collections.length === 0 ? (
					isLoading ? null : (
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
							No Collections Yet
						</Text>
						<Text
							style={[
								styles.emptySubtitle,
								{ color: colors.mutedForeground },
							]}
						>
							Create a collection to organize and track your
							cards
						</Text>
					</View>
					)
				) : (
					<>
					<CollectionValueChart />
					<Animated.View style={styles.list} layout={LinearTransition.duration(300)}>
						{collections.map((c) => (
							<Animated.View
								key={c.id}
								entering={FadeIn.duration(300)}
								exiting={FadeOut.duration(200)}
								layout={LinearTransition.duration(300)}
							>
							<CollectionCard
								name={c.name}
								cardCount={c.cardCount}
								totalValue={c.totalValue}
								cardImages={c.cardImages}
								onPress={() =>
									router.push(
										`/collection-detail?id=${c.id}&name=${encodeURIComponent(c.name)}&totalValue=${c.totalValue}&cardCount=${c.cardCount}`,
									)
								}
							/>
						</Animated.View>
						))}
					</Animated.View>
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		flexGrow: 1,
		paddingHorizontal: 16,
		// paddingBottom is applied inline (needs the safe-area inset).
	},
	list: {
		gap: 12,
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
