import { useTheme } from "@/context/ThemeContext";
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
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
