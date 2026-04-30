import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
} from "react-native-purchases";

export const PRO_ENTITLEMENT_ID = "River AI Pro";

let configured = false;

export function configureRevenueCat(): void {
  if (configured) return;

  const apiKey = process.env.EXPO_PUBLIC_REVENUE_CAT;
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_REVENUE_CAT in .env");
  }

  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  // Configure anonymously; identify with Clerk ID after sign-in via logInRevenueCat().
  // TODO(prod): split into EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY and pick by Platform.OS.
  Purchases.configure({ apiKey });
  configured = true;
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
