import { useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";
import { useCollections } from "@/hooks/useCollections";

export default function AddToCollection() {
  const { colors } = useTheme();

  const { cardId, cardName, cardImageUrl, cardValue } =
    useLocalSearchParams<{
      cardId: string;
      cardName: string;
      cardImageUrl: string;
      cardValue: string;
    }>();

  const { collections, addCardToCollection } = useCollections();

  const handleSelect = useCallback(
    (collectionId: string) => {
      if (!cardId || !cardName) return;

      const collection = collections.find((c) => c.id === collectionId);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      addCardToCollection.mutate(
        {
          collectionId,
          cardId,
          cardName,
          cardImageUrl: cardImageUrl ?? "",
          cardValue: parseFloat(cardValue ?? "0") || 0,
        },
        {
          onSuccess: () => {
            Alert.alert(
              "Added!",
              `${cardName} was added to ${collection?.name ?? "collection"}.`,
              [{ text: "OK", onPress: () => router.back() }],
            );
          },
          onError: () => {
            Alert.alert("Error", "This card is already in that collection.");
          },
        },
      );
    },
    [cardId, cardName, cardImageUrl, cardValue, addCardToCollection, collections],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {collections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No collections yet. Create one first!
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {collections.map((collection) => (
            <Pressable
              key={collection.id}
              onPress={() => handleSelect(collection.id)}
              style={({ pressed }) => [
                styles.collectionRow,
                {
                  backgroundColor: pressed ? colors.muted : "transparent",
                  borderColor: colors.border,
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
                  {collection.cardCount}{" "}
                  {collection.cardCount === 1 ? "card" : "cards"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 12,
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
