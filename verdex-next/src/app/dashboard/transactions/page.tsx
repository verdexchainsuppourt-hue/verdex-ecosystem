import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: txns } = await supabase
    .from("point_transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          <span className="gradient-text">Transactions</span>
        </h1>
        <p className="text-vdx-muted text-sm mt-1">Your complete VP transaction ledger.</p>
      </div>

      <div className="vdx-card p-6">
        {!txns || txns.length === 0 ? (
          <div className="text-center py-16">
            <ArrowUpRight className="w-12 h-12 text-vdx-muted/30 mx-auto mb-3" />
            <p className="text-vdx-muted text-sm">No transactions yet. Start mining to generate your first entries.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {txns.map((tx, i) => {
              const isPos = (tx.amount ?? 0) >= 0;
              return (
                <div key={tx.id ?? i} className="flex items-center justify-between p-3.5 rounded-xl border border-[rgba(87,255,179,0.07)] hover:border-[rgba(87,255,179,0.15)] transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isPos ? "bg-vdx-green/10" : "bg-vdx-error/10"}`}>
                      {isPos ? <ArrowDownLeft className="w-4 h-4 text-vdx-green" /> : <ArrowUpRight className="w-4 h-4 text-vdx-error" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-vdx-text capitalize">{tx.type ?? "transfer"}</p>
                      <span className="text-xs text-vdx-muted flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />{timeAgo(tx.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`font-mono text-sm font-bold ${isPos ? "text-vdx-green" : "text-vdx-error"}`}>
                      {isPos ? "+" : ""}{(tx.amount ?? 0).toFixed(6)} VP
                    </span>
                    {tx.id && (
                      <p className="text-[10px] text-vdx-muted font-mono mt-0.5 truncate max-w-[120px]">{tx.id.slice(0, 12)}…</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
