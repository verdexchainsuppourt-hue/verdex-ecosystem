import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/shared/reveal";
import { WHITEPAPER, WHITEPAPER_META } from "@/lib/whitepaper-content";
import { LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Whitepaper v1.1",
  description: "The official Verdex Whitepaper v1.1 — vision, ecosystem, tokenomics, architecture, security, governance and roadmap.",
};

export default function WhitepaperPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        {/* TOC */}
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <Badge>Whitepaper {WHITEPAPER_META.version}</Badge>
          <h1 className="mt-4 font-heading text-2xl font-bold text-ink">Verdex Whitepaper</h1>
          <p className="mt-1 text-xs text-faint">{WHITEPAPER_META.date} · {WHITEPAPER_META.tag}</p>
          <nav className="mt-6 hidden lg:block" aria-label="Whitepaper sections">
            <ul className="space-y-1 border-l border-line">
              {WHITEPAPER.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-muted transition-colors hover:border-emerald hover:text-emerald-bright">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <a href={LINKS.whitepaperPdf} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block">
            <Button variant="outline" size="sm"><Download className="h-4 w-4" /> Download PDF</Button>
          </a>
        </aside>

        {/* content */}
        <article className="max-w-3xl space-y-12">
          {WHITEPAPER.map((s, i) => (
            <Reveal key={s.id} delay={Math.min(i * 0.03, 0.2)}>
              <section id={s.id} aria-label={s.title} className="scroll-mt-24">
                <h2 className={cn("font-heading font-bold text-ink", i === 0 ? "text-3xl" : "text-2xl")}>
                  {s.title}
                </h2>
                <div className="mt-4 space-y-4">
                  {s.body.map((p, j) => (
                    <p key={j} className="leading-[1.85] text-mist">{p}</p>
                  ))}
                </div>
                {i < WHITEPAPER.length - 1 && <div className="mt-10 h-px bg-gradient-to-r from-transparent via-line to-transparent" />}
              </section>
            </Reveal>
          ))}

          <footer className="rounded-2xl border border-line bg-panel p-6 text-xs leading-relaxed text-muted">
            <strong className="text-ink">Disclaimer.</strong> This whitepaper is a pre-launch technical
            document. It does not constitute financial advice, an offer, or a claim that a public mainnet,
            VDX contract, or related services are live. Timelines and specifications may change through
            governance and audit processes.
          </footer>
        </article>
      </div>
    </div>
  );
}
