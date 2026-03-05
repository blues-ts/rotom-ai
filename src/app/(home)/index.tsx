import { useAuth } from "@clerk/clerk-expo";
import { Stack } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

export default function Home() {
	const { signOut } = useAuth();

	const handleSignOut = () => {
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
		<View style={styles.container}>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon={"star"}
					onPress={() => Alert.alert("Share")}
				/>
				<Stack.Toolbar.Button
					icon="square.and.arrow.up"
					onPress={() => Alert.alert("Share")}
				/>
			</Stack.Toolbar>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="sidebar.left"
					onPress={() => Alert.alert("Sidebar")}
				/>
			</Stack.Toolbar>
			<Text style={styles.text}>Home</Text>
			<Pressable style={styles.button} onPress={handleSignOut}>
				<Text style={styles.buttonText}>Sign Out</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#000",
		gap: 24,
	},
	text: {
		color: "#fff",
		fontSize: 18,
	},
	button: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 10,
		backgroundColor: "#1a1a1a",
	},
	buttonText: {
		color: "#ff4444",
		fontSize: 16,
		fontWeight: "500",
	},
});
