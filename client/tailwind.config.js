/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "ui-bg-base": "#f4f5f7",
        "ui-bg-subtle": "#ffffff",
        "ui-bg-field": "#f9fafb",
        "ui-bg-field-component": "#ffffff",
        "ui-bg-subtle-hover": "#f3f4f6",
        "ui-bg-overlay": "rgba(0, 0, 0, 0.4)",
        "ui-fg-base": "#1a1d21",
        "ui-fg-interactive": "#2563eb",
        "ui-fg-interactive-hover": "#1d4ed8",
        "ui-fg-subtle": "#6b7280",
        "ui-fg-muted": "#9ca3af",
        "ui-border-base": "#e5e7eb",
        "ui-border-strong": "#d1d5db",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["Roboto Mono", "monospace"],
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        "borders-focus": "0 0 0 2px rgba(37, 99, 235, 0.2)",
        "elevation-modal": "0 4px 24px rgba(0, 0, 0, 0.12)",
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
    },
  },
  plugins: [],
}
