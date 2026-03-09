import { useCallback, useRef, useState } from "react";

import { useAuth } from "@clerk/clerk-expo";

import type { Message } from "@/types/chat";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export function useChat() {
	const { getToken } = useAuth();
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const sendMessage = useCallback(
		async (text: string) => {
			if (isStreaming) return;

			const userMessage: Message = {
				id: Date.now().toString(),
				role: "user",
				content: text,
				createdAt: new Date().toISOString(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setIsStreaming(true);
			setStreamingContent("");

			try {
				const token = await getToken();
				const controller = new AbortController();
				abortRef.current = controller;

				const response = await fetch(`${API_URL}/api/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({
						messages: [...messages, userMessage].map((m) => ({
							role: m.role,
							content: m.content,
						})),
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const reader = response.body?.getReader();
				if (!reader) throw new Error("No response body");

				const decoder = new TextDecoder();
				let accumulated = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split("\n");

					for (const line of lines) {
						if (line.startsWith("data: ")) {
							const data = line.slice(6);
							if (data === "[DONE]") continue;
							try {
								const parsed = JSON.parse(data);
								if (parsed.content) {
									accumulated += parsed.content;
									setStreamingContent(accumulated);
								}
							} catch {
								// Non-JSON line, treat as raw text
								accumulated += data;
								setStreamingContent(accumulated);
							}
						}
					}
				}

				const assistantMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: accumulated,
					createdAt: new Date().toISOString(),
				};

				setMessages((prev) => [...prev, assistantMessage]);
			} catch (error) {
				if ((error as Error).name === "AbortError") return;

				const errorMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: "Sorry, something went wrong. Please try again.",
					createdAt: new Date().toISOString(),
				};
				setMessages((prev) => [...prev, errorMessage]);
			} finally {
				setIsStreaming(false);
				setStreamingContent("");
				abortRef.current = null;
			}
		},
		[isStreaming, messages, getToken],
	);

	const startNewChat = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
		}
		setMessages([]);
		setStreamingContent("");
		setIsStreaming(false);
	}, []);

	return {
		messages,
		streamingContent,
		isStreaming,
		sendMessage,
		startNewChat,
	};
}
