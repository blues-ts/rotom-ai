import { useApi } from "@/lib/axios";
import { useMutation } from "@tanstack/react-query";

export const useAuthCallback = () => {
  const api = useApi();

  const result = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/api/auth/callback");
      return data;
    },
  });

  return result;
};
