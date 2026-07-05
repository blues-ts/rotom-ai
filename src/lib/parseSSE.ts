export type ParsedEvent =
	| { type: "text"; content: string }
	| { type: "tool_call"; name: string }
	| { type: "tool_result"; name?: string }
	| { type: "done"; content?: string };

/**
 * Incremental SSE parser. Network chunks can split an event at any byte, so
 * a stateless per-chunk parse silently drops the event that straddles the
 * boundary (the old XHR path lost tokens this way). The parser carries the
 * unfinished remainder between pushes and only emits complete `data:` events.
 */
export function createSSEParser() {
	let carry = "";

	const parseEvent = (raw: string): ParsedEvent | null => {
		const line = raw.trim();
		if (!line.startsWith("data: ")) return null;
		try {
			return JSON.parse(line.slice(6)) as ParsedEvent;
		} catch {
			// Skip malformed JSON
			return null;
		}
	};

	return {
		push(chunk: string): ParsedEvent[] {
			carry += chunk;
			const events: ParsedEvent[] = [];
			let sep = carry.indexOf("\n\n");
			while (sep !== -1) {
				const event = parseEvent(carry.slice(0, sep));
				carry = carry.slice(sep + 2);
				if (event) events.push(event);
				sep = carry.indexOf("\n\n");
			}
			return events;
		},
		/** Emit a trailing event that arrived without its final delimiter. */
		flush(): ParsedEvent[] {
			const event = parseEvent(carry);
			carry = "";
			return event ? [event] : [];
		},
	};
}
