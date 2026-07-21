"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { VerdexMark } from "@/components/shared/logo";

/** Lightweight fallback: static emblem + CSS halo (mobile / no WebGL / reduced motion). */
export function CrystalFallback() {
  return (
    <div className="relative grid h-full min-h-[320px] place-items-center" role="img" aria-label="Verdex crystal emblem">
      <span className="absolute h-56 w-56 rounded-full bg-emerald/15 blur-[70px] animate-pulse" />
      <span className="absolute h-72 w-72 rounded-full border border-emerald/20 animate-spin-slower" />
      <span className="absolute h-56 w-56 rounded-full border border-cyan/15 animate-spin-slower" style={{ animationDirection: "reverse" }} />
      <VerdexMark className="h-36 w-24 animate-floaty drop-shadow-[0_0_50px_rgba(36,229,150,0.5)]" />
    </div>
  );
}

const LazyScene = dynamic(() => import("./crystal-scene"), {
  ssr: false,
  loading: () => <CrystalFallback />,
});

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function HeroCrystal() {
  const [mode, setMode] = useState<"loading" | "webgl" | "fallback">("loading");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.innerWidth < 640;
    if (reduced || !supportsWebGL()) setMode("fallback");
    else setMode("webgl");
    // fewer particles on small screens
    if (mobile) setParticleCount(40);
  }, []);

  const [particleCount, setParticleCount] = useState(90);

  if (mode !== "webgl") return <CrystalFallback />;
  return (
    <div className="h-full min-h-[380px] w-full">
      <LazyScene particleCount={particleCount} />
    </div>
  );
}
