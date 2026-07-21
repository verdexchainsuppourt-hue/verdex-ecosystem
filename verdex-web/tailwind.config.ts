import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        abyss: "#020706",
        surface: "#06100D",
        elevate: "#0A1713",
        panel: "rgba(10, 25, 21, 0.72)",
        emerald: { DEFAULT: "#24E596", bright: "#57FFB3", dim: "#0F8A57" },
        cyan: { DEFAULT: "#22D3EE", dim: "#0E7490" },
        azure: "#3B82F6",
        ink: "#F4FFF9",
        mist: "#C4D8CF",
        muted: "#92AAA0",
        faint: "#5B7268",
        line: "rgba(87, 255, 179, 0.14)",
        danger: "#FF5C6C",
        amber: "#F5B942",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Space Grotesk", "sans-serif"],
        body: ["var(--font-body)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: { xl: "1rem", "2xl": "1.25rem", "3xl": "1.75rem" },
      boxShadow: {
        glow: "0 0 40px rgba(36, 229, 150, 0.16)",
        "glow-sm": "0 0 20px rgba(36, 229, 150, 0.1)",
        "glow-cyan": "0 0 32px rgba(34, 211, 238, 0.12)",
        card: "0 20px 60px rgba(0, 0, 0, 0.45)",
        lift: "0 28px 80px rgba(0, 0, 0, 0.55), 0 0 48px rgba(36, 229, 150, 0.08)",
      },
      keyframes: {
        aurora: {
          "0%, 100%": { transform: "translate(0,0) scale(1)", opacity: "0.65" },
          "33%": { transform: "translate(6vw,4vh) scale(1.1)", opacity: "0.95" },
          "66%": { transform: "translate(-4vw,8vh) scale(0.94)", opacity: "0.75" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-dot": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(36,229,150,0.5)" },
          "70%": { boxShadow: "0 0 0 9px rgba(36,229,150,0)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(22px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "block-pop": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        aurora: "aurora 26s ease-in-out infinite",
        floaty: "floaty 7s ease-in-out infinite",
        "spin-slower": "spin-slow 24s linear infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "pulse-dot": "pulse-dot 2.2s ease-out infinite",
        "fade-up": "fade-up 0.65s cubic-bezier(0.22,1,0.36,1) both",
        "block-pop": "block-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
        "accordion-down": "accordion-down 0.28s ease-out",
        "accordion-up": "accordion-up 0.24s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
