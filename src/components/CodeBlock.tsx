import React, { useCallback, useMemo, useState } from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

import { useTheme } from "@/context/ThemeContext";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

const SCOPE_COLORS: Record<string, string> = {
	keyword: "#c678dd",
	built_in: "#e6c07b",
	type: "#e6c07b",
	literal: "#d19a66",
	number: "#d19a66",
	string: "#98c379",
	subst: "#e06c75",
	symbol: "#61afef",
	class: "#e6c07b",
	function: "#61afef",
	title: "#61afef",
	"title.function": "#61afef",
	"title.class": "#e6c07b",
	params: "#abb2bf",
	comment: "#5c6370",
	doctag: "#c678dd",
	meta: "#e06c75",
	"meta keyword": "#c678dd",
	"meta string": "#98c379",
	attr: "#d19a66",
	attribute: "#d19a66",
	variable: "#e06c75",
	"variable.language": "#e06c75",
	regexp: "#98c379",
	selector: "#e06c75",
	tag: "#e06c75",
	name: "#e06c75",
	property: "#61afef",
	operator: "#56b6c2",
	punctuation: "#abb2bf",
	addition: "#98c379",
	deletion: "#e06c75",
};

interface HljsNode {
	children?: (string | HljsNode)[];
	scope?: string;
}

function renderTokens(
	node: HljsNode,
	baseColor: string,
	keyPrefix = "",
): React.ReactNode[] {
	if (!node.children) return [];
	return node.children.map((child, i) => {
		const key = `${keyPrefix}${i}`;
		if (typeof child === "string") {
			return (
				<Text key={key} style={{ color: baseColor }}>
					{child}
				</Text>
			);
		}
		const color = (child.scope && SCOPE_COLORS[child.scope]) || baseColor;
		const nested = renderTokens(child, color, `${key}-`);
		return <Text key={key}>{nested}</Text>;
	});
}

interface CodeBlockProps {
	code: string;
	language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
	const { colors } = useTheme();
	const [copied, setCopied] = useState(false);

	const highlighted = useMemo(() => {
		try {
			if (language && hljs.getLanguage(language)) {
				return hljs.highlight(code, { language });
			}
			return hljs.highlightAuto(code);
		} catch {
			return null;
		}
	}, [code, language]);

	const tokens = useMemo(() => {
		const emitter = highlighted?._emitter as any;
		if (!emitter?.rootNode) {
			return <Text style={{ color: colors.foreground }}>{code}</Text>;
		}
		return renderTokens(emitter.rootNode as HljsNode, colors.foreground);
	}, [highlighted, code, colors.foreground]);

	const handleCopy = useCallback(async () => {
		await Clipboard.setStringAsync(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [code]);

	const displayLang = language || highlighted?.language || "";

	return (
		<View style={[styles.container, { backgroundColor: colors.card }]}>
			<View
				style={[styles.header, { borderBottomColor: colors.border }]}
			>
				<Text style={[styles.language, { color: colors.mutedForeground }]}>
					{displayLang}
				</Text>
				<Pressable onPress={handleCopy} style={styles.copyButton}>
					<Text style={[styles.copyText, { color: colors.mutedForeground }]}>
						{copied ? "Copied!" : "Copy"}
					</Text>
				</Pressable>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.scrollView}
			>
				<Text style={styles.codeText} selectable>
					{tokens}
				</Text>
			</ScrollView>
		</View>
	);
}

export default React.memo(CodeBlock);

const styles = StyleSheet.create({
	container: {
		borderRadius: 8,
		marginVertical: 8,
		overflow: "hidden",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	language: {
		fontSize: 12,
		fontFamily: "Menlo",
		textTransform: "lowercase",
	},
	copyButton: {
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	copyText: {
		fontSize: 12,
	},
	scrollView: {
		padding: 12,
	},
	codeText: {
		fontSize: 14,
		lineHeight: 20,
		fontFamily: "Menlo",
	},
});
