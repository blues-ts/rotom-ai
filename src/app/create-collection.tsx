import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useTheme } from "@/context/ThemeContext";
import { useCollections } from "@/hooks/useCollections";

export default function CreateCollection() {
	const { colors } = useTheme();
	const { createCollection } = useCollections();
	const [name, setName] = useState("");
	const canCreate = name.trim().length > 0;

	const handleCreate = useCallback(() => {
		if (!name.trim()) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		createCollection.mutate(name.trim());
		router.back();
	}, [name, createCollection]);

	return (
		<View style={[styles.content, { backgroundColor: colors.card }]}>
			<Text style={[styles.title, { color: colors.foreground }]}>
				New Collection
			</Text>
			<Text style={[styles.label, { color: colors.mutedForeground }]}>
				COLLECTION NAME
			</Text>
			<TextInput
				style={[
					styles.input,
					{
						backgroundColor: colors.input,
						color: colors.foreground,
						borderColor: colors.border,
					},
				]}
				placeholder="My collection"
				placeholderTextColor={colors.mutedForeground}
				value={name}
				onChangeText={setName}
				onSubmitEditing={handleCreate}
				returnKeyType="done"
				autoFocus
				maxLength={50}
			/>
			<Pressable
				onPress={handleCreate}
				disabled={!canCreate}
				style={[
					styles.createButton,
					{
						backgroundColor: canCreate
							? colors.primary
							: colors.muted,
					},
				]}
			>
				<Text
					style={[
						styles.createButtonText,
						{
							color: canCreate
								? colors.primaryForeground
								: colors.mutedForeground,
						},
					]}
				>
					Create Collection
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		flex: 1,
		padding: 20,
		paddingTop: 24,
	},
	title: {
		fontSize: 18,
		fontWeight: "700",
		marginBottom: 16,
	},
	label: {
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 0.5,
		marginBottom: 8,
	},
	input: {
		fontSize: 16,
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		marginBottom: 16,
	},
	createButton: {
		borderRadius: 10,
		paddingVertical: 14,
		alignItems: "center",
	},
	createButtonText: {
		fontSize: 16,
		fontWeight: "600",
	},
});
