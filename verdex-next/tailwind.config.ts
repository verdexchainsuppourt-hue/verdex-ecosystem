import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Verdex brand palette
        "vdx-bg": "#020706",
        "vdx-section": "#06100D",
        "vdx-elevated": "#0A1713",
        "vdx-green": "#24E596",
        "vdx-bright": "#57FFB3",
        "vdx-cyan": "#22D3EE",
        "vdx-blue": "#3B82F6",
        "vdx-text": "#F4FFF9",
        "vdx-muted": "#92AAA0",
        "vdx-error": "#FF5C6C",
        "vdx-warning": "#F5B942",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "Menlo", "monospace"],
      },
      backgroundImage: {
        "vdx-grid": `linear-gradient(rgba(87,255,179,0.04) 1px, transparent 1px),
                     linear-gradient(90deg, rgba(87,255,179,0.04) 1px, transparent 1px)`,
        "vdx-glow": "radial-gradient(ellipse at 50% 0%, rgba(36,229,150,0.15) 0%, transparent 60%)",
        "vdx-hero-glow": "radial-gradient(ellipse at 60% 40%, rgba(36,229,150,0.12) 0%, rgba(34,211,238,0.06) 40%, transparent 70%)",
        "vdx-card-gradient": "linear-gradient(135deg, rgba(10,25,21,0.9) 0%, rgba(6,12,9,0.95) 100%)",
        "vdx-btn-gradient": "linear-gradient(135deg, #24E596 0%, #1BC97E 50%, #16A35A 100%)",
      },
      backgroundSize: {
        "vdx-grid": "40px 40px",
      },
      borderColor: {
        "vdx": "rgba(87,255,179,0.14)",
        "vdx-hover": "rgba(87,255,179,0.35)",
        "vdx-active": "rgba(36,229,150,0.6)",
      },
      animation: {
        "spin-slow": "spin 8s linear infinite",
        "float": "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "slide-up": "slide-up 0.4s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "shimmer": "shimmer 2s linear infinite",
        "orbit": "orbit 12s linear infinite",
        "orbit-reverse": "orbit 18s linear infinite reverse",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        orbit: {
          from: { transform: "rotate(0deg) translateX(80px) rotate(0deg)" },
          to: { transform: "rotate(360deg) translateX(80px) rotate(-360deg)" },
        },
      },
      boxShadow: {
        "vdx-card": "0 0 0 1px rgba(87,255,179,0.14), 0 8px 32px rgba(0,0,0,0.4)",
        "vdx-card-hover": "0 0 0 1px rgba(87,255,179,0.35), 0 16px 48px rgba(0,0,0,0.5), 0 0 40px rgba(36,229,150,0.06)",
        "vdx-btn": "0 8px 28px rgba(36,229,150,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
        "vdx-btn-hover": "0 12px 40px rgba(36,229,150,0.45)",
        "vdx-glow": "0 0 40px rgba(36,229,150,0.15)",
        "vdx-input-focus": "0 0 0 3px rgba(36,229,150,0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
