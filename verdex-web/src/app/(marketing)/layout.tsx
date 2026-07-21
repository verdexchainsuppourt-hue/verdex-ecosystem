import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* ambient background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-emerald/[0.07] blur-[110px] animate-aurora" />
        <div className="absolute top-1/3 -right-32 h-[380px] w-[380px] rounded-full bg-cyan/[0.05] blur-[110px] animate-aurora" style={{ animationDelay: "-9s" }} />
        <div className="absolute bottom-0 left-1/3 h-[340px] w-[340px] rounded-full bg-azure/[0.04] blur-[110px] animate-aurora" style={{ animationDelay: "-17s" }} />
        <div className="grid-bg absolute inset-0" />
      </div>
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
