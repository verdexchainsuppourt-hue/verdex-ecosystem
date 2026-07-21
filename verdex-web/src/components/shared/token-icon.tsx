import { cn } from "@/lib/utils";
import { TOKENS } from "@/lib/constants";

/** Deterministic gradient token avatar (no external images needed). */
export function TokenIcon({ symbol, size = 36, className }: { symbol: string; size?: number; className?: string }) {
  const token = TOKENS[symbol];
  const color = token?.color ?? "#24E596";
  const letters = symbol.slice(0, symbol.length > 4 ? 3 : 4);
  return (
    <span
      aria-hidden="true"
      className={cn("relative grid shrink-0 select-none place-items-center rounded-full border font-heading font-bold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.28,
        color: "#020706",
        background: `linear-gradient(135deg, ${color}, ${color}99)`,
        borderColor: `${color}66`,
        boxShadow: `0 0 ${size / 2.5}px ${color}44`,
      }}
    >
      {letters}
    </span>
  );
}

export function TokenPairIcon({ a, b, size = 32, className }: { a: string; b: string; size?: number; className?: string }) {
  return (
    <span className={cn("flex items-center", className)}>
      <TokenIcon symbol={a} size={size} />
      <TokenIcon symbol={b} size={size} className="-ml-2.5 ring-2 ring-abyss" />
    </span>
  );
}
