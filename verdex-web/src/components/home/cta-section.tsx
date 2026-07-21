"use client";

import Link from "next/link";
import { Pickaxe, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";
import { VerdexMark } from "@/components/shared/logo";

export function CtaSection() {
  return (
    <section className="container py-24" aria-label="Get started with Verdex">
      <Reveal>
        <div className="edge-glow relative overflow-hidden rounded-3xl border border-emerald/25 bg-gradient-to-br from-emerald/[0.1] via-panel to-panel px-6 py-16 text-center shadow-lift sm:px-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 left-1/2 h-56 w-[80%] -translate-x-1/2 rounded-full bg-emerald/10 blur-[90px]" />
          </div>
          <VerdexMark className="mx-auto h-16 w-10 animate-floaty drop-shadow-[0_0_30px_rgba(36,229,150,0.5)]" />
          <h2 className="mx-auto mt-8 max-w-2xl font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl text-balance">
            Ready to <span className="text-gradient">Swap Smart</span> and Grow Green?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted">
            Create your account in under a minute, download the miner, and start
            participating in the Verdex ecosystem today.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
            <Link href="/dashboard">
              <Button size="lg"><Rocket className="h-[18px] w-[18px]" /> Launch Verdex</Button>
            </Link>
            <Link href="/mining">
              <Button size="lg" variant="outline"><Pickaxe className="h-[18px] w-[18px]" /> Start Mining</Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-faint">Self-custodial · No seed phrase ever required · Pre-mainnet software</p>
        </div>
      </Reveal>
    </section>
  );
}
