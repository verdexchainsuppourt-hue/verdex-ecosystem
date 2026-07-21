"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard, Wallet, Pickaxe, Download, Activity,
  Gift, ArrowUpDown, Users, Settings, LogOut, ExternalLink
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/wallet", icon: Wallet, label: "Wallet" },
  { href: "/dashboard/mining", icon: Pickaxe, label: "Mining" },
  { href: "/dashboard/downloads", icon: Download, label: "Downloads" },
  { href: "/dashboard/activity", icon: Activity, label: "Activity" },
  { href: "/dashboard/rewards", icon: Gift, label: "Rewards" },
  { href: "/dashboard/transactions", icon: ArrowUpDown, label: "Transactions" },
  { href: "/dashboard/referral", icon: Users, label: "Referral" },
  { href: "/dashboard/p2p", icon: ExternalLink, label: "P2P Market" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function DashboardSidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#06100D] border-r border-[rgba(87,255,179,0.1)] z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-[rgba(87,255,179,0.08)]">
        <svg viewBox="0 0 100 160" fill="none" className="w-7 h-7 flex-shrink-0 drop-shadow-[0_0_10px_rgba(36,229,150,0.4)]">
          <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
          <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
          <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
          <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
        </svg>
        <div className="flex flex-col">
          <span className="font-heading font-bold text-base text-vdx-text">Verdex</span>
          <span className="text-[10px] text-vdx-muted font-mono tracking-wider uppercase">Dashboard</span>
        </div>
      </div>

      {/* User profile */}
      <div className="px-4 py-4 border-b border-[rgba(87,255,179,0.08)]">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(36,229,150,0.05)]">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-vdx-green to-vdx-cyan flex items-center justify-center text-vdx-bg font-bold text-sm flex-shrink-0">
            {user.email?.charAt(0).toUpperCase() ?? "V"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-vdx-text truncate">
              {user.user_metadata?.username || "Miner"}
            </p>
            <p className="text-xs text-vdx-muted truncate">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative",
                isActive
                  ? "bg-[rgba(36,229,150,0.12)] text-vdx-green"
                  : "text-vdx-muted hover:text-vdx-text hover:bg-[rgba(87,255,179,0.05)]"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-[rgba(36,229,150,0.08)] rounded-xl border border-[rgba(36,229,150,0.15)]"
                />
              )}
              <item.icon className="w-4 h-4 relative z-10 flex-shrink-0" />
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-[rgba(87,255,179,0.08)] space-y-1">
        <Link
          href="/swap"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-vdx-muted hover:text-vdx-text hover:bg-white/5 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          Swap Interface
        </Link>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-vdx-error/70 hover:text-vdx-error hover:bg-[rgba(255,92,108,0.08)] transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
