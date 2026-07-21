/**
 * Verdex AI Operations Assistant — monitoring + diagnostics.
 *
 * MONITORS validators, detects offline nodes, flags sync issues, analyzes
 * logs, and recommends maintenance. NEVER decides consensus, handles private
 * keys, signs transactions, or modifies validator state.
 *
 * This is a read-only observer. It can RECOMMEND actions but cannot execute
 * them. The human operator or the validator-manager.js script performs any
 * state-changing operations.
 *
 * Usage:
 *   node mainnet/ai-ops-assistant.js scan        One-time scan + report
 *   node mainnet/ai-ops-assistant.js watch        Continuous monitoring (cron-like)
 *   node mainnet/ai-ops-assistant.js analyze <i>  Deep log analysis for validator i
 *   node mainnet/ai-ops-assistant.js report       Generate health report
 */
const { execSync } = require('child_process');
const { existsSync, readFileSync, readdirSync } = require('fs');
const { join } = require('path');
const http = require('http');

const BESU_HOME = process.env.VERDEX_BESU_HOME || join(process.env.HOME || '/opt', 'verdex-besu');
const VALIDATORS_DIR = join(BESU_HOME, 'validators');
const RPC_PORT_BASE = 8545;

function log(level, msg, data = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, component: 'ai-ops', msg, ...data });
  console.log(line);
}

function cmd(c) {
  try { return execSync(c, { encoding: 'utf8', timeout: 10000 }).trim(); }
  catch { return null; }
}

function rpcPort(index) { return RPC_PORT_BASE + index; }

function rpcUrl(index) { return `http://localhost:${rpcPort(index)}`; }

async function rpcCall(index, method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const req = http.request({
      hostname: '127.0.0.1',
      port: rpcPort(index),
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Diagnostic checks — each returns { severity, message, recommendation }
// ---------------------------------------------------------------------------
const checks = [];

// Check 1: Is the process running?
checks.push({
  id: 'process-running',
  name: 'Process Running',
  severity: 'critical',
  async run(index, ctx) {
    const pidFile = join(validatorDir(index), 'besu.pid');
    if (!existsSync(pidFile)) {
      return { pass: false, message: 'No PID file — process not started', recommendation: 'Run: node mainnet/validator-manager.js start ' + index };
    }
    const pid = readFileSync(pidFile, 'utf8').trim();
    const alive = cmd(`kill -0 ${pid} 2>/dev/null`);
    if (alive === null) {
      return { pass: false, message: `Process (PID ${pid}) is not running`, recommendation: 'Run: node mainnet/validator-manager.js restart ' + index };
    }
    return { pass: true, message: `Process running (PID ${pid})` };
  }
});

// Check 2: RPC responsive?
checks.push({
  id: 'rpc-responsive',
  name: 'RPC Responsive',
  severity: 'critical',
  async run(index, ctx) {
    try {
      const r = await rpcCall(index, 'eth_blockNumber');
      if (r?.result) return { pass: true, message: 'RPC responding' };
      return { pass: false, message: 'RPC returned no result', recommendation: 'Check Besu logs for errors' };
    } catch (e) {
      return { pass: false, message: `RPC unreachable: ${e.message}`, recommendation: 'Verify Besu is running and RPC port is correct' };
    }
  }
});

// Check 3: Peer connectivity
checks.push({
  id: 'peer-connectivity',
  name: 'Peer Connectivity',
  severity: 'high',
  async run(index, ctx) {
    try {
      const r = await rpcCall(index, 'net_peerCount');
      const peers = r?.result ? parseInt(r.result, 16) : 0;
      if (peers === 0) {
        return { pass: false, message: 'No peers connected — node is isolated', recommendation: 'Check P2P port firewall rules and bootnode configuration' };
      }
      if (peers < 2) {
        return { pass: true, message: `Only ${peers} peer(s) — low connectivity`, recommendation: 'Add more bootnodes or check network connectivity' };
      }
      return { pass: true, message: `${peers} peers connected` };
    } catch {
      return { pass: false, message: 'Could not query peer count', recommendation: 'Check RPC health' };
    }
  }
});

// Check 4: Block height advancing?
checks.push({
  id: 'block-advancing',
  name: 'Block Production',
  severity: 'high',
  async run(index, ctx) {
    try {
      const r1 = await rpcCall(index, 'eth_blockNumber');
      const block1 = r1?.result ? parseInt(r1.result, 16) : 0;
      // Wait 10 seconds (2 block periods at 5s)
      await new Promise(res => setTimeout(res, 10000));
      const r2 = await rpcCall(index, 'eth_blockNumber');
      const block2 = r2?.result ? parseInt(r2.result, 16) : 0;

      if (block2 > block1) {
        return { pass: true, message: `Block advancing: ${block1} → ${block2} (+${block2 - block1} in 10s)` };
      }
      if (ctx.syncing) {
        return { pass: true, message: `Syncing (not producing blocks yet) at height ${block2}` };
      }
      return { pass: false, message: `Block height not advancing: ${block1} → ${block2}`, recommendation: 'Check if validator is in the validator set and has peer connectivity' };
    } catch (e) {
      return { pass: false, message: `Block check failed: ${e.message}` };
    }
  }
});

// Check 5: Sync status
checks.push({
  id: 'sync-status',
  name: 'Sync Status',
  severity: 'medium',
  async run(index, ctx) {
    try {
      const r = await rpcCall(index, 'eth_syncing');
      if (r?.result === false) {
        return { pass: true, message: 'Fully synced' };
      }
      if (r?.result && typeof r.result === 'object') {
        const current = parseInt(r.result.currentBlock, 16);
        const highest = parseInt(r.result.highestBlock, 16);
        const pct = highest > 0 ? ((current / highest) * 100).toFixed(1) : '?';
        return { pass: true, message: `Syncing: ${pct}% (${current}/${highest})`, recommendation: 'Wait for sync to complete' };
      }
      return { pass: true, message: 'Sync status unclear' };
    } catch {
      return { pass: false, message: 'Could not check sync status' };
    }
  }
});

// Check 6: Disk space
checks.push({
  id: 'disk-space',
  name: 'Disk Space',
  severity: 'medium',
  async run(index) {
    const dataDir = join(validatorDir(index), 'data');
    const df = cmd(`df -h "${dataDir}" 2>/dev/null | tail -1`);
    if (!df) return { pass: true, message: 'Disk check skipped (not Linux)' };
    const parts = df.split(/\s+/);
    const usePct = parts[4]?.replace('%', '');
    if (parseInt(usePct) > 90) {
      return { pass: false, message: `Disk usage at ${usePct}%`, recommendation: 'Free up disk space or prune old data — node will fail soon' };
    }
    if (parseInt(usePct) > 75) {
      return { pass: true, message: `Disk usage at ${usePct}% — monitor`, recommendation: 'Plan for disk expansion' };
    }
    return { pass: true, message: `Disk usage at ${usePct}%` };
  }
});

// Check 7: Log error analysis
checks.push({
  id: 'log-errors',
  name: 'Log Error Analysis',
  severity: 'high',
  async run(index) {
    const logFile = join(validatorDir(index), 'besu.log');
    if (!existsSync(logFile)) return { pass: true, message: 'No log file' };
    const recentLogs = cmd(`tail -500 "${logFile}" 2>/dev/null`);
    if (!recentLogs) return { pass: true, message: 'Could not read logs' };

    const errorLines = recentLogs.split('\n').filter(l =>
      /ERROR|WARN|Exception|Failed|timeout|refused|disconnect/i.test(l)
    );

    if (errorLines.length > 20) {
      const sample = errorLines.slice(-5).join('\n  ');
      return { pass: false, message: `${errorLines.length} errors in recent logs`, recommendation: `Investigate log errors:\n  ${sample}` };
    }
    if (errorLines.length > 5) {
      return { pass: true, message: `${errorLines.length} warnings in recent logs`, recommendation: 'Monitor for increasing error rate' };
    }
    return { pass: true, message: 'Logs clean (no recent errors)' };
  }
});

// Check 8: Memory usage
checks.push({
  id: 'memory-usage',
  name: 'Memory Usage',
  severity: 'medium',
  async run(index) {
    const pidFile = join(validatorDir(index), 'besu.pid');
    if (!existsSync(pidFile)) return { pass: true, message: 'No PID' };
    const pid = readFileSync(pidFile, 'utf8').trim();
    const mem = cmd(`ps -o rss= -p ${pid} 2>/dev/null`);
    if (!mem) return { pass: true, message: 'Memory check skipped' };
    const memMB = Math.round(parseInt(mem) / 1024);
    if (memMB > 4096) {
      return { pass: false, message: `High memory usage: ${memMB} MB`, recommendation: 'Increase server RAM or check for memory leaks in Besu' };
    }
    return { pass: true, message: `Memory: ${memMB} MB` };
  }
});

function validatorDir(index) {
  return join(VALIDATORS_DIR, `validator-${index}`);
}

// ---------------------------------------------------------------------------
// Scan — run all checks on all validators
// ---------------------------------------------------------------------------
async function scan() {
  const dirs = existsSync(VALIDATORS_DIR)
    ? readdirSync(VALIDATORS_DIR).filter(d => d.startsWith('validator-')).sort()
    : [];

  if (dirs.length === 0) {
    console.log('No validators initialized. Run: node mainnet/validator-manager.js init <index>');
    return { validators: [], summary: { total: 0, healthy: 0, issues: 0 } };
  }

  const results = [];

  for (const d of dirs) {
    const index = parseInt(d.replace('validator-', ''), 10);
    const validatorResult = {
      index,
      checks: [],
      healthy: true,
      critical_issues: 0,
      high_issues: 0,
      recommendations: [],
    };

    // Get sync status first (used by other checks)
    let syncing = false;
    try {
      const syncRes = await rpcCall(index, 'eth_syncing');
      syncing = syncRes?.result !== false;
    } catch {}
    const ctx = { syncing };

    // Run all checks
    for (const check of checks) {
      try {
        const result = await check.run(index, ctx);
        validatorResult.checks.push({
          id: check.id,
          name: check.name,
          severity: check.severity,
          pass: result.pass,
          message: result.message,
          recommendation: result.recommendation || null,
        });
        if (!result.pass) {
          if (check.severity === 'critical') validatorResult.critical_issues++;
          if (check.severity === 'high') validatorResult.high_issues++;
          if (result.recommendation) validatorResult.recommendations.push(result.recommendation);
          if (check.severity === 'critical' || check.severity === 'high') {
            validatorResult.healthy = false;
          }
        }
      } catch (e) {
        validatorResult.checks.push({
          id: check.id,
          name: check.name,
          severity: check.severity,
          pass: false,
          message: `Check failed: ${e.message}`,
        });
      }
    }

    results.push(validatorResult);
  }

  // Print report
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         VERDEX AI OPERATIONS ASSISTANT — SCAN REPORT         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Validators: ${results.length}`);
  console.log('');

  for (const v of results) {
    const status = v.critical_issues > 0 ? '🔴 CRITICAL' :
                   v.high_issues > 0 ? '🟡 WARNING' : '🟢 HEALTHY';
    console.log(`┌─ Validator ${v.index}: ${status}`);
    for (const c of v.checks) {
      const icon = c.pass ? '✅' : (c.severity === 'critical' ? '❌' : '⚠️');
      console.log(`│  ${icon} ${c.name}: ${c.message}`);
      if (!c.pass && c.recommendation) {
        console.log(`│     → ${c.recommendation}`);
      }
    }
    if (v.recommendations.length > 0) {
      console.log('│');
      console.log('│  🤖 AI Recommendations:');
      for (const r of v.recommendations) {
        console.log(`│     • ${r}`);
      }
    }
    console.log('└' + '─'.repeat(60));
    console.log('');
  }

  const summary = {
    total: results.length,
    healthy: results.filter(v => v.healthy).length,
    critical: results.reduce((s, v) => s + v.critical_issues, 0),
    high: results.reduce((s, v) => s + v.high_issues, 0),
    recommendations: results.reduce((all, v) => all.concat(v.recommendations), []),
  };

  console.log(`Summary: ${summary.healthy}/${summary.total} healthy | ${summary.critical} critical | ${summary.high} high`);
  if (summary.critical > 0) {
    console.log('\n⚠️  CRITICAL: Some validators need immediate attention!');
    console.log('Run: node mainnet/validator-manager.js recover');
  }

  return { validators: results, summary };
}

// ---------------------------------------------------------------------------
// Watch — continuous monitoring
// ---------------------------------------------------------------------------
async function watch(intervalMs = 60000) {
  log('info', 'AI Ops Assistant starting continuous monitoring', { interval: intervalMs });

  // Run scan immediately
  await scan();

  // Schedule periodic scans
  setInterval(async () => {
    try {
      const report = await scan();
      if (report.summary.critical > 0) {
        log('error', 'Critical issues detected', { count: report.summary.critical });
        // In production, this would send alerts via email/Slack/PagerDuty
      }
    } catch (e) {
      log('error', 'Scan failed', { error: e.message });
    }
  }, intervalMs);

  console.log(`\nMonitoring active — scanning every ${intervalMs / 1000}s. Press Ctrl+C to stop.`);
}

// ---------------------------------------------------------------------------
// Deep log analysis for a single validator
// ---------------------------------------------------------------------------
async function analyzeLogs(index) {
  const logFile = join(validatorDir(index), 'besu.log');
  if (!existsSync(logFile)) {
    console.log('No log file for validator ' + index);
    return;
  }

  const logs = readFileSync(logFile, 'utf8').split('\n').slice(-1000);

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║    AI LOG ANALYSIS — VALIDATOR ${index}                          ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`Analyzing last ${logs.length} log lines...\n`);

  // Categorize log lines
  const categories = {
    errors: [],
    warnings: [],
    imports: [],
    blocks: [],
    peers: [],
    sync: [],
    other: [],
  };

  for (const line of logs) {
    if (/ERROR/i.test(line)) categories.errors.push(line);
    else if (/WARN/i.test(line)) categories.warnings.push(line);
    else if (/Imported #/i.test(line)) categories.blocks.push(line);
    else if (/peer/i.test(line)) categories.peers.push(line);
    else if (/sync/i.test(line)) categories.sync.push(line);
    else if (line.trim()) categories.other.push(line);
  }

  // Analyze patterns
  console.log('📊 Log Summary:');
  console.log(`  Total lines: ${logs.length}`);
  console.log(`  Errors: ${categories.errors.length}`);
  console.log(`  Warnings: ${categories.warnings.length}`);
  console.log(`  Block imports: ${categories.blocks.length}`);
  console.log(`  Peer events: ${categories.peers.length}`);
  console.log('');

  // Error analysis
  if (categories.errors.length > 0) {
    console.log('❌ Recent Errors (last 10):');
    for (const e of categories.errors.slice(-10)) {
      console.log(`  ${e}`);
    }
    console.log('');
  }

  // Warning analysis
  if (categories.warnings.length > 0) {
    console.log('⚠️  Recent Warnings (last 5):');
    for (const w of categories.warnings.slice(-5)) {
      console.log(`  ${w}`);
    }
    console.log('');
  }

  // Block production rate
  if (categories.blocks.length > 0) {
    const firstBlock = categories.blocks[0];
    const lastBlock = categories.blocks[categories.blocks.length - 1];
    console.log('📦 Block Production:');
    console.log(`  First: ${firstBlock.substring(0, 100)}...`);
    console.log(`  Last:  ${lastBlock.substring(0, 100)}...`);
    console.log(`  Rate: ${categories.blocks.length} blocks in last ${logs.length} log lines`);
    console.log('');
  }

  // AI recommendations
  console.log('🤖 AI Analysis & Recommendations:');
  const recs = [];

  if (categories.errors.length > 50) {
    recs.push('High error count — investigate root cause immediately. Node may be unstable.');
  }
  if (categories.errors.length > 0 && categories.errors.length <= 50) {
    recs.push('Some errors detected — monitor for increase. Check if they are transient.');
  }
  if (categories.warnings.length > 100) {
    recs.push('Excessive warnings — may indicate network instability or misconfiguration.');
  }
  if (categories.blocks.length === 0) {
    recs.push('No block imports in recent logs — validator may not be producing. Check validator set membership.');
  }
  if (categories.peers.length === 0) {
    recs.push('No peer events in logs — node may be isolated. Check P2P connectivity.');
  }
  if (categories.errors.some(e => /Out of memory|OOM|heap/i.test(e))) {
    recs.push('CRITICAL: Out of memory errors detected. Increase server RAM immediately.');
  }
  if (categories.errors.some(e => /disk|space|full/i.test(e))) {
    recs.push('CRITICAL: Disk space errors detected. Free up disk space immediately.');
  }
  if (categories.errors.some(e => /connection refused|timeout|unreachable/i.test(e))) {
    recs.push('Network connectivity issues detected. Check firewall rules and peer endpoints.');
  }
  if (recs.length === 0) {
    recs.push('Logs look healthy — no significant issues detected.');
  }

  for (const r of recs) {
    console.log(`  • ${r}`);
  }
  console.log('');

  // Health verdict
  const healthScore = Math.max(0, 100 -
    (categories.errors.length > 50 ? 50 : categories.errors.length) -
    (categories.warnings.length > 100 ? 20 : 0) -
    (categories.blocks.length === 0 ? 20 : 0) -
    (categories.peers.length === 0 ? 10 : 0)
  );

  console.log(`Health Score: ${healthScore}/100`);
  if (healthScore >= 80) console.log('Verdict: 🟢 HEALTHY');
  else if (healthScore >= 50) console.log('Verdict: 🟡 NEEDS ATTENTION');
  else console.log('Verdict: 🔴 CRITICAL — immediate action required');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'scan':
      await scan();
      break;
    case 'watch':
      const interval = args[0] ? parseInt(args[0], 10) * 1000 : 60000;
      await watch(interval);
      break;
    case 'analyze':
      await analyzeLogs(parseInt(args[0], 10));
      break;
    case 'report':
      const report = await scan();
      console.log('\n' + JSON.stringify(report, null, 2));
      break;
    default:
      console.log(`Verdex AI Operations Assistant

Usage: node mainnet/ai-ops-assistant.js <command> [options]

Commands:
  scan              One-time health scan of all validators (8 diagnostic checks)
  watch [seconds]   Continuous monitoring (default: 60s interval)
  analyze <index>   Deep log analysis for a specific validator
  report            JSON health report (machine-readable)

Diagnostic Checks:
  1. Process Running       — Is the Besu process alive?
  2. RPC Responsive        — Can we reach the JSON-RPC endpoint?
  3. Peer Connectivity     — Are peers connected? (>0 required, >2 recommended)
  4. Block Production      — Is block height advancing? (10s window)
  5. Sync Status           — Is the node fully synced or still catching up?
  6. Disk Space            — Is there enough disk for chain data?
  7. Log Error Analysis    — Are there ERROR/WARN lines in recent logs?
  8. Memory Usage          — Is Besu consuming excessive RAM?

IMPORTANT: This assistant is READ-ONLY. It monitors, analyzes, and recommends
but NEVER executes state changes, handles private keys, or modifies consensus.
All remediation is performed by the human operator via validator-manager.js.
`);
  }
}

main().catch(e => { log('error', 'Fatal', { error: e.message }); process.exit(1); });
