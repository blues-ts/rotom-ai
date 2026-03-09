import { Image, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/context/ThemeContext";

export default function FeaturedCard() {
	const { colors } = useTheme();

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: colors.card, borderColor: colors.border },
			]}
		>
			<Image
				source={{
					uri: "https://images.pokemontcg.io/sv7/1_hires.png",
				}}
				style={styles.image}
				resizeMode="contain"
			/>
			<View style={styles.info}>
				<Text style={[styles.label, { color: colors.mutedForeground }]}>
					Featured Card
				</Text>
				<Text style={[styles.name, { color: colors.foreground }]}>
					Exeggutor
				</Text>
				<Text style={[styles.set, { color: colors.mutedForeground }]}>
					Stellar Crown
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		marginHorizontal: 16,
		marginTop: 16,
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
		gap: 12,
	},
	image: {
		width: 80,
		height: 112,
	},
	info: {
		flex: 1,
		gap: 2,
	},
	label: {
		fontSize: 12,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	name: {
		fontSize: 20,
		fontWeight: "700",
	},
	set: {
		fontSize: 14,
	},
});
