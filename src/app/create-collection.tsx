import { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { radius, typeScale, useRiverTheme } from "@/constants/theme";
import { useCollections } from "@/hooks/useCollections";
import { SheetDoneButton } from "@/components/SheetDoneButton";

export default function CreateCollection() {
	const t = useRiverTheme();
	// From the add-to-collection sheet, creating is a detour mid-add: land back
	// on the picker (with the new collection listed) instead of opening the
	// empty collection and abandoning the card being added.
	const { from } = useLocalSearchParams<{ from?: string }>();
	const returnToCaller = from === "add-to-collection";
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
			if (!returnToCaller) {
				router.push({
					pathname: "/collection-detail",
					params: { id, name: trimmed, totalValue: "0", cardCount: "0" },
				});
			}
		} catch {
			// onMutationError already surfaces the failure; just close the sheet.
			router.back();
		}
	}, [name, createCollection, returnToCaller]);

	return (
		// The sheet fill comes from the route's contentStyle (root layout).
		<View style={styles.content}>
			<Stack.Screen
				options={{
					headerRight: () => (
						<SheetDoneButton onPress={handleCreate} disabled={!canCreate} />
					),
				}}
			/>
			<Text style={[styles.label, { color: t.text.secondary }]}>
				Collection name
			</Text>
			<TextInput
				style={[
					styles.input,
					{
						backgroundColor: t.glass.elevatedFill,
						color: t.text.primary,
						borderColor: t.glass.elevatedBorder,
					},
				]}
				placeholder="My collection"
				placeholderTextColor={t.text.secondary}
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
		paddingTop: 12,
	},
	// Every section header is an overline.
	label: {
		...typeScale.overline,
		marginBottom: 10,
	},
	// Elevated glass input pill.
	input: {
		fontSize: 16,
		borderRadius: radius.pill,
		borderWidth: 1,
		paddingHorizontal: 18,
		paddingVertical: 13,
		marginBottom: 16,
	},
});
