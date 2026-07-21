"use client";

import Link from "next/link";
import {
  AlertTriangle, Inbox, Loader2, LogIn, Wallet, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function StateShell({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: "neutral" | "danger" | "amber";
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-white/[0.02] text-muted",
    danger: "border-danger/30 bg-danger/[0.06] text-danger",
    amber: "border-amber/30 bg-amber/[0.06] text-amber",
  };
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center", tones[tone], className)}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-black/30">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-heading text-base font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", description, action, className }: { title?: string; description?: string; action?: React.ReactNode; className?: string }) {
  return <StateShell icon={Inbox} title={title} description={description} action={action} className={className} />;
}

export function ErrorState({ title = "Something went wrong", description = "The request failed. Check your connection and try again.", onRetry, className }: { title?: string; description?: string; onRetry?: () => void; className?: string }) {
  return (
    <StateShell
      icon={AlertTriangle}
      title={title}
      description={description}
      tone="danger"
      className={className}
      action={onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

export function OfflineState({ className }: { className?: string }) {
  return (
    <StateShell
      icon={WifiOff}
      title="You appear to be offline"
      description="Live data is unavailable without a connection. Cached values may be stale."
      tone="amber"
      className={className}
    />
  );
}

export function AuthRequiredState({ description = "Sign in to your Verdex account to view this section.", className }: { description?: string; className?: string }) {
  return (
    <StateShell
      icon={LogIn}
      title="Sign in required"
      description={description}
      className={className}
      action={
        <div className="flex gap-3">
          <Link href="/sign-in"><Button size="sm">Sign in</Button></Link>
          <Link href="/register"><Button size="sm" variant="outline">Create account</Button></Link>
        </div>
      }
    />
  );
}

export function WalletRequiredState({ onConnect, className }: { onConnect?: () => void; className?: string }) {
  return (
    <StateShell
      icon={Wallet}
      title="Wallet not connected"
      description="Connect an EIP-1193 wallet (e.g. MetaMask) to continue. Verdex never takes custody of your keys."
      className={className}
      action={onConnect ? <Button size="sm" onClick={onConnect}>Connect Wallet</Button> : undefined}
    />
  );
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3 rounded-2xl border border-line bg-white/[0.02] px-6 py-12 text-muted", className)}>
      <Loader2 className="h-5 w-5 animate-spin text-emerald" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Grid of skeleton cards for loading dashboards. */
export function SkeletonGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}
