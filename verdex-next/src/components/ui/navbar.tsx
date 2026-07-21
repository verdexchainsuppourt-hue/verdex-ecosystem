"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown, Zap, Droplets, TrendingUp, Pickaxe, Coins, Globe, BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  {
    label: "Trade",
    href: "/swap",
    icon: Zap,
    children: [
      { label: "Swap", href: "/swap", desc: "Exchange tokens with AMM routing" },
      { label: "Liquidity", href: "/liquidity", desc: "Provide liquidity to pools" },
    ],
  },
  {
    label: "Earn",
    href: "/earn",
    icon: TrendingUp,
    children: [
      { label: "Earn Overview", href: "/earn", desc: "LP fees and mining rewards" },
      { label: "Liquidity Pools", href: "/liquidity", desc: "Supply assets and earn fees" },
    ],
  },
  {
    label: "Mining",
    href: "/mining",
    icon: Pickaxe,
    children: [
      { label: "Mining Overview", href: "/mining", desc: "Learn how VDX mining works" },
      { label: "Mining Dashboard", href: "/dashboard/mining", desc: "Your mining stats" },
      { label: "Downloads", href: "/dashboard/downloads", desc: "Download the Verdex miner" },
    ],
  },
  { label: "VDX", href: "/vdx", icon: Coins },
  {
    label: "Ecosystem",
    href: "/ecosystem",
    icon: Globe,
    children: [
      { label: "Ecosystem", href: "/ecosystem", desc: "How Verdex products connect" },
      { label: "Roadmap", href: "/roadmap", desc: "Development milestones" },
      { label: "Security", href: "/security", desc: "Self-custody and security" },
    ],
  },
  {
    label: "Docs",
    href: "/whitepaper",
    icon: BookOpen,
    children: [
      { label: "Whitepaper", href: "/whitepaper", desc: "Full technical whitepaper" },
      { label: "Documentation", href: "/docs", desc: "Developer documentation" },
      { label: "FAQ", href: "/faq", desc: "Common questions answered" },
    ],
  },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setActiveDropdown(null);
  }, [pathname]);

  const isDashboard = pathname.startsWith("/dashboard");

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled || mobileOpen
            ? "bg-[rgba(6,12,9,0.92)] backdrop-blur-2xl border-b border-[rgba(87,255,179,0.1)] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            : "bg-transparent"
        )}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-18">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
              <div className="relative w-8 h-8 transition-transform duration-300 group-hover:scale-110">
                <svg viewBox="0 0 100 160" fill="none" className="w-full h-full drop-shadow-[0_0_12px_rgba(36,229,150,0.5)]">
                  <path d="M50 0L95 80L50 55L5 80L50 0Z" fill="#57FFB3" />
                  <path d="M50 0L95 80L50 55L50 0Z" fill="#24E596" />
                  <path d="M50 105L95 80L50 160L5 80L50 105Z" fill="#57FFB3" />
                  <path d="M50 105L95 80L50 160L50 105Z" fill="#24E596" />
                </svg>
              </div>
              <span className="font-heading font-700 text-lg text-vdx-text tracking-tight">
                Verdex
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1" onMouseLeave={() => setActiveDropdown(null)}>
              {NAV_LINKS.map((link) => (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => link.children && setActiveDropdown(link.label)}
                >
                  <Link
                    href={link.href}
                    className={cn(
                      "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                      pathname === link.href || pathname.startsWith(link.href + "/")
                        ? "text-vdx-green"
                        : "text-vdx-muted hover:text-vdx-text"
                    )}
                  >
                    {link.label}
                    {link.children && (
                      <ChevronDown
                        className={cn("w-3.5 h-3.5 transition-transform duration-200", activeDropdown === link.label && "rotate-180")}
                      />
                    )}
                  </Link>

                  {/* Dropdown */}
                  <AnimatePresence>
                    {link.children && activeDropdown === link.label && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute top-full left-0 mt-2 w-56 glass rounded-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
                      >
                        {link.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="flex flex-col px-4 py-3 hover:bg-[rgba(87,255,179,0.06)] transition-colors duration-150 group"
                          >
                            <span className="text-sm font-medium text-vdx-text group-hover:text-vdx-green transition-colors">
                              {child.label}
                            </span>
                            <span className="text-xs text-vdx-muted mt-0.5">{child.desc}</span>
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-3">
              {/* Explorer link */}
              <a
                href="https://verdexswap.site/explorer"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex items-center gap-1.5 text-xs text-vdx-muted hover:text-vdx-green transition-colors duration-200 font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Explorer
              </a>

              {isDashboard ? (
                <Link
                  href="/dashboard"
                  className="hidden sm:inline-flex btn-outline text-sm px-4 py-2"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="hidden sm:inline-flex btn-outline text-sm px-4 py-2"
                >
                  Launch App
                </Link>
              )}

              <Link
                href="/mining"
                className="btn-primary text-sm px-4 py-2.5 hidden sm:inline-flex"
              >
                <Pickaxe className="w-3.5 h-3.5" />
                Mine VDX
              </Link>

              {/* Mobile toggle */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden w-9 h-9 rounded-lg glass flex items-center justify-center text-vdx-muted hover:text-vdx-text transition-colors"
                aria-label="Toggle navigation"
              >
                {mobileOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="lg:hidden overflow-hidden border-t border-[rgba(87,255,179,0.1)]"
            >
              <div className="px-4 py-4 space-y-1">
                {NAV_LINKS.map((link) => (
                  <div key={link.label}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all",
                        pathname === link.href
                          ? "bg-[rgba(36,229,150,0.1)] text-vdx-green"
                          : "text-vdx-muted hover:text-vdx-text hover:bg-[rgba(87,255,179,0.05)]"
                      )}
                    >
                      <link.icon className="w-4 h-4 flex-shrink-0" />
                      {link.label}
                    </Link>
                    {link.children && (
                      <div className="ml-8 mt-1 space-y-0.5">
                        {link.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="block px-3 py-2 text-xs text-vdx-muted hover:text-vdx-green rounded-lg transition-colors"
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="pt-3 flex flex-col gap-2">
                  <Link href="/dashboard" className="btn-outline text-sm py-3 w-full justify-center">
                    Launch App
                  </Link>
                  <Link href="/mining" className="btn-primary text-sm py-3 w-full justify-center">
                    <Pickaxe className="w-4 h-4" /> Mine VDX
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Spacer for fixed navbar */}
      <div className="h-16 lg:h-18" />
    </>
  );
}
