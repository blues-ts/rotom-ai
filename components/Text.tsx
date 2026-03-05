import { useTheme } from "@/context/ThemeContext";
import React from "react";
import { Text as RNText, TextProps } from "react-native";

const Text = ({ style, ...props }: TextProps) => {
  const { colors } = useTheme();
  return (
    <RNText
      style={[{ fontFamily: "Inter_400Regular", color: colors.foreground }, style]}
      {...props}
    />
  );
};

export default Text;
