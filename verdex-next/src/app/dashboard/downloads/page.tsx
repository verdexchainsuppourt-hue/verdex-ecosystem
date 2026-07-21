import Link from "next/link";
import { Download, Shield, AlertTriangle, CheckCircle2, ExternalLink, Terminal } from "lucide-react";
import { VERDEX_CONSTANTS } from "@/lib/constants";

export const metadata = { title: "Downloads — Verdex Miner" };

export default function DownloadsPage() {
  const { miners } = VERDEX_CONSTANTS;

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          Miner <span className="gradient-text">Downloads</span>
        </h1>
        <p className="text-vdx-muted text-sm mt-1">
          Download the official Verdex Miner. Verify checksums before running any executable.
        </p>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(245,185,66,0.08)] border border-[rgba(245,185,66,0.2)]">
        <AlertTriangle className="w-4 h-4 text-vdx-warning flex-shrink-0 mt-0.5" />
        <div className="text-sm text-vdx-muted leading-relaxed">
          <strong className="text-vdx-warning">Security:</strong> Only download miners from{" "}
          <span className="font-mono text-vdx-green">verdexswap.site</span>.
          Verdex will never DM you a download link. Verify file hashes before installation.
          Do not run the miner with admin/root privileges unless required for your OS.
        </div>
      </div>

      {/* Download cards */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* Windows */}
        <div className="vdx-card p-6 flex flex-col">
          <div className="text-4xl mb-4">🪟</div>
          <h2 className="font-heading font-bold text-lg mb-1">Windows Miner</h2>
          <p className="text-vdx-muted text-sm mb-3">Full-featured desktop miner with GUI and system tray support.</p>
          <div className="space-y-2 mb-6 flex-1">
            {[
              `Version: ${miners.windows.version}`,
              "Supported: Windows 10 / 11 (64-bit)",
              "CPU & GPU mining",
              "Auto-reconnect on disconnect",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-vdx-muted">
                <CheckCircle2 className="w-3.5 h-3.5 text-vdx-green flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <a
            href="/updates/Verdex-Miner-Setup-4.0.2.exe"
            className="btn-primary w-full justify-center py-3 text-sm"
          >
            <Download className="w-4 h-4" />
            Download v{miners.windows.version}
          </a>
          <p className="text-center text-[10px] text-vdx-muted mt-2 font-mono">
            .exe · Windows installer
          </p>
        </div>

        {/* Android */}
        <div className="vdx-card p-6 flex flex-col">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="font-heading font-bold text-lg mb-1">Android Miner</h2>
          <p className="text-vdx-muted text-sm mb-3">Mobile miner for Android smartphones and tablets.</p>
          <div className="space-y-2 mb-6 flex-1">
            {[
              `Version: ${miners.android.version} (build 42)`,
              "Android 8.0+ required",
              "Background mining support",
              "Enable Unknown Sources to install",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-vdx-muted">
                <CheckCircle2 className="w-3.5 h-3.5 text-vdx-green flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <a
            href="/assets/downloads/Verdex-Android-1.10.0-build47.apk"
            className="btn-primary w-full justify-center py-3 text-sm"
          >
            <Download className="w-4 h-4" />
            Download APK v{miners.android.version}
          </a>
          <p className="text-center text-[10px] text-vdx-muted mt-2 font-mono">
            .apk · Sideload required
          </p>
        </div>

        {/* Linux CLI */}
        <div className="vdx-card p-6 flex flex-col opacity-80">
          <div className="text-4xl mb-4">🐧</div>
          <h2 className="font-heading font-bold text-lg mb-1">Linux CLI Miner</h2>
          <p className="text-vdx-muted text-sm mb-3">Command-line miner for Linux servers and desktops.</p>
          <div className="space-y-2 mb-6 flex-1">
            {[
              "Ubuntu 20.04 / Debian 11+",
              "CPU mining via CLI flags",
              "Systemd service ready",
              "Authentication via miner token",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs text-vdx-muted">
                <CheckCircle2 className="w-3.5 h-3.5 text-vdx-green/60 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <div className="p-4 rounded-xl bg-black/30 border border-dashed border-[rgba(87,255,179,0.15)] font-mono text-xs text-vdx-muted">
            <p className="text-vdx-green mb-1"># Generate your miner token first</p>
            <p>$ verdex-miner --token YOUR_TOKEN</p>
          </div>
          <p className="text-center text-[10px] text-vdx-warning mt-3">
            CLI binary download — instructions in docs
          </p>
          <Link href="/docs" className="btn-outline w-full justify-center py-2.5 text-sm mt-2">
            <ExternalLink className="w-3.5 h-3.5" />
            View CLI Docs
          </Link>
        </div>
      </div>

      {/* Miner token section */}
      <div className="vdx-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Terminal className="w-5 h-5 text-vdx-green" />
          <h2 className="font-heading font-bold text-base">Miner Authentication Token</h2>
        </div>
        <p className="text-vdx-muted text-sm mb-4">
          After downloading the miner, generate an authentication token in your dashboard settings. This token connects the miner app to your account. Never share your miner token — it grants mining access to your account.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/settings" className="btn-primary text-sm px-5 py-2.5">
            Generate Miner Token
          </Link>
          <Link href="/docs" className="btn-outline text-sm px-5 py-2.5">
            <ExternalLink className="w-3.5 h-3.5" />
            Setup Guide
          </Link>
        </div>
      </div>

      {/* Safety checklist */}
      <div className="vdx-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-vdx-green" />
          <h2 className="font-heading font-bold text-base">Safety Checklist</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            "Download only from verdexswap.site — no third-party mirrors",
            "Verify the file hash matches the published checksum",
            "Do not enter your email password in the miner app — use a miner token",
            "Your seed phrase / private key should never be entered anywhere on this platform",
            "Report suspicious apps or links claiming to be Verdex miners",
            "Keep your miner app updated to the latest version",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 p-3 rounded-xl bg-[rgba(36,229,150,0.04)] border border-[rgba(87,255,179,0.08)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-vdx-green mt-0.5 flex-shrink-0" />
              <span className="text-xs text-vdx-muted leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
