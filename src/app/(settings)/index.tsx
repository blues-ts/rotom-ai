import { useEffect, useState } from "react";
import { PRIVACY_URL, TERMS_URL } from "@/constants/links";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { useToast } from "@/context/ToastContext";
import { radius, spacing, typeScale, useRiverTheme } from "@/constants/theme";
import { useApi } from "@/lib/axios";
import {
	isRevenueCatConfigured,
	PRO_ENTITLEMENT_ID,
	presentProPaywallIfNeeded,
} from "@/lib/revenuecat";
import {
	clearCollectionValueHistory,
	seedCollectionValueHistory,
} from "@/lib/collectionValueHistory";
import { runAndStoreSqliteBenchmark } from "@/lib/devPerfBench";
import { resetTapHoldHint } from "@/hooks/useTapHoldHint";
import CardPressable from "@/components/CardPressable";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { LinearGradient } from "expo-linear-gradient";
import HeaderFadeScrim from "@/components/HeaderFadeScrim";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import Purchases from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import {
	Alert,
	Linking,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function SettingsCard({ children }: { children: React.ReactNode }) {
	const t = useRiverTheme();
	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: t.glass.surfaceFill,
					borderColor: t.glass.surfaceBorder,
				},
				t.glass.shadow,
			]}
		>
			{children}
		</View>
	);
}

function RowContent({
	icon,
	label,
	labelColor,
	value,
	valueColor,
	trailingIcon,
}: {
	icon?: SFSymbol;
	label: string;
	labelColor?: string;
	value?: string;
	valueColor?: string;
	trailingIcon?: SFSymbol;
}) {
	const t = useRiverTheme();
	return (
		<>
			{icon ? (
				<View
					style={[styles.iconChip, { backgroundColor: t.accentIconFill }]}
				>
					<SymbolView
						name={icon}
						size={18}
						tintColor={t.accentOn}
						weight="medium"
					/>
				</View>
			) : null}
			<Text
				style={[styles.label, { color: labelColor ?? t.text.primary }]}
				numberOfLines={1}
			>
				{label}
			</Text>
			{value ? (
				<Text
					style={[styles.value, { color: valueColor ?? t.text.secondary }]}
					numberOfLines={1}
				>
					{value}
				</Text>
			) : null}
			{trailingIcon ? (
				<SymbolView
					name={trailingIcon}
					size={14}
					tintColor={t.text.tertiary}
					weight="semibold"
				/>
			) : null}
		</>
	);
}

function SettingsRow({
	onPress,
	last = false,
	...content
}: {
	onPress?: () => void;
	last?: boolean;
} & Parameters<typeof RowContent>[0]) {
	const t = useRiverTheme();
	const borderStyle = last
		? null
		: {
				borderBottomWidth: StyleSheet.hairlineWidth,
				borderBottomColor: t.glass.surfaceBorder,
			};

	if (!onPress) {
		return (
			<View style={[styles.row, borderStyle]}>
				<RowContent {...content} />
			</View>
		);
	}
	return (
		<CardPressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={content.label}
			// Rows inside a shared card brighten without scaling (selection-
			// control convention) — scaling one row inside the card reads wrong.
			pressScale={1}
			baseColor={t.isDark ? "rgba(210, 235, 255, 0)" : "rgba(255, 255, 255, 0)"}
			pressedColor={t.glass.pressedFill}
			style={[styles.row, borderStyle]}
		>
			<RowContent {...content} />
		</CardPressable>
	);
}

export default function Settings() {
	const { signOut } = useAuth();
	const { user } = useUser();
	const t = useRiverTheme();
	const insets = useSafeAreaInsets();
	const { isPro, refresh } = useRevenueCat();
	const api = useApi();
	const queryClient = useQueryClient();
	const toast = useToast();
	const [crashTest, setCrashTest] = useState(false);

	// Dev-only: `riverai:///(settings)?bench=1` auto-runs the SQLite benchmark
	// so it can be triggered headlessly (simctl openurl) and read back from the
	// sandbox — see runAndStoreSqliteBenchmark.
	const { bench } = useLocalSearchParams<{ bench?: string }>();
	useEffect(() => {
		if (!__DEV__ || bench !== "1") return;
		runAndStoreSqliteBenchmark()
			.then((report) => console.log(`[perf-bench]\n${report}`))
			.catch((e) => console.log("[perf-bench] failed:", e));
	}, [bench]);

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
		if (!isRevenueCatConfigured()) {
			console.warn("[Settings] RevenueCat not configured");
			return;
		}
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
			await presentProPaywallIfNeeded();
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
		<View style={styles.container}>
			{/* Deep-water gradient — the one background every screen shares. */}
			<LinearGradient
				colors={t.background.colors}
				locations={t.background.locations}
				pointerEvents="none"
				style={StyleSheet.absoluteFill}
			/>
			<ScrollView
				contentContainerStyle={[
					styles.content,
					{
						paddingTop: insets.top + 52 + 8,
						paddingBottom: 40 + insets.bottom,
					},
				]}
				showsVerticalScrollIndicator={false}
			>
				{/* Account */}
				<View style={styles.section}>
					<Text style={[styles.overline, { color: t.text.secondary }]}>
						Account
					</Text>
					<SettingsCard>
						<SettingsRow
							icon="envelope"
							label="Email"
							value={user?.primaryEmailAddress?.emailAddress ?? "—"}
						/>
						<SettingsRow
							icon="person"
							label="Name"
							value={user?.fullName ?? "—"}
							last
						/>
					</SettingsCard>
				</View>

				{/* Subscription */}
				<View style={styles.section}>
					<Text style={[styles.overline, { color: t.text.secondary }]}>
						Subscription
					</Text>
					<SettingsCard>
						<SettingsRow
							icon="crown"
							label={isPro ? "Manage subscription" : "Upgrade to River AI Pro"}
							value={isPro ? "Pro" : "Free"}
							valueColor={isPro ? t.accentOn : t.text.secondary}
							trailingIcon="chevron.right"
							onPress={isPro ? handleManageSubscription : handleUpgrade}
						/>
						<SettingsRow
							icon="arrow.clockwise"
							label="Restore purchases"
							trailingIcon="chevron.right"
							onPress={handleRestore}
							last
						/>
					</SettingsCard>
				</View>

				{/* Legal */}
				<View style={styles.section}>
					<Text style={[styles.overline, { color: t.text.secondary }]}>
						Legal
					</Text>
					<SettingsCard>
						<SettingsRow
							icon="doc.text"
							label="Terms of Service"
							trailingIcon="arrow.up.right"
							onPress={() => Linking.openURL(TERMS_URL)}
						/>
						<SettingsRow
							icon="hand.raised"
							label="Privacy Policy"
							trailingIcon="arrow.up.right"
							onPress={() => Linking.openURL(PRIVACY_URL)}
							last
						/>
					</SettingsCard>
				</View>

				{/* Sign Out */}
				<CardPressable
					onPress={handleSignOut}
					accessibilityRole="button"
					accessibilityLabel="Sign Out"
					pressScale={0.98}
					baseColor={t.glass.surfaceFill}
					pressedColor={t.glass.pressedFill}
					style={[
						styles.actionButton,
						{ borderColor: t.glass.surfaceBorder },
						t.glass.shadow,
					]}
				>
					<Text style={[styles.actionText, { color: t.loss }]}>Sign Out</Text>
				</CardPressable>

				{/* Delete Account */}
				<CardPressable
					onPress={handleDeleteAccount}
					accessibilityRole="button"
					accessibilityLabel="Delete Account"
					pressScale={0.98}
					baseColor="rgba(248, 113, 113, 0.12)"
					pressedColor="rgba(248, 113, 113, 0.2)"
					style={[styles.actionButton, { borderColor: "rgba(248, 113, 113, 0.35)" }]}
				>
					<Text style={[styles.actionText, { color: t.loss }]}>
						Delete Account
					</Text>
				</CardPressable>

				{/* Dev Tools */}
				{__DEV__ && (
					<View style={styles.section}>
						<Text style={[styles.overline, { color: t.text.secondary }]}>
							Dev Tools
						</Text>
						<SettingsCard>
							<SettingsRow
								label="Reset Onboarding"
								onPress={async () => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									await SecureStore.deleteItemAsync("onboarding_complete");
									await signOut();
									router.replace("/(onboarding)/welcome");
								}}
							/>
							<SettingsRow
								label="Seed Test History"
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									seedCollectionValueHistory();
									queryClient.invalidateQueries({
										queryKey: ["collectionValueHistory"],
									});
								}}
							/>
							<SettingsRow
								label="Clear History"
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									clearCollectionValueHistory();
									queryClient.invalidateQueries({
										queryKey: ["collectionValueHistory"],
									});
								}}
							/>
							<SettingsRow
								label="Run SQLite Benchmark"
								onPress={async () => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									toast.show("Running SQLite benchmark…");
									try {
										const report = await runAndStoreSqliteBenchmark();
										console.log(`[perf-bench]\n${report}`);
										Alert.alert("SQLite benchmark", report);
									} catch (e) {
										Alert.alert("SQLite benchmark failed", String(e));
									}
								}}
							/>
							<SettingsRow
								label="Show Error Toast"
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									toast.show("Test error toast — something failed.");
								}}
							/>
							<SettingsRow
								label="Show Success Toast"
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									toast.show("Test success toast — all good!", "success");
								}}
							/>
							<SettingsRow
								label="Reset Tap & Hold Hint"
								onPress={async () => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									await resetTapHoldHint();
									toast.show(
										"Hints reset — open search, a set, or a card.",
										"success",
									);
								}}
							/>
							<SettingsRow
								label="Trigger Test Crash"
								labelColor={t.loss}
								onPress={() => {
									Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
									setCrashTest(true);
								}}
								last
							/>
						</SettingsCard>
					</View>
				)}
			</ScrollView>
			<HeaderFadeScrim />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		paddingHorizontal: spacing.screen,
		gap: 24,
	},
	section: {
		gap: 8,
	},
	overline: {
		...typeScale.overline,
		paddingHorizontal: 4,
	},
	card: {
		borderRadius: radius.tile,
		borderWidth: 1,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 14,
		paddingVertical: 13,
		minHeight: spacing.hitTarget,
	},
	iconChip: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	label: {
		...typeScale.body,
		flex: 1,
	},
	value: {
		fontSize: 15,
		fontWeight: "500",
		flexShrink: 1,
	},
	actionButton: {
		borderRadius: radius.tile,
		borderWidth: 1,
		paddingVertical: 14,
		alignItems: "center",
		minHeight: spacing.hitTarget,
		justifyContent: "center",
	},
	actionText: {
		...typeScale.body,
	},
});
