import { Platform } from "react-native";

/** iOS major version (0 on other platforms). */
export const IOS_MAJOR_VERSION =
	Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) || 0 : 0;

/**
 * iOS 26 and up: native liquid-glass chrome styles transparent headers
 * itself. Search fields are the custom FloatingSearchBar everywhere, so this
 * flag only gates the HeaderFadeScrim (the iOS < 26 stand-in for the native
 * header fade) — content offsets are the same on every iOS version.
 */
export const HAS_BOTTOM_SEARCH_BAR = IOS_MAJOR_VERSION >= 26;
