import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Gift, Clock } from "lucide-react";
import { formatVP, timeAgo } from "@/lib/utils";

export const metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: wallet } = await supabase
    .from("wallets")
    .select("vp_balance_cached, current_streak")
    .eq("user_id", user.id)
    .single();

  const { data: referralTxns } = await supabase
    .from("point_transactions")
    .select("amount")
    .eq("user_id", user.id)
    .eq("type", "referral");

  const vpBalance = wallet?.vp_balance_cached ?? 0;
  const streak = wallet?.current_streak ?? 0;
  const referralVP = referralTxns?.reduce((s, r) => s + (r.amount || 0), 0) ?? 0;

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          My <span className="gradient-text">Rewards</span>
        </h1>
        <p className="text-vdx-muted text-sm mt-1">Your earned Verdex Points and reward breakdown.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "Total VP Balance", value: formatVP(vpBalance), unit: "VP", icon: Gift, desc: "Pre-TGE mining balance" },
          { label: "Streak Bonus", value: streak, unit: "day streak", icon: Clock, desc: "Active mining streak" },
          { label: "Referral VP", value: formatVP(referralVP), unit: "VP", icon: Gift, desc: "Earned from referrals" },
        ].map((s) => (
          <div key={s.label} className="vdx-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <s.icon className="w-4 h-4 text-vdx-green" />
              <span className="text-xs text-vdx-muted uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="font-heading font-800 text-3xl text-vdx-green mb-1">
              {s.value}
              <span className="text-sm font-normal text-vdx-muted ml-1.5">{s.unit}</span>
            </div>
            <p className="text-xs text-vdx-muted">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="vdx-card p-7">
        <h2 className="font-heading font-bold text-base mb-4">About VP Rewards</h2>
        <div className="space-y-3 text-sm text-vdx-muted leading-relaxed">
          <p>Verdex Points (VP) are earned by running the Verdex Miner application and contributing compute resources to the DePIN network.</p>
          <p>VP represents your pre-TGE (Token Generation Event) balance. When the VDX token contract is deployed and audited, your VP will be convertible to VDX at the defined ratio.</p>
          <p className="text-vdx-warning/80 text-xs bg-[rgba(245,185,66,0.06)] border border-[rgba(245,185,66,0.15)] p-3 rounded-xl">
            VP is not transferable and has no monetary value until the VDX token launch. Conversion ratios and terms are subject to governance approval.
          </p>
        </div>
      </div>
    </div>
  );
}
