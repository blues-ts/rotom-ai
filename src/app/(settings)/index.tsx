import { useState } from "react";
import { PRIVACY_URL, TERMS_URL } from "@/constants/links";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { useApi } from "@/lib/axios";
import { PRO_ENTITLEMENT_ID } from "@/lib/revenuecat";
import {
	clearCollectionValueHistory,
	seedCollectionValueHistory,
} from "@/lib/collectionValueHistory";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import Purchases from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import {
	Alert,
	Linking,
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
	const api = useApi();
	const queryClient = useQueryClient();
	const toast = useToast();
	const [crashTest, setCrashTest] = useState(false);

	if (crashTest) {
		throw new Error("Test crash from Settings dev tools");
	}

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

	const handleDeleteAccount = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		const message = isPro
			? "This permanently deletes your account and all data. You'll still be charged for any active subscription until you cancel it in your iPhone Settings → Apple ID → Subscriptions."
			: "This permanently deletes your account and all data. This cannot be undone.";

		Alert.alert("Delete Account", message, [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: async () => {
					try {
						await api.delete("/api/auth/user");
						await SecureStore.deleteItemAsync("onboarding_complete");
						try {
							await Purchases.logOut();
						} catch {
							// Anonymous users can't log out; ignore.
						}
						await signOut();
						router.replace("/(auth)");
					} catch (err) {
						console.warn("[Settings] deleteAccount failed:", err);
						Alert.alert(
							"Delete failed",
							err instanceof Error ? err.message : "Please try again.",
						);
					}
				},
			},
		]);
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

				{/* Legal */}
				<View style={styles.section}>
					<Text
						style={[
							styles.sectionTitle,
							{ color: colors.mutedForeground },
						]}
					>
						Legal
					</Text>
					<View style={[styles.card, { backgroundColor: colors.card }]}>
						<Pressable
							style={[
								styles.row,
								{ borderBottomColor: colors.border },
							]}
							onPress={() => Linking.openURL(TERMS_URL)}
						>
							<Text
								style={[styles.label, { color: colors.foreground }]}
							>
								Terms of Service
							</Text>
						</Pressable>
						<Pressable
							style={styles.row}
							onPress={() => Linking.openURL(PRIVACY_URL)}
						>
							<Text
								style={[styles.label, { color: colors.foreground }]}
							>
								Privacy Policy
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

				{/* Delete Account */}
				<View style={styles.section}>
					<Pressable
						style={[
							styles.signOutButton,
							{ backgroundColor: colors.destructive },
						]}
						onPress={handleDeleteAccount}
					>
						<Text style={[styles.signOutText, { color: "#fff" }]}>
							Delete Account
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
						<Pressable
							style={[
								styles.signOutButton,
								{ backgroundColor: colors.card },
							]}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								seedCollectionValueHistory();
								queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
							}}
						>
							<Text
								style={[
									styles.label,
									{ color: colors.foreground },
								]}
							>
								Seed Test History
							</Text>
						</Pressable>
						<Pressable
							style={[
								styles.signOutButton,
								{ backgroundColor: colors.card },
							]}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								clearCollectionValueHistory();
								queryClient.invalidateQueries({ queryKey: ["collectionValueHistory"] });
							}}
						>
							<Text
								style={[
									styles.label,
									{ color: colors.foreground },
								]}
							>
								Clear History
							</Text>
						</Pressable>
						<Pressable
							style={[
								styles.signOutButton,
								{ backgroundColor: colors.card },
							]}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								toast.show("Test error toast — something failed.");
							}}
						>
							<Text
								style={[
									styles.label,
									{ color: colors.foreground },
								]}
							>
								Show Error Toast
							</Text>
						</Pressable>
						<Pressable
							style={[
								styles.signOutButton,
								{ backgroundColor: colors.card },
							]}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
								toast.show("Test success toast — all good!", "success");
							}}
						>
							<Text
								style={[
									styles.label,
									{ color: colors.foreground },
								]}
							>
								Show Success Toast
							</Text>
						</Pressable>
						<Pressable
							style={[
								styles.signOutButton,
								{ backgroundColor: colors.card },
							]}
							onPress={() => {
								Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
								setCrashTest(true);
							}}
						>
							<Text
								style={[
									styles.label,
									{ color: colors.destructive },
								]}
							>
								Trigger Test Crash
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
