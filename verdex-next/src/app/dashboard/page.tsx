import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Pickaxe, Wallet, ArrowUpDown, Users, Download, ChevronRight, TrendingUp, Gift, Copy } from "lucide-react";
import { formatVP } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // Fetch VP mining transactions from Supabase
  const { data: miningStats } = await supabase
    .from("point_transactions")
    .select("amount, created_at")
    .eq("user_id", user.id)
    .eq("type", "mining")
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: profileData } = await supabase
    .from("profiles")
    .select("username, referral_code")
    .eq("id", user.id)
    .single();

  const { data: walletData } = await supabase
    .from("wallets")
    .select("vp_balance_cached, current_streak")
    .eq("user_id", user.id)
    .single();

  const vpBalance = walletData?.vp_balance_cached ?? 0;
  const username = profileData?.username ?? user.user_metadata?.username ?? user.email?.split("@")[0] ?? "Miner";
  const referralCode = profileData?.referral_code ?? "";
  const streakDays = walletData?.current_streak ?? 0;

  const totalEarned = miningStats?.reduce((s, r) => s + (r.amount || 0), 0) ?? 0;

  const statCards = [
    {
      label: "VP Balance",
      value: formatVP(vpBalance),
      unit: "VP",
      icon: Wallet,
      href: "/dashboard/wallet",
      desc: "Your current Verdex Points",
      color: "text-vdx-green",
    },
    {
      label: "Mining Sessions",
      value: miningStats?.length ?? 0,
      unit: "sessions",
      icon: Pickaxe,
      href: "/dashboard/mining",
      desc: "Recent mining activity",
      color: "text-vdx-cyan",
    },
    {
      label: "Total VP Earned",
      value: formatVP(totalEarned),
      unit: "VP",
      icon: TrendingUp,
      href: "/dashboard/activity",
      desc: "Cumulative mining earnings",
      color: "text-vdx-bright",
    },
    {
      label: "Mining Streak",
      value: streakDays,
      unit: "days",
      icon: Gift,
      href: "/dashboard/rewards",
      desc: "Consecutive days active",
      color: "text-vdx-warning",
    },
  ];

  return (
    <div className="space-y-8 py-2">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          Welcome back,{" "}
          <span className="gradient-text">{username}</span> 👋
        </h1>
        <p className="text-vdx-muted text-sm mt-1">
          Your Verdex mining dashboard — track your VP balance, activity, and rewards.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <Link
            key={card.label}
            href={card.href}
            className="vdx-card p-5 group hover:-translate-y-1 transition-transform"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-[rgba(36,229,150,0.08)] border border-[rgba(87,255,179,0.12)] flex items-center justify-center">
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-vdx-muted group-hover:text-vdx-green group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="font-heading font-800 text-2xl text-vdx-text leading-none mb-1">
              {card.value}
              <span className="text-sm font-normal text-vdx-muted ml-1.5">{card.unit}</span>
            </div>
            <div className="text-xs text-vdx-muted">{card.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 vdx-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading font-bold text-base">Recent Mining Sessions</h2>
            <Link href="/dashboard/activity" className="text-xs text-vdx-green hover:text-vdx-bright">
              View all →
            </Link>
          </div>
          {!miningStats || miningStats.length === 0 ? (
            <div className="text-center py-12">
              <Pickaxe className="w-10 h-10 text-vdx-muted/40 mx-auto mb-3" />
              <p className="text-vdx-muted text-sm mb-4">No mining sessions yet.</p>
              <Link href="/dashboard/downloads" className="btn-primary text-sm px-5 py-2.5">
                Download Miner
              </Link>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {miningStats.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-[rgba(87,255,179,0.06)] last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-vdx-green/10 flex items-center justify-center">
                      <Pickaxe className="w-3.5 h-3.5 text-vdx-green" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-vdx-text">Mining Session</p>
                      <p className="text-xs text-vdx-muted">
                        {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-bold text-vdx-green">
                    +{(s.amount || 0).toFixed(4)} VP
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          {/* Referral card */}
          {referralCode && (
            <div className="vdx-card p-5">
              <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-vdx-green" />
                Your Referral Link
              </h3>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-black/20 border border-[rgba(87,255,179,0.1)]">
                <span className="font-mono text-xs text-vdx-green flex-1 truncate">
                  verdexswap.site/?ref={referralCode}
                </span>
                <button
                  className="text-vdx-muted hover:text-vdx-green transition-colors"
                  onClick={undefined}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <Link href="/dashboard/referral" className="text-xs text-vdx-green mt-2 block hover:text-vdx-bright">
                View referral stats →
              </Link>
            </div>
          )}

          {/* Quick links */}
          <div className="vdx-card p-5">
            <h3 className="font-heading font-bold text-sm mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { href: "/dashboard/downloads", icon: Download, label: "Download Miner" },
                { href: "/dashboard/wallet", icon: Wallet, label: "View Wallet" },
                { href: "/dashboard/transactions", icon: ArrowUpDown, label: "Transactions" },
                { href: "/swap", icon: ArrowUpDown, label: "Swap Tokens" },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-vdx-muted hover:text-vdx-text hover:bg-[rgba(87,255,179,0.05)] transition-all"
                >
                  <l.icon className="w-4 h-4 text-vdx-green" />
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
