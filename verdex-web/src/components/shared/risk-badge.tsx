import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

const tones: Record<RiskLevel, string> = {
  Low: "border-emerald/30 bg-emerald/10 text-emerald-bright",
  Medium: "border-amber/30 bg-amber/10 text-amber",
  High: "border-danger/30 bg-danger/10 text-danger",
};

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", tones[level], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level} risk
    </span>
  );
}
