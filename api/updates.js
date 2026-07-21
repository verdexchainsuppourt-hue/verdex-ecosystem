// Dynamic Version Manifest API — bypassing static edge CDN caching.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const manifest = {
    version: "1.21.1",
    versionCode: 72,
    channel: "apk",
    updateMode: "in_app_apk",
    minVersion: "1.0.0",
    minVersionCode: 1,
    mandatory: false,
    updateType: "full",
    network: "mainnet",
    chainId: 72010,
    apkUrl: "https://verdexswap.site/assets/downloads/Verdex-Android-1.21.1-build72.apk",
    sha256: "7d679d55ef4acaf218e2a0544dbfaf1e561b6f6bf892cf1d2617e3ec7b1ddb37",
    changelog: [
      "FIXED: KYC country selection sheet now includes full 200+ offline country list with flag emojis",
      "FIXED: P2P trade creation 'table reference not found' error resolved via verdex_custodial_wallets link",
      "NEW: P2P Listing Edit & Delete functionality directly on user ad cards and via modal sheets",
      "NEW: Real Mining VP -> VDX token conversion endpoint & dedicated conversion tab",
      "FIXED: Vault deposit address copy button with safe fallback & haptic feedback",
      "NEW: Enhanced Web Admin Panel with P2P order/trade controls & risk monitoring"
    ],
    releasedAt: new Date().toISOString()
  };

  return res.status(200).json(manifest);
};
