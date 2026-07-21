"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VerdexLogo, VerdexMark } from "@/components/shared/logo";
import { ConnectButton } from "@/components/wallet/connect-button";
import { useAuth } from "@/components/auth/auth-provider";

const TRADE_LINKS = [
  { href: "/swap", label: "Swap", note: "AMM aggregator" },
  { href: "/liquidity", label: "Liquidity Pools", note: "Discover pools" },
  { href: "/liquidity/add", label: "Add Liquidity", note: "Become an LP" },
];

const DOC_LINKS = [
  { href: "/whitepaper", label: "Whitepaper", note: "v1.1 · July 2026" },
  { href: "/docs", label: "Documentation", note: "Guides & API" },
  { href: "/security", label: "Security", note: "Self-custody model" },
  { href: "/roadmap", label: "Roadmap", note: "Phases & status" },
];

const SIMPLE_LINKS = [
  { href: "/earn", label: "Earn" },
  { href: "/mining", label: "Mining" },
  { href: "/vdx", label: "VDX" },
  { href: "/ecosystem", label: "Ecosystem" },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "text-emerald-bright" : "text-muted hover:text-ink"
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
      <span
        className={cn(
          "absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald to-transparent transition-opacity",
          active ? "opacity-100" : "opacity-0"
        )}
      />
    </Link>
  );
}

function NavDropdown({ label, links, active }: { label: string; links: typeof TRADE_LINKS; active: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/60",
            active ? "text-emerald-bright" : "text-muted hover:text-ink"
          )}
          aria-haspopup="menu"
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {links.map((l) => (
          <DropdownMenuItem key={l.href} asChild>
            <Link href={l.href} className="flex flex-col items-start gap-0.5">
              <span className="font-semibold text-ink">{l.label}</span>
              <span className="text-xs text-faint">{l.note}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const tradeActive = ["/swap", "/liquidity"].some((p) => pathname.startsWith(p));
  const docsActive = ["/whitepaper", "/docs", "/security", "/roadmap"].some((p) => pathname.startsWith(p));

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all duration-500",
          scrolled
            ? "border-b border-line bg-abyss/80 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <nav className="container flex h-[68px] items-center justify-between gap-3" aria-label="Main navigation">
          <Link href="/" aria-label="Verdex home" className="shrink-0">
            <VerdexLogo />
          </Link>

          {/* desktop links */}
          <div className="hidden items-center gap-0.5 lg:flex">
            <NavDropdown label="Trade" links={TRADE_LINKS} active={tradeActive} />
            {SIMPLE_LINKS.map((l) => (
              <NavLink key={l.href} href={l.href} label={l.label} active={pathname === l.href} />
            ))}
            <NavDropdown label="Docs" links={DOC_LINKS} active={docsActive} />
          </div>

          <div className="hidden items-center gap-2.5 lg:flex">
            <ConnectButton size="sm" />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="glass" size="sm" aria-label="Account menu">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald/20 text-[10px] font-bold text-emerald-bright">
                      {(user.email?.[0] ?? "U").toUpperCase()}
                    </span>
                    Dashboard
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate normal-case tracking-normal">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard"><LayoutDashboard className="h-4 w-4" /> Open Dashboard</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/wallet">Wallet</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/mining">Mining</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()} className="text-danger focus:text-danger">
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/dashboard">
                <Button size="sm">Launch App</Button>
              </Link>
            )}
          </div>

          {/* mobile toggle */}
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink lg:hidden"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </header>

      {/* mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden transition-opacity duration-300",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <div className="absolute inset-0 bg-abyss/80 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
        <aside
          className={cn(
            "absolute right-0 top-0 flex h-full w-[86vw] max-w-sm flex-col gap-1 overflow-y-auto border-l border-line bg-surface p-5 transition-transform duration-300",
            drawerOpen ? "translate-x-0" : "translate-x-full"
          )}
          aria-label="Mobile navigation"
        >
          <div className="mb-4 flex items-center justify-between">
            <VerdexLogo />
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-line"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {[...TRADE_LINKS, ...SIMPLE_LINKS.map((l) => ({ ...l, note: "" })), ...DOC_LINKS].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center justify-between rounded-xl px-4 py-3 text-[15px] font-medium transition-colors",
                pathname === l.href ? "bg-emerald/10 text-emerald-bright" : "text-mist hover:bg-white/5"
              )}
            >
              {l.label}
              {"note" in l && l.note && <span className="text-[11px] text-faint">{l.note}</span>}
            </Link>
          ))}

          <div className="mt-5 flex flex-col gap-2.5 border-t border-line pt-5">
            <ConnectButton />
            <Link href={user ? "/dashboard" : "/sign-in"}>
              <Button className="w-full">{user ? "Open Dashboard" : "Launch App"}</Button>
            </Link>
            {user && (
              <Button variant="outline" className="w-full" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            )}
          </div>

          <div className="mt-auto flex items-center gap-2 pt-6 text-xs text-faint">
            <VerdexMark className="h-5 w-3.5" /> Verdex · Swap Smart. Grow Green.
          </div>
        </aside>
      </div>
    </>
  );
}
