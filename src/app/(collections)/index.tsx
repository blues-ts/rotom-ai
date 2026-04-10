import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { useCollections } from "@/hooks/useCollections";
import CollectionCard from "@/components/CollectionCard";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Collections() {
	const { colors } = useTheme();
	const { collections, deleteCollection } = useCollections();

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: colors.background }]}
			edges={["bottom"]}
		>
			<ScrollView contentContainerStyle={styles.content}>
				{collections.length === 0 ? (
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
				) : (
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
								onPress={() => router.push(`/collection-detail?id=${c.id}`)}
								onAddCards={() => {}}
								onMenuPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									Alert.alert(
										"Delete Collection",
										`Are you sure you want to delete "${c.name}"? This cannot be undone.`,
										[
											{ text: "Cancel", style: "cancel" },
											{
												text: "Delete",
												style: "destructive",
												onPress: () => {
													Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
													deleteCollection.mutate(c.id);
												},
											},
										],
									);
								}}
							/>
						</Animated.View>
						))}
					</Animated.View>
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
		padding: 16,
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
