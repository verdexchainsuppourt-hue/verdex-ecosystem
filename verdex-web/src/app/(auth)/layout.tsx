import Link from "next/link";
import { VerdexLogo } from "@/components/shared/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 left-1/4 h-[420px] w-[420px] rounded-full bg-emerald/[0.08] blur-[120px] animate-aurora" />
        <div className="absolute bottom-0 right-1/4 h-[340px] w-[340px] rounded-full bg-cyan/[0.05] blur-[120px] animate-aurora" style={{ animationDelay: "-12s" }} />
        <div className="grid-bg absolute inset-0" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Back to Verdex home"><VerdexLogo /></Link>
        </div>
        {children}
      </div>
    </div>
  );
}
