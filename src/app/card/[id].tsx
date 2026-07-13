import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Deep-link landing route: https://rivertcg.com/card/<id> (universal link,
 * shared from the card detail screen) and riverai://card/<id> both resolve
 * here, then forward into the real (card) stack. The group route can't be
 * linked directly — stripping "(card)" would leave the ambiguous top-level
 * "/:id" — so links get this stable /card/ path. Name/image params are
 * omitted on purpose; the detail screen fetches by id.
 */
export default function CardLinkRedirect() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <Redirect href={{ pathname: "/(card)/[id]", params: { id } }} />;
}
