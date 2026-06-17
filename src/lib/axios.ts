import axios from "axios";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect } from "react";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Request never reached the server (offline, DNS, timeout) — as opposed to an HTTP error.
export const isNetworkError = (error: unknown): boolean =>
  axios.isAxiosError(error) && !error.response;

const api = axios.create({
  baseURL: API_URL,
  // Fail fast on a stalled request instead of hanging a spinner forever on a
  // flaky mobile network; surfaces as a network error the UI can retry.
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const useApi = () => {
  const { getToken } = useAuth();
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use(async (config) => {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        // Continue without auth header
      }
      return config;
    });

    return () => {
      api.interceptors.request.eject(requestInterceptor);
    };
  }, [getToken]);

  return api;
};
