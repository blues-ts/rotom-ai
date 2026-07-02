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
