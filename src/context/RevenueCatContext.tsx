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
import Purchases, { type CustomerInfo } from "react-native-purchases";
import { useAuth } from "@clerk/clerk-expo";

import {
  configureRevenueCat,
  hasProEntitlement,
  logInRevenueCat,
  logOutRevenueCat,
} from "@/lib/revenuecat";

interface RevenueCatContextValue {
  customerInfo: CustomerInfo | null;
  isPro: boolean;
  isReady: boolean;
  refresh: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded: clerkLoaded } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isReady, setIsReady] = useState(false);
  const lastSyncedUserId = useRef<string | null>(null);

  // Configure SDK once and seed initial customer info.
  useEffect(() => {
    let cancelled = false;

    try {
      configureRevenueCat();
    } catch (err) {
      console.warn("[RevenueCat] configure failed:", err);
      setIsReady(true);
      return;
    }

    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);

    Purchases.getCustomerInfo()
      .then((info) => {
        if (!cancelled) setCustomerInfo(info);
      })
      .catch((err) => {
        console.warn("[RevenueCat] getCustomerInfo failed:", err);
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Sync identity with Clerk: logIn on sign-in, logOut on sign-out.
  useEffect(() => {
    if (!clerkLoaded || !isReady) return;

    if (userId && lastSyncedUserId.current !== userId) {
      lastSyncedUserId.current = userId;
      logInRevenueCat(userId)
        .then((info) => setCustomerInfo(info))
        .catch((err) => console.warn("[RevenueCat] logIn failed:", err));
      return;
    }

    if (!userId && lastSyncedUserId.current !== null) {
      lastSyncedUserId.current = null;
      logOutRevenueCat()
        .then((info) => {
          if (info) setCustomerInfo(info);
        })
        .catch((err) => console.warn("[RevenueCat] logOut failed:", err));
    }
  }, [userId, clerkLoaded, isReady]);

  const refresh = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (err) {
      console.warn("[RevenueCat] refresh failed:", err);
    }
  }, []);

  const value = useMemo<RevenueCatContextValue>(
    () => ({
      customerInfo,
      isPro: hasProEntitlement(customerInfo),
      isReady,
      refresh,
    }),
    [customerInfo, isReady, refresh],
  );

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat(): RevenueCatContextValue {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) {
    throw new Error("useRevenueCat must be used inside a RevenueCatProvider");
  }
  return ctx;
}
