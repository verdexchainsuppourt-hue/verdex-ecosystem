import type { Metadata } from "next";
import { Hero } from "@/components/home/hero";
import { ProductTrio } from "@/components/home/product-trio";
import { StatsStrip } from "@/components/home/stats-strip";
import { FaqSection } from "@/components/home/faq-section";
import { CtaSection } from "@/components/home/cta-section";

export const metadata: Metadata = {
  title: "Verdex — Swap Smart. Grow Green. | DEX, Liquidity & VDX Mining",
  description:
    "Verdex combines decentralized token swaps, intelligent routing, liquidity tools and the VDX mining ecosystem in one self-custodial platform.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProductTrio />
      <StatsStrip />
      <FaqSection />
      <CtaSection />
    </>
  );
}
