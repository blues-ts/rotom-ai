import { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";

import { radius, typeScale, useRiverTheme } from "@/constants/theme";
import { useVendorItems } from "@/hooks/useVendorItems";
import { SheetDoneButton } from "@/components/SheetDoneButton";

/**
 * New vending group in a form sheet — the create-collection twin (same
 * 0.35-detent presentation, overline label, pill input, Done to commit).
 */
export default function CreateVendorGroup() {
	const t = useRiverTheme();
	const { createGroup } = useVendorItems();
	const [name, setName] = useState("");
	const canCreate = name.trim().length > 0;

	const handleCreate = useCallback(async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		try {
			await createGroup.mutateAsync(trimmed);
			router.back();
		} catch {
			// onMutationError already surfaces the failure; just close the sheet.
			router.back();
		}
	}, [name, createGroup]);

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
				Group name
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
				placeholder="My group"
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
		paddingTop: 24,
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
