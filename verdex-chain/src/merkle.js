/**
 * Verdex Chain - Merkle Tree
 * Full binary Merkle tree with proof generation and verification.
 * Used for computing block transactionsRoot and supporting SPV proofs.
 */

const { sha256, doubleSha256 } = require('./crypto');

/**
 * Hash a pair of nodes. Sorts lexicographically so the tree is deterministic.
 */
function hashPair(a, b) {
  // Ensure consistent ordering
  const [left, right] = a <= b ? [a, b] : [b, a];
  return doubleSha256(left + right);
}

/**
 * Build a Merkle tree from an array of hex string leaves.
 * Returns the full tree as an array of levels (bottom-up).
 */
function buildTree(leaves) {
  if (leaves.length === 0) {
    return [['0'.repeat(64)]];
  }

  // Normalise: strip 0x prefix
  let level = leaves.map(l => l.replace(/^0x/, ''));

  const tree = [level];

  while (level.length > 1) {
    // Duplicate last element if odd
    if (level.length % 2 !== 0) {
      level = [...level, level[level.length - 1]];
    }

    const nextLevel = [];
    for (let i = 0; i < level.length; i += 2) {
      nextLevel.push(hashPair(level[i], level[i + 1]));
    }
    level = nextLevel;
    tree.push(level);
  }

  return tree; // tree[last][0] is root
}

/**
 * Compute the Merkle root from an array of leaves.
 * @param {string[]} leaves - hex strings (with or without 0x)
 * @returns {string} - '0x' prefixed root hash
 */
function computeMerkleRoot(leaves) {
  if (leaves.length === 0) {
    return '0x' + '0'.repeat(64);
  }
  const tree = buildTree(leaves);
  return '0x' + tree[tree.length - 1][0];
}

/**
 * Generate a Merkle proof for the leaf at the given index.
 * @param {string[]} leaves
 * @param {number} index
 * @returns {{ proof: {hash: string, direction: 'left'|'right'}[], root: string }}
 */
function getMerkleProof(leaves, index) {
  if (leaves.length === 0 || index < 0 || index >= leaves.length) {
    throw new Error('Invalid index for Merkle proof');
  }

  const tree = buildTree(leaves);
  const proof = [];
  let currentIndex = index;

  for (let level = 0; level < tree.length - 1; level++) {
    const levelNodes = [...tree[level]];
    // Pad to even
    if (levelNodes.length % 2 !== 0) {
      levelNodes.push(levelNodes[levelNodes.length - 1]);
    }

    const isRight = currentIndex % 2 === 1;
    const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

    if (siblingIndex < levelNodes.length) {
      proof.push({
        hash: levelNodes[siblingIndex],
        direction: isRight ? 'left' : 'right'
      });
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  return {
    proof,
    root: '0x' + tree[tree.length - 1][0],
    leafIndex: index
  };
}

/**
 * Verify a Merkle proof.
 * @param {string} leaf - hex string of the leaf to verify
 * @param {{ hash: string, direction: 'left'|'right' }[]} proof
 * @param {string} root - expected Merkle root (with or without 0x)
 * @returns {boolean}
 */
function verifyMerkleProof(leaf, proof, root) {
  let current = leaf.replace(/^0x/, '');
  const expectedRoot = root.replace(/^0x/, '');

  for (const step of proof) {
    const sibling = step.hash;
    if (step.direction === 'left') {
      current = hashPair(sibling, current);
    } else {
      current = hashPair(current, sibling);
    }
  }

  return current === expectedRoot;
}

/**
 * Compute Merkle root from an array of Transaction objects.
 * @param {Transaction[]} transactions
 * @returns {string}
 */
function computeTxMerkleRoot(transactions) {
  if (transactions.length === 0) {
    return '0x' + '0'.repeat(64);
  }
  const leaves = transactions.map(tx => tx.getHash ? tx.getHash().replace('0x', '') : sha256(JSON.stringify(tx)));
  return computeMerkleRoot(leaves);
}

module.exports = {
  buildTree,
  computeMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
  computeTxMerkleRoot,
  hashPair
};
