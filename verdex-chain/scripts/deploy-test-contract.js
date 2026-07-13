const http = require('http');
const crypto = require('../src/crypto');
const { Transaction } = require('../src/transaction');

const VALIDATOR_PRIVATE_KEY = '95a82e7b579128f73111f1853d9e52c8032fa65a25b3e21e64906f0e4b854a8a';
const senderAddress = crypto.privateKeyToAddress(VALIDATOR_PRIVATE_KEY);
const rpcUrl = 'http://127.0.0.1:8545';

const contractCode = `
class Contract {
  init() {
    this.storage.owner = msg.sender;
    this.storage.count = 0;
    this.storage.messages = [];
  }
  increment() {
    this.storage.count = (this.storage.count || 0) + 1;
    this.console.log("Counter incremented to: " + this.storage.count);
    return this.storage.count;
  }
  postMessage(text) {
    if (!text) throw new Error("Message cannot be empty");
    const msgObj = {
      sender: msg.sender,
      text: text,
      timestamp: Date.now()
    };
    this.storage.messages.push(msgObj);
    this.console.log("Message posted by: " + msg.sender);
    return this.storage.messages.length;
  }
  getMessages() {
    return this.storage.messages || [];
  }
  getCount() {
    return this.storage.count || 0;
  }
}
`;

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
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
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log(`[Deploy Script] Deployer address: ${senderAddress}`);
  
  try {
    // 1. Fetch nonce
    const nonceData = await get(`${rpcUrl}/api/account/${senderAddress}/nonce`);
    if (!nonceData.success) throw new Error('Failed to fetch nonce');
    const nonce = nonceData.data.nonce;
    console.log(`[Deploy Script] Current nonce: ${nonce}`);

    // 2. Construct Deploy Transaction
    const tx = new Transaction({
      from: senderAddress,
      to: '',
      value: '0',
      nonce: nonce,
      data: contractCode,
      gasLimit: 1000000
    });

    // 3. Sign Transaction
    tx.sign(VALIDATOR_PRIVATE_KEY);
    console.log(`[Deploy Script] Transaction signed: ${tx.getHash()}`);

    // 4. Send Transaction to RPC
    const sendResult = await post(`${rpcUrl}/api/tx/send`, tx.toJSON());
    if (!sendResult.success) throw new Error(sendResult.error);
    console.log(`[Deploy Script] Transaction broadcast success! Hash: ${sendResult.data.txHash}`);

    // 5. Wait for block mining
    console.log(`[Deploy Script] Waiting 6 seconds for transaction block confirmation...`);
    await new Promise(r => setTimeout(r, 6000));

    // 6. Get transaction details to extract contractAddress
    const txDetails = await get(`${rpcUrl}/api/tx/${sendResult.data.txHash}`);
    if (!txDetails.success) throw new Error('Transaction details fetch failed');
    
    const contractAddress = txDetails.data.contractAddress;
    console.log(`\n🎉 Smart Contract deployed successfully!`);
    console.log(`   Address: ${contractAddress}\n`);
    
  } catch (err) {
    console.error(`[Deploy Script] Deployment failed: ${err.message}`);
    console.log(`Make sure your local RPC node is running: npm run dev (or scripts/start-node.js)`);
  }
}

main();
