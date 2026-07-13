#!/usr/bin/env node
const crypto = require('./crypto');
const { Transaction } = require('./transaction');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const WALLET_DIR = path.join(__dirname, '..', 'wallets');

if (!fs.existsSync(WALLET_DIR)) {
  fs.mkdirSync(WALLET_DIR, { recursive: true });
}

function generateWallet(name) {
  const keyPair = crypto.generateKeyPair();
  const address = crypto.privateKeyToAddress(keyPair.privateKey);

  const wallet = {
    name: name || 'default',
    address,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    created: new Date().toISOString()
  };

  const filePath = path.join(WALLET_DIR, `${wallet.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(wallet, null, 2));
  console.log(`\n✅ Wallet "${wallet.name}" created!`);
  console.log(`   Address: ${address}`);
  console.log(`   Saved: ${filePath}\n`);
  return wallet;
}

function loadWallet(name) {
  const filePath = path.join(WALLET_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listWallets() {
  const files = fs.readdirSync(WALLET_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('\nNo wallets found. Create one with: node src/wallet.js generate <name>\n');
    return;
  }
  console.log('\n📦 Wallets:');
  files.forEach(f => {
    const wallet = JSON.parse(fs.readFileSync(path.join(WALLET_DIR, f), 'utf8'));
    console.log(`   ${wallet.name.padEnd(15)} ${wallet.address}`);
  });
  console.log();
}

function getBalance(address, rpcUrl) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    http.get(`${rpcUrl}/api/account/${address}/balance`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) resolve(json.data.balance);
          else reject(new Error(json.error));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function sendVDX(fromWalletName, toAddress, amount, rpcUrl) {
  const wallet = loadWallet(fromWalletName);
  const http = require('http');

  // Get current nonce
  const nonce = await new Promise((resolve, reject) => {
    http.get(`${rpcUrl}/api/account/${wallet.address}/nonce`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data.nonce);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });

  const tx = new Transaction({
    from: wallet.address,
    to: toAddress,
    value: amount.toString(),
    nonce: nonce
  });
  tx.sign(wallet.privateKey);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify(tx.toJSON());
    const req = http.request(`${rpcUrl}/api/tx/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) resolve(json.data.txHash);
          else reject(new Error(json.error));
        } catch (e) { reject(e); }
      });
    });
    req.write(body);
    req.end();
  });
}

// CLI handler
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const rpcUrl = process.env.VERDEX_RPC || 'http://127.0.0.1:8545';

  switch (command) {
    case 'generate':
    case 'new':
      generateWallet(args[1]);
      break;
    case 'list':
    case 'ls':
      listWallets();
      break;
    case 'balance':
    case 'bal':
      if (!args[1]) {
        console.log('Usage: node src/wallet.js balance <address|wallet-name>');
        process.exit(1);
      }
      (async () => {
        try {
          let address = args[1];
          if (!address.startsWith('0x')) {
            const wallet = loadWallet(address);
            address = wallet.address;
          }
          const bal = await getBalance(address, rpcUrl);
          const vdx = (BigInt(bal) / BigInt(10 ** config.DECIMALS)).toString();
          console.log(`\n💰 Balance for ${address}: ${vdx} VDX\n`);
        } catch (err) {
          console.error('Error:', err.message);
        }
      })();
      break;
    case 'send':
      if (!args[1] || !args[2] || !args[3]) {
        console.log('Usage: node src/wallet.js send <wallet-name> <to-address> <amount-in-vdx>');
        process.exit(1);
      }
      (async () => {
        try {
          const amount = BigInt(parseFloat(args[3]) * 10 ** config.DECIMALS).toString();
          const txHash = await sendVDX(args[1], args[2], amount, rpcUrl);
          console.log(`\n✅ Transaction sent! Hash: ${txHash}\n`);
        } catch (err) {
          console.error('Error:', err.message);
        }
      })();
      break;
    case 'export':
      if (!args[1]) {
        console.log('Usage: node src/wallet.js export <wallet-name>');
        process.exit(1);
      }
      try {
        const wallet = loadWallet(args[1]);
        console.log(`\n📄 Wallet: ${wallet.name}`);
        console.log(`   Address:    ${wallet.address}`);
        console.log(`   Private Key: ${wallet.privateKey}`);
        console.log(`   Public Key:  ${wallet.publicKey}\n`);
      } catch (err) {
        console.error('Error:', err.message);
      }
      break;
    default:
      console.log(`
Verdex Wallet CLI
Usage:
  node src/wallet.js generate [name]     Create new wallet
  node src/wallet.js list                 List all wallets
  node src/wallet.js balance <addr|name>  Check balance
  node src/wallet.js send <wallet> <to> <amount>  Send VDX
  node src/wallet.js export <name>        Export wallet keys
      `);
  }
}

module.exports = { generateWallet, loadWallet, listWallets, getBalance, sendVDX };
