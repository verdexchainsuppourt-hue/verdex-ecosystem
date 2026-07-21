"use client";

import { useState } from "react";
import { 
  DollarSign, RefreshCw, ShoppingCart, Tag, ShieldCheck, 
  AlertCircle, PlusCircle, CheckCircle2, ChevronRight, Info
} from "lucide-react";
import { formatVP } from "@/lib/utils";

interface P2PClientProps {
  initialOrders: any[];
  userEntitlement: any;
  userId: string;
  createOrderAction: (formData: any) => Promise<{ success: boolean; error?: string }>;
}

export function P2PClient({ initialOrders, userEntitlement, userId, createOrderAction }: P2PClientProps) {
  const [orders, setOrders] = useState<any[]>(initialOrders);
  const [side, setSide] = useState<"buy_vdx" | "sell_vdx">("sell_vdx"); // sell_vdx orders show up under "Buy VDX" tab
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Create form state
  const [amount, setAmount] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [methods, setMethods] = useState("");
  const [terms, setTerms] = useState("");

  const isEligible = userEntitlement?.state === "eligible";

  // Filter orders by side (if side is sell_vdx, it means a maker is selling, so the user clicks "Buy")
  const filteredOrders = orders.filter(
    (o) => o.side === side && o.status === "open"
  );

  // Fallback stubs for beautiful preview if book is empty
  const defaultStubs = [
    {
      id: "stub-1",
      public_reference: "VDX-7A9B1C2D3E4F",
      side: "sell_vdx",
      fiat_price_per_vdx: 1.05,
      fiat_currency: "USD",
      remaining_amount_atomic: BigInt("500000000000000000000000"), // 500k VDX
      minimum_trade_amount_atomic: BigInt("10000000000000000000000"), // 10k VDX
      payment_method_codes: ["BANK_TRANSFER", "REVOLUT"],
      terms_summary: "Fast trade. Instant release upon verification.",
      creator_user_id: "stub-maker-1"
    },
    {
      id: "stub-2",
      public_reference: "VDX-9C8D7E6F5A4B",
      side: "buy_vdx",
      fiat_price_per_vdx: 0.98,
      fiat_currency: "USD",
      remaining_amount_atomic: BigInt("250000000000000000000000"), // 250k VDX
      minimum_trade_amount_atomic: BigInt("5000000000000000000000"), // 5k VDX
      payment_method_codes: ["PAYPAL", "ZELLE"],
      terms_summary: "Always online. Safe escrow only.",
      creator_user_id: "stub-maker-2"
    }
  ];

  const displayOrders = filteredOrders.length > 0 
    ? filteredOrders 
    : defaultStubs.filter((o) => o.side === side);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!amount || !price || !methods) {
      setErrorMsg("Please fill in all required fields.");
      setLoading(false);
      return;
    }

    try {
      const res = await createOrderAction({
        side: side === "sell_vdx" ? "buy_vdx" : "sell_vdx", // swap for maker perspective
        amount: parseFloat(amount),
        minAmount: parseFloat(minAmount || "1"),
        price: parseFloat(price),
        currency: currency.toUpperCase(),
        methods: methods.split(",").map(m => m.trim().toUpperCase()),
        terms
      });

      if (res.success) {
        setSuccessMsg("Order posted successfully to the P2P book!");
        setShowCreateModal(false);
        // Reset form
        setAmount("");
        setMinAmount("");
        setPrice("");
        setMethods("");
        setTerms("");
      } else {
        setErrorMsg(res.error || "Failed to post P2P order.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
            P2P <span className="gradient-text">Marketplace</span>
          </h1>
          <p className="text-vdx-muted text-sm mt-1">
            Trade VDX tokens directly with other verified users using on-chain escrow.
          </p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary py-2.5 px-4 text-sm flex items-center gap-2"
        >
          <PlusCircle className="w-4 h-4" /> Post Offer
        </button>
      </div>

      {/* KYC Entitlement Alert Banner */}
      <div className={`flex items-start gap-3 p-4 rounded-xl border ${
        isEligible 
          ? "bg-[rgba(34,197,94,0.06)] border-[rgba(34,197,94,0.25)] text-vdx-text"
          : "bg-[rgba(245,185,66,0.05)] border-[rgba(245,185,66,0.2)] text-vdx-muted"
      }`}>
        {isEligible ? (
          <ShieldCheck className="w-5 h-5 text-vdx-green flex-shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-5 h-5 text-vdx-warning flex-shrink-0 mt-0.5" />
        )}
        <div className="text-sm leading-relaxed flex-1">
          {isEligible ? (
            <div>
              <strong className="text-vdx-green">KYC Verified:</strong> You are fully authorized for peer-to-peer VDX trading. Settlement runs via safe on-chain escrows.
            </div>
          ) : (
            <div>
              <strong className="text-vdx-warning">Verification Needed:</strong> Your account is currently <strong>{userEntitlement?.state || "not eligible"}</strong> for P2P trading. Complete your KYC verification in settings to begin posting orders and trading.
            </div>
          )}
        </div>
      </div>

      {/* Main trading panel */}
      <div className="vdx-card">
        {/* Navigation tabs */}
        <div className="flex justify-between items-center border-b border-[rgba(87,255,179,0.15)] bg-black/25 px-4">
          <div className="flex">
            <button
              onClick={() => setSide("sell_vdx")}
              className={`px-6 py-4 text-sm font-semibold border-b-2 transition-all ${
                side === "sell_vdx"
                  ? "border-vdx-green text-vdx-green"
                  : "border-transparent text-vdx-muted hover:text-vdx-text"
              }`}
            >
              Buy VDX
            </button>
            <button
              onClick={() => setSide("buy_vdx")}
              className={`px-6 py-4 text-sm font-semibold border-b-2 transition-all ${
                side === "buy_vdx"
                  ? "border-vdx-green text-vdx-green"
                  : "border-transparent text-vdx-muted hover:text-vdx-text"
              }`}
            >
              Sell VDX
            </button>
          </div>
          
          <button 
            onClick={() => setOrders(initialOrders)}
            className="p-2 text-vdx-muted hover:text-vdx-text transition-colors"
            title="Refresh order book"
          >
            <RefreshCw className="w-4 h-4 animate-spin-hover" />
          </button>
        </div>

        {/* Order Book Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[rgba(87,255,179,0.1)] text-xs text-vdx-muted uppercase tracking-wider bg-black/10">
                <th className="p-4 pl-6">Reference</th>
                <th className="p-4">Price</th>
                <th className="p-4">Available / Limits</th>
                <th className="p-4">Payment Methods</th>
                <th className="p-4 text-right pr-6">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-sm">
              {displayOrders.map((order) => {
                const isSeller = order.side === "sell_vdx";
                // Convert atomic wei to whole numbers for display
                const remaining = Number(BigInt(order.remaining_amount_atomic) / BigInt(1e18));
                const min = Number(BigInt(order.minimum_trade_amount_atomic) / BigInt(1e18));
                const creator = order.creator_user_id === userId;

                return (
                  <tr key={order.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 pl-6 font-mono font-bold text-xs text-vdx-muted flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5" />
                      {order.public_reference}
                      {creator && <span className="text-[10px] bg-vdx-green/10 text-vdx-green px-1.5 py-0.5 rounded">You</span>}
                    </td>
                    <td className="p-4 font-semibold text-vdx-text">
                      {order.fiat_price_per_vdx.toFixed(2)} <span className="text-xs text-vdx-muted">{order.fiat_currency}</span>
                    </td>
                    <td className="p-4">
                      <div className="font-mono text-vdx-text">{remaining.toLocaleString()} VDX</div>
                      <div className="text-xs text-vdx-muted">Min limit: {min.toLocaleString()} VDX</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {order.payment_method_codes.map((m: string) => (
                          <span key={m} className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-vdx-muted">
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-right pr-6">
                      <button
                        onClick={() => alert(`Starting simulated trade coordinate for order ${order.public_reference}. Connecting escrow router...`)}
                        disabled={creator || !isEligible}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold py-2 px-4 rounded-lg transition-all ${
                          creator 
                            ? "bg-white/[0.02] border border-white/[0.05] text-vdx-muted cursor-not-allowed"
                            : (!isEligible
                              ? "bg-white/[0.02] border border-white/[0.05] text-vdx-muted cursor-not-allowed"
                              : (isSeller 
                                ? "bg-vdx-green text-[#050a05] hover:bg-vdx-bright"
                                : "bg-vdx-cyan text-[#050a05] hover:bg-cyan-300"
                              )
                            )
                        }`}
                      >
                        {isSeller ? "Buy VDX" : "Sell VDX"}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safety Notice Card */}
      <div className="vdx-card p-6">
        <h3 className="font-heading font-bold text-base mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-vdx-green" /> P2P Escrow Protection
        </h3>
        <p className="text-xs text-vdx-muted leading-relaxed">
          The Verdex P2P protocol operates on a dual-escrow model. When a sell order is accepted, VDX tokens are locked in the smart contract escrow. Once the buyer transfers local fiat currency and both parties sign, tokens are automatically released to the buyer. In case of dispute, Verdex compliance validators evaluate evidence based on the cryptographically signed ledger.
        </p>
      </div>

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="vdx-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border border-vdx-green/20 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/[0.06] pb-3">
              <h2 className="font-heading font-bold text-lg">Post P2P Trading Offer</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-vdx-muted hover:text-vdx-text text-xl"
              >
                &times;
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/20 border border-red-900/30 text-vdx-warning text-xs rounded-lg">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-vdx-muted mb-1.5 uppercase font-bold tracking-wider">Trading Side</label>
                  <select 
                    value={side} 
                    onChange={(e) => setSide(e.target.value as any)}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-lg p-2.5 text-sm text-vdx-text focus:border-vdx-green"
                  >
                    <option value="sell_vdx">I want to Sell VDX (Post Sell order)</option>
                    <option value="buy_vdx">I want to Buy VDX (Post Buy order)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-vdx-muted mb-1.5 uppercase font-bold tracking-wider">Price per VDX</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="1.05"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full bg-black/40 border border-white/[0.1] rounded-lg p-2.5 pl-8 text-sm text-vdx-text focus:border-vdx-green font-mono"
                    />
                    <DollarSign className="w-4 h-4 text-vdx-muted absolute left-2.5 top-3.5" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-vdx-muted mb-1.5 uppercase font-bold tracking-wider">Total VDX Volume</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    placeholder="1000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-lg p-2.5 text-sm text-vdx-text focus:border-vdx-green font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-vdx-muted mb-1.5 uppercase font-bold tracking-wider">Minimum Limit</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="100"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-lg p-2.5 text-sm text-vdx-text focus:border-vdx-green font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-vdx-muted mb-1.5 uppercase font-bold tracking-wider">Fiat Currency</label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    placeholder="USD"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-lg p-2.5 text-sm text-vdx-text focus:border-vdx-green uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-vdx-muted mb-1.5 uppercase font-bold tracking-wider">Payment Methods (commas)</label>
                  <input
                    type="text"
                    required
                    placeholder="Bank Transfer, Revolut"
                    value={methods}
                    onChange={(e) => setMethods(e.target.value)}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-lg p-2.5 text-sm text-vdx-text focus:border-vdx-green"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-vdx-muted mb-1.5 uppercase font-bold tracking-wider">Terms & Instructions</label>
                <textarea
                  placeholder="State your bank transfer instructions, payment timeline limits, KYC requirements, etc..."
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.1] rounded-lg p-2.5 text-sm text-vdx-text focus:border-vdx-green h-20"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-outline px-5 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !isEligible}
                  className="btn-primary px-6 py-2.5 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Posting..." : "Create Offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
