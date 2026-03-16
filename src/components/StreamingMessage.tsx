import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useMarkdown } from "react-native-marked";

import type { MarkedStyles } from "react-native-marked";

interface StreamingMessageProps {
	content: string;
	markdownStyles: MarkedStyles;
}

const IMAGE_REGEX = /!\[[^\]]*\]\([^)]+\)/;

function StreamingMessage({ content, markdownStyles }: StreamingMessageProps) {
	const imageUrlRef = useRef<string | null>(null);

	// Lock the image URL once we find it — never changes after
	if (imageUrlRef.current === null) {
		const match = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
		if (match) {
			imageUrlRef.current = match[1];
		}
	}

	// Always strip image syntax (complete or partial) from markdown content
	// This prevents useMarkdown from rendering its own image element
	let textContent = content;
	if (imageUrlRef.current) {
		// Strip the complete image syntax
		textContent = content.replace(IMAGE_REGEX, "").trimStart();
	} else {
		// Strip partial image syntax that's still streaming in (e.g. "![Mew ex](https://...")
		textContent = content.replace(/!\[[^\]]*\]?\(?[^)\s]*$/, "").trimStart();
	}

	const elements = useMarkdown(textContent, { styles: markdownStyles });

	return (
		<View style={styles.container}>
			{imageUrlRef.current && (
				<Animated.View entering={FadeIn.duration(500)} style={styles.imageContainer}>
					<Animated.Image
						source={{ uri: imageUrlRef.current }}
						style={styles.cardImage}
						resizeMode="contain"
					/>
				</Animated.View>
			)}
			{elements}
		</View>
	);
}

export default React.memo(StreamingMessage);

const styles = StyleSheet.create({
	container: {
		width: "100%",
	},
	imageContainer: {
		alignItems: "center",
		marginVertical: 8,
	},
	cardImage: {
		width: "100%",
		aspectRatio: 5 / 7,
		borderRadius: 10,
	},
});
