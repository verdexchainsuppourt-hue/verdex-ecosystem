import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { P2PClient } from "@/components/dashboard/p2p-client";

export const metadata = { title: "P2P Marketplace" };

export default async function P2PPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // Fetch real P2P orders
  const { data: orders } = await supabase
    .from("verdex_p2p_orders")
    .select("*")
    .order("created_at", { ascending: false });

  // Fetch P2P entitlements for this user
  let { data: entitlement } = await supabase
    .from("verdex_p2p_entitlements")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = user.email && [
    "verdexchainsuppourt@gmail.com",
    "zastrading05@gmail.com",
    "chzafariqbalsandhu@gmail.com"
  ].includes(user.email.toLowerCase());

  // Seeding entitlement for test/sandbox eligibility
  if (isAdmin || !entitlement) {
    entitlement = {
      user_id: user.id,
      state: "eligible", 
    };
  }

  // Server action to create P2P orders in Supabase
  async function createOrder(formData: any) {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // Standard EVM ERC-20 has 18 decimal places
    const atomicAmount = formData.amount * 1e18;
    const atomicMin = formData.minAmount * 1e18;

    const { error } = await supabase
      .from("verdex_p2p_orders")
      .insert({
        creator_user_id: user.id,
        side: formData.side,
        status: "open",
        asset_symbol: "VDX",
        token_amount_atomic: atomicAmount,
        remaining_amount_atomic: atomicAmount,
        minimum_trade_amount_atomic: atomicMin,
        fiat_currency: formData.currency,
        fiat_price_per_vdx: formData.price,
        payment_method_codes: formData.methods,
        terms_summary: formData.terms || "",
        escrow_required: true,
      });

    if (error) {
      console.error("P2P Order post error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  return (
    <P2PClient
      initialOrders={orders || []}
      userEntitlement={entitlement}
      userId={user.id}
      createOrderAction={createOrder}
    />
  );
}
