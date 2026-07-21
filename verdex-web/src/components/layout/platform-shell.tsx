"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowLeft, ArrowLeftRight, Cpu, Download, Gift, LayoutDashboard,
  LogOut, Pickaxe, Settings, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VerdexLogo } from "@/components/shared/logo";
import { useAuth } from "@/components/auth/auth-provider";
import { LoadingState } from "@/components/shared/states";
import { SecurityWarning } from "@/components/shared/security-warning";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/mining", label: "Mining", icon: Pickaxe },
  { href: "/dashboard/downloads", label: "Downloads", icon: Download },
  { href: "/dashboard/activity", label: "Mining Activity", icon: Cpu },
  { href: "/dashboard/rewards", label: "Rewards", icon: Gift },
  { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const BOTTOM_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/mining", label: "Mining", icon: Pickaxe },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/rewards", label: "Rewards", icon: Gift },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-abyss">
        <LoadingState label="Loading your Verdex account…" className="border-none bg-transparent" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-abyss lg:pl-64">
      {/* sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface/80 backdrop-blur-xl lg:flex">
        <div className="flex h-[68px] items-center border-b border-line px-5">
          <Link href="/" aria-label="Back to Verdex website"><VerdexLogo /></Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Platform navigation">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-emerald/12 text-emerald-bright shadow-glow-sm border border-emerald/25"
                    : "text-muted hover:bg-white/[0.04] hover:text-ink border border-transparent"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-line p-4">
          <SecurityWarning compact />
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-black/30 px-3 py-2.5">
            <span className="truncate text-xs text-muted">{user.email}</span>
            <button
              onClick={() => signOut().then(() => router.push("/"))}
              aria-label="Sign out"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <Link href="/" className="flex items-center gap-2 px-1 text-xs text-faint transition-colors hover:text-emerald-bright">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to website
          </Link>
        </div>
      </aside>

      {/* content */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12">
        {children}
      </main>

      {/* bottom nav (mobile) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/90 backdrop-blur-2xl lg:hidden"
        aria-label="Platform bottom navigation"
      >
        {BOTTOM_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                active ? "text-emerald-bright" : "text-faint"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
