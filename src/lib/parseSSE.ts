export type ParsedEvent =
	| { type: "text"; content: string }
	| { type: "tool_call"; name: string }
	| { type: "tool_result"; name?: string }
	| { type: "done" };

/**
 * Parse a raw SSE chunk into structured events.
 * Each SSE message is delimited by \n\n and prefixed with "data: ".
 */
export function parseSSE(chunk: string): ParsedEvent[] {
	const events: ParsedEvent[] = [];
	const parts = chunk.split("\n\n");

	for (const part of parts) {
		const line = part.trim();
		if (!line.startsWith("data: ")) continue;

		try {
			events.push(JSON.parse(line.slice(6)));
		} catch {
			// Skip malformed JSON
		}
	}

	return events;
}
