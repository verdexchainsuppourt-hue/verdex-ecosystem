import Link from "next/link";

export const metadata = { title: "FAQ — Frequently Asked Questions" };

const FAQS = [
  {
    category: "About Verdex",
    items: [
      { q: "What is Verdex?", a: "Verdex is a next-generation green EVM blockchain ecosystem featuring a decentralized AMM swap, liquidity pools, DePIN CPU/GPU mining, and the VDX token — all in one self-custodial platform." },
      { q: "Is Verdex open source?", a: "The Verdex smart contracts and ecosystem code are available on GitHub at github.com/verdexchainsuppourt-hue/verdex-ecosystem. Frontend and infrastructure components are being open-sourced progressively." },
      { q: "Who built Verdex?", a: "Verdex was developed by Suleman. The development team will be expanded and revealed as the project progresses toward mainnet launch." },
    ],
  },
  {
    category: "Swapping",
    items: [
      { q: "How does the Verdex swap work?", a: "Verdex Swap uses an Automated Market Maker (AMM) based on the constant product formula x×y=k. The router evaluates direct and multi-hop paths to find the optimal route for your trade. A 0.25% fee is applied to all swaps." },
      { q: "What tokens can I swap?", a: "The current Verdex AMM supports WVDX (Wrapped VDX), USDT, and ALP. More pairs will be added as liquidity deepens after mainnet launch." },
      { q: "Can I execute swaps with my wallet now?", a: "Live AMM quotes are available now. Wallet-signed swap execution is the next release milestone, pending audited contract deployment and mainnet validator operations." },
      { q: "Does Verdex take custody of my tokens?", a: "No. Verdex is fully self-custodial. Your wallet keys remain with you at all times. Every swap is executed on-chain through verifiable smart contracts." },
    ],
  },
  {
    category: "Mining",
    items: [
      { q: "What is VDX mining?", a: "Verdex mining is a DePIN (Decentralized Physical Infrastructure Network) system where you contribute idle CPU or GPU compute from your device to the Verdex network in exchange for Verdex Points (VP)." },
      { q: "What is VP (Verdex Points)?", a: "VP is your pre-TGE (Token Generation Event) mining balance. It accumulates while you mine and will be convertible to VDX tokens at a defined ratio when the VDX contract is deployed and audited." },
      { q: "How do I start mining?", a: "Create a free Verdex account, download the Windows or Android miner app, generate a miner token in your dashboard settings, and connect the app. The miner runs in the background." },
      { q: "Are mining yields guaranteed?", a: "No. Mining yields depend on your hashrate, network activity, and protocol emission parameters. VP has no monetary value until the TGE. Cryptocurrency involves substantial risk." },
    ],
  },
  {
    category: "Security",
    items: [
      { q: "Is Verdex safe to use?", a: "Verdex follows self-custodial design principles. The platform never holds your assets. Smart contracts are designed for audit before mainnet deployment. Always verify you are on verdexswap.site before connecting any wallet." },
      { q: "Will Verdex ever ask for my seed phrase?", a: "Never. Verdex will never ask for your wallet seed phrase, private key, or HSM credentials. If any service claiming to be Verdex asks for these, it is a scam." },
      { q: "How do I keep my miner account secure?", a: "Use a strong unique password, enable email verification, use miner tokens (not your main password) for miner app authentication, and never share your miner token with anyone." },
      { q: "Are the smart contracts audited?", a: "A third-party audit is required before mainnet contract deployment. As stated in the whitepaper, all contracts will be audited by at least two independent security firms before going live." },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="py-20 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-vdx-green/6 blur-[100px] pointer-events-none" />
      <div className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-14">
          <span className="section-tag mb-3 block">FAQ</span>
          <h1 className="font-heading text-5xl font-800 tracking-tight mb-4">
            Frequently Asked <span className="gradient-text">Questions</span>
          </h1>
          <p className="text-vdx-muted text-lg">Everything you need to know about Verdex, VDX, swapping, and mining.</p>
        </div>

        <div className="space-y-10">
          {FAQS.map((section) => (
            <div key={section.category}>
              <h2 className="font-heading font-bold text-sm text-vdx-green uppercase tracking-widest mb-4 px-1">{section.category}</h2>
              <div className="space-y-3">
                {section.items.map((item, i) => (
                  <details key={i} className="vdx-card p-5 group open:border-vdx-green/25 cursor-pointer">
                    <summary className="flex items-center justify-between font-semibold text-vdx-text text-sm list-none select-none">
                      {item.q}
                      <span className="w-5 h-5 rounded-full border border-[rgba(87,255,179,0.2)] flex items-center justify-center flex-shrink-0 ml-4 text-vdx-muted group-open:text-vdx-green group-open:border-vdx-green/40 group-open:rotate-45 transition-all duration-200 text-lg leading-none">+</span>
                    </summary>
                    <p className="text-vdx-muted text-sm leading-relaxed mt-3 pr-6">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center vdx-card p-8">
          <h3 className="font-heading font-bold text-lg mb-2">Still have questions?</h3>
          <p className="text-vdx-muted text-sm mb-6">Join the Verdex community or read the full technical whitepaper.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/whitepaper" className="btn-primary px-6 py-3">Read Whitepaper</Link>
            <a href="https://discord.gg/verdex" target="_blank" rel="noopener noreferrer" className="btn-outline px-6 py-3">Join Discord</a>
          </div>
        </div>
      </div>
    </div>
  );
}
