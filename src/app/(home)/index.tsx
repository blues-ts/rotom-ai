import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@clerk/clerk-expo";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

export default function Home() {
	const { signOut } = useAuth();
	const { colors } = useTheme();

	const handleSignOut = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign Out",
				style: "destructive",
				onPress: () => signOut(),
			},
		]);
	};

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon={"folder"}
					onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Share"); }}
				/>
				<Stack.Toolbar.Button
					icon="gearshape"
					onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(settings)"); }}
				/>
			</Stack.Toolbar>
			<Text style={[styles.text, { color: colors.foreground }]}>Home</Text>
			<Pressable
				style={[styles.button, { backgroundColor: colors.card }]}
				onPress={handleSignOut}
			>
				<Text style={[styles.buttonText, { color: colors.destructive }]}>
					Sign Out
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	text: {
		fontSize: 18,
	},
	button: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 10,
		marginTop: 24,
	},
	buttonText: {
		fontSize: 16,
		fontWeight: "500",
	},
});
