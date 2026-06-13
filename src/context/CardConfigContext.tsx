import {
	createContext,
	useCallback,
	useContext,
	useRef,
	useState,
} from "react";

/**
 * Shared selection state for the card-detail screen and its configure
 * formSheet. The sheet is pushed over the detail screen (which stays mounted),
 * so both read/write this single source of truth and stay in sync live.
 *
 * Only the *selection* lives here — card data and the derived option lists are
 * recomputed in each screen from the cached `["card", id]` query, so the
 * context stays tiny and free of any data-fetching logic.
 */
export interface CardSelection {
	variant: string;
	pricingTab: string; // "Raw" | "Graded"
	rawCondition: string;
	gradedCompany: string | null;
	gradedGrade: string | null;
	pricePaid: string;
}

interface CardConfigValue extends CardSelection {
	cardId: string | null;
	setVariant: (v: string) => void;
	setPricingTab: (v: string) => void;
	setRawCondition: (v: string) => void;
	setGradedCompany: (v: string | null) => void;
	setGradedGrade: (v: string | null) => void;
	setPricePaid: (v: string) => void;
	/**
	 * Initialise the selection for a card. No-ops if the same card is already
	 * seeded, so it's safe to call from an effect on every render.
	 */
	seed: (cardId: string, initial: CardSelection) => void;
}

const DEFAULT_SELECTION: CardSelection = {
	variant: "",
	pricingTab: "Raw",
	rawCondition: "NM",
	gradedCompany: null,
	gradedGrade: null,
	pricePaid: "",
};

const CardConfigContext = createContext<CardConfigValue | null>(null);

export function CardConfigProvider({ children }: { children: React.ReactNode }) {
	const [cardId, setCardId] = useState<string | null>(null);
	const [selection, setSelection] = useState<CardSelection>(DEFAULT_SELECTION);
	const seededId = useRef<string | null>(null);

	const seed = useCallback((id: string, initial: CardSelection) => {
		if (seededId.current === id) return;
		seededId.current = id;
		setCardId(id);
		setSelection(initial);
	}, []);

	const setVariant = useCallback(
		(v: string) => setSelection((s) => ({ ...s, variant: v })),
		[],
	);
	const setPricingTab = useCallback(
		(v: string) => setSelection((s) => ({ ...s, pricingTab: v })),
		[],
	);
	const setRawCondition = useCallback(
		(v: string) => setSelection((s) => ({ ...s, rawCondition: v })),
		[],
	);
	const setGradedCompany = useCallback(
		(v: string | null) => setSelection((s) => ({ ...s, gradedCompany: v })),
		[],
	);
	const setGradedGrade = useCallback(
		(v: string | null) => setSelection((s) => ({ ...s, gradedGrade: v })),
		[],
	);
	const setPricePaid = useCallback(
		(v: string) => setSelection((s) => ({ ...s, pricePaid: v })),
		[],
	);

	return (
		<CardConfigContext.Provider
			value={{
				cardId,
				...selection,
				setVariant,
				setPricingTab,
				setRawCondition,
				setGradedCompany,
				setGradedGrade,
				setPricePaid,
				seed,
			}}
		>
			{children}
		</CardConfigContext.Provider>
	);
}

export function useCardConfig(): CardConfigValue {
	const ctx = useContext(CardConfigContext);
	if (!ctx) {
		throw new Error("useCardConfig must be used within a CardConfigProvider");
	}
	return ctx;
}
