import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-alt": "var(--surface-alt)",
        border: "var(--border)",
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
          contrast: "var(--accent-contrast)",
        },
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
        },
        info: {
          DEFAULT: "var(--info)",
          soft: "var(--info-soft)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["Cascadia Code", "SF Mono", "Consolas", "Liberation Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "7px",
        sm: "5px",
      },
    },
  },
  plugins: [],
};

export default config;
