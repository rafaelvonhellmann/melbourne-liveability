import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1419",
          raised: "#1a2332",
          border: "#2d3a4f",
        },
        score: {
          low: "#d73027",
          mid: "#fee08b",
          high: "#1a9850",
          nodata: "#4a5568",
        },
      },
    },
  },
  plugins: [],
};

export default config;
