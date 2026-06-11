import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Festra Direction A "Surveyor" chrome (DESIGN-SYSTEM-PROPOSAL.md +
        // FABLE-ULTRAPLAN s18.8 owner amendments). Near-white canvas, surface
        // tint ladder, violet-gray secondary, daylight cobalt accent.
        bg: "#FDFDFD",
        surface: {
          DEFAULT: "#F6F6F8",
          raised: "#FDFDFD",
          sunken: "#F4F4F7",
          border: "#E3E3EC",
        },
        ink: {
          DEFAULT: "#181818",
          muted: "#5C5C6E",
        },
        accent: {
          // Cobalt #2052CC clears WCAG 2.2 AA (~6.5:1 on bg) as BOTH
          // text-on-light and white-text-on-fill. `focus` is the
          // hover/pressed step (~8.6:1); `tint` is selected rows / halos.
          DEFAULT: "#2052CC",
          ink: "#FFFFFF",
          focus: "#1A43A8",
          tint: "#EDF3FC",
        },
        // Semantic status colors - data voice, never brand chrome.
        risk: { DEFAULT: "#B42318", tint: "#FDECEA" },
        caution: { DEFAULT: "#B54708", tint: "#FCF1E6" },
        pass: { DEFAULT: "#067647" },
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
        // Rectangle scale 8/12/16 (cap 16); pills stay rounded-full.
        lg: "12px",
      },
      boxShadow: {
        // Hairline ring lives on the element border; shadow stays tight
        // ambient only - no soft blob shadows.
        card: "0 1px 3px rgba(0,0,0,.06), 0 2px 6px rgba(0,0,0,.05)",
      },
      transitionTimingFunction: {
        // Default every transition-* utility onto the signature curve.
        DEFAULT: "var(--ease-festra)",
        festra: "var(--ease-festra)",
        sheet: "var(--ease-sheet)",
      },
      transitionDuration: {
        DEFAULT: "120ms",
        "120": "120ms",
        "180": "180ms",
        "240": "240ms",
      },
    },
  },
  plugins: [],
};

export default config;
