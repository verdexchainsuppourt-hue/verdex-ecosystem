import Link from "next/link";
import { Shield, KeyRound, AlertTriangle, Lock, FileCheck, ArrowRight } from "lucide-react";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <div className="py-20 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-vdx-green/6 blur-[100px] pointer-events-none" />
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 relative space-y-12">
        <div className="text-center">
          <span className="section-tag mb-3 block">Security</span>
          <h1 className="font-heading text-5xl font-800 tracking-tight mb-4">
            Built for <span className="gradient-text">Self-Custody</span>
          </h1>
          <p className="text-vdx-muted text-lg max-w-xl mx-auto">
            Verdex is designed from the ground up to keep you in control of your assets and your data at all times.
          </p>
        </div>

        {/* Critical notice */}
        <div className="flex items-start gap-3 p-5 rounded-xl bg-[rgba(255,92,108,0.08)] border border-[rgba(255,92,108,0.25)]">
          <AlertTriangle className="w-5 h-5 text-vdx-error flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-vdx-error block mb-1">Critical Safety Notice</strong>
            <p className="text-sm text-vdx-muted leading-relaxed">
              Verdex will <strong>never</strong> ask for your wallet seed phrase, private key, or HSM credentials — not via email, Telegram, Discord, or any other channel. Only interact with the platform on <span className="font-mono text-vdx-green">verdexswap.site</span>. Report impersonators immediately.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {[
            {
              icon: KeyRound,
              title: "Non-Custodial Design",
              desc: "Verdex never takes custody of your tokens. Every swap is executed directly between your wallet and the on-chain AMM. There are no centralized order books or custodial bridges.",
            },
            {
              icon: Lock,
              title: "Admin Timelocks",
              desc: "All administrative actions on deployed contracts will be protected by multi-day timelocks, giving the community time to review and react before changes take effect.",
            },
            {
              icon: FileCheck,
              title: "Pre-Launch Audits",
              desc: "All smart contracts will undergo independent third-party security audits by at least two firms before mainnet deployment. Audit reports will be published publicly.",
            },
            {
              icon: Shield,
              title: "Multi-Sig Treasury",
              desc: "The Verdex treasury is controlled by a multi-signature wallet requiring multiple independent hardware-key signers to authorize any outbound transaction.",
            },
          ].map((f) => (
            <div key={f.title} className="vdx-card p-6">
              <div className="w-10 h-10 rounded-xl bg-vdx-green/10 border border-vdx-green/20 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-vdx-green" />
              </div>
              <h3 className="font-heading font-bold text-base mb-2">{f.title}</h3>
              <p className="text-vdx-muted text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* User best practices */}
        <div className="vdx-card p-7">
          <h2 className="font-heading font-bold text-xl mb-5">User Security Best Practices</h2>
          <ul className="space-y-3">
            {[
              "Always verify you are on verdexswap.site — bookmark the official URL",
              "Use a hardware wallet (Ledger, Trezor) for significant holdings",
              "Never share your wallet seed phrase with any person or website",
              "Use a unique miner authentication token — not your main account password",
              "Enable 2FA on your email account associated with Verdex",
              "Download the Verdex Miner only from verdexswap.site — verify checksums",
              "Be skeptical of DMs claiming to be Verdex support — we don't DM first",
              "Verify contract addresses against published sources before approving transactions",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-vdx-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-vdx-green mt-2 flex-shrink-0" />{item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center">
          <Link href="/faq" className="btn-outline px-7 py-3.5">
            Security FAQ <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
