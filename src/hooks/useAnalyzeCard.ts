import { useApi } from "@/lib/axios";
import { useMutation } from "@tanstack/react-query";

interface CardAnalysisResponse {
	success: true;
	data: {
		id: string;
		name: string;
		cardNumber: string;
		setName: string;
		setSlug: string;
		rarity: string;
		image: string;
		variant: string;
		currency: string;
		prices: Record<string, any>;
		lastUpdated: string;
	};
	scannedData: {
		name: string;
		cardNumber: string;
		setName: string;
		confidence: number;
		alternates: { cardNumber: string; confidence: number }[];
	};
	matchedBy: string;
}

export const useAnalyzeCard = () => {
	const api = useApi();

	return useMutation({
		mutationFn: async (base64: string): Promise<CardAnalysisResponse> => {
			const base64Only = base64.replace(/^data:image\/[a-z]+;base64,/, "");
			const response = await api.post<CardAnalysisResponse>("/api/cards/analyze-card", {
				imageBase64: base64Only,
			});
			return response.data;
		},
	});
};
