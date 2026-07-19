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
import { useScanReviewBatch } from "@/hooks/useScanReviewBatch";
import { useToast } from "@/context/ToastContext";
import {
	useRefreshVendorPrices,
	useVendorItems,
} from "@/hooks/useVendorItems";
import { useVendingEnabled } from "@/lib/vendorPrefs";
import { useRevenueCat } from "@/context/RevenueCatContext";
import { presentProPaywallIfNeeded } from "@/lib/revenuecat";

// Sentinel "collection id" for the pinned Vending destination row — real
// collection ids are Date.now() strings, so this can't collide.
const VENDOR_DEST_ID = "__vendor__";

export default function AddToCollection() {
  const t = useRiverTheme();
  const api = useApi();

  const { cardId, cardName, cardNumber, setName, cardImageUrl, cardValue, pricingType, productType, variant, condition, gradedCompany, gradedGrade, pricePaid, cardIds, cardImages, fromReview, moveFromCollectionId, moveRowIds } =
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
      /** "1" when the scan library (review list) pushed this sheet — the
       *  priced batch is already in the query cache under the same key. */
      fromReview?: string;
      /** Move mode (collection detail multi-select): source collection +
       *  comma-joined collection_cards row ids to relocate. */
      moveFromCollectionId?: string;
      moveRowIds?: string;
    }>();

  const { collections, addCardToCollection, addCardsToCollection, moveCardRows } = useCollections();
  const refreshPrices = useRefreshCollectionPrices();
  const { addVendorItems, listCollectionRows } = useVendorItems();
  const refreshVendorPrices = useRefreshVendorPrices();
  const vendingEnabled = useVendingEnabled();
  const { isPro } = useRevenueCat();
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

  // Coming from the review screen, the priced batch is already in the query
  // cache under the same key — reuse it instead of refetching every card.
  const reviewBatch = useScanReviewBatch(fromReview === "1" ? batchIds : []);

  // Kick off the priced-batch lookup the moment the sheet opens, not on tap —
  // the seconds the user spends picking a collection hide the network wait, so
  // the tap itself only pays the (usually settled) await.
  const batchFetchRef = useRef<ReturnType<typeof getPricedBatch> | null>(null);
  useEffect(() => {
    if (!isBatch || fromReview === "1" || batchFetchRef.current) return;
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
  }, [api, batchIds, isBatch, fromReview]);

  // Resolve the priced batch into row inputs — shared by the collection add
  // and the Vending add so config/price resolution can't drift apart.
  const resolveBatchInputs = useCallback(async () => {
    const cards =
      reviewBatch.data ??
      (
        await (batchFetchRef.current ??
          getPricedBatch(api, {
            cardIds: batchIds,
            sealedIds: [],
            skipRawBackfill: true,
          }))
      ).cards;
    const byId = new Map(cards.map((c) => [c.id, c]));
    // Review-screen configs (variant / condition / grade / quantity) live
    // on the session scans; cards without one fall back to the defaults
    // the blind batch add always used.
    const configById = new Map(scans.map((s) => [s.id, s.config]));
    return batchIds.map((id, i) => {
            const card = byId.get(id);
            const config = configById.get(id);
            const variant =
              config?.variant ??
              (card ? (getVariantNames(card)[0] ?? "normal") : "normal");
            const rawCondition =
              config?.condition ??
              (card ? (getConditionOptions(card, variant)[0] ?? "NM") : "NM");
            const isGraded =
              config?.pricingType === "Graded" &&
              !!config.gradedCompany &&
              !!config.gradedGrade;
            const value = card
              ? (selectPrice(
                  card,
                  variant,
                  isGraded
                    ? {
                        kind: "graded",
                        company: config.gradedCompany!,
                        grade: config.gradedGrade!,
                      }
                    : { kind: "raw", condition: rawCondition },
                )?.value ?? 0)
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
              pricingType: isGraded ? "Graded" : "Raw",
              productType: "card",
              variant,
              // Same convention as the card-detail add: graded rows store
              // "GRADED" so the price refresh keys off company + grade.
              condition: isGraded ? "GRADED" : rawCondition,
              gradedCompany: isGraded ? config.gradedCompany : undefined,
              gradedGrade: isGraded ? config.gradedGrade : undefined,
              quantity: config?.quantity,
            };
          });
  }, [api, batchIds, batchImages, scans, reviewBatch.data]);

  // Shared batch epilogue: drop the added cards from the scanning session.
  // If the whole session was just filed away, also pop the emptied library,
  // revealing the scanner as it was (binder mode intact) rather than
  // re-pushing it. A partial add returns to the library as before.
  // expo-router queues the GO_BACKs, so they run in order.
  const finishBatchAdd = useCallback(() => {
    const clearedSession = batchIds.length >= scans.length;
    removeScans(batchIds);
    setTimeout(() => {
      router.back();
      if (clearedSession) router.back();
    }, 450);
  }, [batchIds, removeScans, scans]);

  const handleSelectBatch = useCallback(
    async (collectionId: string) => {
      if (addedId || batchIds.length === 0) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedId(collectionId);
      try {
        // One transactional mutation for the whole batch — one snapshot and
        // one refetch pass instead of a per-card storm.
        await addCardsToCollection.mutateAsync({
          collectionId,
          cards: await resolveBatchInputs(),
        });
        finishBatchAdd();
      } catch {
        // A failed prefetch shouldn't poison retries — refetch on next tap.
        batchFetchRef.current = null;
        setAddedId(null);
        Alert.alert("Error", "Couldn't add the cards. Please try again.");
      }
    },
    [addedId, batchIds, addCardsToCollection, resolveBatchInputs, finishBatchAdd],
  );

  // The pinned "Vending" destination — same resolution as the collection add,
  // committed to the vendor shelf instead. Handles batch (scanner) and single
  // (card detail / search) modes.
  const handleSelectVendor = useCallback(async () => {
    if (addedId) return;
    // Vending is Pro — gate before anything mutates (same pattern as the
    // scan library's add gate: paywall now, tap again once unlocked).
    if (!isPro) {
      void presentProPaywallIfNeeded();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddedId(VENDOR_DEST_ID);
    // Multi-select from a collection: list those rows for sale. They keep
    // their place in the collection — the shelf is a sales layer on top.
    if (isMove) {
      listCollectionRows.mutate(
        { ids: moveIds },
        {
          onSuccess: () => setTimeout(() => router.back(), 450),
          onError: () => setAddedId(null),
        },
      );
      return;
    }
    if (isBatch) {
      try {
        const inputs = (await resolveBatchInputs()).map(
          ({ cardValue, ...rest }) => ({ ...rest, marketValue: cardValue }),
        );
        await addVendorItems.mutateAsync(inputs);
        finishBatchAdd();
      } catch {
        batchFetchRef.current = null;
        setAddedId(null);
        Alert.alert("Error", "Couldn't add the cards. Please try again.");
      }
      return;
    }
    if (!cardId || !cardName) {
      setAddedId(null);
      return;
    }
    const value = parseFloat(cardValue ?? "0") || 0;
    addVendorItems.mutate(
      [
        {
          cardId,
          cardName,
          cardNumber: cardNumber || undefined,
          setName: setName || undefined,
          cardImageUrl: cardImageUrl ?? "",
          marketValue: value,
          pricingType: pricingType ?? "Raw",
          productType: productType === "sealed" ? "sealed" : "card",
          variant: variant ?? "normal",
          condition: condition ?? "NM",
          gradedCompany: gradedCompany || undefined,
          gradedGrade: gradedGrade || undefined,
        },
      ],
      {
        onSuccess: () => {
          // Catalog adds carry no live price — refresh so the shelf shows a
          // real market value instead of $0 (Pro-gated no-op otherwise).
          if (value <= 0) refreshVendorPrices.mutate();
          setTimeout(() => router.back(), 450);
        },
        onError: () => setAddedId(null),
      },
    );
  }, [addedId, isPro, isMove, isBatch, moveIds, listCollectionRows, resolveBatchInputs, addVendorItems, finishBatchAdd, refreshVendorPrices, cardId, cardName, cardNumber, setName, cardImageUrl, cardValue, pricingType, productType, variant, condition, gradedCompany, gradedGrade]);

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
      {/* Vending is a fixed destination above the collections — scan-to-sell,
          quick-listing, and collection multi-select all reuse this sheet
          without touching the scan flow. Hidden entirely when the Settings
          toggle disables the vending flow. */}
      {vendingEnabled && (
      <CardPressable
          onPress={() => void handleSelectVendor()}
          disabled={!!addedId}
          pressScale={0.98}
          baseColor={
            addedId === VENDOR_DEST_ID ? undefined : t.glass.elevatedFill
          }
          pressedColor={
            addedId === VENDOR_DEST_ID ? undefined : t.glass.pressedFill
          }
          style={[
            styles.collectionRow,
            {
              borderColor:
                addedId === VENDOR_DEST_ID ? t.accent : t.glass.elevatedBorder,
              borderWidth: addedId === VENDOR_DEST_ID ? 2 : 1,
            },
            addedId === VENDOR_DEST_ID
              ? { backgroundColor: t.accentIconFill }
              : null,
          ]}
        >
          <View
            style={[styles.vendorIcon, { backgroundColor: t.accentIconFill }]}
          >
            <SymbolView
              name="storefront"
              size={16}
              tintColor={t.accentOn}
              weight="semibold"
            />
          </View>
          <View style={styles.collectionInfo}>
            <Text
              style={[styles.collectionName, { color: t.text.primary }]}
              numberOfLines={1}
            >
              Vending
            </Text>
            <Text style={[styles.collectionCount, { color: t.text.secondary }]}>
              {addedId === VENDOR_DEST_ID
                ? "Listed for sale"
                : isMove
                  ? "List for sale · stays in this collection"
                  : "Put on your table"}
            </Text>
          </View>
          <SymbolView
            name={
              addedId === VENDOR_DEST_ID
                ? "checkmark.circle.fill"
                : "chevron.right"
            }
            size={addedId === VENDOR_DEST_ID ? 20 : 14}
            tintColor={
              addedId === VENDOR_DEST_ID ? t.accentOn : t.text.tertiary
            }
            weight="semibold"
          />
        </CardPressable>
      )}
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
  vendorIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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
