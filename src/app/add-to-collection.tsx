import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import CardPressable from "@/components/CardPressable";
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
import { useToast } from "@/context/ToastContext";

export default function AddToCollection() {
  const t = useRiverTheme();
  const api = useApi();

  const { cardId, cardName, cardNumber, setName, cardImageUrl, cardValue, pricingType, productType, variant, condition, gradedCompany, gradedGrade, pricePaid, cardIds, cardImages, moveFromCollectionId, moveRowIds } =
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
      /** Move mode (collection detail multi-select): source collection +
       *  comma-joined collection_cards row ids to relocate. */
      moveFromCollectionId?: string;
      moveRowIds?: string;
    }>();

  const { collections, addCardToCollection, addCardsToCollection, moveCardRows } = useCollections();
  const refreshPrices = useRefreshCollectionPrices();
  const toast = useToast();
  // Batch adds come from the scanner library — clear those cards from the
  // session once they've landed in a collection.
  const { scans, removeScans } = useScanSession();
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

  // Move mode: relocating existing rows, so no catalog lookups or pricing —
  // the rows carry everything and just change collections.
  const moveIds = useMemo(
    () => (moveRowIds ? moveRowIds.split(",").filter(Boolean) : []),
    [moveRowIds],
  );
  const isMove = moveIds.length > 0 && !!moveFromCollectionId;
  // Moving a card to the collection it's already in is a no-op — hide the
  // source collection from the picker.
  const targetCollections = isMove
    ? collections.filter((c) => c.id !== moveFromCollectionId)
    : collections;

  const handleSelectMove = useCallback(
    (collectionId: string) => {
      if (!moveFromCollectionId || moveIds.length === 0 || addedId) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedId(collectionId);
      moveCardRows.mutate(
        {
          fromCollectionId: moveFromCollectionId,
          toCollectionId: collectionId,
          ids: moveIds,
        },
        {
          onSuccess: () => {
            // The toast outlives this sheet (FullWindowOverlay at the root),
            // so it stays up as the confirmation after the dismiss below.
            const target = collections.find((c) => c.id === collectionId);
            toast.show(
              `Moved ${moveIds.length} ${moveIds.length === 1 ? "card" : "cards"}${target ? ` to ${target.name}` : ""}`,
              "success",
            );
            setTimeout(() => router.back(), 450);
          },
          onError: () => {
            setAddedId(null);
            Alert.alert("Error", "Couldn't move the cards. Please try again.");
          },
        },
      );
    },
    [moveFromCollectionId, moveIds, addedId, moveCardRows, collections, toast],
  );

  // Kick off the priced-batch lookup the moment the sheet opens, not on tap —
  // the seconds the user spends picking a collection hide the network wait, so
  // the tap itself only pays the (usually settled) await.
  const batchFetchRef = useRef<ReturnType<typeof getPricedBatch> | null>(null);
  useEffect(() => {
    if (!isBatch || batchFetchRef.current) return;
    // Pull the fully PRICED cards in one batch (same source the collection's
    // price refresh uses) so each card's real default variant / condition /
    // value resolves exactly like the search long-press quick-add does —
    // storing "normal"/"NM" blindly meant holo/V cards never matched a price.
    const fetch = getPricedBatch(api, {
      cardIds: batchIds,
      sealedIds: [],
      // Scanner adds only need the NM price on the card response — skip the
      // extra raw-USD price_history backfill so it's one GET per card.
      skipRawBackfill: true,
    });
    batchFetchRef.current = fetch;
    // Failures surface on the tap's await; this just keeps an untouched
    // promise from raising an unhandled-rejection warning.
    fetch.catch(() => {});
  }, [api, batchIds, isBatch]);

  const handleSelectBatch = useCallback(
    async (collectionId: string) => {
      if (addedId || batchIds.length === 0) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedId(collectionId);
      try {
        const { cards } = await (batchFetchRef.current ??
          getPricedBatch(api, {
            cardIds: batchIds,
            sealedIds: [],
            skipRawBackfill: true,
          }));
        const byId = new Map(cards.map((c) => [c.id, c]));
        // One transactional mutation for the whole batch — one snapshot and
        // one refetch pass instead of a per-card storm.
        await addCardsToCollection.mutateAsync({
          collectionId,
          cards: batchIds.map((id, i) => {
            const card = byId.get(id);
            const variant = card ? (getVariantNames(card)[0] ?? "normal") : "normal";
            const condition = card
              ? (getConditionOptions(card, variant)[0] ?? "NM")
              : "NM";
            const value = card
              ? (selectPrice(card, variant, { kind: "raw", condition })?.value ?? 0)
              : 0;
            return {
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
            };
          }),
        });
        // They're filed away now — drop them from the scanning session.
        const clearedSession = batchIds.length >= scans.length;
        removeScans(batchIds);
        // Batch adds come from the scanner library. If the whole session was
        // just filed away, back out twice — sheet, then the emptied library —
        // revealing the scanner as it was (binder mode intact) rather than
        // re-pushing it. A partial add returns to the library as before.
        // expo-router queues both GO_BACKs, so they run in order.
        setTimeout(() => {
          router.back();
          if (clearedSession) router.back();
        }, 450);
      } catch {
        // A failed prefetch shouldn't poison retries — refetch on next tap.
        batchFetchRef.current = null;
        setAddedId(null);
        Alert.alert("Error", "Couldn't add the cards. Please try again.");
      }
    },
    [api, addedId, batchIds, batchImages, addCardsToCollection, removeScans, scans.length],
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
            setTimeout(() => router.back(), 450);
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
          headerTitle: isMove
            ? `Move ${moveIds.length} ${moveIds.length === 1 ? "Card" : "Cards"}`
            : isBatch
              ? `Add ${batchIds.length} ${batchIds.length === 1 ? "Card" : "Cards"}`
              : "Add to Collection",
        }}
      />
      {targetCollections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: t.text.secondary }]}>
            {isMove
              ? "No other collections — create one to move these cards into."
              : "No collections yet — create one to add this card."}
          </Text>
          <CardPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: "/create-collection",
                params: { from: "add-to-collection" },
              });
            }}
            style={[styles.createButton, { backgroundColor: t.accent }, t.buttonGlow]}
          >
            <SymbolView
              name="plus"
              size={16}
              tintColor="#FFFFFF"
              weight="semibold"
            />
            <Text style={styles.createButtonText}>Create Collection</Text>
          </CardPressable>
        </View>
      ) : (
        <View style={styles.list}>
          {targetCollections.map((collection) => {
            const added = addedId === collection.id;
            return (
              <CardPressable
                key={collection.id}
                onPress={() =>
                  isMove
                    ? handleSelectMove(collection.id)
                    : isBatch
                      ? handleSelectBatch(collection.id)
                      : handleSelect(collection.id)
                }
                disabled={!!addedId}
                pressScale={0.98}
                baseColor={added ? undefined : t.glass.elevatedFill}
                pressedColor={added ? undefined : t.glass.pressedFill}
                style={[
                  styles.collectionRow,
                  {
                    borderColor: added ? t.accent : t.glass.elevatedBorder,
                    borderWidth: added ? 2 : 1,
                  },
                  added ? { backgroundColor: t.accentIconFill } : null,
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
                      ? isMove
                        ? "Moved"
                        : "Added"
                      : `${collection.cardCount} ${collection.cardCount === 1 ? "card" : "cards"}`}
                  </Text>
                </View>
                <SymbolView
                  name={added ? "checkmark.circle.fill" : "chevron.right"}
                  size={added ? 20 : 14}
                  tintColor={added ? t.accentOn : t.text.tertiary}
                  weight="semibold"
                />
              </CardPressable>
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
