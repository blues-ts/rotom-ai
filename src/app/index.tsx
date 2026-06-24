import { useEffect, useState } from "react";
import { type Href, Redirect, router, SplashScreen } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import AppInitScreen from "@/components/AppInitScreen";
import { CATALOG_SETS_KEY } from "@/hooks/usePrefetchExpansions";
import { getCatalogSets } from "@/lib/api/catalog";
import { useApi } from "@/lib/axios";

const ONBOARDING_KEY = "onboarding_complete";

// Warm-up gate budget. MIN avoids a flash if everything is already cached; MAX
// guarantees we never trap the user — we proceed to home regardless once it hits.
const MIN_GATE_MS = 2000;
const MAX_GATE_MS = 4000;

export default function Index() {
	const { isSignedIn, isLoaded } = useAuth();
	const [onboarded, setOnboarded] = useState<boolean | null>(null);

	useEffect(() => {
		SecureStore.getItemAsync(ONBOARDING_KEY).then((value) =>
			setOnboarded(value === "true"),
		);
	}, []);

	// Routing not yet known → keep the native splash up (render nothing).
	if (onboarded === null || !isLoaded) return null;

	// Onboarding / auth don't need the app's data warmed, so go straight there.
	if (!onboarded) return <RedirectWithSplash href="/(onboarding)/welcome" />;
	if (!isSignedIn) return <RedirectWithSplash href="/(auth)" />;

	// Signed in → warm essentials behind a branded gate, then enter the app.
	return <InitGate />;
}

/** Hide the native splash, then redirect (no warm-up needed for this path). */
function RedirectWithSplash({ href }: { href: Href }) {
	useEffect(() => {
		SplashScreen.hideAsync();
	}, []);
	return <Redirect href={href} />;
}

/**
 * Shown only on the cold-start path into the app. Warms the essentials the home
 * screen needs (the sets list) so it renders instantly, then replaces itself with
 * home. The heavy scanner index keeps warming in the background (started in the
 * root layout) and is NOT gated on here — so the app opens fast and the camera
 * becomes ready shortly after.
 */
function InitGate() {
	const queryClient = useQueryClient();
	const api = useApi();
	// `leaving` triggers the ascend animation; we navigate when it completes.
	const [leaving, setLeaving] = useState(false);

	useEffect(() => {
		// The branded gate now covers the screen, matching the native splash —
		// hide the native one so this view shows through seamlessly.
		SplashScreen.hideAsync();

		let started = false;
		const start = Date.now();
		const beginExit = () => {
			if (started) return;
			started = true;
			setLeaving(true);
		};

		// Resolve once essentials are warm, but never before MIN (no flash).
		void (async () => {
			try {
				await queryClient.fetchQuery({
					queryKey: CATALOG_SETS_KEY,
					queryFn: () => getCatalogSets(api),
					staleTime: 1000 * 60 * 60 * 24,
				});
			} catch {
				// Best-effort — home handles its own empty/error state.
			}
			const wait = Math.max(0, MIN_GATE_MS - (Date.now() - start));
			setTimeout(beginExit, wait);
		})();

		// Hard ceiling: start the exit no matter what.
		const ceiling = setTimeout(beginExit, MAX_GATE_MS);
		return () => clearTimeout(ceiling);
	}, [queryClient, api]);

	return (
		<AppInitScreen
			leaving={leaving}
			onExitComplete={() => router.replace("/(home)")}
		/>
	);
}
