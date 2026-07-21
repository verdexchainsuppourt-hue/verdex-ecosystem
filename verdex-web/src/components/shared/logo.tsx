import { cn } from "@/lib/utils";

/** The real Verdex crystal emblem (from production brand assets). */
export function VerdexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 160" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("h-8 w-5", className)} aria-hidden="true">
      <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
      <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
      <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
      <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
    </svg>
  );
}

export function VerdexLogo({ className, textClassName }: { className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <VerdexMark className="h-9 w-[22px] drop-shadow-[0_0_12px_rgba(36,229,150,0.45)]" />
      <span className={cn("font-heading text-xl font-bold tracking-tight text-gradient", textClassName)}>Verdex</span>
    </span>
  );
}
