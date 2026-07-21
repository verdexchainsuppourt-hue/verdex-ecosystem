/**
 * Verdex Mainnet Genesis Allocation Generator.
 *
 * This script extracts the compiled runtime bytecode for the approved mainnet contracts
 * (VDX Token and P2P Escrow) and formats them into a JSON payload ready to be injected
 * directly into Besu's genesis.json "alloc" block. This allows pre-deploying contracts
 * at block 0 for maximum gas efficiency and immutable address guarantees.
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  console.log("Analyzing compiled artifacts for genesis allocation...");

  // Contract Addresses (pre-determined system contracts)
  const VDX_TOKEN_ADDRESS = "0x0000000000000000000000000000000000007201";
  const P2P_ESCROW_ADDRESS = "0x0000000000000000000000000000000000007202";

  // Load contract definitions
  const VdxArtifact = await hre.artifacts.readArtifact("VerdexMainnetVDX");
  const EscrowArtifact = await hre.artifacts.readArtifact("VerdexP2PEscrow");

  if (!VdxArtifact.deployedBytecode || !EscrowArtifact.deployedBytecode) {
    throw new Error("Missing compiled bytecode. Run 'npx hardhat compile' first.");
  }

  // Generate alloc payloads
  const alloc = {
    [VDX_TOKEN_ADDRESS]: {
      balance: "0x0",
      code: VdxArtifact.deployedBytecode,
      comment: "Verdex Mainnet VDX Token (EVM Native PRC-20)"
    },
    [P2P_ESCROW_ADDRESS]: {
      balance: "0x0",
      code: EscrowArtifact.deployedBytecode,
      comment: "Verdex P2P Escrow Smart Contract Manager"
    }
  };

  const outputPath = path.join(__dirname, "../genesis-allocations.json");
  fs.writeFileSync(outputPath, JSON.stringify(alloc, null, 2));

  console.log("");
  console.log("=================================================================");
  console.log("GENESIS ALLOCATIONS GENERATED SUCCESSFULLY");
  console.log(`Saved output to: ${outputPath}`);
  console.log("=================================================================");
  console.log(`VDX Token pre-deployed Address:  ${VDX_TOKEN_ADDRESS}`);
  console.log(`P2P Escrow pre-deployed Address: ${P2P_ESCROW_ADDRESS}`);
  console.log("Include the generated allocations in your genesis.json under the 'alloc' property.");
  console.log("=================================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error generating genesis allocation:", err);
    process.exit(1);
  });
