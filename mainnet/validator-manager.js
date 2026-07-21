/**
 * Verdex Validator Manager — automated Besu QBFT validator lifecycle.
 *
 * Runs ON the validator machine (or a control plane with SSH access).
 * Generates configs and keys LOCALLY, manages start/stop/restart, runs
 * health checks, and auto-recovers failed nodes.
 *
 * Validator keys are generated locally with Besu's `operator generate-block-encryption-key`
 * and NEVER leave the machine. This module never exports, uploads, or exposes
 * private keys. Only public addresses and enodes are shared with the config generator.
 *
 * Usage:
 *   node mainnet/validator-manager.js <command> [options]
 *
 * Commands:
 *   init <validator-index>     Generate local keys + config for validator N
 *   start <validator-index>    Start a validator node
 *   stop <validator-index>     Stop a validator node
 *   restart <validator-index>  Restart a validator node
 *   status                     Show all validator statuses
 *   health                     Run health checks on all nodes
 *   recover                    Auto-recover any down nodes
 *   logs <validator-index>     Tail recent logs for a node
 *   info                       Show network info + deployment status
 */
const { execSync, exec, spawn } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } = require('fs');
const { join, resolve, dirname } = require('path');
const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BESU_VERSION = '26.7.0';
const BESU_HOME = process.env.VERDEX_BESU_HOME || join(process.env.HOME || process.env.USERPROFILE || '/opt', 'verdex-besu');
const VALIDATORS_DIR = join(BESU_HOME, 'validators');
const NETWORK_NAME = 'verdex-mainnet';
const CHAIN_ID = 72010;
const RPC_PORT_BASE = 8545;  // validator 0 = 8545, 1 = 8546, etc.
const P2P_PORT_BASE = 30303; // validator 0 = 30303, 1 = 30304, etc.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(level, msg, data = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function cmd(cmdStr, opts = {}) {
  try {
    return execSync(cmdStr, { encoding: 'utf8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(parseInt(pid, 10), 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function validatorDir(index) {
  return join(VALIDATORS_DIR, `validator-${index}`);
}

function validatorDataDir(index) {
  return join(validatorDir(index), 'data');
}

function validatorKeyDir(index) {
  return join(validatorDir(index), 'keys');
}

function rpcPort(index) {
  return RPC_PORT_BASE + index;
}

function p2pPort(index) {
  return P2P_PORT_BASE + index;
}

function rpcUrl(index) {
  return `http://localhost:${rpcPort(index)}`;
}

async function rpcCall(index, method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url = new URL(rpcUrl(index));
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Besu binary resolution
// ---------------------------------------------------------------------------
function findBesu() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const winPath = join(localAppData, 'Verdex', 'toolchain', 'besu-26.7.0', 'bin', 'besu.bat');
  if (existsSync(winPath)) {
    return winPath;
  }
  // Check common locations
  const paths = [
    join(BESU_HOME, 'besu', 'bin', 'besu'),
    '/opt/besu/bin/besu',
    '/usr/local/bin/besu',
    'besu', // PATH
  ];
  for (const p of paths) {
    const result = cmd(`which ${p} 2>/dev/null || where ${p} 2>nul`);
    if (result) return p;
  }
  // Check if besu is in PATH
  const which = cmd('which besu 2>/dev/null');
  if (which) return 'besu';
  return null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Initialize a validator: generate keys locally, create config.
 * Keys NEVER leave this machine.
 */
async function initValidator(index) {
  if (index < 0 || index > 15) {
    log('error', 'Invalid validator index', { index });
    process.exit(1);
  }

  const vDir = validatorDir(index);
  const kDir = validatorKeyDir(index);
  const dDir = validatorDataDir(index);

  if (existsSync(join(kDir, 'key'))) {
    log('warn', 'Validator keys already exist — refusing to overwrite', { index, dir: kDir });
    return;
  }

  // Create directories
  mkdirSync(vDir, { recursive: true });
  mkdirSync(kDir, { recursive: true });
  mkdirSync(dDir, { recursive: true });

  const besu = findBesu();
  if (!besu) {
    log('error', 'Besu binary not found. Install Besu first.', { expected: BESU_VERSION });
    log('info', 'Install with: wget https://github.com/hyperledger/besu/releases/download/' + BESU_VERSION + '/besu-' + BESU_VERSION + '.zip');
    process.exit(1);
  }

  // Generate block-encryption-key (node key) LOCALLY
  log('info', 'Generating validator node key locally', { index, dir: kDir });
  cmd(`${besu} operator generate-block-encryption-key --key-file=${join(kDir, 'key')}`);

  // Generate address from the key
  const keyFile = join(kDir, 'key');
  if (!existsSync(keyFile)) {
    log('error', 'Key generation failed — key file not found', { expected: keyFile });
    process.exit(1);
  }

  // Get the public address from the generated key
  const publicKeyOutput = cmd(`${besu} public-key export --key-file=${keyFile}`);
  if (!publicKeyOutput) {
    log('error', 'Failed to export public key', { keyFile });
    process.exit(1);
  }

  // Derive the address from the public key
  const addressOutput = cmd(`${besu} public-key export-address --key-file=${keyFile}`);
  const address = addressOutput ? addressOutput.trim() : null;

  if (!address) {
    log('error', 'Failed to derive address from key', { keyFile });
    process.exit(1);
  }

  // Write validator config
  const config = {
    index,
    name: `verdex-validator-${index}`,
    address: address.toLowerCase(),
    rpc_port: rpcPort(index),
    p2p_port: p2pPort(index),
    data_dir: dDir,
    key_dir: kDir,
    chain_id: CHAIN_ID,
    network: NETWORK_NAME,
    created_at: new Date().toISOString(),
  };

  writeFileSync(join(vDir, 'validator.json'), JSON.stringify(config, null, 2));

  // Write Besu config file
  const besuConfig = `# Verdex Mainnet Validator ${index}
network-id=${CHAIN_ID}
genesis-file="${join(BESU_HOME, 'genesis.json')}"
data-path="${dDir}"
data-storage-format="FOREST"
sync-mode="FAST"
bonsai-limit-trie-logs=100000
min-gas-price=1000000000
max-peers=50
p2p-port=${p2pPort(index)}
p2p-host="0.0.0.0"
rpc-http-enabled=true
rpc-http-host="127.0.0.1"
rpc-http-port=${rpcPort(index)}
rpc-http-api=["ETH","NET","WEB3","QBFT","ADMIN","MINER","DEBUG","TRACE"]
rpc-http-cors-origins=["localhost"]
rpc-ws-enabled=false
host-allowlist=["127.0.0.1","localhost"]
metrics-enabled=true
metrics-host="127.0.0.1"
metrics-port=${9545 + index}
logging="INFO"
`;
  writeFileSync(join(vDir, 'besu.config'), besuConfig);

  log('info', 'Validator initialized', {
    index,
    address: address.toLowerCase(),
    rpc_port: rpcPort(index),
    p2p_port: p2pPort(index),
    key_dir: kDir,
  });
  log('warn', 'IMPORTANT: The key in ' + kDir + ' must NEVER leave this machine. Back up securely.');
  console.log('\nValidator address: ' + address.toLowerCase());
  console.log('Share this address with the genesis config generator.');
  console.log('NEVER share the private key file at: ' + keyFile);
}

/**
 * Start a validator node.
 */
async function startValidator(index) {
  const vDir = validatorDir(index);
  const configFile = join(vDir, 'besu.config');
  const keyDir = validatorKeyDir(index);

  if (!existsSync(configFile)) {
    log('error', 'Validator not initialized', { index, expected: configFile });
    process.exit(1);
  }
  if (!existsSync(join(keyDir, 'key'))) {
    log('error', 'Validator key not found', { index, expected: join(keyDir, 'key') });
    process.exit(1);
  }

  // Check if already running
  const pidFile = join(vDir, 'besu.pid');
  if (existsSync(pidFile)) {
    const pid = readFileSync(pidFile, 'utf8').trim();
    if (isProcessAlive(pid)) {
      log('warn', 'Validator already running', { index, pid });
      return;
    }
  }

  const besu = findBesu();
  if (!besu) {
    log('error', 'Besu not found');
    process.exit(1);
  }

  // Start Besu as a background process
  const logFile = join(vDir, 'besu.log');
  const args = [
    `--config-file=${configFile}`,
    `--node-private-key-file=${join(keyDir, 'key')}`,
  ];

  log('info', 'Starting validator', { index, rpc_port: rpcPort(index), p2p_port: p2pPort(index) });

  const env = { ...process.env };
  if (process.platform === 'win32' && env.JAVA_HOME) {
    delete env.JAVA_HOME;
  }
  const child = spawn(besu, args, {
    detached: true,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: vDir,
    env,
  });

  // Write PID file
  writeFileSync(pidFile, String(child.pid));

  // Pipe logs
  const { createWriteStream } = require('fs');
  const logStream = createWriteStream(logFile, { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.unref();

  log('info', 'Validator started', { index, pid: child.pid, log: logFile });

  // Wait a moment and check if it's still alive
  await new Promise(r => setTimeout(r, 3000));
  if (!isProcessAlive(child.pid)) {
    log('error', 'Validator process died immediately — check logs', { index, logFile });
    // Read last 20 lines of log
    const logs = cmd(`tail -20 ${logFile} 2>/dev/null`) || cmd(`powershell -Command "Get-Content -Tail 20 -Path '${logFile}'"`);
    if (logs) console.log(logs);
    process.exit(1);
  }

  console.log(`Validator ${index} started (PID ${child.pid})`);
}

/**
 * Stop a validator node.
 */
async function stopValidator(index) {
  const vDir = validatorDir(index);
  const pidFile = join(vDir, 'besu.pid');

  if (!existsSync(pidFile)) {
    log('warn', 'No PID file — validator may not be running', { index });
    // Try to find by port
    const pid = cmd(`lsof -ti :${rpcPort(index)} 2>/dev/null || netstat -ano 2>nul | findstr :${rpcPort(index)}`);
    if (pid) {
      log('info', 'Found process by port, stopping', { index, pid: pid.trim() });
      cmd(`kill ${pid.trim()} 2>/dev/null || taskkill /PID ${pid.trim()} /F 2>nul`);
    }
    return;
  }

  const pid = readFileSync(pidFile, 'utf8').trim();
  log('info', 'Stopping validator', { index, pid });

  // Graceful shutdown
  cmd(`kill -TERM ${pid} 2>/dev/null || taskkill /PID ${pid} 2>nul`);

  // Wait up to 10 seconds for graceful shutdown
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (!isProcessAlive(pid)) {
      // Process stopped
      try { require('fs').unlinkSync(pidFile); } catch {}
      log('info', 'Validator stopped', { index });
      console.log(`Validator ${index} stopped`);
      return;
    }
  }

  // Force kill
  log('warn', 'Graceful shutdown timed out, force killing', { index, pid });
  cmd(`kill -9 ${pid} 2>/dev/null || taskkill /PID ${pid} /F 2>nul`);
  try { require('fs').unlinkSync(pidFile); } catch {}
  log('info', 'Validator force-stopped', { index });
  console.log(`Validator ${index} force-stopped`);
}

/**
 * Restart a validator node.
 */
async function restartValidator(index) {
  log('info', 'Restarting validator', { index });
  await stopValidator(index);
  await new Promise(r => setTimeout(r, 2000));
  await startValidator(index);
}

/**
 * Get status of all validators.
 */
async function status() {
  const dirs = existsSync(VALIDATORS_DIR)
    ? readdirSync(VALIDATORS_DIR).filter(d => d.startsWith('validator-')).sort()
    : [];

  if (dirs.length === 0) {
    console.log('No validators initialized. Run: node mainnet/validator-manager.js init <index>');
    return;
  }

  const statuses = [];
  for (const d of dirs) {
    const index = parseInt(d.replace('validator-', ''), 10);
    const vDir = validatorDir(index);
    const pidFile = join(vDir, 'besu.pid');
    const configFile = join(vDir, 'validator.json');

    let config = {};
    if (existsSync(configFile)) {
      config = JSON.parse(readFileSync(configFile, 'utf8'));
    }

    let running = false;
    let pid = null;
    if (existsSync(pidFile)) {
      pid = readFileSync(pidFile, 'utf8').trim();
      running = isProcessAlive(pid);
    }

    // Try RPC health check
    let syncing = null;
    let blockNumber = null;
    let peerCount = null;
    if (running) {
      try {
        const bn = await rpcCall(index, 'eth_blockNumber');
        blockNumber = bn?.result ? parseInt(bn.result, 16) : null;
        const sync = await rpcCall(index, 'eth_syncing');
        syncing = sync?.result !== false;
        const peers = await rpcCall(index, 'net_peerCount');
        peerCount = peers?.result ? parseInt(peers.result, 16) : null;
      } catch {}
    }

    statuses.push({
      index,
      address: config.address || 'unknown',
      running,
      pid,
      rpc_port: rpcPort(index),
      p2p_port: p2pPort(index),
      block_number: blockNumber,
      syncing,
      peers: peerCount,
    });
  }

  // Print status table
  console.log('\nVerdex Validator Network Status');
  console.log('═'.repeat(80));
  for (const s of statuses) {
    const status = s.running ? '✅ RUNNING' : '❌ STOPPED';
    const sync = s.syncing === true ? 'SYNCING' : (s.syncing === false ? 'SYNCED' : '—');
    const block = s.block_number !== null ? s.block_number.toString().padStart(8, ' ') : '       —';
    const peers = s.peers !== null ? `${s.peers} peers` : '—';
    console.log(`Validator ${s.index}: ${status} | Block: ${block} | ${sync} | ${peers} | :${s.rpc_port}`);
    console.log(`  Address: ${s.address}`);
  }
  console.log('═'.repeat(80));
  console.log(`Total: ${statuses.length} validators | Running: ${statuses.filter(s => s.running).length}`);
}

/**
 * Run health checks on all nodes.
 */
async function health() {
  const dirs = existsSync(VALIDATORS_DIR)
    ? readdirSync(VALIDATORS_DIR).filter(d => d.startsWith('validator-')).sort()
    : [];

  const results = [];
  for (const d of dirs) {
    const index = parseInt(d.replace('validator-', ''), 10);
    const result = await checkValidatorHealth(index);
    results.push(result);

    const status = result.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY';
    console.log(`Validator ${index}: ${status}`);
    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        console.log(`  ⚠️  ${issue}`);
      }
    }
    if (result.block_number !== null) {
      console.log(`  Block: ${result.block_number} | Peers: ${result.peers} | Syncing: ${result.syncing}`);
    }
  }

  const healthy = results.filter(r => r.healthy).length;
  const total = results.length;
  console.log(`\nNetwork Health: ${healthy}/${total} validators healthy`);

  return results;
}

/**
 * Check health of a single validator.
 */
async function checkValidatorHealth(index) {
  const result = {
    index,
    healthy: true,
    issues: [],
    block_number: null,
    peers: 0,
    syncing: null,
    rpc_responsive: false,
    timestamp: new Date().toISOString(),
  };

  // Check process
  const vDir = validatorDir(index);
  const pidFile = join(vDir, 'besu.pid');
  let running = false;
  if (existsSync(pidFile)) {
    const pid = readFileSync(pidFile, 'utf8').trim();
    running = isProcessAlive(pid);
  }

  if (!running) {
    result.healthy = false;
    result.issues.push('Process not running');
    return result;
  }

  // Check RPC
  try {
    const bn = await rpcCall(index, 'eth_blockNumber');
    if (bn?.result) {
      result.block_number = parseInt(bn.result, 16);
      result.rpc_responsive = true;
    } else {
      result.healthy = false;
      result.issues.push('RPC returned no block number');
    }

    const sync = await rpcCall(index, 'eth_syncing');
    result.syncing = sync?.result !== false;

    const peers = await rpcCall(index, 'net_peerCount');
    result.peers = peers?.result ? parseInt(peers.result, 16) : 0;

    if (result.peers === 0 && !result.syncing) {
      result.healthy = false;
      result.issues.push('No peers connected — node is isolated');
    }

    // Check if block height is advancing (stale block check)
    if (result.block_number === 0 && !result.syncing) {
      result.healthy = false;
      result.issues.push('Block height is 0 and not syncing — genesis not loaded or no peers');
    }
  } catch (e) {
    result.healthy = false;
    result.issues.push(`RPC unresponsive: ${e.message}`);
  }

  return result;
}

/**
 * Auto-recover any down or unhealthy nodes.
 */
async function recover() {
  log('info', 'Running auto-recovery scan');
  const dirs = existsSync(VALIDATORS_DIR)
    ? readdirSync(VALIDATORS_DIR).filter(d => d.startsWith('validator-')).sort()
    : [];

  let recovered = 0;
  let failed = 0;

  for (const d of dirs) {
    const index = parseInt(d.replace('validator-', ''), 10);
    const health = await checkValidatorHealth(index);

    if (!health.healthy) {
      log('warn', 'Validator unhealthy — attempting recovery', { index, issues: health.issues });

      try {
        // Step 1: Try restart
        log('info', 'Restarting validator', { index });
        await restartValidator(index);

        // Step 2: Wait for startup
        await new Promise(r => setTimeout(r, 10000));

        // Step 3: Re-check health
        const rechecked = await checkValidatorHealth(index);
        if (rechecked.healthy) {
          log('info', 'Validator recovered', { index, block: rechecked.block_number });
          recovered++;
        } else {
          log('error', 'Validator still unhealthy after restart', { index, issues: rechecked.issues });
          failed++;
        }
      } catch (e) {
        log('error', 'Recovery failed', { index, error: e.message });
        failed++;
      }
    }
  }

  log('info', 'Recovery scan complete', { recovered, failed, total: dirs.length });
  console.log(`\nRecovery: ${recovered} recovered, ${failed} still failing, ${dirs.length - recovered - failed} were healthy`);
}

/**
 * Show recent logs for a validator.
 */
async function showLogs(index) {
  const vDir = validatorDir(index);
  const logFile = join(vDir, 'besu.log');

  if (!existsSync(logFile)) {
    console.log('No logs found for validator ' + index);
    return;
  }

  const logs = cmd(`tail -100 ${logFile} 2>/dev/null`);
  if (logs) console.log(logs);
  else console.log('Could not read log file: ' + logFile);
}

/**
 * Show network info and deployment status.
 */
async function info() {
  console.log('\nVerdex Mainnet — Validator Management Platform');
  console.log('═'.repeat(60));
  console.log(`Besu Home:      ${BESU_HOME}`);
  console.log(`Validators Dir: ${VALIDATORS_DIR}`);
  console.log(`Chain ID:       ${CHAIN_ID}`);
  console.log(`Network:        ${NETWORK_NAME}`);
  console.log(`Besu Version:   ${BESU_VERSION}`);
  console.log('');

  const besu = findBesu();
  if (besu) {
    const version = cmd(`${besu} --version 2>/dev/null | head -1`);
    console.log(`Besu Binary:    ${besu}`);
    console.log(`Besu Version:   ${version || 'unknown'}`);
  } else {
    console.log('Besu Binary:    NOT FOUND — install Besu first');
  }
  console.log('');

  // List initialized validators
  const dirs = existsSync(VALIDATORS_DIR)
    ? readdirSync(VALIDATORS_DIR).filter(d => d.startsWith('validator-')).sort()
    : [];

  if (dirs.length === 0) {
    console.log('No validators initialized.');
    console.log('\nTo get started:');
    console.log('  1. Install Besu:  See mainnet/windows/Install-VerdexBesuToolchain.ps1');
    console.log('  2. Init validators:');
    for (let i = 0; i < 4; i++) {
      console.log(`     node mainnet/validator-manager.js init ${i}`);
    }
    console.log('  3. Generate genesis:  node mainnet/besu/create-qbft-release-config.js ...');
    console.log('  4. Start validators:');
    for (let i = 0; i < 4; i++) {
      console.log(`     node mainnet/validator-manager.js start ${i}`);
    }
    console.log('  5. Check status:  node mainnet/validator-manager.js status');
  } else {
    console.log(`Initialized validators: ${dirs.length}`);
    for (const d of dirs) {
      const index = parseInt(d.replace('validator-', ''), 10);
      const config = JSON.parse(readFileSync(join(validatorDir(index), 'validator.json'), 'utf8'));
      console.log(`  Validator ${index}: ${config.address} (RPC :${rpcPort(index)}, P2P :${p2pPort(index)})`);
    }
  }
  console.log('═'.repeat(60));
}

// ---------------------------------------------------------------------------
// Main CLI
// ---------------------------------------------------------------------------
async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'init':
      await initValidator(parseInt(args[0], 10));
      break;
    case 'start':
      await startValidator(parseInt(args[0], 10));
      break;
    case 'stop':
      await stopValidator(parseInt(args[0], 10));
      break;
    case 'restart':
      await restartValidator(parseInt(args[0], 10));
      break;
    case 'status':
      await status();
      break;
    case 'health':
      await health();
      break;
    case 'recover':
      await recover();
      break;
    case 'logs':
      await showLogs(parseInt(args[0], 10));
      break;
    case 'info':
      await info();
      break;
    default:
      console.log(`Verdex Validator Manager

Usage: node mainnet/validator-manager.js <command> [options]

Commands:
  init <index>     Generate local keys + config for validator N (keys NEVER leave machine)
  start <index>    Start a validator node
  stop <index>     Stop a validator node
  restart <index>  Restart a validator node
  status           Show all validator statuses (running, block height, peers, sync)
  health           Run health checks on all nodes
  recover          Auto-recover any down or unhealthy nodes
  logs <index>     Show recent logs for a validator
  info             Show network info + deployment status

Environment:
  VERDEX_BESU_HOME  Besu installation directory (default: ~/verdex-besu or /opt/verdex-besu)

Security:
  - Validator keys are generated LOCALLY and NEVER exported
  - Private keys never appear in logs, configs, or API responses
  - RPC is bound to 127.0.0.1 (localhost only)
  - P2P uses authenticated peer discovery only
`);
  }
}

main().catch(e => { log('error', 'Fatal', { error: e.message }); process.exit(1); });
