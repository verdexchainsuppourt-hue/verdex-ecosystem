"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Loader2, Key, AlertTriangle, CheckCircle2, Copy } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [tokenResult, setTokenResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function generateMinerToken() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate-miner-token", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate token");
      setTokenResult(json.token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setError(error.message);
    else { setPwSuccess(true); setNewPassword(""); }
    setPwLoading(false);
  }

  return (
    <div className="space-y-8 py-2">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-800 tracking-tight">
          Account <span className="gradient-text">Settings</span>
        </h1>
        <p className="text-vdx-muted text-sm mt-1">Manage your Verdex account security and miner access.</p>
      </div>

      {/* Miner token */}
      <div className="vdx-card p-7">
        <div className="flex items-center gap-3 mb-2">
          <Key className="w-5 h-5 text-vdx-green" />
          <h2 className="font-heading font-bold text-base">Miner Authentication Token</h2>
        </div>
        <p className="text-vdx-muted text-sm leading-relaxed mb-5">
          Generate a miner token to authenticate the Verdex desktop or Android miner app. Tokens are single-use session credentials — never share them. Generating a new token revokes the previous one.
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-vdx-error/10 border border-vdx-error/25 mb-4">
            <AlertTriangle className="w-4 h-4 text-vdx-error flex-shrink-0 mt-0.5" />
            <p className="text-xs text-vdx-error">{error}</p>
          </div>
        )}

        {tokenResult ? (
          <div className="space-y-3">
            <p className="text-xs text-vdx-warning">⚠ Copy this token now — it will not be shown again.</p>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-black/30 border border-vdx-green/30">
              <span className="font-mono text-xs text-vdx-green flex-1 break-all">{tokenResult}</span>
              <button
                onClick={() => navigator.clipboard.writeText(tokenResult)}
                className="flex-shrink-0 text-vdx-muted hover:text-vdx-green transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setTokenResult(null)}
              className="btn-outline text-sm px-4 py-2"
            >
              Done
            </button>
          </div>
        ) : (
          <button onClick={generateMinerToken} disabled={loading} className="btn-primary text-sm px-6 py-3">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Key className="w-4 h-4" />Generate Miner Token</>}
          </button>
        )}
      </div>

      {/* Change password */}
      <div className="vdx-card p-7">
        <h2 className="font-heading font-bold text-base mb-4">Change Password</h2>
        {pwSuccess ? (
          <div className="flex items-center gap-2 text-vdx-green text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Password updated successfully.
          </div>
        ) : (
          <form onSubmit={updatePassword} className="space-y-4 max-w-sm">
            <div>
              <label className="text-xs text-vdx-muted uppercase tracking-wider font-semibold block mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="vdx-input"
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={pwLoading} className="btn-outline text-sm px-5 py-2.5">
              {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
            </button>
          </form>
        )}
      </div>

      {/* Security reminder */}
      <div className="p-4 rounded-xl bg-[rgba(255,92,108,0.06)] border border-[rgba(255,92,108,0.15)] text-xs text-vdx-muted leading-relaxed">
        <strong className="text-vdx-error">Security reminder:</strong> Verdex will never ask for your seed phrase, private key, or HSM credentials. Never enter these anywhere on this platform.
      </div>
    </div>
  );
}
