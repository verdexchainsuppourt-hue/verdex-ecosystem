import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Copy, ChevronRight } from "lucide-react";

export const metadata = { title: "Referral Program" };

export default async function ReferralPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", user.id)
    .single();

  const { count: referralCountResult } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("referred_by", user.id);

  const { data: referralTxns } = await supabase
    .from("point_transactions")
    .select("amount")
    .eq("user_id", user.id)
    .eq("type", "referral");

  const referralCode = profile?.referral_code ?? "";
  const referralCount = referralCountResult ?? 0;
  const referralVP = referralTxns?.reduce((s, r) => s + (r.amount || 0), 0) ?? 0;
  const referralLink = referralCode ? `https://verdexswap.site/?ref=${referralCode}` : "";

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          Referral <span className="gradient-text">Program</span>
        </h1>
        <p className="text-vdx-muted text-sm mt-1">Invite friends to Verdex and earn bonus VP rewards.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { label: "Total Referrals", value: referralCount, unit: "users" },
          { label: "VP Earned via Referrals", value: referralVP.toFixed(2), unit: "VP" },
        ].map((s) => (
          <div key={s.label} className="vdx-card p-6">
            <p className="text-xs text-vdx-muted uppercase tracking-wider mb-2">{s.label}</p>
            <p className="font-heading font-800 text-3xl text-vdx-green">{s.value} <span className="text-base font-normal text-vdx-muted">{s.unit}</span></p>
          </div>
        ))}
      </div>

      <div className="vdx-card p-7">
        <h2 className="font-heading font-bold text-base mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-vdx-green" /> Your Referral Link
        </h2>
        {referralLink ? (
          <>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-black/20 border border-[rgba(87,255,179,0.15)] mb-4">
              <span className="font-mono text-sm text-vdx-green flex-1 break-all">{referralLink}</span>
              <button
                className="flex-shrink-0 btn-outline text-xs px-3 py-2"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
            <p className="text-xs text-vdx-muted leading-relaxed">
              Share this link with friends. When they register and start mining, you earn bonus VP based on their activity. Referral bonuses are awarded automatically.
            </p>
          </>
        ) : (
          <div className="text-center py-8">
            <Users className="w-10 h-10 text-vdx-muted/30 mx-auto mb-3" />
            <p className="text-vdx-muted text-sm mb-4">No referral code found. Complete your profile setup to get your referral link.</p>
            <Link href="/dashboard/settings" className="btn-primary text-sm px-5 py-2.5">
              Complete Profile <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      <div className="vdx-card p-6">
        <h3 className="font-heading font-bold text-sm mb-4">How It Works</h3>
        <div className="space-y-3">
          {[
            { step: "1", text: "Share your unique referral link with friends." },
            { step: "2", text: "When they register on Verdex using your link, they become your referral." },
            { step: "3", text: "As they mine, you earn bonus VP based on their activity." },
            { step: "4", text: "Track your referral count and earned VP in this dashboard." },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-vdx-green/15 border border-vdx-green/30 flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold text-vdx-green">{item.step}</div>
              <p className="text-sm text-vdx-muted pt-0.5">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
