import { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";

import { useTheme } from "@/context/ThemeContext";
import { useCollections } from "@/hooks/useCollections";
import { SheetDoneButton } from "@/components/SheetDoneButton";

export default function CreateCollection() {
	const { colors } = useTheme();
	const { createCollection } = useCollections();
	const [name, setName] = useState("");
	const canCreate = name.trim().length > 0;

	const handleCreate = useCallback(async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		try {
			// createCollection returns the new row's id — dismiss this sheet and open
			// the freshly created (empty) collection so the user can start adding.
			const id = await createCollection.mutateAsync(trimmed);
			router.back();
			router.push({
				pathname: "/collection-detail",
				params: { id, name: trimmed, totalValue: "0", cardCount: "0" },
			});
		} catch {
			// onMutationError already surfaces the failure; just close the sheet.
			router.back();
		}
	}, [name, createCollection]);

	return (
		<View style={[styles.content, { backgroundColor: colors.card }]}>
			<Stack.Screen
				options={{
					headerRight: () => (
						<SheetDoneButton onPress={handleCreate} disabled={!canCreate} />
					),
				}}
			/>
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
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		flex: 1,
		padding: 20,
		paddingTop: 24,
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
});
