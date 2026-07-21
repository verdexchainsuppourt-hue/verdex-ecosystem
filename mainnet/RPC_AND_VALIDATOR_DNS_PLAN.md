# Verdex proposed RPC and validator DNS plan

Status: the proposed names currently resolve through the `verdexswap.site`
Cloudflare wildcard to the generic website. They are not RPC or P2P services
and are not an authorization to expose a validator.

| Purpose | Proposed public name | Exposure rule |
| --- | --- | --- |
| Read-only JSON-RPC | `rpc.verdexswap.site` | TLS edge proxy only; proxy to a loopback-only Besu RPC node. |
| Read-only WebSocket JSON-RPC | `wss://rpc.verdexswap.site/ws` | Same TLS edge proxy; no `ADMIN`, signing, or debug APIs. |
| Validator 1 P2P | `validator-1.p2p.verdexswap.site:30303` | Direct DNS-only A/AAAA record to the independently operated host. |
| Validator 2 P2P | `validator-2.p2p.verdexswap.site:30304` | Direct DNS-only A/AAAA record to the independently operated host. |
| Validator 3 P2P | `validator-3.p2p.verdexswap.site:30305` | Direct DNS-only A/AAAA record to the independently operated host. |
| Validator 4 P2P | `validator-4.p2p.verdexswap.site:30306` | Direct DNS-only A/AAAA record to the independently operated host. |

The RPC name is **Verdex RPC**. Configure a dedicated TLS edge route only after
a separate read-only RPC node has passed the local QBFT verification script.
Keep the four P2P records DNS-only and point them to independently operated
hosts: a Cloudflare reverse proxy and its wildcard website response are not
valid Besu P2P endpoints.

## Exact remaining public inputs

The current ceremony record has four proposed validator addresses and one
proposed deployer/gas address. The generator will refuse to create a genesis
until it receives four node public keys (to form `enode://...` URLs), all four
reachable host targets, and a distinct gas treasury address. This is
intentional: a 4-node QBFT network tolerates one fault; a 3-node network does
not meet the selected production policy.

Never place validator private keys, seeds, passwords, or hardware-wallet
recovery material in DNS, this repository, an APK, the website, or chat.
