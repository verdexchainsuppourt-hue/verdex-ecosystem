# Mainnet contract deployment configuration

`MAINNET_DEPLOYMENT.env.template` is the complete configuration handoff for
the existing `contracts/scripts/deploy-mainnet.js` release script. It is a
template only. A filled copy belongs in an isolated deployment runner's secret
manager, never in Git, the website, Vercel, the Android APK, the desktop app,
or a chat session.

The deployment script already refuses to run unless all of these are true:

1. A human sets the exact irreversible deployment acknowledgement.
2. The connected chain has the reviewed unique chain ID and signed block-zero
   hash; testnet ID 7201 is rejected.
3. The genesis vault is a deployed contract and the governance Safe is already
   deployed, has three or more declared owners, and has the exact declared
   threshold.
4. At least three P2P arbiters and two trade attestors exist; the deployer may
   not be the Safe or genesis vault.

The script deploys only the fixed-supply VDX PRC20 contract and P2P escrow, then
prints their exact runtime-code SHA-256 hashes. Those hashes go into the release
evidence dossier and public configuration only after independent verification.

`VERDEX_MAINNET_ENABLED`, `VERDEX_MAINNET_RELEASE_APPROVED`, and
`VERDEX_MAINNET_PUBLIC_BROADCAST_ENABLED` must remain `false` until every
evidence gate passes. Setting them early does not create a valid mainnet and
must be treated as a release-control incident.
