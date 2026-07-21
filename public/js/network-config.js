/**
 * Verdex mainnet network configuration.
 * The client starts disabled and learns approved values from /api/network.
 * It contains no testnet ID, RPC URL, contract address, faucet, or fallback.
 */
(function (global) {
  const SITE_ORIGIN = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://verdexswap.site';

  const VERDEX_NETWORK = {
    configured: false,
    brand: 'Verdex',
    chainName: 'Verdex Mainnet',
    chainId: null,
    chainIdHex: null,
    networkKey: 'verdex-mainnet',
    symbol: 'VDX',
    decimals: 18,
    consensus: 'poa',
    rpcHttp: null,
    rpcRest: SITE_ORIGIN + '/api/chain',
    explorerUrl: null,
    docsUrl: SITE_ORIGIN + '/whitepaper',
    dashboardUrl: SITE_ORIGIN + '/dashboard',
    websiteUrl: SITE_ORIGIN,
    contracts: null,
    evmStatus: 'not_configured',
    evmNote: 'Mainnet is not configured for public use.',
    productStatus: { websiteMining: 'disabled', testnet: 'removed', mainnet: 'not_configured', p2p: 'disabled' },
    metamask: {
      chainId: null,
      chainName: 'Verdex Mainnet',
      nativeCurrency: { name: 'Verdex', symbol: 'VDX', decimals: 18 },
      rpcUrls: [],
      blockExplorerUrls: []
    }
  };

  async function refreshVerdexMainnetConfig() {
    const response = await fetch(SITE_ORIGIN + '/api/network', { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || !payload.network?.chainId) {
      VERDEX_NETWORK.configured = false;
      return VERDEX_NETWORK;
    }
    const network = payload.network;
    // The only browser-facing endpoint is the bounded same-origin bridge. A
    // deployment must never expose its upstream validator/RPC URL here.
    const publicRpc = network.rpcUrl || SITE_ORIGIN + '/api/rpc';
    Object.assign(VERDEX_NETWORK, {
      configured: true,
      chainName: network.chainName,
      chainId: network.chainId,
      chainIdHex: network.chainIdHex,
      networkKey: network.networkKey,
      symbol: network.symbol,
      decimals: network.decimals,
      consensus: network.consensus,
      rpcHttp: publicRpc,
      explorerUrl: network.explorerUrl,
      contracts: network.contracts,
      evmStatus: 'mainnet',
      evmNote: 'Configured Verdex mainnet RPC.'
    });
    VERDEX_NETWORK.metamask = {
      chainId: network.chainIdHex,
      chainName: network.chainName,
      nativeCurrency: { name: 'Verdex', symbol: network.symbol, decimals: network.decimals },
      rpcUrls: [publicRpc],
      blockExplorerUrls: [network.explorerUrl]
    };
    return VERDEX_NETWORK;
  }

  async function addVerdexToWallet() {
    if (typeof window === 'undefined' || !window.ethereum) throw new Error('No EIP-1193 wallet found. Install MetaMask.');
    await refreshVerdexMainnetConfig();
    if (!VERDEX_NETWORK.configured) throw new Error('Verdex mainnet is not configured yet. No network was added to your wallet.');
    const params = VERDEX_NETWORK.metamask;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: params.chainId }] });
      return { switched: true };
    } catch (switchError) {
      if (switchError.code === 4902 || (switchError.message && switchError.message.includes('Unrecognized'))) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [params] });
        return { added: true };
      }
      throw switchError;
    }
  }

  function isValidEvmAddress(addr) {
    return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  global.VERDEX_NETWORK = VERDEX_NETWORK;
  global.refreshVerdexMainnetConfig = refreshVerdexMainnetConfig;
  global.addVerdexToWallet = addVerdexToWallet;
  global.isValidEvmAddress = isValidEvmAddress;
  if (typeof window !== 'undefined') refreshVerdexMainnetConfig().catch(() => {});
})(typeof window !== 'undefined' ? window : globalThis);
