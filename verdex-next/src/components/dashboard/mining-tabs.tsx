"use client";

import { useState } from "react";
import { Clock, Pickaxe, Cpu, Thermometer, ShieldAlert, Coins, HelpCircle } from "lucide-react";
import { timeAgo } from "@/lib/utils";

interface MiningTabsProps {
  sessions: any[];
  miningTransactions: any[];
  hashrate: number;
}

export function MiningTabs({ sessions, miningTransactions, hashrate }: MiningTabsProps) {
  const [activeTab, setActiveTab] = useState<"history" | "metrics" | "calculator">("history");
  const [calcHashrate, setCalcHashrate] = useState<number>(hashrate > 0 ? hashrate : 120);

  // Rewards calculation helper
  // Assuming 100 H/s yields ~ 10 VP per day
  const estimatedDailyVP = (calcHashrate / 100) * 10;
  const estimatedWeeklyVP = estimatedDailyVP * 7;
  const estimatedMonthlyVP = estimatedDailyVP * 30;

  return (
    <div className="vdx-card overflow-hidden">
      {/* Tabs Header */}
      <div className="flex border-b border-[rgba(87,255,179,0.15)] bg-black/25">
        {[
          { id: "history", label: "Mining History", icon: Clock },
          { id: "metrics", label: "Device Metrics", icon: Cpu },
          { id: "calculator", label: "Calculator", icon: Coins },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-all border-b-2 ${
                isActive
                  ? "border-vdx-green text-vdx-green bg-[rgba(36,229,150,0.03)]"
                  : "border-transparent text-vdx-muted hover:text-vdx-text hover:bg-white/[0.02]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tabs Content */}
      <div className="p-6">
        {/* Tab 1: Mining History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-semibold text-vdx-text">Recent Rewards Log</h3>
              <span className="text-xs text-vdx-muted font-mono">{miningTransactions.length} rewards recorded</span>
            </div>
            
            {miningTransactions.length === 0 ? (
              <div className="text-center py-8 text-vdx-muted text-sm">
                No recent mining transactions found.
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {miningTransactions.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[rgba(36,229,150,0.02)] border border-[rgba(87,255,179,0.05)] hover:border-[rgba(87,255,179,0.12)] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-vdx-green/10 flex items-center justify-center flex-shrink-0">
                        <Pickaxe className="w-3.5 h-3.5 text-vdx-green" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-vdx-text">{s.description || "Block Mined"}</p>
                        <p className="text-xs text-vdx-muted flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          {timeAgo(s.created_at)}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold text-vdx-green">
                      +{(s.amount || 0).toFixed(4)} VP
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Device Metrics */}
        {activeTab === "metrics" && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left: active device card */}
              <div className="rounded-xl border border-[rgba(87,255,179,0.1)] bg-black/15 p-5">
                <h4 className="text-xs font-bold text-vdx-green uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vdx-green opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-vdx-green"></span>
                  </span>
                  Active Worker Details
                </h4>
                
                {sessions && sessions.length > 0 ? (
                  <div className="space-y-3.5 text-sm">
                    <div className="flex justify-between border-b border-white/[0.04] pb-2">
                      <span className="text-vdx-muted">Worker Name</span>
                      <span className="font-medium font-mono text-vdx-text">{sessions[0].device_name || "CLI Miner"}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/[0.04] pb-2">
                      <span className="text-vdx-muted">Reported Hashrate</span>
                      <span className="font-medium font-mono text-vdx-text">{(sessions[0].hashrate || hashrate || 0).toFixed(2)} H/s</span>
                    </div>
                    <div className="flex justify-between border-b border-white/[0.04] pb-2">
                      <span className="text-vdx-muted">Connection Type</span>
                      <span className="font-medium text-vdx-text">Secure TLS Gateway</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-vdx-muted">Last Activity</span>
                      <span className="font-medium text-vdx-text">{timeAgo(sessions[0].last_heartbeat_at)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-vdx-muted text-sm">
                    No active mining workers connected.
                  </div>
                )}
              </div>

              {/* Right: Telemetry data */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-vdx-text mb-2">Simulated Hardware Telemetry</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3.5 flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-vdx-cyan flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-vdx-muted uppercase tracking-wider">CPU Threads</p>
                      <p className="text-sm font-bold text-vdx-text">8 Cores</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3.5 flex items-center gap-3">
                    <Thermometer className="w-5 h-5 text-vdx-warning flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-vdx-muted uppercase tracking-wider">Core Temp</p>
                      <p className="text-sm font-bold text-vdx-text">64.5 °C</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-vdx-green/5 border border-vdx-green/10 text-xs text-vdx-muted">
                  <ShieldAlert className="w-4 h-4 text-vdx-green flex-shrink-0 mt-0.5" />
                  <p>
                    Ensure your mining hardware remains in a well-ventilated space. Hashrates are automatically throttled if internal system temperature limits are reached.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Rewards Calculator */}
        {activeTab === "calculator" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-vdx-text mb-2">VP Yield Estimator</h3>
              <p className="text-xs text-vdx-muted">
                Adjust your device's expected hashrate to calculate estimated VP (Verdex Point) yield. Actual rewards may vary based on global mining difficulty and pool participant counts.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-vdx-muted">Target Hashrate</span>
                  <span className="font-mono font-bold text-vdx-green">{calcHashrate} H/s</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="1500"
                  step="10"
                  value={calcHashrate}
                  onChange={(e) => setCalcHashrate(Number(e.target.value))}
                  className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-vdx-green"
                />
              </div>

              {/* Estimate results */}
              <div className="grid sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4 text-center">
                  <span className="text-[10px] text-vdx-muted uppercase tracking-wider block mb-1">Daily Yield</span>
                  <span className="font-heading font-bold text-lg text-vdx-text">{estimatedDailyVP.toFixed(2)} VP</span>
                </div>
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4 text-center">
                  <span className="text-[10px] text-vdx-muted uppercase tracking-wider block mb-1">Weekly Yield</span>
                  <span className="font-heading font-bold text-lg text-vdx-green">{estimatedWeeklyVP.toFixed(2)} VP</span>
                </div>
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4 text-center">
                  <span className="text-[10px] text-vdx-muted uppercase tracking-wider block mb-1">Monthly Yield</span>
                  <span className="font-heading font-bold text-lg text-vdx-text">{estimatedMonthlyVP.toFixed(2)} VP</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-black/20 rounded-xl text-[10px] text-vdx-muted border border-dashed border-white/5">
                <HelpCircle className="w-3.5 h-3.5 text-vdx-muted" />
                <span>Yield calculation assumes a basic hashrate efficiency model of 0.1 VP per H/s daily.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
