import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm-editorial "Theme A" chrome
        bg: "#F0EEE6",
        surface: {
          DEFAULT: "#FAF9F5",
          raised: "#FAF9F5",
          sunken: "#F3F1E9",
          border: "#E3DFD3",
        },
        ink: {
          DEFAULT: "#1A1A18",
          muted: "#6B6862",
        },
        accent: {
          DEFAULT: "#D97757",
          ink: "#FFFFFF",
          focus: "#B65A3C",
        },
        // Colorblind-safe YlGnBu data channel — never themed
        data: {
          1: "#ffffcc",
          2: "#a1dab4",
          3: "#41b6c4",
          4: "#2c7fb8",
          5: "#253494",
          nodata: "#d9d6cf",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      borderRadius: {
        lg: "10px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(40,35,25,.08), 0 8px 24px rgba(40,35,25,.06)",
      },
    },
  },
  plugins: [],
};

export default config;
