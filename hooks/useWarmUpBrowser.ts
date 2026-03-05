import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Warms up the browser on Android for better OAuth performance.
 * Call this in components that initiate OAuth flows.
 */
export const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    WebBrowser.warmUpAsync().catch(() => {});

    return () => {
      WebBrowser.coolDownAsync().catch(() => {});
    };
  }, []);
};
