export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardMobileHeader } from "@/components/dashboard/mobile-header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in?redirectTo=/dashboard");

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <DashboardSidebar user={user} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen lg:pl-64">
        <DashboardMobileHeader user={user} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
