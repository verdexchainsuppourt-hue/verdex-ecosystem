const Blockchain = require('./blockchain');
const P2PNetwork = require('./p2p');
const RPCServer = require('./rpc');
const config = require('./config');
const crypto = require('./crypto');
const { program } = require('commander');
const path = require('path');

program
  .name('verdex')
  .description('Verdex Blockchain Node')
  .version('1.0.0');

program
  .command('start')
  .description('Start a blockchain node')
  .option('-p, --port <port>', 'RPC port', config.DEFAULT_PORT)
  .option('--p2p-port <port>', 'P2P port', config.P2P_PORT)
  .option('--peers <urls>', 'Comma-separated peer URLs', '')
  .option('--data-dir <dir>', 'Data directory', config.DATA_DIR)
  .option('--validator-key <key>', 'Validator private key for block proposing')
  .option('--reset', 'Reset chain data', false)
  .action(async (options) => {
    const dataDir = path.resolve(options.dataDir);
    console.log(`[Verdex] Starting node...`);
    console.log(`[Verdex] Chain: ${config.CHAIN_NAME} (${config.CHAIN_ID})`);
    console.log(`[Verdex] Symbol: ${config.SYMBOL}`);
    console.log(`[Verdex] Consensus: ${config.CONSENSUS}`);
    console.log(`[Verdex] Block time: ${config.BLOCK_TIME}ms`);

    // Initialize blockchain
    const blockchain = new Blockchain(dataDir);
    await blockchain.init(options.reset || false);

    // Start P2P network
    const p2p = new P2PNetwork(blockchain, parseInt(options.p2pPort));
    await p2p.start();

    // Connect to peers
    if (options.peers) {
      const peers = options.peers.split(',').filter(Boolean);
      for (const peer of peers) {
        await p2p.connectToPeer(peer.trim());
      }
    }

    // Start RPC server
    const rpc = new RPCServer(blockchain, p2p, parseInt(options.port));
    await rpc.start();

    // If validator key provided, start block proposing
    if (options.validatorKey) {
      const validatorAddress = crypto.privateKeyToAddress(options.validatorKey);
      if (blockchain.consensus.isValidator(validatorAddress)) {
        console.log(`[Verdex] Validator active: ${validatorAddress}`);
        startProposing(blockchain, options.validatorKey);
      } else {
        console.log(`[Verdex] Address ${validatorAddress} is not a registered validator`);
        console.log(`[Verdex] Registered validators: ${[...blockchain.consensus.validators.keys()].join(', ')}`);
      }
    } else {
      console.log(`[Verdex] Running in observer mode (not proposing blocks)`);
    }

    console.log(`[Verdex] Node ready!`);
    console.log(`[Verdex] RPC: http://127.0.0.1:${options.port}`);
    console.log(`[Verdex] P2P: ws://127.0.0.1:${options.p2pPort}`);

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\n[Verdex] Shutting down...');
      blockchain.consensus.stopProposing = true;
      rpc.stop();
      p2p.stop();
      await blockchain.close();
      process.exit(0);
    });
  });

program
  .command('init')
  .description('Initialize a fresh chain')
  .option('--data-dir <dir>', 'Data directory', config.DATA_DIR)
  .action(async (options) => {
    const blockchain = new Blockchain(path.resolve(options.dataDir));
    await blockchain.init(true);
    await blockchain.close();
    console.log('[Verdex] Chain initialized successfully!');
  });

function startProposing(blockchain, privateKey) {
  blockchain.consensus.stopProposing = false;

  const propose = async () => {
    if (blockchain.consensus.stopProposing) return;

    try {
      const block = await blockchain.consensus.proposeBlock(privateKey);
      if (block) {
        console.log(`[Verdex] Validator proposed block #${block.header.height}: ${block.getHash()}`);
      }
    } catch (err) {
      // Silent — not this validator's turn
    }

    if (!blockchain.consensus.stopProposing) {
      setTimeout(propose, config.BLOCK_TIME);
    }
  };

  setTimeout(propose, 1000);
}

program.parse(process.argv);

// If no command, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
