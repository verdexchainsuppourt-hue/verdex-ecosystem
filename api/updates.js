/**
 * Verdex Serverless Update Service API (/api/updates)
 * Serves live APK and Desktop update metadata with no-cache and CORS enabled.
 */
const { setCORS, jsonResponse } = require('../lib/api-lib');

const LATEST_UPDATE_MANIFEST = {
  version: "1.25.4",
  versionCode: 80,
  channel: "apk",
  updateMode: "in_app_apk",
  minVersion: "1.0.0",
  minVersionCode: 80,
  mandatory: false,
  updateType: "full",
  network: "mainnet",
  chainId: 72010,
  apkUrl: "https://verdexswap.site/assets/downloads/Verdex-Android-1.25.4-build81.apk",
  sha256: "da44000c12f93ab77a835758aaf8da14d6c49a0a9441b775ec912858394bccca",
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
