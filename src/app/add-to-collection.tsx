import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";

import { useRiverTheme } from "@/constants/theme";
import {
	useCollections,
	useRefreshCollectionPrices,
} from "@/hooks/useCollections";
import { useApi } from "@/lib/axios";
import { getPricedBatch } from "@/lib/api/pricing";
import {
	getCardDisplayName,
	getCardImage,
	getCardNumber,
	getConditionOptions,
	getExpansionDisplayName,
	getVariantNames,
	selectPrice,
} from "@/lib/scrydex";
import { useScanSession } from "@/context/ScanSessionContext";

export default function AddToCollection() {
  const t = useRiverTheme();
  const api = useApi();

  const { cardId, cardName, cardNumber, setName, cardImageUrl, cardValue, pricingType, productType, variant, condition, gradedCompany, gradedGrade, pricePaid, cardIds, cardImages } =
    useLocalSearchParams<{
      cardId: string;
      cardName: string;
      cardNumber?: string;
      setName?: string;
      cardImageUrl: string;
      cardValue: string;
      pricingType: string;
      productType?: string;
      variant: string;
      condition: string;
      gradedCompany: string;
      gradedGrade: string;
      pricePaid?: string;
      /** Batch mode (scanner library): comma-joined card ids + parallel images. */
      cardIds?: string;
      cardImages?: string;
    }>();

  const { collections, addCardToCollection } = useCollections();
  const refreshPrices = useRefreshCollectionPrices();
  // Batch adds come from the scanner library — clear those cards from the
  // session once they've landed in a collection.
  const { removeScans } = useScanSession();
  // The collection that was just added to — its row outlines blue as the
  // success cue, then the sheet dismisses itself.
  const [addedId, setAddedId] = useState<string | null>(null);

  // Batch mode: a list of card ids (no metadata). Names/numbers are resolved
  // from the catalog at add time; prices come from the post-add refresh.
  const batchIds = useMemo(
    () => (cardIds ? cardIds.split(",").filter(Boolean) : []),
    [cardIds],
  );
  const batchImages = useMemo(
    () => (cardImages ? cardImages.split(",").map(decodeURIComponent) : []),
    [cardImages],
  );
  const isBatch = batchIds.length > 0;

  const handleSelectBatch = useCallback(
    async (collectionId: string) => {
      if (addedId || batchIds.length === 0) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedId(collectionId);
      try {
        // Pull the fully PRICED cards in one batch (same source the collection's
        // price refresh uses), then resolve each card's real default variant /
        // condition / value exactly like the search long-press quick-add does —
        // storing "normal"/"NM" blindly meant holo/V cards never matched a price.
        const { cards } = await getPricedBatch(api, {
          cardIds: batchIds,
          sealedIds: [],
          // Scanner adds only need the NM price on the card response — skip the
          // extra raw-USD price_history backfill so it's one GET per card.
          skipRawBackfill: true,
        });
        const byId = new Map(cards.map((c) => [c.id, c]));
        batchIds.forEach((id, i) => {
          const card = byId.get(id);
          const variant = card ? (getVariantNames(card)[0] ?? "normal") : "normal";
          const condition = card
            ? (getConditionOptions(card, variant)[0] ?? "NM")
            : "NM";
          const value = card
            ? (selectPrice(card, variant, { kind: "raw", condition })?.value ?? 0)
            : 0;
          addCardToCollection.mutate({
            collectionId,
            cardId: id,
            cardName: card ? getCardDisplayName(card) : id,
            cardNumber: card ? getCardNumber(card) || undefined : undefined,
            setName: card?.expansion
              ? getExpansionDisplayName(card.expansion)
              : undefined,
            cardImageUrl:
              (card && getCardImage(card, variant, "small")) ||
              batchImages[i] ||
              `https://images.scrydex.com/pokemon/${id}/small`,
            cardValue: value,
            pricingType: "Raw",
            productType: "card",
            variant,
            condition,
          });
        });
        // They're filed away now — drop them from the scanning session.
        removeScans(batchIds);
        setTimeout(() => router.back(), 700);
      } catch {
        setAddedId(null);
        Alert.alert("Error", "Couldn't add the cards. Please try again.");
      }
    },
    [api, addedId, batchIds, batchImages, addCardToCollection, removeScans],
  );

  const handleSelect = useCallback(
    (collectionId: string) => {
      if (!cardId || !cardName || addedId) return;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const parsedPricePaid =
        pricePaid && pricePaid.trim().length > 0
          ? parseFloat(pricePaid)
          : undefined;
      addCardToCollection.mutate(
        {
          collectionId,
          cardId,
          cardName,
          cardNumber: cardNumber || undefined,
          setName: setName || undefined,
          cardImageUrl: cardImageUrl ?? "",
          cardValue: parseFloat(cardValue ?? "0") || 0,
          pricingType: pricingType ?? "Raw",
          productType: productType === "sealed" ? "sealed" : "card",
          variant: variant ?? "normal",
          condition: condition ?? "NM",
          gradedCompany: gradedCompany || undefined,
          gradedGrade: gradedGrade || undefined,
          pricePaid:
            parsedPricePaid !== undefined && !isNaN(parsedPricePaid)
              ? parsedPricePaid
              : undefined,
        },
        {
          onSuccess: () => {
            setAddedId(collectionId);
            // Most callers pass a live price (card-detail's heroPrice, set-detail's
            // market price) and store the real value directly. Catalog search
            // results carry no price → stored as 0; only then fetch live prices for
            // the collection so the card shows its real value immediately instead
            // of $0.00. Pro-gated + async, so it's a no-op for non-Pro and never
            // blocks the dismiss.
            const hasPrice = (parseFloat(cardValue ?? "0") || 0) > 0;
            if (!hasPrice) refreshPrices.mutate(collectionId);
            setTimeout(() => router.back(), 700);
          },
          onError: (error) => {
            // Duplicate configs increment quantity instead of erroring, so any
            // failure here is a real one — surface it.
            Alert.alert(
              "Error",
              error instanceof Error
                ? error.message
                : "Couldn't add to collection. Please try again.",
            );
          },
        },
      );
    },
    [cardId, cardName, cardNumber, setName, cardImageUrl, cardValue, pricingType, productType, variant, condition, gradedCompany, gradedGrade, pricePaid, addCardToCollection, addedId],
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: isBatch
            ? `Add ${batchIds.length} ${batchIds.length === 1 ? "Card" : "Cards"}`
            : "Add to Collection",
        }}
      />
      {collections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: t.text.secondary }]}>
            No collections yet — create one to add this card.
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/create-collection");
            }}
            style={({ pressed }) => [
              styles.createButton,
              {
                backgroundColor: t.accent,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
              t.buttonGlow,
            ]}
          >
            <SymbolView
              name="plus"
              size={16}
              tintColor="#FFFFFF"
              weight="semibold"
            />
            <Text style={styles.createButtonText}>Create Collection</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {collections.map((collection) => {
            const added = addedId === collection.id;
            return (
              <Pressable
                key={collection.id}
                onPress={() =>
                  isBatch
                    ? handleSelectBatch(collection.id)
                    : handleSelect(collection.id)
                }
                disabled={!!addedId}
                style={({ pressed }) => [
                  styles.collectionRow,
                  {
                    backgroundColor: added
                      ? t.accentIconFill
                      : pressed
                        ? t.glass.pressedFill
                        : t.glass.elevatedFill,
                    borderColor: added ? t.accent : t.glass.elevatedBorder,
                    borderWidth: added ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.collectionInfo}>
                  <Text
                    style={[styles.collectionName, { color: t.text.primary }]}
                    numberOfLines={1}
                  >
                    {collection.name}
                  </Text>
                  <Text
                    style={[styles.collectionCount, { color: t.text.secondary }]}
                  >
                    {added
                      ? "Added"
                      : `${collection.cardCount} ${collection.cardCount === 1 ? "card" : "cards"}`}
                  </Text>
                </View>
                <SymbolView
                  name={added ? "checkmark.circle.fill" : "chevron.right"}
                  size={added ? 20 : 14}
                  tintColor={added ? t.accentOn : t.text.tertiary}
                  weight="semibold"
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 24,
  },
  empty: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignSelf: "stretch",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  list: {
    gap: 8,
  },
  collectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  collectionInfo: {
    flex: 1,
  },
  collectionName: {
    fontSize: 16,
    fontWeight: "600",
  },
  collectionCount: {
    fontSize: 13,
    marginTop: 2,
  },
});
