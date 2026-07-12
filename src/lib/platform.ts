import { Platform } from "react-native";

/** iOS major version (0 on other platforms). */
export const IOS_MAJOR_VERSION =
	Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) || 0 : 0;

/**
 * iOS 26 and up: native liquid-glass chrome styles transparent headers
 * itself. Search fields are the custom FloatingSearchBar everywhere, so this
 * flag only gates the legacy header blur below — content offsets are the
 * same on every iOS version.
 */
export const HAS_BOTTOM_SEARCH_BAR = IOS_MAJOR_VERSION >= 26;

/**
 * Native blur material behind the transparent header on iOS < 26, so content
 * scrolling under the title fades behind frosted glass instead of colliding
 * with it. iOS 26's liquid-glass chrome does this natively — return nothing
 * there.
 */
export function legacyHeaderBlur(isDark: boolean) {
	if (HAS_BOTTOM_SEARCH_BAR) return {};
	return {
		headerBlurEffect: isDark
			? ("systemUltraThinMaterialDark" as const)
			: ("systemUltraThinMaterialLight" as const),
	};
}
