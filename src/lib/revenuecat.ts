import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

export const PRO_ENTITLEMENT_ID = "River AI TCG Pro";

let configured = false;

export function configureRevenueCat(): void {
  if (configured) return;

  const apiKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  });
  if (!apiKey) {
    throw new Error(
      `Missing EXPO_PUBLIC_REVENUECAT_${Platform.OS === "ios" ? "IOS" : "ANDROID"}_KEY in .env`,
    );
  }

  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  // Configure anonymously; identify with Clerk ID after sign-in via logInRevenueCat().
  Purchases.configure({ apiKey });
  configured = true;
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

// Single entry point for the Pro paywall. Guards against an unconfigured SDK
// (e.g. missing EXPO_PUBLIC_REVENUECAT_*_KEY), which crashes natively if hit.
export async function presentProPaywallIfNeeded(): Promise<PAYWALL_RESULT | null> {
  if (!configured) {
    console.warn(
      "[RevenueCat] Not configured — check EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY. Skipping paywall.",
    );
    return null;
  }
  return RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
  });
}

// Did the paywall interaction end with the entitlement active? PURCHASED and
// RESTORED are self-evident; NOT_PRESENTED means the SDK saw the entitlement
// already active (stale local isPro), so the gated action should proceed too.
export function paywallResultUnlocked(result: PAYWALL_RESULT | null): boolean {
  return (
    result === PAYWALL_RESULT.PURCHASED ||
    result === PAYWALL_RESULT.RESTORED ||
    result === PAYWALL_RESULT.NOT_PRESENTED
  );
}

export async function logInRevenueCat(appUserId: string): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.logIn(appUserId);
  return customerInfo;
}

export async function logOutRevenueCat(): Promise<CustomerInfo | null> {
  // Anonymous users can't log out; the SDK throws otherwise.
  if (await Purchases.isAnonymous()) return null;
  return await Purchases.logOut();
}

export function hasProEntitlement(info: CustomerInfo | null): boolean {
  return !!info?.entitlements.active[PRO_ENTITLEMENT_ID];
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}
