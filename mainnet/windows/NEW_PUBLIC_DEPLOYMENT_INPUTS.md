# Create Verdex public deployment inputs

This helper accepts public data only. It never accepts a seed phrase, private
key, key file, password, or recovery material. Each validator operator runs
Besu locally to export its public node key and sends only that output to the
release operator.

The script creates the ignored, non-secret input file required by
`Build-VerdexQbftConfig.ps1`. It refuses to overwrite an existing input file,
requires four distinct validator public addresses and node keys, and requires a
separate gas treasury and deployer address.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& .\mainnet\windows\New-VerdexPublicDeploymentInputs.ps1 `
  -ValidatorPublicKeys @('VALIDATOR_1_NODE_PUBLIC_KEY','VALIDATOR_2_NODE_PUBLIC_KEY','VALIDATOR_3_NODE_PUBLIC_KEY','VALIDATOR_4_NODE_PUBLIC_KEY') `
  -ValidatorHosts @('validator-1.p2p.verdexswap.site','validator-2.p2p.verdexswap.site','validator-3.p2p.verdexswap.site','validator-4.p2p.verdexswap.site') `
  -GasTreasuryAddress 'DISTINCT_GAS_TREASURY_ADDRESS' `
  -GasTreasuryBalanceHex 'GENESIS_GAS_ALLOCATION_HEX' `
  -DeployerAddress 'DEPLOYER_GAS_ADDRESS' `
  -DeployerBalanceHex 'DEPLOYER_GAS_ALLOCATION_HEX' `
  -GenesisTimestampUnixSeconds 1893456000
```

The four currently recorded validator public addresses are prefilled. To use a
different validator set, pass `-ValidatorAddresses` explicitly with four
distinct public EVM addresses.

After its public output is reviewed, run `Build-VerdexQbftConfig.ps1`. Do not
start a validator until its operator controls its key locally and the release
review approves the generated genesis hash.
