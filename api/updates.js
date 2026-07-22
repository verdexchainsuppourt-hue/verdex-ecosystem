/**
 * Verdex Serverless Update Service API (/api/updates)
 * Serves live APK and Desktop update metadata with no-cache and CORS enabled.
 */
const { setCORS, jsonResponse } = require('../lib/api-lib');

const LATEST_UPDATE_MANIFEST = {
  version: "1.25.4",
  versionCode: 81,
  channel: "apk",
  updateMode: "in_app_apk",
  minVersion: "1.0.0",
  minVersionCode: 1,
  mandatory: true,
  updateType: "full",
  network: "mainnet",
  chainId: 72010,
  apkUrl: "https://verdexswap.site/assets/downloads/Verdex-Android-1.25.4-build81.apk",
  sha256: "7403cde949a7382ff50e3e6f5f27b5a4c27d3b0bf0cb16cb8c8bfe01d20d6754",
  changelog: [
    "FIXED: Master Admin Panel Integration & System Health Status",
    "FIXED: KYC Admin Routing & Moderation Queue Synchronization",
    "FIXED: P2P Status Persistence & Timer Screen Glitch",
    "FIXED: Custodial Vault Session & Balance Isolation",
    "NEW: Official Production Release Version 1.25.4 Build 81"
  ],
  releasedAt: "2026-07-22T07:44:00.000Z"
};

module.exports = async (req, res) => {
  setCORS(res);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  return jsonResponse(res, 200, LATEST_UPDATE_MANIFEST);
};
