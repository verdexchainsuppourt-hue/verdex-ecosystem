const http = require('http');
const crypto = require('../src/crypto');
const { Transaction } = require('../src/transaction');

const VALIDATOR_PRIVATE_KEY = '95a82e7b579128f73111f1853d9e52c8032fa65a25b3e21e64906f0e4b854a8a';
const senderAddress = crypto.privateKeyToAddress(VALIDATOR_PRIVATE_KEY);
const rpcUrl = 'http://127.0.0.1:8545';

const prc20ContractCode = `
class Contract {
  init(name, symbol, decimals, totalSupply) {
    this.storage.name = name;
    this.storage.symbol = symbol;
    this.storage.decimals = decimals;
    this.storage.totalSupply = totalSupply;
    this.storage.balances = {};
    this.storage.balances[msg.sender] = totalSupply;
    this.storage.owner = msg.sender;
  }
  transfer(to, amount) {
    if (!to) throw new Error("Invalid recipient");
    const amt = BigInt(amount);
    if (amt <= 0n) throw new Error("Transfer amount must be positive");
    
    const senderBal = BigInt(this.storage.balances[msg.sender] || '0');
    if (senderBal < amt) throw new Error("Insufficient balance");

    this.storage.balances[msg.sender] = (senderBal - amt).toString();
    const recipientBal = BigInt(this.storage.balances[to] || '0');
    this.storage.balances[to] = (recipientBal + amt).toString();
    
    this.console.log("Transferred " + amount + " to " + to);
    return true;
  }
  balanceOf(address) {
    return this.storage.balances[address] || '0';
  }
  getName() { return this.storage.name; }
  getSymbol() { return this.storage.symbol; }
  getTotalSupply() { return this.storage.totalSupply; }
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
  console.log(`[PRC20 Deploy] Deployer address: ${senderAddress}`);
  
  try {
    const nonceData = await get(`${rpcUrl}/api/account/${senderAddress}/nonce`);
    if (!nonceData.success) throw new Error('Failed to fetch nonce');
    const nonce = nonceData.data.nonce;
    console.log(`[PRC20 Deploy] Current nonce: ${nonce}`);

    // Deploy contract with constructor arguments: Name="Verdex Utility Token", Symbol="VDXU", Decimals=18, TotalSupply="10000000000000000000000000" (10 million VDXU)
    const deployArgs = ["Verdex Utility Token", "VDXU", 18, "10000000000000000000000000"];
    const initData = JSON.stringify({ method: 'deploy', args: deployArgs });

    const tx = new Transaction({
      from: senderAddress,
      to: '',
      value: '0',
      nonce: nonce,
      data: prc20ContractCode, // class source goes into data for deployment
      gasLimit: 1500000
    });

    tx.sign(VALIDATOR_PRIVATE_KEY);
    console.log(`[PRC20 Deploy] Transaction signed: ${tx.getHash()}`);

    const sendResult = await post(`${rpcUrl}/api/tx/send`, tx.toJSON());
    if (!sendResult.success) throw new Error(sendResult.error);
    console.log(`[PRC20 Deploy] Transaction broadcast success! Hash: ${sendResult.data.txHash}`);

    console.log(`[PRC20 Deploy] Waiting 6 seconds for block confirmation...`);
    await new Promise(r => setTimeout(r, 6000));

    const txDetails = await get(`${rpcUrl}/api/tx/${sendResult.data.txHash}`);
    if (!txDetails.success) throw new Error('Transaction details fetch failed');
    
    const contractAddress = txDetails.data.contractAddress;
    console.log(`\n🎉 PRC-20 Asset deployed successfully!`);
    console.log(`   Token Name: Verdex Utility Token (VDXU)`);
    console.log(`   Address: ${contractAddress}\n`);
    
  } catch (err) {
    console.error(`[PRC20 Deploy] Deployment failed: ${err.message}`);
  }
}

main();
