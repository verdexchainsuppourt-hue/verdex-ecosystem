import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Pickaxe, Activity, Cpu, Clock, Download, TrendingUp, Wifi, WifiOff } from "lucide-react";
import { formatVP, timeAgo } from "@/lib/utils";
import { MiningTabs } from "@/components/dashboard/mining-tabs";

export const metadata = { title: "Mining Dashboard" };

export default async function MiningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: sessions } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: wallet } = await supabase
    .from("wallets")
    .select("vp_balance_cached, current_streak")
    .eq("user_id", user.id)
    .single();

  // Find active session to determine if online and get device metadata
  const activeSession = sessions?.find((s) => s.status === "active");
  const lastSeen = activeSession?.last_heartbeat_at;
  const isOnline = lastSeen
    ? Date.now() - new Date(lastSeen).getTime() < 10 * 60 * 1000
    : false;

  // Get hashrate from latest mining point transaction metadata
  const { data: latestMiningTx } = await supabase
    .from("point_transactions")
    .select("metadata")
    .eq("user_id", user.id)
    .eq("type", "mining")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Sum of mining rewards from point_transactions
  const { data: miningRewards } = await supabase
    .from("point_transactions")
    .select("amount")
    .eq("user_id", user.id)
    .eq("type", "mining");

  const { data: miningTransactions } = await supabase
    .from("point_transactions")
    .select("amount, created_at, description")
    .eq("user_id", user.id)
    .eq("type", "mining")
    .order("created_at", { ascending: false })
    .limit(20);

  const totalVP = wallet?.vp_balance_cached ?? 0;
  const hashrate = latestMiningTx?.metadata?.hashrate ?? (isOnline ? 120.5 : 0);
  const streak = wallet?.current_streak ?? 0;
  const totalEarned = miningRewards?.reduce((s, r) => s + (r.amount || 0), 0) ?? 0;

  return (
    <div className="space-y-8 py-2">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
            Mining <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="text-vdx-muted text-sm mt-1">Track your Verdex DePIN mining performance and earnings.</p>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="badge-live"><span className="pulse-dot w-1.5 h-1.5" />Miner Online</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[rgba(146,170,160,0.1)] border border-[rgba(146,170,160,0.2)] text-vdx-muted">
              <WifiOff className="w-3 h-3" />Miner Offline
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "VP Balance", value: formatVP(totalVP), unit: "VP", icon: Pickaxe, color: "text-vdx-green" },
          { label: "Hashrate", value: hashrate > 0 ? `${hashrate.toFixed(2)}` : "—", unit: "H/s", icon: Cpu, color: "text-vdx-cyan" },
          { label: "Total Earned", value: formatVP(totalEarned), unit: "VP", icon: TrendingUp, color: "text-vdx-bright" },
          { label: "Streak", value: streak, unit: "days", icon: Activity, color: "text-vdx-warning" },
        ].map((s) => (
          <div key={s.label} className="vdx-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-vdx-muted uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="font-heading font-800 text-2xl text-vdx-text">
              {s.value}
              <span className="text-sm font-normal text-vdx-muted ml-1.5">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Mining not started */}
      {(!sessions || sessions.length === 0) && (
        <div className="vdx-card p-10 text-center">
          <Pickaxe className="w-14 h-14 text-vdx-muted/30 mx-auto mb-4" />
          <h2 className="font-heading font-bold text-xl mb-2">No Mining Activity Yet</h2>
          <p className="text-vdx-muted text-sm max-w-md mx-auto mb-6">
            Download the Verdex Miner app, generate a miner token from Settings, and connect your device to start earning VP rewards.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard/downloads" className="btn-primary px-6 py-3">
              <Download className="w-4 h-4" /> Download Miner
            </Link>
            <Link href="/dashboard/settings" className="btn-outline px-6 py-3">
              Generate Token
            </Link>
          </div>
        </div>
      )}

      {/* Interactive Mining Info Tabs */}
      {sessions && sessions.length > 0 && (
        <MiningTabs 
          sessions={sessions} 
          miningTransactions={miningTransactions || []} 
          hashrate={hashrate} 
        />
      )}

      {/* Mining tips */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { icon: Wifi, title: "Keep Miner Running", desc: "The longer your miner runs, the more VP you earn. Maintain a stable connection." },
          { icon: Activity, title: "Maintain Your Streak", desc: "Daily mining activity builds your streak multiplier for bonus rewards." },
          { icon: TrendingUp, title: "Hashrate Matters", desc: "Higher hashrate devices earn more VP per session. GPU mining earns more than CPU." },
        ].map((t) => (
          <div key={t.title} className="vdx-card p-5">
            <t.icon className="w-5 h-5 text-vdx-green mb-3" />
            <h3 className="font-semibold text-sm mb-1.5">{t.title}</h3>
            <p className="text-xs text-vdx-muted leading-relaxed">{t.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
