/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#0f1419',
        card: {
          DEFAULT: '#f7f8f8',
          foreground: '#0f1419',
        },
        popover: {
          DEFAULT: '#ffffff',
          foreground: '#0f1419',
        },
        primary: {
          DEFAULT: '#1e9df1',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#0f1419',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#e5e5e6',
          foreground: '#0f1419',
        },
        accent: {
          DEFAULT: '#e3ecf6',
          foreground: '#1e9df1',
        },
        destructive: {
          DEFAULT: '#f4212e',
          foreground: '#ffffff',
        },
        border: '#e1eaef',
        input: '#f7f9fa',
        ring: '#1da1f2',
        'chart-1': '#1e9df1',
        'chart-2': '#00b87a',
        'chart-3': '#f7b928',
        'chart-4': '#17bf63',
        'chart-5': '#e0245e',
        sidebar: {
          DEFAULT: '#f7f8f8',
          foreground: '#0f1419',
          primary: {
            DEFAULT: '#1e9df1',
            foreground: '#ffffff',
          },
          accent: {
            DEFAULT: '#e3ecf6',
            foreground: '#1e9df1',
          },
          border: '#e1e8ed',
          ring: '#1da1f2',
        },
      },
      borderRadius: {
        DEFAULT: '1.3rem',
        sm: '1.05rem',
        md: '1.175rem',
        lg: '1.3rem',
        xl: '1.55rem',
      },
    },
  },
  plugins: [],
}
