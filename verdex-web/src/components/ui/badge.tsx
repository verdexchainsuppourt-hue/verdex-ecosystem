import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "border-emerald/30 bg-emerald/10 text-emerald-bright",
        cyan: "border-cyan/30 bg-cyan/10 text-cyan",
        amber: "border-amber/30 bg-amber/10 text-amber",
        danger: "border-danger/30 bg-danger/10 text-danger",
        neutral: "border-white/10 bg-white/5 text-muted",
        demo: "border-azure/30 bg-azure/10 text-azure normal-case tracking-normal",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
