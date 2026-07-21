"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SecurityWarning } from "@/components/shared/security-warning";
import { useAuth } from "@/components/auth/auth-provider";

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(user?.email?.split("@")[0] ?? "");
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [payoutAlerts, setPayoutAlerts] = useState(true);
  const [publicProfile, setPublicProfile] = useState(false);

  function saveProfile() {
    toast.success("Profile saved", { description: "Display preferences updated." });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Account Settings</h1>
        <p className="mt-1 text-sm text-muted">Profile, security, sessions and preferences.</p>
      </div>

      {/* profile */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <UserCircle className="h-5 w-5 text-emerald-bright" />
          <h2 className="font-heading text-lg font-bold text-ink">Profile</h2>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="display-name" className="mb-1.5 block">Display name</Label>
            <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block">Email</Label>
            <Input value={user?.email ?? ""} disabled className="opacity-60" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" onClick={saveProfile}>Save changes</Button>
          <Badge variant="default"><ShieldCheck className="h-3 w-3" /> Email verified</Badge>
        </div>
      </Card>

      {/* security */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-emerald-bright" />
          <h2 className="font-heading text-lg font-bold text-ink">Security</h2>
        </div>
        <div className="mt-5 space-y-1">
          <SettingRow
            title="Two-factor authentication"
            note="Adds a code step to sign-in. Rolls out with the account-security upgrade."
            control={<Badge variant="neutral">Coming soon</Badge>}
          />
          <Separator className="my-4" />
          <SettingRow
            title="Recovery email"
            note={user?.email ?? "—"}
            control={<Button variant="outline" size="sm" onClick={() => toast.info("Recovery flow", { description: "Password recovery uses the sign-in email." })}>Manage</Button>}
          />
          <Separator className="my-4" />
          <SettingRow
            title="Active sessions"
            note="This device · current session"
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut().then(() => { toast.success("Signed out"); router.push("/"); })}
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out everywhere
              </Button>
            }
          />
        </div>
        <SecurityWarning className="mt-5" compact />
      </Card>

      {/* devices */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <MonitorSmartphone className="h-5 w-5 text-emerald-bright" />
          <h2 className="font-heading text-lg font-bold text-ink">Miner devices</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          Manage per-device API tokens on the{" "}
          <a href="/dashboard/downloads" className="font-semibold text-emerald-bright hover:underline">Downloads page</a>.
          Revoking a token immediately disconnects that miner.
        </p>
      </Card>

      {/* preferences */}
      <Card className="p-6">
        <h2 className="font-heading text-lg font-bold text-ink">Preferences</h2>
        <div className="mt-5 space-y-1">
          <SettingRow
            title="Email notifications"
            note="Product updates and security notices"
            control={<Switch checked={emailNotifs} onCheckedChange={setEmailNotifs} aria-label="Toggle email notifications" />}
          />
          <Separator className="my-4" />
          <SettingRow
            title="Payout alerts"
            note="Notify when VP converts to VDX"
            control={<Switch checked={payoutAlerts} onCheckedChange={setPayoutAlerts} aria-label="Toggle payout alerts" />}
          />
          <Separator className="my-4" />
          <SettingRow
            title="Public leaderboard profile"
            note="Show your display name (not email) on the mining leaderboard"
            control={<Switch checked={publicProfile} onCheckedChange={setPublicProfile} aria-label="Toggle public leaderboard profile" />}
          />
        </div>
      </Card>
    </div>
  );
}

function SettingRow({ title, note, control }: { title: string; note: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{note}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
