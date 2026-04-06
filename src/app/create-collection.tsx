import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import BottomSheet, {
	BottomSheetBackdrop,
	BottomSheetTextInput,
	BottomSheetView,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useTheme } from "@/context/ThemeContext";
import { useCollections } from "@/hooks/useCollections";

export default function CreateCollection() {
	const { colors } = useTheme();
	const { createCollection } = useCollections();
	const bottomSheetRef = useRef<BottomSheet>(null);
	const [name, setName] = useState("");
	const canCreate = name.trim().length > 0;

	const handleClose = useCallback(() => {
		router.back();
	}, []);

	const handleCreate = useCallback(() => {
		if (!name.trim()) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		createCollection.mutate(name.trim());
		bottomSheetRef.current?.close();
	}, [name, createCollection]);

	const renderBackdrop = useCallback(
		(props: any) => (
			<BottomSheetBackdrop
				{...props}
				disappearsOnIndex={-1}
				appearsOnIndex={0}
				pressBehavior="close"
			/>
		),
		[],
	);

	return (
		<BottomSheet
			ref={bottomSheetRef}
			enableDynamicSizing
			enablePanDownToClose
			onClose={handleClose}
			backdropComponent={renderBackdrop}
			backgroundStyle={{
				backgroundColor: colors.card,
				borderColor: colors.border,
				borderWidth: 1,
				borderTopLeftRadius: 20,
				borderTopRightRadius: 20,
			}}
			handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
			keyboardBehavior="interactive"
			keyboardBlurBehavior="restore"
			android_keyboardInputMode="adjustResize"
		>
			<BottomSheetView style={styles.content}>
				<Text style={[styles.title, { color: colors.foreground }]}>
					New Collection
				</Text>
				<Text style={[styles.label, { color: colors.mutedForeground }]}>
					COLLECTION NAME
				</Text>
				<BottomSheetTextInput
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
			</BottomSheetView>
		</BottomSheet>
	);
}

const styles = StyleSheet.create({
	content: {
		padding: 20,
		paddingBottom: 36,
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
