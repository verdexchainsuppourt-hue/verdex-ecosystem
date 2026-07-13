const WebSocket = require('ws');
const config = require('./config');

const MESSAGE_TYPES = {
  NEW_BLOCK: 'new_block',
  NEW_TRANSACTION: 'new_tx',
  CHAIN_REQUEST: 'chain_request',
  CHAIN_RESPONSE: 'chain_response',
  PEER_LIST: 'peer_list',
  VALIDATOR_ANNOUNCE: 'validator_announce',
  PING: 'ping',
  PONG: 'pong'
};

class P2PNetwork {
  constructor(blockchain, port) {
    this.blockchain = blockchain;
    this.port = port || config.P2P_PORT;
    this.peers = new Map(); // ws -> { id, address, height, lastSeen }
    this.server = null;
    this.isRunning = false;
  }

  async start() {
    this.server = new WebSocket.Server({ port: this.port });
    this.server.on('connection', (ws, req) => this._handleConnection(ws, req));
    this.isRunning = true;
    console.log(`[P2P] Listening on port ${this.port}`);
  }

  async connectToPeer(address) {
    try {
      const ws = new WebSocket(address);
      ws.on('open', () => this._handleConnection(ws, null));
      ws.on('error', (err) => console.error(`[P2P] Connection error: ${err.message}`));
      return true;
    } catch (err) {
      console.error(`[P2P] Failed to connect: ${err.message}`);
      return false;
    }
  }

  _handleConnection(ws, req) {
    const peerId = `${req ? req.socket.remoteAddress : 'local'}:${ws._socket ? ws._socket.remotePort : '?'}`;
    const peer = { ws, id: peerId, address: '', height: 0, lastSeen: Date.now() };
    this.peers.set(ws, peer);

    ws.on('message', (data) => this._handleMessage(ws, data));
    ws.on('close', () => {
      this.peers.delete(ws);
      console.log(`[P2P] Peer disconnected: ${peerId}`);
    });
    ws.on('error', () => this.peers.delete(ws));

    // Send handshake
    this._send(ws, {
      type: MESSAGE_TYPES.PEER_LIST,
      data: {
        id: peerId,
        height: 0,
        validators: [...this.blockchain.consensus.validators.keys()]
      }
    });

    console.log(`[P2P] Peer connected: ${peerId}`);
  }

  async _handleMessage(ws, data) {
    try {
      const msg = JSON.parse(data);
      const peer = this.peers.get(ws);
      if (!peer) return;

      peer.lastSeen = Date.now();

      switch (msg.type) {
        case MESSAGE_TYPES.NEW_BLOCK:
          await this._handleNewBlock(msg.data);
          break;
        case MESSAGE_TYPES.NEW_TRANSACTION:
          await this._handleNewTransaction(msg.data);
          break;
        case MESSAGE_TYPES.CHAIN_REQUEST:
          await this._handleChainRequest(ws, msg.data);
          break;
        case MESSAGE_TYPES.CHAIN_RESPONSE:
          await this._handleChainResponse(msg.data);
          break;
        case MESSAGE_TYPES.PEER_LIST:
          peer.address = msg.data.id;
          peer.height = msg.data.height || 0;
          break;
        case MESSAGE_TYPES.PING:
          this._send(ws, { type: MESSAGE_TYPES.PONG, data: { timestamp: Date.now() } });
          break;
      }
    } catch (err) {
      console.error(`[P2P] Message error: ${err.message}`);
    }
  }

  async broadcastBlock(block) {
    const msg = {
      type: MESSAGE_TYPES.NEW_BLOCK,
      data: block.toJSON()
    };
    this._broadcast(msg);
  }

  async broadcastTransaction(tx) {
    const msg = {
      type: MESSAGE_TYPES.NEW_TRANSACTION,
      data: tx.toJSON()
    };
    this._broadcast(msg);
  }

  async _handleNewBlock(blockData) {
    try {
      const block = require('./block').Block.fromJSON(blockData);
      const latest = await this.blockchain.getLatestBlock();
      if (latest && block.header.height <= latest.header.height) return;
      await this.blockchain.addBlock(block);
    } catch (err) {
      console.error(`[P2P] Block sync error: ${err.message}`);
    }
  }

  async _handleNewTransaction(txData) {
    try {
      const { Transaction } = require('./transaction');
      const tx = Transaction.fromJSON(txData);
      this.blockchain.txPool.add(tx);
    } catch (err) {
      console.error(`[P2P] Tx sync error: ${err.message}`);
    }
  }

  async _handleChainRequest(ws, data) {
    const fromHeight = data.fromHeight || 0;
    const toHeight = data.toHeight || (await this.blockchain.getLatestBlock())?.header.height || 0;
    const blocks = [];
    for (let h = fromHeight; h <= toHeight; h++) {
      const block = await this.blockchain.getBlock(h);
      if (block) blocks.push(block.toJSON());
    }
    this._send(ws, {
      type: MESSAGE_TYPES.CHAIN_RESPONSE,
      data: { blocks, fromHeight, toHeight }
    });
  }

  async _handleChainResponse(data) {
    const { Block } = require('./block');
    for (const blockData of data.blocks || []) {
      const block = Block.fromJSON(blockData);
      const latest = await this.blockchain.getLatestBlock();
      if (!latest || block.header.height > latest.header.height) {
        await this.blockchain.addBlock(block);
      }
    }
  }

  _send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  _broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const [ws, peer] of this.peers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  getPeerCount() {
    return this.peers.size;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.isRunning = false;
    }
    for (const [ws] of this.peers) {
      ws.close();
    }
    this.peers.clear();
  }
}

module.exports = P2PNetwork;
