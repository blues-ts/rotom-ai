import React, { type ReactNode } from "react";
import { Image, type ImageStyle, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { Renderer } from "react-native-marked";

import CodeBlock from "./CodeBlock";

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
		return (
			<Image
				key={this.getKey()}
				source={{ uri }}
				style={{ width: "100%", aspectRatio: 63 / 88, borderRadius: 20.5 }}
				resizeMode="contain"
				accessibilityLabel={alt}
			/>
		);
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
