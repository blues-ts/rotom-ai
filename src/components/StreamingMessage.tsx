import React from "react";
import { StyleSheet, View } from "react-native";
import { useMarkdown } from "react-native-marked";

import type { MarkedStyles } from "react-native-marked";

interface StreamingMessageProps {
	content: string;
	markdownStyles: MarkedStyles;
}

function StreamingMessage({ content, markdownStyles }: StreamingMessageProps) {
	const elements = useMarkdown(content, { styles: markdownStyles });

	return (
		<View style={styles.container}>
			{elements}
		</View>
	);
}

export default React.memo(StreamingMessage);

const styles = StyleSheet.create({
	container: {
		width: "100%",
	},
});
