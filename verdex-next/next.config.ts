import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "verdexswap.site" },
      { protocol: "https", hostname: "unbzescopxtmtbrgqlhh.supabase.co" },
    ],
  },
  // Allow importing Three.js correctly
  transpilePackages: ["three"],
};

export default nextConfig;
