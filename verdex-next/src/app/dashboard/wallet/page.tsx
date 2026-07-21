import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WalletClient } from "@/components/dashboard/wallet-client";

export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: wallet } = await supabase
    .from("wallets")
    .select("vp_balance_cached, vdx_address")
    .eq("user_id", user.id)
    .single();

  const { data: txns } = await supabase
    .from("point_transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const vpBalance = wallet?.vp_balance_cached ?? 0;
  const walletAddress = wallet?.vdx_address ?? null;

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          My <span className="gradient-text">Wallet</span>
        </h1>
        <p className="text-vdx-muted text-sm mt-1">Your Verdex Points balance and transaction history.</p>
      </div>

      <WalletClient 
        initialVpBalance={vpBalance} 
        initialAddress={walletAddress} 
        transactions={txns || []} 
      />
    </div>
  );
}
