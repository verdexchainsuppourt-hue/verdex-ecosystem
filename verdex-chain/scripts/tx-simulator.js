const http = require('http');
const crypto = require('../src/crypto');
const { Transaction } = require('../src/transaction');

const VALIDATOR_PRIVATE_KEY = '95a82e7b579128f73111f1853d9e52c8032fa65a25b3e21e64906f0e4b854a8a';
const validatorAddress = crypto.privateKeyToAddress(VALIDATOR_PRIVATE_KEY);
const rpcUrl = 'http://127.0.0.1:8545';

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) { reject(new Error('Invalid JSON: ' + data)); }
      });
    }).on('error', reject);
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) { resolve({ success: false, error: 'Invalid JSON: ' + data }); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('====================================================');
  console.log('      VERDEX TRANSACTION TRAFFIC SIMULATOR          ');
  console.log('====================================================');
  console.log(`Validator Address: ${validatorAddress}`);
  console.log(`Connecting to local RPC node at ${rpcUrl}...`);

  // 1. Generate two testing wallets
  const walletAPriv = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
  const walletBPriv = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';
  
  const addressA = crypto.privateKeyToAddress(walletAPriv);
  const addressB = crypto.privateKeyToAddress(walletBPriv);

  console.log(`Wallet A derived: ${addressA}`);
  console.log(`Wallet B derived: ${addressB}`);

  // Check if RPC node is responsive
  try {
    const stats = await get(`${rpcUrl}/api/stats`);
    if (!stats.success) throw new Error('API request failed');
    console.log(`[Simulator] Connected! Current block height: ${stats.data.height}`);
  } catch (err) {
    console.error(`\n❌ ERROR: Cannot connect to L1 Blockchain RPC node at ${rpcUrl}!`);
    console.error('Make sure your local node is running (`npm run dev` in verdex-chain).');
    process.exit(1);
  }

  // 2. Fund Wallet A and Wallet B from Validator
  console.log('\n[Simulator] Funding Wallet A and Wallet B from Validator balance...');
  
  // Get validator nonce
  let nonceVal = (await get(`${rpcUrl}/api/account/${validatorAddress}/nonce`)).data.nonce;

  // Send 10 VDX to Wallet A
  const fundTxA = new Transaction({
    from: validatorAddress,
    to: addressA,
    value: '10000000000000000000', // 10 VDX (18 decimals)
    nonce: nonceVal++,
    gasLimit: 21000
  });
  fundTxA.sign(VALIDATOR_PRIVATE_KEY);
  let resA = await post(`${rpcUrl}/api/tx/send`, fundTxA.toJSON());
  if (resA.success) console.log(`Fund Wallet A Success! Hash: ${resA.data.txHash}`);
  else console.error(`Fund Wallet A Failed: ${resA.error}`);

  // Send 10 VDX to Wallet B
  const fundTxB = new Transaction({
    from: validatorAddress,
    to: addressB,
    value: '10000000000000000000', // 10 VDX
    nonce: nonceVal++,
    gasLimit: 21000
  });
  fundTxB.sign(VALIDATOR_PRIVATE_KEY);
  let resB = await post(`${rpcUrl}/api/tx/send`, fundTxB.toJSON());
  if (resB.success) console.log(`Fund Wallet B Success! Hash: ${resB.data.txHash}`);
  else console.error(`Fund Wallet B Failed: ${resB.error}`);

  console.log('Waiting 6 seconds for funding confirmations...');
  await sleep(6000);

  // 3. Start simulated infinite traffic loop between A and B
  console.log('\n🚀 [Simulator] Starting transaction generation loop. Press Ctrl+C to stop.');
  let iteration = 1;
  while (true) {
    try {
      // Toggle send direction
      const fromPriv = iteration % 2 === 1 ? walletAPriv : walletBPriv;
      const fromAddr = iteration % 2 === 1 ? addressA : addressB;
      const toAddr = iteration % 2 === 1 ? addressB : addressA;
      const amtStr = '100000000000000000'; // 0.1 VDX
      
      const nonce = (await get(`${rpcUrl}/api/account/${fromAddr}/nonce`)).data.nonce;
      
      const tx = new Transaction({
        from: fromAddr,
        to: toAddr,
        value: amtStr,
        nonce: nonce,
        gasLimit: 21000
      });
      tx.sign(fromPriv);
      
      console.log(`[Simulator #${iteration}] Sending 0.1 VDX from ${fromAddr.slice(0,8)}... to ${toAddr.slice(0,8)}...`);
      const sendRes = await post(`${rpcUrl}/api/tx/send`, tx.toJSON());
      if (sendRes.success) {
        console.log(`   ✅ Success! Tx Hash: ${sendRes.data.txHash}`);
      } else {
        console.warn(`   ❌ Failed: ${sendRes.error}`);
      }

      iteration++;
      // Sleep for a random block simulation duration (e.g. 5 to 7 seconds)
      const waitTime = 5000 + Math.floor(Math.random() * 2000);
      await sleep(waitTime);
    } catch (e) {
      console.error(`[Simulator Error] Loop error: ${e.message}`);
      await sleep(5000);
    }
  }
}

main();
