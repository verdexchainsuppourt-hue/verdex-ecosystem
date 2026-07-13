const crypto = require('crypto');
const elliptic = require('elliptic');
const EC = new elliptic.ec('secp256k1');
const { keccak256: realKeccak256 } = require('js-sha3');

const HASH_ALGO = 'sha256';
const SIGNING_ALGO = 'secp256k1';

function sha256(data) {
  return crypto.createHash(HASH_ALGO).update(data).digest('hex');
}

function doubleSha256(data) {
  return sha256(sha256(data));
}

function keccak256(data) {
  return crypto.createHash('sha3-256').update(data).digest('hex');
}

function generateKeyPair() {
  const key = EC.genKeyPair();
  return {
    privateKey: key.getPrivate('hex'),
    publicKey: key.getPublic('hex')
  };
}

function privateKeyToPublic(privateKey) {
  const key = EC.keyFromPrivate(privateKey, 'hex');
  return key.getPublic('hex');
}

function publicKeyToAddress(publicKey) {
  const hash = keccak256(Buffer.from(publicKey, 'hex'));
  return '0x' + hash.slice(-40);
}

function privateKeyToAddress(privateKey) {
  const pub = privateKeyToPublic(privateKey);
  return publicKeyToAddress(pub);
}

function sign(data, privateKey) {
  const key = EC.keyFromPrivate(privateKey, 'hex');
  const hash = Buffer.from(sha256(data), 'hex');
  const sig = key.sign(hash);
  return {
    r: sig.r.toString('hex'),
    s: sig.s.toString('hex'),
    v: sig.recoveryParam
  };
}

function verify(data, signature, publicKey) {
  try {
    const key = EC.keyFromPublic(publicKey, 'hex');
    const hash = Buffer.from(sha256(data), 'hex');
    const sig = {
      r: signature.r,
      s: signature.s,
      recoveryParam: signature.v
    };
    return key.verify(hash, sig);
  } catch {
    return false;
  }
}

function recoverPublicKey(hash, signature) {
  try {
    const sig = {
      r: signature.r,
      s: signature.s,
      recoveryParam: signature.v
    };
    const hashBuffer = Buffer.from(sha256(hash), 'hex');
    const pubPoint = EC.recoverPubKey(hashBuffer, sig, signature.v);
    return pubPoint.encode('hex');
  } catch {
    return null;
  }
}

function publicKeyToAddressKeccak(publicKey) {
  try {
    const key = EC.keyFromPublic(publicKey, 'hex');
    const pubBytes = key.getPublic().encode(null, false).slice(1);
    const hash = realKeccak256(Buffer.from(pubBytes));
    return '0x' + hash.slice(-40);
  } catch {
    return null;
  }
}

function recoverPublicKeyEthereum(hash, signature) {
  try {
    const txHashBytes = Buffer.from(hash.replace('0x', ''), 'hex');
    const prefix = Buffer.from("\x19Ethereum Signed Message:\n32");
    const message = Buffer.concat([prefix, txHashBytes]);
    const messageHash = Buffer.from(realKeccak256(message), 'hex');
    
    let v = signature.v;
    if (v === 27 || v === 28) v -= 27;
    
    const sig = {
      r: signature.r.replace('0x', ''),
      s: signature.s.replace('0x', ''),
      recoveryParam: v
    };
    
    const pubPoint = EC.recoverPubKey(messageHash, sig, v);
    return pubPoint.encode('hex');
  } catch {
    return null;
  }
}

function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

module.exports = {
  sha256,
  doubleSha256,
  keccak256,
  generateKeyPair,
  privateKeyToPublic,
  publicKeyToAddress,
  privateKeyToAddress,
  sign,
  verify,
  recoverPublicKey,
  isValidAddress,
  SIGNING_ALGO,
  publicKeyToAddressKeccak,
  recoverPublicKeyEthereum
};
