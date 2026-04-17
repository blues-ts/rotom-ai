import React, { type ReactNode } from "react";
import { Image, type ImageStyle, Pressable, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Renderer } from "react-native-marked";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import CodeBlock from "./CodeBlock";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CardImagePressable({ cardId, name, children }: { cardId: string; name: string; children: ReactNode }) {
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<AnimatedPressable
			onPressIn={() => { scale.value = withTiming(0.96, { duration: 80 }); }}
			onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push(`/(card)/${cardId}?name=${encodeURIComponent(name)}`);
			}}
			style={animatedStyle}
		>
			{children}
		</AnimatedPressable>
	);
}

const PERCENT_REGEX = /(\([+-][\d.]+%\))/g;

/**
 * Custom markdown renderer that colorizes percentage changes
 * and renders syntax-highlighted code blocks.
 */
export class ColoredRenderer extends Renderer {
	image(
		uri: string,
		alt?: string,
		style?: ImageStyle,
		_title?: string,
	): ReactNode {
		let imageUrl = uri;
		let cardId: string | null = null;

		const hashIndex = uri.indexOf("#cardId=");
		if (hashIndex !== -1) {
			cardId = uri.substring(hashIndex + 8);
			imageUrl = uri.substring(0, hashIndex);
		}

		const image = (
			<Image
				key={this.getKey()}
				source={{ uri: imageUrl }}
				style={{ width: "100%", aspectRatio: 63 / 88, borderRadius: 23 }}
				resizeMode="contain"
				accessibilityLabel={alt}
			/>
		);

		if (cardId) {
			return (
				<CardImagePressable key={this.getKey()} cardId={cardId} name={alt || ""}>
					{image}
				</CardImagePressable>
			);
		}

		return image;
	}

	code(
		text: string,
		language?: string,
		_containerStyle?: ViewStyle,
		_textStyle?: TextStyle,
	): ReactNode {
		return <CodeBlock key={this.getKey()} code={text} language={language} />;
	}

	text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
		if (typeof text === "string" && PERCENT_REGEX.test(text)) {
			const parts = text.split(PERCENT_REGEX);
			const children = parts.map((part, i) => {
				if (PERCENT_REGEX.test(part)) {
					PERCENT_REGEX.lastIndex = 0;
					const isPositive = part.includes("+");
					return (
						<Text
							key={i}
							style={[styles, { color: isPositive ? "#22c55e" : "#ef4444" }]}
						>
							{part}
						</Text>
					);
				}
				return part;
			});

			PERCENT_REGEX.lastIndex = 0;
			return (
				<Text selectable key={this.getKey()} style={styles}>
					{children}
				</Text>
			);
		}

		return super.text(text, styles);
	}
}
