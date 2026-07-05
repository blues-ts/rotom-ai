import { useEffect } from "react";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { spacing, useRiverTheme } from "@/constants/theme";
import { useAutoRefreshStalePrices, useCollections } from "@/hooks/useCollections";
import { recordCollectionValueSnapshot } from "@/lib/collectionValueHistory";
import CollectionCard from "@/components/CollectionCard";
import ErrorState from "@/components/ErrorState";
import CollectionValueChart from "@/components/CollectionValueChart";
import RefreshingPill from "@/components/RefreshingPill";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Collections() {
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { collections, isLoading, isError, refetch } = useCollections();
	const refreshPrices = useAutoRefreshStalePrices();
	const queryClient = useQueryClient();

	useEffect(() => {
		recordCollectionValueSnapshot();
		queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
	}, [queryClient]);

	return (
		<View style={styles.container}>
			{/* Deep-water gradient — the one background every screen shares. */}
			<LinearGradient
				colors={t.background.colors}
				locations={t.background.locations}
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			/>
			<RefreshingPill visible={refreshPrices.isPending} topOffset={52 + 8} />
			<ScrollView
				contentContainerStyle={[
					styles.content,
					{
						paddingTop: insets.top + 52,
						paddingBottom: 40 + insets.bottom,
					},
				]}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						// Spinner is only the pull affordance; refreshing stays false
						// so it collapses on release and the pill carries the
						// "updating" state from there. No title — spinner only.
						refreshing={false}
						onRefresh={() => refreshPrices.mutate(undefined)}
						tintColor={t.text.secondary}
						progressViewOffset={insets.top + 52}
					/>
				}
			>
				{isError ? (
					<View style={styles.statePad}>
						<ErrorState
							title="Couldn't load collections"
							message="Something went wrong reading your collections."
							onRetry={() => refetch()}
						/>
					</View>
				) : collections.length === 0 ? (
					isLoading ? null : (
					<View style={styles.emptyState}>
						<SymbolView
							name="folder"
							size={44}
							tintColor={t.text.tertiary}
							weight="regular"
						/>
						<Text style={[styles.emptyTitle, { color: t.text.primary }]}>
							No Collections Yet
						</Text>
						<Text
							style={[styles.emptySubtitle, { color: t.text.secondary }]}
						>
							Create a collection to organize and track your
							cards
						</Text>
					</View>
					)
				) : (
					<>
						{/* Per mock 2a/3b: the chart card and each collection card are
						    siblings resting directly on the deep-water gradient — no
						    sheet or section wrapper in between. */}
						<CollectionValueChart />
						<Animated.View
							style={styles.list}
							layout={LinearTransition.duration(300)}
						>
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
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		// Grow to the viewport so the empty state can center itself.
		flexGrow: 1,
	},
	// Collection cards rest directly on the gradient (mock 2a/3b) — the chart
	// hero above pads itself, so the horizontal inset lives here.
	list: {
		gap: 14,
		marginTop: 18,
		paddingHorizontal: spacing.screen,
	},
	statePad: {
		flex: 1,
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
