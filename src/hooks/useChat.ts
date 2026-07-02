import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@clerk/clerk-expo";

import type { Message } from "@/types/chat";
import { parseSSE } from "@/lib/parseSSE";
import type { ParsedEvent } from "@/lib/parseSSE";
import { useCollectionSnapshot } from "@/hooks/useCollectionSnapshot";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DRAIN_INTERVAL_MS = 16;
const CHARS_PER_TICK = 4;
// Abort the stream only after this long with no incoming data, so long
// responses aren't cut off by a fixed total timeout.
const STREAM_INACTIVITY_TIMEOUT_MS = 30000;

function errorCopy(error: Error): string {
	if (error.message === "Request timed out") {
		return "The response took too long. Please try again.";
	}
	if (error.message === "Network error") {
		return "You appear to be offline. Check your connection and try again.";
	}
	if (error.message === "HTTP 401") {
		return "Your session has expired. Please sign out and back in.";
	}
	if (error.message === "HTTP 429") {
		return "You're sending messages too quickly. Wait a moment and try again.";
	}
	return "Sorry, something went wrong. Please try again.";
}

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
	// Mirror of `messages` so retryLast/sendMessage can read the latest list
	// without stale-closure issues.
	const messagesRef = useRef<Message[]>([]);
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

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

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
				void presentProPaywallIfNeeded();
				return;
			}

			const userMessage: Message = {
				id: Date.now().toString(),
				role: "user",
				content: text,
				createdAt: new Date().toISOString(),
			};

			// Snapshot before setMessages so the request body can't pick up
			// the new user message twice once messagesRef syncs.
			const history = [...messagesRef.current, userMessage];

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

					let inactivityTimer: ReturnType<typeof setTimeout> | null =
						null;
					let timedOut = false;
					const clearInactivityTimer = () => {
						if (inactivityTimer) {
							clearTimeout(inactivityTimer);
							inactivityTimer = null;
						}
					};
					const resetInactivityTimer = () => {
						clearInactivityTimer();
						inactivityTimer = setTimeout(() => {
							timedOut = true;
							xhr.abort();
						}, STREAM_INACTIVITY_TIMEOUT_MS);
					};
					resetInactivityTimer();

					xhr.onprogress = () => {
						resetInactivityTimer();
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
						clearInactivityTimer();
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

							// Empty content = the model produced nothing (server already
							// retried once) — surface it as an error so the retry
							// button shows instead of a dead-end "complete" message.
							const content =
								fullMarkdownRef.current.trim() ||
								bufferRef.current.trim();
							const assistantMessage: Message = {
								id: (Date.now() + 1).toString(),
								role: "assistant",
								content:
									content ||
									"Sorry, I wasn't able to generate a response. Please try again.",
								createdAt: new Date().toISOString(),
								status: content ? "complete" : "error",
							};

							setMessages((prev) => [...prev, assistantMessage]);
							resolve();
						} else {
							reject(new Error(`HTTP ${xhr.status}`));
						}
					};

					xhr.onabort = () => {
						clearInactivityTimer();
						if (timedOut) {
							reject(new Error("Request timed out"));
							return;
						}
						const err = new Error("Aborted");
						err.name = "AbortError";
						reject(err);
					};

					xhr.onerror = () => {
						clearInactivityTimer();
						reject(new Error("Network error"));
					};
					xhr.ontimeout = () =>
						reject(new Error("Request timed out"));

					xhr.send(
						JSON.stringify({
							messages: history.map((m) => ({
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

				// Keep whatever streamed before the failure instead of
				// discarding it.
				const partial = bufferRef.current.trim();
				const copy = errorCopy(error as Error);
				const errorMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: partial ? `${partial}\n\n_${copy}_` : copy,
					createdAt: new Date().toISOString(),
					status: "error",
				};
				setMessages((prev) => [...prev, errorMessage]);
			} finally {
				resetStreamingState();
			}
		},
		[
			isStreaming,
			isPro,
			getToken,
			handleEvent,
			flushBuffer,
			resetStreamingState,
			collectionSnapshot,
		],
	);

	// Re-send the last user message after a failed response. Drops the failed
	// exchange from history first so it isn't replayed to the API.
	const retryLast = useCallback(() => {
		if (isStreaming) return;
		const current = messagesRef.current;
		const lastUserIndex = current.map((m) => m.role).lastIndexOf("user");
		if (lastUserIndex === -1) return;
		const text = current[lastUserIndex].content;
		const trimmed = current.slice(0, lastUserIndex);
		messagesRef.current = trimmed;
		setMessages(trimmed);
		void sendMessage(text);
	}, [isStreaming, sendMessage]);

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
		retryLast,
		startNewChat,
	};
}
