"use client";

import { useState } from "react";
import { CheckCircle2, Download, KeyRound, MonitorSmartphone, Plus, Smartphone, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecurityWarning } from "@/components/shared/security-warning";
import { CopyButton } from "@/components/shared/copy-button";
import { DemoBadge } from "@/components/shared/demo-badge";
import { createMinerToken } from "@/lib/api";
import { DOWNLOADS } from "@/lib/constants";

const OS_ICONS = { Windows: MonitorSmartphone, Android: Smartphone, "Linux CLI": Terminal } as const;

interface DeviceToken {
  id: string;
  name: string;
  device: string;
  prefix: string;
  created: string;
  active: boolean;
}

const INITIAL_TOKENS: DeviceToken[] = [
  { id: "dt1", name: "Windows rig", device: "Windows · GUI", prefix: "vdx_live_9f2a", created: "Jun 30, 2026", active: true },
  { id: "dt2", name: "Pixel phone", device: "Android · APK", prefix: "vdx_live_41bc", created: "Jul 04, 2026", active: true },
];

export default function DownloadsPage() {
  const [tokens, setTokens] = useState<DeviceToken[]>(INITIAL_TOKENS);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [device, setDevice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await createMinerToken(name.trim(), device.trim() || undefined);
      if (res?.token) {
        setNewToken(res.token);
        setTokens((t) => [{ id: `dt${Date.now()}`, name: name.trim(), device: device.trim() || "Unspecified", prefix: res.token!.slice(0, 12), created: "Just now", active: true }, ...t]);
        setDialogOpen(false);
        setName("");
        setDevice("");
      } else {
        throw new Error(res?.error ?? "No token returned");
      }
    } catch (e) {
      toast.error("Token service unavailable", {
        description: "The token-creation endpoint is unreachable in this environment. Try again shortly.",
      });
    } finally {
      setCreating(false);
    }
  }

  function revoke(id: string) {
    setTokens((t) => t.map((tok) => (tok.id === id ? { ...tok, active: false } : tok)));
    toast.success("Device token revoked", { description: "The miner using it will stop authenticating." });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Miner Downloads</h1>
        <p className="mt-1 text-sm text-muted">Official Verdex miner releases and device authentication.</p>
      </div>

      <SecurityWarning />

      {/* releases */}
      <div className="grid gap-5 md:grid-cols-3">
        {DOWNLOADS.map((d) => {
          const Icon = OS_ICONS[d.os as keyof typeof OS_ICONS] ?? Download;
          const external = d.file.startsWith("http");
          return (
            <Card key={d.os} glow className="edge-glow flex flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald/25 bg-emerald/10 text-emerald-bright">
                  <Icon className="h-5 w-5" />
                </span>
                <Badge>{d.version}</Badge>
              </div>
              <h2 className="mt-4 font-heading text-lg font-bold text-ink">{d.os}</h2>
              <dl className="mt-3 space-y-1.5 text-xs text-muted">
                <div className="flex justify-between"><dt>Released</dt><dd className="mono text-mist">{d.date}</dd></div>
                <div className="flex justify-between"><dt>Size</dt><dd className="mono text-mist">{d.size}</dd></div>
              </dl>
              <ul className="mt-4 space-y-1.5">
                {d.notes.map((n) => (
                  <li key={n} className="flex items-start gap-2 text-xs text-muted">
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald" /> {n}
                  </li>
                ))}
              </ul>
              <a href={d.file} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="mt-5 block">
                <Button className="w-full" variant={external ? "primary" : "outline"}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </a>
            </Card>
          );
        })}
      </div>

      {/* setup steps */}
      <Card className="p-6">
        <h2 className="font-heading text-lg font-bold text-ink">Connect the miner to your account</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["1", "Create a device token", "Generate a per-device API token below. It is shown once — store it safely."],
            ["2", "Authenticate the miner", "Enter the token in the GUI miner, or run: verdex-miner auth --token <token>"],
            ["3", "Start mining", "Valid heartbeats earn VP automatically. Track everything on the Mining page."],
          ].map(([n, t, d]) => (
            <li key={n} className="rounded-xl border border-line bg-black/25 p-4">
              <span className="grid h-7 w-7 place-items-center rounded-full border border-emerald/30 bg-emerald/10 font-mono text-xs font-bold text-emerald-bright">{n}</span>
              <p className="mt-2.5 text-sm font-semibold text-ink">{t}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Card>

      {/* device tokens */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-ink">Device tokens</h2>
            <p className="text-xs text-faint">Tokens authenticate CLI/GUI miners to your account. Shown as prefixes only.</p>
          </div>
          <div className="flex items-center gap-2">
            <DemoBadge />
            <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New token</Button>
          </div>
        </div>
        <ul className="mt-5 space-y-3">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-black/25 p-4">
              <div className="flex items-center gap-3">
                <KeyRound className="h-4 w-4 text-emerald-bright" />
                <div>
                  <p className="text-sm font-semibold text-ink">{t.name} <span className="ml-1 text-xs font-normal text-faint">{t.device}</span></p>
                  <p className="mono text-[11px] text-faint">{t.prefix}•••••••• · created {t.created}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={t.active ? "default" : "danger"}>{t.active ? "Active" : "Revoked"}</Badge>
                {t.active && (
                  <button
                    onClick={() => revoke(t.id)}
                    aria-label={`Revoke token ${t.name}`}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-danger/40 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* create token dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New device token</DialogTitle>
            <DialogDescription>The full token is displayed exactly once after creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="token-name" className="mb-1.5 block">Token name</Label>
              <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Linux server" />
            </div>
            <div>
              <Label htmlFor="token-device" className="mb-1.5 block">Device (optional)</Label>
              <Input id="token-device" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="e.g. Ubuntu 24.04" />
            </div>
            <Button className="w-full" onClick={create} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create token"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* one-time token display */}
      <Dialog open={!!newToken} onOpenChange={() => setNewToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Store this token now</DialogTitle>
            <DialogDescription>It will never be shown again. Treat it like a password.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border border-emerald/30 bg-black/40 p-4">
            <code className="mono flex-1 break-all text-sm text-emerald-bright">{newToken}</code>
            {newToken && <CopyButton value={newToken} label="Copy new token" />}
          </div>
          <SecurityWarning compact />
        </DialogContent>
      </Dialog>
    </div>
  );
}
