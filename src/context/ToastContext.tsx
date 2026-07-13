import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { Platform } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import Toast from "@/components/Toast";

// The toast must outrank NATIVE modal presentations (card/sealed detail are
// `modal`, add-to-collection is a `formSheet`) — a plain root-level overlay
// renders behind them all. FullWindowOverlay hosts it in its own UIWindow
// above every presented controller; empty areas pass touches through.
function ToastHost({ children }: { children: ReactNode }) {
	if (Platform.OS === "ios") {
		return <FullWindowOverlay>{children}</FullWindowOverlay>;
	}
	return <>{children}</>;
}

export type ToastType = "success" | "error";

const AUTO_DISMISS_MS = 2500;

type ToastContextValue = {
	show: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
	const [visible, setVisible] = useState(false);
	const [message, setMessage] = useState("");
	const [type, setType] = useState<ToastType>("error");
	const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = useCallback((nextMessage: string, nextType: ToastType = "error") => {
		if (dismissTimer.current) {
			clearTimeout(dismissTimer.current);
		}
		setMessage(nextMessage);
		setType(nextType);
		setVisible(true);
		dismissTimer.current = setTimeout(() => {
			setVisible(false);
			dismissTimer.current = null;
		}, AUTO_DISMISS_MS);
	}, []);

	const value = useMemo(() => ({ show }), [show]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<ToastHost>
				<Toast visible={visible} message={message} type={type} />
			</ToastHost>
		</ToastContext.Provider>
	);
}

export function useToast() {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return context;
}
