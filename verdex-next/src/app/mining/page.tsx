import Link from "next/link";
import { Download, Pickaxe, CheckCircle2, Monitor, Smartphone, Terminal, ArrowRight } from "lucide-react";
import { VERDEX_CONSTANTS } from "@/lib/constants";

export const metadata = {
  title: "VDX Mining — Earn Rewards",
  description: "Download the Verdex Miner, connect it to your account, and start earning Verdex Points (VP) by contributing compute resources to the DePIN network.",
};

export default function MiningPage() {
  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative py-28 grid-bg overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full bg-vdx-green/8 blur-[120px] pointer-events-none" />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <span className="section-tag mb-4 block">DePIN Mining</span>
          <h1 className="font-heading text-5xl sm:text-6xl font-800 tracking-tight mb-6">
            Mine <span className="gradient-text">VDX</span> with Your Device
          </h1>
          <p className="text-vdx-muted text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Contribute your idle CPU or GPU compute to the Verdex DePIN network. Earn Verdex Points (VP) — your pre-TGE mining balance — redeemable for VDX at token launch.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/register" className="btn-primary text-base px-8 py-4">
              <Pickaxe className="w-4 h-4" /> Start Mining Free
            </Link>
            <Link href="/dashboard/downloads" className="btn-outline text-base px-8 py-4">
              <Download className="w-4 h-4" /> Download Miner
            </Link>
          </div>
        </div>
      </section>

      {/* Miner downloads */}
      <section className="py-20 bg-vdx-section">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="section-tag mb-3 block">Available Miners</span>
            <h2 className="font-heading text-4xl font-800 tracking-tight">Download for Your Platform</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Monitor, label: "Windows", version: VERDEX_CONSTANTS.miners.windows.version,
                href: "/updates/Verdex-Miner-Setup-4.0.2.exe",
                features: ["GUI dashboard", "System tray support", "Auto-reconnect", "Windows 10/11 x64"],
                status: "live", badge: "Recommended",
              },
              {
                icon: Smartphone, label: "Android", version: VERDEX_CONSTANTS.miners.android.version,
                href: "/assets/downloads/Verdex-Android-1.10.0-build47.apk",
                features: ["Background mining", "Push notifications", "Battery optimized", "Android 8.0+"],
                status: "live", badge: null,
              },
              {
                icon: Terminal, label: "Linux CLI", version: "CLI",
                href: "/dashboard/downloads",
                features: ["Command-line interface", "systemd service", "Headless server ready", "Ubuntu/Debian"],
                status: "docs", badge: null,
              },
            ].map((m) => (
              <div key={m.label} className="vdx-card p-7 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-vdx-green/10 border border-vdx-green/20 flex items-center justify-center">
                    <m.icon className="w-5 h-5 text-vdx-green" />
                  </div>
                  {m.badge && <span className="badge-live text-[10px]">{m.badge}</span>}
                </div>
                <h3 className="font-heading font-bold text-xl mb-1">{m.label} Miner</h3>
                <p className="font-mono text-xs text-vdx-muted mb-4">v{m.version}</p>
                <ul className="space-y-1.5 mb-6 flex-1">
                  {m.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-vdx-muted">
                      <CheckCircle2 className="w-3.5 h-3.5 text-vdx-green flex-shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <a href={m.href} className={`w-full justify-center ${m.status === "live" ? "btn-primary" : "btn-outline"} text-sm py-3`}>
                  <Download className="w-4 h-4" />
                  {m.status === "live" ? `Download v${m.version}` : "View Docs"}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How mining works */}
      <section className="py-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="section-tag mb-3 block">Process</span>
            <h2 className="font-heading text-4xl font-800 tracking-tight">How Mining Works</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-5">
            {[
              { n: "01", title: "Create Account", desc: "Register free on Verdex with your email. No wallet required to start." },
              { n: "02", title: "Download Miner", desc: "Get the Windows or Android miner app from your dashboard downloads." },
              { n: "03", title: "Authenticate", desc: "Generate a miner token in Settings and paste it into the miner app." },
              { n: "04", title: "Earn VP Rewards", desc: "The miner runs in the background. Track earnings in your dashboard." },
            ].map((s) => (
              <div key={s.n} className="vdx-card p-6 relative">
                <span className="absolute top-5 right-5 font-heading font-800 text-4xl text-vdx-green/6 select-none">{s.n}</span>
                <div className="w-9 h-9 rounded-xl bg-vdx-green/12 border border-vdx-green/25 flex items-center justify-center mb-4">
                  <span className="font-mono text-sm font-bold text-vdx-green">{s.n}</span>
                </div>
                <h3 className="font-heading font-bold text-base mb-2">{s.title}</h3>
                <p className="text-vdx-muted text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/auth/register" className="btn-primary text-sm px-7 py-3.5">
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-10 bg-vdx-section">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <p className="text-xs text-vdx-muted leading-relaxed">
            VP (Verdex Points) has no monetary value until the VDX Token Generation Event. Mining yields are variable and depend on network activity, hashrate, and protocol parameters. No earnings are guaranteed. Cryptocurrency carries substantial risk.
          </p>
        </div>
      </section>
    </div>
  );
}
