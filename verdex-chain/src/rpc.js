/**
 * Verdex Chain - RPC Server
 * Full REST API + WebSocket for real-time events.
 * Includes: block range, search, stats, gas estimation, receipts, mempool, validators.
 */

const express = require('express');
const crypto = require('./crypto');
const { Transaction } = require('./transaction');
const config = require('./config');

class RPCServer {
  constructor(blockchain, p2p, port) {
    this.blockchain = blockchain;
    this.p2p = p2p;
    this.port = port || 8545;
    this.app = express();
    this.server = null;
    this.wsClients = new Set();
    this._setupRoutes();
  }

  _setupRoutes() {
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // Root Welcome Page (so the RPC URL doesn't show "Cannot GET /")
    this.app.get('/', (req, res) => {
      res.send(`
        <html>
          <head>
            <title>Verdex PRC20 Testnet RPC</title>
            <style>
              body { background-color: #0d1117; color: #c9d1d9; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; text-align: center; padding-top: 100px; }
              h1 { color: #58a6ff; }
              .box { border: 1px solid #30363d; padding: 40px; border-radius: 10px; display: inline-block; background-color: #161b22; }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>🚀 Verdex PRC20 Testnet RPC is Live</h1>
              <p>Chain ID: <b>7201</b></p>
              <p>Network: <b>Verdex Testnet</b></p>
              <p>Symbol: <b>VDX</b></p>
              <p>To use this network, add <b>https://verdex-ecosystem-production.up.railway.app/rpc</b> to MetaMask.</p>
            </div>
          </body>
        </html>
      `);
    });

    // ══════════════════════════════════════════════════════════════════════
    // CHAIN INFO
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/chain/info', async (req, res) => {
      try {
        const info = await this.blockchain.getInfo();
        res.json({ success: true, data: info });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/chain/height', async (req, res) => {
      try {
        const info = await this.blockchain.getInfo();
        res.json({ success: true, data: { height: info.height } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // NETWORK STATS
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/stats', async (req, res) => {
      try {
        const stats = await this.blockchain.getNetworkStats();
        stats.peers = this.p2p ? this.p2p.getPeerCount() : 0;
        stats.wsClients = this.wsClients.size;
        res.json({ success: true, data: stats });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // BLOCKS
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/block/latest', async (req, res) => {
      try {
        const block = await this.blockchain.getLatestBlock();
        if (!block) return res.status(404).json({ success: false, error: 'No blocks' });
        res.json({ success: true, data: block.toJSON() });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/block/:height', async (req, res) => {
      try {
        const height = parseInt(req.params.height);
        const block = await this.blockchain.getBlock(height);
        if (!block) return res.status(404).json({ success: false, error: 'Block not found' });
        res.json({ success: true, data: block.toJSON() });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Paginated block list
    this.app.get('/api/blocks', async (req, res) => {
      try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const latest = await this.blockchain.getLatestBlock();
        if (!latest) return res.json({ success: true, data: { blocks: [], total: 0, page, limit } });

        const totalHeight = latest.header.height;
        const from = Math.max(0, totalHeight - (page * limit) + 1);
        const to = Math.max(0, totalHeight - ((page - 1) * limit));

        const blocks = await this.blockchain.getBlockRange(from, to);
        blocks.reverse(); // Newest first

        res.json({
          success: true,
          data: {
            blocks: blocks.map(b => b.toJSON()),
            total: totalHeight + 1,
            page,
            limit,
            totalPages: Math.ceil((totalHeight + 1) / limit)
          }
        });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Recent blocks
    this.app.get('/api/blocks/recent/:count', async (req, res) => {
      try {
        const count = Math.min(50, parseInt(req.params.count) || 10);
        const blocks = await this.blockchain.getRecentBlocks(count);
        res.json({ success: true, data: blocks.map(b => b.toJSON()).reverse() });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Block range
    this.app.get('/api/blocks/:from/:to', async (req, res) => {
      try {
        const from = parseInt(req.params.from);
        const to = parseInt(req.params.to);
        const blocks = await this.blockchain.getBlockRange(from, to);
        res.json({ success: true, data: blocks.map(b => b.toJSON()) });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // TRANSACTIONS
    // ══════════════════════════════════════════════════════════════════════

    this.app.post('/api/tx/send', async (req, res) => {
      try {
        const { type, from, to, value, nonce, gasPrice, gasLimit, maxFeePerGas, maxPriorityFeePerGas, data, signature, v, r, s } = req.body;
        const tx = new Transaction({
          type: type || config.TX_TYPES.LEGACY,
          from, to,
          value: (value || '0').toString(),
          nonce,
          gasPrice: gasPrice || undefined,
          gasLimit: gasLimit || undefined,
          maxFeePerGas: maxFeePerGas || null,
          maxPriorityFeePerGas: maxPriorityFeePerGas || null,
          data: data || '',
          signature: signature || null,
          v: v || null, r: r || null, s: s || null
        });
        const txHash = await this.blockchain.sendTransaction(tx);
        if (this.p2p) {
          this.p2p.broadcastTransaction(tx);
        }
        // Broadcast to WS clients
        this._broadcastWS({ type: 'new_transaction', data: tx.toJSON() });
        res.json({ success: true, data: { txHash } });
      } catch (err) {
        res.status(400).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/tx/:hash', async (req, res) => {
      try {
        const tx = await this.blockchain.getTransaction(req.params.hash);
        if (!tx) return res.status(404).json({ success: false, error: 'Transaction not found' });
        res.json({ success: true, data: tx });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Transaction receipt
    this.app.get('/api/tx/:hash/receipt', async (req, res) => {
      try {
        const receipt = await this.blockchain.getReceipt(req.params.hash);
        if (!receipt) return res.status(404).json({ success: false, error: 'Receipt not found' });
        res.json({ success: true, data: receipt });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // ACCOUNTS
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/account/:address/balance', async (req, res) => {
      try {
        if (!crypto.isValidAddress(req.params.address)) {
          return res.status(400).json({ success: false, error: 'Invalid address' });
        }
        const balance = await this.blockchain.getBalance(req.params.address);
        res.json({ success: true, data: { address: req.params.address, balance } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/account/:address/transactions', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 20;
        const txs = await this.blockchain.getTransactionsByAddress(req.params.address, limit);
        res.json({ success: true, data: txs });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/account/:address/nonce', async (req, res) => {
      try {
        const account = await this.blockchain.getAccount(req.params.address);
        res.json({ success: true, data: { nonce: account ? account.nonce : 0 } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/account/:address', async (req, res) => {
      try {
        const account = await this.blockchain.getAccount(req.params.address);
        if (!account) {
          return res.json({ success: true, data: { address: req.params.address, balance: '0', nonce: 0, isContract: false } });
        }
        res.json({
          success: true,
          data: {
            address: req.params.address,
            balance: account.balance,
            nonce: account.nonce,
            isContract: account.isContract || false,
            code: account.code || '',
            storage: account.storage || {},
            createdAt: account.createdAt
          }
        });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // GAS ESTIMATION
    // ══════════════════════════════════════════════════════════════════════

    this.app.post('/api/gas/estimate', async (req, res) => {
      try {
        const gas = await this.blockchain.estimateGas(req.body);
        const latest = await this.blockchain.getLatestBlock();
        const baseFee = latest ? latest.header.baseFeePerGas : config.BASE_FEE;
        const suggestedPriority = config.MAX_PRIORITY_FEE;
        const maxFee = (BigInt(baseFee) * 2n + BigInt(suggestedPriority)).toString();

        res.json({
          success: true,
          data: {
            estimatedGas: gas,
            baseFeePerGas: baseFee,
            suggestedMaxPriorityFeePerGas: suggestedPriority,
            suggestedMaxFeePerGas: maxFee,
            estimatedCost: (BigInt(maxFee) * BigInt(gas)).toString()
          }
        });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/gas/price', async (req, res) => {
      try {
        const latest = await this.blockchain.getLatestBlock();
        const baseFee = latest ? latest.header.baseFeePerGas : config.BASE_FEE;
        res.json({
          success: true,
          data: {
            baseFeePerGas: baseFee,
            suggestedPriorityFee: config.MAX_PRIORITY_FEE,
            slow: baseFee,
            standard: (BigInt(baseFee) + BigInt(config.MAX_PRIORITY_FEE) / 2n).toString(),
            fast: (BigInt(baseFee) + BigInt(config.MAX_PRIORITY_FEE)).toString(),
            rapid: (BigInt(baseFee) * 2n + BigInt(config.MAX_PRIORITY_FEE)).toString()
          }
        });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // SEARCH
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/search', async (req, res) => {
      try {
        const query = (req.query.q || '').trim();
        if (!query) return res.status(400).json({ success: false, error: 'Query required' });
        const results = await this.blockchain.search(query);
        res.json({ success: true, data: results });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // VALIDATORS
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/validators', async (req, res) => {
      try {
        const validators = [...this.blockchain.consensus.validators.entries()].map(([addr, v]) => ({
          address: addr,
          isActive: v.isActive,
          stake: v.stake
        }));
        res.json({ success: true, data: validators });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/validators/detailed', async (req, res) => {
      try {
        const details = this.blockchain.consensus.getValidatorDetails();
        res.json({ success: true, data: details });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/epoch', async (req, res) => {
      try {
        const latest = await this.blockchain.getLatestBlock();
        const height = latest ? latest.header.height : 0;
        const epochInfo = this.blockchain.consensus.getEpochProgress(height);
        const finality = this.blockchain.consensus.getFinalityInfo(height);
        res.json({ success: true, data: { ...epochInfo, ...finality } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // MEMPOOL
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/txpool', async (req, res) => {
      try {
        const stats = this.blockchain.txPool.getStats();
        const txs = this.blockchain.txPool.toJSON();
        res.json({ success: true, data: { ...stats, transactions: txs.slice(0, 100) } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.get('/api/mempool/pending', async (req, res) => {
      try {
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const txs = this.blockchain.txPool.getPendingTransactions(limit);
        res.json({
          success: true,
          data: {
            count: this.blockchain.txPool.getCount(),
            transactions: txs.map(tx => tx.toJSON())
          }
        });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // NETWORK
    // ══════════════════════════════════════════════════════════════════════

    this.app.get('/api/network/peers', async (req, res) => {
      try {
        res.json({ success: true, data: { count: this.p2p ? this.p2p.getPeerCount() : 0 } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // FAUCET
    // ══════════════════════════════════════════════════════════════════════

    this.app.post('/api/faucet/claim', async (req, res) => {
      try {
        const { address, amount } = req.body;
        if (!address || !crypto.isValidAddress(address)) {
          return res.status(400).json({ success: false, error: 'Invalid recipient address' });
        }
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const VALIDATOR_PRIVATE_KEY = '95a82e7b579128f73111f1853d9e52c8032fa65a25b3e21e64906f0e4b854a8a';
        const sender = crypto.privateKeyToAddress(VALIDATOR_PRIVATE_KEY);
        const nonce = this.blockchain.state.getNonce(sender);

        const amountWei = (BigInt(Math.floor(parseFloat(amount) * 1000000)) * BigInt(10 ** 12)).toString();

        const tx = new Transaction({
          type: config.TX_TYPES.SYSTEM,
          from: sender,
          to: address,
          value: amountWei,
          nonce: nonce,
          gasPrice: '1000000000',
          gasLimit: 21000,
          data: ''
        });

        tx.sign(VALIDATOR_PRIVATE_KEY);
        const txHash = await this.blockchain.sendTransaction(tx);
        res.json({ success: true, data: { txHash, amount: amountWei } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    this.app.post('/api/faucet/claim-token', async (req, res) => {
      try {
        const { address, amount, contractAddress } = req.body;
        if (!address || !crypto.isValidAddress(address)) {
          return res.status(400).json({ success: false, error: 'Invalid recipient address' });
        }
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        if (!contractAddress || !crypto.isValidAddress(contractAddress)) {
          return res.status(400).json({ success: false, error: 'Invalid token contract address' });
        }

        const VALIDATOR_PRIVATE_KEY = '95a82e7b579128f73111f1853d9e52c8032fa65a25b3e21e64906f0e4b854a8a';
        const sender = crypto.privateKeyToAddress(VALIDATOR_PRIVATE_KEY);
        const nonce = this.blockchain.state.getNonce(sender);

        const amountWei = (BigInt(Math.floor(parseFloat(amount) * 1000000)) * BigInt(10 ** 12)).toString();

        const tx = new Transaction({
          type: config.TX_TYPES.CONTRACT,
          from: sender,
          to: contractAddress,
          value: '0',
          nonce: nonce,
          gasPrice: '1000000000',
          gasLimit: 300000,
          data: JSON.stringify({ method: 'transfer', args: [address, amountWei] })
        });

        tx.sign(VALIDATOR_PRIVATE_KEY);
        const txHash = await this.blockchain.sendTransaction(tx);
        res.json({ success: true, data: { txHash } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // JSON-RPC COMPATIBLE
    // ══════════════════════════════════════════════════════════════════════

    this.app.post('/rpc', async (req, res) => {
      try {
        const { jsonrpc, method, params, id } = req.body;
        let result;

        switch (method) {
          case 'eth_blockNumber': {
            const info = await this.blockchain.getInfo();
            result = '0x' + info.height.toString(16);
            break;
          }
          case 'eth_getBalance':
            result = await this.blockchain.getBalance(params[0]);
            break;
          case 'eth_gasPrice': {
            const latest = await this.blockchain.getLatestBlock();
            result = latest ? latest.header.baseFeePerGas : config.BASE_FEE;
            break;
          }
          case 'eth_getTransactionReceipt':
            result = await this.blockchain.getReceipt(params[0]);
            break;
          case 'eth_getTransactionByHash':
            result = await this.blockchain.getTransaction(params[0]);
            break;
          case 'eth_getBlockByNumber': {
            const height = parseInt(params[0], 16);
            const block = await this.blockchain.getBlock(height);
            result = block ? block.toJSON() : null;
            break;
          }
          case 'eth_sendRawTransaction':
            result = '0x' + crypto.sha256(params[0]);
            break;
          case 'eth_estimateGas':
            result = await this.blockchain.estimateGas(params[0] || {});
            break;
          case 'eth_chainId':
            result = '0x1C21'; // 7201 in hex for MetaMask compatibility
            break;
          case 'net_version':
            result = '7201';
            break;
          case 'web3_clientVersion':
            result = 'Verdex/v3.0.0';
            break;
          case 'eth_getTransactionCount': {
            const account = await this.blockchain.getAccount(params[0]);
            result = '0x' + (account ? account.nonce : 0).toString(16);
            break;
          }
          case 'eth_call': {
            // Read-only contract call
            const callTx = params[0] || {};
            const callAcc = callTx.to ? await this.blockchain.getAccount(callTx.to) : null;
            if (callAcc && callAcc.isContract) {
              const ContractVM = require('./vm');
              const vm = new ContractVM();
              let methodName = callTx.data || 'fallback';
              let args = [];
              try { const p = JSON.parse(callTx.data); if (p.method) { methodName = p.method; args = p.args || []; } } catch {}
              const callRes = vm.execute(callAcc.code, methodName, args, { sender: callTx.from || '0x' + '0'.repeat(40), value: '0', balance: callAcc.balance, storage: callAcc.storage });
              result = callRes.success ? JSON.stringify(callRes.result) : '0x';
            } else {
              result = '0x';
            }
            break;
          }
          // ── Verdex Custom JSON-RPC Methods ─────────────────────────────
          case 'verdex_getValidators':
          case 'verdix_getValidators': {
            const vMap = this.blockchain.consensus.validators;
            result = [...vMap.entries()].map(([addr, v]) => ({
              address: addr,
              isActive: v.isActive,
              stake: v.stake,
              publicKey: v.publicKey || '',
              blocksProposed: v.blocksProposed || 0,
              lastSeen: v.lastSeen || null
            }));
            break;
          }
          case 'verdex_getStakingInfo':
          case 'verdix_getStakingInfo': {
            const latestBlk = await this.blockchain.getLatestBlock();
            result = {
              minStake: config.MIN_STAKE,
              validatorReward: config.VALIDATOR_REWARD,
              miningReward: config.MINING_REWARD,
              totalValidators: this.blockchain.consensus.validators.size,
              activeValidators: [...this.blockchain.consensus.validators.values()].filter(v => v.isActive).length,
              epochLength: config.EPOCH_LENGTH,
              currentEpoch: this.blockchain.consensus.getCurrentEpoch(),
              finalityDepth: config.FINALITY_DEPTH,
              finalizedHeight: this.blockchain.consensus.finalizedHeight,
              slashDoubleSignRate: config.SLASH_DOUBLE_SIGN_RATE,
              slashDowntimeRate: config.SLASH_DOWNTIME_RATE,
              jailBlocks: config.JAIL_BLOCKS,
              blockTime: config.BLOCK_TIME,
              baseFee: latestBlk ? latestBlk.header.baseFeePerGas : config.BASE_FEE
            };
            break;
          }
          case 'verdex_getPoolInfo':
          case 'verdix_getPoolInfo': {
            result = {
              pools: [],
              totalPairs: 0,
              totalTVL: '0',
              volume24h: '0',
              note: 'Phase 4 DEX deferred. PRC20 tokens available; swap coming soon.'
            };
            break;
          }
          case 'verdex_getFarmInfo':
          case 'verdix_getFarmInfo': {
            const now = Date.now();
            const genesis = new Date(config.GENESIS_TIMESTAMP).getTime();
            const weeksElapsed = Math.floor((now - genesis) / (7 * 24 * 60 * 60 * 1000));
            const quartersElapsed = Math.floor(weeksElapsed / 13);
            const weeklyEmission = Math.floor(5000000 * Math.pow(0.9, quartersElapsed));
            result = {
              farms: [],
              totalPools: 0,
              weeklyEmission: weeklyEmission.toString(),
              weeklyEmissionDecay: '10% per quarter',
              currentQuarter: quartersElapsed + 1,
              startingEmission: '5000000',
              rewardToken: 'VDX',
              note: 'Farm deferred until after Phase 4 AMM.'
            };
            break;
          }
          case 'verdex_getChainInfo':
          case 'verdix_getChainInfo': {
            const info = await this.blockchain.getInfo();
            result = {
              ...info,
              chainId: config.CHAIN_ID,
              chainIdNumeric: config.CHAIN_ID,
              chainIdHex: config.CHAIN_ID_HEX,
              rpcUrl: config.RPC_URL,
              explorerUrl: config.EXPLORER_URL,
              faucetUrl: config.FAUCET_URL,
              docsUrl: config.DOCS_URL,
              symbol: config.SYMBOL,
              decimals: config.DECIMALS,
              networkName: config.CHAIN_NAME
            };
            break;
          }
          case 'verdex_getNetworkStats':
          case 'verdix_getNetworkStats': {
            const stats = await this.blockchain.getNetworkStats();
            result = stats;
            break;
          }
          default:
            result = null;
        }

        res.json({ jsonrpc: jsonrpc || '2.0', id, result });
      } catch (err) {
        res.json({ jsonrpc: '2.0', id: req.body.id, error: { code: -32000, message: err.message } });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // CONTRACTS
    // ══════════════════════════════════════════════════════════════════════

    this.app.post('/api/contract/call', async (req, res) => {
      try {
        const { contractAddress, method, args, sender } = req.body;
        const acc = this.blockchain.state.getAccount(contractAddress);
        if (!acc) return res.status(404).json({ success: false, error: 'Contract not found' });
        if (!acc.isContract) return res.status(400).json({ success: false, error: 'Target account is not a contract' });

        const ContractVM = require('./vm');
        const vm = new ContractVM();
        const callResult = vm.execute(acc.code, method, args || [], {
          sender: sender || '0x' + '0'.repeat(40),
          value: '0',
          balance: acc.balance,
          storage: acc.storage
        });

        if (!callResult.success) {
          return res.status(400).json({ success: false, error: callResult.error, logs: callResult.logs });
        }

        res.json({ success: true, data: { result: callResult.result, logs: callResult.logs } });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // STATIC FILES & HEALTH
    // ══════════════════════════════════════════════════════════════════════

    const path = require('path');
    this.app.use('/explorer', express.static(path.join(__dirname, '..', 'explorer')));
    this.app.use('/', express.static(path.join(__dirname, '..', '..')));

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        chain: config.CHAIN_ID,
        version: 'Verdex/v2.0.0',
        peers: this.p2p ? this.p2p.getPeerCount() : 0,
        uptime: process.uptime(),
        wsClients: this.wsClients.size,
        mempool: this.blockchain.txPool.getCount()
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // WEBSOCKET SUPPORT
  // ══════════════════════════════════════════════════════════════════════

  _setupWebSocket() {
    try {
      const WebSocket = require('ws');
      const wss = new WebSocket.Server({ server: this.server, path: '/ws' });

      wss.on('connection', (ws) => {
        this.wsClients.add(ws);
        console.log(`[WS] Client connected (total: ${this.wsClients.size})`);

        ws.send(JSON.stringify({ type: 'connected', data: { chain: config.CHAIN_ID, version: 'v2.0.0' } }));

        ws.on('close', () => {
          this.wsClients.delete(ws);
          console.log(`[WS] Client disconnected (total: ${this.wsClients.size})`);
        });

        ws.on('message', (msg) => {
          try {
            const data = JSON.parse(msg);
            if (data.subscribe === 'blocks' || data.subscribe === 'transactions' || data.subscribe === 'stats') {
              ws._subscriptions = ws._subscriptions || new Set();
              ws._subscriptions.add(data.subscribe);
              ws.send(JSON.stringify({ type: 'subscribed', data: { channel: data.subscribe } }));
            }
          } catch {}
        });

        ws.on('error', () => {
          this.wsClients.delete(ws);
        });
      });

      // Subscribe to blockchain events
      this.blockchain.onBlock((block) => {
        this._broadcastWS({ type: 'new_block', data: block.toJSON() }, 'blocks');
      });

      this.blockchain.onTransaction((tx) => {
        this._broadcastWS({ type: 'new_transaction', data: tx.toJSON() }, 'transactions');
      });

      console.log(`[WS] WebSocket server ready on /ws`);
    } catch (err) {
      console.warn(`[WS] WebSocket not available: ${err.message}`);
    }
  }

  _broadcastWS(message, channel = null) {
    const data = JSON.stringify(message);
    for (const client of this.wsClients) {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          if (channel && client._subscriptions && !client._subscriptions.has(channel)) continue;
          client.send(data);
        }
      } catch {}
    }
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`[RPC] API server running on port ${this.port}`);
        this._setupWebSocket();
        resolve();
      });
    });
  }

  stop() {
    for (const client of this.wsClients) {
      try { client.close(); } catch {}
    }
    this.wsClients.clear();
    if (this.server) this.server.close();
  }
}

module.exports = RPCServer;
