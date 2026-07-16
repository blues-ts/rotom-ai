import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from "react";

/**
 * Pricing configuration chosen on the review screen before a batch add.
 * `condition` is always the RAW condition — when pricingType is "Graded" the
 * stored collection row gets condition "GRADED" instead (same convention as
 * the card-detail add), so flipping back to Raw keeps the user's pick.
 */
export type ScanCardConfig = {
	pricingType: "Raw" | "Graded";
	variant: string;
	condition: string;
	gradedCompany?: string;
	gradedGrade?: string;
	quantity: number;
};

export type ScannedCard = {
	id: string;
	/** Thumbnail URL — already what the scanner shows / the card grid caches. */
	image: string;
	/** On-device match score that locked this capture (0..1). */
	score: number;
	/** Epoch ms of capture — newest first in the session. */
	capturedAt: number;
	/** Set on the review screen; absent means "use the card's defaults". */
	config?: ScanCardConfig;
};

type ScanSessionContextValue = {
	scans: ScannedCard[];
	/** Number of distinct cards captured this session. */
	count: number;
	/**
	 * Add a capture to the session. Each distinct card is kept ONCE — re-scanning
	 * a card already in the session is a no-op (no multiples). Returns true when
	 * this was a brand-new card, false when it was already present.
	 */
	addScan: (card: { id: string; image: string; score: number }) => boolean;
	removeScan: (id: string) => void;
	/** Remove several cards at once (multi-select delete). */
	removeScans: (ids: string[]) => void;
	/** Store the review screen's pricing choices for one scanned card. */
	setScanConfig: (id: string, config: ScanCardConfig) => void;
	clearSession: () => void;
};

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);

export function ScanSessionProvider({ children }: { children: ReactNode }) {
	const [scans, setScans] = useState<ScannedCard[]>([]);

	const addScan = useCallback(
		(card: { id: string; image: string; score: number }) => {
			let isNew = false;
			setScans((prev) => {
				if (prev.some((s) => s.id === card.id)) return prev; // already captured
				isNew = true;
				return [{ ...card, capturedAt: Date.now() }, ...prev];
			});
			return isNew;
		},
		[],
	);

	const removeScan = useCallback((id: string) => {
		setScans((prev) => prev.filter((s) => s.id !== id));
	}, []);

	const removeScans = useCallback((ids: string[]) => {
		const drop = new Set(ids);
		setScans((prev) => prev.filter((s) => !drop.has(s.id)));
	}, []);

	const setScanConfig = useCallback((id: string, config: ScanCardConfig) => {
		setScans((prev) =>
			prev.map((s) => (s.id === id ? { ...s, config } : s)),
		);
	}, []);

	const clearSession = useCallback(() => setScans([]), []);

	const value = useMemo<ScanSessionContextValue>(
		() => ({
			scans,
			count: scans.length,
			addScan,
			removeScan,
			removeScans,
			setScanConfig,
			clearSession,
		}),
		[scans, addScan, removeScan, removeScans, setScanConfig, clearSession],
	);

	return (
		<ScanSessionContext.Provider value={value}>
			{children}
		</ScanSessionContext.Provider>
	);
}

export function useScanSession() {
	const context = useContext(ScanSessionContext);
	if (!context) {
		throw new Error("useScanSession must be used within a ScanSessionProvider");
	}
	return context;
}
