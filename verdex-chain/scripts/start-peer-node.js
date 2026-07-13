const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PEER_PORT = 8547;
const PEER_P2P_PORT = 8548;
const PEER_DATA_DIR = path.join(__dirname, '..', 'data-peer');
const SEED_PEER_URL = 'ws://127.0.0.1:8546'; // validator P2P server

// Clean peer data directory if reset is passed
if (process.argv.includes('--reset')) {
  console.log(`[Peer Init] Resetting peer database directory...`);
  if (fs.existsSync(PEER_DATA_DIR)) {
    fs.rmSync(PEER_DATA_DIR, { recursive: true, force: true });
  }
}

if (!fs.existsSync(PEER_DATA_DIR)) {
  fs.mkdirSync(PEER_DATA_DIR, { recursive: true });
}

console.log(`[Peer Init] Starting peer node on RPC port ${PEER_PORT}, P2P port ${PEER_P2P_PORT}...`);
console.log(`[Peer Init] Connecting to main seed peer at ${SEED_PEER_URL}`);

const mainPath = path.join(__dirname, '..', 'src', 'main.js');

const peerProcess = spawn('node', [
  mainPath, 
  'start', 
  '--port', PEER_PORT.toString(), 
  '--p2p-port', PEER_P2P_PORT.toString(), 
  '--data-dir', PEER_DATA_DIR, 
  '--peers', SEED_PEER_URL,
  '--reset'
], {
  stdio: 'inherit'
});

peerProcess.on('close', (code) => {
  console.log(`Peer node process exited with code ${code}`);
});
