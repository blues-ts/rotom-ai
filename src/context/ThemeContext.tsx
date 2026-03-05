import { colors, ThemeColors } from "@/constants/colors";
import React, { createContext, useContext } from "react";
import { useColorScheme } from "react-native";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  colors: colors.dark,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const theme: Theme = colorScheme === "light" ? "light" : "dark";

  return (
    <ThemeContext.Provider value={{ theme, colors: colors[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
