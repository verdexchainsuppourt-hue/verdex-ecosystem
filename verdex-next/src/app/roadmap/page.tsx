import { VERDEX_CONSTANTS } from "@/lib/constants";
import Link from "next/link";
import { CheckCircle2, Clock, ArrowRight, FlaskConical } from "lucide-react";

export const metadata = { title: "Roadmap" };

const statusMap = {
  completed: { label: "Completed", icon: CheckCircle2, cls: "text-vdx-green", dot: "bg-vdx-green border-vdx-green" },
  active: { label: "In Progress", icon: Clock, cls: "text-vdx-warning", dot: "bg-vdx-warning border-vdx-warning" },
  planned: { label: "Planned", icon: ArrowRight, cls: "text-vdx-muted", dot: "bg-transparent border-vdx-muted/40" },
  research: { label: "Research", icon: FlaskConical, cls: "text-vdx-cyan", dot: "bg-transparent border-vdx-cyan/40" },
};

export default function RoadmapPage() {
  return (
    <div className="py-20 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-vdx-green/6 blur-[100px] pointer-events-none" />
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-16">
          <span className="section-tag mb-3 block">Roadmap</span>
          <h1 className="font-heading text-5xl font-800 tracking-tight mb-4">
            The Path to <span className="gradient-text">Mainnet</span>
          </h1>
          <p className="text-vdx-muted text-lg max-w-xl mx-auto">
            Verdex is building toward a fully decentralized, audited, and community-governed mainnet. Here is where we stand.
          </p>
        </div>

        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gradient-to-b from-vdx-green/50 via-vdx-green/20 to-transparent" />
          <div className="space-y-6 pl-14">
            {VERDEX_CONSTANTS.roadmap.map((item, i) => {
              const s = statusMap[item.status];
              return (
                <div key={item.phase} className={`relative vdx-card p-7 ${item.status === "active" ? "border-vdx-green/30 bg-vdx-green/4" : ""}`}>
                  {/* Timeline dot */}
                  <div className={`absolute -left-9 top-7 w-4 h-4 rounded-full border-2 ${s.dot}`} />

                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-vdx-muted">{item.phase}</span>
                        {item.status === "active" && <span className="badge-live text-[10px]"><span className="pulse-dot w-1.5 h-1.5" />Active</span>}
                      </div>
                      <h2 className="font-heading font-bold text-xl mb-3">{item.title}</h2>
                      <p className="text-vdx-muted text-sm leading-relaxed">{item.description}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold flex-shrink-0 ${s.cls}`}>
                      <s.icon className="w-3.5 h-3.5" />
                      {s.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-vdx-muted text-sm mb-6">Track Verdex development and stay updated via our community channels.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/whitepaper" className="btn-primary px-7 py-3.5">
              Read Whitepaper
            </Link>
            <a href={VERDEX_CONSTANTS.social.telegram} target="_blank" rel="noopener noreferrer" className="btn-outline px-7 py-3.5">
              Join Telegram
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
