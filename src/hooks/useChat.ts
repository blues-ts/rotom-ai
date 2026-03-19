import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@clerk/clerk-expo";

import type { Message } from "@/types/chat";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DRAIN_INTERVAL_MS = 16;
const CHARS_PER_TICK = 4;

export function useChat() {
	const { getToken } = useAuth();
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const abortRef = useRef<{ abort: () => void } | null>(null);
	const bufferRef = useRef("");
	const displayedLenRef = useRef(0);
	const drainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const clearDrainInterval = useCallback(() => {
		if (drainIntervalRef.current) {
			clearInterval(drainIntervalRef.current);
			drainIntervalRef.current = null;
		}
	}, []);

	const startDrainInterval = useCallback(() => {
		clearDrainInterval();
		drainIntervalRef.current = setInterval(() => {
			const bufLen = bufferRef.current.length;
			const dispLen = displayedLenRef.current;
			if (bufLen > dispLen) {
				const newLen = Math.min(dispLen + CHARS_PER_TICK, bufLen);
				displayedLenRef.current = newLen;
				setStreamingContent(bufferRef.current.slice(0, newLen));
			}
		}, DRAIN_INTERVAL_MS);
	}, [clearDrainInterval]);

	const flushBuffer = useCallback(() => {
		clearDrainInterval();
		if (bufferRef.current) {
			displayedLenRef.current = bufferRef.current.length;
			setStreamingContent(bufferRef.current);
		}
	}, [clearDrainInterval]);

	const resetStreamingState = useCallback(() => {
		clearDrainInterval();
		bufferRef.current = "";
		displayedLenRef.current = 0;
		setIsStreaming(false);
		setStreamingContent("");
		abortRef.current = null;
	}, [clearDrainInterval]);

	// Clean up on unmount
	useEffect(() => clearDrainInterval, [clearDrainInterval]);

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
			bufferRef.current = "";
			displayedLenRef.current = 0;

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
							bufferRef.current = xhr.responseText;
							// Start drain interval on first chunk
							if (!drainIntervalRef.current) {
								startDrainInterval();
							}
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

				// Flush any remaining buffered text before creating final message
				flushBuffer();

				const assistantMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content:
						responseText.trim() ||
						"Sorry, I wasn't able to generate a response. Please try again.",
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
				resetStreamingState();
			}
		},
		[isStreaming, messages, getToken, startDrainInterval, flushBuffer, resetStreamingState],
	);

	const startNewChat = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
		}
		setMessages([]);
		resetStreamingState();
	}, [resetStreamingState]);

	return {
		messages,
		streamingContent,
		isStreaming,
		sendMessage,
		startNewChat,
	};
}
