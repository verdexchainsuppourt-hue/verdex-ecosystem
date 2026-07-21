import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, FlaskConical, Hammer } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import { ROADMAP } from "@/lib/mock-data";
import type { RoadmapStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "The Verdex roadmap — completed phases, current development, and what comes next. No invented dates.",
};

const STATUS_META: Record<RoadmapStatus, { label: string; icon: typeof CheckCircle2; classes: string; dot: string }> = {
  completed: { label: "Completed", icon: CheckCircle2, classes: "border-emerald/40 bg-emerald/10 text-emerald-bright", dot: "bg-emerald shadow-glow-sm" },
  "in-development": { label: "In Development", icon: Hammer, classes: "border-cyan/40 bg-cyan/10 text-cyan", dot: "bg-cyan animate-pulse-dot" },
  planned: { label: "Planned", icon: CircleDashed, classes: "border-line bg-white/5 text-muted", dot: "bg-faint" },
  research: { label: "Research", icon: FlaskConical, classes: "border-azure/40 bg-azure/10 text-azure", dot: "bg-azure" },
};

export default function RoadmapPage() {
  return (
    <div className="container pb-24 pt-28 lg:pt-32">
      <SectionHeading
        tag="Roadmap"
        title={<>Where Verdex is <span className="text-gradient">headed.</span></>}
        description="Only milestones currently published or approved. No invented launch dates — phases ship when their evidence is complete."
      />

      <div className="relative mx-auto mt-16 max-w-3xl">
        {/* spine */}
        <span aria-hidden="true" className="absolute left-[22px] top-0 h-full w-px bg-gradient-to-b from-emerald/60 via-line to-transparent" />
        <ol className="space-y-8">
          {ROADMAP.map((item, i) => {
            const meta = STATUS_META[item.status];
            return (
              <Reveal key={item.phase} delay={i * 0.06}>
                <li className="relative flex gap-6 pl-2">
                  <span className="relative z-10 mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-elevate">
                    <span className={cn("h-3 w-3 rounded-full", meta.dot)} />
                  </span>
                  <div className="edge-glow flex-1 rounded-2xl border border-line bg-panel p-6 backdrop-blur-xl transition-all hover:border-emerald/30 hover:shadow-lift">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-bright">{item.phase}</span>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold", meta.classes)}>
                        <meta.icon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    </div>
                    <h2 className="mt-3 font-heading text-xl font-bold text-ink">{item.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{item.description}</p>
                  </div>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </div>

      <p className="mx-auto mt-14 max-w-2xl text-center text-sm leading-relaxed text-faint">
        Detailed pre-launch requirements (validator ceremony, signed genesis, audits, custody, KYC/AML ops,
        and public evidence) are documented in Whitepaper v1.1, section 8.
      </p>
    </div>
  );
}
