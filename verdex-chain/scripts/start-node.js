const fs = require('fs');
const path = require('path');
const crypto = require('../src/crypto');

// Fixed validator private key for testnet
const VALIDATOR_PRIVATE_KEY = '95a82e7b579128f73111f1853d9e52c8032fa65a25b3e21e64906f0e4b854a8a';
const validatorAddress = crypto.privateKeyToAddress(VALIDATOR_PRIVATE_KEY);

console.log(`[Testnet Init] Validator Address: ${validatorAddress}`);
console.log(`[Testnet Init] Private Key: ${VALIDATOR_PRIVATE_KEY}`);

// Update config.js GENESIS_VALIDATORS
const configPath = path.join(__dirname, '..', 'src', 'config.js');
let configContent = fs.readFileSync(configPath, 'utf8');

// Replace GENESIS_VALIDATORS array content with our active validator address
const genesisValidatorsRegex = /GENESIS_VALIDATORS:\s*\[[\s\S]*?\]/;
const replacement = `GENESIS_VALIDATORS: [
    '${validatorAddress}'
  ]`;

configContent = configContent.replace(genesisValidatorsRegex, replacement);
fs.writeFileSync(configPath, configContent, 'utf8');
console.log(`[Testnet Init] config.js updated with validator address!`);

// Launch the node
const { spawn } = require('child_process');
const mainPath = path.join(__dirname, '..', 'src', 'main.js');

console.log(`[Testnet Init] Launching node with validator mode...`);
const nodeProcess = spawn('node', [mainPath, 'start', '--validator-key', VALIDATOR_PRIVATE_KEY, '--reset'], {
  stdio: 'inherit'
});

nodeProcess.on('close', (code) => {
  console.log(`Node process exited with code ${code}`);
});
