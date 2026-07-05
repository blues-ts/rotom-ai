import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@clerk/clerk-expo";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

import type { Message } from "@/types/chat";
import { createSSEParser } from "@/lib/parseSSE";
import type { ParsedEvent } from "@/lib/parseSSE";
import { useCollectionSnapshot } from "@/hooks/useCollectionSnapshot";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Pacing model: clock-based reveal driven by requestAnimationFrame instead of
// a fixed setInterval. The old 32ms interval beat against the display refresh
// (reveals landing at irregular frame offsets read as stutter) and a delayed
// tick dumped its whole backlog in one lurch. Here the reveal position
// advances by rate·dt each frame — a dropped frame self-corrects on the next
// one — and the rate itself glides toward a backlog-proportional target, so
// the text flows at constant perceived velocity at any model speed.
const MIN_RATE_CPS = 70; // gentle typewriter floor when caught up
const MAX_RATE_CPS = 200; // catch-up ceiling so a huge tail can't teleport
const CATCHUP_PER_SEC = 2; // target rate ≈ backlog × this (~500ms to converge)
const RATE_SMOOTHING = 8; // 1/s — rate covers ~63% of a target step in 125ms
// Text commits are throttled to ~30Hz — word arrivals above that are
// imperceptible. The fade frontier publishes faster (~60Hz) through the
// lead store so the brightness ramp animates like water, but only the
// streaming text subscribes to it, so those ticks re-render nothing else.
const COMMIT_INTERVAL_MS = 33;
const LEAD_PUBLISH_INTERVAL_MS = 16;
// Safety valve: if the post-stream drain somehow can't finish, flush rather
// than hang the finalization. Generous because the backend bursts whole
// replies: at the slow reveal ceiling a long tail legitimately takes tens of
// seconds to play out after the stream ends — the valve is for pathology
// (a wedged drain), not for normal long reveals.
const DRAIN_SETTLE_TIMEOUT_MS = 60000;
// Abort the stream only after this long with no incoming data, so long
// responses aren't cut off by a fixed total timeout.
const STREAM_INACTIVITY_TIMEOUT_MS = 30000;

/**
 * Minimal external store for the reveal clock's fractional lead past the
 * committed text. StreamingMessage subscribes via useSyncExternalStore, so
 * the ~60Hz fade ticks re-render ONLY the streaming text — routing this
 * through React state re-rendered the whole screen tree on every tick.
 */
export interface LeadStore {
	get: () => number;
	subscribe: (listener: () => void) => () => void;
}

function errorCopy(error: Error): string {
	if (error.message === "Request timed out") {
		return "The response took too long. Please try again.";
	}
	if (/network/i.test(error.message)) {
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

// Pro gating happens BEFORE sendMessage (Home's handleChatSend): the
// paywall shows in place of a send, and the drafted text stays in the input.
export function useChat() {
	const { getToken } = useAuth();
	const { data: collectionSnapshot } = useCollectionSnapshot();
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [activeTool, setActiveTool] = useState<{
		name: string;
		status: "loading" | "done";
	} | null>(null);

	const abortRef = useRef<AbortController | null>(null);
	// Mirror of `messages` so retryLast/sendMessage can read the latest list
	// without stale-closure issues.
	const messagesRef = useRef<Message[]>([]);
	const bufferRef = useRef("");
	const fullMarkdownRef = useRef("");
	// Committed (integer) reveal boundary vs the fractional clock position the
	// frame loop advances between commits.
	const displayedLenRef = useRef(0);
	const revealPosRef = useRef(0);
	const rateRef = useRef(MIN_RATE_CPS);
	const rafRef = useRef<number | null>(null);
	const lastFrameTsRef = useRef<number | null>(null);
	const lastCommitTsRef = useRef(0);
	// Set once the stream has ended and finalization is waiting on the reveal
	// to catch up; the frame loop calls it when everything is on screen.
	const onDrainedRef = useRef<(() => void) | null>(null);
	// Lead store: how far the continuous reveal clock has advanced past the
	// committed (word-snapped) text, in chars. Published ~60Hz while the
	// clock moves so the word fade brightens smoothly between arrivals.
	const leadValueRef = useRef(0);
	const leadListenersRef = useRef(new Set<() => void>());
	const leadStoreRef = useRef<LeadStore>({
		get: () => leadValueRef.current,
		subscribe: (listener: () => void) => {
			leadListenersRef.current.add(listener);
			return () => {
				leadListenersRef.current.delete(listener);
			};
		},
	});
	const lastLeadPublishTsRef = useRef(0);

	const publishLead = useCallback((value: number) => {
		if (Math.abs(value - leadValueRef.current) < 0.05) return;
		leadValueRef.current = value;
		for (const listener of leadListenersRef.current) listener();
	}, []);
	// Distinguishes the user's Stop button (keep the partial reply) from a
	// New Chat / unmount abort (discard it).
	const stoppedRef = useRef(false);

	const stopRevealLoop = useCallback(() => {
		if (rafRef.current != null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
	}, []);

	const startRevealLoop = useCallback(() => {
		if (rafRef.current != null) return;
		lastFrameTsRef.current = null;
		rateRef.current = MIN_RATE_CPS;

		const frame = (now: number) => {
			const bufLen = bufferRef.current.length;
			const lastTs = lastFrameTsRef.current;
			lastFrameTsRef.current = now;
			// Clamp dt so a backgrounded/paused gap can't teleport the reveal.
			const dt = lastTs == null ? 0 : Math.min(0.1, (now - lastTs) / 1000);

			const backlog = bufLen - revealPosRef.current;
			const targetRate = Math.min(
				MAX_RATE_CPS,
				Math.max(MIN_RATE_CPS, backlog * CATCHUP_PER_SEC),
			);
			rateRef.current +=
				(targetRate - rateRef.current) * Math.min(1, dt * RATE_SMOOTHING);
			revealPosRef.current = Math.min(
				bufLen,
				revealPosRef.current + rateRef.current * dt,
			);

			// The fade frontier publishes at ~60Hz, independent of the
			// slower text commits — only StreamingMessage subscribes.
			if (
				now - lastLeadPublishTsRef.current >=
				LEAD_PUBLISH_INTERVAL_MS
			) {
				lastLeadPublishTsRef.current = now;
				publishLead(
					revealPosRef.current - displayedLenRef.current,
				);
			}

			if (now - lastCommitTsRef.current >= COMMIT_INTERVAL_MS) {
				lastCommitTsRef.current = now;
				const paced = Math.floor(revealPosRef.current);
				// Words appear whole by snapping BACKWARD to the last
				// whitespace at or before the paced position — a word is
				// held until the pace fully crosses it. (Snapping forward
				// rounded every commit up to the next word end, which made
				// the effective floor ~one word per commit and defeated the
				// rate constants entirely.) At the buffer end, reveal
				// everything so the drain can finish.
				let newLen = paced;
				if (paced < bufLen) {
					const buf = bufferRef.current;
					let boundary = paced;
					while (
						boundary > displayedLenRef.current &&
						buf[boundary - 1] !== " " &&
						buf[boundary - 1] !== "\n" &&
						buf[boundary - 1] !== "\t"
					) {
						boundary--;
					}
					if (boundary > displayedLenRef.current) {
						newLen = boundary;
					} else {
						// No boundary crossed yet (e.g. a long unbroken
						// token like a URL): hold the display until the
						// pace clears it.
						newLen = displayedLenRef.current;
					}
				}
				if (newLen > displayedLenRef.current) {
					displayedLenRef.current = newLen;
					setStreamingContent(bufferRef.current.slice(0, newLen));
				}
				if (
					displayedLenRef.current >= bufLen &&
					onDrainedRef.current
				) {
					publishLead(0);
					const done = onDrainedRef.current;
					onDrainedRef.current = null;
					rafRef.current = null;
					done();
					return;
				}
			}
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
	}, [publishLead]);

	// Resolve once the reveal has caught up with the buffer — the smooth
	// replacement for the old dump-it-all flush at stream end.
	const waitForDrain = useCallback(() => {
		return new Promise<void>((resolve) => {
			if (
				rafRef.current == null ||
				displayedLenRef.current >= bufferRef.current.length
			) {
				resolve();
				return;
			}
			const settle = setTimeout(() => {
				onDrainedRef.current = null;
				resolve();
			}, DRAIN_SETTLE_TIMEOUT_MS);
			onDrainedRef.current = () => {
				clearTimeout(settle);
				resolve();
			};
		});
	}, []);

	// Reset every stream ref and commit the end-of-stream state in ONE
	// synchronous block: React batches it into a single commit, so the
	// streamed header content disappears and the finished message appears in
	// the same frame — rendered through the same MarkdownBlock components,
	// the handoff is invisible by construction. (The old two-microtask
	// finalize could flash a frame with both or neither visible.)
	const finalizeStream = useCallback(
		(message: Message | null) => {
			stopRevealLoop();
			onDrainedRef.current = null;
			bufferRef.current = "";
			fullMarkdownRef.current = "";
			displayedLenRef.current = 0;
			revealPosRef.current = 0;
			abortRef.current = null;
			if (message) {
				setMessages((prev) => [...prev, message]);
			}
			setIsStreaming(false);
			setStreamingContent("");
			publishLead(0);
			setActiveTool(null);
		},
		[stopRevealLoop, publishLead],
	);

	// Clean up on unmount
	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			stopRevealLoop();
		};
	}, [stopRevealLoop]);

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	const handleEvent = useCallback(
		(event: ParsedEvent) => {
			switch (event.type) {
				case "text":
					if (bufferRef.current.length === 0 && event.content) {
						// First token: a small tick makes the reply feel alive
						// the instant it starts.
						void Haptics.selectionAsync();
					}
					bufferRef.current += event.content;
					startRevealLoop();
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
		[startRevealLoop],
	);

	const sendMessage = useCallback(
		async (text: string) => {
			if (isStreaming) return;

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
			publishLead(0);
			setActiveTool(null);
			bufferRef.current = "";
			fullMarkdownRef.current = "";
			displayedLenRef.current = 0;
			revealPosRef.current = 0;
			lastCommitTsRef.current = 0;
			stoppedRef.current = false;

			const controller = new AbortController();
			abortRef.current = controller;

			let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
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
					controller.abort();
				}, STREAM_INACTIVITY_TIMEOUT_MS);
			};

			try {
				const token = await getToken();
				resetInactivityTimer();

				// expo/fetch streams the body for real: tokens land within
				// milliseconds of hitting the socket, where the old XHR path
				// batched progress events into lumps (especially on Android) —
				// lumpy input no pacer can fully hide.
				const res = await expoFetch(`${API_URL}/api/chat`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({
						messages: history.map((m) => ({
							role: m.role,
							content: m.content,
						})),
						collectionContext: collectionSnapshot ?? undefined,
					}),
					signal: controller.signal,
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				if (!res.body) throw new Error("Network error");

				const parser = createSSEParser();
				const decoder = new TextDecoder();
				const reader = res.body.getReader();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					resetInactivityTimer();
					const chunk = decoder.decode(value, { stream: true });
					for (const event of parser.push(chunk)) {
						handleEvent(event);
					}
				}
				clearInactivityTimer();
				// Flush any partial UTF-8 sequence and undelimited final event.
				const rest = decoder.decode();
				for (const event of parser.push(rest)) {
					handleEvent(event);
				}
				for (const event of parser.flush()) {
					handleEvent(event);
				}

				// Let the reveal catch up at its own pace instead of dumping
				// the tail in one frame.
				await waitForDrain();

				// Stopped during the drain (request already complete, reveal
				// still catching up): freeze at what's revealed, don't swap in
				// the full answer.
				if (stoppedRef.current) {
					const partial = bufferRef.current.trim();
					finalizeStream(
						partial
							? {
									id: (Date.now() + 1).toString(),
									role: "assistant",
									content: partial,
									createdAt: new Date().toISOString(),
									status: "complete",
								}
							: null,
					);
					return;
				}

				// Empty content = the model produced nothing (server already
				// retried once) — surface it as an error so the retry button
				// shows instead of a dead-end "complete" message.
				const content =
					fullMarkdownRef.current.trim() || bufferRef.current.trim();
				finalizeStream({
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content:
						content ||
						"Sorry, I wasn't able to generate a response. Please try again.",
					createdAt: new Date().toISOString(),
					status: content ? "complete" : "error",
				});
			} catch (error) {
				clearInactivityTimer();

				if (controller.signal.aborted && !timedOut) {
					if (stoppedRef.current) {
						// Stop button: keep exactly what's on screen as a
						// finished message (ChatGPT behavior), dropping the
						// unrevealed backlog.
						const partial = bufferRef.current
							.slice(0, displayedLenRef.current)
							.trim();
						finalizeStream(
							partial
								? {
										id: (Date.now() + 1).toString(),
										role: "assistant",
										content: partial,
										createdAt: new Date().toISOString(),
										status: "complete",
									}
								: null,
						);
					} else {
						// New chat / unmount: discard silently.
						finalizeStream(null);
					}
					return;
				}

				// Keep whatever streamed before the failure instead of
				// discarding it.
				const err = timedOut
					? new Error("Request timed out")
					: (error as Error);
				const partial = bufferRef.current.trim();
				const copy = errorCopy(err);
				finalizeStream({
					id: (Date.now() + 1).toString(),
					role: "assistant",
					content: partial ? `${partial}\n\n_${copy}_` : copy,
					createdAt: new Date().toISOString(),
					status: "error",
				});
			} finally {
				clearInactivityTimer();
			}
		},
		[
			isStreaming,
			getToken,
			handleEvent,
			waitForDrain,
			finalizeStream,
			publishLead,
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

	// ChatGPT-style stop: abort the request and keep the revealed partial
	// reply as a completed message. Truncating the buffer to the revealed
	// point makes an in-flight drain complete on its next frame, so the stop
	// lands immediately even when the request already finished.
	const stopStreaming = useCallback(() => {
		if (!abortRef.current) return;
		stoppedRef.current = true;
		bufferRef.current = bufferRef.current.slice(
			0,
			displayedLenRef.current,
		);
		abortRef.current.abort();
	}, []);

	const startNewChat = useCallback(() => {
		abortRef.current?.abort();
		setMessages([]);
		finalizeStream(null);
	}, [finalizeStream]);

	return {
		messages,
		streamingContent,
		streamingLeadStore: leadStoreRef.current,
		isStreaming,
		activeTool,
		sendMessage,
		retryLast,
		stopStreaming,
		startNewChat,
	};
}
