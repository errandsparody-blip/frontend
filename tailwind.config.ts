/**
 * Tailwind config — locked to the v1.0 Design System.
 * Tokens mirror src/styles/tokens.css. Single source of truth for color, type,
 * radius, shadow. No ad-hoc values are permitted in components.
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#F1EFE9",
          deep: "#E8E5DC",
          soft: "#F5F4F0",
        },
        ink: {
          DEFAULT: "#0A0A0A",
          elev: "#161616",
          "elev-2": "#1F1F1F",
        },
        text: {
          DEFAULT: "#111111",
          2: "#2A2A2A",
          muted: "#6B6B6B",
          subtle: "#9B9B9B",
          inv: "#FFFFFF",
        },
        amber: {
          DEFAULT: "#C99428",
          hi: "#DDAA3D",
        },
        success: "#2E7D5F",
        warning: "#C99428",
        error: "#B33333",
        info: "#3B82F6",
        line: {
          DEFAULT: "rgba(0,0,0,0.06)",
          strong: "rgba(0,0,0,0.12)",
        },
      },
      fontFamily: {
        sans: ['"Inter Tight"', '"Inter"', "ui-sans-serif", "system-ui"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo"],
      },
      fontSize: {
        "display-xl": ["72px", { lineHeight: "1.05", letterSpacing: "-1.5px", fontWeight: "500" }],
        "display-lg": ["56px", { lineHeight: "1.10", letterSpacing: "-1.2px", fontWeight: "500" }],
        display: ["40px", { lineHeight: "1.15", letterSpacing: "-0.8px", fontWeight: "500" }],
        h1: ["28px", { lineHeight: "1.20", letterSpacing: "-0.4px", fontWeight: "600" }],
        h2: ["20px", { lineHeight: "1.30", letterSpacing: "-0.2px", fontWeight: "600" }],
        h3: ["18px", { lineHeight: "1.35", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.55", fontWeight: "400" }],
        body: ["16px", { lineHeight: "1.60", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.55", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "1.50", fontWeight: "500" }],
        "mono-eyebrow": ["12px", { lineHeight: "1.40", letterSpacing: "1.6px", fontWeight: "600" }],
        "mono-label": ["12px", { lineHeight: "1.40", letterSpacing: "1.4px", fontWeight: "500" }],
      },
      borderRadius: {
        none: "0",
        xs: "2px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        1: "0 1px 2px rgba(0,0,0,0.05)",
        2: "0 2px 4px rgba(0,0,0,0.06)",
        3: "0 4px 12px rgba(0,0,0,0.08)",
        4: "0 8px 24px rgba(0,0,0,0.10)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        fast: "140ms",
        DEFAULT: "240ms",
        slow: "400ms",
      },
    },
  },
  plugins: [],
};

export default config;
