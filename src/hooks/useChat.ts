import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@clerk/clerk-expo";
import RevenueCatUI from "react-native-purchases-ui";

import type { Message } from "@/types/chat";
import { parseSSE } from "@/lib/parseSSE";
import type { ParsedEvent } from "@/lib/parseSSE";
import { useCollectionSnapshot } from "@/hooks/useCollectionSnapshot";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { PRO_ENTITLEMENT_ID } from "@/lib/revenuecat";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DRAIN_INTERVAL_MS = 16;
const CHARS_PER_TICK = 4;

export function useChat() {
	const { getToken } = useAuth();
	const { isPro } = useRevenueCat();
	const { data: collectionSnapshot } = useCollectionSnapshot();
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [activeTool, setActiveTool] = useState<{
		name: string;
		status: "loading" | "done";
	} | null>(null);

	const abortRef = useRef<{ abort: () => void } | null>(null);
	const bufferRef = useRef("");
	const fullMarkdownRef = useRef("");
	const displayedLenRef = useRef(0);
	const drainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const lastIndexRef = useRef(0);

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
		fullMarkdownRef.current = "";
		displayedLenRef.current = 0;
		lastIndexRef.current = 0;
		setIsStreaming(false);
		setStreamingContent("");
		setActiveTool(null);
		abortRef.current = null;
	}, [clearDrainInterval]);

	// Clean up on unmount
	useEffect(() => clearDrainInterval, [clearDrainInterval]);

	const handleEvent = useCallback(
		(event: ParsedEvent) => {
			switch (event.type) {
				case "text":
					bufferRef.current += event.content;
					if (!drainIntervalRef.current) {
						startDrainInterval();
					}
					break;

				case "tool_call":
					setActiveTool({ name: event.name, status: "loading" });
					break;

				case "tool_result":
					setActiveTool((prev) =>
						prev ? { ...prev, status: "done" } : null,
					);
					break;

				case "done":
					if (event.content) {
						fullMarkdownRef.current = event.content;
					}
					break;
			}
		},
		[startDrainInterval],
	);

	const sendMessage = useCallback(
		async (text: string) => {
			if (isStreaming) return;

			if (!isPro) {
				const gateMessage: Message = {
					id: Date.now().toString(),
					role: "assistant",
					content:
						"Chat with River is a Pro feature. Unlock River AI Pro to keep going.",
					createdAt: new Date().toISOString(),
					status: "complete",
				};
				setMessages((prev) => [...prev, gateMessage]);
				void RevenueCatUI.presentPaywallIfNeeded({
					requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
				});
				return;
			}

			const userMessage: Message = {
				id: Date.now().toString(),
				role: "user",
				content: text,
				createdAt: new Date().toISOString(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setIsStreaming(true);
			setStreamingContent("");
			setActiveTool(null);
			bufferRef.current = "";
			fullMarkdownRef.current = "";
			displayedLenRef.current = 0;
			lastIndexRef.current = 0;

			try {
				const token = await getToken();

				await new Promise<void>((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.open("POST", `${API_URL}/api/chat`);
					xhr.setRequestHeader("Content-Type", "application/json");
					if (token) {
						xhr.setRequestHeader("Authorization", `Bearer ${token}`);
					}
					xhr.timeout = 60000;

					xhr.onprogress = () => {
						// Extract only the new chunk since last read
						const newChunk = xhr.responseText.slice(
							lastIndexRef.current,
						);
						lastIndexRef.current = xhr.responseText.length;

						const events = parseSSE(newChunk);
						for (const event of events) {
							handleEvent(event);
						}
					};

					xhr.onload = () => {
						if (xhr.status >= 200 && xhr.status < 300) {
							// Process any remaining data
							const remaining = xhr.responseText.slice(
								lastIndexRef.current,
							);
							if (remaining) {
								const events = parseSSE(remaining);
								for (const event of events) {
									handleEvent(event);
								}
							}

							flushBuffer();

							const assistantMessage: Message = {
								id: (Date.now() + 1).toString(),
								role: "assistant",
								content:
									fullMarkdownRef.current.trim() ||
									bufferRef.current.trim() ||
									"Sorry, I wasn't able to generate a response. Please try again.",
								createdAt: new Date().toISOString(),
								status: "complete",
							};

							setMessages((prev) => [...prev, assistantMessage]);
							resolve();
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
					xhr.ontimeout = () =>
						reject(new Error("Request timed out"));

					xhr.send(
						JSON.stringify({
							messages: [...messages, userMessage].map((m) => ({
								role: m.role,
								content: m.content,
							})),
							collectionContext: collectionSnapshot ?? undefined,
						}),
					);

					abortRef.current = { abort: () => xhr.abort() };
				});
			} catch (error) {
				if ((error as Error).name === "AbortError") return;

				const errorMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: "Sorry, something went wrong. Please try again.",
					createdAt: new Date().toISOString(),
					status: "complete",
				};
				setMessages((prev) => [...prev, errorMessage]);
			} finally {
				resetStreamingState();
			}
		},
		[
			isStreaming,
			isPro,
			messages,
			getToken,
			handleEvent,
			flushBuffer,
			resetStreamingState,
			collectionSnapshot,
		],
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
		activeTool,
		sendMessage,
		startNewChat,
	};
}
