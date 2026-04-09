import { useCallback } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
