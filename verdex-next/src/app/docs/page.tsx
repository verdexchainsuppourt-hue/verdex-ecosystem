import Link from "next/link";
import { ExternalLink, Code2, Terminal } from "lucide-react";

export const metadata = { title: "Developer Documentation" };

export default function DocsPage() {
  return (
    <div className="py-20">
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="text-center">
          <span className="section-tag mb-3 block">Developer Docs</span>
          <h1 className="font-heading text-5xl font-800 tracking-tight mb-4">
            Verdex <span className="gradient-text">Developer Documentation</span>
          </h1>
          <p className="text-vdx-muted">Smart contracts, RPC API, miner protocol, and integration guides.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {[
            { icon: Code2, title: "Smart Contract Reference", desc: "VerdexFactory, VerdexPair, VerdexRouter — ABI, deployment addresses, and integration patterns.", href: "https://verdexswap.site/verdex-developer-docs.html" },
            { icon: Terminal, title: "RPC API", desc: "Access the Verdex JSON-RPC endpoint (same-origin proxy). eth_call, eth_blockNumber, and custom methods.", href: "https://verdexswap.site/verdex-developer-docs.html" },
            { icon: Code2, title: "Miner Protocol", desc: "Miner authentication token format, WebSocket protocol, hashrate reporting, and session management.", href: "https://verdexswap.site/verdex-developer-docs.html" },
            { icon: Terminal, title: "Swap SDK", desc: "JavaScript/TypeScript SDK for fetching quotes, computing routes, and building swap transactions.", href: "https://verdexswap.site/verdex-developer-docs.html" },
          ].map((d) => (
            <a key={d.title} href={d.href} target="_blank" rel="noopener noreferrer" className="vdx-card p-6 group">
              <d.icon className="w-5 h-5 text-vdx-green mb-4" />
              <h3 className="font-heading font-bold text-base mb-2 group-hover:text-vdx-green transition-colors">{d.title}</h3>
              <p className="text-vdx-muted text-sm leading-relaxed">{d.desc}</p>
              <div className="flex items-center gap-1.5 mt-4 text-xs text-vdx-green">View docs <ExternalLink className="w-3 h-3" /></div>
            </a>
          ))}
        </div>

        <div className="vdx-card p-7 text-center">
          <h2 className="font-heading font-bold text-base mb-3">Full Documentation</h2>
          <p className="text-vdx-muted text-sm mb-5">View the complete Verdex developer documentation including contract ABIs, API reference, and integration examples.</p>
          <a href="https://verdexswap.site/verdex-developer-docs.html" target="_blank" rel="noopener noreferrer" className="btn-primary text-sm px-7 py-3">
            <ExternalLink className="w-4 h-4" /> Open Full Docs
          </a>
        </div>
      </div>
    </div>
  );
}
