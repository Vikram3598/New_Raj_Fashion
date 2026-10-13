import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        maroon: {
          50: "#F8EEEE",
          100: "#EBD4D6",
          200: "#D3A6AB",
          500: "#9B2C3A",
          700: "#7A1F2B",
          900: "#3E1016",
        },
        gold: {
          100: "#F4E8C9",
          400: "#D4B36A",
          500: "#C6A15B",
          700: "#8C6A2E",
        },
        cream: {
          50: "#FBF8F2",
          100: "#F7F1E8",
          200: "#EDE3D2",
        },
      },
      fontFamily: {
        serif: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
