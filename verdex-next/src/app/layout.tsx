import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Verdex — Swap Smart. Grow Green.",
    template: "%s | Verdex",
  },
  description:
    "Verdex combines decentralized token swaps, intelligent AMM routing, liquidity pools, and the VDX DePIN mining ecosystem in one self-custodial platform.",
  keywords: ["Verdex", "VDX", "DePIN", "DEX", "AMM", "decentralized exchange", "VDX mining", "crypto swap", "blockchain"],
  authors: [{ name: "Verdex" }],
  creator: "Verdex",
  metadataBase: new URL("https://verdexswap.site"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://verdexswap.site",
    siteName: "Verdex",
    title: "Verdex — Swap Smart. Grow Green.",
    description:
      "Decentralized token swaps, AMM routing, liquidity pools, and VDX DePIN mining — all in one self-custodial platform.",
    images: [{ url: "/assets/verdex-token.png", width: 512, height: 512, alt: "Verdex VDX Token" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Verdex — Swap Smart. Grow Green.",
    description: "Verdex Mainnet · DePIN Miners · AMM Swap · VDX Mining",
    images: ["/assets/verdex-token.png"],
    creator: "@VerdexSwap",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`}>
      <body className="bg-vdx-bg text-vdx-text antialiased overflow-x-hidden">
        <Providers>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
