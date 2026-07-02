import { useEffect } from "react";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { typeScale, useRiverTheme } from "@/constants/theme";
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
					{ paddingTop: insets.top + 52 },
				]}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						// The pill is the sole "updating" indicator — keep the native
						// spinner from lingering behind it; pulling still refreshes.
						refreshing={false}
						onRefresh={() => refreshPrices.mutate(undefined)}
						tintColor={t.text.secondary}
						progressViewOffset={insets.top + 52}
						title="Pull to refresh prices"
						titleColor={t.text.secondary}
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
						{/* Portfolio chart is the hero on the stage — the collections
						    rest on the glass counter below, like the card detail screen. */}
						<CollectionValueChart />
						<View
							style={[
								styles.sheet,
								{
									backgroundColor: t.glass.surfaceFill,
									borderColor: t.glass.surfaceBorder,
									paddingBottom: 40 + insets.bottom,
								},
							]}
						>
							<Text style={[styles.sheetTitle, { color: t.text.secondary }]}>
								Collections
							</Text>
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
						</View>
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
		// Full-bleed so the sheet reaches the screen edges; children pad
		// themselves. Grow to the viewport so the sheet stretches to the bottom.
		flexGrow: 1,
	},

	// The counter — a glass surface rising beneath the chart hero, holding the
	// collections (mirrors the card detail sheet).
	sheet: {
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
		marginTop: 18,
		paddingTop: 22,
		paddingHorizontal: 16,
		// Fill the remaining height below the chart when the list is short.
		flexGrow: 1,
		// Lift the lip off the stage so the chart reads as floating above it.
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -8 },
		shadowOpacity: 0.22,
		shadowRadius: 18,
		elevation: 12,
	},
	// Every section header is an overline.
	sheetTitle: {
		...typeScale.overline,
		marginBottom: 12,
		paddingHorizontal: 6,
	},
	list: {
		gap: 12,
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
