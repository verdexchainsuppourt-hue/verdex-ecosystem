import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shared/providers";

const heading = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://verdexswap.site"),
  title: {
    default: "Verdex — Swap Smart. Grow Green. | DEX, Liquidity & VDX Mining",
    template: "%s | Verdex",
  },
  description:
    "Verdex is a self-custodial Web3 ecosystem: decentralized token swaps with intelligent routing, liquidity pools, and the VDX mining network — one account, one dashboard.",
  keywords: ["Verdex", "VDX", "VerdexSwap", "DEX", "DePIN mining", "AMM", "liquidity", "chain 72010"],
  openGraph: {
    siteName: "Verdex",
    title: "Verdex — Swap Smart. Grow Green.",
    description: "Decentralized swaps, liquidity tools, and VDX mining in one self-custodial ecosystem.",
    url: "https://verdexswap.site",
    type: "website",
  },
  twitter: { card: "summary_large_image", site: "@VerdexSwap" },
};

export const viewport: Viewport = {
  themeColor: "#020706",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable} dark`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
