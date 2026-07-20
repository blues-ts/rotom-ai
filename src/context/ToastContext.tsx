import {
	createContext,
	useCallback,
	useContext,
	useEffect,
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
// Longest exit timing in Toast (translateY: 220ms) plus a frame of slack.
const UNMOUNT_MS = 260;

type ToastContextValue = {
	show: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
	const [visible, setVisible] = useState(false);
	// Kept mounted through the exit animation, then torn down. The host is only
	// in the tree while this is true — see UNMOUNT_MS.
	const [mounted, setMounted] = useState(false);
	const [message, setMessage] = useState("");
	const [type, setType] = useState<ToastType>("error");
	const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = useCallback((nextMessage: string, nextType: ToastType = "error") => {
		if (dismissTimer.current) clearTimeout(dismissTimer.current);
		if (unmountTimer.current) clearTimeout(unmountTimer.current);
		setMessage(nextMessage);
		setType(nextType);
		setMounted(true);
		setVisible(true);
		dismissTimer.current = setTimeout(() => {
			setVisible(false);
			dismissTimer.current = null;
			// Drop the overlay itself once the slide-out has played. Leaving it
			// mounted-but-transparent means a toast raised over a native modal
			// can survive that modal's dismissal as a stuck frame, since the
			// overlay lives in its own UIWindow and stops taking updates.
			unmountTimer.current = setTimeout(() => {
				setMounted(false);
				unmountTimer.current = null;
			}, UNMOUNT_MS);
		}, AUTO_DISMISS_MS);
	}, []);

	useEffect(
		() => () => {
			if (dismissTimer.current) clearTimeout(dismissTimer.current);
			if (unmountTimer.current) clearTimeout(unmountTimer.current);
		},
		[],
	);

	const value = useMemo(() => ({ show }), [show]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			{mounted && (
				<ToastHost>
					<Toast visible={visible} message={message} type={type} />
				</ToastHost>
			)}
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
