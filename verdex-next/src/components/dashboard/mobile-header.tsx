"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Menu, X, LogOut, LayoutDashboard, Wallet, Pickaxe, Download, Activity, Gift, ArrowUpDown, Users, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function DashboardMobileHeader({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-[rgba(6,12,9,0.95)] backdrop-blur-xl border-b border-[rgba(87,255,179,0.1)]">
        <Link href="/dashboard" className="flex items-center gap-2">
          <svg viewBox="0 0 100 160" fill="none" className="w-6 h-6">
            <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
            <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
            <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
            <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
          </svg>
          <span className="font-heading font-bold text-sm">Dashboard</span>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="w-8 h-8 rounded-lg glass flex items-center justify-center text-vdx-muted"
        >
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="lg:hidden fixed inset-0 z-20 bg-[#06100D] pt-14 overflow-y-auto"
          >
            <nav className="px-4 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                      isActive ? "bg-vdx-green/12 text-vdx-green border border-vdx-green/15" : "text-vdx-muted hover:text-vdx-text"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
              <button onClick={signOut} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-vdx-error/70 hover:text-vdx-error">
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
