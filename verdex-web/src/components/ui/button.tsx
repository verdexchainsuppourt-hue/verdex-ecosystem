import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/60 focus-visible:ring-offset-2 focus-visible:ring-offset-abyss disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] relative overflow-hidden group",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-br from-emerald-bright via-emerald to-emerald-dim text-abyss shadow-glow hover:shadow-lift hover:-translate-y-0.5",
        outline:
          "border border-line bg-white/[0.02] text-emerald-bright backdrop-blur-md hover:bg-emerald/10 hover:border-emerald/50 hover:-translate-y-0.5",
        ghost: "text-mist hover:bg-white/5 hover:text-ink",
        glass:
          "bg-panel border border-line backdrop-blur-xl text-ink hover:border-emerald/40 hover:shadow-glow-sm",
        danger: "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20",
      },
      size: {
        sm: "h-9 px-4 text-xs",
        md: "h-11 px-6",
        lg: "h-13 px-8 text-base h-[52px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
      {/* shine sweep */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
