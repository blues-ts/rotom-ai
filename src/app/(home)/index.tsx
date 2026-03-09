import { useState } from "react";

import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { router, Stack } from "expo-router";

import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import FeaturedCard from "@/components/FeaturedCard";
import { useTheme } from "@/context/ThemeContext";

type Language = "all" | "english" | "japanese";

export default function Home() {
	const { colors } = useTheme();
	const [language, setLanguage] = useState<Language>("all");

	return (
		<View
			style={[styles.container, { backgroundColor: colors.background }]}
		>
			<LinearGradient
				colors={[colors.primary, colors.background]}
				style={StyleSheet.absoluteFill}
			/>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon={"folder"}
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						Alert.alert("Share");
					}}
				/>
				<Stack.Toolbar.Button
					icon="gearshape"
					onPress={() => {
						Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(settings)");
					}}
				/>
			</Stack.Toolbar>
			<Stack.SearchBar
				placeholder={
					language === "all"
						? "Search All Cards"
						: language === "english"
							? "Search English Cards"
							: "Search Japanese Cards"
				}
				onChangeText={() => {}}
			/>
			<Stack.Toolbar placement="bottom">
				<Stack.Toolbar.SearchBarSlot />
				<Stack.Toolbar.Menu icon="ellipsis.circle">
					<Stack.Toolbar.MenuAction
						isOn={language === "all"}
						onPress={() => setLanguage("all")}
					>
						🌎 All
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						isOn={language === "english"}
						onPress={() => setLanguage("english")}
					>
						🇺🇸 English
					</Stack.Toolbar.MenuAction>
					<Stack.Toolbar.MenuAction
						isOn={language === "japanese"}
						onPress={() => setLanguage("japanese")}
					>
						🇯🇵 Japanese
					</Stack.Toolbar.MenuAction>
				</Stack.Toolbar.Menu>
			</Stack.Toolbar>

			<ScrollView
				style={styles.scrollView}
				contentInsetAdjustmentBehavior="automatic"
				showsVerticalScrollIndicator={false}
			>
				<FeaturedCard />
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	scrollView: {
		flex: 1,
	},
});
