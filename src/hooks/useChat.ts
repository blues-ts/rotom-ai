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

						let lastFlushedLength = 0;
						let wordQueue: string[] = [];
						let animFrameId: number | null = null;

						const WORDS_PER_TICK = 1;
						const TICK_MS = 50;

						const drain = () => {
							if (wordQueue.length > 0) {
								const batch = wordQueue.splice(0, WORDS_PER_TICK).join("");
								setStreamingContent((prev) => prev + batch);
								animFrameId = setTimeout(drain, TICK_MS) as unknown as number;
							} else {
								animFrameId = null;
							}
						};

						const flushRemaining = (onDone?: () => void) => {
							if (animFrameId !== null) {
								clearTimeout(animFrameId);
								animFrameId = null;
							}
							if (wordQueue.length > 0) {
								const remaining = wordQueue.splice(0).join("");
								setStreamingContent((prev) => prev + remaining);
							}
							onDone?.();
						};

						// Let the drain finish naturally, then call onComplete
						const waitForDrain = (onComplete: () => void) => {
							const check = () => {
								if (wordQueue.length === 0 && animFrameId === null) {
									onComplete();
								} else if (wordQueue.length > 0 && animFrameId === null) {
									// Queue has items but drain stopped — restart it
									animFrameId = setTimeout(drain, TICK_MS) as unknown as number;
									setTimeout(check, TICK_MS);
								} else {
									setTimeout(check, TICK_MS);
								}
							};
							check();
						};

						xhr.onprogress = () => {
							const newText = xhr.responseText.slice(lastFlushedLength);
							lastFlushedLength = xhr.responseText.length;

							const chunks = newText.match(/\S+\s*|\s+/g);
							if (chunks) wordQueue.push(...chunks);

							if (animFrameId === null) {
								animFrameId = setTimeout(drain, 30) as unknown as number;
							}
						};

						xhr.onload = () => {
							// Capture any final text not yet seen by onprogress
							const finalText = xhr.responseText.slice(lastFlushedLength);
							if (finalText) {
								const chunks = finalText.match(/\S+\s*|\s+/g);
								if (chunks) wordQueue.push(...chunks);
							}
							// Let remaining words drain at the same smooth pace
							waitForDrain(() => {
								if (xhr.status >= 200 && xhr.status < 300) {
									resolve(xhr.responseText);
								} else {
									reject(new Error(`HTTP ${xhr.status}`));
								}
							});
						};

						xhr.onabort = () => {
							flushRemaining();
							const err = new Error("Aborted");
							err.name = "AbortError";
							reject(err);
						};

						xhr.onerror = () => {
							flushRemaining();
							reject(new Error("Network error"));
						};
						xhr.ontimeout = () => {
							flushRemaining();
							reject(new Error("Request timed out"));
						};

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
