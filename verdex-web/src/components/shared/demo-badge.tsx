import { cn } from "@/lib/utils";

/** Marks placeholder/demo data so it is never mistaken for live production data. */
export function DemoBadge({ className, label = "Demo" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-azure/30 bg-azure/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-azure",
        className
      )}
    >
      {label}
    </span>
  );
}
