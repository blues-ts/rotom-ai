import { Platform } from "react-native";

/** iOS major version (0 on other platforms). */
export const IOS_MAJOR_VERSION =
	Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) || 0 : 0;

/**
 * Bottom-toolbar search fields (Stack.Toolbar.SearchBarSlot) are an iOS 26
 * feature. On earlier iOS, Stack.SearchBar attaches below the (transparent)
 * navigation header instead — screens must pad their content for its height
 * and pin it (hideWhenScrolling={false}) so the offset stays deterministic.
 */
export const HAS_BOTTOM_SEARCH_BAR = IOS_MAJOR_VERSION >= 26;

/** Height of the header-attached search bar on iOS < 26. */
export const HEADER_SEARCH_BAR_HEIGHT = 52;

/**
 * Themed appearance for the header-attached UISearchBar on iOS < 26 — the
 * system default (gray field, system-blue tint, system text colors) clashes
 * with the deep-water gradient. On iOS 26 the liquid-glass toolbar styles
 * itself, so this returns nothing and the native look is left alone.
 */
/**
 * Native blur material behind the transparent header on iOS < 26, so content
 * scrolling under the title/search bar fades behind frosted glass instead of
 * colliding with it. iOS 26's liquid-glass chrome does this natively — return
 * nothing there.
 */
export function legacyHeaderBlur(isDark: boolean) {
	if (HAS_BOTTOM_SEARCH_BAR) return {};
	return {
		headerBlurEffect: isDark
			? ("systemUltraThinMaterialDark" as const)
			: ("systemUltraThinMaterialLight" as const),
	};
}

export function legacySearchBarStyle(t: {
	glass: { elevatedFill: string };
	text: { primary: string };
	accentOn: string;
}) {
	if (HAS_BOTTOM_SEARCH_BAR) return {};
	return {
		barTintColor: t.glass.elevatedFill,
		textColor: t.text.primary,
		tintColor: t.accentOn,
	} as const;
}
