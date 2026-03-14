import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "@/context/ThemeContext";

export default function Search() {
	const { colors } = useTheme();
	const [searchQuery, setSearchQuery] = useState("");

	return (
		<>
			<Stack.SearchBar
				placeholder="Search cards..."
				onChangeText={(e) => setSearchQuery(e.nativeEvent.text)}
			/>

			<Stack.Toolbar placement="bottom">
				<Stack.Toolbar.SearchBarSlot />
			</Stack.Toolbar>

			<View
				style={[styles.container, { backgroundColor: colors.background }]}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
});
