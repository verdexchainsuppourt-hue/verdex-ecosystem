import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Pickaxe, Clock } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Activity" };

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: payouts } = await supabase
    .from("point_transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("type", "mining")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          Mining <span className="gradient-text">Activity</span>
        </h1>
        <p className="text-vdx-muted text-sm mt-1">Full history of your mining sessions and VP earnings.</p>
      </div>

      <div className="vdx-card p-6">
        {!payouts || payouts.length === 0 ? (
          <div className="text-center py-16">
            <Pickaxe className="w-12 h-12 text-vdx-muted/30 mx-auto mb-3" />
            <p className="text-vdx-muted text-sm">No mining activity yet. Download the miner and start earning VP.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payouts.map((tx, i) => (
              <div key={tx.id ?? i} className="flex items-center justify-between p-3.5 rounded-xl border border-[rgba(87,255,179,0.07)] hover:border-[rgba(87,255,179,0.15)] transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-vdx-green/10 flex items-center justify-center flex-shrink-0">
                    <Pickaxe className="w-4 h-4 text-vdx-green" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-vdx-text">{tx.description || "Block Mined"}</p>
                    <div className="flex items-center gap-1.5 text-xs text-vdx-muted mt-0.5">
                      <Clock className="w-3 h-3" />
                      {timeAgo(tx.created_at)}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-sm font-bold text-vdx-green">
                  +{(tx.amount || 0).toFixed(6)} VP
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
