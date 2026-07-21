import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

export function SectionHeading({
  tag,
  title,
  description,
  align = "center",
  className,
}: {
  tag?: string;
  title: React.ReactNode;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <Reveal className={cn("max-w-2xl", align === "center" ? "mx-auto text-center" : "text-left", className)}>
      {tag && (
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-emerald/[0.06] px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-bright">
          {tag}
        </span>
      )}
      <h2 className="mt-5 font-heading text-3xl font-bold leading-[1.12] tracking-tight text-ink sm:text-4xl lg:text-[2.75rem] text-balance">
        {title}
      </h2>
      {description && <p className="mt-4 text-base leading-relaxed text-muted">{description}</p>}
      <span
        aria-hidden="true"
        className={cn(
          "mt-6 block h-[3px] w-16 rounded-full bg-gradient-to-r from-transparent via-emerald to-transparent shadow-glow-sm",
          align === "center" ? "mx-auto" : ""
        )}
      />
    </Reveal>
  );
}
