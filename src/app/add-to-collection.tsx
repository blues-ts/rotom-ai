import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";
import {
	useCollections,
	useRefreshCollectionPrices,
} from "@/hooks/useCollections";

export default function AddToCollection() {
  const { colors } = useTheme();

  const { cardId, cardName, cardNumber, setName, cardImageUrl, cardValue, pricingType, productType, variant, condition, gradedCompany, gradedGrade, pricePaid } =
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
    }>();

  const { collections, addCardToCollection } = useCollections();
  const refreshPrices = useRefreshCollectionPrices();
  // The collection that was just added to — its row outlines blue as the
  // success cue, then the sheet dismisses itself.
  const [addedId, setAddedId] = useState<string | null>(null);

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
    <ScrollView
      style={{ backgroundColor: colors.card }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>
        Add to Collection
      </Text>
      {collections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No collections yet — create one to add this card.
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/create-collection");
            }}
            style={[styles.createButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={18} color={colors.primaryForeground} />
            <Text
              style={[
                styles.createButtonText,
                { color: colors.primaryForeground },
              ]}
            >
              Create Collection
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {collections.map((collection) => {
            const added = addedId === collection.id;
            return (
              <Pressable
                key={collection.id}
                onPress={() => handleSelect(collection.id)}
                disabled={!!addedId}
                style={({ pressed }) => [
                  styles.collectionRow,
                  {
                    backgroundColor: added
                      ? colors.primary + "1A"
                      : pressed
                        ? colors.muted
                        : "transparent",
                    borderColor: added ? colors.primary : colors.border,
                    borderWidth: added ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.collectionInfo}>
                  <Text
                    style={[styles.collectionName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {collection.name}
                  </Text>
                  <Text
                    style={[styles.collectionCount, { color: colors.mutedForeground }]}
                  >
                    {added
                      ? "Added"
                      : `${collection.cardCount} ${collection.cardCount === 1 ? "card" : "cards"}`}
                  </Text>
                </View>
                <Ionicons
                  name={added ? "checkmark-circle" : "chevron-forward"}
                  size={added ? 22 : 18}
                  color={added ? colors.primary : colors.mutedForeground}
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
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
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
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: "stretch",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    gap: 8,
  },
  collectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
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
