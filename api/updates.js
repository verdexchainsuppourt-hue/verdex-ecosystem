// Dynamic Version Manifest API — bypassing static edge CDN caching.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const manifest = {
    version: "1.21.0",
    versionCode: 71,
    channel: "apk",
    updateMode: "in_app_apk",
    minVersion: "1.0.0",
    minVersionCode: 1,
    mandatory: false,
    updateType: "full",
    network: "mainnet",
    chainId: 72010,
    apkUrl: "https://verdexswap.site/assets/downloads/Verdex-Android-1.21.0-build71.apk",
    sha256: "8e10c69a82da8d7bb9b6bc95c3f9d6394e712a1d021e320b153381b82211e898",
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
