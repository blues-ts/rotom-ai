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

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleSelect = useCallback(
    (collectionId: string) => {
      if (!cardId || !cardName) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
            router.back();
          },
          onError: () => {
            Alert.alert("Error", "This card is already in that collection.");
          },
        },
      );
    },
    [cardId, cardName, cardImageUrl, cardValue, addCardToCollection],
  );

  return (
    <Pressable style={styles.backdrop} onPress={handleClose}>
      <Pressable
        style={[
          styles.popup,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Add to Collection
          </Text>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {collections.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No collections yet. Create one first!
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.list} bounces={false}>
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
          </ScrollView>
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  popup: {
    width: "100%",
    maxHeight: "60%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
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
