import { useCallback, useRef, useState } from "react";

import { useAuth } from "@clerk/clerk-expo";

import type { Message } from "@/types/chat";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export function useChat() {
	const { getToken } = useAuth();
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const abortRef = useRef<{ abort: () => void } | null>(null);

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

				const responseText = await new Promise<string>(
					(resolve, reject) => {
						const xhr = new XMLHttpRequest();
						xhr.open("POST", `${API_URL}/api/chat`);
						xhr.setRequestHeader("Content-Type", "application/json");
						if (token) {
							xhr.setRequestHeader("Authorization", `Bearer ${token}`);
						}
						xhr.timeout = 60000;

						xhr.onprogress = () => {
							setStreamingContent(xhr.responseText);
						};

						xhr.onload = () => {
							if (xhr.status >= 200 && xhr.status < 300) {
								resolve(xhr.responseText);
							} else {
								reject(new Error(`HTTP ${xhr.status}`));
							}
						};

						xhr.onabort = () => {
							const err = new Error("Aborted");
							err.name = "AbortError";
							reject(err);
						};

						xhr.onerror = () => reject(new Error("Network error"));
						xhr.ontimeout = () => reject(new Error("Request timed out"));

						xhr.send(
							JSON.stringify({
								messages: [...messages, userMessage].map((m) => ({
									role: m.role,
									content: m.content,
								})),
							}),
						);

						abortRef.current = { abort: () => xhr.abort() };
					},
				);

				const assistantMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: responseText,
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
