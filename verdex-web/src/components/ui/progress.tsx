import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  tone?: "emerald" | "cyan" | "amber" | "danger";
}

const tones: Record<string, string> = {
  emerald: "from-emerald-dim via-emerald to-emerald-bright",
  cyan: "from-cyan-dim via-cyan to-cyan",
  amber: "from-amber/70 via-amber to-amber",
  danger: "from-danger/70 via-danger to-danger",
};

function Progress({ value, tone = "emerald", className, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out shadow-glow-sm", tones[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export { Progress };
