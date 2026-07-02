import { Keyboard, Pressable, StyleSheet, Text } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useRiverTheme } from "@/constants/theme";

// Badge fill is a screen-specific token from the handoff spec (Home hero).
// Dark keeps the saturated blue gradient; light gets a soft accent wash so the
// sprite doesn't sit in a heavy dark disc on the shallow-water background.
const BADGE_GRADIENT_DARK = ["#2C7CC4", "#16548C"] as const;
const BADGE_GRADIENT_LIGHT = [
	"rgba(31, 127, 212, 0.18)",
	"rgba(31, 127, 212, 0.10)",
] as const;

export default function EmptyChat() {
	const t = useRiverTheme();

	return (
		<Pressable style={styles.container} onPress={Keyboard.dismiss}>
			{/* Declarative entering animation — runs natively and always resolves to
			    visible, unlike a mount-time useEffect that can be dropped mid-
			    navigation and leave the header stuck at opacity 0. */}
			<Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
				<LinearGradient
					colors={t.isDark ? BADGE_GRADIENT_DARK : BADGE_GRADIENT_LIGHT}
					style={[
						styles.badge,
						{
							borderColor: t.isDark
								? "rgba(255, 255, 255, 0.22)"
								: "rgba(11, 39, 64, 0.10)",
						},
					]}
				>
					{/* Placeholder mascot sprite — replace before release. */}
					<Image
						source="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/501.gif"
						style={styles.sprite}
						contentFit="contain"
					/>
				</LinearGradient>
				<Text style={[styles.title, { color: t.text.primary }]}>River</Text>
				<Text style={[styles.subtitle, { color: t.text.primary }]}>
					Your Pokémon TCG AI assistant
				</Text>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		justifyContent: "center",
		alignItems: "center",
	},
	hero: {
		alignItems: "center",
	},
	badge: {
		width: 68,
		height: 68,
		borderRadius: 34,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 14,
		overflow: "hidden",
	},
	sprite: {
		width: 44,
		height: 44,
	},
	title: {
		fontSize: 32,
		fontWeight: "700",
	},
	subtitle: {
		fontSize: 15,
		fontWeight: "500",
		opacity: 0.72,
		marginTop: 4,
		textAlign: "center",
	},
});
