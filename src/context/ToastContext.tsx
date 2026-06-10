import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import Toast from "@/components/Toast";

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
			<Toast visible={visible} message={message} type={type} />
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
