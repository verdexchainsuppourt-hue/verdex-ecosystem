/**
 * Verdex Android update edge endpoint.
 *
 * This worker is intentionally limited to public release metadata. It never
 * handles wallets, private keys, KYC records, mining, P2P, or token balances.
 */

const APK_VERSION = "1.9.5";
const APK_VERSION_CODE = 42;
const MIN_SUPPORTED_VERSION = "1.8.9";
const APK_DOWNLOAD_URL =
  "https://verdexswap.site/assets/downloads/Verdex-Android-1.9.5-build42.apk";
const APK_SHA256 =
  "53678cd4b36bfd42d520fd9b8842479508c8acd592091b5383ff28ee47c92235";

const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300, must-revalidate",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

const ANDROID_VERSION = {
  schemaVersion: 1,
  productName: "Verdex Miner",
  version: APK_VERSION,
  versionName: APK_VERSION,
  versionCode: APK_VERSION_CODE,
  minVersion: MIN_SUPPORTED_VERSION,
  minimumVersion: MIN_SUPPORTED_VERSION,
  minSupportedVersion: MIN_SUPPORTED_VERSION,
  mandatory: false,
  forceUpdate: false,
  isRequired: false,
  apkUrl: APK_DOWNLOAD_URL,
  sha256: APK_SHA256,
  downloadUrl: APK_DOWNLOAD_URL,
  releaseDate: "2026-07-18",
  notes: "Mainnet-only security update.",
  changelog: [
    "Removed testnet and faucet flows.",
    "Transfers require verified mainnet identity.",
    "Private keys stay on the device.",
  ],
  actionLink: APK_DOWNLOAD_URL,
  downloads: {
    android: {
      url: APK_DOWNLOAD_URL,
      fileName: "Verdex-Android-1.9.5-build42.apk",
    },
  },
};

const REMOTE_CONFIG = {
  configVersion: 1,
  versionJsonUrl: "https://verdexswap.site/updates/android/version.json",
};

function json(body, request) {
  if (request.method === "HEAD") {
    return new Response(null, { headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify(body), { headers: JSON_HEADERS });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...JSON_HEADERS,
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD, OPTIONS" },
      });
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/updates/android/version.json") {
      return json(ANDROID_VERSION, request);
    }

    if (pathname === "/updates/android/remote-config.json") {
      return json(REMOTE_CONFIG, request);
    }

    return new Response("Not found", { status: 404 });
  },
};
