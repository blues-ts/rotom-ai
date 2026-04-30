import { useRevenueCat } from "@/context/RevenueCatContext";
import { useTheme } from "@/context/ThemeContext";
import { PRO_ENTITLEMENT_ID } from "@/lib/revenuecat";
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import Purchases from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import {
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Settings() {
	const { signOut } = useAuth();
	const { user } = useUser();
	const { colors } = useTheme();
	const { isPro, refresh } = useRevenueCat();

	const handleSignOut = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign Out",
				style: "destructive",
				onPress: async () => {
					await signOut();
					router.replace("/(auth)");
				},
			},
		]);
	};

	const handleManageSubscription = async () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		try {
			await RevenueCatUI.presentCustomerCenter();
			await refresh();
		} catch (err) {
			console.warn("[Settings] presentCustomerCenter failed:", err);
		}
	};

	const handleUpgrade = async () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		try {
			await RevenueCatUI.presentPaywallIfNeeded({
				requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
			});
			await refresh();
		} catch (err) {
			console.warn("[Settings] presentPaywall failed:", err);
		}
	};

	const handleRestore = async () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		try {
			const info = await Purchases.restorePurchases();
			await refresh();
			if (info.entitlements.active[PRO_ENTITLEMENT_ID]) {
				Alert.alert("Restored", "Your River AI Pro subscription is active.");
			} else {
				Alert.alert(
					"No purchases found",
					"We couldn't find an active subscription to restore.",
				);
			}
		} catch (err) {
			Alert.alert(
				"Restore failed",
				err instanceof Error ? err.message : "Please try again.",
			);
		}
	};

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: colors.background }]}
			edges={["bottom"]}
		>
			<ScrollView contentContainerStyle={styles.content}>
				{/* Account Section */}
				<View style={styles.section}>
					<Text
						style={[
							styles.sectionTitle,
							{ color: colors.mutedForeground },
						]}
					>
						Account
					</Text>
					<View
						style={[styles.card, { backgroundColor: colors.card }]}
					>
						<View
							style={[
								styles.row,
								{ borderBottomColor: colors.border },
							]}
						>
							<Text
								style={[
									styles.label,
									{ color: colors.foreground },
								]}
							>
								Email
							</Text>
							<Text
								style={[
									styles.value,
									{ color: colors.mutedForeground },
								]}
							>
								{user?.primaryEmailAddress?.emailAddress ?? "—"}
							</Text>
						</View>
						<View style={styles.row}>
							<Text
								style={[
									styles.label,
									{ color: colors.foreground },
								]}
							>
								Name
							</Text>
							<Text
								style={[
									styles.value,
									{ color: colors.mutedForeground },
								]}
							>
								{user?.fullName ?? "—"}
							</Text>
						</View>
					</View>
				</View>

				{/* Subscription Section */}
				<View style={styles.section}>
					<Text
						style={[
							styles.sectionTitle,
							{ color: colors.mutedForeground },
						]}
					>
						Subscription
					</Text>
					<View style={[styles.card, { backgroundColor: colors.card }]}>
						<Pressable
							style={[
								styles.row,
								{ borderBottomColor: colors.border },
							]}
							onPress={isPro ? handleManageSubscription : handleUpgrade}
						>
							<Text
								style={[styles.label, { color: colors.foreground }]}
							>
								{isPro ? "Manage subscription" : "Upgrade to River AI Pro"}
							</Text>
							<Text
								style={[
									styles.value,
									{ color: isPro ? colors.primary : colors.mutedForeground },
								]}
							>
								{isPro ? "Pro" : "Free"}
							</Text>
						</Pressable>
						<Pressable style={styles.row} onPress={handleRestore}>
							<Text
								style={[styles.label, { color: colors.foreground }]}
							>
								Restore purchases
							</Text>
						</Pressable>
					</View>
				</View>

				{/* Sign Out */}
				<View style={styles.section}>
					<Pressable
						style={[
							styles.signOutButton,
							{ backgroundColor: colors.card },
						]}
						onPress={handleSignOut}
					>
						<Text
							style={[
								styles.signOutText,
								{ color: colors.destructive },
							]}
						>
							Sign Out
						</Text>
					</Pressable>
				</View>

				{/* Dev Tools */}
				{__DEV__ && (
					<View style={styles.section}>
						<Text
							style={[
								styles.sectionTitle,
								{ color: colors.mutedForeground },
							]}
						>
							Dev Tools
						</Text>
						<Pressable
							style={[
								styles.signOutButton,
								{ backgroundColor: colors.card },
							]}
							onPress={async () => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								await SecureStore.deleteItemAsync("onboarding_complete");
								await signOut();
								router.replace("/(onboarding)/welcome");
							}}
						>
							<Text
								style={[
									styles.label,
									{ color: colors.foreground },
								]}
							>
								Reset Onboarding
							</Text>
						</Pressable>
					</View>
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
		padding: 16,
		gap: 24,
	},
	section: {
		gap: 8,
	},
	sectionTitle: {
		fontSize: 13,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.5,
		paddingHorizontal: 4,
	},
	card: {
		borderRadius: 12,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "transparent",
	},
	label: {
		fontSize: 16,
	},
	value: {
		fontSize: 16,
	},
	signOutButton: {
		borderRadius: 12,
		paddingVertical: 14,
		alignItems: "center",
	},
	signOutText: {
		fontSize: 16,
		fontWeight: "500",
	},
});
