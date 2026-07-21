import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Permanent anti-phishing warning shown on auth/download/wallet surfaces. */
export function SecurityWarning({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-amber/25 bg-amber/[0.07] text-amber",
        compact ? "px-3.5 py-2.5 text-xs" : "px-4 py-3.5 text-sm",
        className
      )}
    >
      <ShieldAlert className={cn("shrink-0", compact ? "h-4 w-4 mt-px" : "h-5 w-5 mt-0.5")} />
      <p className="leading-relaxed">
        <strong className="font-semibold">Verdex will never ask for your seed phrase or private key.</strong>
        {!compact && " Always verify you are on https://verdexswap.site before signing in or downloading software."}
      </p>
    </div>
  );
}
