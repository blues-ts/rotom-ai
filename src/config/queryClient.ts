import { onlineManager, QueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";

// Drive React Query's online state from real device connectivity. While offline
// it pauses fetches (so we don't fire requests guaranteed to fail) and resumes
// them automatically the moment the connection returns — the RN best practice.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected ?? false);
  }),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // Aligned with the persisted cache max-age: queries must stay in memory
      // long enough to be written to (and restored from) the MMKV persister.
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
});
