export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: string;
	status?: "streaming" | "complete";
	tool?: {
		name: string;
		status: "loading" | "done";
	};
}
